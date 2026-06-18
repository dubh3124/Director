import { createObsCameraRig } from "./obs-rig.js";
import { createPlaywrightCameraRig } from "./playwright-rig.js";
import type { CameraRig } from "../providers.js";
import type { Storyboard } from "../storyboard.js";

export function createCameraRig(storyboard: Storyboard): CameraRig {
  switch (storyboard.camera.type) {
    case "playwright":
      return createPlaywrightCameraRig();
    case "obs":
      return createObsCameraRig();
    default: {
      const exhaustive: never = storyboard.camera;
      throw new Error(`Unsupported camera rig: ${JSON.stringify(exhaustive)}`);
    }
  }
}
