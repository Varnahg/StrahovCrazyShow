import { stat } from "node:fs/promises";
import type { ServerResponse } from "node:http";
import { isAbsolute, join } from "node:path";
import express, { type RequestHandler } from "express";

export function readServerConfig(env: NodeJS.ProcessEnv = process.env) {
  const host = env.HOST ?? "127.0.0.1";
  const rawPort = env.PORT ?? "2567";
  if (!/^\d+$/.test(rawPort) || Number(rawPort) < 1 || Number(rawPort) > 65535)
    throw new Error("PORT must be an integer between 1 and 65535.");
  if (!host || /[\s/\\\0]/.test(host))
    throw new Error("HOST must be a non-empty IP address or hostname.");
  const staticDir = env.STATIC_DIR;
  if (staticDir !== undefined && !isAbsolute(staticDir))
    throw new Error("STATIC_DIR must be an absolute path to the client build.");
  return { host, port: Number(rawPort), staticDir };
}

/** The explicit build directory is the only filesystem exposed over HTTP. */
export async function createStaticClientHandler(
  directory: string,
): Promise<RequestHandler> {
  if (!isAbsolute(directory))
    throw new Error("STATIC_DIR must be an absolute path to the client build.");
  const index = await stat(join(directory, "index.html")).catch(
    () => undefined,
  );
  if (!index?.isFile())
    throw new Error(
      "STATIC_DIR must contain a built index.html; run pnpm build first.",
    );
  const serve = express.static(directory, {
    dotfiles: "deny",
    fallthrough: false,
    redirect: false,
    maxAge: 0,
    // Public models keep stable filenames, so they must be revalidated too.
    immutable: false,
  });
  return (req, res, next) => {
    serve(req, res, (error?: { status?: number }) => {
      if (res.headersSent) return next(error);
      const status = error ? (error.status ?? 500) : 404;
      res.setHeader("Cache-Control", "no-store");
      res
        .status(status)
        .type("text/plain")
        .send(
          status === 404
            ? "Not found"
            : status < 500
              ? "Request rejected"
              : "Internal server error",
        );
    });
  };
}

export function createServerReadiness() {
  let state: "starting" | "ready" | "stopping" = "starting";
  return {
    ready() {
      if (state === "starting") state = "ready";
    },
    stop() {
      state = "stopping";
    },
    reply(res: ServerResponse) {
      const ok = state === "ready";
      res
        .writeHead(ok ? 200 : 503, {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        })
        .end(JSON.stringify({ ok, demo: true }));
    },
  };
}
