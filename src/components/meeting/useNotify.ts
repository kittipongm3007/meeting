"use client";

import { useToast } from "@/components/ui/use-toast";

export default function useNotify() {
    const { toast } = useToast();
    return (title: string, description?: string) =>
        toast({ title, description, duration: 2000 });
}
