import { TREE_FAMILIES, type TreeFamily } from "./tree-season";

export type TreeLod = 0 | 1 | 2;
export type TreeRole = "wood" | "foliage";
/** Opt-in only after LOD1 preserves all source foliage. LOD2 has its own audit. */
export type TreeLodProfile = "full-coverage";
export type TreeMaterialKey = "Bark012" | "LeafSet024" | "fir_tree_01";
export type TreeAssetFile = Readonly<{ url: string; bytes: number; sha256: string }>;
export type LegacyTreeManifest = Readonly<{
  version: 1; bootstrap: string; bootstrapBytes: number; bootstrapSha256: string;
  materialNames: string[]; trees: Record<string, Record<string, TreeAssetFile>>;
}>;
export type TreePrototype = Readonly<{
  sourceTreeId: string; family: TreeFamily; nominalHeight: number;
  nominalCrownDiameter: number; trunkRadius: number;
  lodProfile?: TreeLodProfile;
  farCluster?: Readonly<{ bankId: string; placements: TreeAssetFile; groupCount: number }>;
  lods: readonly (TreeAssetFile & { meshNames: readonly string[] })[];
}>;
export type TreePilotManifest = Readonly<{
  /** v4 adds shared FAR banks to the separate v3 LOD payloads. */
  version: 2 | 3 | 4; units: "metres"; rankEncoding: "uint16-normalized";
  banks?: Readonly<Record<string, TreeAssetFile>>;
  prototypes: Readonly<Record<string, TreePrototype>>;
  placements: readonly Readonly<{
    sourceTreeId: string; sourceRootXZ: readonly [number, number];
    prototypeCandidates: readonly string[]; selectedPrototypeId: string | null;
    positionUncertaintyMetres?: number;
  }>[];
}>;
export type TreePilotOptions = Readonly<{
  /** Explicit application configuration, never read directly from location.search. */
  manifestUrl: string;
  selections: Readonly<Record<string, string>>;
}>;

