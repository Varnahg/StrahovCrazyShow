import type { AtmosphereSky } from "../../client/atmosphere-sky";
import { CAD_DOOR_DEFINITIONS, CAD_DOOR_DEFINITION_HASH } from "../../shared/cad-buildings";
import { CadDoorStateStore, type CadDoorSnapshot, type CadDoorState } from "../../shared/cad-doors";
import type { CadDoorTimeline } from "../../shared/cad-door-timeline";
import { createRenderPreferences, resolveVisualSettings, renderBudget } from "../../shared/render-quality";

/** Constructor state only; extracted tests still execute Game's real methods. */
export function graphicsLifecycleFixture() {
  return {
    graphicsApplying: false,
    graphicsState: { applying: false, phase: null, error: null, restartRequired: false },
    graphicsSettingsRevision: 0,
    visualLoadRevision: 0,
    pendingVisualLoad: false,
    visualLoadError: undefined,
    adaptive: { state: { mode: "auto", quality: "medium", targetFps: 60, hardwareScaling: 1 } },
  };
}

export const graphicsFixtureEnvironment = { createRenderPreferences, resolveVisualSettings, renderBudget };
export const graphicsFixtureMembers = ["getEffectiveVisualSettings", "publishVisualFeatures", "setVegetationFeatures"];

/** These bounded material fixtures replace sky IO, but retain its light contract. */
export function unoccludedAtmosphereFixture<Material>(material: Material) {
  return {
    material,
    lightTransmission: { sun: 1, moon: 1 },
    update() {},
    dispose() {},
  } satisfies Pick<AtmosphereSky, "lightTransmission" | "update" | "dispose"> & {
    material: Material;
  };
}

/** Per-instance state normally initialized by Game fields, without physics/GPU IO. */
export function doorLifecycleFixture() {
  return {
    guestDoors: new CadDoorStateStore(CAD_DOOR_DEFINITIONS, {
      worldEpoch: "guest-local",
      definitionHash: CAD_DOOR_DEFINITION_HASH,
    }),
    doorTimeline: null as CadDoorTimeline | null,
    doorSnapshot: null as CadDoorSnapshot | null,
    doorStates: new Map<string, CadDoorState>(),
    predictionDoorRevisions: new Map<number, number>(),
    skyDiagnosticPanel: undefined as { remove(): void } | undefined,
  };
}
