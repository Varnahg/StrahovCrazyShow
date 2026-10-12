import type { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AvatarPrimitivePool, AvatarRig } from "./avatar-renderer";
import type { AvatarConfig, Vec3 } from "../shared/types";
import { RENDER_BUDGETS } from "../shared/render-quality";

export type AvatarLodLevel = "near" | "medium" | "far";
export type AvatarLodUpdate = {
  /** Camera-to-rendered-feet distance in metres, not distance to a raw snapshot. */
  distance: number;
  quality: string;
  /** Final interpolated feet position, with the same origin as rig.root. */
  position: Vec3;
  yaw: number;
  /** Keep the local third-person avatar fully articulated. */
  forceNear?: boolean;
  /** Vehicle/first-person visibility. Omission respects the root's enabled state. */
  visible?: boolean;
};
export type AvatarLodState = {
  level: AvatarLodLevel;
  /** Reset the Animator once when returning from a non-animated far proxy. */
  resetAnimation: boolean;
  visible: boolean;
};

export const AVATAR_LOD_THRESHOLDS = {
  low: {
    near: RENDER_BUDGETS.low.avatarNearMetres,
    nearExit: RENDER_BUDGETS.low.avatarNearMetres + 2,
    far: RENDER_BUDGETS.low.avatarMediumMetres,
    farExit: RENDER_BUDGETS.low.avatarMediumMetres + 4,
  },
  medium: {
    near: RENDER_BUDGETS.medium.avatarNearMetres,
    nearExit: RENDER_BUDGETS.medium.avatarNearMetres + 3,
    far: RENDER_BUDGETS.medium.avatarMediumMetres,
    farExit: RENDER_BUDGETS.medium.avatarMediumMetres + 6,
  },
  high: {
    near: RENDER_BUDGETS.high.avatarNearMetres,
    nearExit: RENDER_BUDGETS.high.avatarNearMetres + 3,
    far: RENDER_BUDGETS.high.avatarMediumMetres,
    farExit: RENDER_BUDGETS.high.avatarMediumMetres + 8,
  },
} as const;

// Preserve the existing global hardware instancing. Sub-pixel details should
// stop participating in scene traversal, not create per-avatar draw batches.
const TINY_DETAIL =
  / (?:ear|eye|eyebrow|nose bridge|nose tip|lips|collar|shirt hem|hoodie pocket|drawstring|jacket zip|jacket collar|jacket pocket|sole|elbow|cuff|thumb|glasses rim|glasses side|glasses bridge|badge)$/;
const PROXY_OMIT = / trouser knee$/;

type ProxyPiece = {
  minimum: Vector3;
  maximum: Vector3;
  matrix: Matrix;
  color: Color3;
};
type ProxySource = { mesh: Mesh; users: number };
type SharedProxies = {
  sources: Map<string, ProxySource>;
  material?: StandardMaterial;
};
const PROXIES = new WeakMap<AvatarPrimitivePool, SharedProxies>();

function sharedFor(pool: AvatarPrimitivePool) {
  let shared = PROXIES.get(pool);
  if (!shared) {
    shared = { sources: new Map() };
    PROXIES.set(pool, shared);
  }
  return shared;
}

