import fs from "node:fs/promises";
import path from "node:path";
import OBSWebSocket from "obs-websocket-js";
import { createPlaywrightCameraRig } from "./playwright-rig.js";
import type { CameraRig, ShootResult } from "../providers.js";
import { ensureProductionDirectories, flattenShots, safeName, type ProductionPaths, type Storyboard } from "../storyboard.js";

export type ObsTransport = {
  readonly connect: (url: string, password: string) => Promise<unknown>;
  readonly disconnect: () => Promise<unknown>;
  readonly call: (requestType: string, requestData?: Record<string, unknown>) => Promise<unknown>;
};

export class ObsController {
  constructor(
    private readonly transport: ObsTransport,
    private readonly url: string,
    private readonly password: string,
  ) {}

  async connect(): Promise<void> {
    await this.transport.connect(this.url, this.password);
  }

  async disconnect(): Promise<void> {
    await this.transport.disconnect();
  }

  async assertScenes(requiredScenes: readonly string[]): Promise<void> {
    const response = await this.transport.call("GetSceneList");
    const available = extractSceneNames(response);
    const missing = requiredScenes.filter((scene) => !available.includes(scene));
    if (missing.length > 0) {
      throw new Error(`Missing OBS scene(s): ${missing.join(", ")}. Available scenes: ${available.join(", ") || "(none)"}`);
    }
  }

  async switchScene(sceneName: string): Promise<void> {
    await this.transport.call("SetCurrentProgramScene", { sceneName });
  }

  async startRecording(): Promise<void> {
    await this.transport.call("StartRecord");
  }

  async stopRecording(): Promise<string> {
    const response = await this.transport.call("StopRecord");
    if (!isRecord(response) || typeof response.outputPath !== "string") {
      throw new Error("OBS StopRecord did not return an outputPath");
    }
    return response.outputPath;
  }

  async createChapter(chapterName: string): Promise<void> {
    await this.transport.call("CreateRecordChapter", { chapterName });
  }

  async captureSceneScreenshot(sceneName: string): Promise<Buffer> {
    const response = await this.transport.call("GetSourceScreenshot", {
      sourceName: sceneName,
      imageFormat: "png",
      imageWidth: 960,
      imageHeight: 540,
      imageCompressionQuality: 90,
    });
    if (!isRecord(response) || typeof response.imageData !== "string") {
      throw new Error("OBS GetSourceScreenshot did not return imageData");
    }
    return decodeImageData(response.imageData);
  }
}

export function createObsCameraRig(): CameraRig {
  const playwrightRig = createPlaywrightCameraRig();
  return {
    kind: "obs",
    check: async (storyboard, paths) => {
      if (storyboard.camera.type !== "obs") throw new Error("OBS camera rig requires camera.type: obs");
      await playwrightRig.check(storyboard, paths);
      const obs = createObsController(storyboard);
      try {
        await obs.connect();
        await obs.assertScenes(getRequiredObsScenes(storyboard));
      } finally {
        await obs.disconnect().catch(() => undefined);
      }
    },
    shoot: async (storyboard, paths, options): Promise<ShootResult> => {
      if (storyboard.camera.type !== "obs") throw new Error("OBS camera rig requires camera.type: obs");
      await ensureProductionDirectories(paths);
      const obs = createObsController(storyboard);
      let rawVideoPath: string | null = null;
      const sceneName = storyboard.camera.defaultScene;
      try {
        await obs.connect();
        await obs.assertScenes(getRequiredObsScenes(storyboard));
        await obs.switchScene(sceneName);
        await assertObsSceneVisible(obs, sceneName, paths);
        await obs.startRecording();
        const result = await playwrightRig.shoot(storyboard, paths, { ...options, dryRun: false });
        rawVideoPath = await obs.stopRecording();
        return {
          ...result,
          rig: "obs",
          rawVideoPath,
          shots: result.shots.map((shot) => ({ ...shot, rawVideoPath })),
        };
      } finally {
        if (!rawVideoPath) {
          await obs.stopRecording().catch(() => null);
        }
        await obs.disconnect().catch(() => undefined);
      }
    },
  };
}

export function createObsController(storyboard: Storyboard): ObsController {
  if (storyboard.camera.type !== "obs") throw new Error("OBS controller requires camera.type: obs");
  return new ObsController(
    new ObsWebSocketTransport(),
    process.env[storyboard.camera.urlEnv] || "ws://127.0.0.1:4455",
    requiredEnv(storyboard.camera.passwordEnv),
  );
}

export function extractSceneNames(response: unknown): readonly string[] {
  if (!isRecord(response) || !Array.isArray(response.scenes)) return [];
  return response.scenes.flatMap((scene) => {
    if (!isRecord(scene) || typeof scene.sceneName !== "string") return [];
    return [scene.sceneName];
  });
}

export function isLikelyBlankScreenshot(image: Buffer): boolean {
  return image.byteLength < 20_000;
}

function getRequiredObsScenes(storyboard: Storyboard): readonly string[] {
  if (storyboard.camera.type !== "obs") return [];
  return Array.from(new Set([
    storyboard.camera.defaultScene,
    ...flattenShots(storyboard).flatMap(({ shot }) => shot.cameraScene ? [shot.cameraScene] : []),
  ]));
}

async function assertObsSceneVisible(obs: ObsController, sceneName: string, paths: ProductionPaths): Promise<void> {
  const screenshot = await obs.captureSceneScreenshot(sceneName);
  const screenshotPath = path.join(paths.diagnosticsDir, `obs-${safeName(sceneName)}-preflight.png`);
  await fs.writeFile(screenshotPath, screenshot);
  if (!isLikelyBlankScreenshot(screenshot)) return;
  throw new Error(`OBS scene "${sceneName}" appears blank before recording. Preflight screenshot: ${screenshotPath}.`);
}

class ObsWebSocketTransport implements ObsTransport {
  private readonly client = new OBSWebSocket();

  async connect(url: string, password: string): Promise<unknown> {
    return this.client.connect(url, password);
  }

  async disconnect(): Promise<unknown> {
    if (!this.client.identified) return undefined;
    return this.client.disconnect();
  }

  async call(requestType: string, requestData?: Record<string, unknown>): Promise<unknown> {
    return this.client.call(requestType as never, requestData as never);
  }
}

function requiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

function decodeImageData(imageData: string): Buffer {
  const marker = "base64,";
  const markerIndex = imageData.indexOf(marker);
  const base64 = markerIndex >= 0 ? imageData.slice(markerIndex + marker.length) : imageData;
  return Buffer.from(base64, "base64");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
