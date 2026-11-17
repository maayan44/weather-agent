import type { Server } from "node:http";
import type { Db } from "./data/db";

interface ShutdownDeps {
  server: Server;
  db: Db;
  // Injected so tests can watch the exit instead of ending the test run.
  exit: (code: number) => void;
  // How long a stuck request may hold up a redeploy before we stop waiting.
  forceAfterMs?: number;
  log?: (message: string) => void;
}

// Railway stops the old version with SIGTERM during a redeploy. Without a handler the process is killed mid-way,
// npm reports a failure, and Railway shows a "crash" even though nothing was wrong. This stops cleanly instead:
// no new requests, finish the ones running, close the database (which also settles SQLite's write-ahead log), exit 0.
export function createShutdown({ server, db, exit, forceAfterMs = 10_000, log = console.log }: ShutdownDeps) {
  let started = false;

  return function shutdown(signal: string) {
    if (started) return; // a second signal while closing changes nothing
    started = true;
    log(`${signal} received, shutting down`);

    const timer = setTimeout(() => {
      log("Requests did not finish in time, exiting anyway");
      exit(0);
    }, forceAfterMs);
    timer.unref();

    // A connection whose request just finished becomes idle but stays open (keep-alive), which would hold the server
    // open until it times out. Closing idle ones every moment lets the last finished request release the server at once.
    const sweep = setInterval(() => server.closeIdleConnections(), 50);
    sweep.unref();

    server.close(() => {
      clearTimeout(timer);
      clearInterval(sweep);
      if (db.open) db.close();
      exit(0);
    });
    server.closeIdleConnections();
  };
}
