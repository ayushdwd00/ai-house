"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { FloatingNav, NavView } from "@/components/FloatingNav";
import { HomePageView } from "@/components/HomePageView";
import { CreateChoiceModal } from "@/components/CreateChoiceModal";
import { ProjectsModal } from "@/components/ProjectsModal";
import { useProject } from "@/context/ProjectContext";
import { HouseLayout, IntakeRequest } from "@/types/house";
import { validateAndSanitizeHouseLayout, validateAndSanitizeHouseLayoutDetailed } from "@/utils/layoutValidator";
import { generateHouseLayout } from "@/utils/api";

// Code splitting: Heavy modals and consultation loaded on demand only
const ArchitecturalConsultation = dynamic(
  () => import("@/components/ArchitecturalConsultation").then((m) => m.ArchitecturalConsultation),
  { ssr: false }
);

const UploadModal = dynamic(
  () => import("@/components/UploadModal").then((m) => m.UploadModal),
  { ssr: false }
);

const DreamHomeConsultationModal = dynamic(
  () => import("@/components/DreamHomeConsultationModal").then((m) => m.DreamHomeConsultationModal),
  { ssr: false }
);

const GenerationProgressModal = dynamic(
  () => import("@/components/GenerationProgressModal").then((m) => m.GenerationProgressModal),
  { ssr: false }
);

