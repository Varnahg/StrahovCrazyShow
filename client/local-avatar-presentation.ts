import type { Vec3 } from "../shared/types";

export type LocalAvatarView = {
  camera: Vec3;
  feet: Vec3;
  bodyHeight: number;
  bodyWidthScale: number;
  nearPlane: number;
  firstPerson: boolean;
  vehicle: boolean;
};

/** Presentation envelope, not a world collider. A collision-safe third-person
 * camera can still be pushed inside its own character by a nearby wall/car.
 * Keep the saved camera mode and collision solve independent of that overlap. */
export class LocalAvatarPresentation {
  readonly state = {
    visible: true,
    obstructed: false,
    cameraLight: false,
    resetAnimation: false,
  };

  update(view: LocalAvatarView) {
    const state = this.state;
    const previouslyVisible = state.visible;
    if (view.vehicle || view.firstPerson) state.obstructed = false;
    else {
      // Covers torso, head and close limbs for the authored builds. Include
      // the near plane so the model disappears before the lens clips its skin.
      // The extra exit margin prevents visibility/cache churn at the boundary.
      const radius = 0.55 * view.bodyWidthScale + view.nearPlane;
      const threshold = radius + (state.obstructed ? 0.25 : 0);
      const lower = view.feet.y + 0.25;
      const upper = view.feet.y + Math.max(0.25, view.bodyHeight - 0.25);
      const nearestY = Math.max(lower, Math.min(upper, view.camera.y));
      const dx = view.camera.x - view.feet.x;
      const dy = view.camera.y - nearestY;
      const dz = view.camera.z - view.feet.z;
      state.obstructed = dx * dx + dy * dy + dz * dz < threshold * threshold;
    }
    state.visible = !view.vehicle && !view.firstPerson && !state.obstructed;
    state.cameraLight = !view.vehicle && !state.visible;
    // Hidden LOD skips animation. Rebase contacts once when the model returns,
    // rather than interpreting all movement while hidden as one gait step.
    state.resetAnimation = !previouslyVisible && state.visible;
    return state;
  }
}
