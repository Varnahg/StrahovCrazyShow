import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Frustum } from "@babylonjs/core/Maths/math.frustum";
import { Matrix } from "@babylonjs/core/Maths/math.vector";
import type { Plane } from "@babylonjs/core/Maths/math.plane";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";

type Point = { x: number; y: number; z: number };
type BoundsTest = (
  min: Point,
  max: Point,
  planes: readonly Plane[],
  padding: number,
) => boolean;

/** Explicit shadow render lists do not perform Scene's SubMesh frustum test.
 * Filter only our tagged, noninstanced static chunks. All other caster/wind/LOD
 * behavior and any preexisting callback remain exactly the producer's policy.
 */
export function installStaticSubmeshShadowCull(
  generator: ShadowGenerator,
  boundsTest: BoundsTest,
  padding: number,
) {
  const previous = generator.customAllowRendering;
  const planes = Frustum.GetPlanes(Matrix.Identity());
  const scene = generator.getLight().getScene();
  let renderId = -1,
    updateFlag = -1;
  generator.customAllowRendering = (sub) => {
    const allowed = previous ? previous(sub) : true;
    if (!allowed) return allowed;
    const mesh = sub.getRenderingMesh();
    if (
      !(mesh instanceof Mesh) ||
      mesh.metadata?.exactStaticSubmeshes !== true ||
      mesh.hasInstances ||
      mesh.hasThinInstances
    )
      return allowed;
    const matrix = generator.getTransformMatrix();
    if (renderId !== scene.getRenderId() || updateFlag !== matrix.updateFlag) {
      Frustum.GetPlanesToRef(matrix, planes);
      renderId = scene.getRenderId();
      updateFlag = matrix.updateFlag;
    }
    const box = sub.getBoundingInfo().boundingBox;
    return boundsTest(box.minimumWorld, box.maximumWorld, planes, padding);
  };
}
