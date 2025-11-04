// components/ui/sonner.tsx
"use client";

import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
    return (
        <SonnerToaster
            richColors
            closeButton
            expand
            position="top-right"
            // tweak as you like
            duration={3000}
        />
    );
}
