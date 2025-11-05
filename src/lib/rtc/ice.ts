// src/lib/rtc/ice.ts
export function getIceServers(): RTCIceServer[] {
    return [{ urls: ["stun:stun.l.google.com:19302"] }];
}
