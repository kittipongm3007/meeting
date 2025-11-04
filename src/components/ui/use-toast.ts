// src/components/ui/use-toast.ts
"use client";

import { toast as sonner } from "sonner";

type Variant = "default" | "destructive";

type ToastOptions = {
  title?: string;
  description?: string;
  variant?: Variant;
  // shadcn-style action (optional)
  action?: {
    label: string;
    onClick: () => void;
  };
  // passthrough extras
  duration?: number;
  id?: string | number;
};

const show = (opts: ToastOptions) => {
  const message = opts.title ?? opts.description ?? "";
  const asError = opts.variant === "destructive";

  const fn = asError ? sonner.error : sonner; // success/info/warning: call directly if you like
  fn(message, {
    description:
      opts.title && opts.description ? opts.description : undefined,
    action: opts.action
      ? { label: opts.action.label, onClick: opts.action.onClick }
      : undefined,
    duration: opts.duration,
    id: opts.id,
  });
};

export const useToast = () => ({ toast: show });

// also allow: import { toast } from "@/components/ui/use-toast";
export const toast = Object.assign(show, {
  success: (m: string, o?: Omit<ToastOptions, "variant">) => sonner.success(m, o),
  error:   (m: string, o?: Omit<ToastOptions, "variant">) => sonner.error(m, o),
  info:    (m: string, o?: Omit<ToastOptions, "variant">) => sonner(m, o),
  warning: (m: string, o?: Omit<ToastOptions, "variant">) => sonner.warning?.(m, o) ?? sonner(m, o),
});
