import fs from "node:fs/promises";
import type { ProductionPaths, Storyboard } from "./storyboard.js";
import type { ShootResult, VoiceoverManifest } from "./providers.js";

export type ProductionArtifact = {
  readonly name: string;
  readonly path: string;
  readonly mediaType: string;
};

export type ProductionManifest = {
  readonly schemaVersion: string;
  readonly storyboardTitle: string;
  readonly producedAt: string;
  readonly artifacts: readonly ProductionArtifact[];
  readonly shoot: ShootResult | null;
  readonly voiceover: VoiceoverManifest | null;
};

export async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export async function readJsonFile<T>(filePath: string): Promise<T> {
  const text = await fs.readFile(filePath, "utf8");
  return JSON.parse(text) as T;
}

export async function writeProductionManifest(
  storyboard: Storyboard,
  paths: ProductionPaths,
  input: {
    readonly shoot: ShootResult | null;
    readonly voiceover: VoiceoverManifest | null;
    readonly artifacts: readonly ProductionArtifact[];
  },
): Promise<ProductionManifest> {
  const manifest = {
    schemaVersion: storyboard.schemaVersion,
    storyboardTitle: storyboard.title,
    producedAt: new Date().toISOString(),
    artifacts: input.artifacts,
    shoot: input.shoot,
    voiceover: input.voiceover,
  } satisfies ProductionManifest;
  await writeJsonFile(paths.productionManifestPath, manifest);
  return manifest;
}

export async function readProductionManifest(paths: ProductionPaths): Promise<ProductionManifest> {
  return readJsonFile<ProductionManifest>(paths.productionManifestPath);
}
