import { parentPort, workerData } from "node:worker_threads";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";

const db = new DatabaseSync(workerData);
db.exec("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=1000");
function transaction(action) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = action();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
const version = db.prepare("PRAGMA user_version").get().user_version;
if (version === 0) transaction(() => db.exec(`
  CREATE TABLE accounts (
    id TEXT PRIMARY KEY, google_sub TEXT NOT NULL UNIQUE,
    profile TEXT, checkpoint TEXT
  ) STRICT;
  CREATE TABLE sessions (
    hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id),
    expires INTEGER NOT NULL
  ) STRICT;
  CREATE INDEX session_expiry ON sessions(expires);
  CREATE TABLE rewards (
    account_id TEXT NOT NULL REFERENCES accounts(id), name TEXT NOT NULL,
    PRIMARY KEY(account_id, name)
  ) STRICT;
  CREATE TABLE contacts (
    a TEXT NOT NULL REFERENCES accounts(id), b TEXT NOT NULL REFERENCES accounts(id),
    PRIMARY KEY(a, b), CHECK(a < b)
  ) STRICT;
  CREATE TABLE blocks (
    owner TEXT NOT NULL REFERENCES accounts(id), target TEXT NOT NULL REFERENCES accounts(id),
    PRIMARY KEY(owner, target), CHECK(owner <> target)
  ) STRICT;
  PRAGMA user_version=1;
`));
else if (version !== 1) throw Error("unsupported-account-schema");

const queries = new Map();
function query(sql) {
  if (!queries.has(sql)) queries.set(sql, db.prepare(sql));
  return queries.get(sql);
}
function account(id) {
  const row = query("SELECT id, profile, checkpoint FROM accounts WHERE id=?").get(id);
  return row && {
    id: row.id,
    profile: row.profile ? JSON.parse(row.profile) : null,
    checkpoint: row.checkpoint ? JSON.parse(row.checkpoint) : null,
    rewards: query("SELECT name FROM rewards WHERE account_id=? ORDER BY name").all(id).map(row => row.name),
  };
}
const actions = {
  login(sub, hash, expires, previousHash) {
    return transaction(() => {
      query("INSERT INTO accounts(id,google_sub) VALUES(?,?) ON CONFLICT(google_sub) DO NOTHING").run(randomUUID(), sub);
      const { id } = query("SELECT id FROM accounts WHERE google_sub=?").get(sub);
      if (previousHash) query("DELETE FROM sessions WHERE hash=?").run(previousHash);
      query("INSERT INTO sessions VALUES(?,?,?)").run(hash, id, expires);
      return id;
    });
  },
  session(hash, now) {
    return query("SELECT account_id AS id, expires FROM sessions WHERE hash=? AND expires>?").get(hash, now) ?? null;
  },
  revoke(hash) { query("DELETE FROM sessions WHERE hash=?").run(hash); },
  prune(now) { query("DELETE FROM sessions WHERE expires<=?").run(now); },
  account,
  profile(id, profile) {
    query("UPDATE accounts SET profile=? WHERE id=?").run(JSON.stringify(profile), id);
  },
  checkpoints(entries) {
    transaction(() => {
      const statement = query("UPDATE accounts SET checkpoint=? WHERE id=?");
      for (const [id, value] of entries) statement.run(JSON.stringify(value), id);
    });
  },
  reward(ids, name) {
    return transaction(() => {
      const statement = query("INSERT OR IGNORE INTO rewards VALUES(?,?)");
      return ids.filter(id => statement.run(id, name).changes === 1);
    });
  },
  relationships() {
    const names = query(`SELECT id, json_extract(profile, '$.nickname') AS nickname
      FROM accounts WHERE profile IS NOT NULL AND (
        EXISTS(SELECT 1 FROM contacts WHERE a=id OR b=id)
        OR EXISTS(SELECT 1 FROM blocks WHERE owner=id OR target=id)
      )`).all();
    return {
      contacts: query("SELECT a,b FROM contacts").all(),
      blocks: query("SELECT owner,target FROM blocks").all(),
      names,
    };
  },
  contact(from, to) {
    const pair = [from, to].sort();
    return transaction(() => {
      if (query("SELECT 1 FROM blocks WHERE (owner=? AND target=?) OR (owner=? AND target=?)").get(from,to,to,from)) return false;
      query("INSERT OR IGNORE INTO contacts VALUES(?,?)").run(...pair);
      return true;
    });
  },
  block(owner, target, enabled) {
    transaction(() => {
      if (enabled) {
        query("INSERT OR IGNORE INTO blocks VALUES(?,?)").run(owner,target);
        query("DELETE FROM contacts WHERE a=? AND b=?").run(...[owner,target].sort());
      } else query("DELETE FROM blocks WHERE owner=? AND target=?").run(owner,target);
    });
  },
};

parentPort.on("message", ({ serial, action, args }) => {
  try {
    parentPort.postMessage({ serial, value: actions[action](...args) });
  } catch {
    parentPort.postMessage({ serial, failed: true });
  }
});
parentPort.postMessage({ ready: true });
