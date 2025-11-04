// src/server/routers/meeting.ts
import { publicProcedure, router } from "../trpc";
import { z } from "zod";
import { observable } from "@trpc/server/observable";
import { roomStore } from "../rooms";

/**
 * สคีมาข้อมูลสัญญาณ (ให้ตรงกับฝั่ง client)
 * - sdp: RTCSessionDescriptionInit (แบบ zod)
 * - ice: RTCIceCandidateInit (แบบ zod)
 */
const sdpSchema = z.object({
  type: z.enum(["offer", "answer"]),
  sdp: z.string(),
});

const iceSchema = z.object({
  candidate: z.string(),
  sdpMid: z.string().nullish(),
  sdpMLineIndex: z.number().nullish(),
  usernameFragment: z.string().nullish(),
});

const peerJoined = z.object({
  type: z.literal("peer-joined"),
  roomId: z.string(),
  userId: z.string(),
});

const peerLeft = z.object({
  type: z.literal("peer-left"),
  roomId: z.string(),
  userId: z.string(),
});

const offerSig = z.object({
  type: z.literal("offer"),
  roomId: z.string(),
  from: z.string(),
  to: z.string(),
  sdp: sdpSchema,
});

const answerSig = z.object({
  type: z.literal("answer"),
  roomId: z.string(),
  from: z.string(),
  to: z.string(),
  sdp: sdpSchema,
});

const iceSig = z.object({
  type: z.literal("ice"),
  roomId: z.string(),
  from: z.string(),
  to: z.string(),
  candidate: iceSchema,
});

const signalSchema = z.discriminatedUnion("type", [
  peerJoined,
  peerLeft,
  offerSig,
  answerSig,
  iceSig,
]);

export const meetingRouter = router({
  // สำหรับทดสอบง่าย ๆ
  ping: publicProcedure.query(() => ({ ok: true, ts: Date.now() })),

  // (ตัวอย่าง) join เฉย ๆ
  join: publicProcedure
    .input(z.object({ roomId: z.string(), userId: z.string() }))
    .mutation(({ input }) => {
      return { joined: true, ...input };
    }),

  // เข้าห้อง: บันทึกใน roomStore + คืน peers ปัจจุบัน + broadcast peer-joined
  joinRoom: publicProcedure
    .input(z.object({ roomId: z.string(), userId: z.string() }))
    .mutation(({ input }) => {
      roomStore.join(input.roomId, input.userId);

      // แก้: ใช้ broadcast (เพราะไม่มี to)
      roomStore.broadcast(input.roomId, {
        type: "peer-joined",
        roomId: input.roomId,
        userId: input.userId,
      });

      const peers = roomStore.peers(input.roomId).filter((id) => id !== input.userId);
      return { ok: true, peers };
    }),

  // ออกจากห้อง + broadcast peer-left
  leaveRoom: publicProcedure
    .input(z.object({ roomId: z.string(), userId: z.string() }))
    .mutation(({ input }) => {
      roomStore.leave(input.roomId, input.userId);

      // แก้: ใช้ broadcast (เพราะไม่มี to)
      roomStore.broadcast(input.roomId, {
        type: "peer-left",
        roomId: input.roomId,
        userId: input.userId,
      });

      return { ok: true };
    }),

  /**
   * Subscription: รับทุก event ในห้อง
   * - แนะนำให้ client ส่งทั้ง { roomId, userId } มาด้วย
   * - เมื่อ subscribe แล้ว (ถ้ามี userId) จะยิง peer-joined ทันที
   * - เมื่อ unsubscribe จะยิง peer-left ให้อัตโนมัติ
   */
  roomEvents: publicProcedure
    .input(z.object({ roomId: z.string(), userId: z.string().optional() }))
    .subscription(({ input }) => {
      console.log('input', input);

      return observable<z.infer<typeof signalSchema>>((emit) => {
        const off = roomStore.on(input.roomId, (evt: unknown) => {
          const parsed = signalSchema.safeParse(evt);
          if (parsed.success) emit.next(parsed.data);
        });
        console.log('input', input);

        if (input.userId) {
          roomStore.broadcast(input.roomId, {
            type: "peer-joined",
            roomId: input.roomId,
            userId: input.userId,
          });
        }

        return () => {
          off();
          if (input.userId) {
            roomStore.broadcast(input.roomId, {
              type: "peer-left",
              roomId: input.roomId,
              userId: input.userId,
            });
          }
        };
      });
    }),

  /**
   * ส่งสัญญาณ (offer/answer/ice) ไปยังทุก listener ในห้อง
   * - ให้ client เป็นคนกรองเองด้วย msg.to === userId
   * - ใช้ schema ที่ชัดเจน (ไม่ใช้ any) เพื่อกันพลาด
   */
  sendSignal: publicProcedure
    .input(signalSchema)
    .mutation(({ input }) => {
      // offer/answer/ice เท่านั้นที่ใช้ direct (มี `to`)
      if (input.type === "offer" || input.type === "answer" || input.type === "ice") {
        roomStore.direct(input.roomId, input);
      } else {
        // กันพลาด: peer-joined/peer-left → broadcast
        roomStore.broadcast(input.roomId, input);
      }
      return { ok: true };
    }),
});
