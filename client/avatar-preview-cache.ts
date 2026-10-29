type PreviewWorkHost = {
  render(): void;
  ready(): boolean;
  requestFrame(callback: () => void): number;
  cancelFrame(id: number): void;
  requestCheck(callback: () => void): number;
  cancelCheck(id: number): void;
};

/** One pending draw and readiness retry; suspended previews retain no work. */
export class AvatarPreviewFrameWork {
  private active = true;
  private disposed = false;
  private frame: number | undefined;
  private check: number | undefined;
  private needsReady = true;
  private generation = 0;

  constructor(private readonly host: PreviewWorkHost) {}

  invalidate(checkReady = false) {
    if (this.disposed) return;
    this.needsReady ||= checkReady;
    if (!this.active || this.frame !== undefined) return;
    const generation = this.generation;
    this.frame = this.host.requestFrame(() => {
      if (generation !== this.generation) return;
      this.frame = undefined;
      if (this.disposed || !this.active) return;
      if (this.needsReady) {
        this.needsReady = !this.host.ready();
        if (this.needsReady && this.check === undefined) {
          this.check = this.host.requestCheck(() => {
            if (generation !== this.generation) return;
            this.check = undefined;
            this.invalidate();
          });
        } else if (!this.needsReady && this.check !== undefined) {
          this.host.cancelCheck(this.check);
          this.check = undefined;
        }
      }
      // Check before drawing so the first ready effect is actually presented;
      // an on-demand preview has no following frame to repair a blank result.
      this.host.render();
    });
  }

  setActive(active: boolean) {
    if (this.disposed || this.active === active) return;
    this.active = active;
    if (active) this.invalidate();
    else this.cancelPending();
  }

  private cancelPending() {
    this.generation++;
    if (this.frame !== undefined) this.host.cancelFrame(this.frame);
    if (this.check !== undefined) this.host.cancelCheck(this.check);
    this.frame = this.check = undefined;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelPending();
  }
}
