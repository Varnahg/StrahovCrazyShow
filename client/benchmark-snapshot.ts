/** Capture only live controller diagnostics at benchmark completion.
 * Keep freshly built model/render inventories and completed frame samples out
 * of this input: they already belong to the result and can be much larger.
 * A deep copy is required because controllers mutate nested stats on dispose. */
export function snapshotBenchmarkDiagnostics<T>(diagnostics: T): T {
  return structuredClone(diagnostics);
}
