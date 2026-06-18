#!/usr/bin/env node
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
  type StoryboardInput,
} from "../index.js";
import { runDirectorA2AServer } from "../a2a/server.js";
import { runDirectorMcpServer } from "../mcp/server.js";

type CliOptions = {
  readonly command: string;
  readonly args: readonly string[];
  readonly flags: ReadonlyMap<string, string | boolean>;
};

async function main(argv: readonly string[]): Promise<void> {
  const options = parseCliOptions(argv);

  switch (options.command) {
    case "help":
    case "--help":
    case "-h":
      printHelp();
      return;
    case "init":
      await initCommand(options);
      return;
    case "scout":
      await scoutCommand(options);
      return;
    case "storyboard":
    case "draft":
      await draftCommand(options);
      return;
    case "check":
      await withStoryboard(options, async (storyboard) => {
        const result = await checkStoryboard(storyboard);
        console.log(JSON.stringify(result, null, 2));
      });
      return;
    case "mcp":
      await runMcpServerCommand(options);
      return;
    case "a2a":
      await runA2ACommand(options);
      return;
    case "shoot":
      await withStoryboard(options, async (storyboard) => {
        const result = await shootStoryboard(storyboard, {
          dryRun: getBooleanFlag(options, "dry-run"),
          requireApproval: !getBooleanFlag(options, "approved"),
        });
        console.log(`Dailies complete: ${getProductionPaths(storyboard).shootManifestPath}`);
        if (result.rawVideoPath) console.log(`Raw footage: ${result.rawVideoPath}`);
      });
      return;
    case "render":
      await withStoryboard(options, async (storyboard) => {
        const result = await renderPremiere(storyboard);
        console.log(`Final Cut: ${result.finalCutPath}`);
        if (result.pitchDeckPath) console.log(`Pitch Deck: ${result.pitchDeckPath}`);
      });
      return;
    case "premiere":
      await withStoryboard(options, async (storyboard) => {
        const result = await premiereStoryboard(storyboard, {
          dryRun: getBooleanFlag(options, "dry-run"),
          requireApproval: !getBooleanFlag(options, "approved"),
        });
        console.log(`Final Cut: ${result.finalCutPath}`);
        if (result.pitchDeckPath) console.log(`Pitch Deck: ${result.pitchDeckPath}`);
        console.log(`Production Manifest: ${getProductionPaths(storyboard).productionManifestPath}`);
      });
      return;
    default:
      throw new Error(`Unknown director command: ${options.command}`);
  }
}

function parseCliOptions(argv: readonly string[]): CliOptions {
  const command = argv[2] ?? "help";
  const args: string[] = [];
  const flags = new Map<string, string | boolean>();
  for (let index = 3; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) continue;
    if (!arg.startsWith("--")) {
      args.push(arg);
      continue;
    }
    const withoutPrefix = arg.slice(2);
    if (withoutPrefix.includes("=")) {
      const [key, ...rest] = withoutPrefix.split("=");
      flags.set(key ?? "", rest.join("="));
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      flags.set(withoutPrefix, next);
      index += 1;
      continue;
    }
    flags.set(withoutPrefix, true);
  }
  return { command, args, flags };
}

async function initCommand(options: CliOptions): Promise<void> {
  const path = options.args[0] ?? "storyboard.yaml";
  const title = getStringFlag(options, "title") ?? "Live App Walkthrough";
  const url = getStringFlag(options, "url") ?? "http://localhost:3000";
  const storyboard = buildInitialStoryboard(title, url);
  await writeStoryboard(path, storyboard);
  console.log(`Storyboard created: ${path}`);
}

async function scoutCommand(options: CliOptions): Promise<void> {
  const url = getStringFlag(options, "url") ?? options.args[0];
  if (!url) throw new Error("director scout requires --url or a URL argument");
  const report = await scoutApp({
    url,
    outputDir: getStringFlag(options, "output-dir") ?? undefined,
  });
  console.log(JSON.stringify(report, null, 2));
}

