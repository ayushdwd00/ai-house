"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HouseLayout, IntakeRequest, Room } from "@/types/house";
import { FloatingNav, NavView } from "@/components/FloatingNav";
import { HomePageView } from "@/components/HomePageView";
import { FloorPlan2D } from "@/components/FloorPlan2D";
import { Dollhouse3D } from "@/components/Dollhouse3D";
import { ArchitecturalConsultation } from "@/components/ArchitecturalConsultation";
import { FloatingAICommandBar } from "@/components/FloatingAICommandBar";
import { GenerationProgressModal } from "@/components/GenerationProgressModal";
import { UploadModal } from "@/components/UploadModal";

const STORAGE_KEY = "atelier_archai_saved_layout";

export default function AppRoot() {
  // Navigation View: "home" | "plan" | "model" | "create"
  const [activeView, setActiveView] = useState<NavView>("home");

  // Canonical Architectural Design State
  const [layout, setLayout] = useState<HouseLayout | null>(null);

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
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefining, setIsRefining] = useState(false);

  // Initialize layout from localStorage or fallback to default layout
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        const saved = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
        if (saved) {
          const parsed = JSON.parse(saved);
          if (mounted) {
            setLayout(parsed);
          }
          return;
        }
      } catch (e) {
        console.warn("Could not load saved layout:", e);
      }

      try {
        const res = await fetch("http://localhost:8000/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            plot_width: 40,
            plot_length: 50,
            num_floors: 1,
            bedrooms: 3,
            bathrooms: 2,
            style: "Modern Scandinavian",
            road_side: "south",
            parking_cars: 1,
          }),
        });
        if (res.ok && mounted) {
          const data: HouseLayout = await res.json();
          setLayout(data);
        }
      } catch (err) {
        console.warn("Silent default init fallback:", err);
      }
    };

    init();
    return () => {
      mounted = false;
    };
  }, []);

  const updateLayout = (newLayout: HouseLayout) => {
    setLayout(newLayout);
    setSelectedRoomId(null);
    setSelectedFurnitureId(null);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newLayout));
    } catch (e) {
      console.warn("Failed to persist layout:", e);
    }
  };

  // Submit from One-Question-at-a-Time Architectural Consultation
  const handleStartGeneration = async (req: IntakeRequest) => {
    setActiveView("model");
    setIsGenerating(true);

    try {
      const res = await fetch("http://localhost:8000/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });

      if (!res.ok) throw new Error("Generation request failed");
      const data: HouseLayout = await res.json();

      // Cinematic pause so stages are witnessed
      setTimeout(() => {
        setIsGenerating(false);
        updateLayout(data);
        setActiveView("model");
      }, 2400);
    } catch (err) {
      console.error("Backend generation error:", err);
      setIsGenerating(false);
    }
  };

  // Upload floor plan image callback
  const handleUploadSuccess = (uploadedLayout: HouseLayout) => {
    updateLayout(uploadedLayout);
    setIsUploadOpen(false);
    setActiveView("model");
  };

  // Handle Dragged/Edited Rooms & Regenerate Wall Network via backend
  const handleRegenerateFromEdit = async (updatedRooms: Room[]) => {
    if (!layout) return;
    setIsRefining(true);

    try {
      let currentLayout = layout;

      // Identify rooms with modified rects
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

      // Sequentially apply modifications through /api/edit-room to regenerate walls & openings
      for (const modRoom of modified) {
        const res = await fetch("http://localhost:8000/api/edit-room", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            current_layout: currentLayout,
            room_id: modRoom.id,
            proposed_rect: modRoom.rect,
          }),
        });

        if (res.ok) {
          const result = await res.json();
          if (result.layout) {
            currentLayout = result.layout;
          }
        }
      }

      updateLayout(currentLayout);
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
      const res = await fetch("http://localhost:8000/api/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_layout: layout,
          edit_instruction: instruction,
          target_room_id: selectedRoomId,
        }),
      });

      if (!res.ok) throw new Error("Refinement failed");
      const data: HouseLayout = await res.json();
      updateLayout(data);
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

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0A0B0E] text-[#F5F3EF]">
      {/* MINIMAL FLOATING NAVIGATION (Always present except during full consultation modal) */}
      {activeView !== "create" && (
        <FloatingNav
          currentView={activeView}
          onNavigate={(view) => setActiveView(view)}
          hasLayout={Boolean(layout)}
        />
      )}

      {/* VIEWPORT CANVAS ROUTING */}
      <main className="w-full h-full relative overflow-hidden">
        <AnimatePresence mode="wait">
          {/* 1. HOME VIEW */}
          {activeView === "home" && (
            <motion.div
              key="view-home"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="w-full h-full overflow-y-auto"
            >
              <HomePageView
                onStartDesign={() => setActiveView("create")}
                onOpenPlanMode={() => setActiveView("plan")}
                onOpenModelMode={() => setActiveView("model")}
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
            </motion.div>
          )}

          {/* 2. DEDICATED FULL-SCREEN 2D BLUEPRINT PLAN (With drag-and-drop room editing & image export) */}
          {activeView === "plan" && layout && (
            <motion.div
              key="view-plan"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="w-full h-full relative"
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

              {/* Floating AI Command Bar */}
              <FloatingAICommandBar
                onApplyInstruction={handleRefine}
                isLoading={isRefining}
                selectedRoomName={selectedRoom?.name}
              />
            </motion.div>
          )}

          {/* 3. DEDICATED IMMERSIVE 3D MODEL VIEWER (Strictly 3D only) */}
          {activeView === "model" && layout && (
            <motion.div
              key="view-model"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="w-full h-full relative"
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
                isDarkMode={true}
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
              />

              {/* Floating AI Command Bar */}
              <FloatingAICommandBar
                onApplyInstruction={handleRefine}
                isLoading={isRefining}
                selectedRoomName={selectedRoom?.name}
              />
            </motion.div>
          )}

          {/* 4. CREATE YOUR HOME: ONE-QUESTION-AT-A-TIME ARCHITECTURAL CONSULTATION */}
          {activeView === "create" && (
            <motion.div
              key="view-create"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.3 }}
              className="w-full h-full relative"
            >
              <ArchitecturalConsultation
                onClose={() => setActiveView("home")}
                onSubmit={handleStartGeneration}
                initialPlotWidth={layout?.plot_width || 40}
                initialPlotLength={layout?.plot_length || 50}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* REQUIRED ENTRY POINT: Upload-to-3D Floor Plan Conversion Modal */}
      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onSuccess={handleUploadSuccess}
        isDarkMode={true}
      />

      {/* Generation Progress Modal */}
      <GenerationProgressModal key={isGenerating ? "generating" : "idle"} isOpen={isGenerating} />
    </div>
  );
}
