import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { SceneTextureDiagnostics } from "../client/texture-diagnostics";

test("texture failure counts are scene-local, unique and detached with the scene", () => {
  const engine = new NullEngine(),
    a = new Scene(engine),
    b = new Scene(engine);
  const notices: number[] = [],
    diagnostics = new SceneTextureDiagnostics(a, (n) => notices.push(n));
  const own = new Texture(null, a),
    other = new Texture(null, b);
  Texture.OnTextureLoadErrorObservable.notifyObservers(other);
  assert.equal(diagnostics.count, 0);
  Texture.OnTextureLoadErrorObservable.notifyObservers(own);
  Texture.OnTextureLoadErrorObservable.notifyObservers(own);
  assert.equal(diagnostics.count, 1);
  assert.deepEqual(notices, [1]);
  const late = new Texture(null, a);
  a.dispose();
  Texture.OnTextureLoadErrorObservable.notifyObservers(late);
  assert.equal(diagnostics.count, 1);
  diagnostics.dispose();
  b.dispose();
  engine.dispose();
});
