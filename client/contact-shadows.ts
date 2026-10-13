import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import type { Scene } from "@babylonjs/core/scene";
import type { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import type { Vec3 } from "../shared/types";
import { groundHeight } from "../shared/terrain";
import { groundRotation } from "../shared/terrain-entities";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { writeQuaternion, writeVector3 } from "./transform-updates";
type ContactInstance = {
  mesh: InstancedMesh;
  rotation: Quaternion;
  pose?: {
    x: number;
    y: number;
    z: number;
    width: number;
    depth: number;
    yaw: number;
  };
};
/** Shared soft contact occlusion. An inexpensive approximation, not cast sun shadows. */
export class ContactShadows {
  private source;
  private material;
  private texture;
  private instances = new Map<string, ContactInstance>();
  private readonly up = Vector3.Up();
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
    let entry = this.instances.get(id);
    // Distant/hidden avatars need neither a mesh nor terrain slope queries.
    // Retain the last visible pose so showing it again recomputes any movement.
    if (!visible) {
      entry?.mesh.setEnabled(false);
      return;
    }
    if (!entry) {
      const instance = this.source.createInstance("contact " + id);
      instance.isVisible = true;
      instance.isPickable = false;
      instance.metadata = { depthCaster: false };
      entry = { mesh: instance, rotation: Quaternion.Identity() };
      this.instances.set(id, entry);
    }
    const instance = entry.mesh,
      pose = entry.pose;
    if (
      !pose ||
      !Object.is(pose.x, feet.x) ||
      !Object.is(pose.y, feet.y) ||
      !Object.is(pose.z, feet.z) ||
      !Object.is(pose.width, width) ||
      !Object.is(pose.depth, depth) ||
      !Object.is(pose.yaw, yaw)
    ) {
      if (Math.abs(feet.y - groundHeight(feet.x, feet.z)) < 0.25) {
        const q = groundRotation(feet.x, feet.z, yaw, depth, width);
        entry.rotation.copyFromFloats(q.x, q.y, q.z, q.w);
      } else Quaternion.RotationAxisToRef(this.up, yaw, entry.rotation);
      const next =
        pose ?? (entry.pose = { x: 0, y: 0, z: 0, width: 0, depth: 0, yaw: 0 });
      next.x = feet.x;
      next.y = feet.y;
      next.z = feet.z;
      next.width = width;
      next.depth = depth;
      next.yaw = yaw;
    }
    writeVector3(instance.position, feet.x, feet.y + 0.006, feet.z);
    writeVector3(instance.scaling, width, 1, depth);
    writeQuaternion(instance, entry.rotation);
    instance.setEnabled(visible);
  }
  remove(id: string) {
    this.instances.get(id)?.mesh.dispose();
    this.instances.delete(id);
  }
  dispose() {
    for (const entry of this.instances.values()) entry.mesh.dispose();
    this.instances.clear();
    this.source.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}
