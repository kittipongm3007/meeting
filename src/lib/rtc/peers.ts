// src/lib/rtc/peers.ts
"use client";

import { getIceServers } from "./ice";
import type { Signal } from "./signals";

export type PeerId = string;

export type PeerRecord = {
    pc: RTCPeerConnection;
    remoteStream: MediaStream;
    senders: RTCRtpSender[];
};

export class PeerRegistry {
    private peers = new Map<PeerId, PeerRecord>();

    /**
     * emitSignal: ฟังก์ชันสำหรับส่งสัญญาณออกไปยัง signaling layer (tRPC WS ฯลฯ)
     * - ต้องรับ payload ชนิด Signal (offer/answer/ice/peer-joined/peer-left)
     */
    constructor(private emitSignal: (payload: Signal) => void) { }

    /** สร้าง peer (ถ้ามีอยู่แล้วจะคืนตัวเดิม) */
    create(selfId: string, peerId: PeerId): PeerRecord {
        const exists = this.peers.get(peerId);
        if (exists) return exists;

        const pc = new RTCPeerConnection({ iceServers: getIceServers() });
        const remoteStream = new MediaStream();
        const rec: PeerRecord = { pc, remoteStream, senders: [] };
        this.peers.set(peerId, rec);

        // ---- Logging states ช่วยดีบั๊ก ----
        pc.onsignalingstatechange = () => {
            console.log(`[PC:${peerId}] signaling=`, pc.signalingState);
        };
        pc.onconnectionstatechange = () => {
            console.log(`[PC:${peerId}] conn=`, pc.connectionState);
        };
        pc.oniceconnectionstatechange = () => {
            console.log(`[PC:${peerId}] ice=`, pc.iceConnectionState);
        };

        // หมายเหตุ:
        // - ไม่ตั้ง onicecandidate/ontrack ที่นี่ ปล่อยให้ hook ไปตั้งเอง
        //   เพื่อหลีกเลี่ยงการทับซ้อนของ handler

        pc.onnegotiationneeded = () => {
            console.log(`[PC:${peerId}] negotiationneeded`);
        };

        return rec;
    }

    get(peerId: PeerId): PeerRecord | null {
        return this.peers.get(peerId) ?? null;
    }

    /** ใส่ local tracks (กันซ้ำตาม kind) ควรเรียกก่อน createOffer/createAnswer */
    addLocalTracks(peerId: PeerId, localStream: MediaStream) {
        const rec = this.peers.get(peerId);
        if (!rec) return;

        const existingKinds = new Set(
            rec.pc.getSenders().map((s) => s.track?.kind).filter(Boolean) as string[]
        );

        localStream.getTracks().forEach((t) => {
            if (!existingKinds.has(t.kind)) {
                const sender = rec.pc.addTrack(t, localStream);
                rec.senders.push(sender);
                // console.log(`[PC:${peerId}] addTrack kind=${t.kind}`);
            }
        });
    }

    /** Caller: สร้าง Offer แล้วส่งผ่าน signaling */
    async createAndSendOffer(selfId: string, peerId: PeerId) {
        const rec = this.peers.get(peerId);
        if (!rec) throw new Error(`peer ${peerId} not found`);
        const pc = rec.pc;

        const offer = await pc.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true,
        });
        console.log(`[PC:${peerId}] OFFER created len=${offer.sdp?.length}`);
        await pc.setLocalDescription(offer);
        console.log(`[PC:${peerId}] OFFER setLocalDescription OK`);

        this.emitSignal({ type: "offer", from: selfId, to: peerId, sdp: offer });
        console.log(`[WS→] offer sent → ${peerId}`);
    }

    /** Callee: รับ Offer → setRemote → create Answer → ส่ง Answer กลับ */
    async handleRemoteOffer(selfId: string, peerId: PeerId, sdp: RTCSessionDescriptionInit) {
        const rec = this.peers.get(peerId);
        if (!rec) throw new Error(`peer ${peerId} not found`);
        const pc = rec.pc;

        await pc.setRemoteDescription(sdp);
        console.log(`[PC:${peerId}] setRemoteDescription(offer) OK`);

        const answer = await pc.createAnswer();
        console.log(`[PC:${peerId}] ANSWER created len=${answer.sdp?.length}`);
        await pc.setLocalDescription(answer);
        console.log(`[PC:${peerId}] ANSWER setLocalDescription OK`);

        this.emitSignal({ type: "answer", from: selfId, to: peerId, sdp: answer });
        console.log(`[WS→] answer sent → ${peerId}`);
    }

    /** Caller: รับ Answer → setRemoteDescription */
    async handleRemoteAnswer(peerId: PeerId, sdp: RTCSessionDescriptionInit) {
        const rec = this.peers.get(peerId);
        if (!rec) throw new Error(`peer ${peerId} not found`);
        await rec.pc.setRemoteDescription(sdp);
        console.log(`[PC:${peerId}] setRemoteDescription(answer) OK`);
    }

    /** รับ ICE จากอีกฝั่ง */
    async handleRemoteIce(peerId: PeerId, candidate: RTCIceCandidateInit) {
        const rec = this.peers.get(peerId);
        if (!rec) throw new Error(`peer ${peerId} not found`);
        try {
            await rec.pc.addIceCandidate(candidate);
            // console.log(`[PC:${peerId}] addIceCandidate OK typ=${this._readCandType(candidate)}`);
        } catch (err) {
            console.error(`[PC:${peerId}] addIceCandidate ERROR`, err);
        }
    }

    /** เปลี่ยน track (เช่น แชร์หน้าจอ/สลับกล้อง) โดยไม่ต้อง renegotiate ใหญ่ */
    replaceTrack(peerId: PeerId, kind: "audio" | "video", newTrack: MediaStreamTrack | null) {
        const rec = this.peers.get(peerId);
        if (!rec) return;
        const sender = rec.senders.find((s) => s.track?.kind === kind);
        sender?.replaceTrack(newTrack ?? null);
        console.log(`[PC:${peerId}] replaceTrack kind=${kind} -> ${!!newTrack}`);
    }

    /** ปิด peer และลบออกจาก registry */
    delete(peerId: PeerId) {
        const rec = this.peers.get(peerId);
        if (rec) {
            try {
                rec.pc.getSenders().forEach((s) => s.track?.stop());
                rec.pc.getReceivers().forEach((r) => r.track?.stop());
                rec.remoteStream?.getTracks?.().forEach((t) => t.stop());
                rec.pc.close();
            } catch { }
            this.peers.delete(peerId);
            console.log(`[PC:${peerId}] closed & removed`);
        }
    }

    /** รายการ peers ทั้งหมด (สำหรับ sync state ภายนอก) */
    all(): Array<[PeerId, PeerRecord]> {
        return Array.from(this.peers.entries());
    }

    clear(): void {
        for (const [id, rec] of this.peers) {
            try {
                rec.pc.getSenders().forEach((s) => s.track?.stop());
                rec.pc.getReceivers().forEach((r) => r.track?.stop());
                rec.remoteStream?.getTracks?.().forEach((t) => t.stop());
                rec.pc.close();
            } catch { }
            this.peers.delete(id);
        }
    }

    private _readCandType(c: RTCIceCandidateInit) {
        const raw = typeof c.candidate === "string" ? c.candidate : "";
        const m = raw.match(/ typ (\w+) /);
        return m?.[1] ?? "unknown";
    }
}
