"use client";

import React, { useState, useEffect, useCallback, Suspense } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { HouseLayout, IntakeRequest } from "@/types/house";
import { FloatingNav, NavView } from "@/components/FloatingNav";
import { FloatingAICommandBar } from "@/components/FloatingAICommandBar";
import { GenerationProgressModal } from "@/components/GenerationProgressModal";
import { UploadModal } from "@/components/UploadModal";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { VastuAuditModal } from "@/components/VastuAuditModal";
import { CreateChoiceModal } from "@/components/CreateChoiceModal";
import { ProjectsModal } from "@/components/ProjectsModal";
import { EditProgressPanel } from "@/components/EditProgressPanel";
import { useProject } from "@/context/ProjectContext";
import { validateAndSanitizeHouseLayout, validateAndSanitizeHouseLayoutDetailed } from "@/utils/layoutValidator";
import { generateHouseLayout, refineHouseLayout, editRoomLayout, applyProjectEdit, EditStage } from "@/utils/api";
import { Loader2 } from "lucide-react";

// ── Code-split heavy components (3D only loads on MODEL tab) ──
const FloorPlan2D = dynamic(
  () => import("@/components/FloorPlan2D").then((m) => m.FloorPlan2D),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex flex-col items-center justify-center bg-[#0A0B0E] text-[#9E9C98]">
        <Loader2 className="w-8 h-8 animate-spin text-[#C48446] mb-3" />
        <span className="text-xs font-mono tracking-widest uppercase">Loading 2D Blueprint…</span>
      </div>
    ),
  }
);

// 3D loads ONLY when user enters MODEL — never on PLAN
const Dollhouse3D = dynamic(
  () => import("@/components/Dollhouse3D").then((m) => m.Dollhouse3D),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex flex-col items-center justify-center bg-[#0A0B0E] text-[#9E9C98]">
        <Loader2 className="w-8 h-8 animate-spin text-[#C48446] mb-3" />
        <span className="text-xs font-mono tracking-widest uppercase">Initialising 3D Model…</span>
      </div>
    ),
  }
);

const EstimateView = dynamic(
  () => import("@/components/EstimateView").then((m) => m.EstimateView),
  { ssr: false, loading: () => <div className="w-full h-full bg-[#0A0B0E]" /> }
);

const StructureView = dynamic(
  () => import("@/components/StructureView").then((m) => m.StructureView),
  { ssr: false, loading: () => <div className="w-full h-full bg-[#0A0B0E]" /> }
);

const ArchitecturalConsultation = dynamic(
  () => import("@/components/ArchitecturalConsultation").then((m) => m.ArchitecturalConsultation),
  { ssr: false }
);

const DreamHomeConsultationModal = dynamic(
  () => import("@/components/DreamHomeConsultationModal").then((m) => m.DreamHomeConsultationModal),
  { ssr: false }
);

// ── Allowed tab types ──
type WorkspaceTab = "plan" | "model" | "structure" | "estimate";

interface ProjectWorkspaceProps {
  projectId: string;
  initialTab?: WorkspaceTab;
}