function capturePieces(
  rig: AvatarRig,
  meshes: AbstractMesh[],
  config: AvatarConfig,
): ProxyPiece[] {
  rig.root.computeWorldMatrix(true);
  const inverseRoot = rig.root.getWorldMatrix().clone().invert();
  const pieces = meshes
    .filter(
      (mesh) =>
        !PROXY_OMIT.test(mesh.name) &&
        !mesh.metadata?.skinnedAnatomy &&
        !mesh.metadata?.anatomicalEye &&
        mesh.metadata?.avatarFarProxy !== false,
    )
    .map((mesh) => {
      mesh.computeWorldMatrix(true);
      const bounds = mesh.getBoundingInfo().boundingBox;
      const material = mesh.material;
      return {
        minimum: bounds.minimum.clone(),
        maximum: bounds.maximum.clone(),
        matrix: mesh.getWorldMatrix().multiply(inverseRoot),
        color:
          material instanceof StandardMaterial
            ? material.diffuseColor.clone()
            : material instanceof PBRMaterial
              ? material.albedoColor.toGammaSpace()
              : Color3.White(),
      };
    });
  if (rig.skinnedBody) {
    // A whole skinned mesh's bounding box is not a human silhouette. Retain
    // explicit broad limbs in the cheap far proxy, with chosen identity colours.
    const add = (
      node: AvatarRig["hips"],
      centre: Vector3,
      size: Vector3,
      color: string,
    ) => {
      node.computeWorldMatrix(true);
      pieces.push({
        minimum: size.scale(-0.5),
        maximum: size.scale(0.5),
        matrix: Matrix.Translation(centre.x, centre.y, centre.z)
          .multiply(node.getWorldMatrix())
          .multiply(inverseRoot),
        color: Color3.FromHexString(color),
      });
    };
    const width = rig.measurements.legSpacing / 0.105;
    add(
      rig.hips,
      new Vector3(0, 0, 0),
      new Vector3(0.32 * width, 0.2, 0.22),
      config.trousers,
    );
    add(
      rig.torso,
      new Vector3(0, 0.155, 0),
      new Vector3(0.38 * width, 0.43, 0.25),
      config.shirt,
    );
    for (const [leg, knee] of [
      [rig.left, rig.leftKnee],
      [rig.right, rig.rightKnee],
    ]) {
      add(
        leg,
        new Vector3(0, -0.21, 0),
        new Vector3(0.16 * width, 0.42, 0.18),
        config.trousers,
      );
      add(
        knee,
        new Vector3(0, -0.21, 0),
        new Vector3(0.115 * width, 0.42, 0.13),
        config.trousers,
      );
    }
    for (const [arm, elbow] of [
      [rig.arm, rig.leftElbow],
      [rig.rightArm, rig.rightElbow],
    ]) {
      add(
        arm,
        new Vector3(0, -0.128, 0),
        new Vector3(0.1 * width, 0.255, 0.115),
        config.shirt,
      );
      add(
        elbow,
        new Vector3(0, -0.113, 0),
        new Vector3(0.082 * width, 0.23, 0.095),
        config.preset === 3 ? config.skin : config.shirt,
      );
      add(
        elbow,
        new Vector3(0, -0.285, 0.02),
        new Vector3(0.07 * width, 0.12, 0.045),
        config.skin,
      );
    }
  }
  return pieces;
}

/** Closed low-poly boxes retain each broad colour/limb; no billboard or alpha holes. */
function createProxySource(
  scene: Scene,
  shared: SharedProxies,
  pieces: ProxyPiece[],
  key: string,
) {
  const positions: number[] = [],
    normals: number[] = [],
    colors: number[] = [],
    indices: number[] = [];
  for (const piece of pieces) {
    const size = piece.maximum.subtract(piece.minimum);
    const data = VertexData.CreateBox({
      width: size.x,
      height: size.y,
      depth: size.z,
    });
    const center = piece.minimum.add(piece.maximum).scaleInPlace(0.5);
    data.transform(
      Matrix.Translation(center.x, center.y, center.z).multiply(piece.matrix),
    );
    const offset = positions.length / 3;
    positions.push(...data.positions!);
    normals.push(...data.normals!);
    for (let i = 0; i < data.positions!.length / 3; i++)
      colors.push(piece.color.r, piece.color.g, piece.color.b, 1);
    for (const index of data.indices!) indices.push(offset + index);
  }
  const mesh = new Mesh("avatar LOD source " + key, scene),
    data = new VertexData();
  data.positions = positions;
  data.normals = normals;
  data.colors = colors;
  data.indices = indices;
  data.applyToMesh(mesh);
  if (!shared.material) {
    shared.material = new StandardMaterial("avatar far vertex colours", scene);
    shared.material.diffuseColor = Color3.White();
    shared.material.specularColor.set(0.08, 0.08, 0.08);
  }
  mesh.material = shared.material;
  mesh.useVertexColors = true;
  mesh.hasVertexAlpha = false;
  mesh.isVisible = false;
  mesh.isPickable = false;
  mesh.doNotSyncBoundingInfo = true;
  return mesh;
}

