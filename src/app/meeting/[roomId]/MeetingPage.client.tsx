"use client";

import * as React from "react";
import { trpc } from "@/trpc/client";
import { useLocalMedia, useMediaDevices } from "@/hooks/useMediaDevices";
import { useWebRTC } from "@/hooks/useWebRTC";
import { MeetingControls } from "@/components/meeting/MeetingControls";
import { explainGetUserMediaError } from "@/lib/rtc/errors";

type Signal =
    | { type: "offer"; from: string; to: string; sdp: any }
    | { type: "answer"; from: string; to: string; sdp: any }
    | { type: "ice"; from: string; to: string; candidate: any }
    | { type: "peer-joined"; userId: string }
    | { type: "peer-left"; userId: string };

export default function MeetingPage({ roomId }: { roomId: string }) {
    // ----- ป้องกัน Hydration mismatch: สร้าง userId หลัง mount เท่านั้น
    const [userId, setUserId] = React.useState<string>("");
    React.useEffect(() => {
        const id =
            typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
                ? crypto.randomUUID()
                : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        setUserId(id);
    }, []);

    const [errMsg, setErrMsg] = React.useState<string>("");

    // ----- อุปกรณ์/มีเดียโลคัล
    const { cams, mics } = useMediaDevices();
    const {
        state: local,
        start,
        stop,
        toggleMic,
        toggleCam,
        switchCam,
        switchMic,
        startScreenShare,
    } = useLocalMedia();

    // ----- tRPC mutations/subscription
    const join = trpc.meeting.joinRoom.useMutation();
    const leave = trpc.meeting.leaveRoom.useMutation();
    const sendSignalMut = trpc.meeting.sendSignal.useMutation();

    // ----- ใช้ useWebRTC (ต่อสัญญาณกับ tRPC)
    const {
        attachLocalStream,
        remoteStreams,
        createOfferFor,
        acceptOfferFrom,
        acceptAnswerFrom,
        addIceFrom,
        teardownPeer, // เผื่อใช้ในอนาคต (peer-left)
    } = useWebRTC(
        roomId,
        userId || "pending",
        React.useCallback(
            (msg: Signal) => {
                // ฟังก์ชันส่งสัญญาณให้ useWebRTC เรียกใช้ (จัดรูปให้ตรงกับ router)
                if (!userId) return;
                if (msg.type === "offer") {
                    sendSignalMut.mutate({
                        type: "offer",
                        roomId,
                        from: userId,
                        to: (msg as any).to,
                        sdp: (msg as any).sdp,
                    });
                } else if (msg.type === "answer") {
                    sendSignalMut.mutate({
                        type: "answer",
                        roomId,
                        from: userId,
                        to: (msg as any).to,
                        sdp: (msg as any).sdp,
                    });
                } else if (msg.type === "ice") {
                    sendSignalMut.mutate({
                        type: "ice",
                        roomId,
                        from: userId,
                        to: (msg as any).to,
                        candidate: (msg as any).candidate,
                    });
                }
            },
            [roomId, userId, sendSignalMut]
        )
    );

    // ----- subscribe room events (offer/answer/ice/peer-joined/peer-left)
    trpc.meeting.roomEvents.useSubscription(
        { roomId, userId },
        {
            // ⭐ สำคัญ: subscribe หลังมี userId แล้วเท่านั้น
            enabled: !!roomId && !!userId,
            onData: (data) => {
                const msg = data as Signal;
                if (!userId || !msg || typeof (msg as any).type !== "string") return;

                // console.debug("[roomEvents]", msg);

                // มีคนเข้าใหม่ → เราเป็นคนริเริ่มส่ง offer ไปหาเขา (แต่ห้ามยิงหา "ตัวเอง")
                if (msg.type === "peer-joined" && msg.userId !== userId) {
                    // ถ้ายังไม่ได้เริ่มกล้อง/ไมค์ เราก็ยังสร้าง offer ได้
                    // (addLocalTracks จะข้ามไปก่อน แล้วค่อย replace/add ภายหลัง)
                    createOfferFor(msg.userId);
                    return;
                }

                // เราเป็น "ผู้รับ offer" เท่านั้นเมื่อ to === userId
                if (msg.type === "offer" && msg.to === userId) {
                    // ⭐ useWebRTC.acceptOfferFrom ใหม่ (ไม่ต้องส่ง peerId ตัวที่สามแล้ว)
                    acceptOfferFrom(msg.from, msg.sdp);
                    return;
                }

                // เราเป็น "ผู้รับ answer" เท่านั้นเมื่อ to === userId
                if (msg.type === "answer" && msg.to === userId) {
                    acceptAnswerFrom(msg.from, msg.sdp);
                    return;
                }

                // ผู้รับ ICE เท่านั้นเมื่อ to === userId
                if (msg.type === "ice" && msg.to === userId) {
                    addIceFrom(msg.from, msg.candidate);
                    return;
                }

                if (msg.type === "peer-left") {
                    // ถ้าต้องการปิด peer ทันที:
                    teardownPeer(msg.userId);
                    return;
                }
            },
        }
    );

    // ----- lifecycle: join/leave room (และหยุดกล้องเมื่อออก)
    React.useEffect(() => {
        if (!userId) return;
        join.mutate({ roomId, userId });

        return () => {
            leave.mutate({ roomId, userId });
            stop(); // ปิดกล้อง/ไมค์เมื่อออกจากหน้า
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId, roomId]);

    // ----- เริ่มกล้อง/ไมค์เมื่อผู้ใช้กดปุ่ม (ลดโอกาสโดนบล็อก)
    const startMedia = React.useCallback(async () => {
        try {
            const s = await start({ audio: true, video: true });
            attachLocalStream(s);
            setErrMsg("");
        } catch (e) {
            setErrMsg(explainGetUserMediaError(e));
        }
    }, [start, attachLocalStream]);

    // ----- ผูก local stream เข้ากับ video element
    const localVideoRef = React.useRef<HTMLVideoElement | null>(null);
    React.useEffect(() => {
        if (localVideoRef.current && local.stream) {
            localVideoRef.current.srcObject = local.stream;
            localVideoRef.current.muted = true;
            localVideoRef.current.play().catch(() => { });
        }
    }, [local.stream]);

    return (
        <div className="p-4 space-y-4">
            <header className="flex items-center justify-between">
                <h1 className="text-xl font-semibold">Room: {roomId}</h1>
                {userId && (
                    <span className="text-xs text-muted-foreground">You: {userId.slice(0, 8)}</span>
                )}
            </header>

            {errMsg && (
                <div className="border border-red-300 bg-red-50 text-red-700 p-3 rounded-lg">
                    กล้อง/ไมค์มีปัญหา: {errMsg}
                </div>
            )}

            {!local.stream ? (
                <button
                    onClick={startMedia}
                    className="px-4 py-2 rounded-lg bg-black text-white"
                    disabled={!userId}
                >
                    เริ่มใช้กล้อง/ไมค์
                </button>
            ) : (
                <MeetingControls
                    micEnabled={local.micEnabled}
                    camEnabled={local.camEnabled}
                    onToggleMic={() => toggleMic()}
                    onToggleCam={() => toggleCam()}
                    onShareScreen={async () => {
                        try {
                            const s = await startScreenShare();
                            if (!s) return;
                            // แสดงหน้าจอแชร์ใน local preview ชั่วคราว
                            if (localVideoRef.current) {
                                localVideoRef.current.srcObject = s;
                                localVideoRef.current.play().catch(() => { });
                            }
                            // เมื่อหยุดแชร์ → กลับไปกล้องเดิม
                            const [track] = s.getVideoTracks();
                            track.onended = () => {
                                if (localVideoRef.current && local.stream) {
                                    localVideoRef.current.srcObject = local.stream;
                                    localVideoRef.current.play().catch(() => { });
                                }
                            };
                        } catch (e) {
                            setErrMsg(explainGetUserMediaError(e));
                        }
                    }}
                />
            )}

            {/* เลือกอุปกรณ์ (ใช้ได้หลังเริ่มสตรีม) */}
            <div className="flex flex-wrap gap-3 items-end">
                <div className="flex flex-col">
                    <label className="text-sm">Camera</label>
                    <select
                        className="border rounded-md p-2"
                        onChange={(e) => switchCam(e.target.value)}
                        disabled={!local.stream}
                    >
                        {cams.map((c) => (
                            <option key={c.deviceId} value={c.deviceId}>
                                {c.label}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="flex flex-col">
                    <label className="text-sm">Microphone</label>
                    <select
                        className="border rounded-md p-2"
                        onChange={(e) => switchMic(e.target.value)}
                        disabled={!local.stream}
                    >
                        {mics.map((m) => (
                            <option key={m.deviceId} value={m.deviceId}>
                                {m.label}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* วิดีโอ */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-xl overflow-hidden border">
                    <video
                        ref={localVideoRef}
                        playsInline
                        autoPlay
                        className="w-full h-64 bg-black object-cover"
                    />
                    <div className="p-2 text-sm text-center">
                        You {userId ? `(${userId.slice(0, 6)})` : ""}
                    </div>
                </div>

                {Object.entries(remoteStreams).map(([peerId, stream]) => (
                    <RemoteVideo key={peerId} peerId={peerId} stream={stream} />
                ))}
            </div>
        </div>
    );
}

function RemoteVideo({ peerId, stream }: { peerId: string; stream: MediaStream }) {
    const ref = React.useRef<HTMLVideoElement | null>(null);
    React.useEffect(() => {
        if (ref.current) {
            ref.current.srcObject = stream;
            // บางเบราว์เซอร์ต้อง call play() หลังเปลี่ยน srcObject
            ref.current.play().catch(() => { });
        }
    }, [stream]);
    return (
        <div className="rounded-xl overflow-hidden border">
            <video ref={ref} playsInline autoPlay className="w-full h-64 bg-black object-cover" />
            <div className="p-2 text-sm text-center">Peer {peerId.slice(0, 6)}</div>
        </div>
    );
}
