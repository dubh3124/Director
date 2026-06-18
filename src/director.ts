import fs from "node:fs/promises";
import { assertCommandAvailable } from "./media.js";
import { createCameraRig } from "./camera/index.js";
import { createFfmpegEditorProvider } from "./editor.js";
import { createPptxDeckProducer } from "./deck.js";
import { readJsonFile, writeJsonFile, writeProductionManifest, type ProductionArtifact } from "./manifest.js";
import { createHeuristicStoryboardPlanner, scoutApp } from "./scout.js";
import { createVoiceoverProvider } from "./voiceover.js";
import type {
  CheckResult,
  DraftStoryboardInput,
  ScoutReport,
  ShootOptions,
  ShootResult,
  VoiceoverManifest,
} from "./providers.js";
import {
  ensureProductionDirectories,
  flattenShots,
  getProductionPaths,
  type ProductionPaths,
  type Storyboard,
} from "./storyboard.js";

export type RenderResult = {
  readonly finalCutPath: string;
  readonly pitchDeckPath: string | null;
};

export async function checkStoryboard(storyboard: Storyboard, paths = getProductionPaths(storyboard)): Promise<CheckResult> {
  await ensureProductionDirectories(paths);
  await checkHealthUrl(storyboard);
  await createCameraRig(storyboard).check(storyboard, paths);
  await createVoiceoverProvider(storyboard).check(storyboard);
  await assertCommandAvailable("ffmpeg");
  await assertCommandAvailable("ffprobe");

  return {
    storyboardTitle: storyboard.title,
    cameraRig: storyboard.camera.type,
    shotCount: flattenShots(storyboard).length,
    sceneCount: storyboard.scenes.length,
  };
}

export async function draftStoryboard(input: DraftStoryboardInput): Promise<Storyboard> {
  return createHeuristicStoryboardPlanner().draftStoryboard(input);
}

export { scoutApp };

export async function shootStoryboard(
  storyboard: Storyboard,
  options: ShootOptions = {},
  paths: ProductionPaths = getProductionPaths(storyboard),
): Promise<ShootResult> {
  await ensureProductionDirectories(paths);
  assertApproved("shoot", options.requireApproval);
  const voiceover = await createVoiceoverProvider(storyboard).generate(storyboard, paths);
  const shoot = await createCameraRig(storyboard).shoot(storyboard, paths, { ...options, voiceover });
  await writeJsonFile(paths.voiceoverManifestPath, voiceover);
  await writeJsonFile(paths.shootManifestPath, shoot);
  await writeProductionManifest(storyboard, paths, {
    shoot,
    voiceover,
    artifacts: buildDailiesArtifacts(paths, shoot, voiceover),
  });
  return shoot;
}

export async function renderPremiere(
  storyboard: Storyboard,
  paths: ProductionPaths = getProductionPaths(storyboard),
): Promise<RenderResult> {
  await ensureProductionDirectories(paths);
  await assertRenderPrerequisites(paths);
  const shoot = await readJsonFile<ShootResult>(paths.shootManifestPath);
  const voiceover = await readJsonFile<VoiceoverManifest>(paths.voiceoverManifestPath);
  const finalCutPath = await createFfmpegEditorProvider().renderFinalCut(storyboard, paths, shoot, voiceover);
  const pitchDeckPath = storyboard.deck.enabled
    ? await createPptxDeckProducer().renderPitchDeck(storyboard, paths, shoot)
    : null;
  await writeProductionManifest(storyboard, paths, {
    shoot,
    voiceover,
    artifacts: [
      ...buildDailiesArtifacts(paths, shoot, voiceover),
      { name: "Final Cut", path: finalCutPath, mediaType: "video/mp4" },
      ...(pitchDeckPath ? [{ name: "Pitch Deck", path: pitchDeckPath, mediaType: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }] : []),
    ],
  });
  return { finalCutPath, pitchDeckPath };
}

export async function premiereStoryboard(
  storyboard: Storyboard,
  options: ShootOptions = {},
  paths: ProductionPaths = getProductionPaths(storyboard),
): Promise<RenderResult> {
  await checkStoryboard(storyboard, paths);
  await shootStoryboard(storyboard, options, paths);
  return renderPremiere(storyboard, paths);
}

async function checkHealthUrl(storyboard: Storyboard): Promise<void> {
  if (!storyboard.app.healthUrl) return;
  const response = await fetch(storyboard.app.healthUrl);
  if (!response.ok) {
    throw new Error(`App health check failed: ${response.status} ${response.statusText} (${storyboard.app.healthUrl})`);
  }
}

function assertApproved(operation: string, requireApproval: boolean | undefined): void {
  if (!requireApproval) return;
  if (process.env.DIRECTOR_APPROVED === "1" || process.env.DIRECTOR_APPROVED === "true") return;
  throw new Error(`Director approval required before ${operation}. Set DIRECTOR_APPROVED=1 or pass an approval gate in the calling adapter.`);
}

function buildDailiesArtifacts(
  paths: ProductionPaths,
  shoot: ShootResult,
  voiceover: VoiceoverManifest,
): readonly ProductionArtifact[] {
  return [
    { name: "Shoot Manifest", path: paths.shootManifestPath, mediaType: "application/json" },
    { name: "Voiceover Manifest", path: paths.voiceoverManifestPath, mediaType: "application/json" },
    ...shoot.shots.flatMap((shot) => shot.screenshotPath
      ? [{ name: `Dailies Screenshot: ${shot.shotId}`, path: shot.screenshotPath, mediaType: "image/png" }]
      : []),
    ...voiceover.clips.map((clip) => ({ name: `Voiceover: ${clip.shotId}`, path: clip.audioPath, mediaType: "audio/mpeg" })),
    ...(shoot.rawVideoPath ? [{ name: "Raw Footage", path: shoot.rawVideoPath, mediaType: "video/mp4" }] : []),
  ];
}

async function assertRenderPrerequisites(paths: ProductionPaths): Promise<void> {
  await Promise.all([
    assertManifestExists(paths.shootManifestPath, "shoot manifest (run director shoot first)"),
    assertManifestExists(paths.voiceoverManifestPath, "voiceover manifest (run director shoot first)"),
  ]);
}

async function assertManifestExists(filePath: string, fallbackHint: string): Promise<void> {
  try {
    await fs.access(filePath);
  } catch {
    throw new Error(`Missing required file for render: ${filePath}. ${fallbackHint}`);
  }
}
