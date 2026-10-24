import type { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Quaternion } from "@babylonjs/core/Maths/math.vector";
import { groundRotation } from "../shared/terrain-entities";
import { groundHeight } from "../shared/terrain";
import type { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import "@babylonjs/core/Meshes/instancedMesh";
import "@babylonjs/loaders/glTF";
import {
  sampleTransit,
  passengerSupportHeight,
  type TransitFrame,
  type TransitBus,
} from "../shared/transit";
import type { Vec3 } from "../shared/types";
import {
  AvatarPrimitivePool,
  createAvatarRig,
  type AvatarRig,
} from "./avatar-renderer";
import { AvatarAnimator } from "./animation";
import { AvatarLodController } from "./avatar-lod";
import { acquireCarPack, CAR_PACK_MANIFEST } from "./car-pack";
import busManifest from "../shared/data/assets/transit-manifest.json";

type VehicleVisual = {
  root: TransformNode;
  doors: InstancedMesh[];
  displayKey?: string;
  low?: boolean;
  wheels: TransformNode[];
  spin: number;
  previousPosition?: Vec3;
  previousYaw?: number;
  dispose?: () => void;
};
type PassengerVisual = {
  rig: AvatarRig;
  animation: AvatarAnimator;
  lod: AvatarLodController;
};
export type TransitRenderInput = {
  now: number;
  player: Vec3;
  quality: "low" | "medium" | "high";
  dt: number;
};
/** Ambient public scenery; it never joins a room or creates a player identity. */
export class TransitRenderer {
  readonly ready: Promise<void>;
  private busSources: Mesh[] = [];
  private busLowSources: Mesh[] = [];
  private carPack?: Awaited<ReturnType<typeof acquireCarPack>>;
  private buses = new Map<string, VehicleVisual>();
  private cars = new Map<string, VehicleVisual>();
  private passengers = new Map<string, PassengerVisual>();
  private displays = new Map<string, StandardMaterial>();
  private pool: AvatarPrimitivePool;
  private poolPrunePending = false;
  private disposed = false;
  private loaded = false;
  lastFrame?: TransitFrame;
  error?: string;

  constructor(
    private scene: Scene,
    private sourceGround: (x: number, z: number) => number = groundHeight,
  ) {
    this.pool = new AvatarPrimitivePool(scene);
    this.ready = Promise.all([
      this.loadSources("/models/transit/strahov-city-bus.glb", this.busSources),
      this.loadSources(
        "/models/transit/strahov-city-bus-low.glb",
        this.busLowSources,
      ),
      acquireCarPack(scene).then((acquired) => {
        if (this.disposed || this.scene.isDisposed) acquired.release();
        else this.carPack = acquired;
      }),
    ])
      .then(() => {
        this.loaded = true;
      })
      .catch((error) => {
        this.error = String(error);
        console.error("Transit models could not be loaded", error);
      });
  }
  private async loadSources(url: string, target: Mesh[]) {
    const container = await LoadAssetContainerAsync(url, this.scene);
    if (this.disposed || this.scene.isDisposed) {
      container.dispose();
      return;
    }
    // Blender bus is already batched. Merge car parts by material once.
    const groups = new Map<string, Mesh[]>();
    for (const mesh of container.meshes) {
      if (!(mesh instanceof Mesh) || !mesh.getTotalVertices()) continue;
      mesh.computeWorldMatrix(true);
      const material = mesh.material;
      if (material && "emissiveColor" in material) {
        if (material.name === "lamp" || /headlight/i.test(material.name))
          material.emissiveColor = new Color3(0.65, 0.62, 0.54);
        if (material.name === "tail" || /rear light/i.test(material.name))
          material.emissiveColor = new Color3(0.6, 0.025, 0.01);
      }
      const moving = /^(Door|Wheel)/.test(mesh.name)
        ? mesh.name.split("_")[0]
        : "Body";
      const key = moving + ":" + (mesh.material?.uniqueId ?? 0),
        group = groups.get(key) || [];
      group.push(mesh);
      groups.set(key, group);
    }
    for (const [key, group] of groups) {
      const merged = Mesh.MergeMeshes(
        group,
        true,
        true,
        undefined,
        false,
        true,
      );
      if (!merged) continue;
      merged.name = key;
      merged.isVisible = false;
      merged.isPickable = false;
      target.push(merged);
    }
  }
  private makeVehicle(id: string, sources: Mesh[]): VehicleVisual {
    const root = new TransformNode(id, this.scene),
      doors: InstancedMesh[] = [];
    const wheels = new Map<string, TransformNode>();
    for (const source of sources) {
      const instance = source.createInstance(`${id}:${source.name}`);
      instance.parent = root;
      instance.isPickable = false;
      if (source.name.startsWith("Door")) doors.push(instance);
      const key = source.name.split(":")[0],
        centre = (busManifest.wheelCentres as Record<string, number[]>)[key];
      if (centre) {
        let pivot = wheels.get(key);
        if (!pivot) {
          pivot = new TransformNode(key, this.scene);
          pivot.parent = root;
          pivot.position.set(centre[0], centre[1], centre[2]);
          wheels.set(key, pivot);
        }
        instance.parent = pivot;
        instance.position.set(-centre[0], -centre[1], -centre[2]);
      }
    }
    return { root, doors, wheels: [...wheels.values()], spin: 0 };
  }
  private display(bus: TransitBus) {
    const key = bus.route + ":" + bus.headsign;
    let material = this.displays.get(key);
    if (material) return material;
    const texture = new DynamicTexture(
      "bus display " + key,
      { width: 768, height: 128 },
      this.scene,
      true,
      Texture.TRILINEAR_SAMPLINGMODE,
    );
    const ctx = texture.getContext() as CanvasRenderingContext2D;
    ctx.fillStyle = "#111510";
    ctx.fillRect(0, 0, 768, 128);
    ctx.fillStyle = "#ffca69";
    ctx.font = "bold 86px sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText(bus.route, 16, 66);
    ctx.font = "bold 42px sans-serif";
    ctx.fillText(bus.headsign.toLocaleUpperCase("cs-CZ"), 205, 66, 545);
    texture.update();
    // Babylon's plane UV convention faces a LH camera; this game is RH.
    texture.uScale = -1;
    texture.uOffset = 1;
    material = new StandardMaterial("bus display " + key, this.scene);
    material.diffuseTexture = texture;
    material.emissiveTexture = texture;
    material.emissiveColor = new Color3(0.8, 0.8, 0.8);
    material.disableLighting = true;
    material.specularColor = Color3.Black();
    this.displays.set(key, material);
    return material;
  }
  private setDisplay(visual: VehicleVisual, bus: TransitBus) {
    const key = bus.route + ":" + bus.headsign;
    if (visual.displayKey === key) return;
    visual.displayKey = key;
    for (const old of visual.root
      .getChildMeshes()
      .filter((m) => m.name.startsWith("route display")))
      old.dispose();
    const material = this.display(bus);
    for (const p of [
      { x: 0, y: 2.71, z: 5.96, yaw: Math.PI, w: 1.65, h: 0.275 },
      { x: -1.31, y: 2.64, z: 3.25, yaw: Math.PI / 2, w: 1.9, h: 0.316 },
      { x: 0, y: 2.6, z: -5.96, yaw: 0, w: 1.65, h: 0.275 },
    ]) {
      const plane = MeshBuilder.CreatePlane(
        "route display " + key,
        { width: p.w, height: p.h },
        this.scene,
      );
      plane.parent = visual.root;
      plane.position.set(p.x, p.y, p.z);
      plane.rotation.y = p.yaw;
      plane.material = material;
      plane.isPickable = false;
    }
  }
  update({ now, player, quality, dt }: TransitRenderInput) {
    if (this.disposed || !this.loaded) return;
    const frame = sampleTransit(now);
    this.lastFrame = frame;
    this.carPack?.pack.setQuality(quality);
    const radius = quality === "low" ? 210 : quality === "medium" ? 300 : 420;
    const distance = (p: Vec3) => Math.hypot(p.x - player.x, p.z - player.z);
    const visibleBuses = frame.buses
      .filter((b) => distance(b.position) < radius)
      .sort((a, b) => distance(a.position) - distance(b.position))
      .slice(0, quality === "low" ? 4 : 8);
    const busIds = new Set(visibleBuses.map((b) => b.id));
    for (const [id, visual] of this.buses)
      if (!busIds.has(id)) {
        visual.root.dispose();
        this.buses.delete(id);
      }
    for (const bus of visibleBuses) {
      let visual = this.buses.get(bus.id);
      const threshold = quality === "low" ? 45 : 90,
        low = distance(bus.position) > threshold + (visual?.low ? -10 : 10);
      if (visual && visual.low !== low) {
        visual.root.dispose();
        this.buses.delete(bus.id);
        visual = undefined;
      }
      if (!visual) {
        visual = this.makeVehicle(
          "ambient bus " + bus.id,
          low ? this.busLowSources : this.busSources,
        );
        visual.low = low;
        this.buses.set(bus.id, visual);
        this.setDisplay(visual, bus);
      }
      visual.root.position.set(
        bus.position.x,
        bus.position.y +
          this.sourceGround(bus.position.x, bus.position.z) -
          groundHeight(bus.position.x, bus.position.z),
        bus.position.z,
      );
      visual.root.rotation.y = bus.yaw;
      const busRotation = groundRotation(
        bus.position.x,
        bus.position.z,
        bus.yaw,
        11.8,
        2.5,
        this.sourceGround,
      );
      visual.root.rotationQuaternion = new Quaternion(
        busRotation.x,
        busRotation.y,
        busRotation.z,
        busRotation.w,
      );
      if (visual.previousPosition) {
        const travelled = Math.hypot(
          bus.position.x - visual.previousPosition.x,
          bus.position.z - visual.previousPosition.z,
        );
        if (travelled < 3) visual.spin += travelled / 0.48;
      }
      visual.previousPosition = { ...bus.position };
      for (const wheel of visual.wheels) wheel.rotation.x = visual.spin;
      for (const door of visual.doors) {
        const goal = bus.doorsOpen ? 0.7 : 0;
        door.position.z += (goal - door.position.z) * -Math.expm1(-6 * dt);
        door.position.x = bus.doorsOpen ? -0.12 : 0;
      }
    }
    const traffic = frame.traffic.filter((c) => distance(c.position) < radius),
      carIds = new Set(traffic.map((c) => c.id));
    for (const [id, visual] of this.cars)
      if (!carIds.has(id)) {
        if (visual.dispose) visual.dispose();
        else visual.root.dispose();
        this.cars.delete(id);
      }
    for (const car of traffic) {
      let visual = this.cars.get(car.id);
      if (!visual) {
        const rig = this.carPack!.pack.createRig(
          "ambient-car:" + car.id,
          ["#455d6d", "#aeb5b9", "#8e3833", "#343b43"][this.cars.size % 4],
        );
        visual = {
          root: rig.root,
          wheels: rig.wheels,
          doors: [],
          spin: 0,
          dispose: rig.dispose,
        };
        this.cars.set(car.id, visual);
      }
      visual.root.position.set(
        car.position.x,
        car.position.y +
          this.sourceGround(car.position.x, car.position.z) -
          groundHeight(car.position.x, car.position.z) +
          CAR_PACK_MANIFEST.groundOriginOffset,
        car.position.z,
      );
      visual.root.rotation.y = car.yaw;
      const carRotation = groundRotation(
        car.position.x,
        car.position.z,
        car.yaw,
        3.56,
        2.04,
        this.sourceGround,
      );
      visual.root.rotationQuaternion = new Quaternion(
        carRotation.x,
        carRotation.y,
        carRotation.z,
        carRotation.w,
      );
      let steering = 0;
      if (visual.previousPosition) {
        const travelled = Math.hypot(
          car.position.x - visual.previousPosition.x,
          car.position.z - visual.previousPosition.z,
        );
        if (travelled < 3) {
          visual.spin += travelled / CAR_PACK_MANIFEST.wheelRadius;
          if (travelled > 0.001 && visual.previousYaw !== undefined) {
            const turn = Math.atan2(
              Math.sin(car.yaw - visual.previousYaw),
              Math.cos(car.yaw - visual.previousYaw),
            );
            const wheelbase =
              CAR_PACK_MANIFEST.wheelCentres[0][2] -
              CAR_PACK_MANIFEST.wheelCentres[2][2];
            steering = Math.max(
              -0.55,
              Math.min(0.55, Math.atan((turn * wheelbase) / travelled)),
            );
          }
        }
      }
      visual.previousPosition = { ...car.position };
      visual.previousYaw = car.yaw;
      visual.wheels.forEach((wheel, index) => {
        wheel.rotationQuaternion ??= Quaternion.Identity();
        Quaternion.RotationYawPitchRollToRef(
          index < 2 ? steering : 0,
          visual!.spin,
          0,
          wheel.rotationQuaternion,
        );
      });
    }
    const npcRadius = quality === "low" ? 95 : quality === "medium" ? 140 : 180,
      cap = quality === "low" ? 16 : quality === "medium" ? 28 : 40;
    const selected = frame.passengers
        .filter((p) => distance(p.position) < npcRadius)
        .sort((a, b) => distance(a.position) - distance(b.position))
        .slice(0, cap),
      npcIds = new Set(selected.map((p) => p.id));
    for (const [id, npc] of this.passengers)
      if (!npcIds.has(id)) {
        this.poolPrunePending = true;
        npc.rig.root.dispose();
        this.passengers.delete(id);
      }
    for (const p of selected) {
      let npc = this.passengers.get(p.id);
      if (!npc) {
        this.poolPrunePending = true;
        const rig = createAvatarRig(this.scene, p.avatar, this.pool, p.id);
        npc = {
          rig,
          animation: new AvatarAnimator(rig),
          lod: new AvatarLodController(this.scene, this.pool, rig, p.avatar),
        };
        this.passengers.set(p.id, npc);
      }
      const position = {
        ...p.position,
        y: passengerSupportHeight(p.position.x, p.position.z, this.sourceGround(p.position.x, p.position.z)),
      };
      npc.rig.root.position.set(position.x, position.y, position.z);
      const eye = this.scene.activeCamera?.globalPosition ?? player;
      const lod = npc.lod.update({
        distance: Math.hypot(
          position.x - eye.x,
          position.y - eye.y,
          position.z - eye.z,
        ),
        position,
        yaw: p.yaw,
        quality,
        visible: p.opacity > 0.01,
      });
      if (lod.resetAnimation) npc.animation.reset();
      const animationDt = npc.lod.animationDelta(dt);
      if (animationDt > 0)
        npc.animation.update(
          { position, yaw: p.yaw, grounded: true },
          animationDt,
        );
    }
    if (this.poolPrunePending) {
      this.pool.pruneUnused();
      this.poolPrunePending = false;
    }
  }
  get counts() {
    return {
      buses: this.buses.size,
      passengers: this.passengers.size,
      cars: this.cars.size,
    };
  }
  dispose() {
    this.disposed = true;
    for (const list of [this.buses, this.cars])
      for (const value of list.values()) {
        if (value.dispose) value.dispose();
        else value.root.dispose();
      }
    for (const p of this.passengers.values()) p.rig.root.dispose();
    this.pool.dispose();
    for (const source of [...this.busSources, ...this.busLowSources])
      source.dispose();
    for (const material of this.displays.values()) {
      material.diffuseTexture?.dispose();
      material.dispose();
    }
    this.buses.clear();
    this.cars.clear();
    this.passengers.clear();
    this.carPack?.release();
    this.carPack = undefined;
  }
}
