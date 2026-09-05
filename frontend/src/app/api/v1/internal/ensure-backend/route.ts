import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import http from "http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BACKEND_PORT = 3003;
const BACKEND_HEALTH_URL = `http://localhost:${BACKEND_PORT}/health`;

function isBackendAlive(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(BACKEND_HEALTH_URL, (res) => {
      res.destroy();
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function spawnBackend(): void {
  const serviceDir = path.join(process.cwd(), "mini-services", "chat-backend");
  if (!fs.existsSync(serviceDir)) {
    console.warn("[ensure-backend] chat-backend dir not found");
    return;
  }
  console.log("[ensure-backend] spawning chat-backend mini-service…");
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
    console.log(`[ensure-backend] chat-backend exited (code=${code} signal=${signal})`);
  });
}

async function waitForBackend(maxAttempts = 10): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    if (await isBackendAlive()) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

export async function GET() {
  if (await isBackendAlive()) {
    return NextResponse.json({ status: "ok", port: BACKEND_PORT, spawned: false });
  }

  spawnBackend();
  const alive = await waitForBackend(10);
  if (alive) {
    return NextResponse.json({ status: "ok", port: BACKEND_PORT, spawned: true });
  }
  return NextResponse.json(
    { status: "error", detail: "Failed to start chat-backend" },
    { status: 502 },
  );
}
