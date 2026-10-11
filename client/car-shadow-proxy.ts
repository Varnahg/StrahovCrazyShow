import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Scene } from "@babylonjs/core/scene";

type SourcePart = { key: string; wheel?: number; source: Mesh };
type ProxyRig = {
  proxies: InstancedMesh[];
  visibleParts: InstancedMesh[];
};

/** Solar shadow geometry for the low render budget. The near/medium/far visible
 * meshes remain untouched. Five shared far-geometry groups retain the body and
 * four independent wheel pivots, without paint variants or transparent panes.
 * layerMask=0 excludes the proxies from every normal camera; Babylon's explicit
 * shadow renderList (forceLayerMaskCheck=false) still dispatches them.
 */
export class CarShadowProxyPack {
  private templates = new Map<number | undefined, Mesh>();
  private material: StandardMaterial;
  private rigs = new Set<ProxyRig>();
  private enabled = false;
  private disposed = false;

  constructor(
    scene: Scene,
    parts: Iterable<SourcePart>,
    parent: TransformNode,
  ) {
    const groups = new Map<
      number | undefined,
      { positions: number[]; normals: number[]; indices: number[] }
    >();
    for (const { source, wheel } of parts) {
      const material = source.material;
      if (
        !material ||
        material.alpha < 0.98 ||
        material.disableDepthWrite ||
        material.needAlphaBlendingForMesh(source) ||
        material.needAlphaTestingForMesh(source)
      )
        continue;
      const positions = source.getVerticesData("position"),
        normals = source.getVerticesData("normal"),
        indices = source.getIndices();
      if (!positions || !normals || !indices) continue;
      const group = groups.get(wheel) ?? {
        positions: [],
        normals: [],
        indices: [],
      };
      const offset = group.positions.length / 3;
      group.positions.push(...positions);
      group.normals.push(...normals);
      for (const index of indices) group.indices.push(offset + index);
      groups.set(wheel, group);
    }
    if (
      groups.size !== 5 ||
      ![undefined, 0, 1, 2, 3].every((wheel) => groups.has(wheel))
    )
      throw new Error("Car shadow proxy requires a body and four wheel groups");
    this.material = new StandardMaterial("shared opaque car shadow", scene);
    this.material.backFaceCulling = true;
    this.material.metadata = {
      shadowProxy: true,
      untexturedDepthOnlyUse: true,
    };
    for (const [wheel, group] of groups) {
      const mesh = new Mesh(
        "car shadow template:" +
          (wheel === undefined ? "body" : "wheel" + wheel),
        scene,
      );
      const data = new VertexData();
      Object.assign(data, group);
      data.applyToMesh(mesh);
      mesh.material = this.material;
      mesh.parent = parent;
      mesh.isVisible = false;
      mesh.isPickable = false;
      mesh.layerMask = 0;
      // Babylon instances inherit this property from their source mesh. Keep
      // the template and metadata aligned before Cinematic selects casters.
      mesh.receiveShadows = false;
      mesh.metadata = {
        kind: "asset-template",
        assetId: parent.metadata?.assetId,
        shadowProxy: true,
        sourceLod: "far",
        wheelIndex: wheel,
        depthCaster: false,
        receiveShadows: false,
      };
      this.templates.set(wheel, mesh);
    }
  }

  setEnabled(enabled: boolean) {
    if (this.disposed || enabled === this.enabled) return;
    this.enabled = enabled;
    for (const rig of this.rigs) this.apply(rig);
  }

  private apply(rig: ProxyRig) {
    for (const mesh of rig.visibleParts)
      mesh.metadata.shadowCaster = !this.enabled;
    for (const proxy of rig.proxies) proxy.setEnabled(this.enabled);
  }

  createRig(
    entityId: string,
    root: TransformNode,
    wheels: readonly TransformNode[],
    visibleParts: InstancedMesh[],
  ) {
    if (this.disposed) throw new Error("Car shadow proxy pack is disposed");
    const rig: ProxyRig = { proxies: [], visibleParts };
    for (const [wheel, template] of this.templates) {
      const proxy = template.createInstance(
        entityId +
          ":shadow:" +
          (wheel === undefined ? "body" : "wheel" + wheel),
      );
      proxy.parent = wheel === undefined ? root : wheels[wheel];
      proxy.isVisible = true;
      proxy.isPickable = false;
      proxy.layerMask = 0;
      proxy.metadata = {
        kind: "vehicle-shadow-proxy",
        assetId: root.metadata?.assetId,
        entityId,
        shadowProxy: true,
        sourceLod: "far",
        wheelIndex: wheel,
        depthCaster: "opaque",
        shadowCaster: true,
        receiveShadows: false,
      };
      rig.proxies.push(proxy);
    }
    this.rigs.add(rig);
    this.apply(rig);
    let disposed = false;
    return {
      dispose: () => {
        if (disposed) return;
        disposed = true;
        this.rigs.delete(rig);
        for (const proxy of rig.proxies) proxy.dispose(false, false);
      },
    };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const rig of this.rigs)
      for (const proxy of rig.proxies) proxy.dispose(false, false);
    this.rigs.clear();
    for (const template of this.templates.values())
      template.dispose(false, false);
    this.templates.clear();
    this.material.dispose(false, false);
  }
}
