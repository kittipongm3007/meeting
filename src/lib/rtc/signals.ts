// src/lib/rtc/signals.ts
export type OfferSignal = {
    type: "offer";
    from: string;
    to: string;
    sdp: RTCSessionDescriptionInit; // ← ใช้ชนิด WebRTC โดยตรง
};

export type AnswerSignal = {
    type: "answer";
    from: string;
    to: string;
    sdp: RTCSessionDescriptionInit;
};

export type IceSignal = {
    type: "ice";
    from: string;
    to: string;
    candidate: RTCIceCandidateInit; // ← ใช้ชนิด WebRTC โดยตรง
};

export type PeerJoinedSignal = { type: "peer-joined"; userId: string };
export type PeerLeftSignal = { type: "peer-left"; userId: string };

export type Signal =
    | OfferSignal
    | AnswerSignal
    | IceSignal
    | PeerJoinedSignal
    | PeerLeftSignal;
