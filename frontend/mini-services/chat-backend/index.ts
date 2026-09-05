import { createService } from "./service";

const PORT = 3003;

const server = createService(PORT);

console.log(`[chat-backend] listening on :${PORT} (DEMO adapter, in-memory)`);

export default server;
