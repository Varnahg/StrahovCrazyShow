import "./render-shaders";
import { sessionDiagnostics } from "./session-diagnostics";
import {
  snapshotAcceptedAuthorityDiagnostics,
  snapshotTransportDiagnostics,
  snapshotTimelineDiagnostics,
  type AcceptedAuthorityDiagnostics,
} from "./game-diagnostics";
import { NetworkTimeline, type TimelinePresentation } from "./network-timeline";
import type { TimelineInput } from "../shared/input-timeline";
import { SceneTextureDiagnostics } from "./texture-diagnostics";
import {
  AvatarPrimitivePool,
  createAvatarRig,
  type AvatarRig,
} from "./avatar-renderer";
import { buildWorld } from "./world-renderer";
import { captureModelReview } from "./model-review";
import { captureRenderCostInventory } from "./render-cost";
import { snapshotBenchmarkDiagnostics } from "./benchmark-snapshot";
import { EnabledMeshCandidates } from "./active-mesh-candidates";
import { writeQuaternion, writeVector3 } from "./transform-updates";
import {
  BenchmarkRenderProfile,
  BENCHMARK_RENDER_CPU_SCOPE,
} from "./benchmark-render-profile";
import { AvatarAnimator } from "./animation";
import { AvatarLodController } from "./avatar-lod";
import { LocalAvatarPresentation } from "./local-avatar-presentation";
import { ContactShadows } from "./contact-shadows";
import { SceneInstrumentation } from "@babylonjs/core/Instrumentation/sceneInstrumentation";
import { EngineInstrumentation } from "@babylonjs/core/Instrumentation/engineInstrumentation";
import "@babylonjs/core/Engines/Extensions/engine.query";
import "@babylonjs/core/Engines/AbstractEngine/abstractEngine.timeQuery";
import {
  AdaptiveQualityController,
  type AdaptiveQualitySnapshot,
} from "./adaptive-quality";
import {
  isRenderQualityMode,
  isRenderTargetFps,
} from "../shared/render-quality";
import {
  PREFERRED_GPU_POWER,
  readGpuDiagnostics,
  type GpuDiagnostics,
} from "./gpu-diagnostics";
import {
  measurePresentationRate,
  type PresentationRateMeasurement,
} from "./presentation-rate";
import { CinematicAtmosphere } from "./cinematic";
import { clampOrbitPitch, nextCameraPitch } from "./camera-look";
import { SurfacePack } from "./surface-pack";
import { B6_LAYOUT } from "../shared/b6-interior";
import { groundHeight, PARKING_SLOTS } from "../shared/terrain";
import type { B6RealityController } from "./b6-reality";
import { applyArtLighting } from "./art-lighting";
import { VehicleLighting } from "./vehicle-lighting";
import { PlayerFlashlight } from "./flashlight";
import { localizeText, t } from "./i18n";
import { MapNavigator, type PlanMapRoute } from "./map-navigation";
import { createNavigationClearance } from "./navigation-physics";
import { updateRainSegments } from "./weather-particles";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3, Matrix, Quaternion } from "@babylonjs/core/Maths/math.vector";
import { vehicleExitAllowed, type VehicleState } from "../shared/vehicle";
import {
  movementFromKeys,
  vehicleChaseYaw,
  vehicleCameraCanFollow,
  nextVehicleCameraDistance,
} from "../shared/controls";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Ray } from "@babylonjs/core/Culling/ray";
import type { LinesMesh } from "@babylonjs/core/Meshes/linesMesh";
import { ScreenLabels } from "./labels";
import {
  pickWorldTarget,
  pointerOrbits,
  POINTER_CLICK_SLOP,
  textEntryTarget,
  worldKeyboardAllowed,
  type PickTarget,
  type WorldSelection,
} from "./interaction";
import earcut from "earcut";
import { Simulation, initPhysics, type Actor } from "../shared/simulation";
import {
  BUILDINGS,
  B6_BOXES,
  MAP,
  PLACES,
  SPAWN,
  CAR_SPAWN,
  HUNT_POINTS,
  BOUNDS,
  blockNumber,
  zoneAt,
  GROUND_RECTS,
  TREES,
} from "../shared/world";
import { type Weather } from "../shared/weather";
import { SkyWeatherController } from "./sky-weather";
import type { VegetationController } from "./vegetation";
import type { TransitRenderer } from "./transit-renderer";
import {
  getPreviewArrival,
  TRANSIT_NAVIGATION,
  sampleTransit,
} from "../shared/transit";
import type {
  Player,
  Profile,
  Input,
  AvatarConfig,
  Vec3,
} from "../shared/types";
import {
  canonicalInput,
  FIXED_DT,
  PredictionHistory,
  SnapshotBuffer,
  type MotionPacket,
  type Authority,
} from "../shared/netcode";

const vectorNear = (a: Vec3, b: Vec3, tolerance: number) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < tolerance;
const quaternionNear = (
  a: VehicleState["rotation"],
  b: VehicleState["rotation"],
) =>
  Math.min(
    Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z, a.w - b.w),
    Math.hypot(a.x + b.x, a.y + b.y, a.z + b.z, a.w + b.w),
  ) < 0.0001;
const arrayNear = (a: number[], b: number[], tolerance: number) =>
  a.length === b.length &&
  a.every((value, index) => Math.abs(value - b[index]) < tolerance);

/** Equal translation alone is not equal vehicle dynamics: steering, forces and
 * roll/rotation can diverge before position does. Driver identity is local in
 * the prediction world and intentionally compared only as occupied/vacant. */
function vehiclePredictionMatches(
  a: VehicleState | undefined,
  b: VehicleState | undefined,
) {
  return (
    !!a &&
    !!b &&
    a.id === b.id &&
    !!a.driverId === !!b.driverId &&
    a.parked === b.parked &&
    a.sleeping === b.sleeping &&
    vectorNear(a.position, b.position, 0.003) &&
    quaternionNear(a.rotation, b.rotation) &&
    vectorNear(a.linvel, b.linvel, 0.015) &&
    vectorNear(a.angvel, b.angvel, 0.001) &&
    vectorNear(a.force, b.force, 0.001) &&
    vectorNear(a.torque, b.torque, 0.001) &&
    vectorNear(a.parking.position, b.parking.position, 0.003) &&
    quaternionNear(a.parking.rotation, b.parking.rotation) &&
    Math.abs(a.steering - b.steering) < 0.0001 &&
    arrayNear(a.wheelSpin, b.wheelSpin, 0.001) &&
    arrayNear(a.wheelSuspension, b.wheelSuspension, 0.0001) &&
    a.wheelContact.length === b.wheelContact.length &&
    a.wheelContact.every((value, i) => value === b.wheelContact[i])
  );
}

export type GameStats = {
  fps: number;
  triangles: number;
  drawCalls: number;
  x: number;
  y: number;
  z: number;
  speed: number;
  yaw: number;
  vehicle: boolean;
  flashlight: boolean;
  zone: string;
  hint: string;
  rendering: AdaptiveQualitySnapshot;
  gpu: GpuDiagnostics;
  cpuFrameMs: number | null;
  gpuFrameMs: number | null;
};
export type Benchmark = {
  date: string;
  sourceSnapshotId: string | null;
  durationSeconds: number;
  frames: number;
  averageFps: number;
  p95FrameMs: number;
  p99FrameMs: number;
  renderErrorCount: number;
  assetLoadErrorCount: number;
  avatars: number;
  viewport: { width: number; height: number };
  renderResolution: { width: number; height: number };
  quality: string;
  renderer: unknown;
  triangles: number;
  triangleCountScope: "all-render-passes";
  drawCalls: number;
  ambient: { buses: number; passengers: number; cars: number };
  avatarLod: Record<string, number>;
  grassClumps: number;
  sceneView: {
    position: { x: number; y: number; z: number };
    yaw: number;
    pitch: number;
    lightingInstant: number;
    camera: {
      position: Vec3;
      fov: number;
      minZ: number;
      maxZ: number;
      viewMatrix: number[];
      projectionMatrix: number[];
    };
  };
  realityPack: {
    architecture: unknown;
    landmarks: unknown;
    referenceOnly: true;
    campusExterior: unknown;
    outdoorArtifacts: unknown;
    b6: unknown;
    parkedCars: number;
  };
  modelReview: ReturnType<typeof captureModelReview>;
  renderCost: {
    inventory: ReturnType<typeof captureRenderCostInventory>;
    shadows: unknown;
    surfaces: unknown;
    vegetation: unknown;
  };
  rendering: AdaptiveQualitySnapshot;
  gpu: GpuDiagnostics;
  frameWork: { cpuMs: number | null; gpuMs: number | null };
  frameBreakdownMs: Record<string, number>;
  /** Nested Babylon CPU timings, not additive and never GPU timings. */
  engineCpuBreakdownMs: Record<string, number>;
  engineCpuBreakdownScope: typeof BENCHMARK_RENDER_CPU_SCOPE;
  frameIntervalsMs: number[];
  weatherAtStart: Weather | null;
  weatherAtEnd: Weather | null;
  presentationRate: PresentationRateMeasurement | null;
};
type Avatar = AvatarRig & {
  profile: string;
  target: Player;
  animation: AvatarAnimator;
  lod: AvatarLodController;
  floorQuery?: (x: number, z: number) => number | undefined;
};

