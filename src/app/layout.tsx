// src/app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export const metadata: Metadata = {
  title: "Meeting",
  description: "Next.js + tRPC + WebRTC",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body className="min-h-screen">
        <Providers>
          <TooltipProvider>{children}</TooltipProvider>
        </Providers>
        <Toaster />
      </body>
    </html>
  );
}
