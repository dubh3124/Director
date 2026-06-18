import type { AddressInfo } from "node:net";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProductionPaths, Storyboard } from "../storyboard.js";
import { parseStoryboard } from "../storyboard.js";
import { createDirectorA2AServer } from "./server.js";

type JsonRpcTaskResponse = {
  readonly result: {
    readonly task: {
      readonly id: string;
      readonly status: {
        readonly state: string;
      };
      readonly artifacts: readonly {
        readonly artifactId: string;
      }[];
    };
  };
};

type JsonRpcGetTaskResponse = {
  readonly result: {
    readonly id: string;
    readonly status: {
      readonly state: string;
    };
  };
};

const storyboard = parseStoryboard({
  schemaVersion: "1",
  title: "Sample App",
  app: { baseUrl: "https://example.test" },
  outputDir: ".director/sample-app",
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

describe("A2A Director server", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("serves an Agent Card with Director skills", async () => {
    await withServer(createDirectorA2AServer({ baseUrl: "http://director.test" }), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/.well-known/agent-card.json`);
      const body = await response.json() as { readonly skills?: readonly { readonly id?: string }[] };

      expect(response.ok).toBe(true);
      expect(body.skills?.map((skill) => skill.id)).toContain("draft_storyboard");
      expect(body.skills?.map((skill) => skill.id)).toContain("premiere_presentation");
    });
  });

  it("creates an input-required draft task and writes the storyboard when requested", async () => {
    const writeStoryboard = vi.fn(async () => undefined);
    const app = createDirectorA2AServer({
      dependencies: {
        draftStoryboard: async () => storyboard,
        writeStoryboard,
      },
    });

    await withServer(app, async (baseUrl) => {
      const response = await sendJsonRpc<JsonRpcTaskResponse>(baseUrl, "SendMessage", {
        skill: "draft_storyboard",
        payload: {
          title: "Sample App",
          appUrl: "https://example.test",
          outputPath: "/tmp/storyboard.yaml",
        },
      });

      expect(response.result.task.status.state).toBe("TASK_STATE_INPUT_REQUIRED");
      expect(response.result.task.artifacts.map((artifact) => artifact.artifactId)).toContain("storyboard");
      expect(writeStoryboard).toHaveBeenCalledWith("/tmp/storyboard.yaml", storyboard);
    });
  });

  it("does not shoot without producer approval", async () => {
    const loadStoryboard = vi.fn(async () => storyboard);
    const shootStoryboard = vi.fn();
    const app = createDirectorA2AServer({
      dependencies: {
        loadStoryboard,
        shootStoryboard,
      },
    });

    await withServer(app, async (baseUrl) => {
      const response = await sendJsonRpc<JsonRpcTaskResponse>(baseUrl, "SendMessage", {
        skill: "shoot_presentation",
        payload: {
          storyboardPath: "/tmp/storyboard.yaml",
        },
      });

      expect(response.result.task.status.state).toBe("TASK_STATE_INPUT_REQUIRED");
      expect(loadStoryboard).not.toHaveBeenCalled();
      expect(shootStoryboard).not.toHaveBeenCalled();
    });
  });

  it("completes an approved premiere task and exposes artifact paths", async () => {
    const paths = makeProductionPaths();
    const app = createDirectorA2AServer({
      dependencies: {
        getProductionPaths: () => paths,
        loadStoryboard: async () => storyboard,
        renderPremiere: async () => ({
          finalCutPath: paths.finalCutPath,
          pitchDeckPath: paths.pitchDeckPath,
        }),
      },
    });

    await withServer(app, async (baseUrl) => {
      const created = await sendJsonRpc<JsonRpcTaskResponse>(baseUrl, "SendMessage", {
        skill: "premiere_presentation",
        payload: {
          storyboardPath: "/tmp/storyboard.yaml",
          approved: true,
        },
      });
      const fetched = await sendJsonRpc<JsonRpcGetTaskResponse>(baseUrl, "GetTask", {
        id: created.result.task.id,
      });

      expect(created.result.task.status.state).toBe("TASK_STATE_COMPLETED");
      expect(created.result.task.artifacts.map((artifact) => artifact.artifactId)).toEqual(expect.arrayContaining([
        "final-cut",
        "pitch-deck",
        "production-manifest",
      ]));
      expect(fetched.result.status.state).toBe("TASK_STATE_COMPLETED");
    });
  });
});

async function withServer(
  app: ReturnType<typeof createDirectorA2AServer>,
  action: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = app.listen(0);
  const address = server.address() as AddressInfo;
  try {
    await action(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

async function sendJsonRpc<T>(baseUrl: string, method: string, params: unknown): Promise<T> {
  const response = await fetch(`${baseUrl}/a2a`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "test", method, params }),
  });
  expect(response.ok).toBe(true);
  return response.json() as Promise<T>;
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

void (storyboard satisfies Storyboard);
