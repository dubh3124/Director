import fs from "node:fs/promises";
import { createRequire } from "node:module";
import type { DeckProducer, ShootResult } from "./providers.js";
import type { ProductionPaths, Storyboard } from "./storyboard.js";

type Slide = {
  background?: { readonly color: string };
  readonly addText: (text: string, options: Record<string, unknown>) => void;
  readonly addImage: (options: Record<string, unknown>) => void;
  readonly addNotes: (notes: string) => void;
};

type Presentation = {
  layout: string;
  author: string;
  subject: string;
  title: string;
  company: string;
  lang: string;
  readonly addSlide: () => Slide;
  readonly writeFile: (options: { readonly fileName: string }) => Promise<unknown>;
};

type PptxConstructor = new () => Presentation;

const require = createRequire(import.meta.url);
const PptxGenJS = require("pptxgenjs") as PptxConstructor;

export function createPptxDeckProducer(): DeckProducer {
  return {
    renderPitchDeck: async (storyboard, paths, shoot) => {
      await fs.mkdir(paths.finalDir, { recursive: true });
      const pptx = new PptxGenJS();
      pptx.layout = "LAYOUT_WIDE";
      pptx.author = "Director";
      pptx.subject = storyboard.title;
      pptx.title = `${storyboard.title} Pitch Deck`;
      pptx.company = "Director";
      pptx.lang = "en-US";

      addTitleSlide(pptx, storyboard);
      for (const scene of storyboard.scenes) {
        addSceneSlide(pptx, scene.title ?? scene.id);
        for (const shot of scene.shots) {
          const captured = shoot.shots.find((candidate) => candidate.shotId === shot.id);
          addShotSlide(pptx, shot.title ?? shot.id, shot.voiceover ?? "", captured?.screenshotPath ?? null);
        }
      }

      await pptx.writeFile({ fileName: paths.pitchDeckPath });
      return paths.pitchDeckPath;
    },
  };
}

function addTitleSlide(pptx: Presentation, storyboard: Storyboard): void {
  const slide = pptx.addSlide();
  slide.background = { color: "111827" };
  slide.addText(storyboard.title, {
    x: 0.7,
    y: 2.1,
    w: 11.9,
    h: 0.9,
    fontFace: "Aptos Display",
    fontSize: 34,
    color: "F9FAFB",
    bold: true,
    margin: 0,
    breakLine: false,
  });
  slide.addText(storyboard.app.name ?? "Live application presentation", {
    x: 0.72,
    y: 3.05,
    w: 11.6,
    h: 0.35,
    fontFace: "Aptos",
    fontSize: 16,
    color: "CBD5E1",
    margin: 0,
  });
}

function addSceneSlide(pptx: Presentation, title: string): void {
  const slide = pptx.addSlide();
  slide.background = { color: "F8FAFC" };
  slide.addText(title, {
    x: 0.7,
    y: 2.75,
    w: 11.9,
    h: 0.65,
    fontFace: "Aptos Display",
    fontSize: 28,
    color: "111827",
    bold: true,
    margin: 0,
  });
}

function addShotSlide(pptx: Presentation, title: string, notes: string, screenshotPath: string | null): void {
  const slide = pptx.addSlide();
  slide.background = { color: "FFFFFF" };
  slide.addText(title, {
    x: 0.45,
    y: 0.25,
    w: 12.4,
    h: 0.35,
    fontFace: "Aptos Display",
    fontSize: 18,
    color: "111827",
    bold: true,
    margin: 0,
  });
  if (screenshotPath) {
    slide.addImage({ path: screenshotPath, x: 0.45, y: 0.78, w: 12.4, h: 6.05 });
  } else {
    slide.addText("No screenshot captured", {
      x: 0.45,
      y: 2.8,
      w: 12.4,
      h: 0.4,
      fontFace: "Aptos",
      fontSize: 16,
      color: "64748B",
      align: "center",
    });
  }
  if (notes) {
    slide.addNotes(notes);
  }
}
