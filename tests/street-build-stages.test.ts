import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { STREET_SURFACES, STREETS } from "../shared/streets";
import {
  buildStreets,
  streetBuildSteps,
  streetVertexData,
  streetTransitionSegments,
  streetTransitionVertexData,
} from "../client/streets-renderer";
import {
  createWorldBuildStagesJob,
  type WorldBuildPhaseTiming,
} from "../client/world-build-stages";
import type { PointLight } from "@babylonjs/core/Lights/pointLight";

// Captured from the unmodified pre-staging implementation on 13 Oct 2026,
// before applying this change. These verify original data/order, not merely two
// consumers of the newly refactored generator. Intentional map/terrain changes
// must update this reference with the corresponding source/geometry review.
const REFERENCE = {
  source: "7ff214452c91162fffc77809bd7c07f9511e694d2a7b48bc316d7b5865cedb62",
  surfaces: {
    asphalt: "d79282a1cbfa2394f41d9c48cf5f6e2df457d64318a5280a26ed41a88fabc4bf",
    sett: "26a146495314c77c048951151eba6188ba6d4d211b51cbca7afabb2308e9f239",
    paving: "aa56c1164c52b5c5335a8da5a5b41f5a82a5a46863d4255739d2144ed198c187",
    gravel: "139bdedfb21af52da5f0b17307624f59bace725ee5bc6b67974bd83f734a0585",
  },
  transitionSegments:
    "5604c24c16a50bc2f325c016fa9e6cae9a9d7a7f741340312632fe43029e837b",
  transitionData:
    "05d3026160f68a45fb049748c26f811dba54ef0cc99c0d89890029abd1d841d1",
  meshes: "f825bdbaa35b1a7586c8dc891e34e9a5a5d196f2efd06b9806a5d128fd8b8367",
  lamps: "95f1b458f093c2d59363e3ed017a07f4d53f45480626dc943145e105bd43034d",
};
type Buffers = {
  positions?: ArrayLike<number> | null;
  normals?: ArrayLike<number> | null;
  uvs?: ArrayLike<number> | null;
  indices?: ArrayLike<number> | null;
};
function bufferHash(data: Buffers) {
  const hash = createHash("sha256");
  for (const key of ["positions", "normals", "uvs", "indices"] as const) {
    hash.update(key);
    hash.update(Buffer.from(Float64Array.from(data[key] ?? []).buffer));
  }
  return hash.digest("hex");
}
const objectHash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
function fixture() {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const lights: PointLight[] = [];
  return {
    context: { scene, lights },
    dispose: () => {
      scene.dispose();
      engine.dispose();
    },
  };
}
function renderedHash(result: ReturnType<typeof buildStreets>) {
  return objectHash(
    result.meshes.map((mesh) => ({
      name: mesh.name,
      data: bufferHash({
        positions: mesh.getVerticesData("position"),
        normals: mesh.getVerticesData("normal"),
        uvs: mesh.getVerticesData("uv"),
        indices: mesh.getIndices(),
      }),
      submeshes: mesh.subMeshes.map((sub) => [
        sub.materialIndex,
        sub.indexStart,
        sub.indexCount,
        sub.verticesStart,
        sub.verticesCount,
      ]),
      material: mesh.material?.name,
      metadata: mesh.metadata,
    })),
  );
}
function lampsHash(lights: PointLight[]) {
  return objectHash(
    lights.map((light) => ({
      name: light.name,
      position: light.position.asArray(),
      range: light.range,
      intensity: light.intensity,
      enabled: light.isEnabled(),
      diffuse: light.diffuse.asArray(),
      falloff: light.falloffType,
      metadata: light.metadata,
    })),
  );
}

test(
  "all surface and flush-joint buffers remain bit-identical to the pre-staging implementation",
  { timeout: 30000 },
  () => {
    assert.equal(STREETS.sourceSha256, REFERENCE.source);
    for (const surface of STREET_SURFACES)
      assert.equal(
        bufferHash(streetVertexData(surface.polygons)),
        REFERENCE.surfaces[surface.material],
        surface.material,
      );
    const transitions = streetTransitionSegments();
    assert.equal(objectHash(transitions), REFERENCE.transitionSegments);
    assert.equal(
      bufferHash(streetTransitionVertexData(transitions)),
      REFERENCE.transitionData,
    );
  },
);

test(
  "aborting during transition construction cannot publish a partial cache or schedule later street mutations",
  { timeout: 30000 },
  async () => {
    const host = fixture(),
      abort = new AbortController();
    let reached = false;
    try {
      const job = createWorldBuildStagesJob(streetBuildSteps(host.context), {
        signal: abort.signal,
        onPhase: (phase) => {
          if (phase.phase === "streets-transition-surfaces") {
            reached = true;
            abort.abort();
          }
        },
      });
      await assert.rejects(job.run(), { name: "AbortError" });
      assert.equal(reached, true);
      const before = host.context.scene.meshes.length;
      await new Promise((resolve) => setTimeout(resolve, 5));
      assert.equal(host.context.scene.meshes.length, before);
      assert.equal(host.context.lights.length, 0);
      assert.equal(
        host.context.scene.isDisposed,
        false,
        "partial scene remains host-owned",
      );
    } finally {
      host.dispose();
    }
  },
);

test(
  "sync and scheduled streets preserve original render chunks, mesh order, materials and lamp provenance",
  { timeout: 30000 },
  async (t) => {
    for (const scheduled of [false, true]) {
      const host = fixture(),
        phases: WorldBuildPhaseTiming[] = [];
      try {
        const result = scheduled
          ? await createWorldBuildStagesJob(streetBuildSteps(host.context), {
              onPhase: (phase) => phases.push(phase),
            }).run()
          : buildStreets(host.context);
        assert.equal(renderedHash(result), REFERENCE.meshes);
        assert.equal(lampsHash(host.context.lights), REFERENCE.lamps);
        assert.equal(result.meshes.length, 9);
        assert.equal(result.lamps, 38);
        assert.equal(result.crossings, 6);
        assert.equal(
          result.transitions,
          819,
          "cancelled earlier construction did not cache a prefix",
        );
        if (scheduled) {
          const asphalt = phases.find(
            (phase) => phase.phase === "streets-surface-asphalt",
          )!;
          assert.ok(
            asphalt.operations > 250,
            "large source polygons must yield inside draping, not once per polygon",
          );
          assert.ok(phases.every((phase) => phase.outcome === "complete"));
          t.diagnostic(
            JSON.stringify({
              scope: "NullEngine CPU smoke; not production/GPU evidence",
              phases: phases.map(
                ({
                  phase,
                  operations,
                  cpuMs,
                  maxOperation,
                  maxOperationMs,
                }) => ({
                  phase,
                  operations,
                  cpuMs: Math.round(cpuMs),
                  maxOperation,
                  maxOperationMs: Math.round(maxOperationMs),
                }),
              ),
            }),
          );
        }
      } finally {
        host.dispose();
      }
    }
  },
);
