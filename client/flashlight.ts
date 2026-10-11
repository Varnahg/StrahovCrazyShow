import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import type { AvatarRig } from "./avatar-renderer";
import { VehicleLighting } from "./vehicle-lighting";

/** Small original game prop, not a surveyed object. Only the local torch casts
 * light; its shadow caster selection shares the existing car-light lifecycle. */
export class PlayerFlashlight {
  readonly beam: VehicleLighting;
  private body?: Mesh;
  private readonly casing: StandardMaterial;
  private readonly glass: StandardMaterial;
  private readonly grip = new Vector3(0, -0.275, 0.02);
  private readonly tip = new Vector3(0, -0.39, 0.02);
  private readonly axis = new Vector3(0, -1, 0);
  private readonly position = Vector3.Zero();
  private readonly direction = Vector3.Forward();
  private readonly cameraWorld = Matrix.Identity();
  private disposed = false;
  constructor(private readonly scene: Scene) {
    this.beam = new VehicleLighting(scene, "player");
    this.casing = new StandardMaterial("torch · graphite casing", scene);
    this.casing.diffuseColor = Color3.FromHexString("#252d33");
    this.casing.specularColor.set(0.28, 0.3, 0.32);
    this.glass = new StandardMaterial("torch · warm lens", scene);
    this.glass.diffuseColor = Color3.FromHexString("#fff1c4");
    this.glass.emissiveColor.set(0.75, 0.66, 0.4);
  }
  private attach(rig: AvatarRig) {
    if (!this.body || this.body.isDisposed()) {
      this.body = MeshBuilder.CreateCylinder(
        "torch casing",
        {
          height: 0.19,
          diameterTop: 0.043,
          diameterBottom: 0.06,
          tessellation: 10,
        },
        this.scene,
      );
      this.body.material = this.casing;
      this.body.isPickable = false;
      this.body.metadata = {
        shadowCaster: false,
        depthCaster: false,
        originalGameProp: true,
      };
      const lens = MeshBuilder.CreateCylinder(
        "torch lens",
        { height: 0.009, diameter: 0.047, tessellation: 10 },
        this.scene,
      );
      lens.parent = this.body;
      lens.position.y = -0.096;
      lens.material = this.glass;
      lens.isPickable = false;
      lens.metadata = { shadowCaster: false, depthCaster: false };
    }
    if (this.body.parent !== rig.rightElbow) {
      this.body.parent = rig.rightElbow;
      this.body.position.copyFrom(this.grip);
    }
    return this.body;
  }
  update(
    rig: AvatarRig | undefined,
    camera: Camera,
    enabled: boolean,
    firstPerson: boolean,
    quality: string,
  ) {
    if (this.disposed) return;
    // A profile replacement may dispose the old rig before the next update.
    // Do not recreate a prop under its dead elbow; first-person hidden rigs
    // remain valid and must still be allowed to use the camera beam.
    const active =
      enabled &&
      !!rig &&
      !rig.root.isDisposed() &&
      !rig.rightElbow.isDisposed();
    if (active && !firstPerson) {
      const body = this.attach(rig!);
      if (!body.isEnabled(false)) body.setEnabled(true);
      const elbow = rig!.rightElbow;
      const world = elbow.computeWorldMatrix(!elbow.isSynchronized());
      Vector3.TransformCoordinatesToRef(this.tip, world, this.position);
      Vector3.TransformNormalToRef(this.axis, world, this.direction);
    } else {
      if (this.body && !this.body.isDisposed() && this.body.isEnabled(false))
        this.body.setEnabled(false);
      if (active) {
        // Babylon's RH view matrix supplies the same forward direction as the
        // displayed frame. The rig is intentionally hidden in first person.
        camera.getViewMatrix().invertToRef(this.cameraWorld);
        Vector3.TransformCoordinatesFromFloatsToRef(
          0.12,
          -0.1,
          -0.08,
          this.cameraWorld,
          this.position,
        );
        Vector3.TransformNormalFromFloatsToRef(
          0,
          0,
          -1,
          this.cameraWorld,
          this.direction,
        );
      }
    }
    this.beam.updateFromPose(this.position, this.direction, active, quality);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.beam.dispose();
    if (this.body && !this.body.isDisposed()) this.body.dispose(false, false);
    this.casing.dispose();
    this.glass.dispose();
  }
}
