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

    // ลบ peer ทั้งหมดเมื่อ unmount (กัน resource ค้าง)
    useEffect(() => {
        return () => {
            try {
                peers.clear();
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

    /** sync remoteStreams -> state */
    const _syncRemote = useCallback(() => {
        const obj: Record<string, MediaStream> = {};
        for (const [id, rec] of peers.all()) {
            // sync เฉพาะ stream ที่มี track แล้ว เพื่อลด flicker/ว่าง
            if (rec.remoteStream && rec.remoteStream.getTracks().length > 0) {
                obj[id] = rec.remoteStream;
            }
        }
        setRemoteStreams(obj);
    }, [peers]);

    /** bind handlers ให้ peer (hook เป็นคนผูก handler ที่เดียว) */
    const addRemoteHandlers = useCallback(
        (peerId: string) => {
            const rec = peers.get(peerId)!;

            rec.pc.onsignalingstatechange = () =>
                console.log(`[PC:${peerId}] signaling=`, rec.pc.signalingState);
            rec.pc.onconnectionstatechange = () =>
                console.log(`[PC:${peerId}] conn=`, rec.pc.connectionState);
            rec.pc.oniceconnectionstatechange = () =>
                console.log(`[PC:${peerId}] ice=`, rec.pc.iceConnectionState);

            rec.pc.ontrack = (e) => {
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
                // รอ 1 tick ให้ tracks ผูกเสร็จก่อน sync
                setTimeout(_syncRemote, 0);
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
        [peers, _syncRemote, userId]
    );

    /** add local tracks (กันซ้ำตาม kind) */
    const addLocalTracks = useCallback(
        (peerId: string) => {
            const rec = peers.get(peerId)!;
            const ls = localStreamRef.current;
            if (!ls) return;

            const existingKinds = new Set(
                rec.pc.getSenders().map((s) => s.track?.kind).filter(Boolean) as string[]
            );

            ls.getTracks().forEach((track) => {
                if (!existingKinds.has(track.kind)) {
                    rec.pc.addTrack(track, ls);
                }
            });
        },
        [peers]
    );

    /** Caller → สร้าง offer และส่ง */
    const createOfferFor = useCallback(
        async (peerId: string) => {
            const rec = peers.create(userId, peerId);
            console.log('rec', rec);

            addRemoteHandlers(peerId);
            addLocalTracks(peerId);

            const offer = await rec.pc.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true,
            });
            console.log(`[PC:${peerId}] OFFER created len=${offer.sdp?.length}`);
            await rec.pc.setLocalDescription(offer);
            console.log(`[PC:${peerId}] OFFER setLocalDescription OK`);

            sendRef.current({ type: "offer", from: userId, to: peerId, sdp: offer });
            console.log(`[WS→] offer sent → ${peerId}`);
        },
        [peers, addRemoteHandlers, addLocalTracks, userId]
    );

    /** Callee → รับ offer แล้วตอบ answer กลับ */
    const acceptOfferFrom = useCallback(
        async (fromId: string, sdp: RTCSessionDescriptionInit, _peerId?: string) => {
            // สำคัญ: selfId = userId, peerId = fromId (อย่าสลับ)
            const rec = peers.create(userId, fromId);
            addRemoteHandlers(fromId);
            addLocalTracks(fromId);

            await rec.pc.setRemoteDescription(sdp);
            console.log(`[PC:${fromId}] setRemoteDescription(offer) OK`);

            const answer = await rec.pc.createAnswer();
            console.log(`[PC:${fromId}] ANSWER created len=${answer.sdp?.length}`);
            await rec.pc.setLocalDescription(answer);
            console.log(`[PC:${fromId}] ANSWER setLocalDescription OK`);

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
            peers.delete(peerId);
            _syncRemote();
        },
        [peers, _syncRemote]
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
