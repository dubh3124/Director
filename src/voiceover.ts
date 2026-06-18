import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { getMediaDurationMs } from "./media.js";
import { writeJsonFile } from "./manifest.js";
import type { VoiceoverClip, VoiceoverManifest, VoiceoverProvider } from "./providers.js";
import { flattenShots, safeName, type ProductionPaths, type Storyboard } from "./storyboard.js";

export function createVoiceoverProvider(storyboard: Storyboard): VoiceoverProvider {
  switch (storyboard.voiceover.provider) {
    case "none":
      return createNoVoiceoverProvider();
    case "elevenlabs":
      return createElevenLabsVoiceoverProvider();
    default: {
      const exhaustive: never = storyboard.voiceover;
      throw new Error(`Unsupported voiceover provider: ${JSON.stringify(exhaustive)}`);
    }
  }
}

export function createNoVoiceoverProvider(): VoiceoverProvider {
  return {
    provider: "none",
    check: async () => undefined,
    generate: async (storyboard, paths) => {
      const manifest = {
        storyboardTitle: storyboard.title,
        generatedAt: new Date().toISOString(),
        clips: [],
      } satisfies VoiceoverManifest;
      await fs.mkdir(paths.manifestDir, { recursive: true });
      await writeJsonFile(paths.voiceoverManifestPath, manifest);
      return manifest;
    },
  };
}

export function createElevenLabsVoiceoverProvider(): VoiceoverProvider {
  return {
    provider: "elevenlabs",
    check: async (storyboard) => {
      if (storyboard.voiceover.provider !== "elevenlabs") return;
      requiredEnv(storyboard.voiceover.apiKeyEnv);
      requiredEnv(storyboard.voiceover.voiceIdEnv);
    },
    generate: async (storyboard, paths) => {
      if (storyboard.voiceover.provider !== "elevenlabs") {
        throw new Error("ElevenLabs voiceover provider requires an elevenlabs voiceover config");
      }

      await fs.mkdir(paths.audioDir, { recursive: true });
      await fs.mkdir(paths.manifestDir, { recursive: true });

      const apiKey = requiredEnv(storyboard.voiceover.apiKeyEnv);
      const voiceId = requiredEnv(storyboard.voiceover.voiceIdEnv);
      const client = new ElevenLabsClient({ apiKey });
      const narratedShots = flattenShots(storyboard).filter(({ shot }) => shot.voiceover);
      const clips: VoiceoverClip[] = [];

      for (const [index, item] of narratedShots.entries()) {
        const text = item.shot.voiceover ?? "";
        const hash = computeVoiceoverHash({ text, modelId: storyboard.voiceover.modelId, voiceId });
        const audioPath = path.join(paths.audioDir, `${String(index + 1).padStart(2, "0")}-${safeName(item.shot.id)}-${hash.slice(0, 10)}.mp3`);
        if (!(await fileExists(audioPath))) {
          const stream = await client.textToSpeech.convert(voiceId, {
            text,
            modelId: storyboard.voiceover.modelId,
            outputFormat: storyboard.voiceover.outputFormat,
          });
          const audio = Buffer.from(await new Response(stream).arrayBuffer());
          await fs.writeFile(audioPath, audio);
        }
        clips.push({
          shotId: item.shot.id,
          index,
          text,
          audioPath,
          durationMs: await getMediaDurationMs(audioPath),
          provider: "elevenlabs",
          voiceId,
          modelId: storyboard.voiceover.modelId,
        });
      }

      const manifest = {
        storyboardTitle: storyboard.title,
        generatedAt: new Date().toISOString(),
        clips,
      } satisfies VoiceoverManifest;
      await writeJsonFile(paths.voiceoverManifestPath, manifest);
      return manifest;
    },
  };
}

export function computeVoiceoverHash(input: {
  readonly text: string;
  readonly modelId: string;
  readonly voiceId: string;
}): string {
  return crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function requiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

async function fileExists(filePath: string): Promise<boolean> {
  return fs.access(filePath).then(() => true, () => false);
}
