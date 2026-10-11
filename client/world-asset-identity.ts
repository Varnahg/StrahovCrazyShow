import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import type { WorldAssetIdentity } from "../shared/world-asset-identity";

/** One editable pivot per mapped object. Components of the same building share
 * it even when facade, porch and roof have different materials or generators. */
export function getWorldAssetRoot(
  scene: Scene,
  identity: WorldAssetIdentity,
  origin: { x: number; y: number; z: number },
) {
  const name = `world-asset:${identity.key}`;
  const existing = scene.getTransformNodeByName(name);
  if (existing) return existing;
  const root = new TransformNode(name, scene);
  root.position.set(origin.x, origin.y, origin.z);
  root.metadata = {
    worldAsset: true,
    ...identity,
    sourceOrigin: { ...origin },
  };
  root.computeWorldMatrix(true);
  return root;
}

/** setParent preserves the existing world transform, including oriented boxes.
 * Do not freeze the child matrix: changing this object's pivot must move only
 * its own facade, stairs and roof, rather than leave frozen components behind. */
export function attachWorldAssetNode<T extends TransformNode>(
  node: T,
  root: TransformNode,
): T {
  node.unfreezeWorldMatrix();
  node.computeWorldMatrix(true);
  node.setParent(root);
  node.computeWorldMatrix(true);
  node.metadata = {
    ...node.metadata,
    assetKey: root.metadata.key,
    sourceId: root.metadata.sourceId,
  };
  return node;
}

/** A facade and its porch can be disposed separately without deleting each
 * other's meshes. Empty roots are removed after the final component leaves. */
export function disposeEmptyWorldAssetRoots(roots: Iterable<TransformNode>) {
  for (const root of roots)
    if (!root.isDisposed() && !root.getChildren().length) root.dispose();
}
