import type { Scene } from "@babylonjs/core/scene";

/** On-demand asset inventory, captured with a real rendered benchmark. This
 * never runs per frame and does not expose account or multiplayer profiles. */
export function captureModelReview(scene: Scene) {
  return scene.meshes
    .filter((mesh) => !mesh.isDisposed() && mesh.getTotalVertices())
    .map((mesh) => {
      mesh.computeWorldMatrix(true);
      const box = mesh.getBoundingInfo().boundingBox;
      const material = mesh.material as any;
      let root = mesh.parent;
      while (
        root?.parent &&
        !root.metadata?.worldAsset &&
        !root.metadata?.entityId &&
        !root.metadata?.sourceTreeId
      )
        root = root.parent;
      return {
        name: mesh.name,
        root: root?.name ?? null,
        identity:
          root?.metadata?.key ??
          root?.metadata?.entityId ??
          root?.metadata?.sourceTreeId ??
          null,
        enabled: mesh.isEnabled(),
        visible: mesh.isVisible,
        triangles: mesh.getTotalIndices() / 3,
        worldBounds: {
          min: box.minimumWorld.asArray(),
          max: box.maximumWorld.asArray(),
        },
        material: material
          ? {
              name: material.name,
              color: (material.albedoColor ?? material.diffuseColor)?.asArray(),
              albedo:
                (material.albedoTexture ?? material.diffuseTexture)?.url ??
                null,
              normal: material.bumpTexture?.url ?? null,
            }
          : null,
        sourcePack: mesh.metadata?.sourcePack ?? null,
      };
    });
}
