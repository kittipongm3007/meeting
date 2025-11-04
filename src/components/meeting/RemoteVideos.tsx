// src/components/meeting/RemoteVideos.tsx
"use client";
import * as React from "react";

export default function RemoteVideos({
    remoteStreams,
}: {
    remoteStreams: Record<string, MediaStream>;
}) {
    return (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {Object.entries(remoteStreams).map(([peerId, stream]) => (
                <video
                    key={peerId}
                    ref={(el) => {
                        if (!el) return;
                        if (el.srcObject !== stream) el.srcObject = stream;
                        el.play().catch(() => {}); // กัน autoplay block
                    }}
                    autoPlay
                    playsInline
                    muted={false}
                    className="w-full bg-black rounded"
                />
            ))}
        </div>
    );
}
