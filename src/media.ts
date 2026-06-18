import { spawn } from "node:child_process";

export type CommandResult = {
  readonly stdout: string;
  readonly stderr: string;
};

export type AudioTimelineSegment =
  | { readonly type: "audio"; readonly audioPath: string }
  | { readonly type: "silence"; readonly durationMs: number };

export async function assertCommandAvailable(command: string): Promise<void> {
  await runCommand("sh", ["-lc", `command -v ${command}`]).catch((error: unknown) => {
    throw new Error(`Required command not found: ${command}. ${error instanceof Error ? error.message : ""}`.trim());
  });
}

export async function getMediaDurationMs(filePath: string): Promise<number> {
  const result = await runCommand("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=nokey=1:noprint_wrappers=1",
    filePath,
  ]);
  const seconds = Number.parseFloat(result.stdout.trim());
  if (!Number.isFinite(seconds)) throw new Error(`Unable to read media duration for ${filePath}`);
  return Math.round(seconds * 1000);
}

export async function runCommand(command: string, args: readonly string[]): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      const result = {
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      };
      if (code === 0) {
        resolve(result);
        return;
      }
      reject(new Error(`${command} exited with code ${code}: ${result.stderr || result.stdout}`));
    });
  });
}

export function buildAudioTimelineArgs(segments: readonly AudioTimelineSegment[], outputPath: string): readonly string[] {
  const filteredSegments = segments.filter((segment) => segment.type === "audio" || segment.durationMs > 0);
  if (filteredSegments.length === 0) throw new Error("Cannot build a voiceover track without audio segments");

  const ffmpegInputs = filteredSegments.flatMap((segment) => {
    if (segment.type === "audio") return ["-i", segment.audioPath];
    return [
      "-f",
      "lavfi",
      "-t",
      formatSeconds(segment.durationMs),
      "-i",
      "anullsrc=channel_layout=stereo:sample_rate=44100",
    ];
  });
  const filterInputs = filteredSegments.map((_, index) => `[${index}:a]`).join("");

  return [
    "-y",
    ...ffmpegInputs,
    "-filter_complex",
    `${filterInputs}concat=n=${filteredSegments.length}:v=0:a=1[a]`,
    "-map",
    "[a]",
    "-c:a",
    "aac",
    outputPath,
  ];
}

export function buildMuxArgs(videoPath: string, audioPath: string, outputPath: string): readonly string[] {
  return [
    "-y",
    "-i",
    videoPath,
    "-i",
    audioPath,
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-af",
    "apad",
    "-shortest",
    outputPath,
  ];
}

export function buildVideoTranscodeArgs(videoPath: string, outputPath: string): readonly string[] {
  return [
    "-y",
    "-i",
    videoPath,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    outputPath,
  ];
}

export function buildSilentVideoArgs(imagePath: string, durationMs: number, outputPath: string): readonly string[] {
  return [
    "-y",
    "-loop",
    "1",
    "-i",
    imagePath,
    "-t",
    formatSeconds(Math.max(durationMs, 1000)),
    "-vf",
    "scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    outputPath,
  ];
}

export function formatSeconds(ms: number): string {
  return (ms / 1000).toFixed(3);
}
