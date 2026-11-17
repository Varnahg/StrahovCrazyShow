/** Real React interaction fixture for the persistent chat; all messages stay in this local test. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, isAbsolute, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import react from "@vitejs/plugin-react";
import { chromium } from "playwright";

const repo = fileURLToPath(new URL("../", import.meta.url));
const output = process.env.CHAT_BROWSER_OUTPUT;
if (!output || !isAbsolute(output)) throw Error("Set CHAT_BROWSER_OUTPUT to the owned absolute artifact directory.");
const port = Number(process.env.CHAT_BROWSER_PORT ?? 4291);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error("Invalid chat fixture port.");
await mkdir(output, { recursive: true });
await build({
  configFile: false,
  root: resolve(repo, "tests/fixtures/chat-browser"),
  publicDir: false,
  plugins: [react()],
  build: { outDir: output, emptyOutDir: false },
});
const server = createServer((request, response) => {
  void (async () => {
    const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    const font = path === "/fonts/manrope/Manrope-Variable.ttf";
    const file = font ? resolve(repo, "public/fonts/manrope/Manrope-Variable.ttf")
      : resolve(output, path === "/" ? "index.html" : "." + path);
    const inside = relative(output, file);
    if (!font && (inside.startsWith("..") || isAbsolute(inside))) {
      response.writeHead(403).end(); return;
    }
    try {
      const data = await readFile(file);
      response.writeHead(200, {
        "Content-Type": ({ ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css", ".ttf": "font/ttf" } as Record<string, string>)[extname(file)] ?? "application/octet-stream",
        "Cache-Control": "no-store",
      });
      response.end(data);
    } catch { response.writeHead(404).end(); }
  })().catch(() => response.destroy());
});
await new Promise<void>((resolve, reject) => {
  server.once("error", reject);
  server.listen(port, "127.0.0.1", resolve);
});
if (process.argv.includes("--serve-only")) {
  console.log("Chat fixture http://127.0.0.1:" + port);
} else {
  const browser = await chromium.launch({ channel: process.env.CHAT_BROWSER_CHANNEL ?? "msedge", headless: true, args: ["--disable-gpu"] });
  const failures: string[] = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    page.on("pageerror", error => failures.push(error.message));
    await page.goto("http://127.0.0.1:" + port);
    const surface = page.locator("[data-player-chat]");
    const input = surface.getByRole("textbox", { name: "Zpráva", exact: true });
    const currentMode = () => page.locator("[data-fixture-mode]").textContent();
    await surface.getByText("Kudy se jde do čajovny?", { exact: true }).waitFor();
    await input.click();
    assert.equal(await currentMode(), "composing");
    assert.ok(await input.evaluate(element => element === document.activeElement));
    await input.fill("Jedno kliknutí");
    await input.press("Enter");
    await page.waitForFunction(() => document.querySelector<HTMLInputElement>('[data-player-chat] input[aria-label="Zpráva"]')?.value === "");
    assert.equal(await currentMode(), "composing");
    assert.ok(await input.evaluate(element => element === document.activeElement));
    await input.press("Escape");
    assert.equal(await currentMode(), "idle");
    await page.waitForTimeout(8_200);
    assert.ok(await surface.getByText("Jedno kliknutí", { exact: true }).isVisible(), "messages persist beyond old fade timer");
    await page.getByRole("button", { name: "Příchozí DM", exact: true }).click();
    const dm = surface.locator("article").filter({ has: page.getByText("Soukromá zkouška citace", { exact: true }) });
    await dm.getByRole("button", { name: /Odpovědět/ }).click();
    assert.equal(await currentMode(), "composing");
    assert.ok(await input.evaluate(element => element === document.activeElement));
    await input.fill("Soukromá odpověď");
    await input.press("Enter");
    await page.waitForFunction(() => document.querySelector("[data-fixture-sent]")?.textContent?.includes("Soukromá odpověď"));
    const sent = JSON.parse(await page.locator("[data-fixture-sent]").textContent() ?? "[]");
    assert.equal(sent.at(-1).channel, "dm:nela");
    assert.equal(typeof sent.at(-1).replyTo, "string");
    await page.waitForFunction(() => document.querySelector<HTMLInputElement>('[data-player-chat] input[aria-label="Zpráva"]')?.value === "");
    await input.fill("Zachovaný koncept");
    await surface.getByRole("button", { name: "Zvětšit chat", exact: true }).click();
    assert.equal(await currentMode(), "expanded");
    assert.equal(await input.inputValue(), "Zachovaný koncept");
    await surface.getByRole("button", { name: "Zmenšit chat", exact: true }).click();
    assert.equal(await currentMode(), "composing");
    assert.equal(await input.inputValue(), "Zachovaný koncept");
    await input.press("Escape");
    await page.getByRole("button", { name: "Soukromý text", exact: true }).click();
    assert.equal(await surface.getByText("Soukromá zkouška citace", { exact: true }).count(), 0);
    assert.equal(await input.inputValue(), "", "private draft is hidden while idle");
    await input.click();
    assert.equal(await input.inputValue(), "Zachovaný koncept");
    await dm.getByRole("button", { name: /Odpovědět/ }).click();
    await input.press("Escape");
    assert.equal(await surface.locator(".player-chat-reference").count(), 0, "private draft quote is also hidden");
    await page.getByRole("button", { name: "Soukromý text", exact: true }).click();
    await page.getByRole("button", { name: "Spojení", exact: true }).click();
    assert.equal(await surface.getByRole("button", { name: "Odeslat", exact: true }).isEnabled(), false);
    assert.equal(await input.inputValue(), "Zachovaný koncept");
    await page.getByRole("button", { name: "Spojení", exact: true }).click();
    await surface.getByRole("combobox", { name: "Vybrat příjemce", exact: true }).selectOption("ai");
    const aiInput = surface.locator("textarea");
    await aiInput.fill("Kde je čajovna?");
    const aiColors = await surface.locator(".crazy-form-actions button").evaluate(element => {
      const style = getComputedStyle(element);
      return { ink: style.color, fill: style.backgroundColor };
    });
    assert.equal(aiColors.ink, "rgb(73, 48, 29)");
    assert.equal(aiColors.fill, "rgb(255, 207, 146)");
    await aiInput.press("Enter");
    await surface.getByText("Ukázková odpověď pro kontrolu vzhledu.", { exact: true }).waitFor();
    await aiInput.press("Escape");
    await page.locator("canvas").press("t");
    assert.ok(await aiInput.evaluate(element => element === document.activeElement), "T restores current AI editor");
    await surface.getByRole("button", { name: "Zvětšit chat", exact: true }).click();
    assert.ok(await surface.getByText("Ukázková odpověď pro kontrolu vzhledu.", { exact: true }).isVisible());
    await page.screenshot({ path: resolve(output, "expanded.png") });
    await surface.getByRole("button", { name: "Zmenšit chat", exact: true }).click();
    await surface.getByRole("combobox", { name: "Vybrat příjemce", exact: true }).selectOption("global");
    await page.getByRole("button", { name: "Historie", exact: true }).click();
    const history = surface.locator(".player-chat-log");
    await history.evaluate(element => { element.scrollTop = 150; });
    await surface.getByRole("button", { name: /Nové zprávy/ }).waitFor();
    const anchor = await history.evaluate(element => {
      const top = element.getBoundingClientRect().top;
      return [...element.querySelectorAll<HTMLElement>("article")].find(row => row.getBoundingClientRect().bottom > top)?.dataset.messageId;
    });
    await surface.getByRole("button", { name: "Zvětšit chat", exact: true }).click();
    await surface.getByRole("button", { name: "Zmenšit chat", exact: true }).click();
    const restored = await history.evaluate(element => {
      const top = element.getBoundingClientRect().top;
      return [...element.querySelectorAll<HTMLElement>("article")].find(row => row.getBoundingClientRect().bottom > top)?.dataset.messageId;
    });
    assert.equal(restored, anchor, "expansion preserves the read message");
    await surface.getByRole("button", { name: /Nové zprávy/ }).click();
    for (const [width, height] of [[390, 720], [320, 568], [844, 390]]) {
      await page.setViewportSize({ width, height });
      await input.click();
      const details = await surface.evaluate(element => {
        const rect = element.getBoundingClientRect();
        return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, overflow: element.scrollWidth - element.clientWidth };
      });
      assert.ok(details.x >= 0 && details.right <= width + 1 && details.y >= 0 && details.bottom <= height + 1, JSON.stringify(details));
      assert.ok(details.overflow <= 1);
      assert.equal(await page.locator(".minimap-frame").isVisible(), false);
      assert.ok(await page.locator(".chat-map-toggle").isVisible());
    }
    await page.screenshot({ path: resolve(output, "narrow.png") });
    await page.setViewportSize({ width: 640, height: 512 });
    await surface.getByRole("button", { name: "Zvětšit chat", exact: true }).click();
    await page.locator("html").evaluate(element => { element.style.fontSize = "32px"; });
    assert.ok(await input.isVisible());
    assert.equal(await surface.evaluate(element => element.scrollWidth <= element.clientWidth + 1), true);
    await page.locator("html").evaluate(element => { element.style.fontSize = ""; });
    await surface.getByRole("button", { name: "Zmenšit chat", exact: true }).click();
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.getByRole("button", { name: "Pozadí", exact: true }).click();
    const type = await surface.locator("article p").first().evaluate(element => {
      const style = getComputedStyle(element);
      return { font: style.fontFamily, size: style.fontSize, color: style.color };
    });
    assert.match(type.font, /Manrope/);
    assert.equal(type.size, "16px");
    await page.screenshot({ path: resolve(output, "light-background.png") });
    assert.deepEqual(failures, []);
    await writeFile(resolve(output, "result.json"), JSON.stringify({ status: "passed", browser: browser.version(), type, viewports: [[1366,768],[390,720],[320,568],[844,390]] }, null, 2));
    console.log("PASS persistent chat browser interactions, direct DM reply, AI, drafts and narrow layouts");
  } finally {
    await browser.close();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}
