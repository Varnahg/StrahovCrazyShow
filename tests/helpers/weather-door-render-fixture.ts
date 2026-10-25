
import { CAD_DOOR_DEFINITIONS, CAD_DOOR_DEFINITION_HASH } from "../../shared/cad-buildings";
import { CadDoorStateStore, type CadDoorSnapshot, type CadDoorState } from "../../shared/cad-doors";
import type { CadDoorTimeline } from "../../shared/cad-door-timeline";

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
  };
}
