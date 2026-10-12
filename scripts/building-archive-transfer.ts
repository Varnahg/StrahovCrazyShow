import {
  closeSync,
  openSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";

/** Sub-micrometre rounding bounds file size without erasing modelled bevels. */
export const ARCHIVE_COORDINATE_STEP = 0.000001;

export function archiveNumber(value: number) {
  if (!Number.isFinite(value))
    throw new Error("Non-finite building archive value");
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  if (!Number.isFinite(rounded))
    throw new Error("Building archive value exceeds numeric range");
  return rounded === 0 ? 0 : rounded;
}

function compact(values: ArrayLike<number>) {
  const result = new Array<number>(values.length);
  for (let i = 0; i < values.length; i++) result[i] = archiveNumber(values[i]);
  return result;
}

export function bakeBuildingArchiveGeometry(
  data: {
    positions: ArrayLike<number>;
    normals: ArrayLike<number>;
    indices: ArrayLike<number>;
    uvs?: ArrayLike<number>;
    colors?: ArrayLike<number>;
  },
  world: Matrix,
  origin: { x: number; y: number; z: number },
) {
  const count = data.positions.length / 3;
  if (
    !Number.isInteger(count) ||
    data.normals.length !== data.positions.length ||
    data.indices.length % 3
  )
    throw new Error("Malformed building geometry");
  if (data.uvs?.length && data.uvs.length !== count * 2)
    throw new Error("Malformed building UVs");
  if (data.colors?.length && data.colors.length !== count * 4)
    throw new Error("Malformed building colours");
  const positions = new Array<number>(data.positions.length),
    normals = new Array<number>(data.normals.length),
    normalMatrix = Matrix.Identity(),
    p = Vector3.Zero(),
    n = Vector3.Zero();
  world.toNormalMatrix(normalMatrix);
  let maxCoordinateRoundingErrorMetres = 0;
  for (let i = 0; i < data.positions.length; i += 3) {
    Vector3.TransformCoordinatesFromFloatsToRef(
      data.positions[i],
      data.positions[i + 1],
      data.positions[i + 2],
      world,
      p,
    );
    p.x -= origin.x;
    p.y -= origin.y;
    p.z -= origin.z;
    n.set(data.normals[i], data.normals[i + 1], data.normals[i + 2]);
    Vector3.TransformNormalToRef(n, normalMatrix, n);
    if (!(n.lengthSquared() > 0)) throw new Error("Zero building normal");
    n.normalize();
    for (let axis = 0; axis < 3; axis++) {
      const position = axis === 0 ? p.x : axis === 1 ? p.y : p.z;
      const normal = axis === 0 ? n.x : axis === 1 ? n.y : n.z;
      positions[i + axis] = archiveNumber(position);
      normals[i + axis] = archiveNumber(normal);
      maxCoordinateRoundingErrorMetres = Math.max(
        maxCoordinateRoundingErrorMetres,
        Math.abs(positions[i + axis] - position),
      );
    }
  }
  const indices = Array.from(data.indices);
  if (
    indices.some(
      (index) => !Number.isInteger(index) || index < 0 || index >= count,
    )
  )
    throw new Error("Invalid building index");
  let reversedForGltf = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3,
      b = indices[i + 1] * 3,
      c = indices[i + 2] * 3;
    const ux = positions[b] - positions[a],
      uy = positions[b + 1] - positions[a + 1],
      uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a],
      vy = positions[c + 1] - positions[a + 1],
      vz = positions[c + 2] - positions[a + 2];
    if (
      (uy * vz - uz * vy) * normals[a] +
        (uz * vx - ux * vz) * normals[a + 1] +
        (ux * vy - uy * vx) * normals[a + 2] <
      0
    ) {
      [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
      reversedForGltf++;
    }
  }
  return {
    positions,
    normals,
    indices,
    uvs: compact(data.uvs ?? []),
    colors: compact(data.colors ?? []),
    winding: { convention: "outward-CCW", reversedForGltf },
    maxCoordinateRoundingErrorMetres,
  };
}

/** Serialize one building at a time, avoiding one giant V8 JSON string. Existing
 * archives survive a failed model iterator/write; the completed file is swapped. */
