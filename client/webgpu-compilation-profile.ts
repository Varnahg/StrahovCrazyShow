import type { RenderOperationKind } from "./render-health";

type ProfileObserver = { remove(defer?: boolean): void };
type ProfileObservable = { add(callback: () => void): ProfileObserver };
type FaultChannel = "shader" | "pipeline" | "render";
type Method = (this: unknown, ...args: unknown[]) => unknown;

export type ShaderInventoryLimits = {
  maxEntries: number;
  maxCodeUnits: number;
  maxStages: number;
  maxRows: number;
};
const INVENTORY_LIMITS: ShaderInventoryLimits = {
  maxEntries: 1024,
  maxCodeUnits: 32 * 1024 * 1024,
  maxStages: 16,
  maxRows: 16,
};
const inventoryCounts = () => ({
  calls: 0, rawKnown: 0, rawRepeated: 0, bodyKnown: 0, bodyRepeated: 0,
  descriptorUnknown: 0, bodyUnknown: 0, limited: 0,
});
type InventoryCounts = ReturnType<typeof inventoryCounts>;
type ShaderRole = "vertex" | "fragment" | "unknown";
type ShaderEvidence = {
  id: number; hash: number; chars: number; calls: number;
  vertex: number; fragment: number; unknown: number; stages: number[];
};
type RawEvidence = ShaderEvidence & {
  text: string; body?: BodyEvidence; bodyOffset?: number;
  countedBody?: BodyEvidence; ambiguous: boolean; roles: number;
  derived?: DerivedEvidence; countedDerived?: DerivedEvidence;
  defines?: { removed: number; retained: number; unsafe: number };
  defineTable?: Region; ambiguousDefines?: boolean;
};
type BodyEvidence = ShaderEvidence & {
  sample: RawEvidence; offset: number; variants: number;
};
type Region = { start: number; end: number };
type DefineRow = Region & { name: string; safe: boolean; references: Set<string> };
type DefineAnalysis = { regions: Region[]; rows: DefineRow[]; keep: Set<string> };
type DerivedEvidence = ShaderEvidence & {
  sample: RawEvidence; regions: Region[]; variants: number;
};
type Provenance = { text: string; role: "vertex" | "fragment"; table: Region };
type PostFrame = { depth: number; role?: "vertex" | "fragment"; table?: string; calls: number };
const PROVENANCE_ENTRIES = 8, PROVENANCE_CODE_UNITS = 512 * 1024;
const TABLE_CODE_UNITS = 64 * 1024, TABLE_ROWS = 1024;
const LINE_BREAK = /[\n\v\f\r\u0085\u2028\u2029]/;
const BLANKSPACE = /[ \t\n\v\f\r\u0085\u200e\u200f\u2028\u2029]/;
const IDENT_START = /[A-Za-z_]/, IDENT_CONTINUE = /[A-Za-z0-9_]/;
const OTHER_TOKEN = /[0-9.,:;@()[\]+\-*/%&|^!~=<>}]/;

/** Identifier/reference scan, not a WGSL parser. Unsupported code is unknown.
 * Comments follow WGSL 3.2/3.3, including nested blocks and every line break. */
function scanWGSL(text: string, start: number, end: number,
  visit: (token: string, offset: number, depth: number) => void) {
  const nesting: string[] = [];
  for (let i = start; i < end;) {
    const c = text[i], next = text[i + 1];
    if (BLANKSPACE.test(c)) { i++; continue; }
    if (c === "/" && next === "/") {
      i += 2;
      while (i < end && !LINE_BREAK.test(text[i])) i++;
      continue;
    }
    if (c === "/" && next === "*") {
      let nesting = 1; i += 2;
      while (i < end && nesting) {
        if (text[i] === "/" && text[i + 1] === "*") { nesting++; i += 2; }
        else if (text[i] === "*" && text[i + 1] === "/") { nesting--; i += 2; }
        else i++;
      }
      if (nesting) return false;
      continue;
    }
    if (IDENT_START.test(c)) {
      const first = i++;
      while (i < end && IDENT_CONTINUE.test(text[i])) i++;
      visit(text.slice(first, i), first, nesting.length);
      continue;
    }
    visit(c, i, nesting.length);
    if (c === "{" || c === "(" || c === "[") nesting.push(c);
    else if (c === "}" || c === ")" || c === "]") {
      if (nesting.pop() !== (c === "}" ? "{" : c === ")" ? "(" : "[")) return false;
    }
    // Non-ASCII identifiers, directives, quotes and unexpected controls are
    // deliberately unsupported, rather than risking an omitted reference.
    else if (!OTHER_TOKEN.test(c)) return false;
    i++;
  }
  return nesting.length === 0;
}

function analyzeDefines(text: string, bodyOffset: number, table: Region): DefineAnalysis | undefined {
  const rows: DefineRow[] = [];
  const names = new Set<string>();
  const byName = new Map<string, DefineRow>();
  let position = table.start;
  while (position < table.end) {
    const end = text.indexOf("\n", position);
    if (end < position || end >= table.end || rows.length >= TABLE_ROWS) return;
    const match = /^const ([A-Za-z_][A-Za-z0-9_]*) = ([^;\r\v\f\u0085\u2028\u2029]+);$/.exec(text.slice(position, end));
    if (!match || names.has(match[1])) return;
    const [, name, value] = match;
    const references = new Set<string>();
    if (!scanWGSL(value, 0, value.length, (token) => references.add(token))) return;
    // Deliberately narrow legal-name/literal subset; lower-case and reserved
    // names stay in place. NULL is the only all-uppercase WGSL reserved word.
    const safeName = /^[A-Z][A-Z0-9_]{0,63}$/.test(name) && name !== "NULL";
    const safeLiteral = /^(true|false)$/.test(value) ||
      (/^(0|[1-9][0-9]{0,9})$/.test(value) && Number(value) <= 2147483647);
    rows.push({ name, start: position, end: end + 1, safe: safeName && safeLiteral, references });
    byName.set(name, rows[rows.length - 1]);
    names.add(name); position = end + 1;
  }
  if (!rows.length) return;
  const keep = new Set(rows.filter((row) => !row.safe).map((row) => row.name));
  const starts = new Set(rows.map((row) => row.start));
  let tableTokens = 0, misplaced = false, previous = "";
  if (!scanWGSL(text, bodyOffset, text.length, (token, offset, depth) => {
    if (offset >= table.start && offset < table.end) {
      if (starts.has(offset)) {
        tableTokens++;
        if (token !== "const" || depth !== 0 ||
          (offset === table.start && previous !== "" && previous !== ";" && previous !== "}")) misplaced = true;
      }
    } else if (names.has(token)) keep.add(token);
    previous = token;
  }) || misplaced || tableTokens !== rows.length) return;
  // Keep all dependencies of used or unsafe declarations (including cycles).
  const pending = [...keep];
  for (let i = 0; i < pending.length; i++) {
    for (const dependency of byName.get(pending[i])!.references)
      if (names.has(dependency) && !keep.has(dependency)) {
        keep.add(dependency); pending.push(dependency);
      }
  }
  const regions: Region[] = [];
  let from = bodyOffset;
  for (const row of rows) if (!keep.has(row.name)) {
    if (from < row.start) regions.push({ start: from, end: row.start });
    // Keep the newline: even the derived view must never join lexical tokens.
    from = row.end - 1;
  }
  regions.push({ start: from, end: text.length });
  return { regions, rows, keep };
}

