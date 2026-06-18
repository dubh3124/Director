import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  checkStoryboard,
  draftStoryboard,
  getProductionPaths,
  loadStoryboard,
  readProductionManifest,
  renderPremiere,
  scoutApp,
  shootStoryboard,
  writeStoryboard,
} from "../index.js";
import type { ProductionManifest } from "../manifest.js";
import type { CheckResult, DraftStoryboardInput, ShootOptions, ShootResult, ScoutReport } from "../providers.js";
import type { ProductionPaths, Storyboard } from "../storyboard.js";
import type { RenderResult } from "../director.js";
import { isMainModule } from "../runtime.js";

export type DirectorMcpDependencies = {
  readonly scoutApp: (input: { readonly url: string; readonly outputDir?: string }) => Promise<ScoutReport>;
  readonly draftStoryboard: (input: DraftStoryboardInput) => Promise<Storyboard>;
  readonly checkStoryboard: (storyboard: Storyboard, paths: ProductionPaths) => Promise<CheckResult>;
  readonly loadStoryboard: (storyboardPath: string) => Promise<Storyboard>;
  readonly shootStoryboard: (
    storyboard: Storyboard,
    options: ShootOptions,
    paths: ProductionPaths,
  ) => Promise<ShootResult>;
  readonly renderPremiere: (storyboard: Storyboard, paths: ProductionPaths) => Promise<RenderResult>;
  readonly readProductionManifest: (paths: ProductionPaths) => Promise<ProductionManifest>;
  readonly getProductionPaths: (storyboard: Storyboard) => ProductionPaths;
  readonly writeStoryboard: (storyboardPath: string, storyboard: Storyboard) => Promise<void>;
};

const defaultDirectorMcpDependencies: DirectorMcpDependencies = {
  scoutApp,
  draftStoryboard,
  checkStoryboard,
  loadStoryboard,
  shootStoryboard,
  renderPremiere,
  readProductionManifest,
  getProductionPaths,
  writeStoryboard,
};

export type DirectorMcpToolHandlers = {
  scoutApp: (input: { readonly url: string; readonly outputDir?: string }) => Promise<ScoutReport>;
  draftStoryboard: (input: {
    readonly title: string;
    readonly appUrl: string;
    readonly brief?: string;
    readonly outputDir?: string;
    readonly outputPath?: string;
  }) => Promise<{ readonly storyboard: Storyboard; readonly outputPath: string | null }>;
  checkStoryboard: (input: { readonly storyboardPath: string }) => Promise<CheckResult>;
  shootStoryboard: (input: { readonly storyboardPath: string; readonly approved: boolean; readonly dryRun: boolean }) => Promise<{
    readonly shoot: ShootResult;
    readonly paths: ProductionPaths;
  }>;
  renderPremiere: (input: { readonly storyboardPath: string }) => Promise<RenderResult & { readonly paths: ProductionPaths }>;
  getDailies: (input: { readonly storyboardPath: string }) => Promise<{ readonly paths: ProductionPaths; readonly manifest: ProductionManifest | null }>;
};

