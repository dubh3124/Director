import type { ProductionPaths, Shot, Storyboard, StoryboardShot } from "./storyboard.js";

export type CameraRigKind = "playwright" | "obs";

export type ShotPreparation = {
  readonly shot: StoryboardShot;
  readonly preparedAt: string;
  readonly preparationDurationMs: number;
};

export type CapturedShot = {
  readonly shotId: string;
  readonly sceneId: string;
  readonly title: string;
  readonly screenshotPath: string | null;
  readonly rawVideoPath: string | null;
  readonly startedAt: string;
  readonly preparedAt: string;
  readonly completedAt: string;
  readonly preparationDurationMs: number;
  readonly voiceoverDurationMs: number;
  readonly voiceoverStartOffsetMs: number | null;
  readonly plannedHoldMs: number;
};

export type ShootResult = {
  readonly rig: CameraRigKind;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly rawVideoPath: string | null;
  readonly shots: readonly CapturedShot[];
};

export type CameraRig = {
  readonly kind: CameraRigKind;
  readonly check: (storyboard: Storyboard, paths: ProductionPaths) => Promise<void>;
  readonly shoot: (
    storyboard: Storyboard,
    paths: ProductionPaths,
    options: ShootOptions,
  ) => Promise<ShootResult>;
};

export type ShootOptions = {
  readonly dryRun?: boolean;
  readonly requireApproval?: boolean;
  readonly voiceover?: VoiceoverManifest;
};

export type VoiceoverClip = {
  readonly shotId: string;
  readonly index: number;
  readonly text: string;
  readonly audioPath: string;
  readonly durationMs: number;
  readonly provider: string;
  readonly voiceId: string | null;
  readonly modelId: string | null;
};

export type VoiceoverManifest = {
  readonly storyboardTitle: string;
  readonly generatedAt: string;
  readonly clips: readonly VoiceoverClip[];
};

export type VoiceoverProvider = {
  readonly provider: string;
  readonly check: (storyboard: Storyboard) => Promise<void>;
  readonly generate: (storyboard: Storyboard, paths: ProductionPaths) => Promise<VoiceoverManifest>;
};

export type EditorProvider = {
  readonly renderFinalCut: (
    storyboard: Storyboard,
    paths: ProductionPaths,
    shoot: ShootResult,
    voiceover: VoiceoverManifest,
  ) => Promise<string>;
};

export type DeckProducer = {
  readonly renderPitchDeck: (
    storyboard: Storyboard,
    paths: ProductionPaths,
    shoot: ShootResult,
  ) => Promise<string>;
};

export type ScoutReport = {
  readonly url: string;
  readonly title: string;
  readonly capturedAt: string;
  readonly screenshotPath: string;
  readonly visibleTextSample: string;
  readonly links: readonly ScoutLink[];
};

export type ScoutLink = {
  readonly text: string;
  readonly href: string;
};

export type DraftStoryboardInput = {
  readonly title: string;
  readonly appUrl: string;
  readonly brief?: string;
  readonly outputDir?: string;
};

export type StoryboardPlanner = {
  readonly draftStoryboard: (input: DraftStoryboardInput) => Promise<Storyboard>;
};

export type CheckResult = {
  readonly storyboardTitle: string;
  readonly cameraRig: CameraRigKind;
  readonly shotCount: number;
  readonly sceneCount: number;
};

export function shotDisplayTitle(shot: Shot): string {
  return shot.title ?? shot.id;
}
