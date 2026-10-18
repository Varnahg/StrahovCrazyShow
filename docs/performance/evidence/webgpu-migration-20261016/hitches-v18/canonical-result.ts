/** Counterfactual CPU proof only; never installed in the application.
 * Input contract: a completed flat literal define block, not arbitrary shader
 * preprocessor text. No property reads, _keys changes or persistent cache.
 */
export const MAX_CHARS = 32768;
export const MAX_DEFINES = 1024;
// Signed decimal constants cover native -1 indices and PBR numeric strings.
// Hex/suffixes/expressions are deliberately outside this proof's contract.
const literal = '[+-]?(?:(?:0|[1-9][0-9]*)(?:\\.[0-9]*)?|\\.[0-9]+)(?:[eE][+-]?[0-9]+)?';
const linePattern = new RegExp(`^#define ([A-Za-z_][A-Za-z0-9_]*)(?: (${literal}))?$`);
const reserved = new Set(['defined','true','false','WEBGPU','WEBGL1','WEBGL2','NATIVE','IS_NDC_HALF_ZRANGE','USE_REVERSE_DEPTHBUFFER','USE_EXACT_SRGB_CONVERSIONS',...Object.getOwnPropertyNames(Object.prototype)]);

export function canonicalResult(text: string): string {
  if (!text || text.length > MAX_CHARS || !text.endsWith('\n') || /[^\x20-\x7e\n]/.test(text)) return text;
  const lines = text.slice(0,-1).split('\n');
  if (lines.length > MAX_DEFINES) return text;
  const seen = new Set<string>();
  const records: {name:string;line:string}[] = [];
  for (const line of lines) {
    const match = linePattern.exec(line);
    if (!match) return text;
    const [,name,value] = match;
    if (name.includes('__') || name.startsWith('GL_') || reserved.has(name) || seen.has(name) || value !== undefined && !Number.isFinite(Number(value))) return text;
    seen.add(name); records.push({name,line});
  }
  records.sort((a,b)=>a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  return records.map(record=>record.line).join('\n')+'\n';
}

/** Process-local ownership wrapper used only by this isolated test process. */
export async function withCanonicalResult<T>(prototype: object, callback:()=>Promise<T>): Promise<T> {
  const original = Object.getOwnPropertyDescriptor(prototype,'toString');
  if (!original || typeof original.value !== 'function' || !original.configurable) throw new Error('Unexpected MaterialDefines.toString descriptor');
  function wrapped(this: unknown,...args: unknown[]) {
    return canonicalResult(Reflect.apply(original!.value,this,args));
  }
  Object.defineProperty(prototype,'toString',{...original,value:wrapped});
  try { return await callback(); }
  finally {
    if (Object.getOwnPropertyDescriptor(prototype,'toString')?.value === wrapped)
      Object.defineProperty(prototype,'toString',original);
    else throw new Error('Lost process-local toString ownership; foreign replacement preserved');
  }
}