export function writeBuildingArchive(
  path: string,
  header: Record<string, unknown>,
  models: Iterable<unknown>,
) {
  if (Object.hasOwn(header, "models"))
    throw new Error("Models must be supplied separately");
  const temp = path + ".writing";
  let descriptor: number | undefined,
    created = false,
    count = 0;
  try {
    descriptor = openSync(temp, "wx");
    created = true;
    const start = JSON.stringify(header);
    writeFileSync(
      descriptor,
      start.slice(0, -1) + (start.length > 2 ? "," : "") + '"models":[',
    );
    for (const model of models) {
      const encoded = JSON.stringify(model);
      if (encoded === undefined)
        throw new Error("Building model is not JSON serializable");
      writeFileSync(descriptor, (count ? "," : "") + encoded);
      count++;
    }
    writeFileSync(descriptor, "]}\n");
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temp, path);
    created = false;
    return { models: count, bytes: statSync(path).size };
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (created) unlinkSync(temp);
  }
}

/** Match split GLB vertices to their source corner, including coincident hard
 * edges. Position alone cannot verify a bevel's authored shading or UV seam. */
export function verifyBuildingArchiveAttributes(
  source: {
    name: string;
    positions: number[];
    normals: number[];
    uvs: number[];
    colors: number[];
  },
  exported: {
    positions: number[][];
    normals: number[][];
    uvs?: number[][];
    colors?: number[][];
  },
) {
  const candidates = new Map<string, number[]>();
  const key = (x: number, y: number, z: number) =>
    `${Math.fround(x)}:${Math.fround(y)}:${Math.fround(z)}`;
  for (let i = 0; i < source.positions.length; i += 3) {
    const k = key(
      source.positions[i],
      source.positions[i + 1],
      source.positions[i + 2],
    );
    const previous = candidates.get(k);
    if (previous) previous.push(i / 3);
    else candidates.set(k, [i / 3]);
  }
  const count = exported.positions.length;
  if (
    exported.normals.length !== count ||
    (source.uvs.length && exported.uvs?.length !== count) ||
    (source.colors.length && exported.colors?.length !== count)
  )
    throw new Error(`${source.name}: lost vertex attributes`);
  let maxNormalError = 0,
    maxColorError = 0,
    maxUvError = 0;
  for (let i = 0; i < count; i++) {
    const p = exported.positions[i],
      n = exported.normals[i],
      uv = exported.uvs?.[i],
      color = exported.colors?.[i];
    if (Math.abs(Math.hypot(...n) - 1) > 0.0002)
      throw new Error(`${source.name}: non-unit normal`);
    const indices = candidates.get(key(p[0], p[1], p[2])) ?? [];
    let matched = false;
    for (const j of indices) {
      const normalLength = Math.hypot(
        source.normals[j * 3],
        source.normals[j * 3 + 1],
        source.normals[j * 3 + 2],
      );
      const normalError = Math.max(
        ...n.map((value, axis) =>
          Math.abs(value - source.normals[j * 3 + axis] / normalLength),
        ),
      );
      const colorError = color
        ? Math.max(
            ...color.map((value, axis) =>
              Math.abs(
                value -
                  (source.colors.length ? source.colors[j * 4 + axis] : 1),
              ),
            ),
          )
        : 0;
      // Blender converts its bottom-left UV origin to glTF's top-left origin.
      const uvError =
        uv && source.uvs.length
          ? Math.max(
              Math.abs(uv[0] - source.uvs[j * 2]),
              Math.abs(uv[1] - (1 - source.uvs[j * 2 + 1])),
            )
          : 0;
      if (
        normalError > 0.0002 ||
        colorError > 1 / 255 + 0.000001 ||
        uvError > 0.00004
      )
        continue;
      maxNormalError = Math.max(maxNormalError, normalError);
      maxColorError = Math.max(maxColorError, colorError);
      maxUvError = Math.max(maxUvError, uvError);
      matched = true;
      break;
    }
    if (!matched)
      throw new Error(
        `${source.name}: GLB vertex ${i} changed position, normal, colour or UV`,
      );
  }
  return {
    vertices: count,
    coloredVertices: source.colors.length ? count : 0,
    maxNormalError,
    maxColorError,
    maxUvError,
  };
}
