// src/types/display-media.d.ts
// ทำให้เป็น global type definitions
// (ไม่มี export — ให้กลายเป็น ambient declarations)

interface DisplayMediaStreamConstraints {
    video?: boolean | MediaTrackConstraints;
    audio?: boolean | MediaTrackConstraints;

    // optional fields ตามสเปค/เบราว์เซอร์บางตัวรองรับ
    preferCurrentTab?: boolean;
    selfBrowserSurface?: "include" | "exclude";
    systemAudio?: "include" | "exclude";
    surfaceSwitching?: "include" | "exclude";
    monitorTypeSurfaces?: "include" | "exclude";
}

interface MediaDevices {
    // เพิ่ม signature ให้ TypeScript รู้จัก
    getDisplayMedia(constraints?: DisplayMediaStreamConstraints): Promise<MediaStream>;
}