"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useProject } from "@/context/ProjectContext";
import { Loader2 } from "lucide-react";

export default function EstimateRedirectPage() {
  const router = useRouter();
  const { projectId, isHydrated } = useProject();

  useEffect(() => {
    if (!isHydrated) return;

    if (projectId) {
      router.replace(`/project/${projectId}/estimate`);
    } else {
      router.replace("/");
    }
  }, [isHydrated, projectId, router]);

  return (
    <div className="w-screen h-screen flex flex-col items-center justify-center bg-[#0A0B0E] text-[#9E9C98]">
      <Loader2 className="w-6 h-6 animate-spin text-[#C48446] mb-3" />
      <span className="text-xs font-mono tracking-widest uppercase">Directing to Estimate...</span>
    </div>
  );
}
