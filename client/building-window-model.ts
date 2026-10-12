import source from "../shared/data/building-window-kit.json";

export type WindowModelRole = "frame" | "gasket" | "reveal" | "sill";
export type WindowModelPrimitive = {
  role: string;
  nominalWidth: number;
  nominalHeight: number;
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
  resizeWeights: number[];
  normalMode?: string;
};
export type WindowModelGeometry = {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
};
export type WindowModelKit = {
  schemaVersion: number;
  level: string;
  nominal: { width: number; height: number; depth: number; glassZ: number };
  construction: {
    outerFrameWidth: number;
    mullionWidth: number;
    transomHeight: number;
  };
  primitives: Record<string, WindowModelPrimitive>;
};
export type WindowModelShape = {
  w: number;
  h: number;
  panes: number;
  transom?: number;
  depth: number;
};
type Part = WindowModelGeometry & { role: WindowModelRole };
type VertexBatch = WindowModelGeometry & { colors?: number[] };
export type WindowModelPlacement = {
  x: number;
  y: number;
  z: number;
  tx: number;
  tz: number;
  nx: number;
  nz: number;
};

/** Actual Blender evaluated topology; highest authoring geometry is archived
 * separately and is never downloaded by the runtime. All dimensions are metres. */
export const BUILDING_WINDOW_KIT = source;

/** Apply the inverse transpose of a general 3x3 row-major affine transform.
 * Corner-anchored profile resizing is piecewise affine, not uniform scaling. */
export function transformWindowNormal(
  normal: readonly number[],
  matrix: readonly number[],
): [number, number, number] {
  return applyNormalMatrix(
    normal[0],
    normal[1],
    normal[2],
    inverseTranspose(matrix),
  );
}

function inverseTranspose(matrix: readonly number[]) {
  const [a, b, c, d, e, f, g, h, i] = matrix;
  const cofactors = [
    e * i - f * h,
    f * g - d * i,
    d * h - e * g,
    c * h - b * i,
    a * i - c * g,
    b * g - a * h,
    b * f - c * e,
    c * d - a * f,
    a * e - b * d,
  ];
  const determinant = a * cofactors[0] + b * cofactors[1] + c * cofactors[2];
  if (Math.abs(determinant) < 1e-12)
    throw new Error("Singular building window profile transform");
  for (let i = 0; i < 9; i++) cofactors[i] /= determinant;
  return cofactors;
}

function applyNormalMatrix(
  nx: number,
  ny: number,
  nz: number,
  matrix: readonly number[],
): [number, number, number] {
  const x = matrix[0] * nx + matrix[1] * ny + matrix[2] * nz,
    y = matrix[3] * nx + matrix[4] * ny + matrix[5] * nz,
    z = matrix[6] * nx + matrix[7] * ny + matrix[8] * nz,
    length = Math.hypot(x, y, z);
  if (!(length > 1e-12)) throw new Error("Invalid building window normal");
  return [x / length, y / length, z / length];
}

/** Preserve the Blender profile and its split normals while moving its corner
 * anchors. The weight gradient on each source triangle provides the actual
 * deformation Jacobian, including the sloped sill and resized reveal depth. */
