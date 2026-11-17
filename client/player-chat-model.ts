import type { ChatMessage } from "../shared/types";

export type ChatMode = "idle" | "composing" | "expanded";
export type ChatPreviewMode = "recent" | "badge" | "hidden";
export type ChatPreferences = {
  preview: ChatPreviewMode;
  shortcut: boolean;
  showPrivateText: boolean;
};
export type ChatEntry = { message: ChatMessage; receivedAt: number };

export function parseChatPreferences(value: unknown): ChatPreferences {
  const saved =
    value && typeof value === "object"
      ? (value as Partial<ChatPreferences>)
      : {};
  return {
    preview:
      saved.preview === "badge" || saved.preview === "hidden"
        ? saved.preview
        : "recent",
    shortcut: saved.shortcut !== false,
    showPrivateText: saved.showPrivateText !== false,
  };
}

export function chatConversation(message: ChatMessage, self: string): string {
  return message.sender !== self && message.channel === "dm:" + self
    ? "dm:" + message.sender
    : message.channel;
}

export function chatEntries(
  entries: readonly ChatEntry[],
  mode: ChatMode,
): readonly ChatEntry[] {
  return mode === "idle" ? entries.slice(-5) : entries;
}

export function revealChatText(
  message: ChatMessage,
  self: string,
  channel: string,
  mode: ChatMode,
  showPrivateText: boolean,
): boolean {
  return (
    showPrivateText ||
    !message.channel.startsWith("dm:") ||
    (mode !== "idle" && chatConversation(message, self) === channel)
  );
}