function derivedFingerprint(text: string, regions: Region[]) {
  let hash = 2166136261;
  for (const region of regions)
    for (let i = region.start; i < region.end; i++)
      hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return hash >>> 0;
}
function sameDerived(a: RawEvidence, regions: Region[], b: DerivedEvidence) {
  let leftRegion = 0, rightRegion = 0;
  let left = regions[0].start, right = b.regions[0].start;
  while (leftRegion < regions.length && rightRegion < b.regions.length) {
    if (left === regions[leftRegion].end) {
      left = regions[++leftRegion]?.start ?? 0; continue;
    }
    if (right === b.regions[rightRegion].end) {
      right = b.regions[++rightRegion]?.start ?? 0; continue;
    }
    if (a.text.charCodeAt(left++) !== b.sample.text.charCodeAt(right++)) return false;
  }
  while (leftRegion < regions.length && left === regions[leftRegion].end)
    left = regions[++leftRegion]?.start ?? 0;
  while (rightRegion < b.regions.length && right === b.regions[rightRegion].end)
    right = b.regions[++rightRegion]?.start ?? 0;
  return leftRegion === regions.length && rightRegion === b.regions.length;
}

// Fingerprints index candidates only. Equality below, not the hash, proves reuse.
function shaderFingerprint(text: string, offset = 0) {
  let hash = 2166136261;
  for (let index = offset; index < text.length; index++)
    hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return hash >>> 0;
}
function sameShaderRegion(a: string, aOffset: number, b: string, bOffset: number) {
  if (a.length - aOffset !== b.length - bOffset) return false;
  for (let index = 0; index < a.length - aOffset; index++)
    if (a.charCodeAt(aOffset + index) !== b.charCodeAt(bOffset + index))
      return false;
  return true;
}
function ownString(value: unknown, name: string): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, name);
  return descriptor && "value" in descriptor && typeof descriptor.value === "string"
    ? descriptor.value : undefined;
}
function dataMethod(target: object, name: string): unknown {
  let cursor: object | null = target;
  while (cursor) {
    const descriptor = Object.getOwnPropertyDescriptor(cursor, name);
    if (descriptor) return "value" in descriptor ? descriptor.value : undefined;
    cursor = Object.getPrototypeOf(cursor);
  }
  return undefined;
}

/** Diagnostic-only bounded evidence. No GPU object or descriptor is retained. */
class ShaderInventory {
  readonly limits: ShaderInventoryLimits;
  private raw: RawEvidence[] = [];
  private bodies: BodyEvidence[] = [];
  private rawIndex = new Map<number, RawEvidence[]>();
  private bodyIndex = new Map<number, BodyEvidence[]>();
  private stages = [{ name: "unassigned", counts: inventoryCounts() }];
  private stage = 0;
  private counts = inventoryCounts();
  private codeUnits = 0;
  private rawHashConflicts = 0;
  private bodyHashConflicts = 0;
  private unrecognizedPrefix = 0;
  private stageOverflow = 0;
  private released = false;
  private cpuTotalMs = 0;
  private cpuMaxMs = 0;
  private pending: Provenance[] = [];
  private finals: Provenance[] = [];
  private frames: PostFrame[] = [];
  private postDepth = 0;
  private provenanceUnits = 0;
  private derived: DerivedEvidence[] = [];
  private derivedIndex = new Map<number, DerivedEvidence[]>();
  private unused = {
    analyzed: 0, unknown: 0, repeated: 0, removedDeclarations: 0,
    retainedDeclarations: 0, unsafeDeclarations: 0, provenanceUnknown: 0,
    provenanceLimited: 0, analysisUnknown: 0, hashConflicts: 0,
  };
  private defineNames = new Map<string, { omitted: number; retained: number }>();
  private namesTruncated = false;

  constructor(private readonly now: () => number, limits?: Partial<ShaderInventoryLimits>,
    private readonly captureUnused = false) {
    this.limits = { ...INVENTORY_LIMITS };
    for (const key of Object.keys(this.limits) as (keyof ShaderInventoryLimits)[]) {
      const value = limits?.[key];
      if (typeof value === "number" && Number.isFinite(value))
        this.limits[key] = Math.max(key === "maxStages" ? 2 : 1,
          Math.min(key === "maxStages" ? 21 : this.limits[key], Math.floor(value)));
    }
  }

