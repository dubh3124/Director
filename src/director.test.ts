import { describe, expect, it } from "vitest";
import { draftStoryboard } from "./director.js";

describe("director", () => {
  it("drafts an approval-ready storyboard from a URL and brief", async () => {
    const storyboard = await draftStoryboard({
      title: "Launch Walkthrough",
      appUrl: "https://example.test",
      brief: "Show the launch flow.",
    });

    expect(storyboard.title).toBe("Launch Walkthrough");
    expect(storyboard.camera.type).toBe("playwright");
    expect(storyboard.scenes[0]?.shots[0]?.voiceover).toBe("Show the launch flow.");
    expect(storyboard.scenes[0]?.shots[0]?.stageDirections[0]).toEqual({
      type: "goto",
      url: "https://example.test",
    });
  });
});
