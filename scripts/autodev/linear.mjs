import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { problem, object } from "./store.mjs";

export function decodeToolResult(result) {
  if (!object(result) || result.isError)
    throw problem("LINEAR_TOOL_FAILED", "Linear tool returned an error");
  if (
    object(result.structuredContent) ||
    Array.isArray(result.structuredContent)
  )
    return result.structuredContent;
  const texts = (result.content ?? [])
    .filter((item) => item.type === "text")
    .map((item) => item.text);
  for (const text of texts) {
    try {
      return JSON.parse(text);
    } catch {}
  }
  throw problem(
    "LINEAR_PROTOCOL",
    "Linear tool did not return structured JSON",
  );
}

export function normalizeIssue(issue) {
  const identifier =
    issue?.identifier ??
    (/^[A-Z][A-Z0-9]*-\d+$/.test(issue?.id ?? "") ? issue.id : null);
  const id = issue?.uuid ?? issue?.id;
  if (!identifier || typeof id !== "string")
    throw problem("LINEAR_IDENTITY", "Unsupported Linear issue identity");
  return { ...issue, id, identifier };
}

// No model turn and no token-file access: reuse the authenticated app connection.
export class LinearClient {
  constructor({ cwd, spawnProcess = spawn, timeoutMs = 60_000 } = {}) {
    this.cwd = cwd;
    this.spawnProcess = spawnProcess;
    this.timeoutMs = timeoutMs;
    this.pending = new Map();
    this.sequence = 0;
    this.process = null;
  }
  async start() {
    if (this.ready) return this.ready;
    this.ready = this.initialize();
    return this.ready;
  }
  async initialize() {
    const child = this.spawnProcess("codex", ["app-server", "--stdio"], {
      cwd: this.cwd,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.process = child;
    child.stderr.on("data", () => {}); // Drain; raw authentication diagnostics are not persisted.
    child.on("error", () => {
      this.exited = true;
      this.failPending("app-server could not start");
    });
    child.on("exit", () => {
      this.exited = true;
      this.failPending("app-server exited");
    });
    child.on("close", () => {
      this.exited = true;
      this.failPending("app-server closed");
    });
    child.stdin.on("error", () => this.failPending("app-server input closed"));
    this.lines = createInterface({ input: child.stdout });
    this.lines.on("line", (line) => {
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        this.failPending("Invalid app-server JSON");
        return;
      }
      const pending = this.pending.get(message.id);
      if (pending && !message.method) {
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.error)
          pending.reject(
            problem(
              pending.mutating ? "UNKNOWN_EFFECT" : "LINEAR_RPC",
              `app-server rejected ${pending.method}; inspect supported protocol/connection`,
            ),
          );
        else pending.resolve(message.result);
      } else if (message.id !== undefined && message.method) {
        child.stdin.write(
          `${JSON.stringify({ id: message.id, error: { code: -32601, message: "Unattended controller does not grant approvals or elicitation" } })}\n`,
        );
      }
    });
    await this.rpc("initialize", {
      clientInfo: { name: "strahov_autodev", version: "1" },
      capabilities: { experimentalApi: true },
    });
    child.stdin.write(
      `${JSON.stringify({ method: "initialized", params: {} })}\n`,
    );
    const started = await this.rpc("thread/start", {
      cwd: this.cwd,
      ephemeral: true,
      approvalPolicy: "never",
      sandbox: "read-only",
    });
    if (!started?.thread?.id)
      throw problem(
        "LINEAR_PROTOCOL",
        "Missing ephemeral app-server thread identity",
      );
    this.threadId = started.thread.id;
    this.tools = new Map();
    let cursor;
    const seen = new Set();
    do {
      const inventory = await this.rpc("mcpServerStatus/list", {
        threadId: this.threadId,
        detail: "toolsAndAuthOnly",
        serverName: "codex_apps",
        ...(cursor ? { cursor } : {}),
      });
      for (const server of inventory.data ?? [])
        if (server.name === "codex_apps") {
          for (const [key, tool] of Object.entries(server.tools ?? {})) {
            if (tool.name?.startsWith("linear."))
              this.tools.set(tool.name, { key, tool });
          }
        }
      cursor = inventory.nextCursor;
      if (cursor && seen.has(cursor))
        throw problem("LINEAR_PROTOCOL", "Repeated MCP inventory cursor");
      seen.add(cursor);
    } while (cursor);
    const required = {
      "linear.get_issue": ["id"],
      "linear.list_issue_statuses": ["team"],
      "linear.save_issue": ["id", "state"],
      "linear.list_comments": ["issueId"],
      "linear.save_comment": ["id", "issueId", "body"],
    };
    for (const [name, fields] of Object.entries(required)) {
      const entry = this.tools.get(name);
      if (
        !entry ||
        fields.some(
          (field) =>
            !Object.hasOwn(entry.tool.inputSchema?.properties ?? {}, field),
        )
      )
        throw problem(
          "LINEAR_PROTOCOL",
          `Unsupported connected Linear tool: ${name}`,
        );
    }
  }
  failPending(message) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(
        problem(pending.mutating ? "UNKNOWN_EFFECT" : "LINEAR_RPC", message),
      );
    }
    this.pending.clear();
  }
  rpc(method, params, mutating = false) {
    return new Promise((resolve, reject) => {
      if (!this.process || this.exited)
        return reject(
          problem(
            mutating ? "UNKNOWN_EFFECT" : "LINEAR_RPC",
            "app-server is unavailable",
          ),
        );
      const id = ++this.sequence;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          problem(
            mutating ? "UNKNOWN_EFFECT" : "LINEAR_TIMEOUT",
            `Timed out waiting for ${method}; no automatic mutation retry`,
          ),
        );
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer, method, mutating });
      this.process.stdin.write(
        `${JSON.stringify({ id, method, params })}\n`,
        (error) => {
          if (!error || !this.pending.has(id)) return;
          clearTimeout(timer);
          this.pending.delete(id);
          reject(
            problem(
              mutating ? "UNKNOWN_EFFECT" : "LINEAR_RPC",
              "Failed to send app-server request",
            ),
          );
        },
      );
    });
  }
  async call(name, args, mutating = false) {
    await this.start();
    const entry = this.tools.get(name);
    if (!entry) throw problem("LINEAR_PROTOCOL", `Missing tool ${name}`);
    return decodeToolResult(
      await this.rpc(
        "mcpServer/tool/call",
        {
          threadId: this.threadId,
          server: "codex_apps",
          tool: entry.key,
          arguments: args,
        },
        mutating,
      ),
    );
  }
  async getIssue(id) {
    return normalizeIssue(await this.call("linear.get_issue", { id }));
  }
  async setState(issue, stateName) {
    const team = issue.teamId ?? issue.team?.id ?? issue.team;
    if (typeof team !== "string")
      throw problem("LINEAR_PROTOCOL", "Issue lacks a team identity");
    const response = await this.call("linear.list_issue_statuses", { team });
    const statuses = Array.isArray(response) ? response : response.statuses;
    const matches = (statuses ?? []).filter(
      (status) => status.name === stateName,
    );
    if (matches.length !== 1 || !matches[0].id)
      throw problem(
        "LINEAR_STATE",
        `Expected one team status named ${stateName}`,
      );
    if (
      issue.status === stateName ||
      issue.state?.id === matches[0].id ||
      issue.state === stateName
    )
      return;
    await this.call(
      "linear.save_issue",
      { id: issue.id, state: matches[0].id },
      true,
    );
  }
  async comments(issueId) {
    const comments = [];
    const seen = new Set();
    let cursor;
    do {
      const response = await this.call("linear.list_comments", {
        issueId,
        limit: 250,
        ...(cursor ? { cursor } : {}),
      });
      if (!Array.isArray(response.comments))
        throw problem("LINEAR_PROTOCOL", "Missing Linear comments list");
      comments.push(...response.comments);
      cursor =
        response.nextCursor ?? response.cursor ?? response.pageInfo?.endCursor;
      const more =
        response.hasNextPage ??
        response.pageInfo?.hasNextPage ??
        Boolean(cursor);
      if (!more) break;
      if (!cursor || seen.has(cursor))
        throw problem(
          "LINEAR_PROTOCOL",
          "Cannot prove comment absence: pagination cursor unavailable",
        );
      seen.add(cursor);
    } while (cursor);
    return comments;
  }
  async comment(ctx, body) {
    const marker = `<!-- autodev:${ctx.runId} -->`;
    const content = `${marker}\n${body}`;
    const comments = (await this.comments(ctx.assignment.issue)).filter(
      (entry) => entry.body?.includes(marker),
    );
    if (comments.length > 1)
      throw problem(
        "LINEAR_CONFLICT",
        "Multiple comments have this run marker",
      );
    let comment = comments[0];
    if (ctx.data.linearCommentId && comment?.id !== ctx.data.linearCommentId)
      throw problem(
        "LINEAR_CONFLICT",
        "Recorded Linear comment no longer matches this run",
      );
    if (!comment && ctx.data.linearCommentIntent)
      throw problem(
        "UNKNOWN_EFFECT",
        "Linear comment creation was dispatched but its effect is not yet established",
      );
    if (!comment) {
      await ctx.save({
        linearCommentIntent: { issue: ctx.assignment.issue, marker },
      });
      comment = await this.call(
        "linear.save_comment",
        { issueId: ctx.assignment.issue, body: content },
        true,
      );
      if (!comment?.id)
        throw problem(
          "UNKNOWN_EFFECT",
          "Linear creation returned no comment identity",
        );
    } else if (comment.body !== content) {
      await this.call(
        "linear.save_comment",
        { id: comment.id, body: content },
        true,
      );
    }
    await ctx.save({ linearCommentId: comment.id });
    return comment.id;
  }
  async close() {
    const child = this.process;
    if (!child) return;
    this.failPending("app-server closed");
    this.lines?.close();
    if (child.exitCode !== null || this.exited) return;
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        child.kill();
        resolve();
      }, 5_000);
      child.once("close", () => {
        clearTimeout(timer);
        resolve();
      });
      child.stdin.end();
    });
  }
}
