"use client";

import React, { useState, useEffect, Suspense } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { HouseLayout, IntakeRequest, Room } from "@/types/house";
import { FloatingNav, NavView } from "@/components/FloatingNav";
import { FloatingAICommandBar } from "@/components/FloatingAICommandBar";
import { GenerationProgressModal } from "@/components/GenerationProgressModal";
import { UploadModal } from "@/components/UploadModal";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { VastuAuditModal } from "@/components/VastuAuditModal";
import { CreateChoiceModal } from "@/components/CreateChoiceModal";
import { ProjectsModal } from "@/components/ProjectsModal";
import { useProject } from "@/context/ProjectContext";
import { validateAndSanitizeHouseLayout, validateAndSanitizeHouseLayoutDetailed } from "@/utils/layoutValidator";
import { generateHouseLayout, refineHouseLayout, editRoomLayout } from "@/utils/api";
import { Loader2 } from "lucide-react";

// Code splitting: Heavy visualizers loaded dynamically with ssr: false
const FloorPlan2D = dynamic(
  () => import("@/components/FloorPlan2D").then((m) => m.FloorPlan2D),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex flex-col items-center justify-center bg-[#0A0B0E] text-[#9E9C98]">
        <Loader2 className="w-8 h-8 animate-spin text-[#C48446] mb-3" />
        <span className="text-xs font-mono tracking-widest uppercase">Loading 2D Blueprint Engine...</span>
      </div>
    ),
  }
);

const Dollhouse3D = dynamic(
  () => import("@/components/Dollhouse3D").then((m) => m.Dollhouse3D),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex flex-col items-center justify-center bg-[#0A0B0E] text-[#9E9C98]">
        <Loader2 className="w-8 h-8 animate-spin text-[#C48446] mb-3" />
        <span className="text-xs font-mono tracking-widest uppercase">Initializing 3D Architectural Model...</span>
      </div>
    ),
  }
);

const EstimateView = dynamic(
  () => import("@/components/EstimateView").then((m) => m.EstimateView),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex flex-col items-center justify-center bg-[#0A0B0E] text-[#9E9C98]">
        <Loader2 className="w-8 h-8 animate-spin text-[#C48446] mb-3" />
        <span className="text-xs font-mono tracking-widest uppercase">Calculating Material Quantities...</span>
      </div>
    ),
  }
);

const StructureView = dynamic(
  () => import("@/components/StructureView").then((m) => m.StructureView),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex flex-col items-center justify-center bg-[#0A0B0E] text-[#9E9C98]">
        <Loader2 className="w-8 h-8 animate-spin text-[#C48446] mb-3" />
        <span className="text-xs font-mono tracking-widest uppercase">Analyzing Structural Grid & Columns...</span>
      </div>
    ),
  }
);

const ArchitecturalConsultation = dynamic(
  () => import("@/components/ArchitecturalConsultation").then((m) => m.ArchitecturalConsultation),
  { ssr: false }
);

const DreamHomeConsultationModal = dynamic(
  () => import("@/components/DreamHomeConsultationModal").then((m) => m.DreamHomeConsultationModal),
  { ssr: false }
);

