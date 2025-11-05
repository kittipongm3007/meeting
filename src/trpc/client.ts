// src/trpc/client.ts
"use client";

import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@/server/routers/_app";
import superjson from "superjson";
import {
    httpBatchLink,
    loggerLink,
    splitLink,
    createWSClient,
    wsLink,
    type CreateTRPCClientOptions,
} from "@trpc/client";

export const trpc = createTRPCReact<AppRouter>();

function getBaseUrl() {
    if (typeof window !== "undefined") return "";
    return process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
}
function getWsUrl() {
    if (typeof window === "undefined") {
        return process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3001";
    }
    const env = process.env.NEXT_PUBLIC_WS_URL;
    if (env) return env;
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    return `${proto}://${window.location.hostname}:3001`;
}

export const trpcClientOptions: CreateTRPCClientOptions<AppRouter> = {
    transformer: superjson,
    links: [
        loggerLink({ enabled: () => process.env.NODE_ENV === "development" }),
        splitLink({
            condition: (op) => op.type === "subscription",
            true: wsLink({
                client: createWSClient({ url: getWsUrl() }),
            }),
            false: httpBatchLink({
                url: `${getBaseUrl()}/api/trpc`,
            }),
        }),
    ],
};