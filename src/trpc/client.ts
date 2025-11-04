// src/trpc/client.ts
"use client";

import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@/server/routers/_app";
import {
    httpBatchLink,
    loggerLink,
    splitLink,
    createWSClient,
    wsLink,
    type TRPCLink,
} from "@trpc/client";
import superjson from "superjson";

function getHttpBaseUrl(): string {
    if (typeof window !== "undefined") return "";
    const env = process.env.NEXT_PUBLIC_BASE_URL ?? "";
    if (env) return env.replace(/\/+$/, "");
    return "http://localhost:3000";
}

function getWsUrl(): string | null {
    if (typeof window === "undefined") return null;
    const env = process.env.NEXT_PUBLIC_WS_URL;
    if (env && /^wss?:\/\//i.test(env)) return env;

    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const host = window.location.host;

    const customPort =
        process.env.NEXT_PUBLIC_WS_PORT && /^\d+$/.test(process.env.NEXT_PUBLIC_WS_PORT)
            ? `:${process.env.NEXT_PUBLIC_WS_PORT}`
            : "";

    const hostWithPort = customPort
        ? `${window.location.hostname}${customPort}`
        : host;

    return `${proto}://${hostWithPort}`;
}

export const trpc = createTRPCReact<AppRouter>();

/**
 * คืนค่าเป็น array ปกติ (mutable) และระบุชนิดคืนค่าให้ชัดเจน
 */
export function getTrpcClientLinks(): TRPCLink<AppRouter>[] {
    const http = httpBatchLink({
        url: `${getHttpBaseUrl()}/api/trpc`,
    });

    // loggerLink ให้ชนิดเป็น TRPCLink<AnyRouter> → แคสต์ครั้งเดียวให้เป็น TRPCLink<AppRouter>
    const base: TRPCLink<AppRouter>[] = [
        loggerLink({
            enabled: (opts) =>
                process.env.NODE_ENV === "development" ||
                (opts.direction === "down" && opts.result instanceof Error),
        }) as unknown as TRPCLink<AppRouter>,
    ];

    const wsUrl = getWsUrl();
    if (wsUrl) {
        const wsClient = createWSClient({ url: wsUrl });
        const ws = wsLink<AppRouter>({ client: wsClient });

        // ใส่ splitLink เป็น element เดียว แล้วปล่อย queries/mutations ไป http, subscriptions ไป ws
        base.push(
            splitLink({
                condition(op) {
                    return op.type === "subscription";
                },
                true: ws,
                false: http,
            })
        );
    } else {
        base.push(http);
    }

    return base; // ← array ปกติ ไม่ใช่ readonly tuple
}

/** ใช้ตัวนี้ใน <Providers> */
export function createTrpcClient() {
    return trpc.createClient({
        transformer: superjson,          // ใส่ transformer ที่นี่ (ไม่ใช่ใน httpBatchLink)
        links: getTrpcClientLinks(),     // ← now mutable TRPCLink<AppRouter>[]
    });
}