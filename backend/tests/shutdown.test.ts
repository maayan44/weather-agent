import http from "node:http";
import { describe, expect, it, vi } from "vitest";
import { openDatabase } from "../src/data/db";
import { createShutdown } from "../src/shutdown";

function startServer(handler: http.RequestListener = (_req, res) => res.end("ok")): Promise<http.Server> {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, () => resolve(server));
  });
}

const port = (server: http.Server) => (server.address() as { port: number }).port;

describe("graceful shutdown", () => {
  it("stops listening, closes the database and exits with 0 (so the deploy shows no crash)", async () => {
    const server = await startServer();
    const db = openDatabase(":memory:");
    const exited = new Promise<number>((resolve) => {
      createShutdown({ server, db, exit: resolve, log: () => {} })("SIGTERM");
    });

    expect(await exited).toBe(0);
    expect(server.listening).toBe(false);
    expect(db.open).toBe(false);
  });

  it("lets a request that is already running finish first", async () => {
    let finishRequest: () => void = () => {};
    const server = await startServer((_req, res) => {
      finishRequest = () => res.end("done");
    });
    const db = openDatabase(":memory:");
    const exit = vi.fn();

    const pending = fetch(`http://127.0.0.1:${port(server)}/`).then((response) => response.text());
    await vi.waitFor(() => expect(finishRequest).not.toBe(undefined));
    await new Promise((resolve) => setTimeout(resolve, 50)); // let the request reach the server

    createShutdown({ server, db, exit, log: () => {} })("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(exit).not.toHaveBeenCalled(); // still waiting for the running request

    finishRequest();
    expect(await pending).toBe("done");
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
  });

  it("gives up waiting for a stuck request after the time limit", async () => {
    const server = await startServer(() => {
      /* never answers */
    });
    const db = openDatabase(":memory:");
    const exit = vi.fn();

    void fetch(`http://127.0.0.1:${port(server)}/`).catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 50));
    createShutdown({ server, db, exit, forceAfterMs: 100, log: () => {} })("SIGTERM");

    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0), { timeout: 2000 });
    server.closeAllConnections();
  });

  it("ignores a second signal while it is already shutting down", async () => {
    const server = await startServer();
    const db = openDatabase(":memory:");
    const exit = vi.fn();
    const shutdown = createShutdown({ server, db, exit, log: () => {} });

    shutdown("SIGTERM");
    shutdown("SIGINT");
    await vi.waitFor(() => expect(exit).toHaveBeenCalled());
    expect(exit).toHaveBeenCalledTimes(1);
  });
});
