import type { IncomingMessage, ServerResponse } from "node:http";

/** Deliberately public aggregate. Never serialize Community or a player record. */
export function createPublicPresenceHandler(readOnline: () => number) {
  return (req: IncomingMessage, res: ServerResponse): boolean => {
    if (req.url !== "/api/presence") return false;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      res.writeHead(405).end(JSON.stringify({ error: "method-not-allowed" }));
      return true;
    }
    try {
      const online = readOnline();
      if (!Number.isSafeInteger(online) || online < 0) throw new Error("count");
      res.writeHead(200).end(JSON.stringify({ online }));
    } catch {
      res.writeHead(503).end(JSON.stringify({ error: "presence-unavailable" }));
    }
    return true;
  };
}
