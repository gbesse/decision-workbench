// Purpose: Keep one server process per workspace and require operator inspection for orphaned locks.
import {
  openSync,
  readFileSync,
  writeFileSync,
  closeSync,
  unlinkSync,
  mkdirSync,
} from "node:fs";
import { dirname } from "node:path";
import { hostname } from "node:os";
export function acquireWorkspace(filename) {
  if (filename === ":memory:") return () => {};
  mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
  const lock = filename + ".lock";
  let fd;
  try {
    fd = openSync(lock, "wx", 0o600);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    let owner;
    try {
      owner = JSON.parse(readFileSync(lock, "utf8"));
    } catch (cause) {
      throw new Error("Workspace lock is unreadable; inspect " + lock, {
        cause,
      });
    }
    if (
      owner.host !== hostname() ||
      !Number.isSafeInteger(owner.pid) ||
      owner.pid < 1
    )
      throw new Error("Workspace lock requires operator inspection: " + lock);
    let alive = true;
    try {
      process.kill(owner.pid, 0);
    } catch (cause) {
      if (cause.code === "ESRCH") alive = false;
      else throw new Error("Cannot verify workspace lock owner", { cause });
    }
    if (alive) throw new Error("Another server already owns this workspace");
    throw new Error(
      "Stale workspace lock: inspect interrupted work, then remove " +
        lock +
        " before restarting",
    );
  }
  writeFileSync(
    fd,
    JSON.stringify({
      pid: process.pid,
      host: hostname(),
      at: new Date().toISOString(),
    }),
  );
  let released = false;
  return () => {
    if (released) return;
    released = true;
    closeSync(fd);
    unlinkSync(lock);
  };
}
