import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import {
  createFeedbackService,
  type FeedbackServiceOptions,
} from "../server/feedback";
import { FEEDBACK_LIMITS, type FeedbackReport } from "../shared/feedback";

const report = (): FeedbackReport => ({
  version: 1,
  id: "c0000000-0000-4000-8000-000000000001",
  createdAtUTC: "2026-10-20T20:00:00.000Z",
  kind: "idea",
  message: "Add a bench by the entrance",
  context: {
    clientBuildId: "test-client",
    mode: "guest",
    locale: "cs",
    page: "game",
  },
  capture: { state: "unavailable", reason: "no-frame" },
});
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jHmsAAAAASUVORK5CYII=",
  "base64",
);
function imageReport(): FeedbackReport {
  return {
    ...report(),
    capture: {
      state: "ready",
      width: 1,
      height: 1,
      mimeType: "image/png",
      requestedAtMs: 1,
      capturedAtMs: 2,
      frame: {
        frameId: 1,
        renderedAtUTC: "2026-10-20T20:00:00.000Z",
        renderCompletedAtMs: 2,
        position: { x: 1, y: 2, z: 3 },
        camera: { x: 4, y: 5, z: 6, yaw: 0, pitch: 0 },
        renderWidth: 1,
        renderHeight: 1,
        cssWidth: 100,
        cssHeight: 100,
        quality: "medium",
        backend: "webgl2",
      },
    },
  };
}
async function multipart(
  value: unknown,
  image?: Blob,
  extra?: (form: FormData) => void,
) {
  const form = new FormData();
  form.append("metadata", JSON.stringify(value));
  if (image) form.append("screenshot", image, "image.png");
  extra?.(form);
  const request = new Request("http://localhost/api/feedback", {
    method: "POST",
    body: form,
  });
  return {
    bytes: Buffer.from(await request.arrayBuffer()),
    type: request.headers.get("Content-Type")!,
  };
}
function mockRequest(
  bytes: Buffer,
  options: {
    method?: string;
    url?: string;
    type?: string;
    headers?: Record<string, string>;
  } = {},
) {
  const request = Readable.from(bytes.length ? [bytes] : []) as IncomingMessage;
  request.method = options.method ?? "POST";
  request.url = options.url ?? "/api/feedback";
  request.headers = {
    host: "localhost:1234",
    origin: "http://localhost:1234",
    "content-type": options.type ?? "application/json",
    ...options.headers,
  };
  Object.defineProperty(request, "socket", {
    value: { remoteAddress: "127.0.0.1" },
  });
  return request;
}
function mockResponse() {
  const headers = new Map<string, unknown>();
  let status = 0,
    body = "";
  const response = {
    destroyed: false,
    setHeader(key: string, value: unknown) {
      headers.set(key.toLowerCase(), value);
      return response;
    },
    writeHead(value: number) {
      status = value;
      return response;
    },
    end(value?: string) {
      body = value ?? "";
      return response;
    },
  };
  return {
    response: response as unknown as ServerResponse,
    result: () => ({
      status,
      headers,
      body: body ? JSON.parse(body) : undefined,
    }),
  };
}
async function fixture(
  action: (
    service: Awaited<ReturnType<typeof createFeedbackService>>,
    directory: string,
  ) => Promise<void>,
  options: FeedbackServiceOptions = {},
) {
  const directory = await mkdtemp(join(tmpdir(), "feedback-server-"));
  const service = await createFeedbackService({
    directory,
    env: {},
    workerIntervalMs: 3600000,
    ...options,
  });
  try {
    await action(service, directory);
  } finally {
    await service.close();
    await rm(directory, { recursive: true, force: true });
  }
}
async function send(
  service: Awaited<ReturnType<typeof createFeedbackService>>,
  value: unknown = report(),
  image?: Blob,
  extra?: (form: FormData) => void,
  headers?: Record<string, string>,
) {
  const body = await multipart(value, image, extra),
    res = mockResponse();
  assert.equal(
    await service.handle(
      mockRequest(body.bytes, { type: body.type, headers }),
      res.response,
    ),
    true,
  );
  return res.result();
}
test("native real multipart is durably accepted for guest, with a private minimal receipt", () =>
  fixture(async (service, directory) => {
    const result = await send(service);
    assert.equal(result.status, 202);
    assert.deepEqual(Object.keys(result.body).sort(), [
      "accepted",
      "id",
      "receivedAtUTC",
    ]);
    assert.equal(result.body.id, report().id);
    assert.equal(result.headers.get("cache-control"), "no-store");
    assert.equal(
      result.headers.get("access-control-allow-origin"),
      "http://localhost:1234",
    );
    const saved = JSON.parse(
      await readFile(join(directory, report().id, "report.json"), "utf8"),
    );
    assert.equal(saved.report.context.mode, "guest");
    await service.flush();
    assert.equal(
      JSON.parse(
        await readFile(join(directory, report().id, "delivery.json"), "utf8"),
      ).stage,
      "pending-config",
    );
  }));
