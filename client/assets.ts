import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import "@babylonjs/loaders/glTF";
import {
  ENVIRONMENT_ASSETS,
  ENVIRONMENT_PLACEMENTS,
} from "../shared/environment";
import type { Vec3 } from "../shared/types";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { VEHICLE_WHEELS, type VehicleState } from "../shared/vehicle";
import { groundHeight, PARKING_SLOTS } from "../shared/terrain";
import { groundRotation } from "../shared/terrain-entities";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CAR_SPAWN } from "../shared/world";
import { acquireCarPack, CAR_PACK_MANIFEST, type CarRig } from "./car-pack";
import { writeQuaternion } from "./transform-updates";
export async function loadEnvironment(scene: Scene) {
  const placed: { root: TransformNode; interior: boolean }[] = [];
  await Promise.all(
    ENVIRONMENT_ASSETS.map(async (asset) => {
      const container = await LoadAssetContainerAsync(asset.url, scene);
      if (scene.isDisposed) {
        container.dispose();
        return;
      }
      const grouped = new Map<any, Mesh[]>();
      for (const mesh of container.meshes) {
        if (!(mesh instanceof Mesh) || !mesh.getTotalVertices()) continue;
        mesh.computeWorldMatrix(true);
        const group = grouped.get(mesh.material) || [];
        group.push(mesh);
        grouped.set(mesh.material, group);
      }
      const sources: Mesh[] = [];
      for (const group of grouped.values()) {
        const merged = Mesh.MergeMeshes(
          group,
          true,
          true,
          undefined,
          false,
          true,
        );
        if (merged) {
          merged.isVisible = false;
          merged.isPickable = false;
          sources.push(merged);
        }
      }
      for (const p of ENVIRONMENT_PLACEMENTS.filter(
        (p) => p.asset === asset.id,
      )) {
        const root = new TransformNode("environment " + asset.id, scene);
        root.position.set(
          p.x,
          p.y + (p.interior ? 0 : groundHeight(p.x, p.z)),
          p.z,
        );
        root.rotation.y = p.yaw;
        for (const source of sources) {
          const instance = source.createInstance(asset.id);
          instance.parent = root;
          instance.isVisible = true;
          instance.isPickable = false;
        }
        root.freezeWorldMatrix();
        root.setEnabled(!p.interior);
        placed.push({ root, interior: p.interior });
      }
    }),
  );
  return {
    update(player: Vec3) {
      for (const p of placed) {
        if (!p.interior) continue;
        const v = p.root.position,
          visible =
            Math.abs(v.y - player.y) < 4.5 &&
            Math.hypot(v.x - player.x, v.z - player.z) < 26;
        if (p.root.isEnabled() !== visible) p.root.setEnabled(visible);
      }
    },
  };
}
export type CarLoadOptions = {
  sourceParking?: boolean;
  /** Same GLB bytes can be loaded directly in an offline loader regression. */
  assetSource?: Parameters<typeof LoadAssetContainerAsync>[0];
};
export type CarModelController = {
  car: TransformNode;
  parked: TransformNode;
  parkingRoots: ReadonlyMap<string, TransformNode>;
  updateWheels(state: VehicleState): void;
  setQuality(quality: string): void;
  updateLighting(night: number): void;
  dispose(): void;
};
type CarPart = { source: Mesh; id: string; wheel?: number; position: Vector3 };
const CAR_ASSET_ID = "strahov-compact",
  CAR_ENTITY_ID = "campus-car";
const AUTHORED_SUSPENSION = 0.32,
  GROUND_ORIGIN_OFFSET = -0.0112;

/** Both imported car paths share the same exact steering/spin/suspension rule.
 * Scratch rotations belong to this rig pair and cannot survive its disposal.
 */