export default function HomePage() {
  const router = useRouter();
  const { activeProject, projectId, createProject } = useProject();

  // Modals & User Flow States
  const [isCreateChoiceOpen, setIsCreateChoiceOpen] = useState(false);
  const [isConsultationOpen, setIsConsultationOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isDreamHomeOpen, setIsDreamHomeOpen] = useState(false);
  const [isProjectsOpen, setIsProjectsOpen] = useState(false);

  // Synthesis States
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [lastIntakeRequest, setLastIntakeRequest] = useState<IntakeRequest | null>(null);

  const handleNavigate = (view: NavView) => {
    if (view === "create") {
      setIsCreateChoiceOpen(true);
    } else if (view === "projects") {
      setIsProjectsOpen(true);
    }
  };

  // Triggered when user selects "1. DESIGN A NEW HOME"
  const handleSelectDesignNew = () => {
    setIsCreateChoiceOpen(false);
    setIsConsultationOpen(true);
  };

  // Triggered when user selects "2. I ALREADY HAVE A FLOOR PLAN"
  const handleSelectUploadPlan = () => {
    setIsCreateChoiceOpen(false);
    setIsUploadOpen(true);
  };

  // Triggered when user selects "3. DESCRIBE YOUR DREAM HOME"
  const handleSelectDreamHome = () => {
    setIsCreateChoiceOpen(false);
    setIsDreamHomeOpen(true);
  };

  const handleDreamHomeSuccess = (layout: HouseLayout) => {
    setIsDreamHomeOpen(false);
    const newProjectId = createProject(layout);
    router.push(`/project/${newProjectId}/plan`);
  };

  // Submit intake from step-by-step Architectural Consultation
  const handleStartGeneration = async (req: IntakeRequest) => {
    if (isGenerating) return;
    setLastIntakeRequest(req);
    setIsConsultationOpen(false);
    setIsGenerating(true);
    setGenerationError(null);

    try {
      const rawData = await generateHouseLayout(req);

      // Check if backend returned an empty/infeasible layout directly (fallback for 200 OK responses)
      if (!rawData || !rawData.rooms || rawData.rooms.length === 0) {
        const valErrors = (rawData as any)?.validation?.errors;
        const rationale = (rawData as any)?.designer_rationale;
        const msg = (valErrors && valErrors.length > 0)
          ? valErrors.join("\n")
          : (rationale || "The requested room program exceeds the buildable envelope of the plot. Try increasing floors or adjusting room sizes.");
        throw new Error(msg);
      }

      const sanitized = validateAndSanitizeHouseLayout(rawData);
      if (!sanitized) {
        const detailed = validateAndSanitizeHouseLayoutDetailed(rawData);
        const reason = detailed.errors?.[0] || "Received an unrenderable architectural layout from the solver.";
        throw new Error(reason);
      }

      setIsGenerating(false);
      const newProjectId = createProject(sanitized);
      router.push(`/project/${newProjectId}/plan`);
    } catch (err) {
      console.error("[GENERATION ERROR]", err);
      setIsGenerating(false);
      setGenerationError(err instanceof Error ? err.message : "Failed to connect to architectural synthesis backend.");
    }
  };

  // Floor plan upload callback
  const handleUploadSuccess = (uploadedLayout: HouseLayout) => {
    const sanitized = validateAndSanitizeHouseLayout(uploadedLayout) || uploadedLayout;
    setIsUploadOpen(false);
    const newProjectId = createProject(sanitized);
    router.push(`/project/${newProjectId}/plan`);
  };

  // Explore 3D Model button from Home
  const handleExplore3D = () => {
    if (projectId) {
      router.push(`/project/${projectId}/model`);
    } else {
      setIsCreateChoiceOpen(true);
    }
  };

  // Explore 2D Blueprint Plan button from Home
  const handleExplorePlan = () => {
    if (projectId) {
      router.push(`/project/${projectId}/plan`);
    } else {
      setIsCreateChoiceOpen(true);
    }
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0A0B0E] text-[#F5F3EF]">
      {/* INITIAL WEBSITE NAVIGATION:
          When NO project workspace is active, shows strictly:
          ATELIER | HOME | PROJECTS | CREATE
          Does NOT show PLAN, MODEL, ESTIMATE. */}
      {!isConsultationOpen && (
        <FloatingNav
          currentView="home"
          onNavigate={handleNavigate}
          isProjectWorkspace={false}
          hasProject={Boolean(projectId)}
          onOpenProjects={() => setIsProjectsOpen(true)}
        />
      )}

      {/* FULL-PAGE CINEMATIC HOME VIEW */}
      <main className="w-full h-full relative overflow-y-auto">
        <HomePageView
          onStartDesign={() => setIsCreateChoiceOpen(true)}
          onOpenPlanMode={handleExplorePlan}
          onOpenModelMode={handleExplore3D}
          onOpenUpload={() => setIsUploadOpen(true)}
          onSelectPreset={(preset) => {
            handleStartGeneration({
              plot_width: preset.plot_width,
              plot_length: preset.plot_length,
              num_floors: preset.num_floors || 1,
              bedrooms: preset.bedrooms,
              bathrooms: preset.bathrooms,
              style: preset.style,
              road_side: "south",
              parking_cars: 2,
            });
          }}
        />
      </main>

      {/* CREATE FLOW CHOICE MODAL:
          1. DESIGN A NEW HOME
          2. I ALREADY HAVE A FLOOR PLAN
          3. DESCRIBE YOUR DREAM HOME */}
      <CreateChoiceModal
        isOpen={isCreateChoiceOpen}
        onClose={() => setIsCreateChoiceOpen(false)}
        onSelectDesignNew={handleSelectDesignNew}
        onSelectUploadPlan={handleSelectUploadPlan}
        onSelectDreamHome={handleSelectDreamHome}
      />

      {/* FLOW 3: NATURAL-LANGUAGE DESCRIBE YOUR DREAM HOME CONSULTATION MODAL */}
      <DreamHomeConsultationModal
        isOpen={isDreamHomeOpen}
        onClose={() => setIsDreamHomeOpen(false)}
        onSuccess={handleDreamHomeSuccess}
      />

      {/* FLOW 1: ONE-QUESTION-AT-A-TIME ARCHITECTURAL CONSULTATION */}
      {isConsultationOpen && (
        <div className="fixed inset-0 z-50 bg-[#0A0B0E]">
          <ArchitecturalConsultation
            onClose={() => setIsConsultationOpen(false)}
            onSubmit={handleStartGeneration}
            initialPlotWidth={activeProject?.plot_width || 40}
            initialPlotLength={activeProject?.plot_length || 50}
          />
        </div>
      )}

      {/* FLOW 2: FLOOR PLAN BLUEPRINT UPLOAD TO 3D MODAL */}
      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onSuccess={handleUploadSuccess}
        isDarkMode={true}
      />

      {/* RECENT PROJECTS ARCHIVE MODAL */}
      <ProjectsModal
        isOpen={isProjectsOpen}
        onClose={() => setIsProjectsOpen(false)}
        onSelectProject={(pid) => {
          router.push(`/project/${pid}/plan`);
        }}
        onStartNew={() => {
          setIsProjectsOpen(false);
          setIsCreateChoiceOpen(true);
        }}
      />

      {/* GENERATION PROGRESS MODAL */}
      <GenerationProgressModal key={isGenerating ? "generating" : "idle"} isOpen={isGenerating} />

      {/* ERROR NOTICE MODAL */}
      {generationError && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
          <div className="bg-[#14161C] border border-red-500/40 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-semibold text-white">Generation Notice</h3>
            <p className="text-xs text-[#A0A5B5] leading-relaxed">{generationError}</p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setGenerationError(null)}
                className="px-4 py-2 text-xs uppercase tracking-wider text-[#F5F3EF]/70 hover:text-white border border-white/10 rounded-lg"
              >
                Close
              </button>
              <button
                onClick={() => {
                  setGenerationError(null);
                  setIsConsultationOpen(true);
                }}
                className="px-4 py-2 text-xs uppercase tracking-wider border border-[#C48446]/40 text-[#C48446] hover:bg-[#C48446]/10 rounded-lg"
              >
                Open Brief
              </button>
              {lastIntakeRequest && (
                <button
                  onClick={() => {
                    const req = lastIntakeRequest;
                    setGenerationError(null);
                    handleStartGeneration(req);
                  }}
                  className="px-4 py-2 text-xs uppercase tracking-wider bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-lg shadow-md transition-colors"
                >
                  Retry
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
