// src/lib/rtc/ice.ts
export function getIceServers(): RTCConfiguration {
    return {
        iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            // ใส่ TURN ของคุณเองเมื่อต้อง NAT ทะลุยาก
            // { urls: "turn:your.turn.server:3478", username: "user", credential: "pass" },
        ],
    };
}