"use client";

import React from "react";
import {
  MousePointer,
  PenTool,
  DoorClosed,
  AppWindow,
  Ruler,
  RotateCcw,
  RotateCw,
  Trash2,
  X,
  Check,
  Split,
  ChevronDown,
} from "lucide-react";
import { Wall, Door, WindowItem, Room } from "@/types/house";
import { feetToArchitectural } from "@/utils/cadCoordinates";

export interface CadContextualToolbarProps {
  activeTool: "select" | "wall" | "door" | "window" | "measure";
  onSelectTool: (tool: "select" | "wall" | "door" | "window" | "measure") => void;
  selectedEntity: {
    type: "wall" | "door" | "window" | "room" | null;
    id?: string;
    wall?: Wall | null;
    door?: Door | null;
    window?: WindowItem | null;
    room?: Room | null;
  };
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  showDimensions: boolean;
  onToggleDimensions: () => void;
  onDeselect: () => void;
  onDeleteSelected: () => void;
  onToggleWallThickness?: () => void;
  onSetWallThickness?: (th: number) => void;
  onSplitWall?: () => void;
  onEditDimension?: (type: "wall" | "room_width" | "room_length", id: string, val: string) => void;
  onFlipDoorSwing?: () => void;
  onResizeDoorWidth?: (delta: number) => void;
  onResizeWindowWidth?: (delta: number) => void;
  onResetMeasure?: () => void;
  measureDistance?: number | null;
  onDone?: () => void;
  isSaving?: boolean;
}