export function createDirectorMcpToolHandlers(dependencies: DirectorMcpDependencies = defaultDirectorMcpDependencies): DirectorMcpToolHandlers {
  const scoutAppFn = dependencies.scoutApp;
  const draftStoryboardFn = dependencies.draftStoryboard;
  const checkStoryboardFn = dependencies.checkStoryboard;
  const loadStoryboardFn = dependencies.loadStoryboard;
  const shootStoryboardFn = dependencies.shootStoryboard;
  const renderPremiereFn = dependencies.renderPremiere;
  const readProductionManifestFn = dependencies.readProductionManifest;
  const getProductionPathsFn = dependencies.getProductionPaths;
  const writeStoryboardFn = dependencies.writeStoryboard;

  return {
    scoutApp: async ({ url, outputDir }) => scoutAppFn({ url, outputDir }),
    draftStoryboard: async ({ title, appUrl, brief, outputDir, outputPath }) => {
      const storyboard = await draftStoryboardFn({ title, appUrl, brief, outputDir });
      if (outputPath) await writeStoryboardFn(outputPath, storyboard);
      return { storyboard, outputPath: outputPath ?? null };
    },
    checkStoryboard: async ({ storyboardPath }) => {
      const storyboard = await loadStoryboardFn(storyboardPath);
      const paths = getProductionPathsFn(storyboard);
      return checkStoryboardFn(storyboard, paths);
    },
    shootStoryboard: async ({ storyboardPath, approved, dryRun }) => {
      const storyboard = await loadStoryboardFn(storyboardPath);
      const paths = getProductionPathsFn(storyboard);
      const shoot = await shootStoryboardFn(storyboard, { dryRun, requireApproval: !approved }, paths);
      return { shoot, paths };
    },
    renderPremiere: async ({ storyboardPath }) => {
      const storyboard = await loadStoryboardFn(storyboardPath);
      const paths = getProductionPathsFn(storyboard);
      const result = await renderPremiereFn(storyboard, paths);
      return { ...result, paths };
    },
    getDailies: async ({ storyboardPath }) => {
      const storyboard = await loadStoryboardFn(storyboardPath);
      const paths = getProductionPathsFn(storyboard);
      const manifest = await readProductionManifestFn(paths).catch(() => null);
      return { paths, manifest };
    },
  };
}

export function createDirectorMcpServer(dependencies: Partial<DirectorMcpDependencies> = {}): McpServer {
  const handlers = createDirectorMcpToolHandlers({ ...defaultDirectorMcpDependencies, ...dependencies });
  const server = new McpServer({
    name: "director",
    version: "0.1.0",
  });

  server.tool(
    "director_scout_app",
    "Scout a live application with Playwright and return a report.",
    {
      url: z.string().min(1),
      outputDir: z.string().min(1).optional(),
    },
    async ({ url, outputDir }) => textResult(await handlers.scoutApp({ url, outputDir })),
  );

  server.tool(
    "director_draft_storyboard",
    "Draft a Director storyboard and optionally write it to disk.",
    {
      title: z.string().min(1),
      appUrl: z.string().min(1),
      brief: z.string().min(1).optional(),
      outputDir: z.string().min(1).optional(),
      outputPath: z.string().min(1).optional(),
    },
    async ({ title, appUrl, brief, outputDir, outputPath }) => textResult(await handlers.draftStoryboard({
      title,
      appUrl,
      brief,
      outputDir,
      outputPath,
    })),
  );

  server.tool(
    "director_check_storyboard",
    "Validate a storyboard and check local production dependencies.",
    {
      storyboardPath: z.string().min(1),
    },
    async ({ storyboardPath }) => textResult(await handlers.checkStoryboard({ storyboardPath })),
  );

  server.tool(
    "director_shoot_storyboard",
    "Shoot an approved storyboard and write dailies/manifests.",
    {
      storyboardPath: z.string().min(1),
      approved: z.boolean().default(false),
      dryRun: z.boolean().default(false),
    },
    async ({ storyboardPath, approved, dryRun }) => textResult(await handlers.shootStoryboard({ storyboardPath, approved, dryRun })),
  );

  server.tool(
    "director_render_premiere",
    "Render final-cut MP4 and pitch-deck PPTX from existing dailies.",
    {
      storyboardPath: z.string().min(1),
    },
    async ({ storyboardPath }) => textResult(await handlers.renderPremiere({ storyboardPath })),
  );

  server.tool(
    "director_get_dailies",
    "Return known Director artifact paths and the production manifest when available.",
    {
      storyboardPath: z.string().min(1),
    },
    async ({ storyboardPath }) => textResult(await handlers.getDailies({ storyboardPath })),
  );

  return server;
}

export async function runDirectorMcpServer(): Promise<void> {
  const server = createDirectorMcpServer();
  await server.connect(new StdioServerTransport());
}

if (isMainModule(import.meta.url)) {
  runDirectorMcpServer().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

function textResult(value: unknown): { content: { type: "text"; text: string }[] } {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}
