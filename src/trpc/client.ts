// src/trpc/client.ts
"use client";

import { createTRPCReact } from "@trpc/react-query"; // v10
import type { AppRouter } from "@/server/routers/_app";
import {
    httpBatchLink,
    loggerLink,
    splitLink,
    createWSClient,
    wsLink,
    type CreateTRPCClientOptions,
} from "@trpc/client"; // v10
import superjson from "superjson"; // v1

export const trpc = createTRPCReact<AppRouter>();

/** Base URL สำหรับ HTTP (SSR ใช้ env, Client ใช้ relative) */
export function getBaseUrl() {
    if (typeof window !== "undefined") return ""; // browser
    return process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
}

/** URL สำหรับ WebSocket (ควรเป็น ws:// หรือ wss:// ให้ตรงกับหน้าเว็บ) */
export function getWsUrl() {
    // if (typeof window === "undefined") {
    //     // ฝั่ง server ใช้ env ได้ตามสะดวก
    //     return process.env.NEXT_PUBLIC_WS_URL ?? "ws://recurrently-sappy-roxane.ngrok-free.dev";
    // }
    // const protocol = location.protocol === "https:" ? "wss" : "ws";
    // const host = location.hostname;                // localhost
    // const port =
    //     process.env.NEXT_PUBLIC_WS_PORT ||
    //     (location.protocol === "https:" ? (location.port || "443") : "3001");
    // return `${protocol}://${host}:${port}`;
    return process.env.NEXT_PUBLIC_WS_URL || 'ws://recurrently-sappy-roxane.ngrok-free.dev'
}

/**
 * ตัวเลือกสำหรับ trpc.createClient (v10)
 * - ใส่ transformer ที่ระดับบนสุด (superjson v1)
 * - เปิด wsLink เฉพาะฝั่ง browser
 */
export function createTrpcClientOptions(): CreateTRPCClientOptions<AppRouter> {
    const isBrowser = typeof window !== "undefined";
    const sss = getWsUrl()
    console.log('sss', sss);

    return {
        transformer: superjson,
        links: [
            loggerLink({
                enabled: (op) =>
                    process.env.NODE_ENV === "development" ||
                    (op.direction === "down" && op.result instanceof Error),
            }),
            splitLink({
                condition: (op) => op.type === "subscription" && isBrowser,
                true: wsLink({
                    client: isBrowser ? createWSClient({ url: getWsUrl() }) : (undefined as any),
                }),
                false: httpBatchLink({
                    url: `${getBaseUrl()}/api/trpc`,
                    // headers() { return { ... } } // ถ้าต้องส่ง header เพิ่ม
                }),
            }),
        ],
    };
}
