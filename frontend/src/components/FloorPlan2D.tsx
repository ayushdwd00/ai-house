"use client";

import React from "react";
import { HouseLayout, Room, MEPCategory } from "@/types/house";
import { NavView } from "./FloatingNav";
import {
  ArchitecturalPlanRenderer,
  feetToArchitectural,
  getRoomBackgroundFill,
} from "./ArchitecturalPlanRenderer";

export interface FloorPlan2DProps {
  layout: HouseLayout;
  activeFloorIndex: number;
  onSelectFloor?: (index: number) => void;
  selectedRoomId: string | null;
  selectedFurnitureId?: string | null;
  onSelectRoom: (roomId: string | null) => void;
  onSelectFurniture?: (furnitureId: string | null) => void;
  onSelectEntity?: (entityId: string | null) => void;
  onRegenerateLayout?: (updatedRooms: Room[]) => Promise<void> | void;
  isRegenerating?: boolean;
  isDarkMode?: boolean;
  mode?: "view" | "edit";
  onUpdateLayout?: (newLayout: HouseLayout) => void;
  onSave?: (savedLayout: HouseLayout) => Promise<void> | void;
  onBack?: () => void;
  showAtelierNav?: boolean;
  onStudioNavigate?: (view: NavView) => void;
  onToggleEditMode?: () => void;
  onOpenVastuAudit?: () => void;
  hasVastuResult?: boolean;
  mepVisibility?: Partial<Record<MEPCategory, boolean>>;
}

export { feetToArchitectural, getRoomBackgroundFill };

/**
 * FloorPlan2D:
 * Unified architectural plan renderer in VIEW mode.
 * Operates on the exact same canonical house model and SVG renderer as EDIT mode,
 * guaranteeing 100% visual consistency between PLAN and EDIT.
 */
export const FloorPlan2D: React.FC<FloorPlan2DProps> = ({
  layout,
  activeFloorIndex,
  onSelectFloor,
  selectedRoomId,
  selectedFurnitureId,
  onSelectRoom,
  onSelectFurniture,
  onSelectEntity,
  onRegenerateLayout,
  isRegenerating,
  mode = "view",
  onUpdateLayout,
  onSave,
  onBack,
  showAtelierNav,
  onStudioNavigate,
  onToggleEditMode,
  onOpenVastuAudit,
  hasVastuResult,
  mepVisibility,
}) => {
  return (
    <ArchitecturalPlanRenderer
      layout={layout}
      mode={mode}
      activeFloorIndex={activeFloorIndex}
      onSelectFloor={onSelectFloor}
      selectedRoomId={selectedRoomId}
      selectedFurnitureId={selectedFurnitureId}
      onSelectRoom={onSelectRoom}
      onSelectFurniture={onSelectFurniture}
      onSelectEntity={onSelectEntity}
      onRegenerateLayout={onRegenerateLayout}
      isRegenerating={isRegenerating}
      onUpdateLayout={onUpdateLayout}
      onSave={onSave}
      onBack={onBack}
      showAtelierNav={showAtelierNav}
      onStudioNavigate={onStudioNavigate}
      onToggleEditMode={onToggleEditMode}
      onOpenVastuAudit={onOpenVastuAudit}
      hasVastuResult={hasVastuResult}
      mepVisibility={mepVisibility}
    />
  );
};
