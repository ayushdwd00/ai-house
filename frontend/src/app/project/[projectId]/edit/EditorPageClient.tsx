"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useProject } from "@/context/ProjectContext";
import { ArchitecturalPlanRenderer } from "@/components/ArchitecturalPlanRenderer";
import { HouseLayout } from "@/types/house";
import { Loader2 } from "lucide-react";
import { NavView } from "@/components/FloatingNav";
import { validateAndSanitizeHouseLayout } from "@/utils/layoutValidator";

interface EditorPageClientProps {
  projectId: string;
}

export const EditorPageClient: React.FC<EditorPageClientProps> = ({ projectId }) => {
  const router = useRouter();
  const { activeProject, loadProject, updateProject, isHydrated } = useProject();
  const [layout, setLayout] = useState<HouseLayout | null>(activeProject);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeFloorIndex, setActiveFloorIndex] = useState(0);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const handleLayoutUpdate = (updated: HouseLayout) => {
    const canonicalLayout = validateAndSanitizeHouseLayout(updated) || updated;
    setLayout(canonicalLayout);
    updateProject(canonicalLayout);
  };

  useEffect(() => {
    if (!isHydrated) return;

    let isMounted = true;
    const timeoutId = window.setTimeout(() => {
      if (isMounted) {
        setLoadError("The project is taking too long to load. Check your connection and retry.");
        setLoading(false);
      }
    }, 12000);

    const resolveLayout = async () => {
      if (activeProject && activeProject.id === projectId) {
        setLayout(activeProject);
        setLoading(false);
        setLoadError(null);
        window.clearTimeout(timeoutId);
        return;
      }

      setLoading(true);
      setLoadError(null);
      try {
        const loaded = await loadProject(projectId);
        if (isMounted) {
          if (loaded) {
            setLayout(loaded);
            setLoading(false);
            setLoadError(null);
          } else {
            setLoadError("This project could not be found in saved projects.");
            setLoading(false);
          }
        }
      } catch (error) {
        if (isMounted) {
          setLoadError(error instanceof Error ? error.message : "Unable to load this project.");
          setLoading(false);
        }
      } finally {
        window.clearTimeout(timeoutId);
      }
    };

    void resolveLayout();
    return () => {
      isMounted = false;
      window.clearTimeout(timeoutId);
    };
  }, [isHydrated, projectId, activeProject, loadProject, loadAttempt]);

  if (loading || !isHydrated) {
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-[#07080A] text-[#F5F3EF]">
        <div className="flex items-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-[#C48446]" />
          <span className="text-xs font-mono tracking-widest uppercase">
            Loading Architectural CAD Workspace...
          </span>
        </div>
      </div>
    );
  }

  if (!layout) {
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center gap-5 bg-[#07080A] text-[#F5F3EF]">
        <p className="max-w-md px-6 text-center text-sm text-neutral-400" role="alert">
          {loadError || "This project could not be loaded."}
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setLoadError(null);
              setLoading(true);
              setLoadAttempt((attempt) => attempt + 1);
            }}
            className="rounded-lg bg-[#C48446] px-4 py-2 text-xs font-semibold uppercase tracking-wider text-white hover:bg-[#d69352] transition-colors"
          >
            Retry
          </button>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="rounded-lg border border-neutral-700 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-neutral-300 hover:bg-neutral-800 transition-colors"
          >
            Back to Atelier
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-full h-[100dvh] overflow-hidden bg-[#07080A]">
      <ArchitecturalPlanRenderer
        layout={layout}
        mode="edit"
        activeFloorIndex={activeFloorIndex}
        onSelectFloor={setActiveFloorIndex}
        onUpdateLayout={handleLayoutUpdate}
        onSave={(saved) => {
          handleLayoutUpdate(saved);
        }}
        onBack={() => router.push(`/project/${projectId}/plan`)}
        showAtelierNav={false}
        hasVastuResult={Boolean(layout.scores?.vastu_result)}
        onStudioNavigate={(view: NavView) => {
          if (view === "home" || view === "create") {
            router.push("/");
          } else {
            router.push(`/project/${projectId}/${view}`);
          }
        }}
        onToggleEditMode={() => router.push(`/project/${projectId}/plan`)}
        onOpenVastuAudit={() => router.push(`/project/${projectId}/plan`)}
      />
    </div>
  );
};
