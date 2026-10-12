/** Keep frame samples and diagnostic counters inspectable without placing the
 * per-mesh inventory into one enormous DOM/accessibility text node. The original
 * result remains intact for the explicit full-record download and local save. */
export function benchmarkPresentation<
  T extends { modelReview: readonly unknown[] },
>(result: T) {
  const { modelReview, ...measurement } = result;
  return {
    ...measurement,
    modelReviewSummary: {
      meshCount: modelReview.length,
      fullInventoryInDownload: true,
    },
  };
}

type DownloadLink = { click(): void; remove(): void };
export type BenchmarkDownloadHost = {
  createUrl(blob: Blob): string;
  revokeUrl(url: string): void;
  createLink(url: string, filename: string): DownloadLink;
  schedule(callback: () => void, delay: number): number;
  cancel(timer: number): void;
};

const browserDownloads: BenchmarkDownloadHost = {
  createUrl: (blob) => URL.createObjectURL(blob),
  revokeUrl: (url) => URL.revokeObjectURL(url),
  createLink(url, filename) {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    return {
      click() {
        document.body.append(link);
        link.click();
      },
      remove: () => link.remove(),
    };
  },
  schedule: (callback, delay) => window.setTimeout(callback, delay),
  cancel: (timer) => window.clearTimeout(timer),
};

/** Own only in-flight Blob URLs; do not retain a second copy of the result. */
export function createBenchmarkDownloads(
  host: BenchmarkDownloadHost = browserDownloads,
) {
  const pending = new Map<string, number>();
  return {
    download(result: { date: string }) {
      const json = JSON.stringify(result, null, 2);
      const url = host.createUrl(
        new Blob([json], { type: "application/json" }),
      );
      let scheduled = false;
      try {
        const filename = `strahov-benchmark-${result.date.replace(/[^0-9TZ.-]/g, "-")}.json`;
        const link = host.createLink(url, filename);
        try {
          link.click();
        } finally {
          link.remove();
        }
        // Give the browser time to consume a successful download before revoke.
        const timer = host.schedule(() => {
          pending.delete(url);
          host.revokeUrl(url);
        }, 1000);
        pending.set(url, timer);
        scheduled = true;
      } finally {
        if (!scheduled) host.revokeUrl(url);
      }
    },
    dispose() {
      for (const [url, timer] of pending) {
        host.cancel(timer);
        host.revokeUrl(url);
      }
      pending.clear();
    },
  };
}