async function draftCommand(options: CliOptions): Promise<void> {
  const url = getStringFlag(options, "url") ?? options.args[0];
  if (!url) throw new Error("director storyboard requires --url or a URL argument");
  const title = getStringFlag(options, "title") ?? "Live App Walkthrough";
  const outputPath = getStringFlag(options, "write") ?? "storyboard.yaml";
  const storyboard = await draftStoryboard({
    title,
    appUrl: url,
    brief: getStringFlag(options, "brief") ?? undefined,
    outputDir: getStringFlag(options, "output-dir") ?? undefined,
  });
  await writeStoryboard(outputPath, storyboard);
  console.log(`Storyboard drafted: ${outputPath}`);
}

async function withStoryboard(options: CliOptions, action: (storyboard: Awaited<ReturnType<typeof loadStoryboard>>) => Promise<void>): Promise<void> {
  const storyboardPath = options.args[0];
  if (!storyboardPath) throw new Error(`director ${options.command} requires a storyboard path`);
  const storyboard = await loadStoryboard(storyboardPath);
  await action(storyboard);
}

function buildInitialStoryboard(title: string, url: string): StoryboardInput {
  return {
    schemaVersion: "1",
    title,
    app: {
      name: title,
      baseUrl: url,
    },
    outputDir: ".director/live-app-walkthrough",
    camera: {
      type: "playwright",
      recordVideo: true,
    },
    voiceover: {
      provider: "none",
    },
    deck: {
      enabled: true,
      fileName: "pitch-deck.pptx",
    },
    scenes: [
      {
        id: "opening",
        title: "Application Overview",
        shots: [
          {
            id: "overview",
            title: "Overview",
            stageDirections: [
              { type: "goto", url },
              { type: "waitForSelector", selector: "body" },
              { type: "capture", name: "overview" },
            ],
          },
        ],
      },
    ],
  };
}

async function runMcpServerCommand(options: CliOptions): Promise<void> {
  const transport = getStringFlag(options, "transport");
  if (transport && transport !== "stdio") {
    throw new Error("Director MCP currently supports --transport stdio only.");
  }
  if (transport === undefined && options.args.length > 0) {
    throw new Error(`Unknown director mcp argument: ${options.args[0]}`);
  }
  await runDirectorMcpServer();
}

async function runA2ACommand(options: CliOptions): Promise<void> {
  const port = Number(getStringFlag(options, "port") ?? process.env.DIRECTOR_A2A_PORT ?? "4129");
  const baseUrl = getStringFlag(options, "base-url") ?? undefined;
  await runDirectorA2AServer({ port, ...(baseUrl ? { baseUrl } : {}) });
}

function getStringFlag(options: CliOptions, key: string): string | null {
  const value = options.flags.get(key);
  return typeof value === "string" ? value : null;
}

function getBooleanFlag(options: CliOptions, key: string): boolean {
  return options.flags.get(key) === true || options.flags.get(key) === "true" || options.flags.get(key) === "1";
}

function printHelp(): void {
  console.log(`Director

Usage:
  director init [storyboard.yaml] [--title "Live App Walkthrough"] [--url http://localhost:3000]
  director scout --url http://localhost:3000 [--output-dir .director/scout]
  director storyboard --url http://localhost:3000 [--title "Launch Demo"] [--brief "..."] [--write storyboard.yaml]
  director mcp [--transport stdio]
  director a2a [--port 4129] [--base-url http://localhost:4129]
  director check storyboard.yaml
  director shoot storyboard.yaml --approved [--dry-run]
  director render storyboard.yaml
  director premiere storyboard.yaml --approved [--dry-run]

Approval:
  Shooting and premiere commands require --approved or DIRECTOR_APPROVED=1.
`);
}

main(process.argv).catch((error: unknown) => {
  console.error(formatError(error));
  process.exitCode = 1;
});

function formatError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const messages: string[] = [error.message];
  let cause = error.cause;
  while (cause instanceof Error) {
    messages.push(cause.message);
    cause = cause.cause;
  }
  return messages.join("\nCaused by: ");
}
