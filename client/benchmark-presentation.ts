/** Keep frame samples and diagnostic counters inspectable without placing the
 * per-mesh inventory into one enormous DOM/accessibility text node. The original
 * result remains intact for the explicit full-record download and local save. */
export function benchmarkPresentation<T extends { modelReview: readonly unknown[] }>(result: T) {
  const { modelReview, ...measurement } = result;
  return {
    ...measurement,
    modelReviewSummary: { meshCount: modelReview.length, fullInventoryInDownload: true },
  };
}
