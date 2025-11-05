// src/hooks/useWebRTC.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PeerRegistry, type PeerId } from "@/lib/rtc/peers";
import type {
    Signal,
    SdpInit,
    IceCandidateInitStrict,
} from "@/lib/rtc/signals";
import { getIceServers } from "@/lib/rtc/ice";

type SendSignalFn = (msg: Signal) => void;

type PeerDebugRow = {
    peerId: PeerId;
    signaling: RTCPeerConnection["signalingState"];
    connection: RTCPeerConnectionState;
    ice: RTCIceConnectionState;
    senders: (MediaStreamTrack["kind"] | "none")[];
    receivers: (MediaStreamTrack["kind"] | "none")[];
    remoteTracks: string[];
};

export function useWebRTC(
    roomId: string,
    userId: string,
    sendSignal: SendSignalFn
) {
    // ---- stable sender ----
    const sendRef = useRef<SendSignalFn>(sendSignal);
    useEffect(() => {
        sendRef.current = sendSignal;
    }, [sendSignal]);

    // ---- stable peer registry ----
    const peersRef = useRef<PeerRegistry<Signal> | null>(null);
    if (!peersRef.current) {
        peersRef.current = new PeerRegistry<Signal>(
            (payload) => sendRef.current(payload),
            getIceServers()
        );
    }
    const peers = peersRef.current;

    // cleanup bindings per peer
    const removeHandlersRef = useRef<Map<PeerId, () => void>>(new Map());

    // queue ICE until remoteDescription ready
    const iceQueueRef = useRef<Map<PeerId, IceCandidateInitStrict[]>>(new Map());

    // state
    const [remoteStreams, setRemoteStreams] = useState<
        Record<PeerId, MediaStream>
    >({});
    const localStreamRef = useRef<MediaStream | null>(null);

    // ---- unmount cleanup ----
    useEffect(() => {
        return () => {
            try {
                for (const [, unbind] of removeHandlersRef.current) {
                    try {
                        unbind();
                    } catch {
                        /* noop */
                    }
                }
                removeHandlersRef.current.clear();
                peers?.clear();
            } catch {
                /* noop */
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ---- ICE helpers ----
    function toStrictICE(c: RTCIceCandidateInit): IceCandidateInitStrict {
        // บังคับให้ candidate เป็น string (ถ้า undefined ให้เป็น "")
        // และเก็บ field อื่นแบบปลอดภัย
        const base: IceCandidateInitStrict = {
            candidate: c.candidate ?? "",
            sdpMid: c.sdpMid ?? null,
            sdpMLineIndex: typeof c.sdpMLineIndex === "number" ? c.sdpMLineIndex : null,
            usernameFragment: null,
        };
        // เก็บ usernameFragment หากมีใน runtime (ใช้ type guard แทน any)
        type WithUF = RTCIceCandidateInit & { usernameFragment?: string | null };
        const maybeUF: WithUF = c as WithUF;
        if (typeof maybeUF.usernameFragment === "string" || maybeUF.usernameFragment === null) {
            base.usernameFragment = maybeUF.usernameFragment ?? null;
        }
        return base;
    }

    function enqueueIce(peerId: PeerId, c: IceCandidateInitStrict): void {
        const q = iceQueueRef.current.get(peerId) ?? [];
        q.push(c);
        iceQueueRef.current.set(peerId, q);
    }

    async function flushIce(peerId: PeerId): Promise<void> {
        const rec = peers?.get(peerId);
        if (!rec || !rec.pc.remoteDescription) return;
        const q = iceQueueRef.current.get(peerId);
        if (!q || q.length === 0) return;
        while (q.length) {
            const cand = q.shift()!;
            try {
                await rec.pc.addIceCandidate(cand);
            } catch (e) {
                console.warn(`[PC:${peerId}] addIceCandidate (flush) fail`, e);
            }
        }
        iceQueueRef.current.delete(peerId);
    }

    // ---- local stream ----
    const attachLocalStream = useCallback(
        (stream: MediaStream | null) => {
            localStreamRef.current = stream;

            if (stream && peers) {
                for (const [, rec] of peers.all()) {
                    const existingKinds = new Set(
                        rec.pc
                            .getSenders()
                            .map((s) => s.track?.kind)
                            .filter((k): k is MediaStreamTrack["kind"] => typeof k === "string")
                    );
                    stream.getTracks().forEach((t) => {
                        if (!existingKinds.has(t.kind)) rec.pc.addTrack(t, stream);
                    });
                }
            }
        },
        [peers]
    );

    // ---- remote stream remove/ended binding ----
    const bindRemoteRemoveHandlers = useCallback(
        (peerId: PeerId) => {
            const rec = peers?.get(peerId);
            if (!rec || !rec.remoteStream) return;

            const oldUnbind = removeHandlersRef.current.get(peerId);
            if (oldUnbind) {
                try {
                    oldUnbind();
                } catch {
                    /* noop */
                }
                removeHandlersRef.current.delete(peerId);
            }

            const handleRemove = (): void => {
                const s = rec.remoteStream!;
                const tracks = s.getTracks().filter((t) => t.readyState !== "ended");
                const newStream = new MediaStream(tracks);
                rec.remoteStream = newStream;

                setRemoteStreams((prev) => {
                    if (newStream.getTracks().length === 0) {
                        const { [peerId]: _omit, ...rest } = prev;
                        return rest;
                    }
                    return { ...prev, [peerId]: newStream };
                });
            };

            const onRemoveTrack = (): void => handleRemove();
            rec.remoteStream.addEventListener("removetrack", onRemoveTrack);

            const trackEndCleanups: Array<() => void> = [];
            rec.remoteStream.getTracks().forEach((t) => {
                const onEnded = (): void => handleRemove();
                t.addEventListener("ended", onEnded);
                trackEndCleanups.push(() => {
                    try {
                        t.removeEventListener("ended", onEnded);
                    } catch {
                        /* noop */
                    }
                });
            });

            const unbind = (): void => {
                try {
                    rec.remoteStream?.removeEventListener("removetrack", onRemoveTrack);
                } catch {
                    /* noop */
                }
                trackEndCleanups.forEach((fn) => {
                    try {
                        fn();
                    } catch {
                        /* noop */
                    }
                });
            };
            removeHandlersRef.current.set(peerId, unbind);
        },
        [peers]
    );

    // ---- add local tracks & renegotiate ----
    const addLocalTracks = useCallback(
        async (peerId: PeerId): Promise<void> => {
            const rec = peers?.get(peerId);
            const ls = localStreamRef.current;
            if (!rec || !ls) return;

            const existingKinds = new Set(
                rec.pc
                    .getSenders()
                    .map((s) => s.track?.kind)
                    .filter((k): k is MediaStreamTrack["kind"] => typeof k === "string")
            );
            let added = false;
            ls.getTracks().forEach((track) => {
                if (!existingKinds.has(track.kind)) {
                    rec.pc.addTrack(track, ls);
                    added = true;
                }
            });

            if (added && rec.pc.signalingState !== "closed") {
                try {
                    const offer = await rec.pc.createOffer();
                    await rec.pc.setLocalDescription(offer);
                    const sdpOffer: SdpInit = { type: "offer", sdp: offer.sdp ?? "" };
                    sendRef.current({
                        type: "offer",
                        roomId,
                        from: userId,
                        to: peerId,
                        sdp: sdpOffer,
                    });
                } catch (e) {
                    console.warn(`[PC:${peerId}] renegotiate failed`, e);
                }
            }
        },
        [peers, roomId, userId]
    );

    // ---- bind PC handlers ----
    const addRemoteHandlers = useCallback(
        (peerId: PeerId): void => {
            const rec = peers?.get(peerId);
            if (!rec) return;

            rec.pc.onsignalingstatechange = () =>
                console.log(`[PC:${peerId}] signaling=`, rec.pc.signalingState);

            rec.pc.onconnectionstatechange = () => {
                console.log(`[PC:${peerId}] conn=`, rec.pc.connectionState);
                if (["failed", "disconnected", "closed"].includes(rec.pc.connectionState)) {
                    const unbind = removeHandlersRef.current.get(peerId);
                    if (unbind) {
                        try {
                            unbind();
                        } catch {
                            /* noop */
                        }
                        removeHandlersRef.current.delete(peerId);
                    }
                    setRemoteStreams((prev) => {
                        const { [peerId]: _omit, ...rest } = prev;
                        return rest;
                    });
                }
            };

            rec.pc.oniceconnectionstatechange = () =>
                console.log(`[PC:${peerId}] ice=`, rec.pc.iceConnectionState);

            rec.pc.onnegotiationneeded = async () => {
                if (rec.pc.signalingState === "closed") return;
                try {
                    const offer = await rec.pc.createOffer();
                    await rec.pc.setLocalDescription(offer);
                    const sdpOffer: SdpInit = { type: "offer", sdp: offer.sdp ?? "" };
                    sendRef.current({
                        type: "offer",
                        roomId,
                        from: userId,
                        to: peerId,
                        sdp: sdpOffer,
                    });
                    console.log(`[PC:${peerId}] onnegotiationneeded → offer sent`);
                } catch (e) {
                    console.warn(`[PC:${peerId}] onnegotiationneeded fail`, e);
                }
            };

            rec.pc.ontrack = (e: RTCTrackEvent) => {
                const incoming = e.streams?.[0];
                if (incoming) {
                    rec.remoteStream = incoming;
                } else if (e.track) {
                    if (!rec.remoteStream) rec.remoteStream = new MediaStream();
                    rec.remoteStream.addTrack(e.track);
                }

                if (rec.remoteStream && rec.remoteStream.getTracks().length > 0) {
                    setRemoteStreams((prev) => ({ ...prev, [peerId]: rec.remoteStream! }));
                }
                bindRemoteRemoveHandlers(peerId);
            };

            rec.pc.onicecandidate = (e: RTCPeerConnectionIceEvent) => {
                if (e.candidate) {
                    const strict = toStrictICE(e.candidate.toJSON());
                    if (!strict.candidate) return; // กันส่งค่าว่าง
                    sendRef.current({
                        type: "ice",
                        roomId,
                        from: userId,
                        to: peerId,
                        candidate: strict,
                    });
                } else {
                    console.log(`[PC:${peerId}] ICE gathering complete`);
                }
            };
        },
        [bindRemoteRemoveHandlers, peers, roomId, userId]
    );

    // ---- signaling flows ----
    const createOfferFor = useCallback(
        async (peerId: PeerId): Promise<void> => {
            const rec = peers?.create(userId, peerId);
            if (!rec) return;

            addRemoteHandlers(peerId);

            // 1) ถ้ามี localStream ก็ใส่ก่อน (ของเดิม)
            await addLocalTracks(peerId);

            // 2) ถ้ายังไม่มี sender/track ให้เพิ่ม transceiver รับสัญญาณ
            if (rec.pc.getTransceivers().length === 0) {
                rec.pc.addTransceiver("audio", { direction: "recvonly" });
                rec.pc.addTransceiver("video", { direction: "recvonly" });
            }

            const offer = await rec.pc.createOffer();
            await rec.pc.setLocalDescription(offer);
            const sdpOffer: SdpInit = { type: "offer", sdp: offer.sdp ?? "" };
            sendRef.current({
                type: "offer",
                roomId,
                from: userId,
                to: peerId,
                sdp: sdpOffer,
            });
        },
        [addLocalTracks, addRemoteHandlers, peers, roomId, userId]
    );

    const acceptOfferFrom = useCallback(
        async (fromId: PeerId, sdp: SdpInit): Promise<void> => {
            const rec = peers?.create(userId, fromId);
            if (!rec) return;
            addRemoteHandlers(fromId);
            await addLocalTracks(fromId);

            await rec.pc.setRemoteDescription(sdp as RTCSessionDescriptionInit);
            await flushIce(fromId);
            const answer = await rec.pc.createAnswer();
            await rec.pc.setLocalDescription(answer);
            const sdpAnswer: SdpInit = { type: "answer", sdp: answer.sdp ?? "" };
            sendRef.current({
                type: "answer",
                roomId,
                from: userId,
                to: fromId,
                sdp: sdpAnswer,
            });
        },
        [addLocalTracks, addRemoteHandlers, peers, roomId, userId]
    );

    const acceptAnswerFrom = useCallback(
        async (fromId: PeerId, sdp: SdpInit): Promise<void> => {
            const rec = peers?.get(fromId);
            if (!rec) return;
            await rec.pc.setRemoteDescription(sdp as RTCSessionDescriptionInit);
            await flushIce(fromId);
        },
        [peers]
    );

    const addIceFrom = useCallback(
        async (fromId: PeerId, candidate: IceCandidateInitStrict): Promise<void> => {
            const rec = peers?.get(fromId);
            if (!rec || !rec.pc.remoteDescription) {
                enqueueIce(fromId, candidate);
                return;
            }
            try {
                await rec.pc.addIceCandidate(candidate);
            } catch (err) {
                console.error(`[PC:${fromId}] addIceCandidate ERROR`, err);
            }
        },
        [peers]
    );

    const teardownPeer = useCallback(
        (peerId: PeerId): void => {
            const unbind = removeHandlersRef.current.get(peerId);
            if (unbind) {
                try {
                    unbind();
                } catch {
                    /* noop */
                }
                removeHandlersRef.current.delete(peerId);
            }
            peers?.delete(peerId);
            setRemoteStreams((prev) => {
                const { [peerId]: _omit, ...rest } = prev;
                return rest;
            });
        },
        [peers]
    );

    const peekPeers = useCallback((): void => {
        if (!peers) return;
        const rows: PeerDebugRow[] = [];
        for (const [id, rec] of peers.all()) {
            const pc = rec.pc;
            const rs = rec.remoteStream;
            rows.push({
                peerId: id,
                signaling: pc.signalingState,
                connection: pc.connectionState,
                ice: pc.iceConnectionState,
                senders: pc.getSenders().map((s) => s.track?.kind ?? "none"),
                receivers: pc.getReceivers().map((r) => r.track?.kind ?? "none"),
                remoteTracks: rs
                    ? rs.getTracks().map((t) => `${t.kind}:${t.readyState}`)
                    : [],
            });
        }
        // ไม่มี any: cast เป็น union ปลอดภัยสำหรับ console.table
        const printable: ReadonlyArray<Record<string, unknown>> = rows.map((r) => ({
            peerId: r.peerId,
            signaling: r.signaling,
            connection: r.connection,
            ice: r.ice,
            senders: r.senders,
            receivers: r.receivers,
            remoteTracks: r.remoteTracks,
        }));
        // eslint-disable-next-line no-console
        console.table(printable);
    }, [peers]);

    return {
        attachLocalStream,
        remoteStreams,
        createOfferFor,
        acceptOfferFrom,
        acceptAnswerFrom,
        addIceFrom,
        teardownPeer,
        peekPeers,
    };
}