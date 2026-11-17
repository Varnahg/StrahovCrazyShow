import test from "node:test";
import assert from "node:assert/strict";
import {
  chatConversation,
  chatEntries,
  parseChatPreferences,
  revealChatText,
  type ChatEntry,
} from "../client/player-chat-model";
import type { ChatMessage } from "../shared/types";

function message(id: string, channel: string, sender = "other"): ChatMessage {
  return {
    id,
    channel,
    sender,
    nickname: sender,
    text: "Text " + id,
    at: 1000,
  };
}

test("chat preferences retain explicit visibility and shortcut choices while enabling private text by default", () => {
  assert.deepEqual(parseChatPreferences(undefined), {
    preview: "recent",
    shortcut: true,
    showPrivateText: true,
  });
  for (const value of [null, 23, "hidden", [], { preview: "invalid" }]) {
    assert.equal(parseChatPreferences(value).preview, "recent");
  }
  assert.deepEqual(
    parseChatPreferences({ preview: "badge", shortcut: false }),
    {
      preview: "badge",
      shortcut: false,
      showPrivateText: true,
    },
  );
  assert.deepEqual(
    parseChatPreferences({
      preview: "hidden",
      shortcut: true,
      showPrivateText: false,
    }),
    {
      preview: "hidden",
      shortcut: true,
      showPrivateText: false,
    },
  );
});

test("reply routing resolves both directions of the exact DM without switching unrelated messages", () => {
  assert.equal(
    chatConversation(message("a", "dm:self", "nela"), "self"),
    "dm:nela",
  );
  assert.equal(
    chatConversation(message("b", "dm:nela", "self"), "self"),
    "dm:nela",
  );
  assert.equal(
    chatConversation(message("c", "dm:self", "self"), "self"),
    "dm:self",
  );
  assert.equal(chatConversation(message("d", "local"), "self"), "local");
  assert.equal(
    chatConversation(message("e", "event:tea"), "self"),
    "event:tea",
  );
});

test("idle preserves five most recent messages including DM and event text without wall-clock expiry", () => {
  const all: ChatEntry[] = [
    "global",
    "local",
    "global",
    "event:tea",
    "dm:self",
    "local",
    "global",
  ].map((channel, i) => ({
    message: message(String(i), channel),
    receivedAt: -100000,
  }));
  const idle = chatEntries(all, "idle");
  assert.deepEqual(
    idle.map((entry) => entry.message.id),
    ["2", "3", "4", "5", "6"],
  );
  assert.equal(chatEntries(all, "composing"), all);
  assert.equal(chatEntries(all, "expanded"), all, "expansion preserves the conversation stream");
  assert.equal(all.length, 7, "presentation must not mutate the shared store");
});

test("private preview masking reveals only an intentionally selected private conversation", () => {
  const incoming = message("private", "dm:self", "nela");
  for (const mode of ["idle", "composing", "expanded"] as const) {
    assert.equal(revealChatText(incoming, "self", "global", mode, true), true);
    assert.equal(
      revealChatText(incoming, "self", "global", mode, false),
      false,
    );
    assert.equal(
      revealChatText(
        message("public", "global"),
        "self",
        "dm:nela",
        mode,
        false,
      ),
      true,
    );
  }
  assert.equal(
    revealChatText(incoming, "self", "dm:nela", "idle", false),
    false,
  );
  assert.equal(
    revealChatText(incoming, "self", "dm:nela", "composing", false),
    true,
  );
  assert.equal(
    revealChatText(incoming, "self", "dm:nela", "expanded", false),
    true,
  );
  assert.equal(
    revealChatText(
      message("other", "dm:iva", "self"),
      "self",
      "dm:nela",
      "composing",
      false,
    ),
    false,
  );
});