  private reserveProvenance(chars: number) {
    while ((this.provenanceUnits + chars > PROVENANCE_CODE_UNITS ||
        this.codeUnits + this.provenanceUnits + chars > this.limits.maxCodeUnits) &&
        this.dropProvenance()) { /* bounded eviction leaves missing provenance unknown */ }
    if (this.provenanceUnits + chars > PROVENANCE_CODE_UNITS ||
        this.codeUnits + this.provenanceUnits + chars > this.limits.maxCodeUnits) {
      this.unused.provenanceLimited++; return false;
    }
    this.provenanceUnits += chars;
    return true;
  }
  private dropProvenance() {
    const list = this.pending.length ? this.pending : this.finals;
    const first = list[0];
    if (!first) return false;
    this.removeProvenance(list, [first]); this.unused.provenanceLimited++;
    return true;
  }
  beginPost(args: unknown[]) {
    const frame: PostFrame = { depth: ++this.postDepth, calls: 0,
      role: typeof args[2] === "boolean" ? args[2] ? "fragment" : "vertex" : undefined };
    if (frame.depth <= 4) this.frames.push(frame);
    else this.unused.provenanceLimited++;
    return frame;
  }
  noteConverted(result: unknown) {
    if (this.released || this.postDepth > 4) return;
    this.measure(() => {
      const frame = this.frames.at(-1);
      if (!frame) return;
      frame.calls++;
      if (frame.calls !== 1 || typeof result !== "string" || !result.length) return;
      if (result.length > TABLE_CODE_UNITS) { this.unused.provenanceLimited++; return; }
      if (this.reserveProvenance(result.length)) frame.table = result;
    });
  }
  endPost(frame: PostFrame, result: unknown) {
    if (this.released || frame.depth > 4) return;
    this.measure(() => {
      if (frame.calls !== 1 || !frame.table || !frame.role || typeof result !== "string") {
        this.unused.provenanceUnknown++; return;
      }
      const start = result.indexOf(frame.table);
      if (start < 0 || result.indexOf(frame.table, start + 1) >= 0) {
        this.unused.provenanceUnknown++; return;
      }
      this.storeProvenance(this.pending, {
        text: result, role: frame.role, table: { start, end: start + frame.table.length },
      });
    });
  }
  leavePost(frame: PostFrame) {
    if (this.released) return;
    if (frame.table) this.provenanceUnits -= frame.table.length;
    if (frame.depth <= 4) this.frames.pop();
    this.postDepth--;
  }
  private storeProvenance(list: Provenance[], evidence: Provenance) {
    if (this.pending.length + this.finals.length >= PROVENANCE_ENTRIES) {
      this.dropProvenance();
    }
    if (this.reserveProvenance(evidence.text.length)) list.push(evidence);
  }
  private removeProvenance(list: Provenance[], matches: Provenance[]) {
    for (const match of matches) {
      const index = list.indexOf(match);
      if (index >= 0) { list.splice(index, 1); this.provenanceUnits -= match.text.length; }
    }
  }
  noteFinalized(args: unknown[], result: unknown) {
    if (this.released) return;
    this.measure(() => {
      for (const [index, role] of (["vertex", "fragment"] as const).entries()) {
        const code = args[index];
        const matches = this.pending.filter((item) => item.role === role && item.text === code);
        this.removeProvenance(this.pending, matches);
        const final = ownString(result, role + "Code");
        const first = matches[0];
        if (!first || !final || matches.some((item) =>
          item.table.start !== first.table.start || item.table.end !== first.table.end)) {
          this.unused.provenanceUnknown++; continue;
        }
        const table = first.text.slice(first.table.start, first.table.end);
        const start = final.indexOf(table);
        if (start < 0 || final.indexOf(table, start + 1) >= 0) {
          this.unused.provenanceUnknown++; continue;
        }
        this.storeProvenance(this.finals, {
          text: final, role, table: { start, end: start + table.length },
        });
      }
    });
  }
  resetProvenance() {
    this.pending = []; this.finals = []; this.frames = [];
    this.postDepth = 0; this.provenanceUnits = 0;
  }
  private takeFinal(source: string, role: string): Region | undefined {
    // Pinned Effect.functions adds this one diagnostic line after finalize.
    // Its content is retained in comparison, never normalized or stripped.
    let prefix = 0;
    if (source.startsWith(`//#define SHADER_NAME ${role}:`)) {
      const end = source.indexOf("\n");
      if (end < 0 || end > 512 || /[\r\v\f\u0085\u2028\u2029]/.test(source.slice(0, end))) return;
      prefix = end + 1;
    }
    const matches = this.finals.filter((item) => item.role === role &&
      sameShaderRegion(source, prefix, item.text, 0));
    this.removeProvenance(this.finals, matches);
    const first = matches[0];
    if (!first || matches.some((item) => item.table.start !== first.table.start || item.table.end !== first.table.end)) return;
    return { start: prefix + first.table.start, end: prefix + first.table.end };
  }
  private derive(entry: RawEvidence, table: Region, bodyOffset: number) {
    if (entry.ambiguousDefines) return;
    if (entry.defineTable && (entry.defineTable.start !== table.start || entry.defineTable.end !== table.end)) {
      entry.ambiguousDefines = true; entry.defines = undefined; entry.derived = undefined;
      return;
    }
    entry.defineTable = table;
    if (entry.defines) return;
    const analysis = analyzeDefines(entry.text, bodyOffset, table);
    if (!analysis) { this.unused.analysisUnknown++; return; }
    entry.defines = { removed: 0, retained: 0, unsafe: 0 };
    for (const row of analysis.rows) {
      const retained = analysis.keep.has(row.name);
      entry.defines[retained ? "retained" : "removed"]++;
      if (!row.safe) entry.defines.unsafe++;
      if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(row.name)) continue;
      let count = this.defineNames.get(row.name);
      if (!count) {
        if (this.defineNames.size >= this.limits.maxRows) { this.namesTruncated = true; continue; }
        this.defineNames.set(row.name, count = { omitted: 0, retained: 0 });
      }
      count[retained ? "retained" : "omitted"]++;
    }
    const hash = derivedFingerprint(entry.text, analysis.regions);
    const bucket = this.derivedIndex.get(hash) ?? [];
    let derived = bucket.find((candidate) => {
      if (sameDerived(entry, analysis.regions, candidate)) return true;
      this.unused.hashConflicts++; return false;
    });
    if (!derived) {
      derived = {
        id: this.derived.length + 1, hash, sample: entry, regions: analysis.regions,
        chars: analysis.regions.reduce((sum, region) => sum + region.end - region.start, 0),
        variants: 0, calls: 0, vertex: 0, fragment: 0, unknown: 0, stages: [],
      };
      this.derived.push(derived); bucket.push(derived); this.derivedIndex.set(hash, bucket);
    }
    entry.derived = derived;
  }
  private recordDerived(entry: RawEvidence, role: ShaderRole) {
    if (!this.captureUnused) return;
    if (!entry.derived || !entry.defines || entry.ambiguous) { this.unused.unknown++; return; }
    this.unused.analyzed++;
    if (entry.derived.calls) this.unused.repeated++;
    if (entry.countedDerived !== entry.derived) {
      entry.derived.variants++; entry.countedDerived = entry.derived;
    }
    this.record(entry.derived, role);
    this.unused.removedDeclarations += entry.defines.removed;
    this.unused.retainedDeclarations += entry.defines.retained;
    this.unused.unsafeDeclarations += entry.defines.unsafe;
  }

  private measure(work: () => void) {
    const start = this.now();
    try { work(); }
    finally {
      const elapsed = Math.max(0, this.now() - start);
      this.cpuTotalMs += elapsed;
      this.cpuMaxMs = Math.max(this.cpuMaxMs, elapsed);
    }
  }

  setStage(name: string | null) {
    if (this.released) return;
    this.measure(() => {
      const safeName = typeof name === "string" && /^[a-zA-Z0-9_.:-]{1,48}$/.test(name)
        ? name : "unassigned";
      const existing = this.stages.findIndex((entry) => entry.name === safeName);
      if (existing >= 0) { this.stage = existing; return; }
      // Reserve one slot for overflow so the stage list itself always stays bounded.
      if (this.stages.length < this.limits.maxStages - 1) {
        this.stage = this.stages.push({ name: safeName, counts: inventoryCounts() }) - 1;
      } else {
        if (this.stages.length < this.limits.maxStages)
          this.stages.push({ name: "overflow", counts: inventoryCounts() });
        this.stage = this.limits.maxStages - 1;
        this.stageOverflow++;
      }
    });
  }

  private getRaw(text: string): RawEvidence | undefined {
    if (text.length > this.limits.maxCodeUnits) return undefined;
    const hash = shaderFingerprint(text), bucket = this.rawIndex.get(hash) ?? [];
    for (const entry of bucket) {
      if (entry.text === text) return entry;
      this.rawHashConflicts++;
    }
    if (this.raw.length >= this.limits.maxEntries ||
        this.codeUnits + this.provenanceUnits + text.length > this.limits.maxCodeUnits) return undefined;
    const entry: RawEvidence = {
      id: this.raw.length + 1, hash, chars: text.length, text, calls: 0,
      vertex: 0, fragment: 0, unknown: 0, stages: [], ambiguous: false, roles: 0,
    };
    this.raw.push(entry);
    bucket.push(entry);
    this.rawIndex.set(hash, bucket);
    this.codeUnits += text.length;
    return entry;
  }

  /** Proves the exact output of pinned _getWGSLShader. No general comment parser. */
  noteWGSL(args: unknown[], result: unknown) {
    if (this.released) return;
    this.measure(() => {
      const [source, type, defines] = args;
      if (typeof source !== "string" || typeof result !== "string" ||
          (type !== "vertex" && type !== "fragment") ||
          (defines != null && typeof defines !== "string")) {
        this.unrecognizedPrefix++; return;
      }
      if (result.length > this.limits.maxCodeUnits ||
          (typeof defines === "string" && defines.length > result.length)) return;
      const prefix = defines ? "//" + defines.split("\n").join("\n//") + "\n" : "";
      if (!result.startsWith(prefix) || !sameShaderRegion(result, prefix.length, source, 0)) {
        this.unrecognizedPrefix++; return;
      }
      const table = this.captureUnused ? this.takeFinal(source, type) : undefined;
      const entry = this.getRaw(result);
      if (!entry) return;
      entry.roles |= type === "vertex" ? 1 : 2;
      if (entry.ambiguous) return;
      if (entry.bodyOffset !== undefined && entry.bodyOffset !== prefix.length) {
        // Identical raw text with two proven decompositions has no unique body identity.
        entry.ambiguous = true;
        entry.body = undefined;
        return;
      }
      if (table) this.derive(entry, {
        start: prefix.length + table.start, end: prefix.length + table.end,
      }, prefix.length);
      if (entry.body) return;
      const offset = prefix.length, hash = shaderFingerprint(result, offset);
      const bucket = this.bodyIndex.get(hash) ?? [];
      let body = bucket.find((candidate) => {
        if (sameShaderRegion(result, offset, candidate.sample.text, candidate.offset))
          return true;
        this.bodyHashConflicts++;
        return false;
      });
      if (!body) {
        body = {
          id: this.bodies.length + 1, hash, chars: result.length - offset,
          sample: entry, offset, variants: 0, calls: 0,
          vertex: 0, fragment: 0, unknown: 0, stages: [],
        };
        this.bodies.push(body);
        bucket.push(body);
        this.bodyIndex.set(hash, bucket);
      }
      entry.bodyOffset = offset;
      entry.body = body;
    });
  }

  private bump(key: keyof InventoryCounts) {
    this.counts[key]++;
    this.stages[this.stage].counts[key]++;
  }
  private record(entry: ShaderEvidence, role: ShaderRole) {
    entry.calls++;
    entry[role]++;
    entry.stages[this.stage] = (entry.stages[this.stage] ?? 0) + 1;
  }
  noteModule(descriptor: unknown) {
    if (this.released) return;
    this.measure(() => {
      this.bump("calls");
      let code: string | undefined;
      try { code = ownString(descriptor, "code"); }
      catch (error) {
        this.bump("descriptorUnknown");
        if (this.captureUnused) this.unused.unknown++;
        throw error;
      }
      if (code === undefined) {
        this.bump("descriptorUnknown");
        if (this.captureUnused) this.unused.unknown++;
        return;
      }
      const entry = this.getRaw(code);
      if (!entry) {
        this.bump("limited");
        if (this.captureUnused) this.unused.unknown++;
        return;
      }
      let label: string | undefined;
      try { label = ownString(descriptor, "label"); }
      catch { /* Unknown role must not discard already proven code evidence. */ }
      const role: ShaderRole = label === "vertex" || label === "fragment" ? label
        : entry.roles === 1 ? "vertex" : entry.roles === 2 ? "fragment" : "unknown";
      this.bump("rawKnown");
      this.recordDerived(entry, role);
      if (entry.calls) this.bump("rawRepeated");
      this.record(entry, role);
      if (entry.body && !entry.ambiguous) {
        this.bump("bodyKnown");
        if (entry.body.calls) this.bump("bodyRepeated");
        if (entry.countedBody !== entry.body) {
          entry.body.variants++;
          entry.countedBody = entry.body;
        }
        this.record(entry.body, role);
      } else this.bump("bodyUnknown");
    });
  }

  snapshot() {
    const project = (entry: ShaderEvidence) => ({
      id: entry.id, fingerprint: entry.hash.toString(16).padStart(8, "0"),
      chars: entry.chars, calls: entry.calls,
      vertex: entry.vertex, fragment: entry.fragment, unknown: entry.unknown,
      stages: this.stages.map((_, index) => entry.stages[index] ?? 0),
    });
    const repeated = <T extends ShaderEvidence>(entries: T[]) => entries
      .filter((entry) => entry.calls > 1)
      .sort((a, b) => b.calls - a.calls || a.id - b.id);
    const raw = repeated(this.raw), bodies = repeated(this.bodies), derived = repeated(this.derived);
    return {
      enabled: true,
      scope: "Per-device successful module calls; exact text equality confirms duplicates. Body identity only from observed pinned WGSL prefix construction. Unknown/limited calls are not evidence of uniqueness.",
      overheadScope: "Text capture/setStage CPU only; nested inside engine timings. Hook entry/cleanup and snapshot/serialization excluded. Text limit counts retained UTF-16 code units (raw plus pending provenance), not total JavaScript heap. Diagnostic overhead, not a performance improvement.",
      limits: { ...this.limits }, ...this.counts,
      rawHashConflicts: this.rawHashConflicts,
      bodyHashConflicts: this.bodyHashConflicts,
      unrecognizedPrefix: this.unrecognizedPrefix, stageOverflow: this.stageOverflow,
      ambiguousBodies: this.raw.filter((entry) => entry.ambiguous).length,
      evidenceTruncated: this.counts.limited > 0,
      retainedEntries: this.released ? 0 : this.raw.length,
      retainedCodeUnits: this.codeUnits + this.provenanceUnits, released: this.released,
      cpuTotalMs: this.cpuTotalMs, cpuMaxMs: this.cpuMaxMs,
      stages: this.stages.map((entry) => ({ name: entry.name, ...entry.counts })),
      rawDuplicateGroups: raw.length, bodyDuplicateGroups: bodies.length,
      exportTruncated: raw.length > this.limits.maxRows || bodies.length > this.limits.maxRows,
      rawDuplicates: raw.slice(0, this.limits.maxRows).map(project),
      bodyDuplicates: bodies.slice(0, this.limits.maxRows).map((entry) => ({
        ...project(entry), variants: entry.variants,
      })),
      unusedDefines: this.captureUnused ? {
        scope: "Observed owned convert/post/finalize provenance; exact derived equality omits only unreferenced generated uppercase non-reserved bool/small decimal-int declarations. Newlines and all other text remain. Candidate only, not semantic equivalence or a runtime/cache change. Counts per analyzed module call; names per distinct analyzed raw text.",
        ...this.unused, pendingEntries: this.pending.length + this.finals.length,
        ambiguous: this.raw.filter((entry) => entry.ambiguousDefines).length,
        evidenceTruncated: this.unused.provenanceLimited > 0 || this.counts.limited > 0,
        pendingCodeUnits: this.provenanceUnits,
        duplicateGroups: derived.length,
        exportTruncated: derived.length > this.limits.maxRows || this.namesTruncated,
        names: [...this.defineNames].map(([name, counts]) => ({ name, ...counts })),
        duplicates: derived.slice(0, this.limits.maxRows).map((entry) => ({
          ...project(entry), variants: entry.variants,
        })),
      } : null,
    };
  }

  release() {
    this.released = true;
    for (const entry of this.raw) entry.text = "";
    this.rawIndex.clear();
    this.bodyIndex.clear();
    this.derivedIndex.clear();
    for (const entry of this.raw) entry.defines = undefined;
    this.resetProvenance();
    this.codeUnits = 0;
  }
}

