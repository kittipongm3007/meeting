"use client";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Monitor, MonitorUp, Mic, MicOff, Video, VideoOff, Settings, LogOut } from "lucide-react";
import { useEffect } from "react";

type Device = { deviceId: string; label: string };

export default function MeetingToolbar({
    micEnabled,
    camEnabled,
    cams,
    mics,
    onToggleMic,
    onToggleCam,
    onShareScreen,
    onSelectCam,
    onSelectMic,
    onLeave,
    connLabel, // "Connected" | "Connecting" | "Disconnected"
}: {
    micEnabled: boolean;
    camEnabled: boolean;
    cams: Device[];
    mics: Device[];
    onToggleMic: () => void;
    onToggleCam: () => void;
    onShareScreen: () => void;
    onSelectCam: (id: string) => void;
    onSelectMic: (id: string) => void;
    onLeave: () => void;
    connLabel?: string;
}) {
    // คีย์ลัดพื้นฐาน
    useEffect(() => {
        const h = (e: KeyboardEvent) => {
            if (e.target && (e.target as HTMLElement).tagName === "INPUT") return;
            if (e.key.toLowerCase() === "m") onToggleMic();
            if (e.key.toLowerCase() === "v") onToggleCam();
            if (e.key.toLowerCase() === "s") onShareScreen();
        };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onToggleMic, onToggleCam, onShareScreen]);

    return (
        <TooltipProvider delayDuration={100}>
            <div className="flex items-center gap-2 p-2 rounded-2xl border shadow-sm bg-background/60 backdrop-blur">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant={micEnabled ? "default" : "destructive"}
                            onClick={onToggleMic}
                            className="rounded-2xl"
                        >
                            {micEnabled ? <Mic className="w-4 h-4 mr-2" /> : <MicOff className="w-4 h-4 mr-2" />}
                            {micEnabled ? "Mic On (M)" : "Mic Off (M)"}
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>กด M เพื่อเปิด/ปิดไมค์</TooltipContent>
                </Tooltip>

                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant={camEnabled ? "default" : "secondary"}
                            onClick={onToggleCam}
                            className="rounded-2xl"
                        >
                            {camEnabled ? <Video className="w-4 h-4 mr-2" /> : <VideoOff className="w-4 h-4 mr-2" />}
                            {camEnabled ? "Cam On (V)" : "Cam Off (V)"}
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>กด V เพื่อเปิด/ปิดกล้อง</TooltipContent>
                </Tooltip>

                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="secondary" onClick={onShareScreen} className="rounded-2xl">
                            <MonitorUp className="w-4 h-4 mr-2" />
                            Share (S)
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>แชร์หน้าจอ</TooltipContent>
                </Tooltip>

                <div className="w-px h-6 bg-border mx-1" />

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="rounded-2xl">
                            <Settings className="w-4 h-4 mr-2" />
                            Devices
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="min-w-[16rem]">
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Camera</div>
                        {cams.length === 0 && <DropdownMenuItem disabled>No camera</DropdownMenuItem>}
                        {cams.map((c) => (
                            <DropdownMenuItem key={c.deviceId} onClick={() => onSelectCam(c.deviceId)}>
                                <Video className="w-3.5 h-3.5 mr-2" />
                                {c.label || "Camera"}
                            </DropdownMenuItem>
                        ))}
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground mt-1">Microphone</div>
                        {mics.length === 0 && <DropdownMenuItem disabled>No microphone</DropdownMenuItem>}
                        {mics.map((m) => (
                            <DropdownMenuItem key={m.deviceId} onClick={() => onSelectMic(m.deviceId)}>
                                <Mic className="w-3.5 h-3.5 mr-2" />
                                {m.label || "Microphone"}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>

                <div className="w-px h-6 bg-border mx-1" />

                <Badge variant={connLabel === "Connected" ? "default" : connLabel === "Connecting" ? "secondary" : "destructive"}>
                    <Monitor className="w-3.5 h-3.5 mr-1" />
                    {connLabel ?? "Connected"}
                </Badge>

                <div className="w-px h-6 bg-border mx-1" />

                <Button variant="destructive" className="rounded-2xl" onClick={onLeave}>
                    <LogOut className="w-4 h-4 mr-2" />
                    Leave
                </Button>
            </div>
        </TooltipProvider>
    );
}
