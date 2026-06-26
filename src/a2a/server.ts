import crypto from "node:crypto";
import express from "express";
import {
  checkStoryboard,
  draftStoryboard,
  getProductionPaths,
  loadStoryboard,
  premiereStoryboard,
  renderPremiere,
  scoutApp,
  shootStoryboard,
  writeStoryboard,
} from "../index.js";
import type { CheckResult, DraftStoryboardInput, ShootOptions, ShootResult, ScoutReport } from "../providers.js";
import type { ProductionPaths, Storyboard } from "../storyboard.js";
import type { RenderResult } from "../director.js";
import { isMainModule } from "../runtime.js";

type TaskState =
  | "TASK_STATE_SUBMITTED"
  | "TASK_STATE_WORKING"
  | "TASK_STATE_COMPLETED"
  | "TASK_STATE_FAILED"
  | "TASK_STATE_INPUT_REQUIRED"
  | "TASK_STATE_REJECTED"
  | "TASK_STATE_CANCELED";

type A2APart =
  | { readonly text: string; readonly mediaType?: string }
  | { readonly data: unknown; readonly mediaType?: string }
  | { readonly url: string; readonly filename?: string; readonly mediaType?: string };

type A2AArtifact = {
  readonly artifactId: string;
  readonly name: string;
  readonly description?: string;
  readonly parts: readonly A2APart[];
};

type A2ATask = {
  readonly id: string;
  readonly contextId: string;
  readonly status: {
    readonly state: TaskState;
    readonly message?: {
      readonly role: "ROLE_AGENT";
      readonly parts: readonly A2APart[];
    };
    readonly timestamp: string;
  };
  readonly artifacts: readonly A2AArtifact[];
  readonly metadata: Record<string, unknown>;
};

type DirectorSkill =
  | "scout_app"
  | "draft_storyboard"
  | "validate_storyboard"
  | "shoot_presentation"
  | "premiere_presentation";

type DirectorTaskInput = {
  readonly skill: DirectorSkill;
  readonly payload: Record<string, unknown>;
};

type DirectorA2ADependencies = {
  readonly scoutApp: (input: { readonly url: string; readonly outputDir?: string }) => Promise<ScoutReport>;
  readonly draftStoryboard: (input: DraftStoryboardInput) => Promise<Storyboard>;
  readonly loadStoryboard: (storyboardPath: string) => Promise<Storyboard>;
  readonly checkStoryboard: (storyboard: Storyboard, paths: ProductionPaths) => Promise<CheckResult>;
  readonly shootStoryboard: (storyboard: Storyboard, options: ShootOptions, paths: ProductionPaths) => Promise<ShootResult>;
  readonly renderPremiere: (storyboard: Storyboard, paths: ProductionPaths) => Promise<RenderResult>;
  readonly premiereStoryboard: (storyboard: Storyboard, options: ShootOptions, paths: ProductionPaths) => Promise<RenderResult>;
  readonly writeStoryboard: (storyboardPath: string, storyboard: Storyboard) => Promise<void>;
  readonly getProductionPaths: (storyboard: Storyboard) => ProductionPaths;
};

const defaultDirectorA2ADependencies: DirectorA2ADependencies = {
  scoutApp,
  draftStoryboard,
  loadStoryboard,
  checkStoryboard,
  shootStoryboard,
  renderPremiere,
  premiereStoryboard,
  writeStoryboard,
  getProductionPaths,
};

type TaskStore = Map<string, A2ATask>;

const MAX_TASKS = 1000;

export type A2AAdapterOptions = {
  readonly port?: number;
  readonly baseUrl?: string;
  readonly dependencies?: Partial<DirectorA2ADependencies>;
};

