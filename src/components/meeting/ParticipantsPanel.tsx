"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function ParticipantsPanel({
  selfId,
  peers,
}: {
  selfId: string;
  peers: { id: string }[];
}) {
  return (
    <div className="rounded-2xl border p-3 h-full">
      <div className="font-semibold mb-2">Participants</div>
      <ScrollArea className="h-[260px]">
        <ul className="space-y-2">
          <li className="flex items-center gap-2">
            <Avatar className="h-8 w-8"><AvatarFallback>Me</AvatarFallback></Avatar>
            <div className="text-sm">You ({selfId ? selfId.slice(0,6) : "..."})</div>
          </li>
          {peers.map((p) => (
            <li key={p.id} className="flex items-center gap-2">
              <Avatar className="h-8 w-8"><AvatarFallback>{p.id.slice(0,2)}</AvatarFallback></Avatar>
              <div className="text-sm">Peer {p.id.slice(0, 6)}</div>
            </li>
          ))}
        </ul>
      </ScrollArea>
    </div>
  );
}
