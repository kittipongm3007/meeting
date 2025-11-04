// src/lib/rtc/ice.ts
"use client";

/**
 * รูปแบบตัวแปร .env.local ที่รองรับ (เลือกอย่างใดอย่างหนึ่ง):
 *
 * 1) แบบ JSON ก้อนเดียว:
 *    NEXT_PUBLIC_RTC_ICE_JSON='[{"urls":"stun:stun.l.google.com:19302"},{"urls":"turn:your.turn.host:3478","username":"user","credential":"pass"}]'
 *
 * 2) แบบแยกตัวแปร (รองรับได้ 1 TURN server แบบง่าย):
 *    NEXT_PUBLIC_TURN_URL=turn:your.turn.host:3478
 *    NEXT_PUBLIC_TURN_USERNAME=user
 *    NEXT_PUBLIC_TURN_CREDENTIAL=pass
 *
 * ถ้าไม่ตั้งค่าอะไรเลย จะ fallback เป็น STUN google อย่างเดียว (ทดสอบในวงแลนได้ แต่ข้ามเน็ต/มือถือมักไม่ติด)
 */

export type IceServer = RTCIceServer;

const DEFAULT_STUN: IceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
];

function parseJsonEnv(name: string): IceServer[] | null {
    const raw = process.env.NEXT_PUBLIC_RTC_ICE_JSON;
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            // ตรวจสอบคร่าว ๆ ว่าเป็นรูป IceServer
            return parsed.filter((x) => typeof x?.urls !== "undefined");
        }
        console.warn(`[ice] ${name} is not an array, ignoring.`);
        return null;
    } catch (e) {
        console.error("[ice] invalid JSON in NEXT_PUBLIC_RTC_ICE_JSON:", e);
        return null;
    }
}

function fromSplitEnv(): IceServer[] | null {
    const url = process.env.NEXT_PUBLIC_TURN_URL;
    const username = process.env.NEXT_PUBLIC_TURN_USERNAME;
    const credential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;

    if (!url) return null;

    const turn: IceServer = {
        urls: url,
        username,
        credential,
    };

    // รวมกับ STUN เริ่มต้นเสมอ
    return [...DEFAULT_STUN, turn];
}

/**
 * ดึงรายการ ICE servers สำหรับใช้กับ RTCPeerConnection
 * - พยายามอ่านจาก NEXT_PUBLIC_RTC_ICE_JSON ก่อน (ยืดหยุ่นสุด)
 * - ถ้าไม่มี ให้ลองอ่านชุดแยกตัวแปร (NEXT_PUBLIC_TURN_URL/USERNAME/CREDENTIAL)
 * - ถ้ายังไม่มี → ใช้ STUN Google (ทดสอบได้เฉพาะบางกรณี)
 */
export function getIceServers(): IceServer[] {
    // ใช้ JSON ก้อนเดียวถ้ามี
    const jsonCfg = parseJsonEnv("NEXT_PUBLIC_RTC_ICE_JSON");
    if (jsonCfg && jsonCfg.length > 0) {
        console.log("[ice] using NEXT_PUBLIC_RTC_ICE_JSON");
        return jsonCfg;
    }

    // ใช้ตัวแปรแยก
    const splitCfg = fromSplitEnv();
    if (splitCfg && splitCfg.length > 0) {
        console.log("[ice] using NEXT_PUBLIC_TURN_* with default STUN");
        return splitCfg;
    }

    // สุดท้าย fallback STUN
    console.warn("[ice] no TURN configured, using STUN only (may fail across networks)");
    return DEFAULT_STUN;
}

/**
 * ตัวช่วย debug: แสดงว่าเรามี TURN หรือยัง
 */
export function hasTurn(servers = getIceServers()): boolean {
    return servers.some((s) => {
        const urls = Array.isArray(s.urls) ? s.urls : [s.urls];
        return urls.some((u) => typeof u === "string" && u.startsWith("turn:"));
    });
}