interface ProjectWorkspaceProps {
  projectId: string;
  initialTab?: "plan" | "model" | "structure" | "estimate";
}

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

  // Synchronously initialize layout from activeProject or localStorage cache for 0ms transition
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

  // Active Floor & Selection (Synchronized across 2D & 3D)
  const [activeFloorIndex, setActiveFloorIndex] = useState(0);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [selectedFurnitureId, setSelectedFurnitureId] = useState<string | null>(null);

  // 3D Visualizer Settings
  const [lightingPreset, setLightingPreset] = useState<"day" | "sunset" | "night" | "studio">("day");
  const [cameraPreset, setCameraPreset] = useState<"isometric" | "perspective" | "interior" | "top" | "front">("isometric");
  const [wallHeightMode, setWallHeightMode] = useState<"cutaway" | "full">("cutaway");
  const [showRoof, setShowRoof] = useState(false);

  // Modals & Async States
  const [isCreateChoiceOpen, setIsCreateChoiceOpen] = useState(false);
  const [isConsultationOpen, setIsConsultationOpen] = useState(false);
  const [isDreamHomeOpen, setIsDreamHomeOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isProjectsOpen, setIsProjectsOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [isVastuAuditOpen, setIsVastuAuditOpen] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // Keep layout synchronized with activeProject
  useEffect(() => {
    if (activeProject && (activeProject.id === projectId || activeProject.project_id === projectId)) {
      setLayout(activeProject);
      setIsLoadingProject(false);
    }
  }, [activeProject, projectId]);

  // Load project on mount or when id changes
  useEffect(() => {
    if (!isHydrated) return;

    let mounted = true;
    const fetchLayout = async () => {
      // If matching layout is already loaded, ensure loading is cleared
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
          // Direct Route Protection: redirect to Home only if project cannot be found anywhere
          router.replace("/");
        }
      }
    };

    fetchLayout();
    return () => {
      mounted = false;
    };
  }, [isHydrated, projectId, loadProject, router]);

  // Sync tab with URL
  const handleNavigate = (view: NavView) => {
    if (view === "home") {
      router.push("/");
    } else if (view === "create") {
      setIsCreateChoiceOpen(true);
    } else if (view === "projects") {
      setIsProjectsOpen(true);
    } else if (view === "edit") {
      router.push(`/project/${projectId}/edit`);
    } else if (view === "plan" || view === "model" || view === "structure" || view === "estimate") {
      setCurrentTab(view);
      router.push(`/project/${projectId}/${view}`);
    }
  };

  const handleUpdateLayout = (newLayout: HouseLayout) => {
    const sanitized = validateAndSanitizeHouseLayout(newLayout) || newLayout;
    setLayout(sanitized);
    setSelectedRoomId(null);
    setSelectedFurnitureId(null);
    updateProject(sanitized);
  };

  // Start Generation from consultation
  const handleStartGeneration = async (req: IntakeRequest) => {
    setIsConsultationOpen(false);
    setIsGenerating(true);
    setGenerationError(null);

    try {
      const rawData = await generateHouseLayout(req);

      if (!rawData || !rawData.rooms || rawData.rooms.length === 0) {
        const valErrors = (rawData as any)?.validation?.errors;
        const rationale = (rawData as any)?.designer_rationale;
        const msg = (valErrors && valErrors.length > 0)
          ? valErrors.join("\n")
          : (rationale || "The requested room program exceeds the buildable envelope of the plot.");
        throw new Error(msg);
      }

      const sanitized = validateAndSanitizeHouseLayout(rawData);
      if (!sanitized) {
        const detailed = validateAndSanitizeHouseLayoutDetailed(rawData);
        const reason = detailed.errors?.[0] || "Received an unrenderable architectural layout from solver.";
        throw new Error(reason);
      }

      setIsGenerating(false);
      const newPid = createProject(sanitized);
      router.push(`/project/${newPid}/plan`);
    } catch (err) {
      console.error("Backend generation error:", err);
      setIsGenerating(false);
      setGenerationError(err instanceof Error ? err.message : "Failed to synthesize house design.");
    }
  };

  // Upload floor plan image callback
  const handleUploadSuccess = (uploadedLayout: HouseLayout) => {
    const sanitized = validateAndSanitizeHouseLayout(uploadedLayout) || uploadedLayout;
    const newPid = createProject(sanitized);
    setIsUploadOpen(false);
    router.push(`/project/${newPid}/plan`);
  };

  // Handle Dragged/Edited Rooms & Regenerate Wall Network
  const handleRegenerateFromEdit = async (updatedRooms: Room[]) => {
    if (!layout) return;
    setIsRefining(true);

    try {
      let currentLayout = layout;
      const currentFloorRooms =
        layout.floors && layout.floors[activeFloorIndex]
          ? layout.floors[activeFloorIndex].rooms
          : layout.rooms || [];

      const modified = updatedRooms.filter((r) => {
        const orig = currentFloorRooms.find((o) => o.id === r.id);
        if (!orig || !orig.rect) return false;
        return (
          orig.rect.x !== r.rect.x ||
          orig.rect.y !== r.rect.y ||
          orig.rect.width !== r.rect.width ||
          orig.rect.length !== r.rect.length
        );
      });

      for (const modRoom of modified) {
        const updated = await editRoomLayout(currentLayout, modRoom.id, modRoom.rect);
        if (updated) {
          currentLayout = updated;
        }
      }

      handleUpdateLayout(currentLayout);
    } catch (err) {
      console.error("Failed to regenerate layout from edited rooms:", err);
    } finally {
      setIsRefining(false);
    }
  };

  // Refine design via Floating AI Command Bar
  const handleRefine = async (instruction: string) => {
    if (!layout) return;
    setIsRefining(true);
    try {
      const data = await refineHouseLayout(layout, instruction, selectedRoomId);
      handleUpdateLayout(data);
    } catch (err) {
      console.error("Refinement error:", err);
    } finally {
      setIsRefining(false);
    }
  };

  const selectedRoom: Room | undefined = selectedRoomId
    ? layout?.rooms?.find((r) => r.id === selectedRoomId) ||
      layout?.floors?.flatMap((f) => f.rooms).find((r) => r.id === selectedRoomId)
    : undefined;

  if (isLoadingProject || !layout) {
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-[#0A0B0E] text-[#F5F3EF]">
        <div className="flex items-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-[#C48446]" />
          <span className="text-xs font-mono tracking-widest uppercase">Opening Studio Workspace...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0A0B0E] text-[#F5F3EF]">
      {/* FLOATING NAVIGATION (Shows PLAN | MODEL | ESTIMATE in workspace) */}
      {!isConsultationOpen && (
        <FloatingNav
          currentView={currentTab}
          onNavigate={handleNavigate}
          isProjectWorkspace={true}
          hasProject={true}
          onOpenVastuAudit={() => setIsVastuAuditOpen(true)}
          hasVastuResult={Boolean(layout?.scores?.vastu_result)}
        />
      )}

      {/* FLOATING ADAPTIVE OPTIMIZATION NOTICE */}
      {!isConsultationOpen && Boolean((layout as any)?.metadata?.optimization_note) && (
        <div className="fixed top-14 sm:top-[70px] left-1/2 -translate-x-1/2 z-40 pointer-events-none transition-all duration-200">
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#12141A]/95 text-amber-200 border border-amber-500/30 text-[11px] font-mono tracking-wide shadow-2xl backdrop-blur-md max-w-[calc(100vw-32px)]">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
            <span className="truncate">{String((layout as any)?.metadata?.optimization_note)}</span>
          </div>
        </div>
      )}

      {/* VIEWPORT CANVAS */}
      <main className="w-full h-full relative overflow-hidden">
        <AnimatePresence mode="wait">
          {/* 1. PLAN BLUEPRINT */}
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
                  isDarkMode={true}
                />
              </ErrorBoundary>
            </motion.div>
          )}

          {/* 2. 3D DOLLHOUSE MODEL */}
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

          {/* 3. STRUCTURE TECHNICAL ARCHITECTURE VIEW */}
          {currentTab === "structure" && (
            <motion.div
              key="view-structure"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="w-full h-full relative"
            >
              <ErrorBoundary
                componentName="Technical Structure View"
                fallbackMessage="The preliminary structural drawing engine encountered an issue."
              >
                <StructureView
                  layout={layout}
                  activeFloorIndex={activeFloorIndex}
                  onSelectFloor={setActiveFloorIndex}
                />
              </ErrorBoundary>
            </motion.div>
          )}

          {/* 4. ESTIMATE & MATERIAL QUANTIFICATION */}
          {currentTab === "estimate" && (
            <motion.div
              key="view-estimate"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="w-full h-full relative"
            >
              <EstimateView layout={layout} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* CREATE WORKSPACE CHOICE MODAL (DESIGN A NEW HOME vs I ALREADY HAVE A FLOOR PLAN vs DESCRIBE DREAM HOME) */}
      <CreateChoiceModal
        isOpen={isCreateChoiceOpen}
        onClose={() => setIsCreateChoiceOpen(false)}
        onSelectDesignNew={() => {
          setIsCreateChoiceOpen(false);
          setIsConsultationOpen(true);
        }}
        onSelectUploadPlan={() => {
          setIsCreateChoiceOpen(false);
          setIsUploadOpen(true);
        }}
        onSelectDreamHome={() => {
          setIsCreateChoiceOpen(false);
          setIsDreamHomeOpen(true);
        }}
      />

      {/* DREAM HOME NATURAL LANGUAGE CONSULTATION */}
      <DreamHomeConsultationModal
        isOpen={isDreamHomeOpen}
        onClose={() => setIsDreamHomeOpen(false)}
        onSuccess={handleUploadSuccess}
      />

      {/* ONE-QUESTION-AT-A-TIME ARCHITECTURAL CONSULTATION */}
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

      {/* UPLOAD FLOOR PLAN MODAL */}
      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onSuccess={handleUploadSuccess}
        isDarkMode={true}
      />

      {/* RECENT PROJECTS MODAL */}
      <ProjectsModal
        isOpen={isProjectsOpen}
        onClose={() => setIsProjectsOpen(false)}
        onSelectProject={(pid) => {
          router.push(`/project/${pid}/plan`);
        }}
        onStartNew={() => setIsCreateChoiceOpen(true)}
      />

      {/* GENERATION PROGRESS MODAL */}
      <GenerationProgressModal key={isGenerating ? "generating" : "idle"} isOpen={isGenerating} />

      {/* VASTU AUDIT MODAL */}
      {layout?.scores?.vastu_result && (
        <VastuAuditModal
          isOpen={isVastuAuditOpen}
          onClose={() => setIsVastuAuditOpen(false)}
          vastuResult={layout.scores.vastu_result}
        />
      )}

      {/* ERROR MODAL */}
      {generationError && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
          <div className="bg-[#14161C] border border-red-500/40 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-base font-semibold text-white">Generation Notice</h3>
            <p className="text-xs text-[#A0A5B5] leading-relaxed">{generationError}</p>
            <div className="flex justify-end">
              <button
                onClick={() => setGenerationError(null)}
                className="px-4 py-2 text-xs uppercase tracking-wider bg-amber-500 text-black font-semibold rounded-lg"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
