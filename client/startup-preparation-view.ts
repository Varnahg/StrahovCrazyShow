import type { Authority } from "../shared/netcode";
import type { Player, Vec3 } from "../shared/types";
import { validTimelineAuthority } from "../shared/input-timeline";
import type { AuthorityOffer } from "./authority-buffer";

export type StartupAuthorityView = {
  inputEpoch: number;
  tick: number;
  receivedAt: number;
  position: Vec3;
  yaw: number;
  vehicle: boolean;
  grounded?: boolean;
};
export type StartupPreparationSnapshot = {
  ownerGeneration: number;
  selfId: string;
  authority: StartupAuthorityView | null;
  players: readonly Player[];
  rosterKey: string;
};
export type StartupPreparationSource = () => StartupPreparationSnapshot | null;

/** Presentation copy only. This never takes, resets, acknowledges or replays a
 * packet. The UI calls offer only after its real AuthorityBuffer accepts it. */
export class StartupPreparationViews {
  private owner?: object;
  private selfId = "";
  private attempt = -1;
  private generation = 0;
  private authority: StartupAuthorityView | null = null;

  begin(owner: object, selfId: string, attempt: number) {
    this.reset();
    this.owner = owner;
    this.selfId = selfId;
    this.attempt = attempt;
  }
  reset() {
    this.generation++;
    this.owner = undefined;
    this.authority = null;
  }
  finish(owner: object) {
    if (this.owner === owner) this.reset();
  }
  identify(owner: object, selfId: string, attempt: number) {
    if (owner === this.owner && (selfId !== this.selfId || attempt !== this.attempt)) this.begin(owner, selfId, attempt);
  }
  offer(owner: object, packet: Authority, receivedAt: number, accepted: AuthorityOffer) {
    if (owner !== this.owner || accepted.kind === "rejected" || !validTimelineAuthority(packet) ||
        !Number.isFinite(receivedAt) || receivedAt < 0 || !packet.state ||
        typeof packet.state.vehicle !== "boolean" || !Number.isFinite(packet.state.yaw)) return false;
    const position = packet.state.position;
    if (!position || ![position.x, position.y, position.z].every(value => Number.isFinite(value) && Number.isFinite(Math.fround(value)))) return false;
    this.authority = { inputEpoch: packet.inputEpoch, tick: packet.tick, receivedAt,
      position: { x: position.x, y: position.y, z: position.z }, yaw: packet.state.yaw, vehicle: packet.state.vehicle,
      grounded: typeof packet.state.grounded === "boolean" ? packet.state.grounded : undefined };
    return true;
  }
  read(owner: object, selfId: string, attempt: number, players: readonly Player[]): StartupPreparationSnapshot | null {
    if (owner !== this.owner || selfId !== this.selfId || attempt !== this.attempt) return null;
    const rosterKey = JSON.stringify(players.map(player => [player.id, player.avatar]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
    return { ownerGeneration: this.generation, selfId, authority: this.authority, players, rosterKey };
  }
}

/** Millimetre stability is a revision policy, not geometric equivalence. Exact
 * latest pose and actual rendered coverage are checked independently. */
export function startupViewKey(snapshot: StartupPreparationSnapshot) {
  const view = snapshot.authority;
  return JSON.stringify([snapshot.ownerGeneration, snapshot.selfId, view?.inputEpoch ?? null,
    view?.vehicle ?? null, ...(view ? [view.position.x, view.position.y, view.position.z].map(value => Math.round(value * 1000)) : []),
    snapshot.rosterKey]);
}

/** One30s visible submitted-frame budget, shared by initial gate and handshake.
 * Quality preparation's existing independent90s budget is not changed. */
export class StartupViewGateBudget {
  private elapsed = 0;
  private at: number;
  private visible: boolean;
  constructor(private now: () => number, visible: boolean) {
    this.at = now();
    this.visible = visible;
  }
  visibility(visible: boolean) {
    const at = this.now();
    if (this.visible) this.elapsed += Math.max(0, at - this.at);
    this.at = at;
    this.visible = visible;
  }
  remaining() {
    return Math.max(0, 30000 - this.elapsed - (this.visible ? Math.max(0, this.now() - this.at) : 0));
  }
}
