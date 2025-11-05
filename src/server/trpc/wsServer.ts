// src/server/trpc/wsServer.ts
import { createContext } from "../trpc/context";
import { appRouter } from "../routers/_app";
import { applyWSSHandler } from "@trpc/server/adapters/ws";
import { WebSocketServer } from "ws";

const PORT = Number(process.env.WS_PORT ?? 3001);

const wss = new WebSocketServer({ port: PORT });
const handler = applyWSSHandler({ wss, router: appRouter, createContext });

wss.on("listening", () => {
  console.log(`[tRPC-WS] listening on ws://localhost:${PORT}`);
});

process.on("SIGTERM", () => {
  console.log("SIGTERM");
  handler.broadcastReconnectNotification();
  wss.close();
});
