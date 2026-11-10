import {
  CRAZY_TYPKA_MONITORING_NOTICE_VERSION,
  isCrazyTypkaMonitoringNotice,
} from "../shared/crazy-typka";
import type { CrazyTypkaServiceOptions } from "./crazy-typka";
import { createChatMonitorAdmin } from "./chat-monitor-admin";
import { createChatMonitorStore } from "./chat-monitor-store";

function databaseName(connectionString: string): string {
  const url = new URL(connectionString);
  const name = decodeURIComponent(url.pathname.slice(1));
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.hostname ||
    !name ||
    /[\/\0]/.test(name) ||
    url.hash ||
    [...url.searchParams.keys()].some((key) => key !== "sslmode")
  )
    throw new Error("Invalid monitor database configuration");
  return name;
}

export function createOptionalChatMonitor(
  env: NodeJS.ProcessEnv = process.env,
  onInvalidConfiguration: () => void = () => {},
) {
  const {
    CHAT_MONITOR_CAPTURE: capture,
    CHAT_MONITOR_DATABASE_URL: databaseUrl,
    CHAT_MONITOR_ORIGIN: publicOrigin,
    CHAT_MONITOR_GITHUB_CLIENT_ID: clientId,
    CHAT_MONITOR_GITHUB_CLIENT_SECRET: clientSecret,
    CHAT_MONITOR_GITHUB_IDS: githubIds,
    CHAT_MONITOR_PRIVACY_URL: privacyUrl,
  } = env;
  if (
    (capture === undefined || capture === "0") &&
    !databaseUrl &&
    !publicOrigin &&
    !clientId &&
    !clientSecret &&
    !githubIds &&
    !privacyUrl
  )
    return undefined;

  let store: ReturnType<typeof createChatMonitorStore> | undefined;
  try {
    if (
      (capture !== undefined && capture !== "0" && capture !== "1") ||
      !databaseUrl ||
      !publicOrigin ||
      !clientId ||
      !clientSecret ||
      !githubIds
    )
      throw new Error("Incomplete monitor configuration");
    const origin = new URL(publicOrigin);
    if (publicOrigin !== origin.origin || origin.protocol !== "https:")
      throw new Error("Invalid monitor origin");
    const database = databaseName(databaseUrl);
    if (
      env.RAG_DATABASE_URL &&
      database === databaseName(env.RAG_DATABASE_URL)
    )
      throw new Error("Chat monitor requires a database separate from RAG");
    const ids = githubIds.split(",").map((id) => id.trim());
    const allowedGithubIds = ids.map(Number);
    if (
      ids.some((id) => !/^[1-9]\d*$/.test(id)) ||
      allowedGithubIds.some((id) => !Number.isSafeInteger(id))
    )
      throw new Error("Invalid monitor GitHub allowlist");
    const notice = {
      noticeVersion: CRAZY_TYPKA_MONITORING_NOTICE_VERSION,
      privacyUrl,
    };
    if (capture === "1" && !isCrazyTypkaMonitoringNotice(notice))
      throw new Error("Capture requires a public privacy notice");
    const archive = createChatMonitorStore(databaseUrl);
    store = archive;
    const admin = createChatMonitorAdmin({
      origin: origin.origin,
      clientId,
      clientSecret,
      allowedGithubIds,
      reader: archive,
    });
    const monitoring: CrazyTypkaServiceOptions["monitoring"] =
      capture === "1" && isCrazyTypkaMonitoringNotice(notice)
        ? { notice, enqueue: (exchange) => archive.enqueue(exchange) }
        : undefined;
    return { admin, monitoring, close: () => archive.close() };
  } catch {
    if (store) void store.close().catch(() => {});
    try {
      onInvalidConfiguration();
    } catch {
      // Configuration diagnostics cannot stop the game.
    }
    return undefined;
  }
}
