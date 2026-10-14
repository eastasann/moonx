import { afterEach, expect, test } from "bun:test";
import { networkInterfaces, tmpdir } from "node:os";
import type { Subprocess } from "bun";

const entry = `${import.meta.dir}/index.ts`;
// Startup polls for up to 5 seconds, which is also bun's default test timeout.
const TIMEOUT_MS = 10_000;
let running: Subprocess | undefined;

afterEach(() => {
  running?.kill();
  running = undefined;
});

// Outside the repository with only the given variables, so Bun cannot pick up the
// root .env and the result depends on nothing but `env`.
function start(env: Record<string, string>) {
  return Bun.spawn(["bun", entry], {
    cwd: tmpdir(),
    env: { PATH: process.env.PATH ?? "", ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
}

function freePort(): number {
  const probe = Bun.serve({ port: 0, fetch: () => new Response() });
  const { port } = probe;
  probe.stop(true);
  if (port === undefined) throw new Error("no port assigned");
  return port;
}

/** Starts the API with a valid local configuration and waits until it answers. */
async function startLocal(): Promise<{
  port: number;
  health: Response;
  stdout: ReadableStream<Uint8Array>;
}> {
  const port = freePort();
  const child = start({
    APP_ENV: "local",
    PORT: String(port),
    DATABASE_URL: "postgres://nobody@127.0.0.1:1/none",
    BETTER_AUTH_SECRET: "x".repeat(32),
  });
  running = child;
  for (let attempt = 0; attempt < 50; attempt++) {
    const health = await fetch(`http://127.0.0.1:${port}/api/health`).catch(
      () => undefined,
    );
    if (health !== undefined) return { port, health, stdout: child.stdout };
    await Bun.sleep(100);
  }
  throw new Error(`the API did not answer on port ${port}`);
}

const externalAddress = Object.values(networkInterfaces())
  .flat()
  .find((info) => info?.family === "IPv4" && !info.internal)?.address;

test("exits with one JSON log line when the configuration is invalid", async () => {
  const child = start({ APP_ENV: "prod" });

  expect(await child.exited).toBe(1);
  const lines = (await new Response(child.stderr).text()).trim().split("\n");
  expect(lines).toHaveLength(1);
  expect(JSON.parse(lines[0] ?? "")).toEqual({
    severity: "ERROR",
    message: expect.stringContaining(
      'APP_ENV must be one of local, staging, production, got "prod"',
    ),
  });
});

test(
  "serves the health check on the configured port",
  async () => {
    const { health } = await startLocal();

    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({
      status: "ok",
      version: "dev",
      env: "local",
    });
  },
  TIMEOUT_MS,
);

test(
  "logs each request on standard output, with the connection's address as clientIp",
  async () => {
    const { health, stdout: output } = await startLocal();
    const requestId = health.headers.get("x-request-id");

    // The access log is written after the response, so read until it arrives.
    const reader = output.getReader();
    const decoder = new TextDecoder();
    let stdout = "";
    while (!stdout.includes(`"requestId":"${requestId}"`)) {
      const { done, value } = await reader.read();
      if (done) break;
      stdout += decoder.decode(value, { stream: true });
    }

    const lines = stdout
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(lines).toContainEqual(
      expect.objectContaining({
        message: "request",
        requestId,
        route: "GET /api/health",
        clientIp: "127.0.0.1",
      }),
    );
  },
  TIMEOUT_MS,
);

test.skipIf(externalAddress === undefined)(
  "refuses connections to other addresses of this machine when local",
  async () => {
    const { port } = await startLocal();

    await expect(
      fetch(`http://${externalAddress}:${port}/api/health`),
    ).rejects.toThrow();
  },
  TIMEOUT_MS,
);