export type CompilationProfileEngine = {
  readonly isWebGPU: boolean;
  readonly _device?: object;
  readonly countersLastFrame?: Record<string, number>;
  readonly onDisposeObservable: ProfileObservable;
  readonly onContextRestoredObservable: ProfileObservable;
};

export type CompilationProfileOptions = {
  now?: () => number;
  slowCallMs?: number;
  captureShaderInventory?: boolean;
  /** Requires captureShaderInventory; comparison only, never changes WGSL. */
  captureUnusedDefineInventory?: boolean;
  /** Diagnostics may lower these limits, never exceed the fixed hard caps. */
  shaderInventoryLimits?: Partial<ShaderInventoryLimits>;
  onSlowCall?: (event: {
    phase: CompilationPhase;
    label: string;
    cpuMs: number;
    generation: number;
  }) => void;
  onError?: (channel: FaultChannel, error: unknown, label: string) => void;
  /** Returns an observed branch, not a replacement for the caller's promise.
   * Forward kind unchanged: only compilation-info diagnostics may overlap stages. */
  track?: <T>(
    promise: Promise<T>,
    channel: "shader" | "pipeline",
    label: string,
    kind: RenderOperationKind,
  ) => Promise<T>;
};

export const COMPILATION_PHASES = [
  "glslToSpirv",
  "spirvToWgsl",
  "compilerLoad",
  "shaderPreparation",
  "shaderModule",
  "shaderValidation",
  "syncPipeline",
  "asyncPipeline",
  "submit",
] as const;
export type CompilationPhase = (typeof COMPILATION_PHASES)[number];
type Metric = {
  calls: number;
  completed: number;
  failures: number;
  pending: number;
  cpuTotalMs: number;
  cpuMaxMs: number;
  asyncTotalMs: number;
  asyncMaxMs: number;
};
type Availability =
  "installed" | "unavailable" | "not-created" | "ownership-conflict";
