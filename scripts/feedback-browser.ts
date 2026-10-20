/** Isolated real React/native IndexedDB regression; never serves the production app or uses Linear. */
import assert from "node:assert/strict";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import react from "@vitejs/plugin-react";
import {
  validateFeedbackReport,
  type FeedbackReport,
} from "../shared/feedback";
import { IMAGE_BASE64 } from "../tests/fixtures/feedback-browser/capture";
import type { Browser, BrowserContext, Page } from "playwright";

const repo = fileURLToPath(new URL("../", import.meta.url));
const cache = resolve(repo, ".cache/player-feedback-validation");
const output = resolve(
  repo,
  process.env.FEEDBACK_BROWSER_OUTPUT ??
    ".cache/player-feedback-validation/browser-fixture",
);
const inside = relative(cache, output);
if (!inside || inside.startsWith("..") || isAbsolute(inside))
  throw new Error(
    "FEEDBACK_BROWSER_OUTPUT must be a child directory of .cache/player-feedback-validation",
  );
const port = Number(process.env.FEEDBACK_BROWSER_PORT ?? 4207);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Invalid FEEDBACK_BROWSER_PORT");
const origin = `http://127.0.0.1:${port}`;
const serveOnly = process.argv.includes("--serve-only");

if (!process.argv.includes("--skip-build"))
  await build({
    configFile: false,
    root: resolve(repo, "tests/fixtures/feedback-browser"),
    publicDir: false,
    plugins: [react()],
    build: { outDir: output, emptyOutDir: true },
  });
if (process.argv.includes("--build-only")) process.exit(0);

type Received = {
  metadataRaw: string;
  report: FeedbackReport;
  imageBase64: string;
  imageBytes: number;
  imageType: string;
};
const received: Received[] = [];
let mode: "accept" | "hold" = "accept";
function json(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(value));
}
async function body(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > 5 * 1024 * 1024) throw new Error("Fixture body limit exceeded");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}
const server = createServer((request, response) => {
  void (async () => {
    const pathname = new URL(request.url ?? "/", origin).pathname;
    if (pathname === "/fixture/results" && request.method === "GET")
      return json(response, 200, { mode, received });
    if (pathname === "/fixture/control" && request.method === "POST") {
      const value = JSON.parse((await body(request)).toString()) as {
        mode?: string;
      };
      if (value.mode !== "accept" && value.mode !== "hold")
        return json(response, 400, { error: "invalid-mode" });
      mode = value.mode;
      return json(response, 200, { mode });
    }
    if (pathname === "/api/feedback" && request.method === "POST") {
      const form = await new Request(origin + pathname, {
        method: "POST",
        headers: { "Content-Type": request.headers["content-type"] ?? "" },
        body: new Uint8Array(await body(request)),
      }).formData();
      const raw = form.get("metadata"),
        image = form.get("screenshot");
      const validated = validateFeedbackReport(
        typeof raw === "string" ? JSON.parse(raw) : null,
      );
      if (!validated.ok || !(image instanceof Blob))
        return json(response, 400, { error: "invalid-fixture-report" });
      if (mode === "hold")
        return json(response, 503, { error: "fixture-hold" });
      const bytes = Buffer.from(await image.arrayBuffer());
      received.push({
        metadataRaw: String(raw),
        report: validated.report,
        imageBase64: bytes.toString("base64"),
        imageBytes: bytes.length,
        imageType: image.type,
      });
      return json(response, 202, {
        accepted: true,
        id: validated.report.id,
        receivedAtUTC: new Date().toISOString(),
      });
    }
    if (request.method !== "GET")
      return json(response, 405, { error: "method" });
    const file = resolve(
      output,
      "." + decodeURIComponent(pathname === "/" ? "/index.html" : pathname),
    );
    const path = relative(output, file);
    if (path.startsWith("..") || isAbsolute(path))
      return json(response, 404, { error: "not-found" });
    try {
      const content = await readFile(file);
      response.writeHead(200, {
        "Content-Type":
          (
            {
              ".html": "text/html; charset=utf-8",
              ".js": "application/javascript",
              ".css": "text/css",
            } as Record<string, string>
          )[extname(file)] ?? "application/octet-stream",
        "Cache-Control": "no-store",
      });
      response.end(content);
    } catch {
      json(response, 404, { error: "not-found" });
    }
  })().catch((error: unknown) => {
    console.error(error);
    if (!response.headersSent) json(response, 500, { error: "fixture-error" });
    else response.end();
  });
});
await new Promise<void>((resolve, reject) => {
  server.once("error", reject);
  server.listen(port, "127.0.0.1", resolve);
});

