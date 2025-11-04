"use client";
import { ReactNode, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"; // v4
import { trpc, createTrpcClientOptions } from "@/trpc/client";
import { createTRPCClient } from "@trpc/client";

export default function Providers({ children }: { children: React.ReactNode }) {
    const [queryClient] = useState(() => new QueryClient());
    const [trpcClient] = useState(() => trpc.createClient(createTrpcClientOptions()));

    return (
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
            <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        </trpc.Provider>
    );
}
