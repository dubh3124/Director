import fs from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Locator, type Page, type Response } from "playwright";
import type { CameraRig, CapturedShot, ShootOptions, ShootResult, VoiceoverManifest } from "../providers.js";
import { shotDisplayTitle } from "../providers.js";
import {
  ensureProductionDirectories,
  flattenShots,
  getShotHoldMs,
  safeName,
  type ProductionPaths,
  type Shot,
  type StageDirection,
  type Storyboard,
} from "../storyboard.js";

const NavigationAttempts = 3;
const NavigationRetryDelayMs = 1500;

export function createPlaywrightCameraRig(): CameraRig {
  return {
    kind: "playwright",
    check: async (storyboard) => {
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage({ viewport: storyboard.browser.viewport });
        const firstUrl = findFirstGotoUrl(storyboard) ?? storyboard.app.baseUrl;
        if (firstUrl) {
          const response = await page.goto(firstUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
          if (response && !response.ok()) {
            throw new Error(`Playwright navigation failed: ${response.status()} ${response.statusText()} (${firstUrl})`);
          }
        }
      } finally {
        await browser.close();
      }
    },
    shoot: async (storyboard, paths, options) => shootWithPlaywright(storyboard, paths, options),
  };
}

async function shootWithPlaywright(storyboard: Storyboard, paths: ProductionPaths, options: ShootOptions): Promise<ShootResult> {
  await ensureProductionDirectories(paths);
  const dryRun = options.dryRun ?? false;
  const browser = await chromium.launch({ headless: dryRun, args: buildChromiumLaunchArgs(storyboard) });
  const context = await createContext(browser, storyboard, paths, dryRun);
  const page = await context.newPage();
  const startedAt = new Date().toISOString();
  const shots: CapturedShot[] = [];
  let rawVideoPath: string | null = null;

  try {
    for (const item of flattenShots(storyboard)) {
      const shotStartedAt = new Date().toISOString();
      const prepareStartedAt = Date.now();
      let screenshotPath: string | null = null;
      try {
        screenshotPath = await executeShot(page, item.shot, paths);
      } catch (error) {
        const failurePath = await captureFailure(page, item.shot, paths);
        throw new Error(`Shot failed: ${item.shot.id}${failurePath ? ` (failure screenshot: ${failurePath})` : ""}`, { cause: error });
      }

      if (!screenshotPath) screenshotPath = await captureShot(page, item.shot, paths, null);
      const preparedAt = new Date().toISOString();
      const voiceoverDurationMs = findVoiceoverDuration(options.voiceover, item.shot.id);
      await wait(voiceoverDurationMs + getShotHoldMs(storyboard, item.shot) + storyboard.timing.transitionBufferMs);
      const completedAt = new Date().toISOString();

      shots.push({
        shotId: item.shot.id,
        sceneId: item.scene.id,
        title: shotDisplayTitle(item.shot),
        screenshotPath,
        rawVideoPath: null,
        startedAt: shotStartedAt,
        preparedAt,
        completedAt,
        preparationDurationMs: Date.now() - prepareStartedAt,
        voiceoverDurationMs,
        voiceoverStartOffsetMs: new Date(preparedAt).getTime() - new Date(startedAt).getTime(),
        plannedHoldMs: getShotHoldMs(storyboard, item.shot),
      });
    }
  } finally {
    await context.close();
    const pageVideo = page.video();
    rawVideoPath = pageVideo ? await pageVideo.path().catch(() => null) : null;
    await browser.close();
  }

  return {
    rig: "playwright",
    startedAt,
    completedAt: new Date().toISOString(),
    rawVideoPath,
    shots: shots.map((shot) => ({ ...shot, rawVideoPath })),
  };
}

export function buildChromiumLaunchArgs(storyboard: Storyboard): string[] {
  const browserWindow = storyboard.browser.window;
  if (!browserWindow) return [];
  return [
    `--window-position=${browserWindow.x},${browserWindow.y}`,
    `--window-size=${browserWindow.width},${browserWindow.height}`,
  ];
}

async function createContext(browser: Browser, storyboard: Storyboard, paths: ProductionPaths, dryRun: boolean): Promise<BrowserContext> {
  const recordVideo = storyboard.camera.type === "playwright" && storyboard.camera.recordVideo && !dryRun
    ? { dir: paths.rawVideoDir, size: storyboard.browser.viewport }
    : undefined;
  return browser.newContext({ viewport: storyboard.browser.viewport, recordVideo });
}

async function executeShot(page: Page, shot: Shot, paths: ProductionPaths): Promise<string | null> {
  let screenshotPath: string | null = null;
  for (const direction of shot.stageDirections) {
    const captured = await executeStageDirection(page, shot, direction, paths);
    screenshotPath = captured ?? screenshotPath;
  }
  return screenshotPath;
}

