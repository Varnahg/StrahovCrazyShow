import assert from "node:assert/strict";
import { test } from "node:test";
import { AccountDatabase } from "../server/accounts/database";
import { configureGateway } from "../server/accounts/gateway";
import { DEFAULT_PROFILE } from "../shared/types";

test("accounts use durable provider identity and atomic relationship and reward updates", async () => {
  const db = new AccountDatabase(":memory:");
  try {
    const alice = await db.run("login", "alice", "first", 100);
    const bob = await db.run("login", "bob", "bob-session", 100);
    const profile = { ...DEFAULT_PROFILE, nickname: "Alice" };
    const checkpoint = { position: { x: 1, y: 2, z: 3 }, yaw: 0.5 };
    await db.run("profile", alice, profile);
    await db.run("checkpoints", [[alice, checkpoint]]);
    assert.deepEqual(await db.run("reward", [alice, bob], "Průzkumník kopce"), [alice, bob]);
    assert.deepEqual(await db.run("reward", [alice], "Průzkumník kopce"), []);
    assert.equal(await db.run("contact", alice, bob), true);
    assert.equal((await db.run("relationships")).contacts.length, 1);
    await db.run("block", bob, alice, true);
    assert.equal(await db.run("contact", alice, bob), false);
    const relationships = await db.run("relationships");
    assert.deepEqual(relationships.contacts, []);
    assert.deepEqual(relationships.blocks, [{ owner: bob, target: alice }]);
    assert.deepEqual(relationships.names, [{ id: alice, nickname: "Alice" }]);
    assert.equal(await db.run("login", "alice", "second", 200, "first"), alice);
    assert.equal(await db.run("session", "first", 1), null);
    assert.equal(await db.run("session", "second", 200), null);
    assert.deepEqual(await db.run("account", alice), {
      id: alice, profile, checkpoint, rewards: ["Průzkumník kopce"],
    });
    await db.run("revoke", "bob-session");
    assert.equal(await db.run("session", "bob-session", 1), null);
  } finally { await db.close(); }
});

test("production and invalid configurations close anonymous multiplayer", async () => {
  assert.deepEqual(await configureGateway("0.0.0.0", undefined, { NODE_ENV: "production" }), { mode: "closed" });
  assert.deepEqual(await configureGateway("0.0.0.0", undefined, { STRAHOV_AUTH_MODE: "local" }), { mode: "closed" });
  assert.deepEqual(await configureGateway("0.0.0.0", undefined, {
    STRAHOV_AUTH_MODE: "local", STRAHOV_LOCAL_TEST_ONLY: "1", STRAHOV_AUTH_CONFIG_DIR: "/run/strahov-google",
  }), { mode: "closed" });
  assert.deepEqual(await configureGateway("127.0.0.1", undefined, {}), { mode: "local" });
});
