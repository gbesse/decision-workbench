// Purpose: Persist versioned workspace objects and append-only events with SQLite compare-and-swap writes.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { ensure, snapshot } from "./contracts.mjs";
export class Conflict extends Error {
  constructor(message = "This object changed. Reload before saving.") {
    super(message);
    this.status = 409;
  }
}
export class Store {
  constructor(filename = ":memory:") {
    if (filename !== ":memory:")
      mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(filename);
    this.db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;",
    );
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS objects(kind TEXT NOT NULL,id TEXT NOT NULL,revision INTEGER NOT NULL,updated TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(kind,id)); CREATE TABLE IF NOT EXISTS events(sequence INTEGER PRIMARY KEY AUTOINCREMENT,at TEXT NOT NULL,type TEXT NOT NULL,body TEXT NOT NULL);`,
    );
  }
  get(kind, id) {
    const r = this.db
      .prepare("SELECT * FROM objects WHERE kind=? AND id=?")
      .get(kind, id);
    return r
      ? {
          id: r.id,
          revision: r.revision,
          updated: r.updated,
          data: JSON.parse(r.body),
        }
      : null;
  }
  list(kind) {
    return this.db
      .prepare("SELECT * FROM objects WHERE kind=? ORDER BY updated DESC,id")
      .all(kind)
      .map((r) => ({
        id: r.id,
        revision: r.revision,
        updated: r.updated,
        data: JSON.parse(r.body),
      }));
  }
  put(kind, id, data, expectedRevision = 0) {
    ensure(
      typeof kind === "string" &&
        typeof id === "string" &&
        id.length > 0 &&
        id.length <= 200,
      "Invalid storage identity",
    );
    ensure(
      Number.isSafeInteger(expectedRevision) && expectedRevision >= 0,
      "Expected revision required",
    );
    const body = JSON.stringify(snapshot(data));
    ensure(
      Buffer.byteLength(body) <= 8_000_000,
      "Object exceeds storage limit",
    );
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const current = this.get(kind, id);
      if ((current?.revision ?? 0) !== expectedRevision) throw new Conflict();
      const at = new Date().toISOString(),
        revision = expectedRevision + 1;
      this.db
        .prepare(
          "INSERT INTO objects VALUES(?,?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET revision=excluded.revision,updated=excluded.updated,body=excluded.body",
        )
        .run(kind, id, revision, at, body);
      this.db
        .prepare("INSERT INTO events(at,type,body) VALUES(?,?,?)")
        .run(at, `${kind}.saved`, JSON.stringify({ id, revision }));
      this.db.exec("COMMIT");
      return this.get(kind, id);
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  create(kind, data) {
    return this.put(kind, randomUUID(), data);
  }
  event(type, data) {
    this.db
      .prepare("INSERT INTO events(at,type,body) VALUES(?,?,?)")
      .run(new Date().toISOString(), type, JSON.stringify(snapshot(data)));
  }
  events(limit = 100) {
    return this.db
      .prepare("SELECT * FROM events ORDER BY sequence DESC LIMIT ?")
      .all(limit)
      .map((r) => ({ ...r, data: JSON.parse(r.body), body: undefined }));
  }
  recover() {
    for (const job of this.list("job"))
      if (["running", "queued"].includes(job.data.status))
        this.put(
          "job",
          job.id,
          {
            ...job.data,
            status: "interrupted",
            error:
              "Server stopped before completion. Inspect saved results before starting a new job.",
          },
          job.revision,
        );
    for (const run of this.list("run"))
      if (["executing", "evaluating"].includes(run.data.status))
        this.put(
          "run",
          run.id,
          {
            ...run.data,
            status:
              run.data.status === "executing" ? "uncertain" : "interrupted",
            error:
              "Server stopped before completion. Inspect the trace before recovery.",
          },
          run.revision,
        );
  }
  close() {
    this.db.close();
  }
}
