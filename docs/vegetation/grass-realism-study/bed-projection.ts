import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Viewport } from "@babylonjs/core/Maths/math.viewport";

export const STUDY_BEDS = [
  { id: "baseline", point: new Vector3(-1.25, 0.015, -1.02) },
  { id: "candidate", point: new Vector3(1.25, 0.015, -1.02) },
] as const;
const identity = Matrix.Identity();
/** The actual rendered RH view decides left/right; labels never infer it from world X. */
export function projectStudyBeds(transform: Matrix, viewport: Viewport, output: Vector3[]) {
  for (let index = 0; index < STUDY_BEDS.length; index++)
    Vector3.ProjectToRef(STUDY_BEDS[index].point, identity, transform, viewport, output[index]);
  return output;
}
