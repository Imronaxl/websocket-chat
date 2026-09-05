export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PUBLIC_CHAT_MODE === "backend") return;

  const { spawnChatBackend } = await import("./instrumentation-node");
  await spawnChatBackend();
}
