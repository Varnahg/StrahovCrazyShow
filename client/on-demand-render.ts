export type OnDemandRenderHost = {
  requestFrame(callback: () => void): number;
  cancelFrame(handle: number): void;
  visible(): boolean;
  /** True requests another preparation frame after this operation settles. */
  frame(): boolean | Promise<boolean>;
  onError(error: unknown): void;
};

/** One queued frame and one in-flight submission at most. Requests made while
 * submitting are coalesced and hidden canvases keep their dirty state. */
export class OnDemandRender {
  private handle: number | undefined;
  private dirty = false;
  private inFlight = false;
  private disposed = false;

  constructor(private readonly host: OnDemandRenderHost) {}

  request() {
    if (this.disposed) return;
    this.dirty = true;
    this.schedule();
  }

  visibilityChanged() {
    if (!this.host.visible()) {
      if (this.handle !== undefined) this.host.cancelFrame(this.handle);
      this.handle = undefined;
    } else this.request();
  }

  private schedule() {
    if (
      this.disposed ||
      this.handle !== undefined ||
      this.inFlight ||
      !this.dirty ||
      !this.host.visible()
    )
      return;
    this.handle = this.host.requestFrame(() => {
      this.handle = undefined;
      void this.run();
    });
  }

  private async run() {
    if (this.disposed || !this.host.visible()) return;
    this.dirty = false;
    this.inFlight = true;
    try {
      const again = await this.host.frame();
      if (!this.disposed && again) this.dirty = true;
    } catch (error) {
      if (!this.disposed) {
        this.dirty = false;
        this.host.onError(error);
      }
    } finally {
      this.inFlight = false;
      this.schedule();
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.dirty = false;
    if (this.handle !== undefined) this.host.cancelFrame(this.handle);
    this.handle = undefined;
  }
}
