// src/hooks/useMediaDevices.ts
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { explainGetUserMediaError } from "@/lib/rtc/errors";

export type DeviceInfo = { deviceId: string; label: string };

export function useMediaDevices() {
    const [cams, setCams] = useState<DeviceInfo[]>([]);
    const [mics, setMics] = useState<DeviceInfo[]>([]);
    const [speakers, setSpeakers] = useState<DeviceInfo[]>([]); // บราวเซอร์หลายตัวยังจำกัด setSinkId

    const refresh = useCallback(async () => {
        if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return;
        const devices = await navigator.mediaDevices.enumerateDevices();
        setCams(devices.filter(d => d.kind === "videoinput").map(d => ({ deviceId: d.deviceId, label: d.label || "Camera" })));
        setMics(devices.filter(d => d.kind === "audioinput").map(d => ({ deviceId: d.deviceId, label: d.label || "Microphone" })));
        setSpeakers(devices.filter(d => d.kind === "audiooutput").map(d => ({ deviceId: d.deviceId, label: d.label || "Speaker" })));
    }, []);

    useEffect(() => {
        refresh();
        navigator.mediaDevices?.addEventListener?.("devicechange", refresh);
        return () => navigator.mediaDevices?.removeEventListener?.("devicechange", refresh);
    }, [refresh]);

    return { cams, mics, speakers, refresh };
}

export type LocalMediaState = {
    stream: MediaStream | null;
    micEnabled: boolean;
    camEnabled: boolean;
};

export function useLocalMedia() {
    const [state, setState] = useState<LocalMediaState>({ stream: null, micEnabled: true, camEnabled: true });
    const currentConstraints = useRef<MediaStreamConstraints | null>(null);

    const start = useCallback(async (opts?: { micId?: string; camId?: string; audio?: boolean; video?: boolean }) => {
        const audio = opts?.audio ?? true;
        const video = opts?.video ?? true;

        const constraints: MediaStreamConstraints = {
            audio: audio ? { deviceId: opts?.micId ? { exact: opts.micId } : undefined } : false,
            video: video ? { deviceId: opts?.camId ? { exact: opts.camId } : undefined, width: { ideal: 1280 }, height: { ideal: 720 } } : false,
        };
        currentConstraints.current = constraints;
        try {
            const s = await navigator.mediaDevices.getUserMedia(constraints);
            setState({ stream: s, micEnabled: !!audio, camEnabled: !!video });
            return s;
        } catch (err) {
            throw new Error(explainGetUserMediaError(err));
        }
    }, []);

    const stop = useCallback(() => {
        state.stream?.getTracks().forEach(t => t.stop());
        setState({ stream: null, micEnabled: true, camEnabled: true });
    }, [state.stream]);

    const toggleMic = useCallback((on?: boolean) => {
        const enabled = on ?? !state.micEnabled;
        state.stream?.getAudioTracks().forEach(t => (t.enabled = enabled));
        setState(s => ({ ...s, micEnabled: enabled }));
    }, [state.stream, state.micEnabled]);

    const toggleCam = useCallback((on?: boolean) => {
        const enabled = on ?? !state.camEnabled;
        state.stream?.getVideoTracks().forEach(t => (t.enabled = enabled));
        setState(s => ({ ...s, camEnabled: enabled }));
    }, [state.stream, state.camEnabled]);

    const switchMic = useCallback(async (deviceId: string) => {
        if (!currentConstraints.current) currentConstraints.current = { audio: true, video: true };
        const constraints = { ...currentConstraints.current, audio: { deviceId: { exact: deviceId } } as MediaTrackConstraints };
        const s = await navigator.mediaDevices.getUserMedia(constraints);
        // replace track
        const old = state.stream;
        old?.getAudioTracks().forEach(t => t.stop());
        old?.addTrack(s.getAudioTracks()[0]);
        setState(s0 => ({ ...s0, stream: old ?? s }));
    }, [state.stream]);

    const switchCam = useCallback(async (deviceId: string) => {
        if (!currentConstraints.current) currentConstraints.current = { audio: true, video: true };
        const constraints = { ...currentConstraints.current, video: { deviceId: { exact: deviceId } } as MediaTrackConstraints };
        const s = await navigator.mediaDevices.getUserMedia(constraints);
        const old = state.stream;
        old?.getVideoTracks().forEach(t => t.stop());
        old?.addTrack(s.getVideoTracks()[0]);
        setState(s0 => ({ ...s0, stream: old ?? s }));
    }, [state.stream]);

    const startScreenShare = useCallback(async () => {
        // @ts-ignore
        const display = await navigator.mediaDevices.getDisplayMedia?.({ video: true, audio: false });
        if (!display) return null;
        return display as MediaStream;
    }, []);

    return { state, start, stop, toggleMic, toggleCam, switchMic, switchCam, startScreenShare };
}
