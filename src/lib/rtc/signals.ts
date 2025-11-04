// src/lib/rtc/signals.ts
export type SdpInit = {
    type: "offer" | "answer";
    sdp: string;
};

// เข้มงวดกับ ICE: candidate ต้องเป็น string
export type IceCandidateInitStrict = {
    candidate: string;
    sdpMid?: string | null;
    sdpMLineIndex?: number | null;
    usernameFragment?: string | null;
};

export type OfferSignal = {
    type: "offer";
    roomId: string;
    from: string;
    to: string;
    sdp: SdpInit;
};

export type AnswerSignal = {
    type: "answer";
    roomId: string;
    from: string;
    to: string;
    sdp: SdpInit;
};

export type IceSignal = {
    type: "ice";
    roomId: string;
    from: string;
    to: string;
    candidate: IceCandidateInitStrict;
};

export type PeerJoined = { type: "peer-joined"; roomId: string; userId: string };
export type PeerLeft = { type: "peer-left"; roomId: string; userId: string };

export type Signal = OfferSignal | AnswerSignal | IceSignal | PeerJoined | PeerLeft;