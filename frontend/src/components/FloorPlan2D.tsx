"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { HouseLayout, FloorPlan, Room, FurnitureItem } from "@/types/house";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Download,
  Move,
  Check,
  RotateCcw,
  Sparkles,
  Loader2,
  Plus,
  Minus,
} from "lucide-react";

interface FloorPlan2DProps {
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
}

interface DraggingRoomState {
  roomId: string;
  startMouseX: number;
  startMouseY: number;
  initialX: number;
  initialY: number;
}

export const FloorPlan2D: React.FC<FloorPlan2DProps> = ({
  layout,
  activeFloorIndex,
  onSelectFloor,
  selectedRoomId,
  selectedFurnitureId,
  onSelectRoom,
  onSelectFurniture,
  onRegenerateLayout,
  isRegenerating = false,
}) => {
  const [zoom, setZoom] = useState(1.0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [hoveredRoom, setHoveredRoom] = useState<Room | null>(null);
  const [activeTool, setActiveTool] = useState<"select" | "measure">("select");

  // Edit Mode & Room Dragging State
  const [isEditMode, setIsEditMode] = useState(false);
  const [draggingRoom, setDraggingRoom] = useState<DraggingRoomState | null>(null);
  const [workingRooms, setWorkingRooms] = useState<Room[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Active floor plan
  const currentFloor: FloorPlan =
    layout.floors && layout.floors[activeFloorIndex]
      ? layout.floors[activeFloorIndex]
      : {
          floor_number: 1,
          floor_name: "Ground Floor",
          rooms: layout.rooms || [],
          exterior_walls: layout.exterior_walls || [],
          interior_walls: layout.interior_walls || [],
          doors: layout.doors || [],
          windows: layout.windows || [],
        };

  // Coordinate scaling: 1 foot = 24 SVG pixels
  const SCALE = 24;
  const svgWidth = layout.plot_width * SCALE;
  const svgHeight = layout.plot_length * SCALE;
  const padding = 80;

  // Active display rooms (workingRooms in edit mode, currentFloor.rooms otherwise)
  const displayRooms = isEditMode && workingRooms.length > 0 ? workingRooms : currentFloor.rooms || [];

  // Wheel zoom
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left - rect.width / 2;
      const mouseY = e.clientY - rect.top - rect.height / 2;

      const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;
      setZoom((prevZoom) => {
        const nextZoom = Math.min(3.5, Math.max(0.4, prevZoom * zoomFactor));
        setPan((prevPan) => ({
          x: mouseX - (mouseX - prevPan.x) * (nextZoom / prevZoom),
          y: mouseY - (mouseY - prevPan.y) * (nextZoom / prevZoom),
        }));
        return nextZoom;
      });
    },
    []
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  // Mouse pan & Room drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0 && !draggingRoom) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning && !draggingRoom) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    } else if (draggingRoom && isEditMode) {
      const deltaXFeet = (e.clientX - draggingRoom.startMouseX) / (SCALE * zoom);
      const deltaYFeet = (e.clientY - draggingRoom.startMouseY) / (SCALE * zoom);

      const activeRoom = workingRooms.find((r) => r.id === draggingRoom.roomId);
      if (!activeRoom) return;

      const rawX = draggingRoom.initialX + deltaXFeet;
      const rawY = draggingRoom.initialY + deltaYFeet;

      // Snap to 0.5ft increments and bound within plot
      const roomW = activeRoom.rect.width;
      const roomL = activeRoom.rect.length;
      const clampedX = Math.max(0, Math.min(layout.plot_width - roomW, Math.round(rawX * 2) / 2));
      const clampedY = Math.max(0, Math.min(layout.plot_length - roomL, Math.round(rawY * 2) / 2));

      setWorkingRooms((prev) =>
        prev.map((r) =>
          r.id === draggingRoom.roomId
            ? {
                ...r,
                rect: { ...r.rect, x: clampedX, y: clampedY },
              }
            : r
        )
      );
      setHasChanges(true);
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    if (draggingRoom) {
      setDraggingRoom(null);
    }
  };

  const handleResetView = () => {
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
  };

  // Revert room edits to original
  const handleCancelEdits = () => {
    const rooms = currentFloor.rooms || layout.rooms || [];
    setWorkingRooms(JSON.parse(JSON.stringify(rooms)));
    setHasChanges(false);
    setIsEditMode(false);
  };

  // User presses OKAY -> Regenerate map
  const handleApplyEdits = async () => {
    if (onRegenerateLayout && hasChanges) {
      await onRegenerateLayout(workingRooms);
    }
    setHasChanges(false);
    setIsEditMode(false);
  };

  // Resize room dimension stepper (+ / - 1 ft)
  const handleResizeSelectedRoom = (dimension: "width" | "length", delta: number) => {
    if (!selectedRoomId) return;
    setWorkingRooms((prev) =>
      prev.map((r) => {
        if (r.id !== selectedRoomId) return r;
        const currentW = r.rect.width;
        const currentL = r.rect.length;
        const newW = dimension === "width" ? Math.max(6, Math.min(40, currentW + delta)) : currentW;
        const newL = dimension === "length" ? Math.max(6, Math.min(40, currentL + delta)) : currentL;
        return {
          ...r,
          rect: { ...r.rect, width: newW, length: newL },
          area_sqft: Math.round(newW * newL),
        };
      })
    );
    setHasChanges(true);
  };

  // ---------------------------------------------------------------------------
  // Export 2D Map as Image (High Resolution PNG)
  // ---------------------------------------------------------------------------
  const handleExportPNG = () => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    setIsExporting(true);

    try {
      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(svgEl);
      const img = new Image();
      const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(svgBlob);

      img.onload = () => {
        const canvas = document.createElement("canvas");
        const exportScale = 2.0; // 2x high-resolution crisp rendering
        canvas.width = (svgWidth + padding * 2) * exportScale;
        canvas.height = (svgHeight + padding * 2) * exportScale;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          setIsExporting(false);
          return;
        }

        // Fill background
        ctx.fillStyle = "#0A0B0E";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw SVG content
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);

        // Add Architectural Monograph Header Bar
        ctx.fillStyle = "#C48446";
        ctx.font = "bold 20px monospace";
        ctx.fillText("ATELIER ARCHAI // ARCHITECTURAL BLUEPRINT", 40, 45);

        ctx.fillStyle = "#F5F3EF";
        ctx.font = "28px serif";
        ctx.fillText(layout.title || "Residence Layout", 40, 80);

        ctx.fillStyle = "#9E9C98";
        ctx.font = "16px monospace";
        ctx.fillText(
          `PLOT: ${layout.plot_width}' × ${layout.plot_length}'  •  TOTAL LIVING: ${layout.stats?.living_area_sqft || 2100} SQ FT  •  SCALE: 1/4" = 1'-0"`,
          40,
          105
        );

        // Trigger file download
        const a = document.createElement("a");
        a.href = canvas.toDataURL("image/png");
        a.download = `${(layout.title || "Residence").replace(/[^a-zA-Z0-9]/g, "_")}_2D_Blueprint.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setIsExporting(false);
      };

      img.onerror = () => {
        setIsExporting(false);
      };

      img.src = url;
    } catch (err) {
      console.error("Export error:", err);
      setIsExporting(false);
    }
  };

  // Render individual 2D CAD furniture symbols
  const renderFurniture = (item: FurnitureItem) => {
    const ix = item.x * SCALE;
    const iy = item.y * SCALE;
    const iw = item.width * SCALE;
    const il = item.length * SCALE;
    const isSelected = selectedFurnitureId === item.id;

    const strokeCol = isSelected ? "#C48446" : "#68615A";
    const strokeW = isSelected ? 2.0 : 1.2;

    const handleFurnitureClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      onSelectFurniture?.(item.id);
    };

    if (item.type.includes("bed")) {
      return (
        <g
          key={item.id}
          transform={`rotate(${item.rotation}, ${ix}, ${iy})`}
          onClick={handleFurnitureClick}
          className="cursor-pointer"
        >
          <rect
            x={ix - iw / 2}
            y={iy - il / 2}
            width={iw}
            height={il}
            rx={2}
            fill="#272421"
            stroke={strokeCol}
            strokeWidth={strokeW}
          />
          <rect
            x={ix - iw / 2}
            y={iy - il / 2}
            width={iw}
            height={il * 0.18}
            fill="#3D3732"
            stroke={strokeCol}
            strokeWidth={strokeW}
          />
          <rect
            x={ix - iw / 2 + iw * 0.08}
            y={iy - il / 2 + il * 0.22}
            width={iw * 0.38}
            height={il * 0.22}
            rx={2}
            fill="#4A4540"
            stroke={strokeCol}
            strokeWidth={1}
          />
          <rect
            x={ix + iw * 0.04}
            y={iy - il / 2 + il * 0.22}
            width={iw * 0.38}
            height={il * 0.22}
            rx={2}
            fill="#4A4540"
            stroke={strokeCol}
            strokeWidth={1}
          />
        </g>
      );
    }

    if (item.type.includes("sofa") || item.type.includes("couch")) {
      return (
        <g
          key={item.id}
          transform={`rotate(${item.rotation}, ${ix}, ${iy})`}
          onClick={handleFurnitureClick}
          className="cursor-pointer"
        >
          <rect
            x={ix - iw / 2}
            y={iy - il / 2}
            width={iw}
            height={il}
            rx={2}
            fill="#262320"
            stroke={strokeCol}
            strokeWidth={strokeW}
          />
          <rect
            x={ix - iw / 2}
            y={iy - il / 2}
            width={iw}
            height={il * 0.28}
            fill="#38332E"
            stroke={strokeCol}
            strokeWidth={strokeW}
          />
        </g>
      );
    }

    if (item.type.includes("dining_table")) {
      return (
        <g
          key={item.id}
          transform={`rotate(${item.rotation}, ${ix}, ${iy})`}
          onClick={handleFurnitureClick}
          className="cursor-pointer"
        >
          <rect
            x={ix - iw / 2}
            y={iy - il / 2}
            width={iw}
            height={il}
            rx={3}
            fill="#2D2824"
            stroke={strokeCol}
            strokeWidth={strokeW}
          />
        </g>
      );
    }

    return (
      <rect
        key={item.id}
        x={ix - iw / 2}
        y={iy - il / 2}
        width={iw}
        height={il}
        rx={2}
        fill="#2A2622"
        stroke={strokeCol}
        strokeWidth={strokeW}
        onClick={handleFurnitureClick}
        className="cursor-pointer"
      />
    );
  };

  const selectedRoom = displayRooms.find((r) => r.id === selectedRoomId);

  return (
    <div className="relative w-full h-full flex flex-col select-none overflow-hidden bg-[#0A0B0E]">
      {/* --------------------------------------------------------------------- */}
      {/* 1. TOP FLOATING ACTION BAR: VIEW CONTROLS, EDIT MODE & EXPORT */}
      {/* --------------------------------------------------------------------- */}
      <div className="absolute top-16 sm:top-20 left-3 sm:left-6 z-30 flex flex-wrap items-center gap-1.5 sm:gap-2.5 max-w-[calc(100vw-24px)] pointer-events-auto">
        {/* Navigation Tools */}
        <div className="flex items-center p-0.5 sm:p-1 rounded-full bg-[#12141A]/90 backdrop-blur-md border border-white/10 shadow-2xl text-[10px] sm:text-[11px] font-mono text-[#9E9C98]">
          <button
            onClick={() => setActiveTool("select")}
            className={`px-2.5 sm:px-3 py-1 rounded-full transition-all ${
              activeTool === "select" && !isEditMode
                ? "bg-[#F5F3EF] text-[#0A0B0E] font-medium shadow-sm"
                : "hover:text-[#F5F3EF]"
            }`}
          >
            SELECT
          </button>
          <button
            onClick={() => setActiveTool("measure")}
            className={`px-2.5 sm:px-3 py-1 rounded-full transition-all ${
              activeTool === "measure"
                ? "bg-[#C48446] text-[#0A0B0E] font-medium shadow-sm"
                : "hover:text-[#F5F3EF]"
            }`}
          >
            MEASURE
          </button>

          <div className="h-4 w-px bg-white/10 mx-1 sm:mx-1.5" />

          <button
            onClick={() => setZoom((z) => Math.min(3.5, z * 1.15))}
            className="p-1 sm:p-1.5 rounded-full hover:bg-white/5 text-[#9E9C98] hover:text-[#F5F3EF] transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-3 sm:w-3.5 h-3 sm:h-3.5" />
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(0.4, z * 0.85))}
            className="p-1 sm:p-1.5 rounded-full hover:bg-white/5 text-[#9E9C98] hover:text-[#F5F3EF] transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-3 sm:w-3.5 h-3 sm:h-3.5" />
          </button>
          <button
            onClick={handleResetView}
            className="p-1 sm:p-1.5 rounded-full hover:bg-white/5 text-[#9E9C98] hover:text-[#F5F3EF] transition-colors"
            title="Reset View"
          >
            <Maximize2 className="w-3 sm:w-3.5 h-3 sm:h-3.5" />
          </button>
        </div>

        {/* EDIT ROOMS (DRAG & DROP) TOGGLE */}
        <button
          onClick={() => {
            if (!isEditMode) {
              setWorkingRooms(JSON.parse(JSON.stringify(currentFloor.rooms || layout.rooms || [])));
              setHasChanges(false);
            }
            setIsEditMode((prev) => !prev);
          }}
          className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-full text-[10px] sm:text-[11px] font-mono tracking-wider transition-all shadow-2xl ${
            isEditMode
              ? "bg-[#C48446] text-[#0A0B0E] font-semibold ring-2 ring-[#C48446]/40"
              : "bg-[#12141A]/90 hover:bg-[#1A1D24] text-[#F5F3EF] border border-white/10 hover:border-[#C48446]/40"
          }`}
        >
          <Move className="w-3 sm:w-3.5 h-3 sm:h-3.5" />
          <span>{isEditMode ? "EDITING" : "DRAG ROOMS"}</span>
        </button>

        {/* EXPORT 2D MAP AS IMAGE BUTTON */}
        <button
          onClick={handleExportPNG}
          disabled={isExporting}
          className="flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-full bg-[#12141A]/90 hover:bg-[#1A1D24] text-[#F5F3EF] border border-white/10 hover:border-white/20 text-[10px] sm:text-[11px] font-mono tracking-wider shadow-2xl transition-all disabled:opacity-50"
          title="Export 2D architectural blueprint map as PNG image"
        >
          {isExporting ? (
            <Loader2 className="w-3 sm:w-3.5 h-3 sm:h-3.5 animate-spin" />
          ) : (
            <Download className="w-3 sm:w-3.5 h-3 sm:h-3.5 text-[#C48446]" />
          )}
          <span>EXPORT MAP</span>
        </button>
      </div>

      {/* Floor Level Switcher (Top Right / Responsive) */}
      {layout.floors && layout.floors.length > 1 && onSelectFloor && (
        <div className="absolute top-28 sm:top-20 right-3 sm:right-6 z-30 flex items-center p-0.5 sm:p-1 rounded-full bg-[#12141A]/90 backdrop-blur-md border border-white/10 shadow-2xl text-[10px] sm:text-[11px] font-mono text-[#9E9C98]">
          {layout.floors.map((fl, idx) => (
            <button
              key={fl.floor_number}
              onClick={() => onSelectFloor(idx)}
              className={`px-3 py-1 rounded-full transition-all ${
                activeFloorIndex === idx
                  ? "bg-[#C48446] text-[#0A0B0E] font-medium shadow-sm"
                  : "hover:text-[#F5F3EF]"
              }`}
            >
              {fl.floor_name || `L${fl.floor_number}`}
            </button>
          ))}
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* 2. EDITING BANNER (Appears when isEditMode is active) */}
      {/* --------------------------------------------------------------------- */}
      {isEditMode && (
        <div className="absolute top-36 left-1/2 -translate-x-1/2 z-40 flex items-center gap-4 px-5 py-2.5 rounded-2xl bg-[#12141A]/95 border border-[#C48446]/40 backdrop-blur-xl shadow-2xl text-xs font-mono">
          <div className="flex items-center gap-2 text-[#C48446]">
            <Sparkles className="w-4 h-4 animate-pulse" />
            <span className="font-medium tracking-wide">DRAG ROOMS TO REORGANIZE</span>
          </div>

          <div className="h-4 w-px bg-white/10" />

          {/* Size Adjusters if room selected */}
          {selectedRoom && (
            <div className="flex items-center gap-2 text-[11px] text-[#9E9C98]">
              <span>{selectedRoom.name}:</span>
              <button
                onClick={() => handleResizeSelectedRoom("width", -1)}
                className="p-1 rounded bg-white/5 hover:bg-white/10"
                title="Decrease Width"
              >
                <Minus className="w-3 h-3" />
              </button>
              <span>{selectedRoom.rect.width}&apos;W</span>
              <button
                onClick={() => handleResizeSelectedRoom("width", 1)}
                className="p-1 rounded bg-white/5 hover:bg-white/10"
                title="Increase Width"
              >
                <Plus className="w-3 h-3" />
              </button>

              <button
                onClick={() => handleResizeSelectedRoom("length", -1)}
                className="p-1 rounded bg-white/5 hover:bg-white/10 ml-1"
                title="Decrease Length"
              >
                <Minus className="w-3 h-3" />
              </button>
              <span>{selectedRoom.rect.length}&apos;L</span>
              <button
                onClick={() => handleResizeSelectedRoom("length", 1)}
                className="p-1 rounded bg-white/5 hover:bg-white/10"
                title="Increase Length"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          )}

          <div className="h-4 w-px bg-white/10" />

          {/* Reset & Apply Buttons */}
          <button
            onClick={handleCancelEdits}
            className="flex items-center gap-1 text-[#9E9C98] hover:text-[#F5F3EF] transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            <span>RESET</span>
          </button>

          <button
            onClick={handleApplyEdits}
            disabled={isRegenerating}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-[#C48446] hover:bg-[#D49354] text-[#0A0B0E] font-semibold text-xs tracking-wider transition-all shadow-lg shadow-[#C48446]/20"
          >
            {isRegenerating ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>REGENERATING...</span>
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5 stroke-[3]" />
                <span>OKAY (REGENERATE MAP)</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* 3. MAIN DRAFTING SVG CANVAS */}
      {/* --------------------------------------------------------------------- */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleResetView}
        className={`w-full h-full flex items-center justify-center p-4 ${
          isPanning ? "cursor-grabbing" : isEditMode ? "cursor-default" : "cursor-grab"
        }`}
      >
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "center center",
            transition: isPanning || draggingRoom ? "none" : "transform 0.12s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
          className="flex items-center justify-center"
        >
          <svg
            ref={svgRef}
            id="architectural-svg"
            width={svgWidth + padding * 2}
            height={svgHeight + padding * 2}
            viewBox={`-${padding} -${padding} ${svgWidth + padding * 2} ${svgHeight + padding * 2}`}
            className="overflow-visible"
          >
            <defs>
              {/* Architectural Fine Drafting Grid Pattern (1ft minor, 5ft major) */}
              <pattern id="drafting-grid" width={SCALE} height={SCALE} patternUnits="userSpaceOnUse">
                <circle cx={SCALE / 2} cy={SCALE / 2} r={0.6} fill="#3D3833" />
              </pattern>

              <pattern id="drafting-grid-major" width={SCALE * 5} height={SCALE * 5} patternUnits="userSpaceOnUse">
                <path d={`M ${SCALE * 5} 0 L 0 0 0 ${SCALE * 5}`} fill="none" stroke="#2E2A26" strokeWidth="0.8" />
              </pattern>
            </defs>

            {/* Plot Background with Drafting Grid */}
            <rect
              x={-padding + 10}
              y={-padding + 10}
              width={svgWidth + padding * 2 - 20}
              height={svgHeight + padding * 2 - 20}
              fill="#181716"
            />
            <rect x={0} y={0} width={svgWidth} height={svgHeight} fill="url(#drafting-grid)" />
            <rect x={0} y={0} width={svgWidth} height={svgHeight} fill="url(#drafting-grid-major)" />

            {/* Plot Boundary Line */}
            <rect
              x={0}
              y={0}
              width={svgWidth}
              height={svgHeight}
              fill="none"
              stroke="#C48446"
              strokeWidth={1.5}
              strokeDasharray="8 4"
            />

            {/* Site Boundary Label */}
            <text x={10} y={-14} fill="#C48446" className="font-mono text-[10px] tracking-widest uppercase font-semibold">
              PROPERTY BOUNDARY: {layout.plot_width}&apos; × {layout.plot_length}&apos; (
              {(layout.plot_width * layout.plot_length).toLocaleString()} SQ FT)
            </text>

            {/* ROOMS GEOMETRY (DRAGGABLE IN EDIT MODE) */}
            {displayRooms.map((room) => {
              if (!room.rect) return null;
              const rx = room.rect.x * SCALE;
              const ry = room.rect.y * SCALE;
              const rw = room.rect.width * SCALE;
              const rl = room.rect.length * SCALE;
              const isSelected = selectedRoomId === room.id;
              const isHovered = hoveredRoom?.id === room.id;

              return (
                <g
                  key={room.id}
                  transform={`translate(${rx}, ${ry})`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectRoom(room.id);
                  }}
                  onMouseEnter={() => setHoveredRoom(room)}
                  onMouseLeave={() => setHoveredRoom(null)}
                  onMouseDown={(e) => {
                    if (isEditMode) {
                      e.stopPropagation();
                      onSelectRoom(room.id);
                      setDraggingRoom({
                        roomId: room.id,
                        startMouseX: e.clientX,
                        startMouseY: e.clientY,
                        initialX: room.rect.x,
                        initialY: room.rect.y,
                      });
                    }
                  }}
                  className={`${isEditMode ? "cursor-move" : "cursor-pointer"}`}
                >
                  {/* Room Fill Floor Slab */}
                  <rect
                    x={0}
                    y={0}
                    width={rw}
                    height={rl}
                    fill={isSelected ? "#2E241E" : isHovered ? "#22201D" : "#1A1918"}
                    stroke={
                      isEditMode
                        ? isSelected
                          ? "#C48446"
                          : "#8E5D32"
                        : isSelected
                        ? "#C48446"
                        : "#3D3730"
                    }
                    strokeWidth={isSelected || isEditMode ? 2 : 1}
                    strokeDasharray={isEditMode ? "4 2" : "none"}
                    className="transition-colors duration-150"
                  />

                  {/* Room Name & Dimensions */}
                  <text
                    x={rw / 2}
                    y={rl / 2 - 6}
                    textAnchor="middle"
                    fill={isSelected ? "#F5F3EF" : "#E2DDD5"}
                    className="font-mono text-[11px] font-semibold tracking-wider pointer-events-none select-none"
                  >
                    {room.name.toUpperCase()}
                  </text>

                  <text
                    x={rw / 2}
                    y={rl / 2 + 10}
                    textAnchor="middle"
                    fill={isSelected ? "#C48446" : "#8A847A"}
                    className="font-mono text-[9px] pointer-events-none select-none"
                  >
                    {room.rect.width}&apos; × {room.rect.length}&apos; ({room.area_sqft || Math.round(room.rect.width * room.rect.length)} SQ FT)
                  </text>

                  {/* Drag Icon Indicator in Edit Mode */}
                  {isEditMode && (
                    <circle cx={rw - 10} cy={10} r={4} fill="#C48446" className="pointer-events-none" />
                  )}
                </g>
              );
            })}

            {/* Furniture Symbols (Only visible when not actively dragging edit mode) */}
            {!isEditMode &&
              displayRooms.flatMap((r) => r.furniture || []).map((item) => renderFurniture(item))}

            {/* Architectural Partition & Exterior Walls */}
            {(currentFloor.interior_walls || []).map((wall) => (
              <line
                key={wall.id}
                x1={wall.x1 * SCALE}
                y1={wall.y1 * SCALE}
                x2={wall.x2 * SCALE}
                y2={wall.y2 * SCALE}
                stroke="#68615A"
                strokeWidth={4}
                strokeLinecap="square"
              />
            ))}

            {(currentFloor.exterior_walls || []).map((wall) => (
              <line
                key={wall.id}
                x1={wall.x1 * SCALE}
                y1={wall.y1 * SCALE}
                x2={wall.x2 * SCALE}
                y2={wall.y2 * SCALE}
                stroke="#FAF8F5"
                strokeWidth={7}
                strokeLinecap="square"
              />
            ))}

            {/* Windows */}
            {(currentFloor.windows || []).map((win) => {
              const wx1 = win.x1 * SCALE;
              const wy1 = win.y1 * SCALE;
              const wx2 = win.x2 * SCALE;
              const wy2 = win.y2 * SCALE;
              return (
                <g key={win.id} pointerEvents="none">
                  <line x1={wx1} y1={wy1} x2={wx2} y2={wy2} stroke="#181716" strokeWidth={8} />
                  <line x1={wx1} y1={wy1} x2={wx2} y2={wy2} stroke="#38BDF8" strokeWidth={2.5} />
                </g>
              );
            })}

            {/* Doors */}
            {(currentFloor.doors || []).map((door) => {
              const dx1 = door.x1 * SCALE;
              const dy1 = door.y1 * SCALE;
              const dx2 = door.x2 * SCALE;
              const dy2 = door.y2 * SCALE;
              const radius = 22;

              return (
                <g key={door.id} pointerEvents="none">
                  <line x1={dx1} y1={dy1} x2={dx2} y2={dy2} stroke="#181716" strokeWidth={7} />
                  <line
                    x1={dx1}
                    y1={dy1}
                    x2={dx1 + (dx1 === dx2 ? radius : 0)}
                    y2={dy1 + (dy1 === dy2 ? radius : 0)}
                    stroke="#C48446"
                    strokeWidth={2}
                  />
                  <path
                    d={`M ${dx1 + (dx1 === dx2 ? radius : 0)} ${dy1 + (dy1 === dy2 ? radius : 0)} A ${radius} ${radius} 0 0 1 ${dx2} ${dy2}`}
                    fill="none"
                    stroke="#C48446"
                    strokeWidth={1}
                    strokeDasharray="2 2"
                  />
                </g>
              );
            })}

            {/* North Arrow Drafting Symbol & Vastu Rose */}
            <g transform={`translate(${svgWidth - 25}, -35)`} pointerEvents="none">
              <circle cx={0} cy={0} r={16} fill="#24211D" stroke="#68615A" strokeWidth={1.5} />
              <polygon points="0,-12 4,2 0,0 -4,2" fill="#C48446" />
              <polygon points="0,0 4,2 0,10 -4,2" fill="#575149" />
              <text x={0} y={-16} textAnchor="middle" fill="#C48446" className="font-mono font-bold text-[10px]">
                N
              </text>
              {layout.vastu_result && (
                <text x={0} y={22} textAnchor="middle" fill="#C48446" className="font-mono text-[7px] tracking-wider font-semibold">
                  VASTU
                </text>
              )}
            </g>

            {/* Graphic Scale Bar */}
            <g transform={`translate(10, ${svgHeight + 35})`} pointerEvents="none">
              <line x1={0} y1={0} x2={SCALE * 20} y2={0} stroke="#A8A29E" strokeWidth={2} />
              <line x1={0} y1={-4} x2={0} y2={4} stroke="#A8A29E" strokeWidth={1.5} />
              <line x1={SCALE * 5} y1={-3} x2={SCALE * 5} y2={3} stroke="#A8A29E" strokeWidth={1} />
              <line x1={SCALE * 10} y1={-4} x2={SCALE * 10} y2={4} stroke="#A8A29E" strokeWidth={1.5} />
              <line x1={SCALE * 20} y1={-4} x2={SCALE * 20} y2={4} stroke="#A8A29E" strokeWidth={1.5} />
              <text x={0} y={12} fill="#A8A29E" className="font-mono text-[8px]">0&apos;</text>
              <text x={SCALE * 5} y={12} textAnchor="middle" fill="#A8A29E" className="font-mono text-[8px]">5&apos;</text>
              <text x={SCALE * 10} y={12} textAnchor="middle" fill="#A8A29E" className="font-mono text-[8px]">10&apos;</text>
              <text x={SCALE * 20} y={12} textAnchor="middle" fill="#A8A29E" className="font-mono text-[8px]">20&apos;</text>
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
};
