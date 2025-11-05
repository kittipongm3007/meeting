// RemoteVideoList.tsx
"use client";
import * as React from "react";

type Props = {
    remoteStreams: Record<string, MediaStream>;
    className?: string;
};

export default function RemoteVideoList({ remoteStreams, className }: Props) {
    return (
        <div className={className ?? "grid grid-cols-2 gap-2"}>
            {Object.entries(remoteStreams).map(([peerId, stream]) => (
                <RemoteVideoItem key={peerId} peerId={peerId} stream={stream} />
            ))}
        </div>
    );
}

function RemoteVideoItem({
    peerId,
    stream,
}: {
    peerId: string;
    stream: MediaStream;
}) {
    const ref = React.useRef<HTMLVideoElement | null>(null);

    // bind/rebind เมื่อ stream เปลี่ยนอ้างอิง
    React.useEffect(() => {
        const el = ref.current;
        if (!el) return;
        if (el.srcObject !== stream) {
            el.srcObject = stream;
        }
        // สั่งเล่น — กัน autoplay policy
        const tryPlay = async () => {
            try {
                await el.play();
            } catch {
                // ถ้าโดนบล็อกเสียง ให้ mute แล้วลองใหม่
                el.muted = true;
                try {
                    await el.play();
                } catch {
                    /* still blocked — user gesture needed */
                }
            }
        };
        // รอ metadata พร้อมก่อน play
        const onLoaded = () => void tryPlay();
        el.addEventListener("loadedmetadata", onLoaded);
        // call once in case already loaded
        void tryPlay();

        return () => {
            el.removeEventListener("loadedmetadata", onLoaded);
            // ไม่ต้อง clear srcObject ที่นี่ก็ได้ (react จะทิ้ง element เอง)
        };
    }, [stream]);

    return (
        <div className="relative bg-black rounded-xl overflow-hidden">
            <video
                ref={ref}
                autoPlay
                playsInline
                // สำหรับ remote อย่า mute ถ้าอยากได้ยินเสียงตั้งแต่แรก
                // แต่ถ้า autoplay มีปัญหา อาจต้องตั้ง mute=true แล้วเปิดเสียงด้วย UI หลังจากนั้น
                className="w-full h-full aspect-video object-cover"
            />
            <div className="absolute bottom-1 left-2 text-xs bg-black/50 text-white px-2 py-0.5 rounded">
                {peerId}
            </div>
        </div>
    );
}
