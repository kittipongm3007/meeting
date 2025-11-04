// src/lib/rtc/errors.ts
export function explainGetUserMediaError(err: unknown): string {
    const e = err as DOMException | Error;
    const name = (e as any)?.name || e?.constructor?.name || "Error";
    switch (name) {
        case "NotAllowedError": return "ไม่ได้รับสิทธิ์ใช้งานไมค์/กล้อง (กด Allow ในเบราว์เซอร์)";
        case "NotFoundError": return "ไม่พบไมค์หรือกล้องที่พร้อมใช้งาน";
        case "NotReadableError": return "อุปกรณ์ถูกใช้งานโดยโปรแกรมอื่นอยู่";
        case "OverconstrainedError": return "ข้อกำหนดอุปกรณ์เข้มเกินไป (constraints ไม่ match)";
        case "SecurityError": return "ต้องใช้ HTTPS หรือ localhost เท่านั้น";
        default: return `${name}: ${(e as Error).message ?? "ไม่ทราบสาเหตุ"}`;
    }
}
