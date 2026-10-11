import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import type { Scene } from "@babylonjs/core/scene";

/** Babylon's texture error observable is global. Count only this scene's failed
 * objects and detach on disposal, so another preview cannot invalidate a run.
 */
export class SceneTextureDiagnostics {
  count = 0;
  private seen = new WeakSet<BaseTexture>();
  private observer;
  private disposed = false;
  constructor(scene: Scene, onError?: (count: number) => void) {
    this.observer = Texture.OnTextureLoadErrorObservable.add((texture) => {
      if (
        this.disposed ||
        texture.getScene() !== scene ||
        this.seen.has(texture)
      )
        return;
      this.seen.add(texture);
      onError?.(++this.count);
    });
    scene.onDisposeObservable.addOnce(() => this.dispose());
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    Texture.OnTextureLoadErrorObservable.remove(this.observer);
  }
}