export function resizeWindowPrimitive(
  primitive: WindowModelPrimitive,
  width: number,
  height: number,
  depth = source.nominal.depth,
  nominalDepth = source.nominal.depth,
): WindowModelGeometry {
  const { positions, normals, resizeWeights: weights, indices } = primitive;
  const deltas = [
    width - primitive.nominalWidth,
    height - primitive.nominalHeight,
    nominalDepth - depth,
  ];
  const result: WindowModelGeometry = {
    positions: positions.map(
      (value, index) => value + weights[index] * deltas[index % 3],
    ),
    normals: new Array<number>(normals.length).fill(0),
    uvs: primitive.uvs.slice(),
    indices,
  };
  if (deltas.every((delta) => delta === 0)) {
    result.normals = normals.slice();
    return result;
  }
  result.uvs.fill(0);
  const contributions = new Uint16Array(positions.length / 3);
  for (let triangle = 0; triangle < indices.length; triangle += 3) {
    const ia = indices[triangle] * 3,
      ib = indices[triangle + 1] * 3,
      ic = indices[triangle + 2] * 3;
    const ab = [
        positions[ib] - positions[ia],
        positions[ib + 1] - positions[ia + 1],
        positions[ib + 2] - positions[ia + 2],
      ],
      ac = [
        positions[ic] - positions[ia],
        positions[ic + 1] - positions[ia + 1],
        positions[ic + 2] - positions[ia + 2],
      ];
    const aa = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2,
      cc = ac[0] ** 2 + ac[1] ** 2 + ac[2] ** 2,
      bc = ab[0] * ac[0] + ab[1] * ac[1] + ab[2] * ac[2],
      gram = aa * cc - bc * bc;
    if (!(gram > 1e-20)) throw new Error("Degenerate Blender window triangle");
    const jacobian = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    for (let axis = 0; axis < 3; axis++) {
      const wb = weights[ib + axis] - weights[ia + axis],
        wc = weights[ic + axis] - weights[ia + axis],
        u = (wb * cc - wc * bc) / gram,
        v = (wc * aa - wb * bc) / gram;
      for (let column = 0; column < 3; column++)
        jacobian[axis * 3 + column] +=
          deltas[axis] * (ab[column] * u + ac[column] * v);
    }
    const normalMatrix = inverseTranspose(jacobian);
    const au = (ia / 3) * 2,
      bu = (ib / 3) * 2,
      cu = (ic / 3) * 2;
    const uvGradients = [0, 1].map((axis) => {
      const db = primitive.uvs[bu + axis] - primitive.uvs[au + axis],
        dc = primitive.uvs[cu + axis] - primitive.uvs[au + axis],
        u = (db * cc - dc * bc) / gram,
        v = (dc * aa - db * bc) / gram;
      return ab.map((value, column) => value * u + ac[column] * v);
    });
    for (const offset of [ia, ib, ic]) {
      const normal = applyNormalMatrix(
        normals[offset],
        normals[offset + 1],
        normals[offset + 2],
        normalMatrix,
      );
      for (let axis = 0; axis < 3; axis++)
        result.normals[offset + axis] += normal[axis];
      const uvOffset = (offset / 3) * 2;
      for (let axis = 0; axis < 2; axis++) {
        let uv = primitive.uvs[uvOffset + axis];
        for (let column = 0; column < 3; column++)
          uv +=
            uvGradients[axis][column] *
            (result.positions[offset + column] - positions[offset + column]);
        result.uvs[uvOffset + axis] += uv;
      }
      contributions[offset / 3]++;
    }
  }
  for (let vertex = 0; vertex < result.normals.length; vertex += 3) {
    const length = Math.hypot(
      result.normals[vertex],
      result.normals[vertex + 1],
      result.normals[vertex + 2],
    );
    for (let axis = 0; axis < 3; axis++)
      result.normals[vertex + axis] /= length;
    for (let axis = 0; axis < 2; axis++)
      result.uvs[(vertex / 3) * 2 + axis] /= contributions[vertex / 3];
  }
  return result;
}

/** Shared only during one architecture build. There are no per-frame window
 * objects, async asset loads, scene observers or retained global shape caches. */
