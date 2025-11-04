"use client";

import { useEffect, useRef } from "react";

export function LocalVideoTile({ stream, label }: { stream: MediaStream | null; label: string }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (ref.current && stream) {
      ref.current.srcObject = stream;
      ref.current.muted = true;
      ref.current.play().catch(() => {});
    }
  }, [stream]);
  return (
    <div className="relative rounded-xl overflow-hidden border bg-black">
      <video ref={ref} playsInline autoPlay className="w-full h-64 object-cover" />
      <div className="absolute bottom-0 left-0 right-0 bg-black/40 text-white text-xs px-2 py-1">{label}</div>
    </div>
  );
}

export function RemoteVideoTile({ stream, label }: { stream: MediaStream; label: string }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.srcObject = stream;
      ref.current.play().catch(() => {});
    }
  }, [stream]);
  return (
    <div className="relative rounded-xl overflow-hidden border bg-black">
      <video ref={ref} playsInline autoPlay className="w-full h-64 object-cover" />
      <div className="absolute bottom-0 left-0 right-0 bg-black/40 text-white text-xs px-2 py-1">{label}</div>
    </div>
  );
}
