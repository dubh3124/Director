import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { z } from "zod";

export const StoryboardSchemaVersion = "1";

const PlaceholderPattern = /\$\{([A-Za-z_][A-Za-z0-9_.-]*)\}/g;
const PlaceholderPresencePattern = /\$\{[A-Za-z_][A-Za-z0-9_.-]*\}/;

const BrowserSizeSchema = z.object({
  width: z.coerce.number().int().positive(),
  height: z.coerce.number().int().positive(),
});

const BrowserWindowSchema = BrowserSizeSchema.extend({
  x: z.coerce.number().int(),
  y: z.coerce.number().int(),
});

const PlaywrightCameraRigSchema = z.object({
  type: z.literal("playwright"),
  recordVideo: z.coerce.boolean().default(true),
});

const ObsCameraRigSchema = z.object({
  type: z.literal("obs"),
  urlEnv: z.string().min(1).default("OBS_WEBSOCKET_URL"),
  passwordEnv: z.string().min(1).default("OBS_WEBSOCKET_PASSWORD"),
  defaultScene: z.string().min(1),
});

const CameraRigSchema = z.discriminatedUnion("type", [
  PlaywrightCameraRigSchema,
  ObsCameraRigSchema,
]);

const VoiceoverSchema = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal("none"),
  }),
  z.object({
    provider: z.literal("elevenlabs"),
    apiKeyEnv: z.string().min(1).default("ELEVENLABS_API_KEY"),
    voiceIdEnv: z.string().min(1).default("ELEVENLABS_VOICE_ID"),
    modelId: z.string().min(1).default("eleven_multilingual_v2"),
    outputFormat: z.literal("mp3_44100_128").default("mp3_44100_128"),
  }),
]);

const DeckSchema = z.object({
  enabled: z.coerce.boolean().default(true),
  fileName: z.string().min(1).default("pitch-deck.pptx"),
});

const TimingSchema = z.object({
  defaultHoldMs: z.coerce.number().int().nonnegative().default(250),
  transitionBufferMs: z.coerce.number().int().nonnegative().default(150),
});

const AppSchema = z.object({
  name: z.string().min(1).optional(),
  baseUrl: z.string().min(1).optional(),
  healthUrl: z.string().min(1).optional(),
});

const GotoDirectionSchema = z.object({
  type: z.literal("goto"),
  url: z.string().min(1),
});

const WaitForTextDirectionSchema = z.object({
  type: z.literal("waitForText"),
  text: z.string().min(1),
  timeoutMs: z.coerce.number().int().positive().default(45_000),
});

const WaitForSelectorDirectionSchema = z.object({
  type: z.literal("waitForSelector"),
  selector: z.string().min(1),
  timeoutMs: z.coerce.number().int().positive().default(30_000),
});

const ClickDirectionSchema = z.object({
  type: z.literal("click"),
  selector: z.string().min(1),
  timeoutMs: z.coerce.number().int().positive().default(30_000),
});

const ClickLinkDirectionSchema = z.object({
  type: z.literal("clickLink"),
  text: z.string().min(1).optional(),
  hrefIncludes: z.string().min(1).optional(),
  timeoutMs: z.coerce.number().int().positive().default(30_000),
});

const FillDirectionSchema = z.object({
  type: z.literal("fill"),
  selector: z.string().min(1),
  value: z.string(),
  timeoutMs: z.coerce.number().int().positive().default(30_000),
});

const PressDirectionSchema = z.object({
  type: z.literal("press"),
  selector: z.string().min(1).optional(),
  key: z.string().min(1),
  timeoutMs: z.coerce.number().int().positive().default(30_000),
});

const WaitDirectionSchema = z.object({
  type: z.literal("wait"),
  ms: z.coerce.number().int().nonnegative(),
});

const CaptureDirectionSchema = z.object({
  type: z.literal("capture"),
  name: z.string().min(1).optional(),
  fullPage: z.coerce.boolean().default(true),
});

export const StageDirectionSchema = z.discriminatedUnion("type", [
  GotoDirectionSchema,
  WaitForTextDirectionSchema,
  WaitForSelectorDirectionSchema,
  ClickDirectionSchema,
  ClickLinkDirectionSchema,
  FillDirectionSchema,
  PressDirectionSchema,
  WaitDirectionSchema,
  CaptureDirectionSchema,
]);

const ShotSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).optional(),
  voiceover: z.string().min(1).optional(),
  holdMs: z.coerce.number().int().nonnegative().optional(),
  cameraScene: z.string().min(1).optional(),
  stageDirections: z.array(StageDirectionSchema).min(1),
});

const SceneSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).optional(),
  shots: z.array(ShotSchema).min(1),
});

const StoryboardInputSchema = z.object({
  schemaVersion: z.string().min(1).default(StoryboardSchemaVersion),
  title: z.string().min(1),
  app: AppSchema.default({}),
  outputDir: z.string().min(1).optional(),
  browser: z.object({
    viewport: BrowserSizeSchema.default({ width: 1600, height: 1000 }),
    window: BrowserWindowSchema.optional(),
  }).default({ viewport: { width: 1600, height: 1000 } }),
  camera: CameraRigSchema.default({ type: "playwright", recordVideo: true }),
  voiceover: VoiceoverSchema.default({ provider: "none" }),
  deck: DeckSchema.default({ enabled: true, fileName: "pitch-deck.pptx" }),
  timing: TimingSchema.default({ defaultHoldMs: 250, transitionBufferMs: 150 }),
  scenes: z.array(SceneSchema).min(1),
});

export const StoryboardSchema = StoryboardInputSchema.transform((storyboard) => ({
  ...storyboard,
  outputDir: storyboard.outputDir ?? path.join(".director", safeName(storyboard.title)),
}));

export type Storyboard = z.infer<typeof StoryboardSchema>;
export type StoryboardInput = z.input<typeof StoryboardSchema>;
export type Scene = Storyboard["scenes"][number];
export type Shot = Scene["shots"][number];
export type StageDirection = Shot["stageDirections"][number];
export type CameraRigConfig = Storyboard["camera"];
export type VoiceoverConfig = Storyboard["voiceover"];

export type StoryboardShot = {
  readonly scene: Scene;
  readonly shot: Shot;
  readonly index: number;
};

export type ProductionPaths = {
  readonly outputDir: string;
  readonly dailiesDir: string;
  readonly screenshotDir: string;
  readonly rawVideoDir: string;
  readonly audioDir: string;
  readonly diagnosticsDir: string;
  readonly manifestDir: string;
  readonly finalDir: string;
  readonly productionManifestPath: string;
  readonly voiceoverManifestPath: string;
  readonly shootManifestPath: string;
  readonly finalCutPath: string;
  readonly pitchDeckPath: string;
};

type EnvMap = Record<string, string | undefined>;

export async function loadStoryboard(storyboardPath: string, env: EnvMap = process.env): Promise<Storyboard> {
  const text = await fs.readFile(storyboardPath, "utf8");
  const raw = parseStoryboardText(storyboardPath, text);
  const envInterpolated = interpolateValue(raw, envRecord(env));
  const firstPass = StoryboardSchema.parse(envInterpolated);
  const context = buildInterpolationContext(firstPass, env);
  const resolved = StoryboardSchema.parse(interpolateValue(envInterpolated, context));
  assertNoPlaceholders(resolved);
  assertUniqueIds(resolved);
  assertValidStageDirections(resolved);
  return resolved;
}

export async function writeStoryboard(storyboardPath: string, storyboard: StoryboardInput): Promise<void> {
  await fs.mkdir(path.dirname(path.resolve(storyboardPath)), { recursive: true });
  const text = storyboardPath.endsWith(".json")
    ? `${JSON.stringify(storyboard, null, 2)}\n`
    : stringifyYaml(storyboard);
  await fs.writeFile(storyboardPath, text);
}

export function parseStoryboard(input: unknown): Storyboard {
  const parsed = StoryboardSchema.parse(input);
  assertUniqueIds(parsed);
  assertValidStageDirections(parsed);
  return parsed;
}

export function flattenShots(storyboard: Storyboard): readonly StoryboardShot[] {
  return storyboard.scenes.flatMap((scene) => scene.shots).map((shot, index) => {
    const scene = storyboard.scenes.find((candidate) => candidate.shots.includes(shot));
    if (!scene) throw new Error(`Unable to resolve scene for shot ${shot.id}`);
    return { scene, shot, index };
  });
}

export function getShotHoldMs(storyboard: Storyboard, shot: Shot): number {
  return shot.holdMs ?? storyboard.timing.defaultHoldMs;
}