if (serveOnly) {
  console.log(
    `Feedback fixture ready: ${origin} (visible controls + native IndexedDB/receiver evidence). Ctrl+C stops only this server.`,
  );
  const stop = () => server.close(() => process.exit(0));
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
} else {
  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let page!: Page;
  const errors: string[] = [];
  const evidence = output + "-evidence";
  const focusDescription = async (current: Page) => {
    await current.waitForFunction(
      () => document.activeElement?.tagName === "TEXTAREA",
      undefined,
      { timeout: 3000 },
    );
    assert.equal(
      await current
        .locator("dialog textarea[required]")
        .evaluate((element) => element === document.activeElement),
      true,
    );
  };
  const pending = async (current: Page) =>
    current.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("strahov-feedback-v1", 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        const entries = await new Promise<
          { report: FeedbackReport; image: Blob }[]
        >((resolve, reject) => {
          const tx = db.transaction("reports", "readonly"),
            request = tx.objectStore("reports").getAll();
          tx.oncomplete = () => resolve(request.result);
          tx.onerror = tx.onabort = () => reject(tx.error);
        });
        return await Promise.all(
          entries.map(async (entry) => ({
            report: entry.report,
            imageBase64: btoa(
              String.fromCharCode(
                ...new Uint8Array(await entry.image.arrayBuffer()),
              ),
            ),
          })),
        );
      } finally {
        db.close();
      }
    });
  try {
    await mkdir(evidence, { recursive: true });
    const { chromium } = await import("playwright");
    browser = await chromium.launch({
      headless: true,
      ...(process.env.FEEDBACK_BROWSER_CHANNEL
        ? { channel: process.env.FEEDBACK_BROWSER_CHANNEL }
        : {}),
      args: ["--disable-gpu"],
    });
    context = await browser.newContext({
      locale: "en-GB",
      viewport: { width: 1000, height: 850 },
    });
    context.on("page", (opened) =>
      opened.on("pageerror", (error) => errors.push(error.message)),
    );
    page = await context.newPage();
    await page.goto(origin);
    await page.getByRole("button", { name: "English", exact: true }).click();
    const trigger = () =>
      page.getByRole("button", { name: "Open feedback", exact: true });
    await trigger().click();
    await focusDescription(page);
    await page.locator("dialog img").waitFor();
    await context.setOffline(true);
    await page
      .getByLabel("Description", { exact: false })
      .fill("Offline screenshot survives closing the page.");
    await page
      .getByLabel("Email for follow-up questions (optional)")
      .fill("fixture@example.invalid");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await page.getByText(/^Waiting to send\./).waitFor();
    assert.equal(
      await page
        .getByText("Received. Thank you for your feedback.", { exact: true })
        .count(),
      0,
    );
    const saved = await pending(page);
    assert.equal(saved.length, 1);
    assert.equal(saved[0].imageBase64, IMAGE_BASE64);
    assert.equal(received.length, 0);
    await page.keyboard.press("Escape");
    assert.equal(
      await trigger().evaluate((element) => element === document.activeElement),
      true,
    );
    await page.close();
    await context.setOffline(false);
    page = await context.newPage();
    await page.goto(origin);
    // The remounted production component must send from native IDB without an online event or open dialog.
    await page.waitForFunction(() =>
      document
        .querySelector("#server-evidence")
        ?.textContent?.includes('"imageBytes"'),
    );
    assert.equal(received.length, 1);
    assert.equal(received[0].metadataRaw, JSON.stringify(saved[0].report));
    assert.deepEqual(received[0].report, saved[0].report);
    assert.equal(received[0].imageBase64, saved[0].imageBase64);
    assert.equal(received[0].imageType, "image/png");
    await trigger().focus();
    await page.keyboard.press("F8");
    await focusDescription(page);
    await page
      .getByText("Your earlier report was received.", { exact: true })
      .waitFor();
    assert.equal((await pending(page)).length, 0);

    // Native focus must work for F8, keyboard activation, mouse and reopening after accepted result.
    for (let i = 0; i < 18; i++) {
      await page.keyboard.press("Tab");
      assert.equal(
        await page.evaluate(() => {
          const dialog = document.querySelector("dialog"),
            active = document.activeElement;
          // Native Chromium may include browser chrome in the tab cycle (BODY is
          // reported then). Background application controls must remain inert.
          return (
            Boolean(dialog?.matches(":modal")) &&
            (active === document.body ||
              active === document.documentElement ||
              Boolean(active?.closest("dialog")))
          );
        }),
        true,
      );
    }
    await page.keyboard.press("Escape");
    assert.equal(
      await trigger().evaluate((element) => element === document.activeElement),
      true,
    );
    await trigger().focus();
    await page.keyboard.press("Enter");
    await focusDescription(page);
    await page
      .locator("dialog textarea[required]")
      .fill("Accepted-state focus regression.");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await page
      .getByText("Received. Thank you for your feedback.", { exact: true })
      .waitFor();
    await page.getByRole("button", { name: "Done", exact: true }).click();
    assert.equal(
      await trigger().evaluate((element) => element === document.activeElement),
      true,
    );
    await trigger().click();
    await focusDescription(page);
    assert.equal(
      await page.locator("dialog textarea[required]").inputValue(),
      "",
    );
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Čeština", exact: true }).click();
    await trigger().click();
    await focusDescription(page);
    await page
      .getByRole("heading", { name: "Zpětná vazba", exact: true })
      .waitFor();
    assert.equal(await page.getByLabel("Popis", { exact: false }).count(), 1);
    assert.equal(await page.locator("dialog input[type=radio]").count(), 3);
    await page.setViewportSize({ width: 360, height: 700 });
    assert.equal(
      await page
        .locator("dialog")
        .evaluate(
          (element) =>
            element.getBoundingClientRect().right <= innerWidth &&
            element.scrollWidth <= element.clientWidth + 1,
        ),
      true,
    );
    await page.keyboard.press("Escape");
    assert.deepEqual(errors, []);
    await writeFile(
      resolve(evidence, "result.json"),
      JSON.stringify(
        {
          passed: true,
          checks: [
            "actual React submit",
            "native offline Blob persistence",
            "close/reload online startup",
            "exact metadata and image bytes",
            "matching receipt clears IDB",
            "mouse/F8/Enter/autofocus/accepted reopen/return",
            "native Tab",
            "CS/EN",
            "mobile width",
          ],
          received,
        },
        null,
        2,
      ),
    );
    console.log(
      "Feedback Chromium regression passed: real form, native IndexedDB/offline/reload/receipt, exact bytes and native focus/CS/EN.",
    );
  } catch (error) {
    if (page)
      await page
        .screenshot({ path: resolve(evidence, "failure.png"), fullPage: true })
        .catch(() => {});
    await writeFile(
      resolve(evidence, "failure.json"),
      JSON.stringify({ error: String(error), errors, received }, null, 2),
    ).catch(() => {});
    throw error;
  } finally {
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}
