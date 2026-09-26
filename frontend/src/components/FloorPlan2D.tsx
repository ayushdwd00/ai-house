"use client";

import React from "react";
import { HouseLayout, Room } from "@/types/house";
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
  onRegenerateLayout?: (updatedRooms: Room[]) => Promise<void> | void;
  isRegenerating?: boolean;
  isDarkMode?: boolean;
  mode?: "view" | "edit";
  onUpdateLayout?: (newLayout: HouseLayout) => void;
  onSave?: (savedLayout: HouseLayout) => Promise<void> | void;
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
  onRegenerateLayout,
  isRegenerating,
  mode = "view",
  onUpdateLayout,
  onSave,
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
      onRegenerateLayout={onRegenerateLayout}
      isRegenerating={isRegenerating}
      onUpdateLayout={onUpdateLayout}
      onSave={onSave}
    />
  );
};