export function createCarWheelUpdater(
  driving: readonly TransformNode[],
  parked: readonly TransformNode[],
  isDisposed: () => boolean,
): CarModelController["updateWheels"] {
  const groups = [driving, parked];
  const rotations = Array.from({ length: 4 }, () => Quaternion.Identity());
  const lastSteering: (number | undefined)[] = [],
    lastSpin: (number | undefined)[] = [];
  const steeringRotation = Quaternion.Identity(),
    spinRotation = Quaternion.Identity();
  const up = Vector3.Up(),
    right = Vector3.Right();
  return (state) => {
    if (isDisposed()) return;
    for (let i = 0; i < 4; i++) {
      const suspension =
        state.parked && !state.wheelContact[i]
          ? AUTHORED_SUSPENSION
          : (state.wheelSuspension[i] ?? AUTHORED_SUSPENSION);
      const y = VEHICLE_WHEELS[i].y - suspension;
      const steering = i < 2 ? state.steering : 0;
      const spin = state.wheelSpin[i] ?? 0;
      if (
        !Object.is(lastSteering[i], steering) ||
        !Object.is(lastSpin[i], spin)
      ) {
        Quaternion.RotationAxisToRef(up, steering, steeringRotation);
        Quaternion.RotationAxisToRef(right, spin, spinRotation);
        steeringRotation.multiplyToRef(spinRotation, rotations[i]);
        lastSteering[i] = steering;
        lastSpin[i] = spin;
      }
      for (const group of groups) {
        const wheel = group[i];
        if (!Object.is(wheel.position.y, y)) wheel.position.y = y;
        writeQuaternion(wheel, rotations[i]);
      }
    }
  };
}

/** One native GLB, independent per-vehicle transforms, immutable shared parts.
 * No campus geometry or photograph mesh is included in any vehicle root. */