test("concurrent same-ID retries share a receipt and different content conflicts", () =>
  fixture(async (service, directory) => {
    const results = await Promise.all(
      Array.from({ length: 3 }, () => send(service)),
    );
    assert.ok(
      results.every(
        (result) =>
          result.status === 202 &&
          result.body.receivedAtUTC === results[0].body.receivedAtUTC,
      ),
    );
    assert.equal(
      (await send(service, { ...report(), message: "other message" })).status,
      409,
    );
    assert.deepEqual(await readdir(directory), [report().id]);
  }));
test("actual PNG bytes must match MIME and exact capture dimensions; missing and extra images are rejected", () =>
  fixture(async (service) => {
    assert.equal(
      (
        await send(
          service,
          imageReport(),
          new Blob([png], { type: "image/png" }),
        )
      ).status,
      202,
    );
    const differentId = {
      ...imageReport(),
      id: "c0000000-0000-4000-8000-000000000002",
    };
    assert.equal((await send(service, differentId)).status, 400);
    assert.equal(
      (
        await send(
          service,
          differentId,
          new Blob([png], { type: "image/jpeg" }),
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await send(
          service,
          { ...differentId, capture: { ...differentId.capture, width: 2 } },
          new Blob([png], { type: "image/png" }),
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await send(
          service,
          differentId,
          new Blob([Buffer.from("not an image")], { type: "image/png" }),
        )
      ).status,
      400,
    );
    assert.equal(
      (await send(service, report(), new Blob([png], { type: "image/png" })))
        .status,
      400,
    );
    assert.equal(
      (
        await send(
          service,
          differentId,
          new Blob([png.subarray(0, 32)], { type: "image/png" }),
        )
      ).status,
      400,
    );
  }));
test("multipart permits only one metadata field and one optional screenshot", () =>
  fixture(async (service) => {
    assert.equal(
      (
        await send(service, report(), undefined, (form) =>
          form.append("another", new Blob(["anything"]), "file.txt"),
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await send(service, report(), undefined, (form) =>
          form.append("metadata", JSON.stringify(report())),
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await send(service, report(), undefined, (form) =>
          form.append("screenshot", "pretend-file"),
        )
      ).status,
      400,
    );
  }));
test("explicit origin policy ignores proxy spoofing and no endpoint exposes payloads", () =>
  fixture(
    async (service) => {
      assert.equal(
        (
          await send(service, report(), undefined, undefined, {
            origin: "https://evil.invalid",
            "x-forwarded-host": "evil.invalid",
            "x-forwarded-proto": "https",
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await send(service, report(), undefined, undefined, {
            origin: "null",
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await send(service, report(), undefined, undefined, {
            origin: "https://game.example.invalid",
          })
        ).status,
        202,
      );
      const res = mockResponse();
      await service.handle(
        mockRequest(Buffer.alloc(0), { method: "GET", url: "/api/feedback" }),
        res.response,
      );
      assert.equal(res.result().status, 405);
      const privateRes = mockResponse();
      await service.handle(
        mockRequest(Buffer.alloc(0), {
          method: "GET",
          url: `/api/feedback/${report().id}`,
        }),
        privateRes.response,
      );
      assert.equal(privateRes.result().status, 404);
      const unrelated = mockResponse();
      assert.equal(
        await service.handle(
          mockRequest(Buffer.alloc(0), { url: "/health" }),
          unrelated.response,
        ),
        false,
      );
    },
    { env: { FEEDBACK_ALLOWED_ORIGINS: "https://game.example.invalid" } },
  ));
test("bounded request bytes, per-IP quota and disk quota produce sanitized errors", () =>
  fixture(
    async (service) => {
      const res = mockResponse();
      await service.handle(
        mockRequest(Buffer.alloc(0), {
          type: "multipart/form-data; boundary=x",
          headers: {
            "content-length": String(FEEDBACK_LIMITS.requestBytes + 1),
          },
        }),
        res.response,
      );
      assert.equal(res.result().status, 413);
      assert.equal((await send(service)).status, 202);
      assert.equal((await send(service)).status, 429);
    },
    { limits: { ratePerMinute: 2 } },
  ));
test("full disk budget returns 503 without a false accepted receipt", () =>
  fixture(
    async (service) => {
      const result = await send(service);
      assert.equal(result.status, 503);
      assert.deepEqual(result.body, { error: "feedback-capacity" });
    },
    { limits: { maxBytes: 1 } },
  ));
test("streamed oversized bodies cannot bypass the byte cap using absent Content-Length", () =>
  fixture(async (service) => {
    const res = mockResponse();
    await service.handle(
      mockRequest(Buffer.alloc(FEEDBACK_LIMITS.requestBytes + 1), {
        type: "multipart/form-data; boundary=x",
      }),
      res.response,
    );
    assert.equal(res.result().status, 413);
    assert.deepEqual(res.result().body, { error: "request-too-large" });
  }));
test("active body requests are bounded and close cancels owned readers", () =>
  fixture(
    async (service) => {
      const request = new Readable({ read() {} }) as IncomingMessage;
      request.method = "POST";
      request.url = "/api/feedback";
      request.headers = {
        host: "localhost:1234",
        origin: "http://localhost:1234",
        "content-type": "multipart/form-data; boundary=x",
      };
      Object.defineProperty(request, "socket", {
        value: { remoteAddress: "127.0.0.1" },
      });
      const waiting = mockResponse(),
        pending = service.handle(request, waiting.response);
      assert.equal((await send(service)).status, 503);
      await service.close();
      await pending;
      assert.equal(waiting.result().status, 503);
      request.destroy();
    },
    { limits: { maxActiveRequests: 1 } },
  ));
test("request body timeout is sanitized and leaves no accepted record", () =>
  fixture(
    async (service, directory) => {
      const request = new Readable({ read() {} }) as IncomingMessage;
      request.method = "POST";
      request.url = "/api/feedback";
      request.headers = {
        host: "localhost:1234",
        origin: "http://localhost:1234",
        "content-type": "multipart/form-data; boundary=x",
      };
      Object.defineProperty(request, "socket", {
        value: { remoteAddress: "127.0.0.1" },
      });
      const res = mockResponse();
      let deadline: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          service.handle(request, res.response),
          new Promise<never>((_done, reject) => {
            deadline = setTimeout(
              () => reject(new Error("body timeout failed")),
              500,
            );
          }),
        ]);
        assert.equal(res.result().status, 408);
        assert.deepEqual(await readdir(directory), []);
      } finally {
        clearTimeout(deadline);
        request.destroy();
      }
    },
    { requestTimeoutMs: 10 },
  ));