export function getProductionPaths(storyboard: Storyboard, cwd = process.cwd()): ProductionPaths {
  const outputDir = path.resolve(cwd, storyboard.outputDir);
  const dailiesDir = path.join(outputDir, "dailies");
  const manifestDir = path.join(outputDir, "manifests");
  const finalDir = path.join(outputDir, "final");
  return {
    outputDir,
    dailiesDir,
    screenshotDir: path.join(dailiesDir, "screenshots"),
    rawVideoDir: path.join(dailiesDir, "raw-video"),
    audioDir: path.join(dailiesDir, "voiceover"),
    diagnosticsDir: path.join(dailiesDir, "diagnostics"),
    manifestDir,
    finalDir,
    productionManifestPath: path.join(manifestDir, "production-manifest.json"),
    voiceoverManifestPath: path.join(manifestDir, "voiceover-manifest.json"),
    shootManifestPath: path.join(manifestDir, "shoot-manifest.json"),
    finalCutPath: path.join(finalDir, "final-cut.mp4"),
    pitchDeckPath: path.join(finalDir, storyboard.deck.fileName),
  };
}

export async function ensureProductionDirectories(paths: ProductionPaths): Promise<void> {
  await Promise.all([
    fs.mkdir(paths.outputDir, { recursive: true }),
    fs.mkdir(paths.dailiesDir, { recursive: true }),
    fs.mkdir(paths.screenshotDir, { recursive: true }),
    fs.mkdir(paths.rawVideoDir, { recursive: true }),
    fs.mkdir(paths.audioDir, { recursive: true }),
    fs.mkdir(paths.diagnosticsDir, { recursive: true }),
    fs.mkdir(paths.manifestDir, { recursive: true }),
    fs.mkdir(paths.finalDir, { recursive: true }),
  ]);
}

export function safeName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-|-$/g, "") || "production";
}

function parseStoryboardText(filePath: string, text: string): unknown {
  if (filePath.endsWith(".json")) return JSON.parse(text) as unknown;
  return parseYaml(text) as unknown;
}

function buildInterpolationContext(storyboard: Storyboard, env: EnvMap): Record<string, string> {
  return {
    ...envRecord(env),
    title: storyboard.title,
    outputDir: storyboard.outputDir,
    "app.name": storyboard.app.name ?? "",
    "app.baseUrl": storyboard.app.baseUrl ?? "",
    "app.healthUrl": storyboard.app.healthUrl ?? "",
  };
}

function interpolateValue(value: unknown, context: Record<string, string>): unknown {
  if (typeof value === "string") return interpolateString(value, context);
  if (Array.isArray(value)) return value.map((item) => interpolateValue(item, context));
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, interpolateValue(item, context)]));
  }
  return value;
}

function interpolateString(value: string, context: Record<string, string>): string {
  return value.replace(PlaceholderPattern, (match, key: string) => context[key] ?? match);
}

function assertNoPlaceholders(value: unknown): void {
  if (typeof value === "string" && PlaceholderPresencePattern.test(value)) {
    throw new Error(`Unresolved placeholder in storyboard: ${value}`);
  }
  if (Array.isArray(value)) value.forEach(assertNoPlaceholders);
  if (isRecord(value)) Object.values(value).forEach(assertNoPlaceholders);
}

function assertUniqueIds(storyboard: Storyboard): void {
  const sceneIds = storyboard.scenes.map((scene) => scene.id);
  const shotIds = storyboard.scenes.flatMap((scene) => scene.shots.map((shot) => shot.id));
  const duplicateScene = findDuplicate(sceneIds);
  const duplicateShot = findDuplicate(shotIds);
  if (duplicateScene) throw new Error(`Duplicate scene id in storyboard: ${duplicateScene}`);
  if (duplicateShot) throw new Error(`Duplicate shot id in storyboard: ${duplicateShot}`);
}

function assertValidStageDirections(storyboard: Storyboard): void {
  for (const { shot } of flattenShots(storyboard)) {
    for (const direction of shot.stageDirections) {
      if (direction.type === "clickLink" && !direction.text && !direction.hrefIncludes) {
        throw new Error(`Shot "${shot.id}" has a clickLink direction without text or hrefIncludes`);
      }
    }
  }
}

function findDuplicate(values: readonly string[]): string | null {
  const seen = new Set<string>();
  return values.find((value) => {
    if (seen.has(value)) return true;
    seen.add(value);
    return false;
  }) ?? null;
}

function envRecord(env: EnvMap): Record<string, string> {
  return Object.fromEntries(Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
