// src/hooks/useWebRTC.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PeerRegistry, type PeerId } from "@/lib/rtc/peers";
import type { Signal } from "@/lib/rtc/signals";

type SendSignalFn = (msg: Signal) => void;

export function useWebRTC(roomId: string, userId: string, sendSignal: SendSignalFn) {
    // เก็บฟังก์ชันส่งสัญญาณเวอร์ชันล่าสุด โดยไม่ทำให้ registry ถูกสร้างใหม่
    const sendRef = useRef(sendSignal);
    useEffect(() => {
        sendRef.current = sendSignal;
    }, [sendSignal]);

    // สร้าง PeerRegistry แบบ stable ตลอดอายุคอมโพเนนต์
    const peersRef = useRef<PeerRegistry | null>(null);
    if (!peersRef.current) {
        peersRef.current = new PeerRegistry((payload: Signal) => sendRef.current(payload));
    }
    const peers = peersRef.current!;

    // เก็บตัว unbind ของ handler removetrack ต่อ peer (เพื่อ cleanup)
    const removeHandlersRef = useRef<Map<PeerId, () => void>>(new Map());

    // ลบ peer ทั้งหมดเมื่อ unmount (กัน resource ค้าง)
    useEffect(() => {
        return () => {
            try {
                // cleanup handlers ก่อน
                for (const [peerId, unbind] of removeHandlersRef.current) {
                    try { unbind(); } catch { }
                    removeHandlersRef.current.delete(peerId);
                }
                peers.clear?.();
            } catch { }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const [remoteStreams, setRemoteStreams] = useState<Record<PeerId, MediaStream>>({});
    const localStreamRef = useRef<MediaStream | null>(null);

    /** แนบ local stream จาก useLocalMedia() */
    const attachLocalStream = useCallback(
        (stream: MediaStream | null) => {
            localStreamRef.current = stream;

            // ถ้าแนบภายหลัง: push track เข้า peers เดิม (กันซ้ำ kind)
            if (stream) {
                for (const [pid, rec] of peers.all()) {
                    const existingKinds = new Set(
                        rec.pc.getSenders().map((s) => s.track?.kind).filter(Boolean) as string[]
                    );
                    stream.getTracks().forEach((t) => {
                        if (!existingKinds.has(t.kind)) {
                            rec.pc.addTrack(t, stream);
                        }
                    });
                }
            }
        },
        [peers]
    );

    /** ผูกตัวฟัง removetrack/onended ให้กับ remoteStream ของ peerId (และคืนฟังก์ชันสำหรับ cleanup) */
    const bindRemoteRemoveHandlers = useCallback(
        (peerId: PeerId) => {
            const rec = peers.get(peerId);
            if (!rec || !rec.remoteStream) return;

            // ถ้ามีตัวเดิมอยู่แล้ว ให้ unbind ก่อนเพื่อกันซ้ำ
            const oldUnbind = removeHandlersRef.current.get(peerId);
            if (oldUnbind) {
                try { oldUnbind(); } catch { }
                removeHandlersRef.current.delete(peerId);
            }

            const handleRemove = () => {
                const s = rec.remoteStream!;
                // สร้าง stream ใหม่จาก tracks ที่ยังไม่จบ
                const tracks = s.getTracks().filter((t) => t.readyState !== "ended");
                const newStream = new MediaStream(tracks);
                rec.remoteStream = newStream;

                setRemoteStreams((prev) => {
                    if (newStream.getTracks().length === 0) {
                        const { [peerId]: _, ...rest } = prev;
                        return rest;
                    }
                    return { ...prev, [peerId]: newStream };
                });
            };

            // ฟัง removetrack บน MediaStream
            const onRemoveTrack = (ev: Event) => {
                // แต่ไม่จำเป็นต้องอ่านค่าในอีเวนต์นี้ เรา re-scan tracks อยู่แล้ว
                handleRemove();
            };
            rec.remoteStream.addEventListener("removetrack", onRemoveTrack);

            // เผื่อ track จบเอง
            const trackEndCleanups: Array<() => void> = [];
            rec.remoteStream.getTracks().forEach((t) => {
                const prev = t.onended;
                t.onended = (ev) => {
                    try { prev?.call(t, ev as Event); } catch { }
                    handleRemove();
                };
                trackEndCleanups.push(() => { t.onended = prev || null; });
            });

            // เก็บ unbind ไว้
            const unbind = () => {
                try { rec.remoteStream?.removeEventListener("removetrack", onRemoveTrack); } catch { }
                trackEndCleanups.forEach((fn) => {
                    try { fn(); } catch { }
                });
            };
            removeHandlersRef.current.set(peerId, unbind);
        },
        [peers]
    );

    /** add local tracks (กันซ้ำตาม kind) + renegotiate ถ้าพึ่งเพิ่ม */
    const addLocalTracks = useCallback(
        async (peerId: string) => {
            const rec = peers.get(peerId)!;
            const ls = localStreamRef.current;
            if (!ls) return;

            const existingKinds = new Set(
                rec.pc.getSenders().map((s) => s.track?.kind).filter(Boolean) as string[]
            );

            let added = false;
            ls.getTracks().forEach((track) => {
                if (!existingKinds.has(track.kind)) {
                    rec.pc.addTrack(track, ls);
                    added = true;
                }
            });

            // ถ้าเพิ่งเพิ่ม track และ signalingState พร้อม → renegotiate
            if (added && rec.pc.signalingState !== "closed") {
                try {
                    const offer = await rec.pc.createOffer();
                    await rec.pc.setLocalDescription(offer);
                    sendRef.current({ type: "offer", from: userId, to: peerId, sdp: offer });
                } catch (e) {
                    console.warn(`[PC:${peerId}] renegotiate failed`, e);
                }
            }
        },
        [peers, userId]
    );

    /** bind handlers ให้ peer (hook เป็นคนผูก handler ที่เดียว) */
    const addRemoteHandlers = useCallback(
        (peerId: string) => {
            const rec = peers.get(peerId)!;

            rec.pc.onsignalingstatechange = () =>
                console.log(`[PC:${peerId}] signaling=`, rec.pc.signalingState);

            rec.pc.onconnectionstatechange = () => {
                console.log(`[PC:${peerId}] conn=`, rec.pc.connectionState);
                if (["failed", "disconnected", "closed"].includes(rec.pc.connectionState)) {
                    // cleanup listener
                    const unbind = removeHandlersRef.current.get(peerId);
                    if (unbind) {
                        try { unbind(); } catch { }
                        removeHandlersRef.current.delete(peerId);
                    }
                    // ลบ stream ออกจาก state
                    setRemoteStreams((prev) => {
                        const { [peerId]: _, ...rest } = prev;
                        return rest;
                    });
                }
            };

            rec.pc.oniceconnectionstatechange = () =>
                console.log(`[PC:${peerId}] ice=`, rec.pc.iceConnectionState);

            rec.pc.ontrack = (e) => {
                console.log("ontrack:", peerId, e.streams?.[0], e.track?.kind);

                // ส่วนใหญ่ stream จะมากับ e.streams[0]
                const incoming = e.streams?.[0];
                if (incoming) {
                    rec.remoteStream = incoming;
                } else if (e.track) {
                    if (!rec.remoteStream) {
                        rec.remoteStream = new MediaStream();
                    }
                    rec.remoteStream.addTrack(e.track);
                }

                // อัปเดต state ทันที
                if (rec.remoteStream && rec.remoteStream.getTracks().length > 0) {
                    setRemoteStreams((prev) => ({ ...prev, [peerId]: rec.remoteStream! }));
                }

                // ผูก removetrack/onended บน MediaStream (ไม่ใช่บน RTCPeerConnection)
                bindRemoteRemoveHandlers(peerId);
            };

            rec.pc.onicecandidate = (e) => {
                if (e.candidate) {
                    const c = e.candidate.toJSON(); // RTCIceCandidateInit
                    sendRef.current({ type: "ice", from: userId, to: peerId, candidate: c });
                } else {
                    console.log(`[PC:${peerId}] ICE gathering complete`);
                }
            };
        },
        [peers, userId, bindRemoteRemoveHandlers]
    );

    /** Caller → สร้าง offer และส่ง */
    const createOfferFor = useCallback(
        async (peerId: string) => {
            const rec = peers.create(userId, peerId);
            addRemoteHandlers(peerId);
            await addLocalTracks(peerId);

            const offer = await rec.pc.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true,
            });
            await rec.pc.setLocalDescription(offer);

            sendRef.current({ type: "offer", from: userId, to: peerId, sdp: offer });
            console.log(`[WS→] offer sent → ${peerId}`);
        },
        [peers, addRemoteHandlers, addLocalTracks, userId]
    );

    /** Callee → รับ offer แล้วตอบ answer กลับ */
    const acceptOfferFrom = useCallback(
        async (fromId: string, sdp: RTCSessionDescriptionInit) => {
            const rec = peers.create(userId, fromId);
            addRemoteHandlers(fromId);
            await addLocalTracks(fromId);

            await rec.pc.setRemoteDescription(sdp);
            const answer = await rec.pc.createAnswer();
            await rec.pc.setLocalDescription(answer);

            sendRef.current({ type: "answer", from: userId, to: fromId, sdp: answer });
            console.log(`[WS→] answer sent → ${fromId}`);
        },
        [peers, addRemoteHandlers, addLocalTracks, userId]
    );

    /** Caller → รับ answer */
    const acceptAnswerFrom = useCallback(
        async (fromId: string, sdp: RTCSessionDescriptionInit) => {
            const rec = peers.get(fromId);
            if (!rec) return;
            await rec.pc.setRemoteDescription(sdp);
            console.log(`[PC:${fromId}] setRemoteDescription(answer) OK`);
        },
        [peers]
    );

    /** รับ ICE จากอีกฝั่ง */
    const addIceFrom = useCallback(
        async (fromId: string, candidate: RTCIceCandidateInit) => {
            const rec = peers.get(fromId);
            if (!rec) return;
            try {
                await rec.pc.addIceCandidate(candidate);
            } catch (err) {
                console.error(`[PC:${fromId}] addIceCandidate ERROR`, err);
            }
        },
        [peers]
    );

    /** ปิด/ลบ peer */
    const teardownPeer = useCallback(
        (peerId: string) => {
            // unbind removetrack/onended
            const unbind = removeHandlersRef.current.get(peerId);
            if (unbind) {
                try { unbind(); } catch { }
                removeHandlersRef.current.delete(peerId);
            }

            peers.delete(peerId);
            setRemoteStreams((prev) => {
                const { [peerId]: _, ...rest } = prev;
                return rest;
            });
        },
        [peers]
    );

    return {
        attachLocalStream,
        remoteStreams,
        createOfferFor,
        acceptOfferFrom,
        acceptAnswerFrom,
        addIceFrom,
        teardownPeer,
    };
}
