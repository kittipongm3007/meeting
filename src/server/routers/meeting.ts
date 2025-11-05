// src/server/routers/meeting.ts
import { router, publicProcedure } from "../trpc/trpc";
import { z } from "zod";
import { observable } from "@trpc/server/observable";

type SignalEvent =
  | { type: "peer-joined"; roomId: string; userId: string }
  | { type: "peer-left"; roomId: string; userId: string }
  | { type: "offer"; from: string; to: string; sdp: any; roomId: string }
  | { type: "answer"; from: string; to: string; sdp: any; roomId: string }
  | { type: "ice"; from: string; to: string; candidate: any; roomId: string };

const rooms = new Map<
  string,
  {
    users: Set<string>;
    subs: Set<(evt: SignalEvent) => void>;
  }
>();

function getRoom(roomId: string) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, { users: new Set(), subs: new Set() });
  }
  return rooms.get(roomId)!;
}

export const meetingRouter = router({
  joinRoom: publicProcedure
    .input(z.object({ roomId: z.string().min(1), userId: z.string().min(1) }))
    .mutation(({ input }) => {
      const room = getRoom(input.roomId);
      room.users.add(input.userId);
      console.log("[JOIN]", input.roomId, input.userId, "users:", Array.from(room.users));
      room.subs.forEach((cb) =>
        cb({ type: "peer-joined", roomId: input.roomId, userId: input.userId })
      );
      return { ok: true, users: Array.from(room.users) };
    }),

  leaveRoom: publicProcedure
    .input(z.object({ roomId: z.string().min(1), userId: z.string().min(1) }))
    .mutation(({ input }) => {
      const room = getRoom(input.roomId);
      room.users.delete(input.userId);
      console.log("[LEAVE]", input.roomId, input.userId);
      room.subs.forEach((cb) =>
        cb({ type: "peer-left", roomId: input.roomId, userId: input.userId })
      );
      return { ok: true };
    }),

  sendSignal: publicProcedure
    .input(
      z.discriminatedUnion("type", [
        z.object({
          type: z.literal("offer"),
          roomId: z.string(),
          from: z.string(),
          to: z.string(),
          sdp: z.any(),
        }),
        z.object({
          type: z.literal("answer"),
          roomId: z.string(),
          from: z.string(),
          to: z.string(),
          sdp: z.any(),
        }),
        z.object({
          type: z.literal("ice"),
          roomId: z.string(),
          from: z.string(),
          to: z.string(),
          candidate: z.any(),
        }),
      ])
    )
    .mutation(({ input }) => {
      if (input.type === "offer") console.log("[OFFER]", input.roomId, `${input.from} -> ${input.to}`);
      if (input.type === "answer") console.log("[ANSWER]", input.roomId, `${input.from} -> ${input.to}`);
      if (input.type === "ice") console.log("[ICE]", input.roomId, `${input.from} -> ${input.to}`);

      const room = getRoom(input.roomId);
      room.subs.forEach((cb) => cb(input as any));
      return { ok: true };
    }),

  roomEvents: publicProcedure
    .input(z.object({ roomId: z.string().min(1) }))
    .subscription(({ input }) => {
      console.log("[SUB]", input.roomId, "new subscriber");
      return observable<SignalEvent>((emit) => {
        const room = getRoom(input.roomId);
        const handler = (evt: SignalEvent) => {
          if (evt.roomId === input.roomId) emit.next(evt);
        };
        room.subs.add(handler);
        return () => {
          room.subs.delete(handler);
        };
      });
    }),
});