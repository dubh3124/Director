import { describe, expect, it, vi } from "vitest";
import type { ProductionManifest } from "../manifest.js";
import type { CheckResult, ScoutReport, ShootResult, VoiceoverManifest } from "../providers.js";
import type { ProductionPaths, Storyboard } from "../storyboard.js";
import { parseStoryboard } from "../storyboard.js";
import { createDirectorMcpToolHandlers } from "./server.js";

const storyboard = parseStoryboard({
  schemaVersion: "1",
  title: "Local Agent Demo",
  app: { baseUrl: "http://localhost:3000" },
  outputDir: ".director/local-agent-demo",
  voiceover: { provider: "none" },
  scenes: [
    {
      id: "opening",
      shots: [
        {
          id: "overview",
          stageDirections: [{ type: "wait", ms: 100 }],
        },
      ],
    },
  ],
});

describe("Director MCP handlers", () => {
  it("drafts and optionally writes a storyboard", async () => {
    const writeStoryboard = vi.fn(async () => undefined);
    const handlers = createDirectorMcpToolHandlers({
      ...baseDependencies(),
      draftStoryboard: async () => storyboard,
      writeStoryboard,
    });

    const result = await handlers.draftStoryboard({
      title: "Local Agent Demo",
      appUrl: "http://localhost:3000",
      outputPath: "/tmp/storyboard.yaml",
    });

    expect(result.outputPath).toBe("/tmp/storyboard.yaml");
    expect(writeStoryboard).toHaveBeenCalledWith("/tmp/storyboard.yaml", storyboard);
  });

  it("runs check through the loaded storyboard and resolved production paths", async () => {
    const checkStoryboard = vi.fn(async (): Promise<CheckResult> => ({
      storyboardTitle: storyboard.title,
      cameraRig: "playwright",
      sceneCount: 1,
      shotCount: 1,
    }));
    const handlers = createDirectorMcpToolHandlers({
      ...baseDependencies(),
      checkStoryboard,
    });

    const result = await handlers.checkStoryboard({ storyboardPath: "/tmp/storyboard.yaml" });

    expect(result.shotCount).toBe(1);
    expect(checkStoryboard).toHaveBeenCalledWith(storyboard, makeProductionPaths());
  });

  it("keeps shoot approval explicit for local agents", async () => {
    const shootStoryboard = vi.fn(async (): Promise<ShootResult> => ({
      rig: "playwright",
      startedAt: "2026-06-17T00:00:00.000Z",
      completedAt: "2026-06-17T00:00:01.000Z",
      rawVideoPath: null,
      shots: [],
    }));
    const handlers = createDirectorMcpToolHandlers({
      ...baseDependencies(),
      shootStoryboard,
    });

    await handlers.shootStoryboard({
      storyboardPath: "/tmp/storyboard.yaml",
      approved: false,
      dryRun: true,
    });

    expect(shootStoryboard).toHaveBeenCalledWith(storyboard, {
      dryRun: true,
      requireApproval: true,
    }, makeProductionPaths());
  });
});

function baseDependencies(): Parameters<typeof createDirectorMcpToolHandlers>[0] {
  return {
    scoutApp: async (): Promise<ScoutReport> => ({
      url: "http://localhost:3000",
      title: "Demo",
      capturedAt: "2026-06-17T00:00:00.000Z",
      screenshotPath: "/tmp/scout.png",
      visibleTextSample: "Demo",
      links: [],
    }),
    draftStoryboard: async () => storyboard,
    checkStoryboard: async (): Promise<CheckResult> => ({
      storyboardTitle: storyboard.title,
      cameraRig: "playwright",
      sceneCount: 1,
      shotCount: 1,
    }),
    loadStoryboard: async () => storyboard,
    shootStoryboard: async (): Promise<ShootResult> => ({
      rig: "playwright",
      startedAt: "2026-06-17T00:00:00.000Z",
      completedAt: "2026-06-17T00:00:01.000Z",
      rawVideoPath: null,
      shots: [],
    }),
    renderPremiere: async () => ({
      finalCutPath: "/tmp/director/sample/final/final-cut.mp4",
      pitchDeckPath: "/tmp/director/sample/final/pitch-deck.pptx",
    }),
    readProductionManifest: async (): Promise<ProductionManifest> => ({
      schemaVersion: "1",
      storyboardTitle: storyboard.title,
      producedAt: "2026-06-17T00:00:00.000Z",
      artifacts: [],
      shoot: null,
      voiceover: emptyVoiceoverManifest(),
    }),
    getProductionPaths: () => makeProductionPaths(),
    writeStoryboard: async () => undefined,
  };
}

function emptyVoiceoverManifest(): VoiceoverManifest {
  return {
    storyboardTitle: storyboard.title,
    generatedAt: "2026-06-17T00:00:00.000Z",
    clips: [],
  };
}

function makeProductionPaths(): ProductionPaths {
  return {
    outputDir: "/tmp/director/sample",
    dailiesDir: "/tmp/director/sample/dailies",
    screenshotDir: "/tmp/director/sample/dailies/screenshots",
    rawVideoDir: "/tmp/director/sample/dailies/raw-video",
    audioDir: "/tmp/director/sample/dailies/voiceover",
    diagnosticsDir: "/tmp/director/sample/dailies/diagnostics",
    manifestDir: "/tmp/director/sample/manifests",
    finalDir: "/tmp/director/sample/final",
    productionManifestPath: "/tmp/director/sample/manifests/production-manifest.json",
    voiceoverManifestPath: "/tmp/director/sample/manifests/voiceover-manifest.json",
    shootManifestPath: "/tmp/director/sample/manifests/shoot-manifest.json",
    finalCutPath: "/tmp/director/sample/final/final-cut.mp4",
    pitchDeckPath: "/tmp/director/sample/final/pitch-deck.pptx",
  };
}
