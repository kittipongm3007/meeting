// src/app/meeting/[roomId]/page.tsx
import type { Metadata } from "next";
import MeetingPage from "./MeetingPage.client";

// ใน Next เวอร์ชันใหม่ params เป็น Promise
type Params = Promise<{ roomId: string }>;

export async function generateMetadata(
    { params }: { params: Params }
): Promise<Metadata> {
    const { roomId } = await params; // ← สำคัญ ต้อง await
    return {
        title: `Meeting — ${roomId}`,
        description: "แชร์ลิงก์นี้ให้ผู้อื่นเพื่อเข้าห้องเดียวกัน",
    };
}

export default async function RoomPage(
    { params }: { params: Params }
) {
    const { roomId } = await params; // ← สำคัญ ต้อง await
    return <MeetingPage roomId={roomId} />;
}
