import sourcePlan from "./data/b4-facade-plan.json";

export type B4FacadeOpening = {
  u: number;
  v: number;
  w: number;
  h: number;
  panes: number;
  style: "small" | "stair";
};
type SourceFace = (typeof sourcePlan.faces)[number];
export type B4FacadeFace = Omit<SourceFace, "openings" | "material"> & {
  material: "greyPanel";
  openings: B4FacadeOpening[];
};
export const B4_FACADE_PLAN = sourcePlan as Omit<typeof sourcePlan, "faces"> & {
  faces: B4FacadeFace[];
};

export type B4FacadeEdge = {
  a: readonly number[];
  b: readonly number[];
};
export type B4FacadePlanMatch = B4FacadeFace & {
  /** Geometry remains authored in canonical anchor coordinates. Only the
   * opening list below follows the actual renderer edge direction. */
  reversed: boolean;
};

const samePoint = (a: readonly number[], b: readonly number[]) =>
  a.length === 2 &&
  b.length === 2 &&
  Math.hypot(a[0] - b[0], a[1] - b[1]) <= B4_FACADE_PLAN.anchorToleranceMetres;

/** Match exact source-backed OSM edges, never a generic direction or length.
 * This is a scene-construction helper: it returns owned opening objects, so
 * renderer filtering cannot mutate the shared source catalogue. */
export function b4FacadePlan(
  edge: B4FacadeEdge,
  height = B4_FACADE_PLAN.height,
): B4FacadePlanMatch | undefined {
  if (!Number.isFinite(height) || height <= 0) return undefined;
  for (const face of B4_FACADE_PLAN.faces) {
    const forward = samePoint(edge.a, face.anchor.a) && samePoint(edge.b, face.anchor.b);
    const reversed = !forward && samePoint(edge.a, face.anchor.b) && samePoint(edge.b, face.anchor.a);
    if (!forward && !reversed) continue;
    return {
      ...face,
      reversed,
      openings: face.openings
        .filter((opening) => opening.v + opening.h < height - 0.2)
        .map((opening) => ({
          ...opening,
          u: reversed ? face.width - opening.u - opening.w : opening.u,
        })),
    };
  }
  return undefined;
}