export async function loadCar(
  scene: Scene,
  options: CarLoadOptions = {},
): Promise<CarModelController> {
  if (options.assetSource === undefined) return loadReviewedCar(scene, options);
  const container = await LoadAssetContainerAsync(
    options.assetSource ?? "/models/strahov-compact.glb",
    scene,
    { pluginExtension: ".glb", name: "strahov-compact.glb" },
  );
  if (scene.isDisposed) {
    container.dispose();
    throw new Error("Car scene was disposed during loading");
  }
  const templateRoot = new TransformNode(
    "vehicle templates: " + CAR_ASSET_ID,
    scene,
  );
  templateRoot.metadata = {
    kind: "asset-templates",
    assetId: CAR_ASSET_ID,
    depthCaster: false,
  };
  const roots: TransformNode[] = [],
    paintMaterials: PBRMaterial[] = [],
    parts: CarPart[] = [];
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const root of roots) root.dispose(false, false);
    templateRoot.dispose(false, false);
    for (const material of paintMaterials) material.dispose(false, true);
    container.dispose();
  };
  const createRoot = (entityId: string, representation: string) => {
    const root = new TransformNode(
      `vehicle:${entityId}:${representation}`,
      scene,
    );
    root.id =
      representation === "parking-bay"
        ? entityId
        : `${entityId}:${representation}`;
    root.metadata = {
      kind: "vehicle",
      entityId,
      representation,
      assetId: CAR_ASSET_ID,
      simulatedVehicle: true,
    };
    roots.push(root);
    return root;
  };
  const instance = (
    part: CarPart,
    parent: TransformNode,
    entityId: string,
    source = part.source,
  ) => {
    const mesh = source.createInstance(`${parent.id}:${part.id}`);
    mesh.id = mesh.name;
    mesh.parent = parent;
    mesh.isVisible = true;
    mesh.isPickable = false;
    mesh.metadata = {
      kind: "vehicle-part",
      entityId,
      assetId: CAR_ASSET_ID,
      partId: part.id,
      wheelIndex: part.wheel,
      depthCaster: "opaque",
      vehicleGlass: source.material?.name === "Window glass",
    };
    return mesh;
  };
  try {
    const grouped = new Map<Mesh["material"], Mesh[]>(),
      wheelGroups: Mesh[][] = [[], [], [], []];
    for (const material of container.materials) {
      if (!(material instanceof PBRMaterial)) continue;
      if (material.name === "Window glass") {
        // The low-poly cabin has no seating interior. Use opaque tinted dielectric
        // glazing with sky reflections, rather than transparent empty shell or metal.
        material.metallic = 0;
        material.roughness = 0.16;
        material.indexOfRefraction = 1.52;
        material.alpha = 1;
        material.transparencyMode = PBRMaterial.PBRMATERIAL_OPAQUE;
        material.metadata = {
          ...material.metadata,
          vehicleGlass: true,
          glazing: "opaque-tinted-dielectric",
        };
      } else if (material.name === "Lime enamel") {
        material.clearCoat.isEnabled = true;
        material.clearCoat.intensity = 0.65;
        material.clearCoat.roughness = 0.12;
        material.metadata = { ...material.metadata, vehiclePaint: true };
      }
    }
    for (const mesh of container.meshes) {
      if (!(mesh instanceof Mesh) || !mesh.getTotalVertices()) continue;
      mesh.computeWorldMatrix(true);
      if (mesh.name.startsWith("Wheel")) {
        const position = mesh.getAbsolutePosition(),
          index = (position.z > 0 ? 0 : 2) + (position.x > 0 ? 1 : 0);
        wheelGroups[index].push(mesh);
      } else {
        const group = grouped.get(mesh.material) ?? [];
        group.push(mesh);
        grouped.set(mesh.material, group);
      }
    }
    const merge = (meshes: Mesh[], id: string, wheel?: number) => {
      const source = Mesh.MergeMeshes(
        meshes,
        true,
        true,
        undefined,
        false,
        false,
      );
      if (!source) throw new Error("Missing compact part " + id);
      const connection =
        wheel === undefined ? undefined : VEHICLE_WHEELS[wheel];
      const position = connection
        ? new Vector3(
            connection.x,
            connection.y - AUTHORED_SUSPENSION,
            connection.z,
          )
        : Vector3.Zero();
      if (connection)
        source.bakeTransformIntoVertices(
          Matrix.Translation(-position.x, -position.y, -position.z),
        );
      source.name = `vehicle template:${id}`;
      source.parent = templateRoot;
      source.isVisible = false;
      source.isPickable = false;
      source.metadata = {
        kind: "asset-template",
        assetId: CAR_ASSET_ID,
        partId: id,
        depthCaster: false,
      };
      parts.push({ source, id, wheel, position });
    };
    for (const [material, meshes] of grouped)
      merge(meshes, "body:" + material?.name);
    for (let i = 0; i < 4; i++) {
      if (!wheelGroups[i].length)
        throw new Error("Compact wheel group " + i + " is missing");
      const materials = new Map<Mesh["material"], Mesh[]>();
      for (const mesh of wheelGroups[i]) {
        const group = materials.get(mesh.material) ?? [];
        group.push(mesh);
        materials.set(mesh.material, group);
      }
      for (const [material, meshes] of materials)
        merge(meshes, `wheel:${i}:${material?.name}`, i);
    }
    const car = createRoot(CAR_ENTITY_ID, "driving"),
      parked = createRoot(CAR_ENTITY_ID, "parked");
    for (const root of [car, parked]) {
      root.position.set(
        CAR_SPAWN.x,
        groundHeight(CAR_SPAWN.x, CAR_SPAWN.z) + GROUND_ORIGIN_OFFSET,
        CAR_SPAWN.z,
      );
      const q = groundRotation(CAR_SPAWN.x, CAR_SPAWN.z, CAR_SPAWN.yaw);
      root.rotationQuaternion = new Quaternion(q.x, q.y, q.z, q.w);
    }
    const wheels: TransformNode[] = [],
      parkedWheels: TransformNode[] = [];
    for (let i = 0; i < 4; i++)
      for (const [root, pivots] of [
        [car, wheels],
        [parked, parkedWheels],
      ] as const) {
        const pivot = new TransformNode(`${root.id}:wheel-pivot:${i}`, scene);
        pivot.id = pivot.name;
        pivot.parent = root;
        const connection = VEHICLE_WHEELS[i];
        pivot.position.set(
          connection.x,
          connection.y - AUTHORED_SUSPENSION,
          connection.z,
        );
        pivot.metadata = {
          kind: "vehicle-wheel",
          entityId: CAR_ENTITY_ID,
          wheelIndex: i,
        };
        pivots.push(pivot);
      }
    for (const part of parts)
      for (const [root, pivots] of [
        [car, wheels],
        [parked, parkedWheels],
      ] as const)
        instance(
          part,
          part.wheel === undefined ? root : pivots[part.wheel],
          CAR_ENTITY_ID,
        );
    car.setEnabled(false);
    const colours = [
        "#aeb5b9",
        "#ededdf",
        "#343b43",
        "#5d6c7a",
        "#8e3833",
        "#b5b09c",
      ],
      paintSources = new Map<string, Mesh>();
    const parkingRoots = new Map<string, TransformNode>();
    for (const [index, slot] of (options.sourceParking === false
      ? []
      : PARKING_SLOTS
    ).entries()) {
      if (parkingRoots.has(slot.id))
        throw new Error("Duplicate parking vehicle ID " + slot.id);
      const root = createRoot(slot.id, "parking-bay");
      parkingRoots.set(slot.id, root);
      root.position.set(
        slot.x,
        groundHeight(slot.x, slot.z) + GROUND_ORIGIN_OFFSET,
        slot.z,
      );
      const q = groundRotation(slot.x, slot.z, slot.yaw);
      root.rotationQuaternion = new Quaternion(q.x, q.y, q.z, q.w);
      root.metadata = {
        ...root.metadata,
        source: slot.source,
        simulatedOccupancy: true,
        dimensionsProvenance: slot.dimensionsProvenance,
      };
      for (const part of parts) {
        let source = part.source;
        if (
          source.material instanceof PBRMaterial &&
          source.material.metadata?.vehiclePaint
        ) {
          const key = part.id + ":" + (index % colours.length);
          let variant = paintSources.get(key);
          if (!variant) {
            variant = source.clone(
              "vehicle paint template:" + key,
              templateRoot,
              true,
            )!;
            const material = source.material.clone(
              "parking enamel " + (index % colours.length),
            )!;
            material.albedoColor = Color3.FromHexString(
              colours[index % colours.length],
            ).toLinearSpace();
            paintMaterials.push(material);
            variant.material = material;
            variant.isVisible = false;
            variant.isPickable = false;
            variant.metadata = { ...source.metadata, depthCaster: false };
            paintSources.set(key, variant);
          }
          source = variant;
        }
        const mesh = instance(part, root, slot.id, source);
        mesh.position.copyFrom(part.position);
        // Leave transforms synchronized normally: moving one root must really
        // move its own parts without unfreezing an entire shared campus mesh.
      }
    }
    return {
      car,
      parked,
      parkingRoots,
      dispose,
      setQuality() {},
      updateLighting() {},
      updateWheels: createCarWheelUpdater(wheels, parkedWheels, () => disposed),
    };
  } catch (error) {
    dispose();
    throw error;
  }
}