/**
 * Construct once for a freshly created rig, before its first Animator update.
 * Near uses the original shared hardware instances. Medium drops only tiny
 * details. Far substitutes one cached, closed vertex-coloured instance.
 * Inactive instances are removed from scene.meshes, avoiding scene-wide scans
 * and world-matrix work. They remain owned by the rig for reversible LOD.
 */
export class AvatarLodController {
  private readonly parts: AbstractMesh[];
  private readonly mediumParts: AbstractMesh[];
  private readonly originallyEnabled = new Map<AbstractMesh, boolean>();
  private readonly attached = new Set<AbstractMesh>();
  private readonly shared: SharedProxies;
  private readonly key: string;
  private readonly blueprint: ProxyPiece[];
  private proxy?: InstancedMesh;
  private source?: ProxySource;
  private previousLevel?: AvatarLodLevel;
  private previousVisible?: boolean;
  private animationElapsed = 0;
  private disposed = false;
  private state: AvatarLodState = {
    level: "near",
    resetAnimation: false,
    visible: true,
  };

  constructor(
    private readonly scene: Scene,
    pool: AvatarPrimitivePool,
    private readonly rig: AvatarRig,
    config: AvatarConfig,
  ) {
    const allParts = rig.root.getChildMeshes(false);
    this.parts = allParts.filter(
      (mesh) => mesh.metadata?.avatarBodyLod !== "medium",
    );
    this.mediumParts = allParts.filter(
      (mesh) =>
        mesh.metadata?.avatarBodyLod !== "near" &&
        !TINY_DETAIL.test(mesh.name) &&
        mesh.metadata?.avatarDetail !== "micro",
    );
    this.blueprint = capturePieces(rig, this.mediumParts, config);
    this.shared = sharedFor(pool);
    // Numeric transforms are included so a future body rig cannot reuse an
    // incompatible cached shape merely because it has the same profile.
    this.key = JSON.stringify({
      config,
      shape: this.blueprint.map((piece) =>
        [
          ...piece.minimum.asArray(),
          ...piece.maximum.asArray(),
          ...piece.matrix.asArray(),
          ...piece.color.asArray(),
        ].map((value) => Math.round(value * 1e4) / 1e4),
      ),
    });
    for (const mesh of allParts) {
      this.originallyEnabled.set(
        mesh,
        mesh.metadata?.avatarBodyLod === "medium" || mesh.isEnabled(false),
      );
      if (mesh.metadata?.avatarBodyLod === "medium")
        this.scene.removeMesh(mesh);
      if (scene.meshes.includes(mesh)) this.attached.add(mesh);
    }
    rig.root.onDisposeObservable.addOnce(() => this.dispose());
  }

  get level() {
    return this.state.level;
  }

  /** Introspection counts are scene registrations, not promised GPU draw calls. */
  get counts() {
    return {
      near: this.parts.length,
      medium: this.mediumParts.length,
      far: 1,
      registered: this.attached.size,
      nearTriangles: this.parts.reduce(
        (sum, mesh) => sum + mesh.getTotalIndices() / 3,
        0,
      ),
      mediumTriangles: this.mediumParts.reduce(
        (sum, mesh) => sum + mesh.getTotalIndices() / 3,
        0,
      ),
      farTriangles: this.blueprint.length * 12,
    };
  }

  private ensureProxy() {
    if (this.proxy) return this.proxy;
    let source = this.shared.sources.get(this.key);
    if (!source) {
      source = {
        mesh: createProxySource(
          this.scene,
          this.shared,
          this.blueprint,
          String(this.shared.sources.size),
        ),
        users: 0,
      };
      this.shared.sources.set(this.key, source);
    }
    source.users++;
    this.source = source;
    this.proxy = source.mesh.createInstance(
      this.rig.root.name + " far silhouette",
    );
    this.proxy.parent = this.rig.root;
    this.proxy.isPickable = false;
    this.originallyEnabled.set(this.proxy, true);
    this.attached.add(this.proxy);
    return this.proxy;
  }

