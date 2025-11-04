// src/components/meeting/MeetingControls.tsx
"use client";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useState } from "react";

export function MeetingControls({
    micEnabled,
    camEnabled,
    onToggleMic,
    onToggleCam,
    onShareScreen,
}: {
    micEnabled: boolean;
    camEnabled: boolean;
    onToggleMic: () => void;
    onToggleCam: () => void;
    onShareScreen: () => void;
}) {
    const [sharing, setSharing] = useState(false);
    return (
        <div className="flex items-center gap-4 p-3 rounded-2xl shadow-sm border">
            <div className="flex items-center gap-2">
                <span className="text-sm">Mic</span>
                <Switch checked={micEnabled} onCheckedChange={onToggleMic} />
            </div>
            <div className="flex items-center gap-2">
                <span className="text-sm">Cam</span>
                <Switch checked={camEnabled} onCheckedChange={onToggleCam} />
            </div>
            <Button
                variant="secondary"
                onClick={() => { setSharing(true); onShareScreen(); setTimeout(() => setSharing(false), 500); }}
            >
                {sharing ? "Sharing…" : "Share screen"}
            </Button>
        </div>
    );
}
