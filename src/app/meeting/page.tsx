// src/app/meeting/page.tsx
"use client";

import { useRouter } from "next/navigation";

export default function MeetingHome() {
    const router = useRouter();

    const createRoom = () => {
        // ใช้ UUID เป็น roomId
        const id = crypto.randomUUID();
        router.push(`/meeting/${id}`);
    };

    return (
        <main className="min-h-[60vh] flex items-center justify-center p-6">
            <div className="max-w-md w-full text-center">
                <h1 className="text-2xl font-semibold mb-4">สร้างห้องประชุม</h1>
                <p className="text-sm text-gray-600 mb-6">
                    กดปุ่มด้านล่างเพื่อสร้างลิงก์ห้อง แล้วแชร์ให้เพื่อนเข้าร่วม
                </p>

                <button
                    onClick={createRoom}
                    className="inline-flex items-center justify-center rounded-xl px-5 py-3 bg-blue-600 text-white hover:bg-blue-700 active:translate-y-[1px] transition"
                >
                    สร้างห้องใหม่
                </button>
            </div>
        </main>
    );
}