const record = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw Error("Expected tree object");
  return v as Record<string, unknown>;
};
const identifier = (v: unknown): string => {
  if (typeof v !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(v) || ["__proto__","constructor","prototype"].includes(v)) throw Error("Invalid tree identifier");
  return v;
};
const finite = (v: unknown, min: number, max: number): number => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) throw Error("Invalid tree number");
  return v;
};
export function treeAssetUrl(value: unknown, root = "/models/vegetation/"): string {
  if (typeof value !== "string" || !value.startsWith(root) || !/^\/[A-Za-z0-9_./-]+$/.test(value) || value.split("/").some(p => p === ".." || p === ".")) throw Error("Invalid tree asset URL");
  return value;
}
function assetFile(value: unknown): TreeAssetFile {
  const raw = record(value), bytes = finite(raw.bytes, 1, 128*1024*1024);
  if (!Number.isSafeInteger(bytes) || typeof raw.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(raw.sha256)) throw Error("Invalid tree asset integrity descriptor");
  return { url: treeAssetUrl(raw.url), bytes, sha256: raw.sha256 };
}
export function parseLegacyTreeManifest(value: unknown): LegacyTreeManifest {
  const raw=record(value);
  if(raw.version!==1 || !Array.isArray(raw.materialNames) || raw.materialNames.length<1 || raw.materialNames.length>16 ||
    !raw.materialNames.every(v=>typeof v==="string"&&v.length>0&&v.length<256) || new Set(raw.materialNames).size!==raw.materialNames.length) throw Error("Invalid legacy tree manifest");
  const bootstrap=assetFile({url:raw.bootstrap,bytes:raw.bootstrapBytes,sha256:raw.bootstrapSha256});
  const trees: Record<string,Record<string,TreeAssetFile>>=Object.create(null), entries=Object.entries(record(raw.trees));
  if(entries.length<1||entries.length>2048)throw Error("Invalid legacy tree population");
  for(const [id,value] of entries){identifier(id);const lods=record(value);trees[id]={};for(const lod of [0,1])trees[id][lod]=assetFile(lods[lod]);}
  return {version:1,bootstrap:bootstrap.url,bootstrapBytes:bootstrap.bytes,bootstrapSha256:bootstrap.sha256,materialNames:[...raw.materialNames] as string[],trees};
}
export function parseTreePilotManifest(value: unknown): TreePilotManifest {
  const raw=record(value);
  if(![2,3,4].includes(raw.version as number)||raw.units!=="metres"||raw.rankEncoding!=="uint16-normalized")throw Error("Unsupported seasonal tree manifest");
  const banks: Record<string, TreeAssetFile> = Object.create(null);
  if (raw.version === 4) {
    const entries = Object.entries(record(raw.banks));
    if (!entries.length || entries.length > 16) throw Error("Invalid tree cluster bank count");
    for (const [id, value] of entries) {
      identifier(id); const file = assetFile(value);
      if (file.bytes > 2 * 1024 * 1024) throw Error("Tree cluster bank exceeds byte budget");
      banks[id] = file;
    }
  } else if (raw.banks !== undefined) throw Error("Tree banks require v4");
  const prototypes:Record<string,TreePrototype>=Object.create(null), entries=Object.entries(record(raw.prototypes));
  if(entries.length<1||entries.length>256)throw Error("Invalid tree prototype count");
  for(const [id,value] of entries){identifier(id);const p=record(value);
    if(!TREE_FAMILIES.includes(p.family as TreeFamily)||!Array.isArray(p.lods)||p.lods.length!==3)throw Error("Invalid prototype family/LOD");
    const lods=p.lods.map((item,lod)=>{const r=record(item),file=assetFile(item);
      if(!Array.isArray(r.meshNames)||r.meshNames.length<1||r.meshNames.length>2||!r.meshNames.every(n=>typeof n==="string"&&n.startsWith(id+"__lod"+lod+"__")&&/__(wood|foliage)$/.test(n))||new Set(r.meshNames).size!==r.meshNames.length)throw Error("Invalid prototype mesh names");
      if(!r.meshNames.some(n=>(n as string).endsWith("__wood")))throw Error("Prototype LOD lacks wood");
      return {...file,meshNames:[...r.meshNames] as string[]};});
    if(raw.version===2&&lods.some(l=>l.url!==lods[0].url||l.sha256!==lods[0].sha256||l.bytes!==lods[0].bytes))throw Error("Pilot LODs must share one immutable GLB");
    if(raw.version!==2&&new Set(lods.map(l=>l.url)).size!==3)throw Error("Streamed LODs require separate immutable GLBs");
    if(p.lodProfile!==undefined&&p.lodProfile!=="full-coverage")throw Error("Invalid tree LOD profile");
    let farCluster: TreePrototype["farCluster"];
    if (p.farCluster !== undefined) {
      if (raw.version !== 4) throw Error("Tree clusters require v4");
      const cluster = record(p.farCluster), bankId = identifier(cluster.bankId), groupCount = finite(cluster.groupCount, 1, 65534);
      const placements = assetFile(cluster.placements);
      if (!banks[bankId] || !Number.isInteger(groupCount) || placements.bytes !== groupCount * 32) throw Error("Invalid tree cluster placement descriptor");
      farCluster = { bankId, placements, groupCount };
    }
    prototypes[id]={sourceTreeId:identifier(p.sourceTreeId),family:p.family as TreeFamily,nominalHeight:finite(p.nominalHeight,.1,100),nominalCrownDiameter:finite(p.nominalCrownDiameter,.1,100),trunkRadius:finite(p.trunkRadius,.01,5),lods,
      ...(p.lodProfile===undefined?{}:{lodProfile:p.lodProfile as TreeLodProfile}), ...(farCluster ? { farCluster } : {})};
  }
  if(!Array.isArray(raw.placements)||raw.placements.length<1||raw.placements.length>2048)throw Error("Invalid pilot placements");
  const seen=new Set<string>();
  const placements=raw.placements.map(value=>{const p=record(value),sourceTreeId=identifier(p.sourceTreeId);
    if(seen.has(sourceTreeId))throw Error("Duplicate tree placement");seen.add(sourceTreeId);
    if(!Array.isArray(p.sourceRootXZ)||p.sourceRootXZ.length!==2||!Array.isArray(p.prototypeCandidates)||!p.prototypeCandidates.length)throw Error("Invalid tree placement inputs");
    const candidates=p.prototypeCandidates.map(identifier);
    if(new Set(candidates).size!==candidates.length||candidates.some(id=>!prototypes[id]||prototypes[id].sourceTreeId!==sourceTreeId))throw Error("Prototype/source identity mismatch");
    if(p.selectedPrototypeId!==null&&!candidates.includes(p.selectedPrototypeId as string))throw Error("Invalid selected prototype");
    return {sourceTreeId,sourceRootXZ:[finite(p.sourceRootXZ[0],-1e6,1e6),finite(p.sourceRootXZ[1],-1e6,1e6)] as [number,number],prototypeCandidates:candidates,selectedPrototypeId:p.selectedPrototypeId as string|null,
      ...(p.positionUncertaintyMetres===undefined?{}:{positionUncertaintyMetres:finite(p.positionUncertaintyMetres,0,100)})};});
  return {version:raw.version as 2|3|4,units:"metres",rankEncoding:"uint16-normalized",prototypes,placements,...(raw.version===4?{banks}:{})};
}