const createMetric = (): Metric => ({
  calls: 0,
  completed: 0,
  failures: 0,
  pending: 0,
  cpuTotalMs: 0,
  cpuMaxMs: 0,
  asyncTotalMs: 0,
  asyncMaxMs: 0,
});
const createMetrics = () =>
  Object.fromEntries(
    COMPILATION_PHASES.map((phase) => [phase, createMetric()]),
  ) as Record<CompilationPhase, Metric>;
const owners = new WeakSet<object>();
const deviceOwners = new WeakMap<object, WebGpuCompilationProfile>();
const processorOwners = new WeakMap<object, WebGpuCompilationProfile>();
const BUNDLE_KEYS = [
  "numEnableEffects",
  "numEnableDrawWrapper",
  "numBundleCreationNonCompatMode",
  "numBundleReuseNonCompatMode",
] as const;
const CACHE_KEYS = [
  "NumCacheHitWithoutHash",
  "NumCacheHitWithHash",
  "NumCacheMiss",
  "NumPipelineCreationLastFrame",
] as const;
const HOOKS = [
  "engine._initializeLimits",
  "engine._compileRawShaderToSpirV",
  "engine.prepareGlslangAndTintAsync",
  "engine._preparePipelineContextAsync",
  "engine._createPipelineStageDescriptor",
  "tint.convertSpirV2WGSL",
  "device.createShaderModule",
  "device.createRenderPipeline",
  "device.createRenderPipelineAsync",
  "queue.submit",
  "module.getCompilationInfo",
] as const;

