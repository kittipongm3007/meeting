"use client";

import { trpc } from "@/trpc/client";

export default function Home() {
  const ping = trpc.meeting.ping.useQuery();
  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold">Meeting — Setup</h1>
      <pre className="mt-4">{JSON.stringify(ping.data, null, 2)}</pre>
    </main>
  );
}