export function createDirectorA2AServer(options: A2AAdapterOptions = {}): express.Express {
  const app = express();
  const port = options.port ?? Number(process.env.DIRECTOR_A2A_PORT ?? 4129);
  const baseUrl = options.baseUrl ?? process.env.DIRECTOR_A2A_BASE_URL ?? `http://localhost:${port}`;
  const dependencies: DirectorA2ADependencies = { ...defaultDirectorA2ADependencies, ...options.dependencies };
  const tasks: TaskStore = new Map();

  app.use(express.json({ limit: "2mb" }));

  app.get("/.well-known/agent-card.json", (_request, response) => {
    response.json(buildAgentCard(baseUrl));
  });

  app.post("/a2a", async (request, response) => {
    const body = request.body as { readonly id?: unknown; readonly method?: unknown; readonly params?: unknown };
    try {
      const result = await handleJsonRpc(String(body.method ?? ""), body.params, dependencies, tasks);
      response.json({ jsonrpc: "2.0", id: body.id ?? null, result });
    } catch (error) {
      response.status(400).json({
        jsonrpc: "2.0",
        id: body.id ?? null,
        error: {
          code: -32000,
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  });

  return app;
}

export async function runDirectorA2AServer(options: A2AAdapterOptions = {}): Promise<void> {
  const port = options.port ?? Number(process.env.DIRECTOR_A2A_PORT ?? 4129);
  const app = createDirectorA2AServer(options);
  await new Promise<void>((resolve) => {
    app.listen(port, () => {
      console.log(`Director A2A server listening on http://localhost:${port}`);
      resolve();
    });
  });
}

async function handleJsonRpc(
  method: string,
  params: unknown,
  dependencies: DirectorA2ADependencies,
  tasks: TaskStore,
): Promise<unknown> {
  switch (method) {
    case "SendMessage":
      return { task: await createAndRunTask(extractTaskInput(params), dependencies, tasks) };
    case "GetTask": {
      const taskId = extractTaskId(params);
      const task = tasks.get(taskId);
      if (!task) throw new Error(`Task not found: ${taskId}`);
      return task;
    }
    case "ListTasks":
      return { tasks: Array.from(tasks.values()) };
    case "CancelTask": {
      const taskId = extractTaskId(params);
      const task = tasks.get(taskId);
      if (!task) throw new Error(`Task not found: ${taskId}`);
      const canceled = updateTask(task, "TASK_STATE_CANCELED", "Production canceled.", []);
      tasks.set(taskId, canceled);
      return canceled;
    }
    default:
      throw new Error(`Unsupported A2A method: ${method}`);
  }
}

function evictOldest(tasks: TaskStore, max: number): void {
  while (tasks.size > max) {
    const oldest = tasks.keys().next().value;
    if (oldest === undefined) break;
    tasks.delete(oldest);
  }
}

async function createAndRunTask(input: DirectorTaskInput, dependencies: DirectorA2ADependencies, tasks: TaskStore): Promise<A2ATask> {
  const id = crypto.randomUUID();
  const contextId = crypto.randomUUID();
  const submitted = makeTask(
    id,
    contextId,
    "TASK_STATE_SUBMITTED",
    `Director accepted ${input.skill}.`,
    [],
    { skill: input.skill },
  );
  tasks.set(id, submitted);
  evictOldest(tasks, MAX_TASKS);

  const working = updateTask(submitted, "TASK_STATE_WORKING", `Director is working on ${input.skill}.`, []);
  tasks.set(id, working);

  try {
    const completed = await runDirectorSkill(working, input, dependencies);
    tasks.set(id, completed);
    return completed;
  } catch (error) {
    const failed = updateTask(working, "TASK_STATE_FAILED", error instanceof Error ? error.message : String(error), []);
    tasks.set(id, failed);
    return failed;
  }
}

function parseBoolean(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    return value.toLowerCase() === "true" || value === "1" || value === "yes";
  }
  return Boolean(value);
}

async function runDirectorSkill(
  task: A2ATask,
  input: DirectorTaskInput,
  dependencies: DirectorA2ADependencies,
): Promise<A2ATask> {
  const approved = parseBoolean(input.payload.approved);
  const dryRun = parseBoolean(input.payload.dryRun);
  const shootFirst = parseBoolean(input.payload.shootFirst);

  switch (input.skill) {
    case "scout_app": {
      const url = requiredString(input.payload, "url");
      const outputDir = optionalString(input.payload, "outputDir");
      const report = await dependencies.scoutApp({ url, ...(outputDir ? { outputDir } : {}) });
      return updateTask(task, "TASK_STATE_COMPLETED", "Scouting complete.", [
        artifact("scouting-report", "Scouting Report", { data: report, mediaType: "application/json" }),
      ]);
    }
    case "draft_storyboard": {
      const storyboard = await dependencies.draftStoryboard({
        title: requiredString(input.payload, "title"),
        appUrl: requiredString(input.payload, "appUrl"),
        brief: optionalString(input.payload, "brief") ?? undefined,
        outputDir: optionalString(input.payload, "outputDir") ?? undefined,
      });
      const outputPath = optionalString(input.payload, "outputPath");
      if (outputPath) await dependencies.writeStoryboard(outputPath, storyboard);
      return updateTask(
        task,
        "TASK_STATE_INPUT_REQUIRED",
        "Storyboard drafted; producer approval is required before shooting.",
        [
          artifact("storyboard", "Storyboard", {
            data: { storyboard, outputPath: outputPath ?? null },
            mediaType: "application/json",
          }),
          ...(outputPath ? [artifact("storyboard-path", "Storyboard Path", { url: outputPath, mediaType: "text/plain" })] : []),
        ],
      );
    }
    case "validate_storyboard": {
      const storyboard = await dependencies.loadStoryboard(requiredString(input.payload, "storyboardPath"));
      const paths = dependencies.getProductionPaths(storyboard);
      const result = await dependencies.checkStoryboard(storyboard, paths);
      return updateTask(task, "TASK_STATE_COMPLETED", "Storyboard validated.", [
        artifact("validation", "Validation Result", { data: result, mediaType: "application/json" }),
        artifact("check-paths", "Production Paths", { data: paths, mediaType: "application/json" }),
      ]);
    }
    case "shoot_presentation": {
      if (!approved) {
        return updateTask(task, "TASK_STATE_INPUT_REQUIRED", "Producer approval is required before shooting.", []);
      }
      const storyboard = await dependencies.loadStoryboard(requiredString(input.payload, "storyboardPath"));
      const paths = dependencies.getProductionPaths(storyboard);
      const shoot = await dependencies.shootStoryboard(storyboard, { dryRun, requireApproval: false }, paths);
      return updateTask(task, "TASK_STATE_COMPLETED", "Shoot complete.", [
        artifact("dailies", "Dailies", {
          data: { shoot, paths },
          mediaType: "application/json",
        }),
        artifact("shoot-manifest", "Shoot Manifest", {
          url: paths.shootManifestPath,
          mediaType: "application/json",
        }),
        artifact("voiceover-manifest", "Voiceover Manifest", {
          url: paths.voiceoverManifestPath,
          mediaType: "application/json",
        }),
      ]);
    }
    case "premiere_presentation": {
      if (!approved) {
        return updateTask(task, "TASK_STATE_INPUT_REQUIRED", "Producer approval is required before the premiere run.", []);
      }
      const storyboard = await dependencies.loadStoryboard(requiredString(input.payload, "storyboardPath"));
      const paths = dependencies.getProductionPaths(storyboard);
      const result = shootFirst
        ? await dependencies.premiereStoryboard(storyboard, { dryRun, requireApproval: false }, paths)
        : await dependencies.renderPremiere(storyboard, paths);
      return updateTask(task, "TASK_STATE_COMPLETED", "Premiere complete.", [
        artifact("premiere", "Premiere Result", { data: { result, paths }, mediaType: "application/json" }),
        artifact("final-cut", "Final Cut", { url: result.finalCutPath, mediaType: "video/mp4" }),
        ...(result.pitchDeckPath
          ? [artifact("pitch-deck", "Pitch Deck", {
            url: result.pitchDeckPath,
            mediaType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          })]
          : []),
        artifact("production-manifest", "Production Manifest", {
          url: paths.productionManifestPath,
          mediaType: "application/json",
        }),
      ]);
    }
    default: {
      const exhaustive: never = input.skill;
      throw new Error(`Unsupported Director skill: ${exhaustive}`);
    }
  }
}

function buildAgentCard(baseUrl: string): Record<string, unknown> {
  return {
    name: "Director",
    description: "Creates live-application presentation storyboards, dailies, final cuts, and pitch decks.",
    url: `${baseUrl}/a2a`,
    version: "0.1.0",
    capabilities: {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: true,
    },
    defaultInputModes: ["application/json", "text/plain"],
    defaultOutputModes: ["application/json", "video/mp4", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
    skills: [
      skill("scout_app", "Scout App", "Inspect a live application and return a scouting report."),
      skill("draft_storyboard", "Draft Storyboard", "Draft an approval-gated Director storyboard."),
      skill("validate_storyboard", "Validate Storyboard", "Validate a storyboard and local dependencies."),
      skill("shoot_presentation", "Shoot Presentation", "Shoot approved storyboard dailies."),
      skill("premiere_presentation", "Premiere Presentation", "Render final-cut MP4 and pitch-deck PPTX."),
    ],
  };
}

function skill(id: DirectorSkill, name: string, description: string): Record<string, unknown> {
  return {
    id,
    name,
    description,
    tags: ["director", "presentation", "live-app"],
    inputModes: ["application/json"],
    outputModes: ["application/json"],
  };
}

function extractTaskInput(params: unknown): DirectorTaskInput {
  const direct = isRecord(params) && isDirectorTaskInput(params) ? params : null;
  if (direct) return direct;
  const metadata = isRecord(params) && isRecord(params.metadata) && isDirectorTaskInput(params.metadata) ? params.metadata : null;
  if (metadata) return metadata;
  const message = isRecord(params) && isRecord(params.message) ? params.message : null;
  const dataPart = Array.isArray(message?.parts)
    ? message.parts.find((part) => isRecord(part) && isDirectorTaskInput(part.data)) as { readonly data?: unknown } | undefined
    : undefined;
  if (isDirectorTaskInput(dataPart?.data)) return dataPart.data;
  throw new Error("A2A SendMessage params must include { skill, payload } in params, metadata, or a data part");
}

function isDirectorTaskInput(value: unknown): value is DirectorTaskInput {
  return isRecord(value) && isDirectorSkill(value.skill) && isRecord(value.payload);
}

function isDirectorSkill(value: unknown): value is DirectorSkill {
  return value === "scout_app"
    || value === "draft_storyboard"
    || value === "validate_storyboard"
    || value === "shoot_presentation"
    || value === "premiere_presentation";
}

function extractTaskId(params: unknown): string {
  if (!isRecord(params) || typeof params.id !== "string") throw new Error("Task id is required");
  return params.id;
}

function makeTask(
  id: string,
  contextId: string,
  state: TaskState,
  message: string,
  artifacts: readonly A2AArtifact[],
  metadata: Record<string, unknown>,
): A2ATask {
  return {
    id,
    contextId,
    status: {
      state,
      message: {
        role: "ROLE_AGENT",
        parts: [{ text: message, mediaType: "text/plain" }],
      },
      timestamp: new Date().toISOString(),
    },
    artifacts,
    metadata,
  };
}

function updateTask(
  task: A2ATask,
  state: TaskState,
  message: string,
  artifacts: readonly A2AArtifact[],
): A2ATask {
  return makeTask(task.id, task.contextId, state, message, [...task.artifacts, ...artifacts], task.metadata);
}

function artifact(id: string, name: string, part: A2APart): A2AArtifact {
  return {
    artifactId: id,
    name,
    parts: [part],
  };
}

function requiredString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (typeof value !== "string" || value.length === 0) throw new Error(`Missing required payload field: ${key}`);
  return value;
}

function optionalString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

if (isMainModule(import.meta.url)) {
  runDirectorA2AServer().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