const field = (object: object, name: string): unknown =>
  (object as Record<string, unknown>)[name];
const labelOf = (value: unknown, fallback: string) =>
  typeof value === "string" ? value.slice(0, 160) : fallback;

/** Observes only this engine's methods and device; does not create, prewarm or
 * replace pipelines. CPU API-call durations are not GPU execution times. */
export class WebGpuCompilationProfile {
  private active = true;
  private generation = 1;
  private metrics = createMetrics();
  private hooks: Record<string, Availability> = {};
  private observerErrors = 0;
  private device?: object;
  private tint?: object;
  private processor?: object;
  private engineCleanups: (() => void)[] = [];
  private deviceCleanups: (() => void)[] = [];
  private tintCleanups: (() => void)[] = [];
  private processorCleanups: (() => void)[] = [];
  private lifecycleCleanups: (() => void)[] = [];
  private readonly now: () => number;
  private inventory?: ShaderInventory;
  readonly attachedAfterDeviceCreation: boolean;

  constructor(
    private readonly engine: CompilationProfileEngine,
    private readonly options: CompilationProfileOptions = {},
  ) {
    this.now = options.now ?? (() => performance.now());
    this.attachedAfterDeviceCreation = !!engine._device;
    this.hooks = Object.fromEntries(
      HOOKS.map((name) => [
        name,
        engine.isWebGPU ? "not-created" : "unavailable",
      ]),
    );
    if (!engine.isWebGPU) return;
    if (owners.has(engine))
      throw new Error(
        "This WebGPU engine already has a compilation profile owner.",
      );
    owners.add(engine);
    if (options.captureShaderInventory) {
      this.inventory = new ShaderInventory(this.now, options.shaderInventoryLimits,
        options.captureUnusedDefineInventory === true);
      this.install(
        engine, "_getWGSLShader", "engine._getWGSLShader", undefined,
        this.engineCleanups, undefined, undefined,
        (args, result) => this.inventory?.noteWGSL(args, result),
      );
      if (options.captureUnusedDefineInventory) {
        this.safe(() => {
          if (typeof dataMethod(engine, "_getShaderProcessor") === "function")
            this.install(engine, "_getShaderProcessor", "engine._getShaderProcessor", undefined,
              this.engineCleanups, () => this.bindProcessor());
          else this.hooks["engine._getShaderProcessor"] = "unavailable";
        });
        this.safe(() => this.bindProcessor());
      }
    }
    const disposed = engine.onDisposeObservable.add(() => this.dispose());
    const restored = engine.onContextRestoredObservable.add(() =>
      this.bindDevice(),
    );
    this.lifecycleCleanups.push(
      () => disposed.remove(true),
      () => restored.remove(true),
    );
    if (!this.active) {
      this.detach(this.lifecycleCleanups);
      return;
    }
    this.install(
      engine,
      "_initializeLimits",
      "engine._initializeLimits",
      undefined,
      this.engineCleanups,
      () => this.bindDevice(),
    );
    this.install(
      engine,
      "_compileRawShaderToSpirV",
      "engine._compileRawShaderToSpirV",
      "glslToSpirv",
      this.engineCleanups,
    );
    this.install(
      engine,
      "prepareGlslangAndTintAsync",
      "engine.prepareGlslangAndTintAsync",
      "compilerLoad",
      this.engineCleanups,
      undefined,
      () => this.bindTint(),
    );
    // The compiler-load promise may resume Babylon before an external health
    // branch settles. Bind immediately before the real Tint call as well.
    this.install(
      engine,
      "_createPipelineStageDescriptor",
      "engine._createPipelineStageDescriptor",
      undefined,
      this.engineCleanups,
      () => this.bindTint(),
    );
    this.install(
      engine,
      "_preparePipelineContextAsync",
      "engine._preparePipelineContextAsync",
      "shaderPreparation",
      this.engineCleanups,
    );
    this.bindDevice();
    this.bindTint();
  }

  private valid(generation: number) {
    return this.active && this.generation === generation;
  }
  /** Technical preparation label only; disabled inventory performs no text work. */
  setStage(stage: string | null) {
    if (this.active && this.inventory) this.safe(() => this.inventory!.setStage(stage));
  }
  private safe(callback: () => void) {
    try {
      callback();
    } catch {
      this.observerErrors++;
    }
  }
  private fault(channel: FaultChannel, error: unknown, label: string) {
    this.safe(() => this.options.onError?.(channel, error, label));
  }
  private channel(phase: CompilationPhase): FaultChannel {
    return phase === "submit"
      ? "render"
      : phase === "syncPipeline" || phase === "asyncPipeline"
        ? "pipeline"
        : "shader";
  }
  private label(phase: CompilationPhase, args: unknown[]) {
    try {
      if (phase === "glslToSpirv") return labelOf(args[1], phase);
      const first = args[0];
      if (first && typeof first === "object")
        return labelOf(
          Object.getOwnPropertyDescriptor(
            first,
            phase === "shaderPreparation" ? "_name" : "label",
          )?.value,
          phase,
        );
    } catch {
      this.observerErrors++;
    }
    return phase;
  }

  private observe(
    operation: Promise<unknown>,
    phase: CompilationPhase,
    metric: Metric,
    generation: number,
    started: number,
    label: string,
    onResolved?: () => void,
  ) {
    metric.pending++;
    let externalTracking = false;
    if (this.options.track) {
      try {
        const tracked = this.options.track(
          operation,
          this.channel(phase) as "shader" | "pipeline",
          label,
          phase === "shaderValidation" ? "shader-validation" : "preparation",
        );
        void tracked.catch(() => {});
        externalTracking = true;
      } catch {
        this.observerErrors++;
      }
    }
    // Observe the original operation for timing; the health branch above has a
    // separate rejection handler. Neither replaces the caller's return value.
    void operation
      .then(
        () => {
          if (!this.valid(generation)) return;
          metric.pending--;
          metric.completed++;
          const elapsed = Math.max(0, this.now() - started);
          metric.asyncTotalMs += elapsed;
          metric.asyncMaxMs = Math.max(metric.asyncMaxMs, elapsed);
          if (onResolved) this.safe(onResolved);
        },
        (error: unknown) => {
          if (!this.valid(generation)) return;
          metric.pending--;
          metric.completed++;
          metric.failures++;
          const elapsed = Math.max(0, this.now() - started);
          metric.asyncTotalMs += elapsed;
          metric.asyncMaxMs = Math.max(metric.asyncMaxMs, elapsed);
          if (!externalTracking) this.fault(this.channel(phase), error, label);
        },
      )
      .catch(() => {
        if (this.valid(generation)) this.observerErrors++;
      });
  }