export class Game {
  engine: Engine;
  scene: Scene;
  camera: UniversalCamera;
  labels: ScreenLabels;
  contactShadows: ContactShadows;
  instrumentation: SceneInstrumentation;
  engineInstrumentation: EngineInstrumentation;
  gpu: GpuDiagnostics;
  adaptive = new AdaptiveQualityController();
  appliedQualityRevision = -1;
  lastCpuFrameMs: number | undefined;
  lastGpuFrameMs: number | undefined;
  lastGpuCounterCount = 0;
  lastGpuCounterAt = -Infinity;
  presentationRate: PresentationRateMeasurement | null = null;
  worldControllers?: ReturnType<typeof buildWorld>;
  cinematic?: CinematicAtmosphere;
  surfacePack?: SurfacePack;
  b6Reality?: B6RealityController;
  cameraArm = 8;
  private readonly localAvatarPresentation = new LocalAvatarPresentation();
  sim!: Simulation;
  actor!: Actor;
  localId = "guest";
  onInput?: (input: TimelineInput) => void;
  onPredictionReset?: (priority?: boolean) => void;
  onAction?: (action: string, data?: unknown) => void | boolean;
  onStats?: (stats: GameStats) => void;
  onNotice?: (message: string) => void;
  onBenchmark?: (result: Benchmark) => void;
  onSelection?: (selection: WorldSelection | null) => void;
  selectedTarget: WorldSelection | null = null;
  selectionMarker?: Mesh;
  uiModal = false;
  orbiting = false;
  pointerPress?: {
    id: number;
    x: number;
    y: number;
    lastX: number;
    lastY: number;
    button: number;
    moved: boolean;
  };
  setUiModal(blocked: boolean) {
    this.uiModal = blocked;
    if (blocked) {
      this.blur();
      if (document.pointerLockElement === this.canvas)
        document.exitPointerLock();
    }
  }
  selectTarget(selection: WorldSelection | null) {
    this.selectedTarget = selection;
    this.onSelection?.(selection);
  }
  benchmark?: {
    start: number;
    frames: number[];
    minAvatars: number;
    work: Record<string, number>;
    engineWork: Record<string, number>;
    profile: BenchmarkRenderProfile;
    weatherAtStart: Weather | null;
  };
  network = false;
  ready = false;
  firstPerson = false;
  get footFirstPerson() {
    return this.firstPerson && !this.actor?.vehicle;
  }
  lastCameraInput = 0;
  vehicleCameraSnap = false;
  alignVehicleCamera() {
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.yaw = this.actor.yaw;
    this.vehicleCameraSnap = true;
    this.lastCameraInput = -Infinity;
  }
  quality = "medium";
  keys = new Set<string>();
  avatars = new Map<string, Avatar>();
  yaw = Math.PI;
  pitch = 0.28;
  distance = 8;
  seq = 0;
  onInputFrame?: () => void;
  onBeforeInputFrame?: () => void;
  onNetworkDiagnostics?: () => unknown;
  networkTimeline = new NetworkTimeline();
  private networkPresentation?: TimelinePresentation & {
    timeline: NetworkTimeline;
  };
  private lastTimelineRecoveryAt = -Infinity;
  private lastAuthorityNetwork: AcceptedAuthorityDiagnostics | null = null;
  private lastAuthorityAtMs: number | null = null;
  private readonly diagnosticNetwork = {
    motionPackets: 0,
    authorityPackets: 0,
    corrections: 0,
    resyncs: 0,
    lastCorrectionMetres: null as number | null,
    lastMotionAtMs: 0,
  };
  accumulator = 0;
  lastStats = 0;
  profile: Profile;
  localPlayer: Player;
  weather?: Weather;
  sun: DirectionalLight;
  ambient: HemisphericLight;
  clouds: Mesh[] = [];
  lamps: StandardMaterial;
  rain?: LinesMesh;
  rainLines: Vector3[][] = [];
  car: TransformNode;
  parkedCar: TransformNode;
  found = new Set<string>();
  localEmoteUntil = 0;
  setEmote(id: string, emote: string) {
    const avatar = this.avatars.get(id);
    if (avatar) avatar.target.emote = emote;
    if (id === this.localId) {
      this.localPlayer.emote = emote;
      if (!this.network) this.localEmoteUntil = performance.now() + 3500;
    }
  }
  huntMeshes: Mesh[] = [];
  soloDelivery = 0;
  rewarded = false;
  materials = new Map<string, StandardMaterial>();
  staticMeshes = new Map<StandardMaterial, Mesh[]>();
  lights: PointLight[] = [];
  disposed = false;
  renderErrorCount = 0;
  private startupAssetErrors = 0;
  private textureDiagnostics?: SceneTextureDiagnostics;
  private enabledMeshCandidates: EnabledMeshCandidates;
  get assetLoadErrorCount() {
    return (
      this.startupAssetErrors +
      (this.textureDiagnostics?.count ?? 0) +
      (this.vegetation?.stats.loadError ? 1 : 0) +
      (this.transit?.error ? 1 : 0)
    );
  }
  timeOverride: number | null = null;
  frames: number[] = [];
  avatarPool: AvatarPrimitivePool;
  prediction = new PredictionHistory();
  snapshots = new SnapshotBuffer();
  lastAuthorityTick = -1;
  visualOffset = Vector3.Zero();
  previousPosition = new Vector3(SPAWN.x, SPAWN.y, SPAWN.z);
  jumpWasDown = false;
  skyWeather: SkyWeatherController;
  environment?: { update(player: { x: number; y: number; z: number }): void };
  carSnapshots: { time: number; state: VehicleState }[] = [];
  respawnPending = false;
  private minimumMotionTick = -1;
  previousCarPose?: { position: Vector3; rotation: Quaternion };
  updateCarWheels?: (state: VehicleState) => void;
  disposeCarAssets?: () => void;
  setCarQuality?: (quality: string) => void;
  updateCarLighting?: (night: number) => void;
  vehicleLighting?: VehicleLighting;
  flashlightOn = false;
  private flashlight?: PlayerFlashlight;
  private mapNavigator?: MapNavigator;
  planMapRoute: PlanMapRoute = (start, target) => {
    if (!this.ready)
      return {
        status: "unavailable",
        points: [],
        distance: 0,
        endpoint: target,
        toEntrance: false,
      };
    this.mapNavigator ??= new MapNavigator(createNavigationClearance(this.sim));
    return this.mapNavigator.planAsync(start, target);
  };
  cancelMapRoute() {
    this.mapNavigator?.cancel();
  }
  vegetation?: VegetationController;
  transit?: TransitRenderer;
  trafficPreview?: { instant: number; started: number };
  trafficInstant() {
    return this.trafficPreview && !this.network
      ? this.trafficPreview.instant +
          performance.now() -
          this.trafficPreview.started
      : Date.now() + (this.snapshots.offset ?? 0);
  }
  previewTransit() {
    if (this.network) {
      this.notice("Ukázka dopravy je dostupná v samostatné prohlídce.");
      return null;
    }
    const arrival = getPreviewArrival(Date.now());
    if (!arrival) {
      this.notice("Pro ukázku nemáme platný podklad.");
      return null;
    }
    this.trafficPreview = {
      instant: arrival.at - 5000,
      started: performance.now(),
    };
    const path = TRANSIT_NAVIGATION.journeys.find(
      (j) => j.stopId === arrival.stopId,
    );
    const bus = sampleTransit(arrival.at).buses.find(
      (b) => b.sourceTripId === arrival.sourceTripId,
    );
    if (path && bus) {
      const [x, z] = path.points[Math.min(1, path.points.length - 1)];
      this.actor.setVehicle(false);
      const y = groundHeight(x, z) + 1;
      this.actor.setPosition({ x, y, z });
      this.yaw = Math.atan2(bus.position.x - x, bus.position.z - z);
      this.previousPosition.set(x, y, z);
      this.visualOffset.setAll(0);
      this.blur();
    }
    return arrival;
  }
  constructor(
    public canvas: HTMLCanvasElement,
    profile: Profile,
  ) {
    this.profile = profile;
    this.engine = new Engine(
      canvas,
      true,
      {
        stencil: true,
        preserveDrawingBuffer: false,
        powerPreference: PREFERRED_GPU_POWER,
      },
      false,
    );
    this.canvas.dataset.renderErrorCount = "0";
    this.engine.onEffectErrorObservable.add(() => {
      this.canvas.dataset.renderErrorCount = String(++this.renderErrorCount);
      if (this.renderErrorCount === 1)
        this.notice("Část prostředí se nepodařilo vykreslit. Obnov stránku.");
    });
    this.applyAdaptiveQuality(this.adaptive.state);
    this.gpu = readGpuDiagnostics(this.engine);
    this.engine.onContextRestoredObservable.add(() => {
      this.gpu = readGpuDiagnostics(this.engine);
      this.lastGpuCounterCount = 0;
      this.lastGpuCounterAt = -Infinity;
    });
    this.engineInstrumentation = new EngineInstrumentation(this.engine);
    if (
      this.engine.getCaps().timerQuery &&
      typeof this.engine.getGPUFrameTimeCounter === "function"
    ) {
      try {
        this.engineInstrumentation.captureGPUFrameTime = true;
      } catch {
        this.engineInstrumentation.captureGPUFrameTime = false;
      }
    }
    this.scene = new Scene(this.engine);
    this.enabledMeshCandidates = new EnabledMeshCandidates(
      this.scene,
      this.scene.getActiveMeshCandidates,
    );
    this.textureDiagnostics = new SceneTextureDiagnostics(
      this.scene,
      (count) => {
        this.canvas.dataset.assetLoadErrorCount = String(
          this.assetLoadErrorCount,
        );
        if (count === 1)
          this.notice(
            "Část textur prostředí se nepodařilo načíst. Obnov stránku.",
          );
      },
    );
    this.scene.useRightHandedSystem = true;
    this.contactShadows = new ContactShadows(this.scene);
    this.instrumentation = new SceneInstrumentation(this.scene);
    this.avatarPool = new AvatarPrimitivePool(this.scene);
    this.scene.clearColor = new Color4(0.58, 0.72, 0.73, 1);
    this.scene.fogMode = Scene.FOGMODE_EXP;
    this.scene.fogDensity = 0.0018;
    this.camera = new UniversalCamera(
      "follow",
      new Vector3(SPAWN.x, SPAWN.y + 3, SPAWN.z + 8),
      this.scene,
    );
    this.camera.minZ = 0.08;
    // The Petřín skyline is nearly 1 km from the southwest playable corner.
    this.camera.maxZ = 1100;
    this.camera.fov = 0.85;
    this.labels = new ScreenLabels(
      canvas.parentElement!.querySelector("[data-label-layer]")!,
      this.scene,
      this.camera,
      this.engine,
    );
    // Permanent landmark captions belong to the map. Keep only a handful of
    // nearby names in the scene; distant players remain represented by avatars.
    this.labels.placeLimit = 0;
    this.labels.playerLimit = 6;
    this.labels.playerRange = 18;
    this.ambient = new HemisphericLight(
      "sky",
      new Vector3(0, 1, 0),
      this.scene,
    );
    this.ambient.intensity = 0.85;
    this.ambient.groundColor = new Color3(0.27, 0.32, 0.24);
    this.sun = new DirectionalLight(
      "sun",
      new Vector3(-1, -1, 0.2),
      this.scene,
    );
    this.sun.intensity = 1.2;
    this.lamps = this.mat("#f7d590");
    this.lamps.emissiveColor = Color3.FromHexString("#f7d590").scale(0.4);
    this.buildWorld();
    this.car = this.makeCar();
    this.car.setEnabled(false);
    this.parkedCar = this.makeCar();
    this.parkedCar.position.set(
      CAR_SPAWN.x,
      groundHeight(CAR_SPAWN.x, CAR_SPAWN.z),
      CAR_SPAWN.z,
    );
    this.skyWeather = new SkyWeatherController(this.scene);
    for (let i = 0; i < 160; i++) {
      const x = ((i * 13.17) % 36) - 18,
        z = ((i * 7.31) % 36) - 18,
        y = (i * 3.73) % 18;
      this.rainLines.push([
        new Vector3(x, y, z),
        new Vector3(x + 0.12, y - 0.7, z),
      ]);
    }
    this.rain = MeshBuilder.CreateLineSystem(
      "rain",
      { lines: this.rainLines, updatable: true },
      this.scene,
    );
    this.rain.color = new Color3(0.65, 0.77, 0.85);
    this.rain.alpha = 0.45;
    this.rain.isPickable = false;
    this.rain.setEnabled(false);
    this.localPlayer = {
      ...profile,
      ...SPAWN,
      id: "guest",
      yaw: 0,
      emote: "",
      vehicle: false,
      speed: 0,
      ack: 0,
      zone: "outside",
    };
    window.addEventListener("keydown", this.keyDown);
    window.addEventListener("keyup", this.keyUp);
    window.addEventListener("blur", this.blur);
    document.addEventListener("mousemove", this.mouse);
    document.addEventListener("visibilitychange", this.visibility);
    document.addEventListener("pointerlockchange", this.pointerChanged);
    document.addEventListener("focusin", this.focusChanged);
    canvas.addEventListener("pointerdown", this.pointerDown);
    canvas.addEventListener("pointermove", this.pointerMove);
    canvas.addEventListener("pointerup", this.pointerUp);
    canvas.addEventListener("pointercancel", this.pointerCancel);
    canvas.addEventListener("contextmenu", this.contextMenu);
    document.addEventListener("mouseup", this.mouseUp);
    canvas.addEventListener("wheel", this.wheel, { passive: false });
    window.addEventListener("resize", this.resize);
  }
  async start() {
    this.canvas.dataset.bootStage = "presentation";
    this.presentationRate = await measurePresentationRate();
    if (this.disposed) return;
    this.applyAdaptiveQuality(
      this.adaptive.setPresentationHz(
        this.presentationRate.reliable
          ? this.presentationRate.observedBrowserHz
          : null,
      ),
    );
    this.canvas.dataset.bootStage = "physics-library";
    await initPhysics();
    if (this.disposed) return;
    // Survey/photogrammetry is an offline spatial reference. Gameplay uses
    // separately authored assets on the same DMR terrain as its colliders.
    this.canvas.dataset.worldMode = "authored-separate-assets";
    this.canvas.dataset.scanStage = "reference-only";
    this.canvas.dataset.bootStage = "static-collisions";
    this.sim = new Simulation();
    this.canvas.dataset.physicsStage = "ready";
    this.canvas.dataset.bootStage = "avatar-and-props";
    this.actor = this.sim.add("local");
    // Streamed materials must be rendered while glTF assets finish their
    // scene-readiness checks. A non-rendering preload can otherwise deadlock.
    const preloadRender = () => {
      if (!this.disposed) this.scene.render();
    };
    this.engine.runRenderLoop(preloadRender);
    try {
      const [
        { loadCar },
        { loadVegetation },
        { TransitRenderer },
        { loadB6Reality },
      ] = await Promise.all([
        import("./assets"),
        import("./vegetation"),
        import("./transit-renderer"),
        import("./b6-reality"),
      ]);
      if (this.disposed) return;
      this.transit = new TransitRenderer(this.scene, (x, z) =>
        this.sim.surfaceHeight(x, z),
      );
      const [interior, vegetation, car] = await Promise.allSettled([
        loadB6Reality(this.scene, {
          foundationY: B6_LAYOUT.foundationOffset,
        }).then(
          (value) => {
            this.canvas.dataset.b6Stage = "ready";
            return value;
          },
          (error) => {
            this.canvas.dataset.b6Stage = String(error);
            throw error;
          },
        ),
        loadVegetation(this.scene),
        loadCar(this.scene).then(
          (value) => {
            this.canvas.dataset.carStage = "ready";
            return value;
          },
          (error) => {
            this.canvas.dataset.carStage = String(error);
            throw error;
          },
        ),
      ]);
      if (this.disposed) return;
      if (interior.status === "fulfilled") {
        this.b6Reality = interior.value;
        if (this.worldControllers)
          this.b6Reality.attachToBuilding(this.worldControllers.b6Root);
        this.worldControllers?.b6Fallback.dispose();
      } else {
        this.startupAssetErrors++;
        console.error("B6 interior models", interior.reason);
      }
      if (vegetation.status === "fulfilled") this.vegetation = vegetation.value;
      else {
        this.startupAssetErrors++;
        console.error("Vegetation models", vegetation.reason);
      }
      if (car.status === "fulfilled") {
        this.car.dispose(false, false);
        this.parkedCar.dispose(false, false);
        this.car = car.value.car;
        this.parkedCar = car.value.parked;
        this.updateCarWheels = car.value.updateWheels;
        this.disposeCarAssets = car.value.dispose;
        this.setCarQuality = car.value.setQuality;
        this.setCarQuality(this.quality);
        this.updateCarLighting = car.value.updateLighting;
      } else {
        this.startupAssetErrors++;
        console.error("Car model", car.reason);
      }
      this.car.setEnabled(false);
    } catch (error) {
      if (this.disposed) return;
      this.startupAssetErrors++;
      console.warn("Používám geometrickou zálohu auta.", error);
    }
    if (this.disposed) return;
    this.surfacePack = new SurfacePack(this.scene);
    this.surfacePack.update(1, this.quality, this.weather?.rain ?? 0);
    this.cinematic = new CinematicAtmosphere(this.scene, this.camera, this.sun);
    this.vehicleLighting = new VehicleLighting(this.scene);
    this.ready = true;
    this.canvas.dataset.bootStage = "ready";
    this.engine.stopRenderLoop(preloadRender);
    this.updatePlayers([this.localPlayer]);
    this.engine.runRenderLoop(() => this.frame());
  }
  mat(hex: string) {
    if (this.materials.has(hex)) return this.materials.get(hex)!;
    const m = new StandardMaterial("m" + hex, this.scene);
    m.diffuseColor = Color3.FromHexString(hex);
    m.specularColor = new Color3(0.08, 0.08, 0.08);
    this.materials.set(hex, m);
    return m;
  }
  box(
    name: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: string,
    staticGroup = true,
    yaw = 0,
  ) {
    const m = MeshBuilder.CreateBox(
      name,
      { width: w, height: h, depth: d },
      this.scene,
    );
    m.position.set(x, y, z);
    m.rotation.y = yaw;
    m.material = this.mat(color);
    if (staticGroup) {
      const material = m.material as StandardMaterial;
      const group = this.staticMeshes.get(material) || [];
      group.push(m);
      this.staticMeshes.set(material, group);
    }
    return m;
  }
  sphere(
    name: string,
    x: number,
    y: number,
    z: number,
    size: number,
    color: string,
  ) {
    const m = MeshBuilder.CreateSphere(
      name,
      { diameter: size, segments: 6 },
      this.scene,
    );
    m.position.set(x, y, z);
    m.material = this.mat(color);
    return m;
  }
  label(text: string, x: number, y: number, z: number, width = 4) {
    this.labels.set(`place:${text}:${x}:${y}:${z}`, text, { x, y, z });
  }
  polygonBuilding(points: [number, number][], height: number, color: string) {
    const positions: number[] = [],
      indices: number[] = [],
      uvs: number[] = [];
    for (let i = 1; i < points.length; i++) {
      const [x, z] = points[i - 1],
        [nx, nz] = points[i],
        start = positions.length / 3;
      positions.push(x, 0, z, nx, 0, nz, nx, height, nz, x, height, z);
      indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
      uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    }
    const flat = points.slice(0, -1).flat(),
      roofStart = positions.length / 3;
    for (let i = 0; i < flat.length; i += 2) {
      positions.push(flat[i], height, flat[i + 1]);
      uvs.push(flat[i] / 15, flat[i + 1] / 15);
    }
    indices.push(...earcut(flat).map((i) => i + roofStart));
    const data = new VertexData();
    data.positions = positions;
    data.indices = indices;
    data.uvs = uvs;
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);
    data.normals = normals;
    const mesh = new Mesh("building", this.scene);
    data.applyToMesh(mesh);
    const material = this.mat(color);
    material.backFaceCulling = false;
    mesh.material = material;
    mesh.metadata = { solid: true };
    mesh.freezeWorldMatrix();
    return mesh;
  }
  buildWorld() {
    this.worldControllers = buildWorld(this);
  }
  makeCar() {
    const root = new TransformNode("car", this.scene);
    const parts = [
      this.box("body", 0, 0.65, 0, 1.7, 0.65, 3.5, "#d9e997", false),
      this.box("cabin", 0, 1.15, -0.15, 1.45, 0.7, 1.8, "#345557", false),
      this.box("roof", 0, 1.55, -0.15, 1.55, 0.12, 1.9, "#d9e997", false),
      this.box("front", 0, 0.8, 1.76, 1.3, 0.16, 0.04, "#fff1c5", false),
      this.box("tail", 0, 0.8, -1.76, 1.3, 0.16, 0.04, "#dd7b62", false),
    ];
    for (const x of [-0.85, 0.85])
      for (const z of [-1.1, 1.1]) {
        const wheel = MeshBuilder.CreateCylinder(
          "wheel",
          { diameter: 0.65, height: 0.2, tessellation: 10 },
          this.scene,
        );
        wheel.position.set(x, 0.35, z);
        wheel.rotation.z = Math.PI / 2;
        wheel.material = this.mat("#293b37");
        parts.push(wheel);
      }
    for (const p of parts) p.parent = root;
    return root;
  }
  makeAvatar(p: Player): Avatar {
    const rig = createAvatarRig(
      this.scene,
      p.avatar,
      this.avatarPool,
      "avatar " + p.id,
    );
    return {
      ...rig,
      lod: new AvatarLodController(this.scene, this.avatarPool, rig, p.avatar),
      animation: new AvatarAnimator(rig),
      profile: JSON.stringify(p.avatar),
      target: p,
    };
  }
  updatePlayers(players: Player[]) {
    const ids = new Set(players.map((p) => p.id));
    for (const [id, a] of this.avatars)
      if (!ids.has(id)) {
        a.root.dispose(false, false);
        this.avatars.delete(id);
        this.snapshots.remove(id);
        this.labels.remove("player:" + id);
        this.contactShadows.remove(id);
      }
    for (const p of players) {
      let a = this.avatars.get(p.id);
      if (a && a.profile !== JSON.stringify(p.avatar)) {
        a.root.dispose(false, false);
        this.avatars.delete(p.id);
        a = undefined;
      }
      if (!a) {
        a = this.makeAvatar(p);
        this.avatars.set(p.id, a);
        a.root.position.set(p.x, p.y - 0.8, p.z);
      }
      a.target = { ...p };
    }
    this.avatarPool.pruneUnused();
  }
  setProfile(profile: Profile) {
    this.profile = profile;
    this.localPlayer = { ...this.localPlayer, ...profile };
    const a = this.avatars.get(this.localId);
    if (a)
      this.updatePlayers(
        [...this.avatars.values()].map((a) =>
          a.target.id === this.localId ? { ...a.target, ...profile } : a.target,
        ),
      );
  }
  setLocalId(id: string) {
    const old = this.localId;
    if (old === id) return;
    if (this.network)
      sessionDiagnostics.event("network-left", { reason: "identity-change" });
    this.resetDiagnosticContext();
    // A newly issued session belongs to a new network epoch. Resuming the same
    // identity keeps its frontiers so delayed packets cannot rewind it.
    this.resetPredictionHistory();
    this.networkTimeline = new NetworkTimeline();
    this.networkPresentation = undefined;
    this.lastAuthorityTick = this.minimumMotionTick = -1;
    this.seq = 0;
    this.respawnPending = false;
    this.carSnapshots.length = 0;
    this.previousCarPose = undefined;
    this.visualOffset.setAll(0);
    this.snapshots.entities.clear();
    this.snapshots.offset = undefined;
    this.contactShadows.remove(old);
    this.localId = id;
    const a = this.avatars.get(old);
    if (a) {
      a.root.dispose();
      this.avatars.delete(old);
    }
    this.localPlayer.id = id;
  }
  syncMotion(packet: MotionPacket) {
    if (packet.tick < this.minimumMotionTick) return;
    this.diagnosticNetwork.motionPackets++;
    this.diagnosticNetwork.lastMotionAtMs = performance.now();
    this.snapshots.push(packet);
    if (packet.car) {
      this.carSnapshots.push({ time: packet.time, state: packet.car });
      if (this.carSnapshots.length > 30) this.carSnapshots.shift();
      if (this.ready && !this.actor.vehicle)
        this.sim.restorePublicCar(packet.car);
    }
    for (const row of packet.rows) {
      const [id, x, y, z, yaw, speed, ack, vehicle, zone] = row;
      const a = this.avatars.get(id);
      if (a)
        Object.assign(a.target, {
          x,
          y,
          z,
          yaw,
          speed,
          ack,
          vehicle: !!vehicle,
          zone,
        });
    }
  }
  reconcile(packet: Authority, receivedAt = performance.now()): boolean {
    if (this.disposed || !this.ready || packet.tick < this.lastAuthorityTick) return false;
    // Respawn is completed by a forced authority, not by replaying a packet
    // already in flight when the user asked to return to the start.
    const respawnReply = packet.resync === true && packet.respawn === true;
    if (this.respawnPending && !respawnReply) return false;
    const explicitRespawn = this.respawnPending && respawnReply;
    const acceptance = this.networkTimeline.acceptAuthority(
      // The timeline retains its anchor; do not retain/spread optional packet
      // telemetry or physics state while validating the command frontier.
      {
        inputEpoch: packet.inputEpoch,
        inputTickBase: packet.inputTickBase,
        tick: packet.tick,
        ack: packet.ack,
        receivedSeq: packet.receivedSeq,
        time: packet.time,
      },
      receivedAt,
      {
        vehicle: packet.state.vehicle,
        yaw: packet.state.yaw,
      },
    );
    if (!acceptance.accepted) return false;
    this.lastAuthorityNetwork = snapshotAcceptedAuthorityDiagnostics(packet);
    this.lastAuthorityAtMs = receivedAt;
    this.diagnosticNetwork.authorityPackets++;
    this.lastAuthorityTick = packet.tick;
    const expected = this.prediction.states.get(packet.ack);
    const exact =
      expected &&
      expected.vehicle === packet.state.vehicle &&
      expected.grounded === packet.state.grounded &&
      Math.abs(expected.speed - packet.state.speed) < 0.01 &&
      Math.hypot(
        expected.position.x - packet.state.position.x,
        expected.position.y - packet.state.position.y,
        expected.position.z - packet.state.position.z,
      ) < 0.003 &&
      Math.abs(expected.vertical - packet.state.vertical) < 0.01 &&
      Math.abs(
        Math.atan2(
          Math.sin(expected.yaw - packet.state.yaw),
          Math.cos(expected.yaw - packet.state.yaw),
        ),
      ) < 0.003 &&
      (!packet.state.vehicle ||
        vehiclePredictionMatches(
          expected.vehicleState,
          packet.state.vehicleState,
        ));
    if (
      exact &&
      !packet.resync &&
      !acceptance.rebase &&
      acceptance.replay.every((step) => step.source === "input")
    ) {
      this.prediction.acknowledge(packet.ack);
      this.seq = Math.max(this.seq, packet.ack);
      return true;
    }
    const old = packet.resync
        ? packet.state.position
        : { ...this.actor.position },
      modeChanged = this.actor.vehicle !== packet.state.vehicle;
    // Recovery can arrive with an invalid old physics pose. Keep presentation's
    // hard reset independent of optional diagnostics; authority against itself
    // is not a measured zero displacement.
    let beforeCorrection: Vec3 | null = packet.resync ? null : old;
    if (packet.resync && !packet.respawn) {
      try {
        const position = this.actor.position;
        if ([position.x, position.y, position.z].every(Number.isFinite))
          beforeCorrection = { x: position.x, y: position.y, z: position.z };
      } catch {
        // Forced recovery can legitimately replace an unreadable old body.
      }
    }
    const pendingInputs = this.prediction.inputs.length;
    const localSequence = this.seq;
    if (packet.resync || acceptance.rebase) {
      if (explicitRespawn) this.clearPendingMovement();
      else this.resetPredictionHistory(true);
      this.seq = packet.ack;
      this.respawnPending = false;
      this.minimumMotionTick = packet.tick;
      this.carSnapshots.length = 0;
      this.snapshots.remove(this.localId);
    } else this.seq = Math.max(this.seq, packet.ack);
    this.prediction.acknowledge(packet.ack);
    const replay = acceptance.replay;
    this.actor.restore(packet.state, packet.respawn === true);
    if (packet.resync && !packet.state.vehicle && packet.state.vehicleState)
      this.sim.restorePublicCar(packet.state.vehicleState);
    if (modeChanged && packet.state.vehicle && !packet.resync)
      this.alignVehicleCamera();
    if (!packet.resync) {
      for (const { input, time } of replay) {
        this.actor.step(input, FIXED_DT);
        // Anchor replay to the authority's server time, independent of local
        // clock skew and mode-filtered sequence gaps. Dynamic contacts still
        // do not have a full world rollback.
        this.sim.tick(time);
        this.prediction.states.set(input.seq, this.actor.capture());
      }
    }
    const corrected = this.actor.position,
      error = Math.hypot(
        old.x - corrected.x,
        old.y - corrected.y,
        old.z - corrected.z,
      );
    this.diagnosticNetwork.corrections++;
    const measuredCorrection = beforeCorrection
      ? Math.hypot(
          beforeCorrection.x - corrected.x,
          beforeCorrection.y - corrected.y,
          beforeCorrection.z - corrected.z,
        )
      : null;
    this.diagnosticNetwork.lastCorrectionMetres = measuredCorrection;
    if (packet.resync) this.diagnosticNetwork.resyncs++;
    if (packet.resync || error >= 0.35)
      sessionDiagnostics.event("network-correction", {
        resync: !!packet.resync,
        respawn: !!packet.respawn,
        correctionMetres: measuredCorrection,
        correctionAvailable: measuredCorrection !== null,
        modeChanged,
        resyncReason: packet.resyncReason ?? null,
        authorityAck: packet.ack,
        authorityTime: packet.time,
        localSequence,
        pendingInputs,
        replayInputs: replay.length,
        authorityTick: packet.tick,
        inputEpoch: packet.inputEpoch,
        timelineRebase: acceptance.rebase,
      });
    this.visualOffset.set(
      !modeChanged && !packet.resync && error < 0.35 ? old.x - corrected.x : 0,
      !modeChanged && !packet.resync && error < 0.35 ? old.y - corrected.y : 0,
      !modeChanged && !packet.resync && error < 0.35 ? old.z - corrected.z : 0,
    );
    this.previousPosition.set(corrected.x, corrected.y, corrected.z);
    const carPose = this.sim.car.getVisualPose();
    this.previousCarPose = {
      position: new Vector3(
        carPose.position.x,
        carPose.position.y,
        carPose.position.z,
      ),
      rotation: new Quaternion(
        carPose.rotation.x,
        carPose.rotation.y,
        carPose.rotation.z,
        carPose.rotation.w,
      ),
    };
    // Reconciliation has replaced both endpoints. Do not bind a new segment to
    // the old phase; the current-pose fallback is exact for this collapsed pair.
    this.networkPresentation = undefined;
    if (explicitRespawn) this.snapRecoveryPresentation();
    return true;
  }
  private resetPredictionHistory(priority = false) {
    this.accumulator = 0;
    this.prediction.clear();
    this.onPredictionReset?.(priority);
  }
  private clearPendingMovement() {
    this.clearHeldInput();
    this.jumpWasDown = false;
    this.resetPredictionHistory(true);
  }
  private snapRecoveryPresentation() {
    const position = this.actor.position;
    this.visualOffset.setAll(0);
    this.previousPosition.copyFromFloats(position.x, position.y, position.z);
    this.cameraArm = this.distance;
    this.yaw = this.actor.yaw;
    this.vehicleCameraSnap = true;
    this.avatars.get(this.localId)?.animation.reset();
    this.canvas.dataset.recoveryStage = "restored";
  }
  /** One path for R and the GUI. Ordered transport sees old inputs before the
   * request; no fresh input is predicted or queued until the forced reply. */
  requestRespawn() {
    sessionDiagnostics.event("action", { action: "respawn" });
    if (!this.ready || this.respawnPending) return false;
    this.clearPendingMovement();
    if (this.network) {
      this.respawnPending = true;
      this.canvas.dataset.recoveryStage = "waiting-for-authority";
      if (!this.onAction || this.onAction("respawn") === false) {
        this.cancelRespawn();
        this.notice(
          "Návrat vyžaduje spojení se serverem. Použij Obnovit spojení.",
        );
        return false;
      }
      return true;
    }
    if (!this.sim.respawnActor(this.actor.id)) return false;
    this.carSnapshots.length = 0;
    this.previousCarPose = undefined;
    this.snapshots.remove(this.localId);
    this.snapRecoveryPresentation();
    return true;
  }
  cancelRespawn() {
    this.respawnPending = false;
    this.keys.clear();
    this.canvas.dataset.recoveryStage = "disconnected";
  }
  toggleFlashlight() {
    if (!this.ready || this.actor.vehicle || this.respawnPending)
      return this.flashlightOn;
    this.flashlight ??= new PlayerFlashlight(this.scene);
    this.flashlightOn = !this.flashlightOn;
    this.canvas.dataset.flashlight = String(this.flashlightOn);
    return this.flashlightOn;
  }
  private notice(message: string) {
    this.onNotice?.(localizeText(message));
  }
  setWeather(weather: Weather) {
    this.weather = weather;
  }
  applyAdaptiveQuality(next: AdaptiveQualitySnapshot) {
    if (next.revision === this.appliedQualityRevision) return;
    this.appliedQualityRevision = next.revision;
    this.quality = next.quality;
    this.setCarQuality?.(this.quality);
    if (
      Math.abs(this.engine.getHardwareScalingLevel() - next.hardwareScaling) >
      0.0001
    )
      this.engine.setHardwareScalingLevel(next.hardwareScaling);
  }
  setQuality(mode: string) {
    if (isRenderQualityMode(mode))
      this.applyAdaptiveQuality(this.adaptive.setMode(mode));
  }
  setTargetFps(fps: number) {
    if (isRenderTargetFps(fps))
      this.applyAdaptiveQuality(this.adaptive.setTargetFps(fps));
  }
  startBenchmark() {
    this.benchmark?.profile.dispose();
    this.benchmark = {
      start: performance.now(),
      frames: [],
      minAvatars: this.avatars.size,
      work: {},
      engineWork: {},
      profile: new BenchmarkRenderProfile(this.scene),
      weatherAtStart: this.weather ? structuredClone(this.weather) : null,
    };
  }
  interact() {
    if (!this.ready) return;
    const p = this.actor.position;
    sessionDiagnostics.event("action", {
      action: "interact",
      vehicle: this.actor.vehicle,
      position: { x: p.x, y: p.y, z: p.z },
    });
    // Driving takes priority over a collectible beside the road.
    if (this.actor.vehicle) {
      if (!vehicleExitAllowed(this.actor.speed)) {
        this.notice("Nejdřív zastav auto: S brzdí, mezerník je ruční brzda.");
        return;
      }
      if (this.network) {
        this.onAction?.("vehicle");
        return;
      }
      const exit = this.sim.exitPosition(this.actor);
      if (!exit) {
        this.notice("Vedle auta není bezpečné místo k vystoupení.");
        return;
      }
      this.actor.setVehicle(false);
      this.actor.setPosition(exit);
      return;
    }
    const nearby = HUNT_POINTS.findIndex(
      (h, i) =>
        !this.found.has(String(i)) && Math.hypot(h.x - p.x, h.z - p.z) < 4,
    );
    if (nearby >= 0) {
      if (this.network) this.onAction?.("find", nearby);
      else {
        this.found.add(String(nearby));
        this.huntMeshes[nearby].setEnabled(false);
        this.notice(
          t("Nalezeno {count}/{total}", {
            count: this.found.size,
            total: HUNT_POINTS.length,
          }),
        );
        if (this.found.size === HUNT_POINTS.length)
          this.onAction?.("reward", "Průzkumník kopce");
      }
      return;
    }
    if (this.network) {
      this.onAction?.("vehicle");
      return;
    }
    if (
      Math.hypot(
        p.x - this.parkedCar.position.x,
        p.z - this.parkedCar.position.z,
      ) < 5
    ) {
      this.actor.setVehicle(true);
      this.alignVehicleCamera();
    } else if (
      this.soloDelivery === 0 &&
      Math.hypot(p.x - SPAWN.x, p.z - SPAWN.z) < 6
    ) {
      this.soloDelivery = 1;
      this.notice(
        "Balíček vyzvednutý. Dones jej ke vstupu B6 (značka na mapě).",
      );
    } else if (
      this.soloDelivery === 1 &&
      Math.hypot(p.x - B6_LAYOUT.entry.x, p.z - B6_LAYOUT.entry.z) < 5
    ) {
      this.soloDelivery = 2;
      this.notice("Doručeno! Odemčená kosmetická odměna.");
      this.onAction?.("reward", "Strahovský kurýr");
    } else this.notice("Přibliž se k autu, značce nebo místu úkolu.");
  }
  setFound(ids: string[]) {
    this.found = new Set(ids);
    this.huntMeshes.forEach((m, i) => m.setEnabled(!this.found.has(String(i))));
  }
  setCar(data: {
    x: number;
    y: number;
    z: number;
    yaw: number;
    parked: boolean;
    state?: VehicleState;
  }) {
    this.parkedCar.position.set(data.x, data.state?.position.y ?? 0, data.z);
    this.parkedCar.rotation.y = data.yaw;
    if (this.sim && data.state && !this.actor.vehicle)
      this.sim.restorePublicCar(data.state);
    else if (this.sim && data.parked)
      this.sim.setParkedCar({ x: data.x, y: data.y, z: data.z }, data.yaw);
  }
  resize = () => this.engine.resize();
  private clearHeldInput() {
    this.keys.clear();
    this.orbiting = false;
    this.pointerPress = undefined;
    this.canvas.style.cursor = "";
  }
  blur = () => this.clearHeldInput();
  visibility = () => {
    this.blur();
    if (!document.hidden && this.network) this.onAction?.("resync");
  };
  pointerChanged = () => {
    this.canvas.dataset.pointerMode =
      document.pointerLockElement === this.canvas ? "locked" : "free";
    if (document.pointerLockElement !== this.canvas) this.blur();
  };
  focusChanged = (e: FocusEvent) => {
    if (
      (e.target as HTMLElement)?.closest(
        "input,textarea,select,button,[contenteditable]",
      )
    )
      this.blur();
  };
  keyDown = (e: KeyboardEvent) => {
    if (textEntryTarget(e.target) || e.defaultPrevented) return;
    if (!this.ready) return;
    if (!e.repeat && ["KeyM", "KeyJ", "KeyG", "Escape"].includes(e.code)) {
      e.preventDefault();
      this.blur();
      if (document.pointerLockElement === this.canvas)
        document.exitPointerLock();
      if (e.code === "Escape") {
        if (this.uiModal)
          window.dispatchEvent(new CustomEvent("close-world-ui"));
        else this.selectTarget(null);
      } else
        window.dispatchEvent(
          new CustomEvent(
            {
              KeyM: "toggle-map",
              KeyJ: "toggle-journal",
              KeyG: "toggle-emotes",
            }[e.code]!,
          ),
        );
      return;
    }
    if (
      !worldKeyboardAllowed({
        textEntry: false,
        modal: this.uiModal,
        mapFocused: !!(e.target as Element)?.closest?.(
          '[data-map-ui],input,textarea,select,button,a,[role="dialog"],[contenteditable]',
        ),
      })
    )
      return;
    if (this.respawnPending) return;
    if (
      ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
        e.code,
      )
    )
      e.preventDefault();
    this.keys.add(e.code);
    if (!e.repeat) {
      if (e.code === "KeyE") this.interact();
      if (e.code === "KeyV") {
        if (this.actor.vehicle) {
          this.distance = nextVehicleCameraDistance(this.distance);
          this.lastCameraInput = performance.now();
        } else {
          this.firstPerson = !this.firstPerson;
          if (this.firstPerson) this.lock();
          else if (document.pointerLockElement === this.canvas)
            document.exitPointerLock();
        }
      }
      if (e.code === "KeyR") this.requestRespawn();
      if (e.code === "KeyF") this.toggleFlashlight();
    }
  };
  keyUp = (e: KeyboardEvent) => this.keys.delete(e.code);
  lock = () => {
    this.canvas.focus();
    if (!this.footFirstPerson || this.uiModal) return;
    const unavailable = () => {
      if (this.disposed || !this.footFirstPerson) return;
      this.canvas.dataset.pointerMode = "drag-fallback";
      this.notice(
        "Prohlížeč nepovolil zachycení myši. Rozhlížej se tažením pravého tlačítka.",
      );
    };
    try {
      if (!this.canvas.requestPointerLock) unavailable();
      else this.canvas.requestPointerLock()?.catch(unavailable);
    } catch {
      unavailable();
    }
  };
  contextMenu = (e: MouseEvent) => e.preventDefault();
  pointerDown = (e: PointerEvent) => {
    if (!this.ready || this.uiModal || (e.button !== 0 && e.button !== 2))
      return;
    this.canvas.focus();
    this.pointerPress = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      button: e.button,
      moved: false,
    };
    if (e.button === 2) {
      e.preventDefault();
      this.orbiting = true;
      this.canvas.style.cursor = "grabbing";
      this.canvas.setPointerCapture(e.pointerId);
    } else if (e.button === 0 && this.footFirstPerson) this.lock();
  };
  pointerUp = (e: PointerEvent) => {
    const press = this.pointerPress;
    if (
      press?.id === e.pointerId &&
      press.button === 0 &&
      !press.moved &&
      !this.footFirstPerson &&
      !this.uiModal
    )
      this.pickAt(e.clientX, e.clientY);
    if (this.canvas.hasPointerCapture(e.pointerId))
      this.canvas.releasePointerCapture(e.pointerId);
    this.pointerCancel();
  };
  pointerCancel = () => {
    this.orbiting = false;
    this.pointerPress = undefined;
    this.canvas.style.cursor = "";
  };
  mouseUp = (e: MouseEvent) => {
    if (e.button === 2 || e.button === this.pointerPress?.button)
      this.pointerCancel();
  };
  pickAt(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect(),
      width = this.engine.getRenderWidth(),
      height = this.engine.getRenderHeight();
    if (!rect.width || !rect.height) return;
    const ray = Ray.CreateNew(
      ((clientX - rect.left) * width) / rect.width,
      ((clientY - rect.top) * height) / rect.height,
      width,
      height,
      Matrix.Identity(),
      this.camera.getViewMatrix(),
      this.camera.getProjectionMatrix(),
    );
    const targets: PickTarget[] = [];
    for (const [id, avatar] of this.avatars) {
      if (id !== this.localId && !avatar.target.vehicle)
        targets.push({
          kind: "player",
          id,
          feet: avatar.root.position,
          height: avatar.bodyHeight,
          radius: 0.38,
        });
    }
    this.huntMeshes.forEach((mesh, i) => {
      if (!this.found.has(String(i)))
        targets.push({
          kind: "hunt",
          id: String(i),
          feet: {
            x: mesh.position.x,
            y: mesh.position.y - 0.5,
            z: mesh.position.z,
          },
          height: 1,
          radius: 0.5,
        });
    });
    for (const place of PLACES.filter((p) => p.worldLabel !== false))
      targets.push({
        kind: "place",
        id: place.id,
        feet: {
          x: place.x,
          y:
            place.floor == null
              ? groundHeight(place.x, place.z)
              : B6_LAYOUT.foundationOffset +
                place.floor * B6_LAYOUT.floorHeight,
          z: place.z,
        },
        height: 2.2,
        radius: 1.1,
      });
    this.selectTarget(
      pickWorldTarget(ray.origin, ray.direction, targets, (point) =>
        this.sim.hasLineOfSight(ray.origin, point, this.actor),
      ),
    );
  }
  pointerMove = (e: PointerEvent) => {
    if (document.pointerLockElement !== this.canvas) this.moveCamera(e);
  };
  mouse = (e: MouseEvent) => {
    if (document.pointerLockElement === this.canvas) this.moveCamera(e);
  };
  moveCamera = (e: MouseEvent) => {
    let deltaX = e.movementX,
      deltaY = e.movementY;
    if (this.pointerPress) {
      if (document.pointerLockElement !== this.canvas) {
        deltaX = e.clientX - this.pointerPress.lastX;
        deltaY = e.clientY - this.pointerPress.lastY;
      }
      this.pointerPress.lastX = e.clientX;
      this.pointerPress.lastY = e.clientY;
      const distance = Math.hypot(
        e.clientX - this.pointerPress.x,
        e.clientY - this.pointerPress.y,
      );
      if (distance > POINTER_CLICK_SLOP) this.pointerPress.moved = true;
      if (
        !this.footFirstPerson &&
        !this.uiModal &&
        pointerOrbits(this.pointerPress.button, distance)
      ) {
        this.orbiting = true;
        this.canvas.style.cursor = "grabbing";
        if (!this.canvas.hasPointerCapture(this.pointerPress.id))
          this.canvas.setPointerCapture(this.pointerPress.id);
      }
    }
    if (
      !this.uiModal &&
      (document.pointerLockElement === this.canvas || this.orbiting)
    ) {
      this.lastCameraInput = performance.now();
      this.yaw -= deltaX * 0.003;
      this.pitch = nextCameraPitch(this.pitch, deltaY, this.footFirstPerson);
    }
  };
  wheel = (e: WheelEvent) => {
    if (this.uiModal) return;
    e.preventDefault();
    this.lastCameraInput = performance.now();
    this.distance = Math.max(3, Math.min(15, this.distance + e.deltaY * 0.006));
  };
  private updateAvatarPresentation(
    id: string,
    avatar: Avatar,
    target: Vector3,
    dt: number,
    visible: boolean,
    resetAnimation = false,
  ) {
    const local = id === this.localId;
    const p = avatar.target;
    // Remote position and contact come from the same SnapshotBuffer sample.
    // Unknown legacy contact stays unknown; height motion is not a jump flag.
    const grounded = local ? this.actor.grounded : p.grounded;
    const distance = Vector3.Distance(this.camera.position, target);
    writeVector3(avatar.root.position, target.x, target.y, target.z);
    const lod = avatar.lod.update({
      distance,
      quality: this.quality,
      position: target,
      yaw: p.yaw,
      visible,
      forceNear: local,
    });
    if (lod.resetAnimation || resetAnimation) avatar.animation.reset();
    let animationDt = avatar.lod.animationDelta(dt);
    if (
      animationDt === 0 &&
      dt > 0 &&
      lod.visible &&
      lod.level === "medium" &&
      grounded === true &&
      !p.vehicle &&
      avatar.animation.compensatePlantedFeet(avatar.root.position) ===
        "unreachable"
    ) {
      // A cached stance can end between cadence ticks. Use only elapsed time
      // already accrued, so the ordinary gait can release it without stretching.
      animationDt = avatar.lod.flushAnimationDelta();
    }
    if (animationDt > 0) {
      const floorQuery =
        local || grounded !== undefined
          ? (avatar.floorQuery ??= (x, z) =>
              this.sim.floorHeight(x, z, avatar.root.position.y, this.actor))
          : undefined;
      avatar.animation.update(
        {
          position: avatar.root.position,
          yaw: p.yaw,
          emote: p.emote,
          vehicle: p.vehicle,
          flashlight: local && this.flashlightOn,
          grounded,
          // Remote flight asks only for the real root floor on descent. Exact
          // foot queries run once on touchdown, not on every crowd gait frame.
          groundHeight: local || grounded === false ? floorQuery : undefined,
          touchdownGroundHeight:
            !local && grounded === true ? floorQuery : undefined,
        },
        animationDt,
      );
    }
    this.contactShadows.set(
      id,
      target,
      0.95,
      0.65,
      p.yaw,
      !p.vehicle && lod.visible && distance < 45 && grounded === true,
    );
  }

  /** Unchanged collision solve; local visibility consumes its final pose. */
  private updateCameraFollow(
    renderPosition: Vector3,
    eyeHeight: number,
    dt: number,
  ) {
    // A first-person sky look stores a steep slope. Restore the original orbit
    // range before V/vehicle transitions can reuse it as a camera-height offset.
    if (!this.footFirstPerson) this.pitch = clampOrbitPitch(this.pitch);
    const target = new Vector3(
      renderPosition.x,
      renderPosition.y + (this.actor.vehicle ? 0.7 : 0.6),
      renderPosition.z,
    );
    let desired =
      this.firstPerson && !this.actor.vehicle
        ? new Vector3(
            renderPosition.x,
            renderPosition.y - 0.8 + eyeHeight,
            renderPosition.z,
          )
        : target.add(
            new Vector3(
              -Math.sin(this.yaw) * this.distance,
              2 + this.pitch * 4,
              -Math.cos(this.yaw) * this.distance,
            ),
          );
    if (!this.firstPerson || this.actor.vehicle) {
      const delta = desired.subtract(target).normalize(),
        length = this.sim.cameraDistance(target, desired, this.actor);
      this.cameraArm =
        length < this.cameraArm
          ? length
          : this.cameraArm +
            (length - this.cameraArm) * (1 - Math.exp(-dt * 5));
      desired = target.add(delta.scale(this.cameraArm));
    }
    if (this.firstPerson && !this.actor.vehicle)
      this.camera.position.copyFrom(desired);
    else {
      if (this.vehicleCameraSnap) {
        this.camera.position.copyFrom(desired);
        this.vehicleCameraSnap = false;
      } else
        this.camera.position = Vector3.Lerp(
          this.camera.position,
          desired,
          1 - Math.exp(-dt * 12),
        );
      const safe = this.sim.cameraDistance(
          target,
          this.camera.position,
          this.actor,
        ),
        delta = this.camera.position.subtract(target);
      if (safe < delta.length() - 0.005)
        this.camera.position = target.add(delta.normalize().scale(safe));
    }
    this.camera.setTarget(
      this.firstPerson && !this.actor.vehicle
        ? this.camera.position.add(
            new Vector3(Math.sin(this.yaw), -this.pitch, Math.cos(this.yaw)),
          )
        : target,
    );
  }

  advanceSimulation(dt: number, now: number) {
    if (this.respawnPending) {
      this.accumulator = 0;
      return;
    }
    this.accumulator += dt;
    const forward =
        (this.keys.has("KeyW") || this.keys.has("ArrowUp") ? 1 : 0) -
        (this.keys.has("KeyS") || this.keys.has("ArrowDown") ? 1 : 0),
      side =
        (this.keys.has("KeyD") || this.keys.has("ArrowRight") ? 1 : 0) -
        (this.keys.has("KeyA") || this.keys.has("ArrowLeft") ? 1 : 0);
    const makeInput = (seq: number): Input => {
      const jumpDown = this.keys.has("Space");
      const input = canonicalInput({
        ...movementFromKeys(forward, side, this.yaw, this.actor.vehicle),
        yaw: this.yaw,
        jump: this.actor.vehicle ? jumpDown : jumpDown && !this.jumpWasDown,
        seq,
        run: this.keys.has("ShiftLeft") || this.keys.has("ShiftRight"),
        vehicle: this.actor.vehicle,
      })!;
      this.jumpWasDown = jumpDown;
      return input;
    };
    const applyStep = (input: Input, time: number) => {
      this.previousPosition.copyFromFloats(
        this.actor.position.x,
        this.actor.position.y,
        this.actor.position.z,
      );
      const carPose = this.sim.car.getVisualPose();
      this.previousCarPose = {
        position: new Vector3(
          carPose.position.x,
          carPose.position.y,
          carPose.position.z,
        ),
        rotation: new Quaternion(
          carPose.rotation.x,
          carPose.rotation.y,
          carPose.rotation.z,
          carPose.rotation.w,
        ),
      };
      this.actor.step(input, FIXED_DT);
      this.sim.tick(time);
      this.seq = input.seq;
    };
    if (this.network) {
      const result = this.networkTimeline.advance(now, makeInput, (step) => {
        applyStep(step.input, step.time);
        this.prediction.push(step.input, this.actor.capture());
        // Neutral elapsed prefix is predicted for temporal alignment only.
        // Sending it would create late packets and consume the sender budget.
        if (step.source === "input") this.onInput?.(step.input);
      });
      if (result.status === "advanced") {
        this.updateNetworkPresentation(result.presentation);
        if (result.steps) this.accumulator %= FIXED_DT;
      } else {
        this.accumulator = 0;
        if (
          result.reason !== "no-authority" &&
          now - this.lastTimelineRecoveryAt >= 1000
        ) {
          this.lastTimelineRecoveryAt = now;
          const recoveryRequested = result.reason !== "latency-budget";
          sessionDiagnostics.event("network-timeline-wait", {
            reason: result.reason,
            recoveryRequested,
          });
          if (recoveryRequested) this.onAction?.("resync");
        }
      }
    } else {
      while (this.accumulator >= FIXED_DT) {
        applyStep(makeInput(this.seq + 1), this.trafficInstant());
        this.accumulator -= FIXED_DT;
      }
    }
    this.onInputFrame?.();
  }

  private updateNetworkPresentation(presentation: TimelinePresentation) {
    const previous = this.networkPresentation;
    if (!previous) {
      this.networkPresentation = {
        ...presentation,
        timeline: this.networkTimeline,
      };
      return;
    }
    const samePair =
      previous.timeline === this.networkTimeline &&
      previous.inputEpoch === presentation.inputEpoch &&
      previous.currentSeq === presentation.currentSeq;
    previous.alpha = samePair
      ? Math.max(previous.alpha, presentation.alpha)
      : presentation.alpha;
    previous.timeline = this.networkTimeline;
    previous.inputEpoch = presentation.inputEpoch;
    previous.currentSeq = presentation.currentSeq;
  }

  private get interpolationAlpha() {
    if (!this.network) return Math.min(1, this.accumulator / FIXED_DT);
    return this.networkPresentation?.timeline === this.networkTimeline
      ? this.networkPresentation.alpha
      : 1;
  }

  /** Shared by the rendered frame and its timing regression. Keep the caller's
   * captured position and the existing interpolation/offset order unchanged. */
  interpolateLocalPosition(position: Vec3): Vector3 {
    return Vector3.Lerp(
      this.previousPosition,
      new Vector3(position.x, position.y, position.z),
      this.interpolationAlpha,
    ).add(this.visualOffset);
  }

  /** The driven-car branch calls this only with an available previous pose. */
  interpolateDrivenCarPose(position: Vector3, rotation: Quaternion): void {
    const alpha = this.interpolationAlpha;
    Vector3.LerpToRef(
      this.previousCarPose!.position,
      position,
      alpha,
      position,
    );
    Quaternion.SlerpToRef(
      this.previousCarPose!.rotation,
      rotation,
      alpha,
      rotation,
    );
  }

  /** Diagnostic lifetime is a connection, independently of prediction identity. */
  resetDiagnosticContext(): void {
    this.lastAuthorityNetwork = null;
    this.lastAuthorityAtMs = null;
    Object.assign(this.diagnosticNetwork, {
      motionPackets: 0,
      authorityPackets: 0,
      corrections: 0,
      resyncs: 0,
      lastCorrectionMetres: null,
      lastMotionAtMs: 0,
    });
    sessionDiagnostics.resetFrameContext();
  }

  private diagnosticNetworkContext() {
    if (!this.network || this.disposed) return null;
    const now = performance.now();
    return {
      motionPackets: this.diagnosticNetwork.motionPackets,
      authorityPackets: this.diagnosticNetwork.authorityPackets,
      corrections: this.diagnosticNetwork.corrections,
      resyncs: this.diagnosticNetwork.resyncs,
      lastCorrectionMetres: this.diagnosticNetwork.lastCorrectionMetres,
      lastMotionAgeMs: this.diagnosticNetwork.lastMotionAtMs
        ? Math.max(0, now - this.diagnosticNetwork.lastMotionAtMs) : null,
      authorityAgeMs: this.lastAuthorityAtMs === null
        ? null : Math.max(0, now - this.lastAuthorityAtMs),
      authorityTick: this.lastAuthorityTick,
      pendingInputs: this.prediction.inputs.length,
      visualCorrectionMetres: this.visualOffset.length(),
      timeline: snapshotTimelineDiagnostics(this.networkTimeline.snapshot()),
      transport: snapshotTransportDiagnostics(this.onNetworkDiagnostics),
      server: this.lastAuthorityNetwork,
    };
  }

  /** Fixed-size, sampled context; no scene, player or material inventories. */
  private diagnosticContext = () => {
    if (this.disposed) return { mode: "disposed", network: null };
    const position = this.actor.position;
    const stage = this.canvas.dataset.networkStage;
    const rendering = this.adaptive.state;
    return {
      mode: this.network ? "multiplayer" : "guest",
      connection: !this.network ? "offline" : stage === "connected"
        ? "connected" : stage?.startsWith("disconnected") ? "disconnected" : "connecting",
      position: { x: position.x, y: position.y, z: position.z },
      zone: zoneAt(position),
      speed: this.actor.speed,
      vehicle: this.actor.vehicle,
      rendering: {
        mode: rendering.mode,
        quality: rendering.quality,
        targetFps: rendering.targetFps,
        hardwareScaling: rendering.hardwareScaling,
      },
      viewport: { width: this.canvas.clientWidth, height: this.canvas.clientHeight },
      renderResolution: { width: this.engine.getRenderWidth(), height: this.engine.getRenderHeight() },
      network: this.diagnosticNetworkContext(),
    };
  };

  frame() {
    if (!this.ready || this.disposed) return;
    const frameStarted = performance.now();
    this.onBeforeInputFrame?.();
    const rawFrameMs = this.engine.getDeltaTime(),
      dt = Math.min(0.1, rawFrameMs / 1000);
    const gpuCounter = this.engineInstrumentation.captureGPUFrameTime
      ? this.engineInstrumentation.gpuFrameTimeCounter
      : undefined;
    const freshGpuSample = !!gpuCounter && gpuCounter.count !== this.lastGpuCounterCount;
    if (freshGpuSample) {
      this.lastGpuCounterCount = gpuCounter.count;
      this.lastGpuCounterAt = frameStarted;
      this.lastGpuFrameMs =
        Number.isFinite(gpuCounter.current) && gpuCounter.current > 0
          ? gpuCounter.current / 1e6
          : undefined;
    }
    if (frameStarted - this.lastGpuCounterAt > 500)
      this.lastGpuFrameMs = undefined;
    this.applyAdaptiveQuality(
      this.adaptive.update({
        nowMs: frameStarted,
        frameMs: rawFrameMs,
        visible: !document.hidden,
        suspended: !!this.benchmark,
        cpuFrameMs: this.lastCpuFrameMs,
        gpuFrameMs: this.lastGpuFrameMs,
      }),
    );
    if (
      vehicleCameraCanFollow({
        driving: this.actor.vehicle,
        speed: this.actor.speed,
        nowMs: frameStarted,
        lastLookMs: this.lastCameraInput,
        orbiting: this.orbiting,
        uiModal: this.uiModal,
      })
    )
      this.yaw = vehicleChaseYaw(this.yaw, this.actor.yaw, dt);
    this.advanceSimulation(dt, frameStarted);
    const simulationEnded = performance.now();
    const pos = this.actor.position;
    this.worldControllers?.architecture?.update(
      pos,
      this.quality as "low" | "medium" | "high",
    );
    this.b6Reality?.update({ player: pos, quality: this.quality });
    this.worldControllers?.landmarks?.update(
      pos,
      this.quality as "low" | "medium" | "high",
    );
    this.worldControllers?.campusExterior?.update(
      pos.x,
      pos.z,
      this.quality as "low" | "medium" | "high",
    );
    this.worldControllers?.outdoorArtifacts?.update(
      pos.x,
      pos.z,
      this.quality as "low" | "medium" | "high",
    );
    if (
      !this.network &&
      this.localEmoteUntil &&
      performance.now() > this.localEmoteUntil
    ) {
      this.localPlayer.emote = "";
      this.localEmoteUntil = 0;
    }
    this.environment?.update(pos);
    Object.assign(this.localPlayer, pos, {
      yaw: this.actor.yaw,
      speed: this.actor.speed,
      vehicle: this.actor.vehicle,
      zone: zoneAt(pos),
    });
    const self = this.avatars.get(this.localId);
    if (this.actor.vehicle && this.flashlightOn) {
      this.flashlightOn = false;
      this.canvas.dataset.flashlight = "false";
    }
    if (self) Object.assign(self.target, this.localPlayer);
    const worldEnded = performance.now();
    const time = worldEnded / 1000;
    this.visualOffset.scaleInPlace(Math.exp(-dt * 18));
    const renderPosition = this.interpolateLocalPosition(pos);
    const localFeet = renderPosition.add(new Vector3(0, -0.8, 0));
    for (const [id, a] of this.avatars) {
      // Decide local visibility only after the camera's final collision solve.
      if (id === this.localId) continue;
      const pose = this.snapshots.sample(id);
      if (pose) Object.assign(a.target, pose);
      const p = a.target;
      this.updateAvatarPresentation(
        id,
        a,
        new Vector3(p.x, p.y - 0.8, p.z),
        dt,
        !p.vehicle,
      );
    }
    const selectedAvatar =
      this.selectedTarget?.kind === "player"
        ? this.avatars.get(this.selectedTarget.id)
        : undefined;
    if (this.selectedTarget?.kind === "player" && !selectedAvatar)
      this.selectTarget(null);
    if (selectedAvatar && !this.selectionMarker) {
      this.selectionMarker = MeshBuilder.CreateTorus(
        "selected-player-ring",
        { diameter: 1.15, thickness: 0.035, tessellation: 40 },
        this.scene,
      );
      const material = new StandardMaterial("selected-player-ring", this.scene);
      material.diffuseColor = Color3.FromHexString("#e9c877");
      material.emissiveColor = Color3.FromHexString("#c9a653");
      material.disableLighting = true;
      this.selectionMarker.material = material;
      this.selectionMarker.isPickable = false;
      this.selectionMarker.metadata = { depthCaster: false };
    }
    if (this.selectionMarker) {
      this.selectionMarker.setEnabled(
        !!selectedAvatar && !selectedAvatar.target.vehicle,
      );
      if (selectedAvatar) {
        const feet =
          selectedAvatar === self ? localFeet : selectedAvatar.root.position;
        this.selectionMarker.position.set(feet.x, feet.y + 0.025, feet.z);
      }
    }
    const driving = [...this.avatars.values()].find((a) => a.target.vehicle);
    this.car.setEnabled(this.actor.vehicle || !!driving);
    this.parkedCar.setEnabled(!this.actor.vehicle && !driving);
    let carState = this.sim.car.capture();
    const carPosition = new Vector3(
        carState.position.x,
        carState.position.y,
        carState.position.z,
      ),
      carRotation = new Quaternion(
        carState.rotation.x,
        carState.rotation.y,
        carState.rotation.z,
        carState.rotation.w,
      );
    if (this.actor.vehicle && this.previousCarPose) {
      this.interpolateDrivenCarPose(carPosition, carRotation);
    } else if (this.network && this.carSnapshots.length) {
      const sampleAt = Date.now() + (this.snapshots.offset ?? 0) - 100,
        list = this.carSnapshots;
      let before = list[0],
        after = list.at(-1)!;
      for (let i = 1; i < list.length; i++)
        if (list[i].time >= sampleAt) {
          before = list[i - 1];
          after = list[i];
          break;
        }
      const t = Math.max(
        0,
        Math.min(
          1,
          (sampleAt - before.time) / Math.max(1, after.time - before.time),
        ),
      );
      carState = after.state;
      Vector3.LerpToRef(
        new Vector3(
          before.state.position.x,
          before.state.position.y,
          before.state.position.z,
        ),
        new Vector3(
          after.state.position.x,
          after.state.position.y,
          after.state.position.z,
        ),
        t,
        carPosition,
      );
      Quaternion.SlerpToRef(
        new Quaternion(
          before.state.rotation.x,
          before.state.rotation.y,
          before.state.rotation.z,
          before.state.rotation.w,
        ),
        new Quaternion(
          after.state.rotation.x,
          after.state.rotation.y,
          after.state.rotation.z,
          after.state.rotation.w,
        ),
        t,
        carRotation,
      );
    }
    const visualCarX = this.actor.vehicle
      ? carPosition.x + this.visualOffset.x
      : carPosition.x;
    const visualCarY = this.actor.vehicle
      ? carPosition.y + this.visualOffset.y
      : carPosition.y;
    const visualCarZ = this.actor.vehicle
      ? carPosition.z + this.visualOffset.z
      : carPosition.z;
    writeVector3(this.car.position, visualCarX, visualCarY, visualCarZ);
    writeVector3(this.parkedCar.position, visualCarX, visualCarY, visualCarZ);
    writeQuaternion(this.car, carRotation);
    writeQuaternion(this.parkedCar, carRotation);
    this.updateCarWheels?.(carState);
    this.contactShadows.set(
      "car",
      { x: carPosition.x, y: carPosition.y + 0.035, z: carPosition.z },
      2.3,
      3.8,
      this.actor.vehicle ? this.actor.yaw : (driving?.target.yaw ?? 0),
      true,
    );
    this.updateCameraFollow(renderPosition, self?.eyeHeight ?? 1.63, dt);
    const localView = this.localAvatarPresentation.update({
      camera: this.camera.position,
      feet: localFeet,
      bodyHeight: self?.bodyHeight ?? 1.8,
      bodyWidthScale: self ? self.measurements.legSpacing / 0.105 : 1,
      nearPlane: this.camera.minZ,
      firstPerson: this.firstPerson,
      vehicle: this.actor.vehicle,
    });
    if (self)
      this.updateAvatarPresentation(
        this.localId,
        self,
        localFeet,
        dt,
        localView.visible,
        localView.resetAnimation,
      );
    this.huntMeshes.forEach((m, i) => {
      m.rotation.y += dt;
      m.position.y =
        (m.metadata?.groundY ?? 0) + 1.3 + Math.sin(time * 2 + i) * 0.12;
    });
    const avatarsEnded = performance.now();
    const instant = this.timeOverride ?? Date.now();
    const { sun, moon, wind } = this.skyWeather.update({
      instant,
      weather: this.weather,
      player: pos,
      dt,
      quality: this.quality,
    });
    const lighting = applyArtLighting(this, {
      sun,
      moon,
      atmosphere: this.skyWeather.atmosphere,
      headlightRequested: this.car.isEnabled(),
      extraPracticalLightSlots:
        Number(this.b6Reality?.interiorLightEnabled ?? false) +
        Number(this.flashlightOn && !!self && !this.actor.vehicle),
      weather: this.weather,
      player: pos,
      dt,
      instant,
    });
    this.updateCarLighting?.(lighting.night);
    this.vehicleLighting?.update(
      this.car,
      lighting.night,
      this.car.isEnabled(),
      this.quality,
    );
    this.flashlight?.update(
      self,
      this.camera,
      this.flashlightOn && !this.actor.vehicle,
      localView.cameraLight,
      this.quality,
    );
    this.vegetation?.update({
      dt,
      time,
      wind: { ...wind, speed: Math.hypot(wind.x, wind.z) },
      daylight: sun.daylight,
      player: pos,
      quality: this.quality,
    });
    this.transit?.update({
      now: this.trafficInstant(),
      player: pos,
      quality: this.quality as "low" | "medium" | "high",
      dt,
    });
    const raining =
      ((this.weather?.rain ?? 0) > 0.05 ||
        (this.weather?.snowfall ?? 0) > 0.005) &&
      zoneAt(pos) === "outside";
    this.rain?.setEnabled(raining);
    if (raining && this.rain) {
      this.rain.position.set(pos.x, pos.y, pos.z);
      this.rain.alpha = 0.12 + lighting.surfaceIllumination * 0.32;
      updateRainSegments(
        this.rainLines,
        dt,
        this.weather ?? { rain: 0 },
        wind,
        time,
      );
      MeshBuilder.CreateLineSystem("rain", {
        lines: this.rainLines,
        instance: this.rain,
      });
    }
    this.surfacePack?.update(dt, this.quality, this.weather?.rain ?? 0);
    this.cinematic?.update({
      dt,
      player: pos,
      quality: this.quality,
      cloud: this.weather?.cloud ?? 0.4,
      rain: this.weather?.rain ?? 0,
      keySource: lighting.keySource,
      daylight: sun.daylight,
      avatars: this.avatars.values(),
      localId: this.localId,
    });
    const environmentEnded = performance.now();
    this.benchmark?.profile.beginFrame();
    this.scene.render();
    const engineWork = this.benchmark?.profile.endFrame();
    const renderEnded = performance.now();
    for (const [id, a] of this.avatars) {
      if (id === this.localId) continue;
      this.labels.set(
        "player:" + id,
        (a.target.emote ? a.target.emote + " " : "") + a.target.nickname,
        {
          x: a.root.position.x,
          y: a.root.position.y + a.bodyHeight + 0.18,
          z: a.root.position.z,
        },
        true,
      );
    }
    this.labels.render(pos, (point) =>
      this.sim.hasLineOfSight(this.camera.position, point, this.actor),
    );
    if (import.meta.env.DEV) {
      this.frames.push(rawFrameMs);
      if (this.frames.length > 600) this.frames.shift();
    }
    if (this.benchmark || sessionDiagnostics.isRecording) {
      // Callback work through labels; excludes recorder and later HUD/benchmark
      // bookkeeping. Keep one endpoint so the six phases sum to this CPU scope.
      const frameCpuEnded = performance.now();
      const breakdown = {
        simulation: simulationEnded - frameStarted,
        world: worldEnded - simulationEnded,
        avatarsAndCamera: avatarsEnded - worldEnded,
        environment: environmentEnded - avatarsEnded,
        render: renderEnded - environmentEnded,
        labels: frameCpuEnded - renderEnded,
      };
      if (sessionDiagnostics.isRecording)
        sessionDiagnostics.recordFrame({
          frameMs: rawFrameMs,
          frameStartedAtMs: frameStarted,
          cpuMs: frameCpuEnded - frameStarted,
          gpuMs: freshGpuSample ? (this.lastGpuFrameMs ?? null) : null,
          phases: breakdown,
        }, this.diagnosticContext);
      if (this.benchmark)
        for (const [key, milliseconds] of Object.entries(breakdown))
          this.benchmark.work[key] = (this.benchmark.work[key] ?? 0) + milliseconds;
    }
    if (this.benchmark) {
      const b = this.benchmark;
      if (engineWork)
        for (const [key, milliseconds] of Object.entries(engineWork))
          b.engineWork[key] = (b.engineWork[key] ?? 0) + milliseconds;
      b.frames.push(rawFrameMs);
      b.minAvatars = Math.min(b.minAvatars, this.avatars.size);
      if (performance.now() - b.start >= 10000) {
        const sorted = b.frames.slice().sort((a, b) => a - b),
          sum = b.frames.reduce((a, b) => a + b, 0);
        // Release before the callback: it may immediately start another run.
        this.benchmark = undefined;
        b.profile.dispose();
        const durationSeconds = Number(
          ((performance.now() - b.start) / 1000).toFixed(2),
        );
        // Controllers keep updating (or dispose after HMR) while the result is
        // retained by the UI. Snapshot only their small diagnostic records.
        const diagnostics = snapshotBenchmarkDiagnostics({
          renderer: this.engine.getGlInfo(),
          ambient: this.transit?.counts ?? { buses: 0, passengers: 0, cars: 0 },
          realityPack: {
            architecture: this.worldControllers?.architecture?.metrics ?? null,
            referenceOnly: true as const,
            campusExterior:
              this.worldControllers?.campusExterior?.stats ?? null,
            outdoorArtifacts:
              this.worldControllers?.outdoorArtifacts?.stats ?? null,
            landmarks: this.worldControllers?.landmarks?.metrics ?? null,
            b6: this.b6Reality?.stats ?? null,
            parkedCars: PARKING_SLOTS.length,
          },
          renderCost: {
            shadows: this.cinematic?.stats ?? null,
            surfaces: this.surfacePack?.stats ?? null,
            vegetation: this.vegetation?.stats ?? null,
          },
          rendering: this.adaptive.state,
          gpu: this.gpu,
          presentationRate: this.presentationRate,
        });
        this.onBenchmark?.({
          ...diagnostics,
          date: new Date().toISOString(),
          sourceSnapshotId: import.meta.env.VITE_SOURCE_SNAPSHOT_ID || null,
          durationSeconds,
          frames: b.frames.length,
          averageFps: Number(((1000 * b.frames.length) / sum).toFixed(1)),
          p95FrameMs: sorted[Math.floor(sorted.length * 0.95)],
          p99FrameMs: sorted[Math.floor(sorted.length * 0.99)],
          renderErrorCount: this.renderErrorCount,
          assetLoadErrorCount: this.assetLoadErrorCount,
          avatars: b.minAvatars,
          viewport: { width: innerWidth, height: innerHeight },
          renderResolution: {
            width: this.engine.getRenderWidth(),
            height: this.engine.getRenderHeight(),
          },
          quality: this.quality,
          triangles: Math.round(this.scene.getActiveIndices() / 3),
          triangleCountScope: "all-render-passes",
          drawCalls: this.instrumentation.drawCallsCounter.current,
          avatarLod: [...this.avatars.values()].reduce(
            (out, a) => (out[a.lod.level]++, out),
            { near: 0, medium: 0, far: 0 },
          ),
          grassClumps: this.vegetation?.stats.visibleGrassClumps ?? 0,
          sceneView: {
            position: { x: pos.x, y: pos.y, z: pos.z },
            yaw: this.yaw,
            pitch: this.pitch,
            lightingInstant: this.timeOverride ?? Date.now(),
            camera: {
              position: {
                x: this.camera.globalPosition.x,
                y: this.camera.globalPosition.y,
                z: this.camera.globalPosition.z,
              },
              fov: this.camera.fov,
              minZ: this.camera.minZ,
              maxZ: this.camera.maxZ,
              viewMatrix: Array.from(this.camera.getViewMatrix().m),
              projectionMatrix: Array.from(this.camera.getProjectionMatrix().m),
            },
          },
          modelReview: captureModelReview(this.scene),
          renderCost: {
            ...diagnostics.renderCost,
            inventory: captureRenderCostInventory(this.scene),
          },
          frameWork: {
            cpuMs: this.lastCpuFrameMs ?? null,
            gpuMs: this.lastGpuFrameMs ?? null,
          },
          frameBreakdownMs: Object.fromEntries(
            Object.entries(b.work).map(([key, sum]) => [
              key,
              sum / b.frames.length,
            ]),
          ),
          engineCpuBreakdownMs: Object.fromEntries(
            Object.entries(b.engineWork).map(([key, sum]) => [
              key,
              sum / b.frames.length,
            ]),
          ),
          engineCpuBreakdownScope: BENCHMARK_RENDER_CPU_SCOPE,
          frameIntervalsMs: b.frames,
          weatherAtStart: b.weatherAtStart,
          weatherAtEnd: this.weather ? structuredClone(this.weather) : null,
        });
      }
    }
    if (performance.now() - this.lastStats > 200) {
      this.lastStats = performance.now();
      let hint = this.actor.vehicle
        ? vehicleExitAllowed(this.actor.speed)
          ? "E · vystoupit"
          : "Nejdřív zastav auto."
        : Math.hypot(
              pos.x - this.parkedCar.position.x,
              pos.z - this.parkedCar.position.z,
            ) < 5
          ? "E · nastoupit do auta"
          : "";
      if (
        !this.actor.vehicle &&
        HUNT_POINTS.some(
          (h, i) =>
            !this.found.has(String(i)) &&
            Math.hypot(h.x - pos.x, h.z - pos.z) < 4,
        )
      )
        hint = "E · najít značku";
      if (
        !this.network &&
        !hint &&
        this.soloDelivery === 0 &&
        Math.hypot(pos.x - SPAWN.x, pos.z - SPAWN.z) < 6
      )
        hint = "E · vyzvednout balíček pro B6";
      if (!this.actor.vehicle && !this.network && this.soloDelivery === 1)
        hint = "Doruč balíček ke vstupu B6 · E";
      this.onStats?.({
        fps: Math.round(this.engine.getFps()),
        triangles: Math.round(this.scene.getActiveIndices() / 3),
        drawCalls: this.instrumentation.drawCallsCounter.current,
        ...pos,
        speed: this.actor.speed,
        yaw: this.actor.yaw,
        vehicle: this.actor.vehicle,
        flashlight: this.flashlightOn,
        zone: zoneAt(pos),
        hint: localizeText(hint),
        rendering: this.adaptive.state,
        gpu: this.gpu,
        cpuFrameMs: this.lastCpuFrameMs ?? null,
        gpuFrameMs: this.lastGpuFrameMs ?? null,
      });
    }
    this.lastCpuFrameMs = performance.now() - frameStarted;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    sessionDiagnostics.event("game-dispose", {});
    this.resetDiagnosticContext();
    window.removeEventListener("keydown", this.keyDown);
    window.removeEventListener("keyup", this.keyUp);
    window.removeEventListener("blur", this.blur);
    document.removeEventListener("mousemove", this.mouse);
    document.removeEventListener("visibilitychange", this.visibility);
    document.removeEventListener("pointerlockchange", this.pointerChanged);
    document.removeEventListener("focusin", this.focusChanged);
    this.canvas.removeEventListener("pointerdown", this.pointerDown);
    this.canvas.removeEventListener("pointermove", this.pointerMove);
    this.canvas.removeEventListener("pointerup", this.pointerUp);
    this.canvas.removeEventListener("pointercancel", this.pointerCancel);
    this.canvas.removeEventListener("contextmenu", this.contextMenu);
    document.removeEventListener("mouseup", this.mouseUp);
    this.canvas.removeEventListener("wheel", this.wheel);
    window.removeEventListener("resize", this.resize);
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.engine.stopRenderLoop();
    this.enabledMeshCandidates.dispose();
    this.mapNavigator?.dispose();
    this.sim?.dispose();
    this.labels.dispose();
    this.contactShadows.dispose();
    this.benchmark?.profile.dispose();
    this.benchmark = undefined;
    this.instrumentation.dispose();
    this.engineInstrumentation.dispose();
    this.cinematic?.dispose();
    this.surfacePack?.dispose();
    this.b6Reality?.dispose();
    this.worldControllers?.architecture?.dispose();
    this.worldControllers?.landmarks?.dispose();
    this.worldControllers?.campusExterior?.dispose();
    this.worldControllers?.outdoorArtifacts?.dispose();
    this.skyWeather.dispose();
    this.vegetation?.dispose();
    this.disposeCarAssets?.();
    this.vehicleLighting?.dispose();
    this.flashlight?.dispose();
    this.transit?.dispose();
    this.avatarPool.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }
}
