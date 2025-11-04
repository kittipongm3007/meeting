"use client";
import { useEffect, useState } from "react";

export default function ClientOnly({ children }: { children: React.ReactNode }) {
    const [ready, setReady] = useState(false);
    useEffect(() => setReady(true), []);
    if (!ready) return null;          // งดเรนเดอร์ตอน SSR
    return children;                  // เรนเดอร์เฉพาะฝั่ง client
}
