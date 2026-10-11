import "./render-shaders";
import { SceneTextureDiagnostics } from "./texture-diagnostics";
import {
  AvatarPrimitivePool,
  createAvatarRig,
  type AvatarRig,
} from "./avatar-renderer";
import { buildWorld } from "./world-renderer";
import { captureModelReview } from "./model-review";
import { captureRenderCostInventory } from "./render-cost";
import { EnabledMeshCandidates } from "./active-mesh-candidates";
import { writeQuaternion, writeVector3 } from "./transform-updates";
import {
  BenchmarkRenderProfile,
  BENCHMARK_RENDER_CPU_SCOPE,
} from "./benchmark-render-profile";
import { AvatarAnimator } from "./animation";
import { AvatarLodController } from "./avatar-lod";
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
import { SurfacePack } from "./surface-pack";
import { B6_LAYOUT } from "../shared/b6-interior";
import { groundHeight, PARKING_SLOTS } from "../shared/terrain";
import type { B6RealityController } from "./b6-reality";
import { applyArtLighting } from "./art-lighting";
import { VehicleLighting } from "./vehicle-lighting";
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
  sim!: Simulation;
  actor!: Actor;
  localId = "guest";
  onInput?: (input: Input) => void;
  onPredictionReset?: () => void;
  onAction?: (action: string, data?: unknown) => void;
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
  sunOrb!: Mesh;
  moonOrb!: Mesh;
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
  previousCarPose?: { position: Vector3; rotation: Quaternion };
  updateCarWheels?: (state: VehicleState) => void;
  disposeCarAssets?: () => void;
  setCarQuality?: (quality: string) => void;
  updateCarLighting?: (night: number) => void;
  vehicleLighting?: VehicleLighting;
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
      this.onNotice?.("Ukázka dopravy je dostupná v samostatné prohlídce.");
      return null;
    }
    const arrival = getPreviewArrival(Date.now());
    if (!arrival) {
      this.onNotice?.("Pro ukázku nemáme platný podklad.");
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
        this.onNotice?.(
          "Část prostředí se nepodařilo vykreslit. Obnov stránku.",
        );
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
          this.onNotice?.(
            "Část textur prostředí se nepodařilo načíst. Obnov stránku.",
          );
      },
    );
    this.scene.useRightHandedSystem = true;
    this.contactShadows = new ContactShadows(this.scene);
    this.instrumentation = new SceneInstrumentation(this.scene);
    this.avatarPool = new AvatarPrimitivePool(this.scene);
    this.scene.clearColor = new Color4(0.58, 0.72, 0.73, 1);
    this.scene.fogMode = Scene.FOGMODE_EXP2;
    this.scene.fogDensity = 0.0018;
    this.camera = new UniversalCamera(
      "follow",
      new Vector3(SPAWN.x, SPAWN.y + 3, SPAWN.z + 8),
      this.scene,
    );
    this.camera.minZ = 0.08;
    this.camera.maxZ = 700;
    this.camera.fov = 0.85;
    this.labels = new ScreenLabels(
      canvas.parentElement!.querySelector("[data-label-layer]")!,
      this.scene,
      this.camera,
      this.engine,
    );
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
    this.sunOrb = this.sphere("sun disc", 0, 200, 0, 10, "#fff0bb");
    (this.sunOrb.material as StandardMaterial).emissiveColor =
      Color3.FromHexString("#fff0bb");
    this.sunOrb.isPickable = false;
    this.moonOrb = this.sphere("moon", 0, 200, 0, 5, "#b4c7d9");
    (this.moonOrb.material as StandardMaterial).emissiveColor =
      Color3.FromHexString("#b4c7d9");
    this.moonOrb.isPickable = false;
    this.skyWeather = new SkyWeatherController(
      this.scene,
      this.sunOrb,
      this.moonOrb,
      this.clouds,
    );
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
  reconcile(packet: Authority) {
    if (!this.ready || packet.tick < this.lastAuthorityTick) return;
    this.lastAuthorityTick = packet.tick;
    const expected = this.prediction.states.get(packet.ack);
    const exact =
      expected &&
      expected.vehicle === packet.state.vehicle &&
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
        (!!expected.vehicleState &&
          !!packet.state.vehicleState &&
          Math.hypot(
            expected.vehicleState.linvel.x - packet.state.vehicleState.linvel.x,
            expected.vehicleState.linvel.y - packet.state.vehicleState.linvel.y,
            expected.vehicleState.linvel.z - packet.state.vehicleState.linvel.z,
          ) < 0.015));
    if (exact && !packet.resync) {
      this.prediction.acknowledge(packet.ack);
      this.seq = Math.max(this.seq, packet.ack);
      return;
    }
    const old = { ...this.actor.position },
      modeChanged = this.actor.vehicle !== packet.state.vehicle;
    if (packet.resync) {
      this.prediction.clear();
      this.seq = packet.ack;
      this.onPredictionReset?.();
    } else this.seq = Math.max(this.seq, packet.ack);
    const replay = this.prediction
      .acknowledge(packet.ack)
      .filter(
        (i) => i.vehicle === undefined || i.vehicle === packet.state.vehicle,
      );
    this.actor.restore(packet.state);
    if (modeChanged && packet.state.vehicle) this.alignVehicleCamera();
    if (!packet.resync)
      for (const input of replay) {
        this.actor.step(input, FIXED_DT);
        this.sim.tick();
      }
    const corrected = this.actor.position,
      error = Math.hypot(
        old.x - corrected.x,
        old.y - corrected.y,
        old.z - corrected.z,
      );
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
  }
  setWeather(weather: Weather) {
    this.weather = weather;
    this.scene.fogDensity = weather.rain > 0.1 ? 0.006 : 0.0018;
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
    // Driving takes priority over a collectible beside the road.
    if (this.actor.vehicle) {
      if (!vehicleExitAllowed(this.actor.speed)) {
        this.onNotice?.(
          "Nejdřív zastav auto: S brzdí, mezerník je ruční brzda.",
        );
        return;
      }
      if (this.network) {
        this.onAction?.("vehicle");
        return;
      }
      const exit = this.sim.exitPosition(this.actor);
      if (!exit) {
        this.onNotice?.("Vedle auta není bezpečné místo k vystoupení.");
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
        this.onNotice?.(`Nalezeno ${this.found.size}/${HUNT_POINTS.length}`);
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
      this.onNotice?.(
        "Balíček vyzvednutý. Dones jej ke vstupu B6 (značka na mapě).",
      );
    } else if (
      this.soloDelivery === 1 &&
      Math.hypot(p.x - B6_LAYOUT.entry.x, p.z - B6_LAYOUT.entry.z) < 5
    ) {
      this.soloDelivery = 2;
      this.onNotice?.("Doručeno! Odemčená kosmetická odměna.");
      this.onAction?.("reward", "Strahovský kurýr");
    } else this.onNotice?.("Přibliž se k autu, značce nebo místu úkolu.");
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
  blur = () => {
    this.keys.clear();
    this.orbiting = false;
    this.pointerPress = undefined;
    this.canvas.style.cursor = "";
  };
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
      if (e.code === "KeyR") {
        if (this.network) this.onAction?.("respawn");
        else {
          this.actor.setVehicle(false);
          this.actor.setPosition(SPAWN);
        }
      }
    }
  };
  keyUp = (e: KeyboardEvent) => this.keys.delete(e.code);
  lock = () => {
    this.canvas.focus();
    if (!this.footFirstPerson || this.uiModal) return;
    const unavailable = () => {
      if (this.disposed || !this.footFirstPerson) return;
      this.canvas.dataset.pointerMode = "drag-fallback";
      this.onNotice?.(
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
      this.pitch = Math.max(-0.55, Math.min(1.1, this.pitch + deltaY * 0.002));
    }
  };
  wheel = (e: WheelEvent) => {
    if (this.uiModal) return;
    e.preventDefault();
    this.lastCameraInput = performance.now();
    this.distance = Math.max(3, Math.min(15, this.distance + e.deltaY * 0.006));
  };
  frame() {
    if (!this.ready || this.disposed) return;
    const frameStarted = performance.now();
    const rawFrameMs = this.engine.getDeltaTime(),
      dt = Math.min(0.1, rawFrameMs / 1000);
    const gpuCounter = this.engineInstrumentation.captureGPUFrameTime
      ? this.engineInstrumentation.gpuFrameTimeCounter
      : undefined;
    if (gpuCounter && gpuCounter.count !== this.lastGpuCounterCount) {
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
    this.accumulator += dt;
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
    const forward =
        (this.keys.has("KeyW") || this.keys.has("ArrowUp") ? 1 : 0) -
        (this.keys.has("KeyS") || this.keys.has("ArrowDown") ? 1 : 0),
      side =
        (this.keys.has("KeyD") || this.keys.has("ArrowRight") ? 1 : 0) -
        (this.keys.has("KeyA") || this.keys.has("ArrowLeft") ? 1 : 0);
    if (rawFrameMs > 250) {
      this.accumulator = 0;
      this.blur();
      if (this.network) this.onAction?.("resync");
    }
    while (this.accumulator >= FIXED_DT) {
      const jumpDown = this.keys.has("Space");
      const input = canonicalInput({
        ...movementFromKeys(forward, side, this.yaw, this.actor.vehicle),
        yaw: this.yaw,
        jump: this.actor.vehicle ? jumpDown : jumpDown && !this.jumpWasDown,
        seq: ++this.seq,
        run: this.keys.has("ShiftLeft") || this.keys.has("ShiftRight"),
        vehicle: this.actor.vehicle,
      })!;
      this.jumpWasDown = jumpDown;
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
      this.sim.tick(this.trafficInstant());
      if (this.network) this.prediction.push(input, this.actor.capture());
      this.onInput?.(input);
      this.accumulator -= FIXED_DT;
    }
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
    if (self) Object.assign(self.target, this.localPlayer);
    const worldEnded = performance.now();
    const time = worldEnded / 1000;
    this.visualOffset.scaleInPlace(Math.exp(-dt * 18));
    const renderPosition = Vector3.Lerp(
      this.previousPosition,
      new Vector3(pos.x, pos.y, pos.z),
      Math.min(1, this.accumulator / FIXED_DT),
    ).add(this.visualOffset);
    for (const [id, a] of this.avatars) {
      if (id !== this.localId) {
        const pose = this.snapshots.sample(id);
        if (pose) Object.assign(a.target, pose);
      }
      const p = a.target,
        target =
          id === this.localId
            ? renderPosition.add(new Vector3(0, -0.8, 0))
            : new Vector3(p.x, p.y - 0.8, p.z);
      writeVector3(a.root.position, target.x, target.y, target.z);
      const lod = a.lod.update({
        distance: Vector3.Distance(this.camera.position, target),
        quality: this.quality,
        position: target,
        yaw: p.yaw,
        visible: !p.vehicle && !(id === this.localId && this.firstPerson),
        forceNear: id === this.localId,
      });
      if (lod.resetAnimation) a.animation.reset();
      const animationDt = a.lod.animationDelta(dt);
      if (animationDt > 0)
        a.animation.update(
          {
            position: a.root.position,
            yaw: p.yaw,
            emote: p.emote,
            vehicle: p.vehicle,
            grounded: id === this.localId ? this.actor.grounded : undefined,
            groundHeight:
              id === this.localId
                ? (x, z) =>
                    this.sim.floorHeight(x, z, a.root.position.y, this.actor)
                : undefined,
          },
          animationDt,
        );
      this.contactShadows.set(
        id,
        target,
        0.95,
        0.65,
        p.yaw,
        !p.vehicle &&
          lod.visible &&
          Vector3.Distance(this.camera.position, target) < 45 &&
          (id !== this.localId || this.actor.grounded),
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
      if (selectedAvatar)
        this.selectionMarker.position.set(
          selectedAvatar.root.position.x,
          selectedAvatar.root.position.y + 0.025,
          selectedAvatar.root.position.z,
        );
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
      Vector3.LerpToRef(
        this.previousCarPose.position,
        carPosition,
        Math.min(1, this.accumulator / FIXED_DT),
        carPosition,
      );
      Quaternion.SlerpToRef(
        this.previousCarPose.rotation,
        carRotation,
        Math.min(1, this.accumulator / FIXED_DT),
        carRotation,
      );
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
    const target = new Vector3(
      renderPosition.x,
      renderPosition.y + (this.actor.vehicle ? 0.7 : 0.6),
      renderPosition.z,
    );
    let desired =
      this.firstPerson && !this.actor.vehicle
        ? new Vector3(
            renderPosition.x,
            renderPosition.y - 0.8 + (self?.eyeHeight ?? 1.63),
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
      headlightRequested: this.car.isEnabled(),
      extraPracticalLightSlots: Number(
        this.b6Reality?.interiorLightEnabled ?? false,
      ),
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
      updateRainSegments(
        this.rainLines,
        dt,
        this.weather?.temperature ?? 10,
        wind,
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
    if (this.benchmark) {
      const b = this.benchmark;
      const breakdown = {
        simulation: simulationEnded - frameStarted,
        world: worldEnded - simulationEnded,
        avatarsAndCamera: avatarsEnded - worldEnded,
        environment: environmentEnded - avatarsEnded,
        render: renderEnded - environmentEnded,
        labels: performance.now() - renderEnded,
      };
      for (const [key, milliseconds] of Object.entries(breakdown))
        b.work[key] = (b.work[key] ?? 0) + milliseconds;
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
        this.onBenchmark?.({
          date: new Date().toISOString(),
          sourceSnapshotId: import.meta.env.VITE_SOURCE_SNAPSHOT_ID || null,
          durationSeconds: Number(
            ((performance.now() - b.start) / 1000).toFixed(2),
          ),
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
          renderer: this.engine.getGlInfo(),
          triangles: Math.round(this.scene.getActiveIndices() / 3),
          triangleCountScope: "all-render-passes",
          drawCalls: this.instrumentation.drawCallsCounter.current,
          ambient: this.transit?.counts ?? { buses: 0, passengers: 0, cars: 0 },
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
          realityPack: {
            architecture: this.worldControllers?.architecture?.metrics ?? null,
            referenceOnly: true,
            campusExterior:
              this.worldControllers?.campusExterior?.stats ?? null,
            landmarks: this.worldControllers?.landmarks?.metrics ?? null,
            b6: this.b6Reality
              ? {
                  ...this.b6Reality.stats,
                  errors: [...this.b6Reality.stats.errors],
                }
              : null,
            parkedCars: PARKING_SLOTS.length,
          },
          modelReview: captureModelReview(this.scene),
          renderCost: {
            inventory: captureRenderCostInventory(this.scene),
            shadows: this.cinematic?.stats ?? null,
            surfaces: this.surfacePack?.stats ?? null,
            vegetation: this.vegetation?.stats ?? null,
          },
          rendering: this.adaptive.state,
          gpu: this.gpu,
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
          presentationRate: this.presentationRate,
        });
      }
    }
    if (performance.now() - this.lastStats > 200) {
      this.lastStats = performance.now();
      let hint = this.actor.vehicle
        ? vehicleExitAllowed(this.actor.speed)
          ? "E · vystoupit · W/S plyn a brzda · Space ruční brzda"
          : "S · brzda / zpátečka · Space ruční brzda · po zastavení E vystoupit"
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
        zone: zoneAt(pos),
        hint,
        rendering: this.adaptive.state,
        gpu: this.gpu,
        cpuFrameMs: this.lastCpuFrameMs ?? null,
        gpuFrameMs: this.lastGpuFrameMs ?? null,
      });
    }
    this.lastCpuFrameMs = performance.now() - frameStarted;
  }
  dispose() {
    this.disposed = true;
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
    this.skyWeather.dispose();
    this.vegetation?.dispose();
    this.disposeCarAssets?.();
    this.vehicleLighting?.dispose();
    this.transit?.dispose();
    this.avatarPool.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }
}
