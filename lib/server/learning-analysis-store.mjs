import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { join, resolve } from "node:path";
import { LearningError } from "../domain/learning.mjs";
export function analysisStore(root, owner) {
  const directory = process.env.FORME_DATA_DIR
    ? resolve(process.env.FORME_DATA_DIR)
    : join(root, ".forme-data");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, "learning-analysis.sqlite"),
    db = new DatabaseSync(path);
  chmodSync(path, 0o600);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS analyst_records(owner TEXT NOT NULL,kind TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(owner,kind,id));
 CREATE TABLE IF NOT EXISTS analyst_calls(owner TEXT NOT NULL,id TEXT NOT NULL,day TEXT NOT NULL,reserved_micros INTEGER NOT NULL,status TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(owner,id));`);
  const get = (kind, id) => {
    const row = db
      .prepare("SELECT data FROM analyst_records WHERE owner=? AND kind=? AND id=?")
      .get(owner, kind, id);
    return row ? JSON.parse(row.data) : null;
  };
  const list = (kind) =>
    db
      .prepare("SELECT data FROM analyst_records WHERE owner=? AND kind=? ORDER BY rowid")
      .all(owner, kind)
      .map((row) => JSON.parse(row.data));
  function put(kind, data) {
    const old = get(kind, data.id);
    if (old) {
      if (JSON.stringify(old) !== JSON.stringify(data))
        throw new LearningError("Analysis record ID conflict.", 409);
      return old;
    }
    db.prepare("INSERT INTO analyst_records VALUES(?,?,?,?)").run(
      owner,
      kind,
      data.id,
      JSON.stringify(data),
    );
    return data;
  }
  const call = (id) => {
    const row = db
      .prepare("SELECT status,data FROM analyst_calls WHERE owner=? AND id=?")
      .get(owner, id);
    return row ? { ...JSON.parse(row.data), status: row.status } : null;
  };
  function calls(now) {
    for (const row of db
      .prepare("SELECT id,data FROM analyst_calls WHERE owner=? AND status='running'")
      .all(owner))
      if (now - Date.parse(JSON.parse(row.data).startedAt) > 60000)
        db.prepare("UPDATE analyst_calls SET status='uncertain' WHERE owner=? AND id=?").run(
          owner,
          row.id,
        );
    return db
      .prepare(
        "SELECT id,day,reserved_micros,status,data FROM analyst_calls WHERE owner=? ORDER BY rowid",
      )
      .all(owner)
      .map((row) => ({
        id: row.id,
        day: row.day,
        reservedUsd: row.reserved_micros / 1e6,
        status: row.status,
        ...JSON.parse(row.data),
      }));
  }
  return {
    get,
    list,
    put,
    call,
    calls,
    reserve(packet, quote, config, now) {
      calls(now);
      db.exec("BEGIN IMMEDIATE");
      try {
        if (call(packet.id))
          throw new LearningError(
            "This packet already has a provider attempt. Requests are never retried automatically.",
            409,
          );
        if (
          db.prepare("SELECT id FROM analyst_calls WHERE owner=? AND status='running'").get(owner)
        )
          throw new LearningError("An analysis request is already in progress.", 409);
        const day = new Date(now).toISOString().slice(0, 10),
          used = db
            .prepare(
              "SELECT COALESCE(SUM(reserved_micros),0) AS total FROM analyst_calls WHERE owner=? AND day=?",
            )
            .get(owner, day).total;
        const micros = Math.ceil(quote.maxUsd * 1e6);
        if (used + micros > Math.floor(config.dailyUsd * 1e6))
          throw new LearningError(
            "The analysis daily budget is already reserved. No request was sent.",
            409,
          );
        db.prepare("INSERT INTO analyst_calls VALUES(?,?,?,?,?,?)").run(
          owner,
          packet.id,
          day,
          micros,
          "running",
          JSON.stringify({
            provider: config.provider,
            model: config.model,
            startedAt: new Date(now).toISOString(),
            packetHash: packet.hash,
          }),
        );
        db.exec("COMMIT");
        return call(packet.id);
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    finish(id, status, metadata = {}) {
      const previous = call(id);
      if (!previous) throw new LearningError("Analysis attempt is unavailable.", 409);
      const { status: _, ...data } = previous;
      db.prepare("UPDATE analyst_calls SET status=?,data=? WHERE owner=? AND id=?").run(
        status,
        JSON.stringify({ ...data, ...metadata }),
        owner,
        id,
      );
    },
    clear(now = Date.now()) {
      calls(now);
      if (db.prepare("SELECT id FROM analyst_calls WHERE owner=? AND status='running'").get(owner))
        throw new LearningError(
          "Wait for the analysis request to finish before deleting learning history.",
          409,
        );
      // Billing reservations survive privacy deletion; clearing feedback cannot reset a spend limit.
      db.prepare("DELETE FROM analyst_records WHERE owner=?").run(owner);
    },
    export() {
      return {
        packets: list("packet"),
        reports: list("report"),
        experiments: list("experiment"),
        calls: calls(Date.now()),
      };
    },
    close() {
      db.close();
    },
  };
}
