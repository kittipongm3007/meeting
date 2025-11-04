// src/lib/rtc/peers.ts
export type PeerId = string;

export type PeerRecord = {
    selfId: string;
    peerId: string;
    pc: RTCPeerConnection;
    remoteStream?: MediaStream;
};

export type SendFn<T> = (payload: T) => void;

export class PeerRegistry<TSignal> {
    private map = new Map<PeerId, PeerRecord>();
    private send: SendFn<TSignal>;
    private rtcConfig?: RTCConfiguration;

    constructor(send: SendFn<TSignal>, rtcConfig?: RTCConfiguration) {
        this.send = send;
        this.rtcConfig = rtcConfig;
    }

    create(selfId: string, peerId: string) {
        let rec = this.map.get(peerId);
        if (rec) return rec;

        const pc = new RTCPeerConnection(
            this.rtcConfig ?? { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] }
        );

        // เพิ่มตัวรับ/ส่งไว้ตั้งแต่แรก เพื่อให้ ontrack ยิงเสถียร
        try {
            pc.addTransceiver("video", { direction: "sendrecv" });
            pc.addTransceiver("audio", { direction: "sendrecv" });
        } catch (e) {
            console.warn("[PeerRegistry] addTransceiver not available:", e);
        }

        rec = { selfId, peerId, pc };
        this.map.set(peerId, rec);
        return rec;
    }

    get(peerId: string) { return this.map.get(peerId); }
    has(peerId: string) { return this.map.has(peerId); }

    delete(peerId: string) {
        const rec = this.map.get(peerId);
        if (rec) {
            try {
                rec.pc.getSenders().forEach((s) => {
                    try { if (s.track) rec.pc.removeTrack(s); } catch { }
                });
                rec.pc.close();
            } catch { }
            this.map.delete(peerId);
        }
    }

    clear() { for (const [id] of this.map) this.delete(id); }
    all() { return this.map.entries(); }
}