  private select(
    distance: number,
    quality: string,
    forceNear: boolean,
  ): AvatarLodLevel {
    if (forceNear || !Number.isFinite(distance)) return "near";
    const threshold =
      quality === "low"
        ? AVATAR_LOD_THRESHOLDS.low
        : quality === "high"
          ? AVATAR_LOD_THRESHOLDS.high
          : AVATAR_LOD_THRESHOLDS.medium;
    if (this.previousLevel === "near")
      return distance > threshold.farExit
        ? "far"
        : distance > threshold.nearExit
          ? "medium"
          : "near";
    if (this.previousLevel === "far")
      return distance < threshold.near
        ? "near"
        : distance < threshold.far
          ? "medium"
          : "far";
    if (this.previousLevel === "medium")
      return distance < threshold.near
        ? "near"
        : distance > threshold.farExit
          ? "far"
          : "medium";
    return distance <= threshold.near
      ? "near"
      : distance <= threshold.far
        ? "medium"
        : "far";
  }

  update(options: AvatarLodUpdate): Readonly<AvatarLodState> {
    if (this.disposed) return this.state;
    const level = this.select(
      Math.max(0, options.distance),
      options.quality,
      !!options.forceNear,
    );
    const visible = options.visible ?? this.rig.root.isEnabled();
    if (options.visible !== undefined) this.rig.root.setEnabled(visible);
    if (
      Number.isFinite(options.position.x) &&
      Number.isFinite(options.position.y) &&
      Number.isFinite(options.position.z)
    )
      this.rig.root.position.copyFromFloats(
        options.position.x,
        options.position.y,
        options.position.z,
      );
    if (level === "far" && Number.isFinite(options.yaw))
      this.rig.root.rotation.y = options.yaw;
    this.state.resetAnimation = this.previousLevel === "far" && level !== "far";
    if (level !== this.previousLevel || visible !== this.previousVisible) {
      const desired = visible
        ? new Set(
            level === "far"
              ? [this.ensureProxy()]
              : level === "medium"
                ? this.mediumParts
                : this.parts,
          )
        : new Set<AbstractMesh>();
      for (const mesh of this.attached) {
        if (desired.has(mesh)) continue;
        mesh.setEnabled(false);
        this.scene.removeMesh(mesh);
        this.attached.delete(mesh);
      }
      for (const mesh of desired) {
        if (mesh.isDisposed()) continue;
        if (!this.attached.has(mesh)) {
          this.scene.addMesh(mesh);
          this.attached.add(mesh);
        }
        mesh.setEnabled(this.originallyEnabled.get(mesh) ?? true);
      }
      this.animationElapsed = 0;
    }
    this.previousLevel = this.state.level = level;
    this.previousVisible = this.state.visible = visible;
    return this.state;
  }

  /** Near animates every frame, medium at 30 Hz, far never runs limb IK. */
  animationDelta(elapsedSeconds: number) {
    if (
      this.disposed ||
      !this.state.visible ||
      this.level === "far" ||
      !Number.isFinite(elapsedSeconds) ||
      elapsedSeconds <= 0
    ) {
      this.animationElapsed = 0;
      return 0;
    }
    if (this.level === "near") return elapsedSeconds;
    this.animationElapsed += elapsedSeconds;
    if (this.animationElapsed + 1e-10 < 1 / 30) return 0;
    return this.flushAnimationDelta();
  }

  /** Consume only time already accumulated for a visible medium pose. An
   * unreachable held support may need that pose before the regular 30Hz tick;
   * flushing twice cannot advance animation twice or invent extra elapsed time. */
  flushAnimationDelta() {
    if (this.disposed || !this.state.visible || this.level !== "medium")
      return 0;
    const delta = this.animationElapsed;
    this.animationElapsed = 0;
    return delta;
  }

  /** Call before disposing the rig; root disposal also releases this controller. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.proxy && !this.proxy.isDisposed()) this.proxy.dispose();
    if (this.source && --this.source.users === 0) {
      this.source.mesh.dispose(false, false);
      this.shared.sources.delete(this.key);
    }
    if (this.shared.sources.size === 0 && this.shared.material) {
      this.shared.material.dispose();
      this.shared.material = undefined;
    }
    // Detached meshes remain children of rig.root and will be disposed there.
    this.attached.clear();
  }
}
