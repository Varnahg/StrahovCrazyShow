import { FrameInputBuffer } from "../client/network-input-buffer";
import { NetworkTimeline } from "../client/network-timeline";
import type {
  TimelineAuthority,
  TimelineInput,
} from "../shared/input-timeline";
import type { Authority, Input } from "../shared/netcode";

export type ScriptAuthority = Authority & TimelineAuthority;
export type ScriptControls = Omit<Input, "seq">;
export type ScriptFrontier = { inputEpoch: number; seq: number };
type ControlsSource = ScriptControls | (() => ScriptControls);
type Options = {
  send: (inputs: TimelineInput[]) => void;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  onSend?: (inputs: TimelineInput[], at: number) => void;
};
const PUMP_MS = 1000 / 30;

/** SDK producer using the same bounded scheduling and sender as the game.
 * No background timer: the caller owns every pump and its lifetime. */
export class ScriptTimelineClient {
  private readonly timeline = new NetworkTimeline();
  private readonly sender: FrameInputBuffer;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private disposed = false;
  authority?: ScriptAuthority;

  constructor(options: Options) {
    this.now = options.now ?? (() => performance.now());
    this.sleep =
      options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.sender = new FrameInputBuffer({
      now: this.now,
      canSend: () => !this.disposed,
      send: (inputs) => {
        options.send(inputs as TimelineInput[]);
        options.onSend?.(inputs as TimelineInput[], this.now());
      },
      onSendError: (error) => {
        throw error;
      },
      onOverflow: () => {
        throw new Error("SDK input sender overflow");
      },
    });
  }

  acceptAuthority(authority: ScriptAuthority) {
    if (this.disposed) return false;
    const accepted = this.timeline.acceptAuthority(authority, this.now(), {
      vehicle: authority.state.vehicle,
      yaw: authority.state.yaw,
    });
    if (!accepted.accepted) return false;
    if (accepted.rebase)
      this.sender.reset(accepted.epochChanged ? "epoch" : "rebase", {
        priority: true,
      });
    this.sender.acknowledge(authority.ack);
    this.authority = authority;
    return true;
  }

  setRtt(milliseconds: number) {
    return this.timeline.setRtt(milliseconds);
  }

  step(controls: ControlsSource) {
    return this.advance(controls);
  }

  private advance(
    controls: ControlsSource,
    onProduced?: (input: TimelineInput) => void,
  ) {
    if (this.disposed) throw new Error("SDK timeline is disposed");
    const result = this.timeline.advance(
      this.now(),
      (seq) => ({
        ...(typeof controls === "function" ? controls() : controls),
        seq,
      }),
      (step) => {
        // Neutral catch-up steps represent elapsed time, never new wire input.
        if (step.source === "input") {
          if (this.sender.enqueue(step.input)) onProduced?.(step.input);
          else this.timeline.forgetInput(step.input.seq);
        }
      },
    );
    this.sender.flush("frame");
    return result;
  }

  get frontier(): ScriptFrontier {
    const snapshot = this.timeline.snapshot();
    if (snapshot.inputEpoch === null) throw new Error("SDK has no authority");
    return { inputEpoch: snapshot.inputEpoch, seq: snapshot.predictedSeq };
  }

  async holdFor(controls: ControlsSource, milliseconds: number) {
    const end = this.now() + milliseconds;
    while (this.now() < end) {
      this.step(controls);
      await this.sleep(Math.min(PUMP_MS, Math.max(0, end - this.now())));
    }
    return this.frontier;
  }

  async holdUntil(
    controls: ControlsSource,
    check: () => boolean,
    label: string,
    timeoutMs = 3000,
  ) {
    const end = this.now() + timeoutMs;
    let firstProduced: ScriptFrontier | undefined;
    for (;;) {
      if (firstProduced) {
        if (this.authority?.inputEpoch !== firstProduced.inputEpoch)
          throw new Error("SDK epoch changed during held input");
        // A prior maneuver can leave both a true condition and opposite
        // controls queued ahead. Observe the requested controls' own tick
        // before accepting the condition, even if the first pump had no work.
        if (this.authority.ack >= firstProduced.seq && check())
          return this.frontier;
      }
      if (this.now() >= end)
        throw new Error("Timed out while holding input: " + label);
      this.advance(controls, (input) => {
        firstProduced ??= { inputEpoch: input.inputEpoch, seq: input.seq };
      });
      await this.sleep(PUMP_MS);
    }
  }

  /** Resolved time passes the captured frontier even when no command arrived.
   * Do not compare ack to a growing count of produced commands or to equality. */
  async settle(frontier = this.frontier, timeoutMs = 3000) {
    const end = this.now() + timeoutMs;
    for (;;) {
      if (this.disposed) throw new Error("SDK timeline is disposed");
      if (this.authority?.inputEpoch !== frontier.inputEpoch)
        throw new Error("SDK epoch changed before scheduled input settled");
      this.sender.flush("timer");
      if (
        this.authority.ack >= frontier.seq &&
        this.sender.snapshot().queued === 0
      )
        return;
      if (this.now() >= end)
        throw new Error("Timed out settling scheduled input");
      await this.sleep(10);
    }
  }

  snapshot() {
    return {
      timeline: this.timeline.snapshot(),
      sender: this.sender.snapshot(),
    };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.sender.dispose();
  }
}
