"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useProject } from "@/context/ProjectContext";
import { ArchitecturalPlanRenderer } from "@/components/ArchitecturalPlanRenderer";
import { HouseLayout } from "@/types/house";
import { Loader2 } from "lucide-react";
import { NavView } from "@/components/FloatingNav";
import { FloatingAICommandBar } from "@/components/FloatingAICommandBar";
import { applyProjectEdit, previewProjectEditIntent, saveProjectToServer } from "@/utils/api";
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
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [isApplyingAIEdit, setIsApplyingAIEdit] = useState(false);
  const [aiEditNotice, setAiEditNotice] = useState<string | null>(null);
  const handleLayoutUpdate = (updated: HouseLayout) => {
    const canonicalLayout = validateAndSanitizeHouseLayout(updated) || updated;
    setLayout(canonicalLayout);
    updateProject(canonicalLayout);
  };

  const handleApplyAIInstruction = async (instruction: string) => {
    if (!layout || isApplyingAIEdit) return;
    setIsApplyingAIEdit(true);
    setAiEditNotice(null);
    try {
      if (!await saveProjectToServer(layout)) {
        throw new Error("The current canonical layout could not be saved before editing.");
      }
      const preview = await previewProjectEditIntent(projectId, {
        edit_instruction: instruction,
        current_layout: layout,
        target_entity_id: selectedEntityId || undefined,
      });
      const operation = preview.intent.operation || preview.intent.action;
      setAiEditNotice(typeof operation === "string" ? `Applying ${operation.replaceAll("_", " ")}…` : "Applying architectural edit…");
      const result = await applyProjectEdit(projectId, {
        edit_instruction: instruction,
        current_layout: layout,
        target_entity_id: selectedEntityId || undefined,
      });
      if (result.status !== "ok" || !result.layout) {
        setAiEditNotice(result.reason || "That edit was rejected by architectural validation.");
        return;
      }
      handleLayoutUpdate(result.layout);
      setAiEditNotice("Design updated. Undo is available in the editor toolbar.");
    } catch (error) {
      setAiEditNotice(error instanceof Error ? error.message : "The edit could not be applied.");
    } finally {
      setIsApplyingAIEdit(false);
    }
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
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-[#ECEEF2] text-[#0F172A]">
        <div className="flex items-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-[#C48446]" />
          <span className="text-xs font-mono tracking-widest uppercase">
            Loading Architectural Editor...
          </span>
        </div>
      </div>
    );
  }

  if (!layout) {
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center gap-5 bg-[#ECEEF2] text-[#0F172A]">
        <p className="max-w-md px-6 text-center text-sm text-slate-600" role="alert">
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
            className="rounded-lg bg-[#C48446] px-4 py-2 text-xs font-semibold uppercase tracking-wider text-white"
          >
            Retry
          </button>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-700"
          >
            Back to Atelier
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-screen h-screen overflow-hidden bg-[#ECEEF2]">
      <ArchitecturalPlanRenderer
        layout={layout}
        mode="edit"
        activeFloorIndex={activeFloorIndex}
        onSelectFloor={setActiveFloorIndex}
        onSelectEntity={setSelectedEntityId}
        onUpdateLayout={handleLayoutUpdate}
        onSave={(saved) => {
          handleLayoutUpdate(saved);
        }}
        onBack={() => router.push(`/project/${projectId}/plan`)}
        showAtelierNav
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
      <FloatingAICommandBar
        onApplyInstruction={handleApplyAIInstruction}
        isLoading={isApplyingAIEdit}
      />
      {aiEditNotice && (
        <div
          role="status"
          className="fixed bottom-28 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-white/10 bg-[#0F1117]/95 px-4 py-2 text-xs text-[#F5F3EF] shadow-xl"
        >
          {aiEditNotice}
        </div>
      )}
    </div>
  );
};
