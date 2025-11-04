// src/app/meeting/[roomId]/MeetingPage.client.tsx
"use client";

import * as React from "react";
import RemoteVideos from "@/components/meeting/RemoteVideos";
import { useWebRTC } from "@/hooks/useWebRTC";
import { trpc } from "@/trpc/client";
import type { SdpInit, IceCandidateInitStrict } from "@/lib/rtc/signals";

// อีเวนต์จาก server (ให้ตรงกับ tRPC router ฝั่ง server)
type MeetingEvent =
    | { type: "peer-joined"; roomId: string; userId: string }
    | { type: "peer-left"; roomId: string; userId: string }
    | { type: "offer"; roomId: string; from: string; to: string; sdp: SdpInit }
    | { type: "answer"; roomId: string; from: string; to: string; sdp: SdpInit }
    | {
          type: "ice";
          roomId: string;
          from: string;
          to: string;
          candidate: IceCandidateInitStrict;
      };

export default function MeetingPage({ roomId }: { roomId: string }) {
    // unique id ต่อแท็บ
    const userId = React.useMemo<string>(
        () => crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
        []
    );

    // mutation ส่งสัญญาณ
    const sendSignalMutation = trpc.meeting.sendSignal.useMutation();

    const {
        attachLocalStream,
        remoteStreams,
        createOfferFor,
        acceptOfferFrom,
        acceptAnswerFrom,
        addIceFrom,
        teardownPeer,
        peekPeers,
    } = useWebRTC(roomId, userId, (msg) => sendSignalMutation.mutate(msg));

    // subscription: รับสัญญาณจาก server
    trpc.meeting.roomEvents.useSubscription(
        { roomId, userId },
        {
            onData: async (evt: MeetingEvent): Promise<void> => {
                if (evt.roomId !== roomId) return;

                switch (evt.type) {
                    case "peer-joined":
                        if (evt.userId !== userId) {
                            await createOfferFor(evt.userId);
                        }
                        break;

                    case "peer-left":
                        teardownPeer(evt.userId);
                        break;

                    case "offer":
                        if (evt.to === userId) {
                            await acceptOfferFrom(evt.from, evt.sdp);
                        }
                        break;

                    case "answer":
                        if (evt.to === userId) {
                            await acceptAnswerFrom(evt.from, evt.sdp);
                        }
                        break;

                    case "ice":
                        if (evt.to === userId) {
                            await addIceFrom(evt.from, evt.candidate);
                        }
                        break;
                }
            },
        }
    );

    // local media
    const [localStream, setLocalStream] = React.useState<MediaStream | null>(
        null
    );

    React.useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: true,
                    audio: true,
                });
                if (!cancelled) {
                    setLocalStream(stream);
                    attachLocalStream(stream);
                }
            } catch (err) {
                console.error("getUserMedia failed:", err);
            }
        })();

        return () => {
            cancelled = true;
            try {
                localStream?.getTracks().forEach((t) => t.stop());
            } catch {
                // noop
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [attachLocalStream]);

    // ผูก srcObject + play
    const handleLocalVideoRef = React.useCallback(
        (el: HTMLVideoElement | null): void => {
            if (!el || !localStream) return;
            if (el.srcObject !== localStream) el.srcObject = localStream;
            void el.play().catch(() => {});
        },
        [localStream]
    );

    return (
        <div className="p-4 space-y-4">
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    className="px-3 py-1 rounded bg-zinc-800 text-white"
                    onClick={peekPeers}
                >
                    Peek peers
                </button>
                <span className="text-sm text-zinc-500">
                    room: {roomId} • me: {userId.slice(0, 8)}
                </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                    <div className="text-sm font-medium">My camera</div>
                    <video
                        ref={handleLocalVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full bg-black rounded"
                    />
                </div>

                <div className="space-y-1">
                    <div className="text-sm font-medium">Peers</div>
                    <RemoteVideos remoteStreams={remoteStreams} />
                </div>
            </div>
        </div>
    );
}