async function loadReviewedCar(
  scene: Scene,
  options: CarLoadOptions,
): Promise<CarModelController> {
  const acquired = await acquireCarPack(scene);
  const rigs: CarRig[] = [];
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const rig of rigs) rig.dispose();
    acquired.release();
  };
  const create = (
    id: string,
    representation: string,
    colour?: string,
    lightingEnabled = true,
  ) => {
    const rig = acquired.pack.createRig(id, colour, lightingEnabled);
    rigs.push(rig);
    rig.root.metadata = { ...rig.root.metadata, representation };
    return rig;
  };
  const position = (rig: CarRig, x: number, z: number, yaw: number) => {
    rig.root.position.set(
      x,
      groundHeight(x, z) + CAR_PACK_MANIFEST.groundOriginOffset,
      z,
    );
    const q = groundRotation(x, z, yaw);
    rig.root.rotationQuaternion = new Quaternion(q.x, q.y, q.z, q.w);
  };
  try {
    const driving = create("campus-car:driving", "driving"),
      parked = create("campus-car:parked", "parked", undefined, false);
    for (const rig of [driving, parked]) {
      rig.root.metadata.entityId = "campus-car";
      for (const mesh of rig.root.getChildMeshes())
        mesh.metadata.entityId = "campus-car";
      position(rig, CAR_SPAWN.x, CAR_SPAWN.z, CAR_SPAWN.yaw);
    }
    driving.root.setEnabled(false);
    const parkingRoots = new Map<string, TransformNode>(),
      colours = [
        "#aeb5b9",
        "#ededdf",
        "#343b43",
        "#5d6c7a",
        "#8e3833",
        "#b5b09c",
      ];
    for (const [index, slot] of (options.sourceParking === false
      ? []
      : PARKING_SLOTS
    ).entries()) {
      const rig = create(
        slot.id,
        "parking-bay",
        colours[index % colours.length],
        false,
      );
      position(rig, slot.x, slot.z, slot.yaw);
      rig.root.metadata = {
        ...rig.root.metadata,
        source: slot.source,
        simulatedOccupancy: true,
        dimensionsProvenance: slot.dimensionsProvenance,
      };
      parkingRoots.set(slot.id, rig.root);
    }
    return {
      car: driving.root,
      parked: parked.root,
      parkingRoots,
      dispose,
      setQuality: (quality) => acquired.pack.setQuality(quality),
      updateLighting: (night) => acquired.pack.updateLighting(night),
      updateWheels: createCarWheelUpdater(
        driving.wheels,
        parked.wheels,
        () => disposed,
      ),
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
