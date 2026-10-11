import { Vector3, Matrix } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import type { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import type { Engine } from "@babylonjs/core/Engines/engine";
import type { Vec3 } from "../shared/types";
/** Nearby landmarks belong on the minimap. Separate entry/exit distances keep
 * their distant signs stable while walking along the threshold. */
export function landmarkLabelInRange(
  distanceSquared: number,
  wasInRange: boolean,
  indoor = false,
) {
  const min = indoor ? 0 : wasInRange ? 34 : 42,
    max = (indoor ? 45 : 180) * (wasInRange ? 1.1 : 1);
  return distanceSquared >= min * min && distanceSquared < max * max;
}
type Label = {
  id: string;
  text: string;
  point: Vector3;
  projected: Vector3;
  element: HTMLSpanElement;
  player: boolean;
  visible: boolean;
  candidate: boolean;
  changedAt: number;
  occluded: boolean;
  lastOcclusion: number;
  screenX: number;
  screenY: number;
  inRange: boolean;
  eligible: boolean;
  selected: boolean;
  distanceSquared: number;
};
/** Screen-space text uses exactly the camera transform of the rendered frame. */
export class ScreenLabels {
  entries = new Map<string, Label>();
  private identity = Matrix.Identity();
  readonly stats = { projections: 0, losCasts: 0 };
  constructor(
    public container: HTMLElement,
    public scene: Scene,
    public camera: UniversalCamera,
    public engine: Engine,
  ) {}
  set(id: string, text: string, point: Vec3, player = false) {
    let label = this.entries.get(id);
    if (!label) {
      const element = document.createElement("span");
      element.className = player
        ? "world-label player-label"
        : "world-label place-label";
      element.dataset.labelId = id;
      element.textContent = text;
      // Creating a label between frames must never flash it at the top left.
      element.style.display = "none";
      this.container.append(element);
      label = {
        id,
        text,
        point: new Vector3(point.x, point.y, point.z),
        projected: Vector3.Zero(),
        element,
        player,
        visible: false,
        candidate: false,
        changedAt: 0,
        occluded: true,
        lastOcclusion: -Infinity,
        screenX: NaN,
        screenY: NaN,
        inRange: false,
        eligible: false,
        selected: false,
        distanceSquared: Infinity,
      };
      this.entries.set(id, label);
    }
    if (label.text !== text) {
      label.text = text;
      label.element.textContent = text;
    }
    label.point.set(point.x, point.y, point.z);
  }
  remove(id: string) {
    this.entries.get(id)?.element.remove();
    this.entries.delete(id);
  }
  render(
    local: Vec3,
    visible: (point: Vec3) => boolean,
    now = performance.now(),
  ) {
    this.stats.projections = this.stats.losCasts = 0;
    const width = this.engine.getRenderWidth(),
      height = this.engine.getRenderHeight(),
      viewport = this.camera.viewport.toGlobal(width, height),
      matrix = this.scene.getTransformMatrix();
    const cssWidth = this.container.clientWidth,
      cssHeight = this.container.clientHeight;
    if (width <= 0 || height <= 0 || cssWidth <= 0 || cssHeight <= 0) {
      for (const label of this.entries.values()) {
        label.visible = false;
        label.candidate = false;
        label.selected = false;
        label.element.style.display = "none";
      }
      return;
    }

    const candidates: Label[] = [];
    for (const label of this.entries.values()) {
      const dx = label.point.x - local.x,
        dy = label.point.y - local.y,
        dz = label.point.z - local.z;
      const indoor = label.text.match(/^(\d+) NP$/),
        inside = local.x > -8 && local.x < 17 && local.z > -91 && local.z < -19;
      label.distanceSquared = dx * dx + dz * dz + (label.player ? dy * dy : 0);
      const range = 45 * (label.inRange ? 1.1 : 1);
      label.inRange = label.player
        ? label.distanceSquared < range * range
        : landmarkLabelInRange(label.distanceSquared, label.inRange, !!indoor);
      // Select after projection: people behind the camera cannot consume all
      // name slots and make nearby visible people's names disappear.
      const wasEligible = label.eligible;
      label.eligible =
        label.inRange &&
        (!indoor || (inside && Math.abs(Number(indoor[1]) * 3 - local.y) < 3));
      // Range/floor checks are camera-independent. Do not project every remote
      // landmark or off-floor room sign only to discard the result immediately.
      if (!label.eligible) continue;
      Vector3.ProjectToRef(
        label.point,
        this.identity,
        matrix,
        viewport,
        label.projected,
      );
      this.stats.projections++;
      const projected = label.projected;
      label.eligible =
        Number.isFinite(projected.x) &&
        Number.isFinite(projected.y) &&
        projected.z > 0 &&
        projected.z < 1 &&
        projected.x > (-32 * width) / cssWidth &&
        projected.x < width + (32 * width) / cssWidth &&
        projected.y > (-32 * height) / cssHeight &&
        projected.y < height + (32 * height) / cssHeight;
      if (label.eligible && !wasEligible) {
        label.occluded = true;
        label.lastOcclusion = -Infinity;
      }
      if (label.eligible) candidates.push(label);
    }

    candidates.sort((a, b) => {
      // Existing selection has a 13% distance advantage. Similar distances
      // cannot exchange slots every frame when a dense crowd moves slightly.
      const difference =
        a.distanceSquared * (a.selected ? 0.75 : 1) -
        b.distanceSquared * (b.selected ? 0.75 : 1);
      return difference || a.id.localeCompare(b.id);
    });
    // Oldest overdue LOS first also avoids starving a visible person behind a
    // large nearer group that is occluded by a wall. Bound each frame to four
    // casts rather than doing all 100 when they enter the frustum together.
    const overdue = candidates
      .filter(
        (label) => now - label.lastOcclusion >= (label.visible ? 100 : 300),
      )
      .sort((a, b) => {
        const dueA = a.lastOcclusion + (a.visible ? 100 : 300);
        const dueB = b.lastOcclusion + (b.visible ? 100 : 300);
        return dueA === dueB ? 0 : dueA - dueB;
      });
    for (let i = 0; i < Math.min(4, overdue.length); i++) {
      const label = overdue[i];
      this.stats.losCasts++;
      label.occluded = !visible(label.point);
      label.lastOcclusion = now;
    }

    const selected = new Set<string>();
    const placeRectangles: Array<{ x: number; y: number; width: number }> = [];
    let playerCount = 0,
      placeCount = 0;
    for (const label of candidates) {
      if (label.player ? playerCount >= 16 : placeCount >= 8) continue;
      if (label.occluded) continue;
      if (!label.player) {
        const rectangle = {
          x: (label.projected.x / width) * cssWidth,
          y: (label.projected.y / height) * cssHeight,
          width: Math.max(55, label.text.length * 7 + 18),
        };
        // Avoid stacked place names. Cached text length avoids measuring DOM
        // layout in a render loop; player names keep their independent budget.
        if (
          placeRectangles.some(
            (r) =>
              Math.abs(r.y - rectangle.y) < 30 &&
              Math.abs(r.x - rectangle.x) < (r.width + rectangle.width) / 2 + 6,
          )
        )
          continue;
        placeRectangles.push(rectangle);
      }
      selected.add(label.id);
      if (label.player) playerCount++;
      else placeCount++;
    }

    for (const label of this.entries.values()) {
      const show = selected.has(label.id);
      label.selected = show;
      if (show !== label.candidate) {
        label.candidate = show;
        label.changedAt = now;
      }
      const previouslyVisible = label.visible;
      if (!label.eligible) label.visible = false;
      else if (now - label.changedAt >= (show ? 80 : 140)) label.visible = show;
      if (previouslyVisible !== label.visible)
        label.element.style.display = label.visible ? "block" : "none";
      if (label.visible) {
        const x = (label.projected.x / width) * cssWidth,
          y = (label.projected.y / height) * cssHeight;
        if (
          !Number.isFinite(label.screenX) ||
          (x - label.screenX) ** 2 + (y - label.screenY) ** 2 > 0.01
        ) {
          label.screenX = x;
          label.screenY = y;
          label.element.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) translate(-50%,-100%)`;
        }
      }
    }
  }
  dispose() {
    for (const entry of this.entries.values()) entry.element.remove();
    this.entries.clear();
  }
}