async function executeStageDirection(
  page: Page,
  shot: Shot,
  direction: StageDirection,
  paths: ProductionPaths,
): Promise<string | null> {
  switch (direction.type) {
    case "goto":
      await gotoWithRetries(page, shot.id, direction.url);
      return null;
    case "waitForText":
      await waitForVisibleText(page, shot.id, direction.text, direction.timeoutMs);
      return null;
    case "waitForSelector":
      await page.locator(direction.selector).first().waitFor({ state: "visible", timeout: direction.timeoutMs });
      return null;
    case "click":
      await page.locator(direction.selector).first().click({ timeout: direction.timeoutMs });
      return null;
    case "clickLink":
      await clickVisibleLink(page, shot.id, direction);
      return null;
    case "fill":
      await page.locator(direction.selector).first().fill(direction.value, { timeout: direction.timeoutMs });
      return null;
    case "press":
      if (direction.selector) {
        await page.locator(direction.selector).first().press(direction.key, { timeout: direction.timeoutMs });
      } else {
        await page.keyboard.press(direction.key);
      }
      return null;
    case "wait":
      await wait(direction.ms);
      return null;
    case "capture":
      return captureShot(page, shot, paths, direction.name ?? null, direction.fullPage);
    default: {
      const exhaustive: never = direction;
      throw new Error(`Unsupported stage direction: ${JSON.stringify(exhaustive)}`);
    }
  }
}

async function captureShot(page: Page, shot: Shot, paths: ProductionPaths, name: string | null, fullPage = true): Promise<string> {
  await fs.mkdir(paths.screenshotDir, { recursive: true });
  const screenshotPath = path.join(paths.screenshotDir, `${safeName(name ?? shot.id)}.png`);
  await page.screenshot({ path: screenshotPath, fullPage });
  return screenshotPath;
}

async function captureFailure(page: Page, shot: Shot, paths: ProductionPaths): Promise<string | null> {
  const screenshotPath = path.join(paths.screenshotDir, `${safeName(shot.id)}-failure.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined);
  return screenshotPath;
}

async function gotoWithRetries(page: Page, shotId: string, url: string): Promise<void> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= NavigationAttempts; attempt += 1) {
    try {
      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
      if (!response || response.ok()) return;
      if (!isRetryableResponse(response) || attempt === NavigationAttempts) {
        throw new Error(`Navigation failed for ${shotId}: ${response.status()} ${response.statusText()}`);
      }
      lastError = new Error(`Retryable navigation response for ${shotId}: ${response.status()} ${response.statusText()}`);
    } catch (error) {
      lastError = error;
      if (attempt === NavigationAttempts) break;
    }
    await page.goto("about:blank").catch(() => undefined);
    await wait(NavigationRetryDelayMs);
  }
  throw new Error(`Navigation failed for ${shotId} after ${NavigationAttempts} attempt(s)`, { cause: lastError });
}

async function waitForVisibleText(page: Page, shotId: string, text: string, timeoutMs: number): Promise<void> {
  try {
    await page.waitForFunction(
      (expected) => document.body?.innerText.toLowerCase().includes(expected.toLowerCase()),
      text,
      { timeout: timeoutMs },
    );
  } catch (error) {
    const bodyText = await page.locator("body").innerText({ timeout: 1000 }).catch(() => "");
    const sample = bodyText.replace(/\s+/g, " ").slice(0, 700);
    throw new Error(`Shot "${shotId}" timed out waiting for text "${text}" at ${page.url()}. Visible text sample: ${sample}`, {
      cause: error,
    });
  }
}

async function clickVisibleLink(
  page: Page,
  shotId: string,
  direction: Extract<StageDirection, { readonly type: "clickLink" }>,
): Promise<void> {
  const links = page.locator("a");
  const count = await links.count();
  for (let index = 0; index < count; index += 1) {
    const link = links.nth(index);
    if (!(await linkMatches(link, direction))) continue;
    if (await link.isVisible().catch(() => false)) {
      await link.click({ timeout: direction.timeoutMs });
      return;
    }
  }
  throw new Error(`Shot "${shotId}" could not find a visible link matching the requested clickLink direction`);
}

async function linkMatches(link: Locator, direction: Extract<StageDirection, { readonly type: "clickLink" }>): Promise<boolean> {
  const textOk = direction.text ? (await link.innerText().catch(() => "")).includes(direction.text) : true;
  const hrefOk = direction.hrefIncludes
    ? (await link.getAttribute("href").catch(() => null))?.includes(direction.hrefIncludes) ?? false
    : true;
  return textOk && hrefOk;
}

function findVoiceoverDuration(voiceover: VoiceoverManifest | undefined, shotId: string): number {
  return voiceover?.clips.find((clip) => clip.shotId === shotId)?.durationMs ?? 0;
}

function findFirstGotoUrl(storyboard: Storyboard): string | null {
  return flattenShots(storyboard)
    .flatMap(({ shot }) => shot.stageDirections)
    .find((direction): direction is Extract<StageDirection, { readonly type: "goto" }> => direction.type === "goto")?.url ?? null;
}

function isRetryableResponse(response: Response): boolean {
  return response.status() >= 500;
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
