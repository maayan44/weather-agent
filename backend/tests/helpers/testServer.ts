import type { Server } from "node:http";
import type { Express } from "express";

// Starts the app on a free port so tests call it over real HTTP.
export async function startTestServer(app: Express): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server: Server = await new Promise((resolve) => {
    const started = app.listen(0, () => resolve(started));
  });
  const { port } = server.address() as { port: number };
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

export async function postJson(url: string, body: unknown) {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: response.status, body: (await response.json()) as any };
}

export async function getJson(url: string) {
  const response = await fetch(url);
  return { status: response.status, body: (await response.json()) as any };
}
