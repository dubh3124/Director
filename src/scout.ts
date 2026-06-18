import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import type { DraftStoryboardInput, ScoutLink, ScoutReport, StoryboardPlanner } from "./providers.js";
import { parseStoryboard, safeName, type Storyboard } from "./storyboard.js";

export async function scoutApp(input: {
  readonly url: string;
  readonly outputDir?: string;
}): Promise<ScoutReport> {
  const outputDir = path.resolve(process.cwd(), input.outputDir ?? path.join(".director", "scouting", safeName(input.url)));
  await fs.mkdir(outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    const response = await page.goto(input.url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    if (response && !response.ok()) {
      throw new Error(`Scout navigation failed: ${response.status()} ${response.statusText()} (${input.url})`);
    }
    await page.locator("body").waitFor({ timeout: 30_000 });
    const screenshotPath = path.join(outputDir, "scout.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    const visibleTextSample = (await page.locator("body").innerText({ timeout: 1000 }).catch(() => ""))
      .replace(/\s+/g, " ")
      .slice(0, 1200);
    const links = await page.locator("a").evaluateAll((anchors) => anchors.slice(0, 40).flatMap((anchor) => {
      const text = anchor.textContent?.replace(/\s+/g, " ").trim() ?? "";
      const href = anchor.getAttribute("href") ?? "";
      return text || href ? [{ text, href }] : [];
    })) as ScoutLink[];
    return {
      url: input.url,
      title: await page.title(),
      capturedAt: new Date().toISOString(),
      screenshotPath,
      visibleTextSample,
      links,
    };
  } finally {
    await browser.close();
  }
}

export function createHeuristicStoryboardPlanner(): StoryboardPlanner {
  return {
    draftStoryboard: async (input: DraftStoryboardInput): Promise<Storyboard> => parseStoryboard({
      schemaVersion: "1",
      title: input.title,
      app: {
        name: input.title,
        baseUrl: input.appUrl,
      },
      outputDir: input.outputDir ?? path.join(".director", safeName(input.title)),
      camera: {
        type: "playwright",
        recordVideo: true,
      },
      voiceover: {
        provider: "none",
      },
      deck: {
        enabled: true,
        fileName: "pitch-deck.pptx",
      },
      timing: {
        defaultHoldMs: 500,
        transitionBufferMs: 150,
      },
      scenes: [
        {
          id: "opening",
          title: input.brief ? "Opening Story" : "Application Overview",
          shots: [
            {
              id: "overview",
              title: "Overview",
              voiceover: input.brief,
              stageDirections: [
                { type: "goto", url: input.appUrl },
                { type: "waitForSelector", selector: "body" },
                { type: "capture", name: "overview" },
              ],
            },
          ],
        },
      ],
    }),
  };
}
