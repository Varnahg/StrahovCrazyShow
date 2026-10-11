import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import type { Scene } from "@babylonjs/core/scene";
import type { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import type { Vec3 } from "../shared/types";
import { groundHeight } from "../shared/terrain";
import { groundRotation } from "../shared/terrain-entities";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
/** Shared soft contact occlusion. An inexpensive approximation, not cast sun shadows. */
export class ContactShadows {
  private source;
  private material;
  private texture;
  private instances = new Map<string, InstancedMesh>();
  constructor(scene: Scene) {
    const pixels = new Uint8Array(64 * 64 * 4);
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++) {
        const r = Math.hypot((x - 31.5) / 31.5, (y - 31.5) / 31.5);
        pixels[(y * 64 + x) * 4 + 3] =
          r < 1 ? Math.round(Math.exp(-r * r * 4) * 90 * (1 - r * r)) : 0;
      }
    this.texture = RawTexture.CreateRGBATexture(
      pixels,
      64,
      64,
      scene,
      true,
      false,
    );
    this.texture.hasAlpha = true;
    this.material = new StandardMaterial("soft contact occlusion", scene);
    this.material.diffuseTexture = this.texture;
    this.material.useAlphaFromDiffuseTexture = true;
    this.material.disableLighting = true;
    this.material.diffuseColor.setAll(0);
    this.material.emissiveColor.setAll(0);
    this.material.disableDepthWrite = true;
    this.material.zOffset = -4;
    this.material.zOffsetUnits = -4;
    this.material.backFaceCulling = false;
    this.source = MeshBuilder.CreateGround(
      "contact source",
      { width: 1, height: 1 },
      scene,
    );
    this.source.material = this.material;
    this.source.isVisible = false;
    this.source.isPickable = false;
    this.source.metadata = { depthCaster: false };
  }
  set(
    id: string,
    feet: Vec3,
    width: number,
    depth: number,
    yaw: number,
    visible = true,
  ) {
    let instance = this.instances.get(id);
    if (!instance) {
      instance = this.source.createInstance("contact " + id);
      instance.isVisible = true;
      instance.isPickable = false;
      instance.metadata = { depthCaster: false };
      this.instances.set(id, instance);
    }
    instance.position.set(feet.x, feet.y + 0.006, feet.z);
    instance.scaling.set(width, 1, depth);
    if (Math.abs(feet.y - groundHeight(feet.x, feet.z)) < 0.25) {
      const q = groundRotation(feet.x, feet.z, yaw, depth, width);
      instance.rotationQuaternion = new Quaternion(q.x, q.y, q.z, q.w);
    } else
      instance.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), yaw);
    instance.setEnabled(visible);
  }
  remove(id: string) {
    this.instances.get(id)?.dispose();
    this.instances.delete(id);
  }
  dispose() {
    for (const instance of this.instances.values()) instance.dispose();
    this.instances.clear();
    this.source.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}
