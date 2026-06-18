import { describe, expect, it } from "vitest";
import { buildAudioTimelineArgs, buildMuxArgs, buildVideoTranscodeArgs, formatSeconds } from "./media.js";

describe("media", () => {
  it("formats seconds for ffmpeg", () => {
    expect(formatSeconds(1234)).toBe("1.234");
  });

  it("builds audio timeline args with silence", () => {
    const args = buildAudioTimelineArgs([
      { type: "silence", durationMs: 500 },
      { type: "audio", audioPath: "voice.mp3" },
    ], "track.m4a");

    expect(args).toContain("anullsrc=channel_layout=stereo:sample_rate=44100");
    expect(args).toContain("voice.mp3");
    expect(args.at(-1)).toBe("track.m4a");
  });

  it("builds mux args", () => {
    expect(buildMuxArgs("video.mp4", "audio.m4a", "final.mp4")).toEqual([
      "-y",
      "-i",
      "video.mp4",
      "-i",
      "audio.m4a",
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
      "final.mp4",
    ]);
  });

  it("builds video transcode args", () => {
    expect(buildVideoTranscodeArgs("raw.webm", "final.mp4")).toEqual([
      "-y",
      "-i",
      "raw.webm",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "final.mp4",
    ]);
  });
});