  private install(
    target: object,
    methodName: string,
    hook: string,
    phase: CompilationPhase | undefined,
    cleanups: (() => void)[],
    before?: () => void,
    onResolved?: () => void,
    onReturned?: (args: unknown[], result: unknown) => void,
  ) {
    const original = field(target, methodName);
    if (typeof original !== "function") {
      this.hooks[hook] = "unavailable";
      return;
    }
    const descriptor = Object.getOwnPropertyDescriptor(target, methodName);
    const owner = this;
    const wrapper: Method = function (...args) {
      if (!owner.active) return Reflect.apply(original, this, args);
      if (before) owner.safe(before);
      if (!phase) {
        const result = Reflect.apply(original, this, args);
        if (onReturned) owner.safe(() => onReturned(args, result));
        return result;
      }
      const generation = owner.generation;
      const metric = owner.metrics[phase];
      const label = owner.label(phase, args);
      metric.calls++;
      const started = owner.now();
      let result: unknown;
      let failed = false;
      let failure: unknown;
      try {
        result = Reflect.apply(original, this, args);
      } catch (error) {
        failed = true;
        failure = error;
        throw error;
      } finally {
        const elapsed = Math.max(0, owner.now() - started);
        metric.cpuTotalMs += elapsed;
        metric.cpuMaxMs = Math.max(metric.cpuMaxMs, elapsed);
        if (failed) {
          metric.completed++;
          metric.failures++;
          if (owner.valid(generation))
            owner.fault(owner.channel(phase), failure, label);
        }
        owner.slowCall(phase, label, elapsed, generation);
      }
      owner.safe(() => {
        if (result && typeof field(result as object, "then") === "function")
          owner.observe(
            result as Promise<unknown>,
            phase,
            metric,
            generation,
            started,
            label,
            onResolved,
          );
        else {
          metric.completed++;
          if (onResolved) onResolved();
          if (phase === "shaderModule" && result && typeof result === "object") {
            if (owner.inventory) owner.safe(() => owner.inventory!.noteModule(args[0]));
            owner.inspectShader(result, label);
          }
        }
      });
      return result;
    };
    try {
      Object.defineProperty(target, methodName, {
        value: wrapper,
        writable: true,
        configurable: descriptor?.configurable ?? true,
        enumerable: descriptor?.enumerable ?? false,
      });
      this.hooks[hook] = "installed";
      cleanups.push(() => {
        if (
          Object.getOwnPropertyDescriptor(target, methodName)?.value !== wrapper
        )
          return;
        if (descriptor) Object.defineProperty(target, methodName, descriptor);
        else Reflect.deleteProperty(target, methodName);
      });
    } catch {
      this.hooks[hook] = "unavailable";
    }
  }

  private slowCall(
    phase: CompilationPhase,
    label: string,
    cpuMs: number,
    generation: number,
  ) {
    if (
      this.valid(generation) &&
      cpuMs >= Math.max(0, this.options.slowCallMs ?? 25)
    )
      this.safe(() =>
        this.options.onSlowCall?.({ phase, label, cpuMs, generation }),
      );
  }

  private inspectShader(module: object, label: string) {
    const getInfo = field(module, "getCompilationInfo");
    if (typeof getInfo !== "function") {
      this.hooks["module.getCompilationInfo"] = "unavailable";
      return;
    }
    this.hooks["module.getCompilationInfo"] = "installed";
    const generation = this.generation;
    const metric = this.metrics.shaderValidation;
    const started = this.now();
    metric.calls++;
    let result: unknown;
    let failed = false;
    let failure: unknown;
    try {
      result = Reflect.apply(getInfo, module, []);
    } catch (error) {
      failed = true;
      failure = error;
    } finally {
      const elapsed = Math.max(0, this.now() - started);
      metric.cpuTotalMs += elapsed;
      metric.cpuMaxMs = Math.max(metric.cpuMaxMs, elapsed);
      this.slowCall("shaderValidation", label, elapsed, generation);
    }
    if (failed) {
      metric.completed++;
      metric.failures++;
      this.fault("shader", failure, label);
      return;
    }
    const validated = Promise.resolve(result).then((info: unknown) => {
      if (!this.valid(generation)) return info;
      const messages =
        info && typeof info === "object" ? field(info, "messages") : undefined;
      if (!Array.isArray(messages))
        throw new Error(
          "Shader compilation information did not provide messages.",
        );
      const errors = messages.filter((message) => message?.type === "error");
      if (errors.length)
        throw new Error(
          errors
            .slice(0, 5)
            .map(
              (error) =>
                `${error.lineNum ?? "?"}:${error.linePos ?? "?"} ${String(error.message).slice(0, 500)}`,
            )
            .join("\n"),
        );
      return info;
    });
    this.observe(
      validated,
      "shaderValidation",
      metric,
      generation,
      started,
      label,
    );
  }

  private bindDevice() {
    if (!this.active || !this.engine.isWebGPU) return;
    const next = this.engine._device;
    if (next && next === this.device) return;
    const hadDevice = !!this.device;
    this.detach(this.deviceCleanups);
    if (this.device && deviceOwners.get(this.device) === this)
      deviceOwners.delete(this.device);
    this.device = undefined;
    if (hadDevice) {
      this.generation++;
      this.metrics = createMetrics();
      if (this.inventory) {
        this.inventory.release();
        this.inventory = new ShaderInventory(this.now, this.options.shaderInventoryLimits,
          this.options.captureUnusedDefineInventory === true);
      }
    }
    this.hooks["module.getCompilationInfo"] = "not-created";
    if (!next) {
      for (const name of [
        "createShaderModule",
        "createRenderPipeline",
        "createRenderPipelineAsync",
      ])
        this.hooks[`device.${name}`] = "not-created";
      this.hooks["queue.submit"] = "not-created";
      return;
    }
    if (deviceOwners.has(next)) {
      for (const name of [
        "createShaderModule",
        "createRenderPipeline",
        "createRenderPipelineAsync",
      ])
        this.hooks[`device.${name}`] = "ownership-conflict";
      this.hooks["queue.submit"] = "ownership-conflict";
      return;
    }
    this.device = next;
    deviceOwners.set(next, this);
    this.install(
      next,
      "createShaderModule",
      "device.createShaderModule",
      "shaderModule",
      this.deviceCleanups,
    );
    this.install(
      next,
      "createRenderPipeline",
      "device.createRenderPipeline",
      "syncPipeline",
      this.deviceCleanups,
    );
    this.install(
      next,
      "createRenderPipelineAsync",
      "device.createRenderPipelineAsync",
      "asyncPipeline",
      this.deviceCleanups,
    );
    const queue = field(next, "queue");
    if (queue && typeof queue === "object")
      this.install(
        queue,
        "submit",
        "queue.submit",
        "submit",
        this.deviceCleanups,
      );
    else this.hooks["queue.submit"] = "unavailable";
  }

