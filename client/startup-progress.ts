export type StartupStage =
  | "import"
  | "renderer"
  | "renderer-fallback"
  | "world-construction"
  | "presentation"
  | "physics-library"
  | "static-collisions"
  | "avatar-and-props"
  | "cad-buildings"
  | "light-preparation"
  | "submitted-frame"
  | "ready";

export const STARTUP_STAGES: readonly StartupStage[] = [
  "import",
  "renderer",
  "world-construction",
  "presentation",
  "physics-library",
  "static-collisions",
  "avatar-and-props",
  "cad-buildings",
  "light-preparation",
  "submitted-frame",
  "ready",
];

const labels: Record<StartupStage, readonly [string, string]> = {
  import: ["Načítám herní moduly", "Loading game modules"],
  renderer: ["Spouštím 3D vykreslování", "Starting the 3D renderer"],
  "renderer-fallback": [
    "Zkouším náhradní 3D vykreslování",
    "Trying the fallback 3D renderer",
  ],
  "world-construction": [
    "Sestavuji strahovský svět",
    "Building the Strahov world",
  ],
  presentation: ["Ověřuji obnovování obrazu", "Checking display timing"],
  "physics-library": ["Načítám fyziku", "Loading physics"],
  "static-collisions": [
    "Připravuji pohyb a kolize",
    "Preparing movement and collisions",
  ],
  "avatar-and-props": [
    "Načítám postavu a objekty",
    "Loading the character and objects",
  ],
  "cad-buildings": ["Načítám budovy", "Loading buildings"],
  "light-preparation": [
    "Připravuji světlo a materiály",
    "Preparing lighting and materials",
  ],
  "submitted-frame": [
    "Ověřuji první vykreslený snímek",
    "Checking the first rendered frame",
  ],
  ready: ["Kopec je připravený", "The hill is ready"],
};

export function startupStageLabel(stage: string, locale: "cs" | "en") {
  return (
    Object.hasOwn(labels, stage)
      ? labels[stage as StartupStage]
      : ["Připravuji herní scénu", "Preparing the game scene"]
  )[locale === "cs" ? 0 : 1];
}

/** Let React's loading stage reach a paint before synchronous world construction. */
export function paintStartupStage(
  signal: AbortSignal,
  schedule: typeof requestAnimationFrame = requestAnimationFrame,
  cancel: typeof cancelAnimationFrame = cancelAnimationFrame,
): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    let finished = false;
    let frame: number | undefined;
    const finish = () => {
      if (finished) return;
      finished = true;
      if (frame !== undefined) cancel(frame);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    signal.addEventListener("abort", finish, { once: true });
    frame = schedule(() => {
      if (!finished) frame = schedule(finish);
    });
  });
}

/** Presentation only: never grants readiness or changes the renderer's health gate. */
export function observeStartupProgress(
  canvas: HTMLCanvasElement,
  onStage: (stage: string) => void,
  createObserver: (callback: MutationCallback) => MutationObserver = (
    callback,
  ) => new MutationObserver(callback),
) {
  let active = true;
  let previous: string | undefined;
  const publish = () => {
    if (!active) return;
    const stage = canvas.dataset.bootStage;
    if (!stage || stage === previous) return;
    previous = stage;
    onStage(stage);
  };
  const observer = createObserver(publish);
  observer.observe(canvas, {
    attributes: true,
    attributeFilter: ["data-boot-stage"],
  });
  publish();
  return () => {
    if (!active) return;
    active = false;
    observer.disconnect();
  };
}
