import {
  buildOutdoorArtifactPlan,
  type OutdoorArtifactPlan,
} from "./outdoor-artifacts";
import { buildOutdoorLandmarkPlan } from "./outdoor-landmarks";

let cached: OutdoorArtifactPlan | undefined;
/** One immutable-by-convention source plan for the browser and authoritative physics.
 * Cache CPU geometry only; materials, meshes and Rapier handles remain scene-owned. */
export function buildOutdoorWorldPlan(): OutdoorArtifactPlan {
  if (cached) return cached;
  const plans = [buildOutdoorArtifactPlan(), buildOutdoorLandmarkPlan()];
  const parts = plans.flatMap((p) => p.parts);
  const colliders = plans.flatMap((p) => p.colliders);
  const artifacts = plans.flatMap((p) => [...p.artifacts]);
  const byKind: Record<string, number> = {};
  for (const artifact of artifacts)
    byKind[artifact.kind] = (byKind[artifact.kind] ?? 0) + 1;
  return (cached = {
    parts,
    colliders,
    artifacts,
    audit: plans.flatMap((p) => p.audit),
    stats: {
      artifactCount: artifacts.length,
      triangleCount: parts.reduce((n, p) => n + p.indices.length / 3, 0),
      colliderCount: colliders.length,
      byKind,
    },
  });
}
