import fs from "node:fs/promises";
import path from "node:path";
import { buildAudioTimelineArgs, buildMuxArgs, buildSilentVideoArgs, buildVideoTranscodeArgs, runCommand, type AudioTimelineSegment } from "./media.js";
import type { EditorProvider, ShootResult, VoiceoverManifest } from "./providers.js";
import { getShotHoldMs, type ProductionPaths, type Storyboard } from "./storyboard.js";

export function createFfmpegEditorProvider(): EditorProvider {
  return {
    renderFinalCut: async (storyboard, paths, shoot, voiceover) => {
      await fs.mkdir(paths.finalDir, { recursive: true });
      const sourceVideoPath = shoot.rawVideoPath ?? await buildFallbackVideo(storyboard, paths, shoot);
      if (voiceover.clips.length === 0) {
        await runCommand("ffmpeg", buildVideoTranscodeArgs(sourceVideoPath, paths.finalCutPath));
        return paths.finalCutPath;
      }

      const audioPath = path.join(paths.finalDir, "voiceover-track.m4a");
      await runCommand("ffmpeg", buildAudioTimelineArgs(buildVoiceoverTimeline(storyboard, voiceover, shoot), audioPath));
      await runCommand("ffmpeg", buildMuxArgs(sourceVideoPath, audioPath, paths.finalCutPath));
      return paths.finalCutPath;
    },
  };
}

export function buildVoiceoverTimeline(
  storyboard: Storyboard,
  voiceover: VoiceoverManifest,
  shoot: ShootResult,
): readonly AudioTimelineSegment[] {
  const segments: AudioTimelineSegment[] = [];
  let cursorMs = 0;

  for (const clip of voiceover.clips) {
    const shot = shoot.shots.find((candidate) => candidate.shotId === clip.shotId);
    const storyboardShot = storyboard.scenes.flatMap((scene) => scene.shots).find((candidate) => candidate.id === clip.shotId);
    const desiredStartMs = shot?.voiceoverStartOffsetMs ?? cursorMs;
    if (desiredStartMs > cursorMs) {
      segments.push({ type: "silence", durationMs: desiredStartMs - cursorMs });
      cursorMs = desiredStartMs;
    }

    segments.push({ type: "audio", audioPath: clip.audioPath });
    cursorMs += clip.durationMs;

    const paddingMs = storyboardShot
      ? getShotHoldMs(storyboard, storyboardShot) + storyboard.timing.transitionBufferMs
      : storyboard.timing.transitionBufferMs;
    segments.push({ type: "silence", durationMs: paddingMs });
    cursorMs += paddingMs;
  }

  return segments;
}

async function buildFallbackVideo(storyboard: Storyboard, paths: ProductionPaths, shoot: ShootResult): Promise<string> {
  const firstScreenshot = shoot.shots.find((shot) => shot.screenshotPath)?.screenshotPath;
  if (!firstScreenshot) throw new Error("Cannot render a final cut without raw video or at least one screenshot");
  const durationMs = shoot.shots.reduce((total, shot) => total + shot.voiceoverDurationMs + shot.plannedHoldMs + storyboard.timing.transitionBufferMs, 0);
  const outputPath = path.join(paths.finalDir, "fallback-silent-video.mp4");
  await runCommand("ffmpeg", buildSilentVideoArgs(firstScreenshot, durationMs, outputPath));
  return outputPath;
}