export const CadContextualToolbar: React.FC<CadContextualToolbarProps> = ({
  activeTool,
  onSelectTool,
  selectedEntity,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  showDimensions,
  onToggleDimensions,
  onDeselect,
  onDeleteSelected,
  onToggleWallThickness,
  onSetWallThickness,
  onSplitWall,
  onEditDimension,
  onFlipDoorSwing,
  onResizeDoorWidth,
  onResizeWindowWidth,
  onResetMeasure,
  measureDistance,
  onDone,
  isSaving,
}) => {
  const { type, wall, door, window: win, room } = selectedEntity;

  // 1. WALL SELECTED CONTEXTUAL TOOLBAR
  if (type === "wall" && wall) {
    const wallLength = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
    const thicknessInches = Math.round(wall.thickness * 12);

    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-[#16171B]/95 backdrop-blur-xl border border-white/10 shadow-2xl text-xs font-mono text-white select-none animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center gap-1.5 pr-2 border-r border-white/10 text-[#C48446] font-bold">
          <PenTool className="w-3.5 h-3.5" />
          <span>WALL</span>
        </div>

        {/* Editable Length Badge */}
        <button
          type="button"
          onClick={() => onEditDimension?.("wall", wall.id, feetToArchitectural(wallLength))}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold transition-colors"
          title="Click to enter exact length"
        >
          <span className="text-[#94A3B8] font-normal">Length:</span>
          <span className="text-[#F59E0B]">{feetToArchitectural(wallLength)}</span>
        </button>

        {/* Thickness Toggle */}
        <button
          type="button"
          onClick={onToggleWallThickness}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[#CBD5E1] transition-colors"
          title="Toggle wall thickness (4.5&quot; / 9&quot;)"
        >
          <span className="text-[#94A3B8]">Thick:</span>
          <span>{thicknessInches}&quot;</span>
        </button>

        {/* Split Wall */}
        {onSplitWall && (
          <button
            type="button"
            onClick={onSplitWall}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[#CBD5E1] transition-colors"
            title="Split wall at midpoint"
          >
            <Split className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Split</span>
          </button>
        )}

        {/* Delete Wall */}
        <button
          type="button"
          onClick={onDeleteSelected}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 transition-colors"
          title="Delete Wall"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Delete</span>
        </button>

        <div className="h-4 w-px bg-white/10 mx-0.5" />

        {/* Deselect / Close Contextual Mode */}
        <button
          type="button"
          onClick={onDeselect}
          className="p-1 rounded-lg hover:bg-white/10 text-[#94A3B8] hover:text-white"
          title="Deselect (Esc)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // 2. DOOR SELECTED CONTEXTUAL TOOLBAR
  if (type === "door" && door) {
    const doorWidth = door.width || 3.0;
    const swingDir = door.swing_direction || "inward";

    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-[#16171B]/95 backdrop-blur-xl border border-white/10 shadow-2xl text-xs font-mono text-white select-none animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center gap-1.5 pr-2 border-r border-white/10 text-[#C48446] font-bold">
          <DoorClosed className="w-3.5 h-3.5" />
          <span>DOOR</span>
        </div>

        {/* Width with +/- */}
        <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-lg px-2 py-0.5">
          <span className="text-[#94A3B8]">Width:</span>
          <span className="text-[#F59E0B] font-bold px-1">{feetToArchitectural(doorWidth)}</span>
          <button
            type="button"
            onClick={() => onResizeDoorWidth?.(-0.5)}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/10 text-[#94A3B8] hover:text-white"
            title="-6&quot; width"
          >
            -
          </button>
          <button
            type="button"
            onClick={() => onResizeDoorWidth?.(0.5)}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/10 text-[#94A3B8] hover:text-white"
            title="+6&quot; width"
          >
            +
          </button>
        </div>

        {/* Flip Swing */}
        <button
          type="button"
          onClick={onFlipDoorSwing}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#C48446]/15 hover:bg-[#C48446]/25 border border-[#C48446]/30 text-[#E69F58] font-semibold transition-colors"
          title="Flip Swing Direction"
        >
          <RotateCw className="w-3.5 h-3.5" />
          <span className="capitalize">{swingDir}</span>
          <span className="hidden sm:inline font-normal text-[10px] text-[#94A3B8]">(Flip)</span>
        </button>

        {/* Delete Door */}
        <button
          type="button"
          onClick={onDeleteSelected}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 transition-colors"
          title="Delete Door"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Delete</span>
        </button>

        <div className="h-4 w-px bg-white/10 mx-0.5" />

        <button
          type="button"
          onClick={onDeselect}
          className="p-1 rounded-lg hover:bg-white/10 text-[#94A3B8] hover:text-white"
          title="Deselect (Esc)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // 3. WINDOW SELECTED CONTEXTUAL TOOLBAR
  if (type === "window" && win) {
    const winWidth = win.width || 4.0;
    const winHeight = win.height || 4.0;

    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-[#16171B]/95 backdrop-blur-xl border border-white/10 shadow-2xl text-xs font-mono text-white select-none animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center gap-1.5 pr-2 border-r border-white/10 text-[#C48446] font-bold">
          <AppWindow className="w-3.5 h-3.5" />
          <span>WINDOW</span>
        </div>

        {/* Width with +/- */}
        <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-lg px-2 py-0.5">
          <span className="text-[#94A3B8]">Width:</span>
          <span className="text-[#F59E0B] font-bold px-1">{feetToArchitectural(winWidth)}</span>
          <button
            type="button"
            onClick={() => onResizeWindowWidth?.(-1)}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/10 text-[#94A3B8] hover:text-white"
            title="-1ft width"
          >
            -
          </button>
          <button
            type="button"
            onClick={() => onResizeWindowWidth?.(1)}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/10 text-[#94A3B8] hover:text-white"
            title="+1ft width"
          >
            +
          </button>
        </div>

        {/* Height Display */}
        <div className="px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-[#CBD5E1]">
          <span className="text-[#94A3B8]">Height: </span>
          <span>{feetToArchitectural(winHeight)}</span>
        </div>

        {/* Delete Window */}
        <button
          type="button"
          onClick={onDeleteSelected}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 transition-colors"
          title="Delete Window"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Delete</span>
        </button>

        <div className="h-4 w-px bg-white/10 mx-0.5" />

        <button
          type="button"
          onClick={onDeselect}
          className="p-1 rounded-lg hover:bg-white/10 text-[#94A3B8] hover:text-white"
          title="Deselect (Esc)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // 4. ROOM SELECTED CONTEXTUAL TOOLBAR
  if (type === "room" && room && room.rect) {
    const dimStr = `${feetToArchitectural(room.rect.width)} × ${feetToArchitectural(room.rect.length)}`;
    const areaSqFt = room.area_sqft || Math.round(room.rect.width * room.rect.length);

    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-[#16171B]/95 backdrop-blur-xl border border-white/10 shadow-2xl text-xs font-mono text-white select-none animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center gap-1.5 pr-2 border-r border-white/10 text-[#C48446] font-bold">
          <span>{room.name.toUpperCase()}</span>
        </div>

        {/* Dimensions */}
        <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10">
          <span className="text-[#F59E0B] font-bold">{dimStr}</span>
        </div>

        {/* Area */}
        <div className="px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-[#CBD5E1]">
          <span>{areaSqFt} SQ FT</span>
        </div>

        {/* Delete Room */}
        <button
          type="button"
          onClick={onDeleteSelected}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 transition-colors"
          title="Delete Room"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Delete</span>
        </button>

        <div className="h-4 w-px bg-white/10 mx-0.5" />

        <button
          type="button"
          onClick={onDeselect}
          className="p-1 rounded-lg hover:bg-white/10 text-[#94A3B8] hover:text-white"
          title="Deselect (Esc)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // 5. MEASURE MODE TOOLBAR
  if (activeTool === "measure") {
    return (
      <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-2xl bg-[#16171B]/95 backdrop-blur-xl border border-cyan-500/30 shadow-2xl text-xs font-mono text-white select-none animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center gap-1.5 text-[#38BDF8] font-bold">
          <Ruler className="w-4 h-4" />
          <span>MEASURE TOOL</span>
        </div>

        {measureDistance !== null && measureDistance !== undefined ? (
          <div className="px-2.5 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 font-bold">
            Distance: {feetToArchitectural(measureDistance)}
          </div>
        ) : (
          <span className="text-[11px] text-[#94A3B8]">Click first point, then second point</span>
        )}

        <button
          type="button"
          onClick={onResetMeasure}
          className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[#CBD5E1] text-[11px]"
        >
          Reset
        </button>

        <button
          type="button"
          onClick={() => onSelectTool("select")}
          className="p-1 rounded-lg hover:bg-white/10 text-[#94A3B8] hover:text-white"
          title="Exit Measure Mode (Esc)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // 6. DEFAULT CAD PALETTE: Select | Wall | Door | Window | Measure
  return (
    <div className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-2xl bg-[#16171B]/95 backdrop-blur-xl border border-white/10 shadow-2xl text-xs font-mono text-white select-none">
      <button
        id="cad-tool-select"
        type="button"
        onClick={() => onSelectTool("select")}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all ${
          activeTool === "select"
            ? "bg-[#C48446] text-[#0A0B0E] font-bold shadow"
            : "text-[#94A3B8] hover:text-white hover:bg-white/5"
        }`}
        title="Select & Direct Manipulate (V)"
      >
        <MousePointer className="w-4 h-4" />
        <span>Select</span>
      </button>

      <button
        id="cad-tool-wall"
        type="button"
        onClick={() => onSelectTool("wall")}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all ${
          activeTool === "wall"
            ? "bg-[#C48446] text-[#0A0B0E] font-bold shadow"
            : "text-[#94A3B8] hover:text-white hover:bg-white/5"
        }`}
        title="Draw Wall (W)"
      >
        <PenTool className="w-4 h-4" />
        <span>Wall</span>
      </button>

      <button
        id="cad-tool-door"
        type="button"
        onClick={() => onSelectTool("door")}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all ${
          activeTool === "door"
            ? "bg-[#C48446] text-[#0A0B0E] font-bold shadow"
            : "text-[#94A3B8] hover:text-white hover:bg-white/5"
        }`}
        title="Place Door (D)"
      >
        <DoorClosed className="w-4 h-4" />
        <span>Door</span>
      </button>

      <button
        id="cad-tool-window"
        type="button"
        onClick={() => onSelectTool("window")}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all ${
          activeTool === "window"
            ? "bg-[#C48446] text-[#0A0B0E] font-bold shadow"
            : "text-[#94A3B8] hover:text-white hover:bg-white/5"
        }`}
        title="Place Window (O)"
      >
        <AppWindow className="w-4 h-4" />
        <span>Window</span>
      </button>

      <button
        id="cad-tool-measure"
        type="button"
        onClick={() => onSelectTool("measure")}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all ${
          (activeTool as string) === "measure"
            ? "bg-[#C48446] text-[#0A0B0E] font-bold shadow"
            : "text-[#94A3B8] hover:text-white hover:bg-white/5"
        }`}
        title="Measure Distance (M)"
      >
        <Ruler className="w-4 h-4" />
        <span>Measure</span>
      </button>

      <div className="h-4 w-px bg-white/10 mx-1 hidden sm:block" />

      {/* Undo / Redo */}
      <button
        type="button"
        onClick={onUndo}
        disabled={!canUndo}
        className="p-1.5 rounded-lg hover:bg-white/5 text-[#94A3B8] hover:text-white disabled:opacity-30 transition-colors hidden sm:flex items-center justify-center"
        title="Undo (Ctrl+Z)"
      >
        <RotateCcw className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={onRedo}
        disabled={!canRedo}
        className="p-1.5 rounded-lg hover:bg-white/5 text-[#94A3B8] hover:text-white disabled:opacity-30 transition-colors hidden sm:flex items-center justify-center"
        title="Redo (Ctrl+Y / Ctrl+Shift+Z)"
      >
        <RotateCw className="w-3.5 h-3.5" />
      </button>

      {/* Done Button */}
      {onDone && (
        <>
          <div className="h-4 w-px bg-white/10 mx-1 hidden sm:block" />
          <button
            type="button"
            onClick={onDone}
            disabled={isSaving}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#C48446] hover:bg-[#D49456] text-[#0A0B0E] font-bold text-xs transition-colors shadow"
            title="Save & Return to Plan"
          >
            <Check className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Done</span>
          </button>
        </>
      )}
    </div>
  );
};
