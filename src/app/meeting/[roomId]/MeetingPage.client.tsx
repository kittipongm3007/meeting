// src/app/meeting/[roomId]/MeetingPage.client.tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/trpc/client";
import { getIceServers } from "@/lib/rtc/ice";

type PeerMap = Map<string, RTCPeerConnection>;

export default function MeetingPage({ roomId }: { roomId: string }) {
    const router = useRouter();
    const [userId] = React.useState(() => crypto.randomUUID());
    const [shareUrl, setShareUrl] = React.useState("");
    const [joined, setJoined] = React.useState(false);

    const localVideoRef = React.useRef<HTMLVideoElement>(null);
    const [remoteStreams, setRemoteStreams] = React.useState<
        { userId: string; stream: MediaStream }[]
    >([]);

    const peersRef = React.useRef<PeerMap>(new Map());
    const localStreamRef = React.useRef<MediaStream | null>(null);

    React.useEffect(() => {
        const base = typeof window !== "undefined" ? window.location.origin : "";
        setShareUrl(`${base}/meeting/${roomId}`);
    }, [roomId]);

    // --- เข้าห้อง
    const joinMutation = trpc.meeting.joinRoom.useMutation();
    const leaveMutation = trpc.meeting.leaveRoom.useMutation();
    const sendSignal = trpc.meeting.sendSignal.useMutation();

    function log(...args: any[]) {
        const ts = new Date().toISOString().split("T")[1].replace("Z", "");
        console.log(`xxxxxxxxs[MEETING ${ts}]`, ...args);
    }
    // --- subscribe events ของห้อง
    trpc.meeting.roomEvents.useSubscription({ roomId }, {
        onData: async (evt) => {
            log("EVENT <-", evt.type, evt);

            if (evt.type === "peer-joined" && evt.userId !== userId) {
                log("peer-joined:", evt.userId, "→ createAndSendOffer");
                await createAndSendOffer(evt.userId);
            }
            if (evt.type === "peer-left") {
                log("peer-left:", evt.userId);
                teardownPeer(evt.userId);
            }
            if (evt.type === "offer" && evt.to === userId) {
                log("OFFER <- from", evt.from, "len", JSON.stringify(evt.sdp).length);
                await handleRemoteOffer(evt.from, evt.sdp);
            }
            if (evt.type === "answer" && evt.to === userId) {
                log("ANSWER <- from", evt.from, "len", JSON.stringify(evt.sdp).length);
                await handleRemoteAnswer(evt.from, evt.sdp);
            }
            if (evt.type === "ice" && evt.to === userId) {
                log("ICE <- from", evt.from);
                const pc = peersRef.current.get(evt.from);
                if (pc) {
                    try { await pc.addIceCandidate(evt.candidate); }
                    catch (e) { console.error("addIceCandidate error", e); }
                }
            }
        },
    });

    async function getLocalStream() {
        if (localStreamRef.current) return localStreamRef.current;
        const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        localStreamRef.current = s;
        if (localVideoRef.current) {
            localVideoRef.current.srcObject = s;
            localVideoRef.current.muted = true;
            await localVideoRef.current.play().catch(() => { });
        }
        return s;
    }

    function ensurePeer(remoteId: string) {
        let pc = peersRef.current.get(remoteId);
        if (pc) return pc;

        pc = new RTCPeerConnection({ iceServers: getIceServers() });

        // ส่ง ICE ออกไป
        pc.onicecandidate = (e) => {
            if (e.candidate) {
                sendSignal.mutate({
                    type: "ice",
                    roomId,
                    from: userId,
                    to: remoteId,
                    candidate: e.candidate.toJSON(),
                });
            }
        };

        // เมื่อได้ remote track
        pc.ontrack = (evt) => {
            const stream = evt.streams[0];
            setRemoteStreams((prev) => {
                const others = prev.filter((x) => x.userId !== remoteId);
                return [...others, { userId: remoteId, stream }];
            });
        };

        // ใส่ local tracks
        (async () => {
            const ls = await getLocalStream();
            ls.getTracks().forEach((t) => pc!.addTrack(t, ls));
        })();

        peersRef.current.set(remoteId, pc);
        return pc;
    }

    async function createAndSendOffer(remoteId: string) {
        const pc = ensurePeer(remoteId);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendSignal.mutate({
            type: "offer",
            roomId,
            from: userId,
            to: remoteId,
            sdp: offer,
        });
    }

    async function handleRemoteOffer(fromId: string, sdp: any) {
        const pc = ensurePeer(fromId);
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal.mutate({
            type: "answer",
            roomId,
            from: userId,
            to: fromId,
            sdp: answer,
        });
    }

    async function handleRemoteAnswer(fromId: string, sdp: any) {
        const pc = peersRef.current.get(fromId);
        if (!pc) return;
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    }

    function teardownPeer(remoteId: string) {
        const pc = peersRef.current.get(remoteId);
        if (pc) {
            pc.getSenders().forEach((s) => s.track?.stop());
            pc.close();
        }
        peersRef.current.delete(remoteId);
        setRemoteStreams((prev) => prev.filter((x) => x.userId !== remoteId));
    }

    async function join() {
        await getLocalStream();

        // รับรายชื่อ user ในห้อง (รวมเราด้วย)
        const res = await joinMutation.mutateAsync({ roomId, userId });
        setJoined(true);

        // สร้าง offer ไปหา "ผู้ที่อยู่ในห้องอยู่แล้ว" ทันที
        const others = (res?.users ?? []).filter((u) => u !== userId);
        for (const uid of others) {
            await createAndSendOffer(uid);
        }
    }

    async function leave() {
        setJoined(false);
        await leaveMutation.mutateAsync({ roomId, userId });
        Array.from(peersRef.current.keys()).forEach(teardownPeer);
    }

    async function toggleMic() {
        const ls = await getLocalStream();
        ls.getAudioTracks().forEach((t) => (t.enabled = !t.enabled));
    }
    async function toggleCam() {
        const ls = await getLocalStream();
        ls.getVideoTracks().forEach((t) => (t.enabled = !t.enabled));
    }
    async function shareScreen() {
        const ds = await (navigator.mediaDevices as any).getDisplayMedia?.({ video: true, audio: true }).catch(() => null);
        if (!ds) return;
        const videoTrack = ds.getVideoTracks()[0];
        // สลับ track กับ peers
        peersRef.current.forEach((pc) => {
            const sender = pc.getSenders().find((s) => s.track?.kind === "video");
            if (sender && videoTrack) sender.replaceTrack(videoTrack);
        });
        // แสดงบน local
        if (localVideoRef.current) {
            localVideoRef.current.srcObject = ds;
            await localVideoRef.current.play().catch(() => { });
        }
        // เมื่อจบแชร์ คืนค่าเดิม
        videoTrack.onended = async () => {
            const ls = await getLocalStream();
            const camTrack = ls.getVideoTracks()[0];
            peersRef.current.forEach((pc) => {
                const sender = pc.getSenders().find((s) => s.track?.kind === "video");
                if (sender && camTrack) sender.replaceTrack(camTrack);
            });
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = ls;
                await localVideoRef.current.play().catch(() => { });
            }
        };
    }

    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(shareUrl);
            alert("คัดลอกลิงก์แล้ว!");
        } catch {
            window.prompt("คัดลอกเอง:", shareUrl);
        }
    };

    return (
        <main className="min-h-[60vh] max-w-5xl mx-auto p-6">
            <h1 className="text-2xl font-semibold mb-2">ห้องประชุม</h1>
            <p className="text-gray-600 mb-4">แชร์ลิงก์นี้ให้เพื่อนเพื่อเข้าห้องเดียวกัน</p>

            <div className="rounded-xl border p-4 mb-4">
                <div className="text-sm text-gray-500">Room ID</div>
                <div className="font-mono break-all text-base">{roomId}</div>
            </div>

            <div className="rounded-xl border p-4 mb-6">
                <div className="text-sm text-gray-500 mb-1">ลิงก์ห้อง</div>
                <div className="flex gap-2 items-center">
                    <input readOnly value={shareUrl} className="flex-1 rounded-md border px-3 py-2 font-mono text-sm" />
                    <button onClick={copyLink} className="rounded-lg px-3 py-2 bg-gray-900 text-white hover:bg-black">คัดลอก</button>
                </div>
            </div>

            <div className="flex flex-wrap gap-3 mb-6">
                {!joined ? (
                    <button onClick={join} className="rounded-lg px-4 py-2 bg-blue-600 text-white hover:bg-blue-700">เข้าร่วมการประชุม</button>
                ) : (
                    <button onClick={leave} className="rounded-lg px-4 py-2 border">ออกจากห้อง</button>
                )}
                <button onClick={toggleMic} className="rounded-lg px-4 py-2 border">สลับไมค์</button>
                <button onClick={toggleCam} className="rounded-lg px-4 py-2 border">สลับกล้อง</button>
                <button onClick={shareScreen} className="rounded-lg px-4 py-2 border">แชร์หน้าจอ</button>
                <button onClick={() => router.push("/meeting")} className="rounded-lg px-4 py-2 border">สร้างห้องใหม่</button>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
                <div className="rounded-xl border p-2">
                    <div className="text-sm text-gray-500 mb-1">Local</div>
                    <video ref={localVideoRef} playsInline className="w-full rounded-lg bg-black" />
                </div>

                {remoteStreams.map(({ userId: uid, stream }) => (
                    <RemoteVideo key={uid} userId={uid} stream={stream} />
                ))}
            </div>
        </main>
    );
}

function RemoteVideo({ userId, stream }: { userId: string; stream: MediaStream }) {
    const ref = React.useRef<HTMLVideoElement>(null);
    React.useEffect(() => {
        if (ref.current) {
            ref.current.srcObject = stream;
            ref.current.play().catch(() => { });
        }
    }, [stream]);
    return (
        <div className="rounded-xl border p-2">
            <div className="text-sm text-gray-500 mb-1">Remote — {userId.slice(0, 8)}</div>
            <video ref={ref} playsInline className="w-full rounded-lg bg-black" />
        </div>
    );
}