// ============================================================
// COMPONENT
// ============================================================
export const ProjectWorkspace: React.FC<ProjectWorkspaceProps> = ({
  projectId,
  initialTab = "plan",
}) => {
  const router = useRouter();
  const {
    activeProject,
    loadProject,
    updateProject,
    createProject,
    isHydrated,
  } = useProject();

  // ── Layout state ── synchronously hydrated from cache for 0ms transition
  const [layout, setLayout] = useState<HouseLayout | null>(() => {
    if (activeProject && activeProject.id === projectId) return activeProject;
    if (typeof window !== "undefined") {
      try {
        const cached = localStorage.getItem("atelier_archai_proj_" + projectId);
        if (cached) return JSON.parse(cached);
        const saved = localStorage.getItem("atelier_archai_saved_layout");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && (parsed.id === projectId || parsed.project_id === projectId)) return parsed;
        }
      } catch (_) {}
    }
    return null;
  });

  const [isLoadingProject, setIsLoadingProject] = useState(!layout);
  const [currentTab, setCurrentTab] = useState<WorkspaceTab>(initialTab);

  // ── Floor & selection state (synced 2D ↔ 3D) ──
  const [activeFloorIndex, setActiveFloorIndex] = useState(0);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [selectedFurnitureId, setSelectedFurnitureId] = useState<string | null>(null);

  // ── 3D state ──
  const [lightingPreset, setLightingPreset] = useState<"day" | "sunset" | "night" | "studio">("day");
  const [cameraPreset, setCameraPreset] = useState<"isometric" | "perspective" | "interior" | "top" | "front">("isometric");
  const [wallHeightMode, setWallHeightMode] = useState<"cutaway" | "full">("cutaway");
  const [showRoof, setShowRoof] = useState(true);

  // ── Modal states ──
  const [isCreateChoiceOpen, setIsCreateChoiceOpen] = useState(false);
  const [isConsultationOpen, setIsConsultationOpen] = useState(false);
  const [isDreamHomeOpen, setIsDreamHomeOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isProjectsOpen, setIsProjectsOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isVastuAuditOpen, setIsVastuAuditOpen] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [planEditMode, setPlanEditMode] = useState<"view" | "edit">("view");

  // ── Edit progress state ──
  const [isRefining, setIsRefining] = useState(false);
  const [editStages, setEditStages] = useState<EditStage[]>([]);
  const [editDone, setEditDone] = useState(false);
  const [editRejectionReason, setEditRejectionReason] = useState<string | null>(null);
  const [lastInstruction, setLastInstruction] = useState("");

  // ── Sync layout from activeProject ──
  useEffect(() => {
    if (
      activeProject &&
      (activeProject.id === projectId || activeProject.project_id === projectId)
    ) {
      setLayout(activeProject);
      setIsLoadingProject(false);
    }
  }, [activeProject, projectId]);

  // ── Load project on mount / id change — NEVER regenerate ──
  useEffect(() => {
    if (!isHydrated) return;
    let mounted = true;

    const fetchLayout = async () => {
      if (layout && (layout.id === projectId || layout.project_id === projectId)) {
        setIsLoadingProject(false);
        return;
      }
      setIsLoadingProject(true);
      const loaded = await loadProject(projectId);
      if (mounted) {
        if (loaded) {
          setLayout(loaded);
          setIsLoadingProject(false);
        } else {
          router.replace("/");
        }
      }
    };

    fetchLayout();
    return () => { mounted = false; };
  }, [isHydrated, projectId]);  // intentionally omit layout/loadProject to avoid re-runs

  // ── Navigation ──
  const handleNavigate = useCallback(
    (view: NavView) => {
      if (view === "home") {
        router.push("/");
      } else if (view === "create") {
        setIsCreateChoiceOpen(true);
      } else if (view === "projects") {
        setIsProjectsOpen(true);
      } else if (
        view === "plan" ||
        view === "model" ||
        view === "structure" ||
        view === "estimate"
      ) {
        setCurrentTab(view);
        router.push(`/project/${projectId}/${view}`);
      }
    },
    [router, projectId]
  );

  // ── Update canonical layout ──
  const handleUpdateLayout = useCallback(
    (newLayout: HouseLayout) => {
      const sanitized = validateAndSanitizeHouseLayout(newLayout) || newLayout;
      setLayout(sanitized);
      setSelectedRoomId(null);
      setSelectedFurnitureId(null);
      updateProject(sanitized);
      // 3D model will automatically refresh when MODEL tab is opened due to layout prop change
    },
    [updateProject]
  );

  // ── Generate new project from consultation ──
  const handleStartGeneration = async (req: IntakeRequest) => {
    setIsConsultationOpen(false);
    setIsGenerating(true);
    setGenerationError(null);

    try {
      const rawData = await generateHouseLayout(req);

      if (!rawData || !rawData.rooms || rawData.rooms.length === 0) {
        const valErrors = (rawData as any)?.validation?.errors;
        const rationale = (rawData as any)?.designer_rationale;
        throw new Error(
          valErrors?.length
            ? valErrors.join("\n")
            : rationale || "The requested room program exceeds the buildable envelope."
        );
      }

      const sanitized = validateAndSanitizeHouseLayout(rawData);
      if (!sanitized) {
        const detailed = validateAndSanitizeHouseLayoutDetailed(rawData);
        throw new Error(detailed.errors?.[0] || "Received an unrenderable layout from solver.");
      }

      setIsGenerating(false);
      const newPid = createProject(sanitized);
      router.push(`/project/${newPid}/plan`);
    } catch (err) {
      setIsGenerating(false);
      setGenerationError(err instanceof Error ? err.message : "Failed to synthesize design.");
    }
  };

  // ── Upload floor plan ──
  const handleUploadSuccess = (uploadedLayout: HouseLayout) => {
    const sanitized = validateAndSanitizeHouseLayout(uploadedLayout) || uploadedLayout;
    const newPid = createProject(sanitized);
    setIsUploadOpen(false);
    router.push(`/project/${newPid}/plan`);
  };

  // ── Drag/resize rooms → edit-room API ──
  const handleRegenerateFromEdit = async (updatedRooms: any[]) => {
    if (!layout) return;
    setIsRefining(true);
    try {
      let current = layout;
      const floorRooms =
        layout.floors?.[activeFloorIndex]?.rooms || layout.rooms || [];

      const modified = updatedRooms.filter((r) => {
        const orig = floorRooms.find((o) => o.id === r.id);
        return orig?.rect && (
          orig.rect.x !== r.rect?.x ||
          orig.rect.y !== r.rect?.y ||
          orig.rect.width !== r.rect?.width ||
          orig.rect.length !== r.rect?.length
        );
      });

      for (const modRoom of modified) {
        const updated = await editRoomLayout(current, modRoom.id, modRoom.rect!);
        if (updated) current = updated;
      }
      handleUpdateLayout(current);
    } catch (err) {
      console.error("Edit rooms error:", err);
    } finally {
      setIsRefining(false);
    }
  };

  // ── AI natural language edit via new /projects/{id}/edit endpoint ──
  const handleApplyInstruction = useCallback(
    async (instruction: string) => {
      if (!layout || isRefining) return;

      setIsRefining(true);
      setEditDone(false);
      setEditRejectionReason(null);
      setEditStages([]);
      setLastInstruction(instruction);

      try {
        const result = await applyProjectEdit(projectId, {
          edit_instruction: instruction,
          current_layout: layout,
          target_room_id: selectedRoomId || undefined,
        });

        setEditStages(result.stages || []);

        if (result.status === "rejected") {
          setEditRejectionReason(result.reason || "That change could not be applied.");
          setEditDone(true);
        } else if (result.layout) {
          const sanitized = validateAndSanitizeHouseLayout(result.layout) || result.layout;
          handleUpdateLayout(sanitized);
          setEditDone(true);
        }
      } catch (err) {
        setEditRejectionReason(
          err instanceof Error ? err.message : "Edit could not be applied."
        );
        setEditDone(true);
        // Fallback to old refine endpoint
        try {
          const fallback = await refineHouseLayout(layout, instruction, selectedRoomId);
          if (fallback) handleUpdateLayout(fallback);
        } catch (_) {}
      } finally {
        setIsRefining(false);
      }
    },
    [layout, projectId, selectedRoomId, isRefining, handleUpdateLayout]
  );

  const selectedRoom = selectedRoomId
    ? layout?.rooms?.find((r) => r.id === selectedRoomId) ||
      layout?.floors?.flatMap((f) => f.rooms).find((r) => r.id === selectedRoomId)
    : undefined;

  // ─────────────────────────────────────────────────────────
  // LOADING STATE
  // ─────────────────────────────────────────────────────────
  if (isLoadingProject || !layout) {
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-[#0A0B0E] text-[#F5F3EF]">
        <Loader2 className="w-6 h-6 animate-spin text-[#C48446] mb-3" />
        <span className="text-xs font-mono tracking-widest uppercase">Opening Studio…</span>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────
  // MAIN RENDER
  // ─────────────────────────────────────────────────────────
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0A0B0E] text-[#F5F3EF]">

      {/* ── Floating Nav ── */}
      {!isConsultationOpen && (
        <FloatingNav
          currentView={currentTab}
          onNavigate={handleNavigate}
          isProjectWorkspace
          hasProject
          onOpenVastuAudit={() => setIsVastuAuditOpen(true)}
          hasVastuResult={Boolean(layout?.scores?.vastu_result)}
          isPlanEditMode={planEditMode === "edit"}
          onTogglePlanEditMode={() =>
            setPlanEditMode((mode) => (mode === "view" ? "edit" : "view"))
          }
        />
      )}

      {/* ── Optimization notice pill ── */}
      {!isConsultationOpen && Boolean((layout as any)?.metadata?.optimization_note) && (
        <div className="fixed top-14 sm:top-[70px] left-1/2 -translate-x-1/2 z-40 pointer-events-none">
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#12141A]/95 text-amber-200 border border-amber-500/30 text-[11px] font-mono shadow-2xl backdrop-blur-md max-w-[calc(100vw-32px)]">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
            <span className="truncate">{String((layout as any)?.metadata?.optimization_note)}</span>
          </div>
        </div>
      )}

      {/* ── Main viewport ── */}
      <main className="w-full h-full relative overflow-hidden">
        <AnimatePresence mode="wait">

          {/* ── 1. PLAN (2D only — 3D never loaded here) ── */}
          {currentTab === "plan" && (
            <motion.div
              key="view-plan"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="w-full h-full relative"
            >
              <ErrorBoundary
                componentName="2D Blueprint Editor"
                fallbackMessage="The 2D architectural blueprint renderer encountered an issue."
              >
                <FloorPlan2D
                  layout={layout}
                  activeFloorIndex={activeFloorIndex}
                  onSelectFloor={setActiveFloorIndex}
                  selectedRoomId={selectedRoomId}
                  selectedFurnitureId={selectedFurnitureId}
                  onSelectRoom={(id) => {
                    setSelectedRoomId(id);
                    if (id) setSelectedFurnitureId(null);
                  }}
                  onSelectFurniture={(id) => setSelectedFurnitureId(id)}
                  onRegenerateLayout={handleRegenerateFromEdit}
                  isRegenerating={isRefining}
                  isDarkMode
                  mode={planEditMode}
                  onUpdateLayout={handleUpdateLayout}
                  onSave={handleUpdateLayout}
                />
              </ErrorBoundary>
            </motion.div>
          )}

          {/* ── 2. MODEL (3D — loaded lazily only when this tab is active) ── */}
          {currentTab === "model" && (
            <motion.div
              key="view-model"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="w-full h-full relative"
            >
              <ErrorBoundary
                componentName="3D Dollhouse Visualizer"
                fallbackMessage="The 3D WebGL renderer encountered an unexpected issue."
                onFallbackTo2D={() => handleNavigate("plan")}
              >
                <Dollhouse3D
                  layout={layout}
                  activeFloorIndex={activeFloorIndex}
                  onSelectFloor={setActiveFloorIndex}
                  selectedRoomId={selectedRoomId}
                  selectedFurnitureId={selectedFurnitureId}
                  onSelectRoom={(id) => {
                    setSelectedRoomId(id);
                    if (id) setSelectedFurnitureId(null);
                  }}
                  onSelectFurniture={(id) => setSelectedFurnitureId(id)}
                  isDarkMode={false}
                  lightingPreset={lightingPreset}
                  onChangeLightingPreset={setLightingPreset}
                  cameraPreset={cameraPreset}
                  onChangeCameraPreset={setCameraPreset}
                  wallHeightMode={wallHeightMode}
                  onToggleWallHeightMode={() =>
                    setWallHeightMode((m) => (m === "cutaway" ? "full" : "cutaway"))
                  }
                  showRoof={showRoof}
                  onToggleRoof={() => setShowRoof((r) => !r)}
                  onUpdateLayout={handleUpdateLayout}
                  hasNotification={Boolean((layout as any)?.metadata?.optimization_note)}
                />
              </ErrorBoundary>
            </motion.div>
          )}

          {/* ── 3. STRUCTURE ── */}
          {currentTab === "structure" && (
            <motion.div
              key="view-structure"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="w-full h-full relative"
            >
              <ErrorBoundary componentName="Structure View">
                <StructureView
                  layout={layout}
                  activeFloorIndex={activeFloorIndex}
                  onSelectFloor={setActiveFloorIndex}
                />
              </ErrorBoundary>
            </motion.div>
          )}

          {/* ── 4. ESTIMATE ── */}
          {currentTab === "estimate" && (
            <motion.div
              key="view-estimate"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="w-full h-full relative"
            >
              <ErrorBoundary componentName="Estimate View">
                <EstimateView layout={layout} />
              </ErrorBoundary>
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* ── Floating AI Command Bar (plan & model only) ── */}
      {(currentTab === "plan" || currentTab === "model") && !isConsultationOpen && (
        <FloatingAICommandBar
          onApplyInstruction={handleApplyInstruction}
          isLoading={isRefining}
          selectedRoomName={selectedRoom?.name}
          selectedRoomId={selectedRoomId}
        />
      )}

      {/* ── Edit Progress Panel ── */}
      <EditProgressPanel
        isOpen={isRefining || editDone}
        completedStages={editStages}
        isDone={editDone}
        rejectionReason={editRejectionReason}
        instruction={lastInstruction}
        onClose={() => {
          setEditDone(false);
          setEditStages([]);
          setEditRejectionReason(null);
        }}
      />

      {/* ── Modals ── */}
      <CreateChoiceModal
        isOpen={isCreateChoiceOpen}
        onClose={() => setIsCreateChoiceOpen(false)}
        onSelectDesignNew={() => { setIsCreateChoiceOpen(false); setIsConsultationOpen(true); }}
        onSelectUploadPlan={() => { setIsCreateChoiceOpen(false); setIsUploadOpen(true); }}
        onSelectDreamHome={() => { setIsCreateChoiceOpen(false); setIsDreamHomeOpen(true); }}
      />

      <DreamHomeConsultationModal
        isOpen={isDreamHomeOpen}
        onClose={() => setIsDreamHomeOpen(false)}
        onSuccess={handleUploadSuccess}
      />

      {isConsultationOpen && (
        <div className="fixed inset-0 z-50 bg-[#0A0B0E]">
          <ArchitecturalConsultation
            onClose={() => setIsConsultationOpen(false)}
            onSubmit={handleStartGeneration}
            initialPlotWidth={layout?.plot_width || 40}
            initialPlotLength={layout?.plot_length || 50}
          />
        </div>
      )}

      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onSuccess={handleUploadSuccess}
        isDarkMode
      />

      <ProjectsModal
        isOpen={isProjectsOpen}
        onClose={() => setIsProjectsOpen(false)}
        onSelectProject={(pid) => { router.push(`/project/${pid}/plan`); }}
        onStartNew={() => { setIsProjectsOpen(false); setIsCreateChoiceOpen(true); }}
      />

      <GenerationProgressModal
        key={isGenerating ? "generating" : "idle"}
        isOpen={isGenerating}
      />

      {layout?.scores?.vastu_result && (
        <VastuAuditModal
          isOpen={isVastuAuditOpen}
          onClose={() => setIsVastuAuditOpen(false)}
          vastuResult={layout.scores.vastu_result}
        />
      )}

      {/* ── Generation error ── */}
      {generationError && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
          <div className="bg-[#14161C] border border-red-500/40 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-semibold text-white">Generation Notice</h3>
            <p className="text-xs text-[#A0A5B5] leading-relaxed">{generationError}</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setGenerationError(null)}
                className="px-4 py-2 text-xs uppercase tracking-wider text-[#F5F3EF]/70 border border-white/10 rounded-lg"
              >
                Close
              </button>
              <button
                onClick={() => { setGenerationError(null); setIsConsultationOpen(true); }}
                className="px-4 py-2 text-xs uppercase tracking-wider bg-amber-500 text-black font-semibold rounded-lg"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
