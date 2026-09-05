import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import http from "http";

function isBackendAlive(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get("http://localhost:3003/health", (res) => {
      res.destroy();
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

export async function spawnChatBackend(): Promise<void> {
  const serviceDir = path.join(process.cwd(), "mini-services", "chat-backend");
  if (!fs.existsSync(serviceDir)) {
    console.warn("[instrumentation] chat-backend dir not found, skipping spawn");
    return;
  }

  await ensureBackendAlive(serviceDir);

  setInterval(() => {
    void ensureBackendAlive(serviceDir);
  }, 10_000);
}

async function ensureBackendAlive(serviceDir: string): Promise<void> {
  if (await isBackendAlive()) return;

  console.log("[instrumentation] chat-backend down, spawning…");
  const child = spawn("bun", ["index.ts"], {
    cwd: serviceDir,
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
    env: { ...process.env },
  });

  child.stdout?.on("data", (chunk) => {
    console.log(`[chat-backend] ${chunk.toString().trim()}`);
  });
  child.stderr?.on("data", (chunk) => {
    console.error(`[chat-backend] ${chunk.toString().trim()}`);
  });
  child.on("exit", (code, signal) => {
    console.log(`[instrumentation] chat-backend exited (code=${code} signal=${signal})`);
  });

  await new Promise((r) => setTimeout(r, 500));
}
