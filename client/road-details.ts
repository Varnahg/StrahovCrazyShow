import type { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import "@babylonjs/core/Meshes/instancedMesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { groundHeight, drapeTriangles } from "../shared/terrain";
import { STREET_SURFACE_Y } from "../shared/streets";
import {
  buildRoadDetailPlan,
  type RoadPaint,
  type RoadSign,
} from "../shared/road-details";

const SIGN_GEOMETRY = {
  poleHeight: 2.75,
  poleDiameter: 0.055,
  boardDepth: 0.025,
  faceGap: 0.001,
  centreHeight: 2.35,
} as const;
const signSize = (kind: RoadSign["kind"]) =>
  kind === "bus"
    ? { width: 0.52, height: 0.75 }
    : { width: 0.65, height: 0.65 };

/** PlaneBuilder's UV direction assumes a left-handed view from -Z. Our actual
 * right-handed camera sees screen-right along -X on that same front face.
 * Flip only U: the existing Canvas upload still puts image top at V=1. */
function signFace(scene: Scene, key: string, kind: RoadSign["kind"]) {
  const mesh = MeshBuilder.CreatePlane(
    "sign source " + key,
    signSize(kind),
    scene,
  );
  const uvs = mesh.getVerticesData(VertexBuffer.UVKind)!;
  mesh.setVerticesData(
    VertexBuffer.UVKind,
    Array.from(uvs, (value, index) => (index % 2 === 0 ? 1 - value : value)),
  );
  return mesh;
}

export function roadPaintVertexData(rows: RoadPaint[]) {
  const positions: number[] = [],
    normals: number[] = [],
    indices: number[] = [],
    uvs: number[] = [];
  for (const row of rows) {
    const data = drapeTriangles(
        row.points,
        [0, 1, 3, 3, 1, 2],
        STREET_SURFACE_Y + 0.006,
      ),
      offset = positions.length / 3;
    const a = row.points[0],
      b = row.points[1],
      d = row.points[3],
      vx = b[0] - a[0],
      vz = b[1] - a[1],
      wx = d[0] - a[0],
      wz = d[1] - a[1],
      vl = vx * vx + vz * vz,
      wl = wx * wx + wz * wz;
    positions.push(...data.positions);
    normals.push(...data.normals);
    for (let i = 0; i < data.positions.length; i += 3) {
      const x = data.positions[i] - a[0],
        z = data.positions[i + 2] - a[1];
      uvs.push((x * wx + z * wz) / wl, (x * vx + z * vz) / vl);
    }
    for (const index of data.indices) indices.push(index + offset);
  }
  return { positions, normals, indices, uvs };
}
function material(scene: Scene, name: string, color: string) {
  const m = new PBRMaterial(name, scene);
  m.albedoColor = Color3.FromHexString(color).toLinearSpace();
  m.metallic = 0;
  m.roughness = 0.8;
  return m;
}
function texture(
  scene: Scene,
  name: string,
  draw: (c: CanvasRenderingContext2D) => void,
  width = 256,
  height = 256,
) {
  const t = new DynamicTexture(name, { width, height }, scene, true);
  const c = t.getContext() as unknown as CanvasRenderingContext2D;
  c.clearRect(0, 0, width, height);
  draw(c);
  t.hasAlpha = true;
  // Babylon's plane has V=1 at its top. Road glyph V=1 is the lane's forward
  // end. Flip Canvas rows on upload so lettering stays upright and the rider's
  // head points forward on both opposite lanes, rather than backwards.
  t.update(true);
  t.anisotropicFilteringLevel = 4;
  return t;
}
function drawBike(c: CanvasRenderingContext2D) {
  c.strokeStyle = "#eeeadd";
  c.fillStyle = "#eeeadd";
  c.lineWidth = 15;
  c.lineCap = "round";
  c.lineJoin = "round";
  for (const x of [64, 192]) {
    c.beginPath();
    c.ellipse(x, 355, 46, 58, 0, 0, Math.PI * 2);
    c.stroke();
  }
  c.beginPath();
  c.moveTo(64, 355);
  c.lineTo(112, 260);
  c.lineTo(155, 355);
  c.lineTo(64, 355);
  c.moveTo(112, 260);
  c.lineTo(178, 260);
  c.lineTo(192, 355);
  c.moveTo(103, 247);
  c.lineTo(132, 247);
  c.moveTo(178, 260);
  c.lineTo(169, 225);
  c.lineTo(195, 225);
  c.stroke();
  c.beginPath();
  c.ellipse(166, 139, 22, 27, 0, 0, Math.PI * 2);
  c.fill();
  c.beginPath();
  c.moveTo(148, 183);
  c.lineTo(113, 224);
  c.lineTo(157, 251);
  c.moveTo(145, 187);
  c.lineTo(177, 214);
  c.lineTo(199, 214);
  c.stroke();
}
function drawBus(c: CanvasRenderingContext2D) {
  c.strokeStyle = "#eeeadd";
  c.fillStyle = "#eeeadd";
  c.lineWidth = 11;
  c.strokeRect(11, 44, 234, 424);
  c.textAlign = "center";
  c.font = "bold 94px sans-serif";
  c.fillText("BUS", 128, 294, 222);
}
function drawSign(c: CanvasRenderingContext2D, sign: RoadSign) {
  c.fillStyle = sign.kind === "bus" ? "#bd2935" : "#07569d";
  c.fillRect(0, 0, 256, 320);
  if (sign.kind === "parking") {
    c.fillStyle = "#fff";
    c.font = "bold 220px sans-serif";
    c.textAlign = "center";
    c.fillText("P", 128, 243);
    return;
  }
  if (sign.kind === "crossing") {
    c.fillStyle = "#fff";
    c.beginPath();
    c.moveTo(128, 27);
    c.lineTo(234, 287);
    c.lineTo(22, 287);
    c.closePath();
    c.fill();
    c.strokeStyle = "#151a1d";
    c.lineWidth = 12;
    c.lineCap = "round";
    c.beginPath();
    c.arc(128, 114, 12, 0, Math.PI * 2);
    c.fillStyle = "#151a1d";
    c.fill();
    c.beginPath();
    c.moveTo(128, 132);
    c.lineTo(112, 186);
    c.lineTo(88, 234);
    c.moveTo(114, 180);
    c.lineTo(154, 230);
    c.moveTo(124, 145);
    c.lineTo(158, 175);
    c.moveTo(124, 145);
    c.lineTo(88, 167);
    c.stroke();
    for (let i = 0; i < 4; i++) c.fillRect(56 + i * 39, 250, 25, 12);
    return;
  }
  c.fillStyle = "#fff";
  c.fillRect(15, 15, 226, 290);
  c.fillStyle = "#153c63";
  c.fillRect(64, 35, 128, 104);
  c.fillStyle = "#fff";
  c.fillRect(78, 50, 100, 45);
  c.fillRect(78, 104, 20, 12);
  c.fillRect(158, 104, 20, 12);
  c.fillStyle = "#1b252d";
  c.textAlign = "center";
  c.font = "bold 25px sans-serif";
  const words = sign.name.split(" ");
  words.forEach((w, i) => c.fillText(w, 128, 187 + i * 30));
  c.font = "bold 27px sans-serif";
  c.fillText(sign.routes, 128, 285);
}
/** Separate sign roots and shared source geometries. Ground glyphs are authored
 * symbols; no aerial photo or Street View pixels are used as game textures. */
export function buildRoadDetails(scene: Scene) {
  const plan = buildRoadDetailPlan(),
    meshes: Mesh[] = [];
  for (const kind of ["line", "bicycle", "bus"] as const) {
    const data = roadPaintVertexData(plan.paint.filter((p) => p.kind === kind));
    if (!data.indices.length) continue;
    const mesh = new Mesh("mapped-road-paint:" + kind, scene),
      vd = new VertexData();
    Object.assign(vd, data);
    vd.applyToMesh(mesh);
    const m = material(scene, "road paint " + kind, "#eeeadd");
    m.zOffset = -3;
    m.zOffsetUnits = -3;
    m.specularIntensity = 0.2;
    if (kind !== "line" && typeof document !== "undefined") {
      m.albedoColor = Color3.White();
      m.albedoTexture = texture(
        scene,
        "authored " + kind + " road stencil",
        kind === "bicycle" ? drawBike : drawBus,
        256,
        512,
      );
      m.useAlphaFromAlbedoTexture = true;
      m.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHATEST;
      m.alphaCutOff = 0.45;
    }
    mesh.material = m;
    mesh.isPickable = false;
    mesh.metadata = {
      depthCaster: false,
      roadPaint: true,
      source: "OSM cycleway tags and user Vanickova reference photos",
      dimensions: "interpreted-not-surveyed",
    };
    mesh.freezeWorldMatrix();
    meshes.push(mesh);
  }
  const poleMat = material(scene, "traffic sign galvanized pole", "#8f989b");
  poleMat.metallic = 0.65;
  poleMat.roughness = 0.55;
  const backMat = material(scene, "traffic sign plate back", "#878e90");
  backMat.metallic = 0.5;
  const pole = MeshBuilder.CreateCylinder(
    "sign source pole",
    {
      height: SIGN_GEOMETRY.poleHeight,
      diameter: SIGN_GEOMETRY.poleDiameter,
      tessellation: 10,
    },
    scene,
  );
  pole.material = poleMat;
  pole.isVisible = false;
  const templates = new Map<string, Mesh>(),
    backs = new Map<string, Mesh>();
  for (const sign of plan.signs) {
    const root = new TransformNode(sign.id, scene);
    root.position.set(sign.x, groundHeight(sign.x, sign.z), sign.z);
    root.rotation.y = sign.yaw;
    root.metadata = {
      roadSign: true,
      source: sign.source,
      placement: sign.placement,
      uncertaintyMetres: sign.uncertaintyMetres,
    };
    const post = pole.createInstance(sign.id + ":pole");
    post.parent = root;
    post.position.y = SIGN_GEOMETRY.poleHeight / 2;
    // The pole touches the rear of the opaque board. Keeping its centre at Z=0
    // made its 27.5 mm radius protrude through the face at Z=-13.5 mm.
    post.position.z =
      (SIGN_GEOMETRY.boardDepth + SIGN_GEOMETRY.poleDiameter) / 2;
    post.metadata = { depthCaster: false };
    const key = sign.kind + ":" + sign.name + ":" + sign.routes;
    let face = templates.get(key);
    if (!face) {
      face = signFace(scene, key, sign.kind);
      const m = material(scene, "sign face " + key, "#ffffff");
      m.albedoColor = Color3.White();
      if (typeof document !== "undefined")
        m.albedoTexture = texture(
          scene,
          key,
          (c) => drawSign(c, sign),
          256,
          320,
        );
      m.roughness = 0.65;
      face.material = m;
      face.isVisible = false;
      face.metadata = { depthCaster: false };
      templates.set(key, face);
    }
    let back = backs.get(sign.kind);
    if (!back) {
      back = MeshBuilder.CreateBox(
        "sign source back " + sign.kind,
        {
          ...signSize(sign.kind),
          depth: SIGN_GEOMETRY.boardDepth,
        },
        scene,
      );
      back.material = backMat;
      back.isVisible = false;
      back.metadata = { depthCaster: false };
      backs.set(sign.kind, back);
    }
    const board = back.createInstance(sign.id + ":back");
    board.parent = root;
    board.position.y = SIGN_GEOMETRY.centreHeight;
    board.metadata = { depthCaster: false };
    const instance = face.createInstance(sign.id + ":plate");
    instance.parent = root;
    instance.position.set(
      0,
      SIGN_GEOMETRY.centreHeight,
      -SIGN_GEOMETRY.boardDepth / 2 - SIGN_GEOMETRY.faceGap,
    );
    instance.metadata = { depthCaster: false };
    root.freezeWorldMatrix();
  }
  pole.metadata = { depthCaster: false };
  return { ...plan, meshes };
}
