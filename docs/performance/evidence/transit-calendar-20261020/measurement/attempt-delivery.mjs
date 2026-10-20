/** Browser-safe transport: preserving the complete raw value precedes any I/O. */
export async function deliverAttempt(raw, transport, preserve) {
  const saved = structuredClone(raw);
  preserve(saved);
  try {
    const response = await transport(saved);
    return {persisted: response.persisted === true, accepted: response.accepted === true,
      file: response.file ?? null, reasons: response.reasons ?? [response.error ?? 'Server did not acknowledge raw storage'],
      exportable: true};
  } catch (error) {
    return {persisted: false, accepted: false, file: null, reasons: ['Transport failure: ' + String(error)], exportable: true};
  }
}