  private bindTint() {
    if (!this.active) return;
    const value = field(this.engine, "_tintWASM");
    const next = value && typeof value === "object" ? value : undefined;
    if (next && next === this.tint) return;
    this.detach(this.tintCleanups);
    this.tint = next;
    if (next)
      this.install(
        next,
        "convertSpirV2WGSL",
        "tint.convertSpirV2WGSL",
        "spirvToWgsl",
        this.tintCleanups,
      );
    else this.hooks["tint.convertSpirV2WGSL"] = "not-created";
  }

  private bindProcessor() {
    if (!this.active || !this.inventory || !this.options.captureUnusedDefineInventory) return;
    const descriptor = Object.getOwnPropertyDescriptor(this.engine, "_shaderProcessorWGSL");
    const next = descriptor && "value" in descriptor && descriptor.value &&
      typeof descriptor.value === "object" ? descriptor.value as object : undefined;
    if (next && next === this.processor) return;
    this.detach(this.processorCleanups);
    if (this.processor && processorOwners.get(this.processor) === this)
      processorOwners.delete(this.processor);
    this.processor = undefined;
    this.inventory.resetProvenance();
    const names = ["_convertDefinesToConst", "postProcessor", "finalizeShaders"] as const;
    if (!next || processorOwners.has(next)) {
      for (const name of names)
        this.hooks[`processor.${name}`] = next ? "ownership-conflict" : "unavailable";
      return;
    }
    this.processor = next;
    processorOwners.set(next, this);
    for (const name of names) this.installProcessor(next, name);
  }

  private installProcessor(target: object,
    name: "_convertDefinesToConst" | "postProcessor" | "finalizeShaders") {
    const hook = `processor.${name}`;
    const descriptor = Object.getOwnPropertyDescriptor(target, name);
    const original = dataMethod(target, name);
    if (typeof original !== "function") { this.hooks[hook] = "unavailable"; return; }
    const owner = this;
    const wrapper: Method = function (...args) {
      const inventory = owner.inventory;
      if (!owner.active || owner.processor !== target || this !== target || !inventory)
        return Reflect.apply(original, this, args);
      let frame: PostFrame | undefined;
      if (name === "postProcessor") owner.safe(() => { frame = inventory.beginPost(args); });
      try {
        const result = Reflect.apply(original, this, args);
        if (owner.inventory === inventory && owner.active) owner.safe(() => {
          if (name === "_convertDefinesToConst") inventory.noteConverted(result);
          else if (name === "finalizeShaders") inventory.noteFinalized(args, result);
          else if (frame) inventory.endPost(frame, result);
        });
        return result;
      } finally {
        if (frame) owner.safe(() => inventory.leavePost(frame!));
      }
    };
    try {
      Object.defineProperty(target, name, {
        value: wrapper, writable: true, configurable: descriptor?.configurable ?? true,
        enumerable: descriptor?.enumerable ?? false,
      });
      this.hooks[hook] = "installed";
      this.processorCleanups.push(() => {
        if (Object.getOwnPropertyDescriptor(target, name)?.value !== wrapper) return;
        if (descriptor) Object.defineProperty(target, name, descriptor);
        else Reflect.deleteProperty(target, name);
      });
    } catch { this.hooks[hook] = "unavailable"; }
  }

  snapshot() {
    const finite = (value: unknown) =>
      typeof value === "number" && Number.isFinite(value) ? value : null;
    const cache = field(this.engine, "_cacheRenderPipeline");
    const constructor =
      cache && typeof cache === "object"
        ? field(cache, "constructor")
        : undefined;
    return {
      active: this.active,
      backend: this.engine.isWebGPU ? "webgpu" : "other",
      generation: this.generation,
      attachedAfterDeviceCreation: this.attachedAfterDeviceCreation,
      timingScope:
        "Inclusive CPU API calls (nested scopes overlap); async durations are completion latency, not GPU execution time" as const,
      metrics: Object.fromEntries(
        COMPILATION_PHASES.map((phase) => [phase, { ...this.metrics[phase] }]),
      ),
      hooks: { ...this.hooks },
      observerErrors: this.observerErrors,
      shaderInventory: this.inventory?.snapshot() ?? null,
      bundleCountersLastFrame: this.engine.countersLastFrame
        ? Object.fromEntries(
            BUNDLE_KEYS.map((key) => [
              key,
              finite(this.engine.countersLastFrame?.[key]),
            ]),
          )
        : null,
      sharedCacheCounters: {
        scope:
          "Babylon static counters shared by all engines in this JavaScript realm" as const,
        values:
          typeof constructor === "function"
            ? Object.fromEntries(
                CACHE_KEYS.map((key) => [key, finite(field(constructor, key))]),
              )
            : null,
      },
    };
  }

  private detach(cleanups: (() => void)[]) {
    for (const cleanup of cleanups.splice(0).reverse()) this.safe(cleanup);
  }
  dispose() {
    if (!this.active) return;
    this.active = false;
    this.detach(this.deviceCleanups);
    this.detach(this.tintCleanups);
    this.detach(this.processorCleanups);
    this.detach(this.engineCleanups);
    this.detach(this.lifecycleCleanups);
    if (this.device && deviceOwners.get(this.device) === this)
      deviceOwners.delete(this.device);
    owners.delete(this.engine);
    this.device = undefined;
    this.tint = undefined;
    if (this.processor && processorOwners.get(this.processor) === this)
      processorOwners.delete(this.processor);
    this.processor = undefined;
    this.inventory?.release();
    for (const metric of Object.values(this.metrics)) metric.pending = 0;
  }
}