export function createBuildingWindowModelCache(kit: WindowModelKit = source) {
  const primitives = kit.primitives,
    FRAME = kit.construction.outerFrameWidth,
    MULLION = kit.construction.mullionWidth,
    TRANSOM = kit.construction.transomHeight;
  const shapes = new Map<string, readonly Part[]>();
  return {
    get(shape: WindowModelShape): readonly Part[] {
      const { w, h, panes, transom, depth } = shape;
      const key = [w, h, panes, transom ?? "", depth].join("/");
      const cached = shapes.get(key);
      if (cached) return cached;
      const parts: Part[] = [];
      const add = (
        name: string,
        width: number,
        height: number,
        x = 0,
        y = 0,
      ) => {
        if (width <= 0 || height <= 0)
          throw new Error("Invalid building window cell");
        const primitive = primitives[name];
        if (!primitive)
          throw new Error(`Missing Blender window primitive: ${name}`);
        const geometry = resizeWindowPrimitive(
          primitive,
          width,
          height,
          depth,
          kit.nominal.depth,
        );
        for (let vertex = 0; vertex < geometry.positions.length; vertex += 3) {
          geometry.positions[vertex] += x;
          geometry.positions[vertex + 1] += y;
        }
        parts.push({ ...geometry, role: primitive.role as WindowModelRole });
      };
      add("reveal", w, h);
      add("outerFrame", w, h);
      add("sill", w, h);
      const rows =
        transom === undefined
          ? [[FRAME, h - FRAME]]
          : [
              [FRAME, transom],
              [transom + TRANSOM, h - FRAME],
            ];
      if (transom !== undefined)
        add("transom", w - FRAME * 2, TRANSOM, FRAME, transom);
      for (let pane = 1; pane < panes; pane++)
        for (const [bottom, top] of rows)
          add(
            "mullion",
            MULLION,
            top - bottom,
            (w * pane) / panes - MULLION / 2,
            bottom,
          );
      for (let pane = 0; pane < panes; pane++) {
        const left = pane === 0 ? FRAME : (w * pane) / panes + MULLION / 2,
          right =
            pane === panes - 1
              ? w - FRAME
              : (w * (pane + 1)) / panes - MULLION / 2;
        for (const [bottom, top] of rows) {
          add("sash", right - left, top - bottom, left, bottom);
          add("gasket", right - left, top - bottom, left, bottom);
        }
      }
      shapes.set(key, parts);
      return parts;
    },
    clear() {
      shapes.clear();
    },
    get size() {
      return shapes.size;
    },
  };
}

/** Append into the existing building/material batch. A mirrored edge basis
 * flips winding once; normals follow the same world transform as vertices. */
export function appendBuildingDetailGeometry(
  target: VertexBatch,
  part: WindowModelGeometry,
  placement: WindowModelPlacement,
  tint?: readonly [number, number, number],
  uvMetresPerRepeat = 1,
) {
  const { x, y, z, tx, tz, nx, nz } = placement,
    offset = target.positions.length / 3;
  const determinant = tx * nz - nx * tz;
  if (
    Math.abs(Math.abs(determinant) - 1) > 1e-6 ||
    Math.abs(tx * tx + tz * tz - 1) > 1e-6 ||
    Math.abs(nx * nx + nz * nz - 1) > 1e-6 ||
    Math.abs(tx * nx + tz * nz) > 1e-6
  )
    throw new Error("Window facade basis must be orthonormal");
  if (tint && !target.colors)
    target.colors = new Array<number>(offset * 4).fill(1);
  for (let vertex = 0; vertex < part.positions.length; vertex += 3) {
    const px = part.positions[vertex],
      py = part.positions[vertex + 1],
      pz = part.positions[vertex + 2],
      ax = part.normals[vertex],
      ay = part.normals[vertex + 1],
      az = part.normals[vertex + 2];
    target.positions.push(x + tx * px + nx * pz, y + py, z + tz * px + nz * pz);
    target.normals.push(tx * ax + nx * az, ay, tz * ax + nz * az);
    target.uvs.push(
      part.uvs[(vertex / 3) * 2] / uvMetresPerRepeat,
      part.uvs[(vertex / 3) * 2 + 1] / uvMetresPerRepeat,
    );
    if (target.colors)
      target.colors.push(tint?.[0] ?? 1, tint?.[1] ?? 1, tint?.[2] ?? 1, 1);
  }
  for (let triangle = 0; triangle < part.indices.length; triangle += 3)
    target.indices.push(
      offset + part.indices[triangle],
      offset + part.indices[triangle + (determinant > 0 ? 1 : 2)],
      offset + part.indices[triangle + (determinant > 0 ? 2 : 1)],
    );
}
