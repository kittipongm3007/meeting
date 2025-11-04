// server/trpc/wsServer.ts
import { WebSocketServer } from "ws";
import { applyWSSHandler } from "@trpc/server/adapters/ws";
import { appRouter } from "../routers/_app";

const port = Number(process.env.WS_PORT ?? 3001);

const wss = new WebSocketServer({ port });
const handler = applyWSSHandler({
    wss,
    router: appRouter,
    createContext: () => ({}),
});

wss.on("listening", () => {
    console.log(`✅ tRPC WebSocket server listening on ws://localhost:${port}`);
});

process.on("SIGTERM", () => {
    console.log("SIGTERM");
    handler.broadcastReconnectNotification();
    wss.close();
});
