import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { flattenShots, getProductionPaths, getShotHoldMs, loadStoryboard, parseStoryboard } from "./storyboard.js";

describe("storyboard", () => {
  it("loads scenes, shots, stage directions, and placeholders", async () => {
    const filePath = await writeFixture(`
schemaVersion: "1"
title: Demo
app:
  baseUrl: https://example.test
outputDir: .director/demo
camera:
  type: playwright
voiceover:
  provider: none
scenes:
  - id: opening
    shots:
      - id: overview
        stageDirections:
          - type: goto
            url: \${app.baseUrl}/projects/\${PROJECT_ID}
          - type: waitForText
            text: Ready
          - type: capture
`);

    const storyboard = await loadStoryboard(filePath, { PROJECT_ID: "project_123" });

    expect(storyboard.scenes[0]?.shots[0]?.stageDirections[0]).toEqual({
      type: "goto",
      url: "https://example.test/projects/project_123",
    });
    expect(flattenShots(storyboard)).toHaveLength(1);
  });

  it("rejects duplicate shot ids", () => {
    expect(() => parseStoryboard({
      title: "Demo",
      scenes: [
        {
          id: "scene",
          shots: [
            { id: "same", stageDirections: [{ type: "wait", ms: 1 }] },
            { id: "same", stageDirections: [{ type: "wait", ms: 1 }] },
          ],
        },
      ],
    })).toThrow("Duplicate shot id");
  });

  it("resolves production paths and timing defaults", () => {
    const storyboard = parseStoryboard({
      title: "Demo",
      outputDir: ".director/demo",
      timing: { defaultHoldMs: 900 },
      scenes: [
        {
          id: "scene",
          shots: [
            { id: "a", stageDirections: [{ type: "wait", ms: 1 }] },
            { id: "b", holdMs: 1200, stageDirections: [{ type: "wait", ms: 1 }] },
          ],
        },
      ],
    });

    const paths = getProductionPaths(storyboard, "/tmp/project");

    expect(paths.finalCutPath).toBe("/tmp/project/.director/demo/final/final-cut.mp4");
    expect(paths.pitchDeckPath).toBe("/tmp/project/.director/demo/final/pitch-deck.pptx");
    expect(getShotHoldMs(storyboard, storyboard.scenes[0]!.shots[0]!)).toBe(900);
    expect(getShotHoldMs(storyboard, storyboard.scenes[0]!.shots[1]!)).toBe(1200);
  });
});

async function writeFixture(content: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "director-storyboard-"));
  const filePath = path.join(dir, "storyboard.yaml");
  await fs.writeFile(filePath, content);
  return filePath;
}
