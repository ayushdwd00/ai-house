"use client";

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useProject } from "@/context/ProjectContext";
import { Loader2 } from "lucide-react";

function PlanRedirectInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryId = searchParams.get("id") || searchParams.get("projectId");
  const { projectId, isHydrated } = useProject();

  useEffect(() => {
    if (!isHydrated) return;

    const targetId = queryId || projectId;
    if (targetId) {
      router.replace(`/project/${targetId}/plan`);
    } else {
      router.replace("/");
    }
  }, [isHydrated, queryId, projectId, router]);

  return (
    <div className="w-screen h-screen flex flex-col items-center justify-center bg-[#0A0B0E] text-[#9E9C98]">
      <Loader2 className="w-6 h-6 animate-spin text-[#C48446] mb-3" />
      <span className="text-xs font-mono tracking-widest uppercase">Directing to Blueprint...</span>
    </div>
  );
}

export default function PlanRedirectPage() {
  return (
    <Suspense
      fallback={
        <div className="w-screen h-screen flex flex-col items-center justify-center bg-[#0A0B0E] text-[#9E9C98]">
          <Loader2 className="w-6 h-6 animate-spin text-[#C48446] mb-3" />
          <span className="text-xs font-mono tracking-widest uppercase">Opening Architectural Plan...</span>
        </div>
      }
    >
      <PlanRedirectInner />
    </Suspense>
  );
}

