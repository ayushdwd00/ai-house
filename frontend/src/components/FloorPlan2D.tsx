"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { HouseLayout, FloorPlan, Room, FurnitureItem } from "@/types/house";
import { generateFallbackLandscape } from "@/utils/landscapeFallback";
import {
  computeCutWalls,
  computeDoorGeometry,
  computeWindowGeometry,
  generateDimensionChains,
} from "@/utils/blueprint2D";
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
  Grid,
  Info,
  X,
  ShieldCheck,
  Trees,
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
  const router = useRouter();
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

  // Structural Column Overlay State
  const [showStructure, setShowStructure] = useState(false);
  const [selectedColumnId, setSelectedColumnId] = useState<string | null>(null);

  // Landscape Overlay State
  const [showLandscape, setShowLandscape] = useState(true);
  const [hoveredLandscapeId, setHoveredLandscapeId] = useState<string | null>(null);

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

  // Active Landscape Layer (Uses layout.landscape if populated, else deterministic fallback)
  const activeLandscape =
    layout.landscape &&
    ((layout.landscape.elements && layout.landscape.elements.length > 0) ||
      (layout.landscape.zones && layout.landscape.zones.length > 0))
      ? layout.landscape
      : generateFallbackLandscape(layout);

  // Architectural cut walls, doors, windows & dimension chains
  const cutExteriorWalls = useMemo(
    () =>
      computeCutWalls(
        currentFloor.exterior_walls || [],
        currentFloor.doors || [],
        currentFloor.windows || [],
        SCALE,
        true
      ),
    [currentFloor.exterior_walls, currentFloor.doors, currentFloor.windows, SCALE]
  );

  const cutInteriorWalls = useMemo(
    () =>
      computeCutWalls(
        currentFloor.interior_walls || [],
        currentFloor.doors || [],
        currentFloor.windows || [],
        SCALE,
        false
      ),
    [currentFloor.interior_walls, currentFloor.doors, currentFloor.windows, SCALE]
  );

  const doorGeometries = useMemo(
    () =>
      (currentFloor.doors || []).map((door, idx) =>
        computeDoorGeometry(door, idx, SCALE)
      ),
    [currentFloor.doors, SCALE]
  );

  const windowGeometries = useMemo(
    () =>
      (currentFloor.windows || []).map((win, idx) =>
        computeWindowGeometry(win, idx, SCALE)
      ),
    [currentFloor.windows, SCALE]
  );

  const dimensionChains = useMemo(
    () => generateDimensionChains(layout.plot_width, layout.plot_length, SCALE),
    [layout.plot_width, layout.plot_length, SCALE]
  );

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

  // Export 2D Map as Image (High Resolution PNG)
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
    const il = (item.depth || item.length) * SCALE;
    const isSelected = selectedFurnitureId === item.id;

    const strokeCol = isSelected ? "#2563EB" : "#334155";
    const strokeW = isSelected ? 2.0 : 1.2;

    const handleFurnitureClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      onSelectFurniture?.(item.id);
    };

    // 1. Bed (King, Queen, Single)
    if (item.type.includes("bed")) {
      const headH = Math.max(6, il * 0.14);
      const pillowW = iw * 0.36;
      const pillowH = Math.min(18, il * 0.22);

      return (
        <g
          key={item.id}
          transform={`rotate(${item.rotation || 0}, ${ix}, ${iy})`}
          onClick={handleFurnitureClick}
          className="cursor-pointer"
        >
          {/* Main Mattress & Base */}
          <rect
            x={ix - iw / 2}
            y={iy - il / 2}
            width={iw}
            height={il}
            rx={3}
            fill="#FFFFFF"
            stroke={strokeCol}
            strokeWidth={strokeW}
          />
          {/* Solid Architectural Headboard */}
          <rect
            x={ix - iw / 2}
            y={iy - il / 2}
            width={iw}
            height={headH}
            rx={2}
            fill="#78350F"
            stroke="#451A03"
            strokeWidth={1}
          />
          {/* Folded Duvet Area */}
          <path
            d={`M ${ix - iw / 2 + 2} ${iy - il / 2 + il * 0.42} Q ${ix} ${iy - il / 2 + il * 0.48} ${ix + iw / 2 - 2} ${iy - il / 2 + il * 0.42} L ${ix + iw / 2 - 2} ${iy + il / 2 - 2} L ${ix - iw / 2 + 2} ${iy + il / 2 - 2} Z`}
            fill="#F1F5F9"
            stroke="#94A3B8"
            strokeWidth={1}
          />
          {/* Pillows */}
          <rect
            x={ix - iw / 2 + iw * 0.08}
            y={iy - il / 2 + headH + 4}
            width={pillowW}
            height={pillowH}
            rx={4}
            fill="#FFFFFF"
            stroke="#64748B"
            strokeWidth={1}
          />
          <rect
            x={ix + iw / 2 - iw * 0.08 - pillowW}
            y={iy - il / 2 + headH + 4}
            width={pillowW}
            height={pillowH}
            rx={4}
            fill="#FFFFFF"
            stroke="#64748B"
            strokeWidth={1}
          />
        </g>
      );
    }

    // 2. Side Table / Nightstand
    if (item.type.includes("side_table") || item.type.includes("nightstand")) {
      return (
        <g
          key={item.id}
          transform={`rotate(${item.rotation || 0}, ${ix}, ${iy})`}
          onClick={handleFurnitureClick}
          className="cursor-pointer"
        >
          <rect
            x={ix - iw / 2}
            y={iy - il / 2}
            width={iw}
            height={il}
            rx={2}
            fill="#FAF5EE"
            stroke={strokeCol}
            strokeWidth={strokeW}
          />
          <line
            x1={ix - iw / 2 + 3}
            y1={iy}
            x2={ix + iw / 2 - 3}
            y2={iy}
            stroke="#94A3B8"
            strokeWidth={0.8}
          />
          <circle cx={ix} cy={iy} r={3} fill="#CBD5E1" stroke="#64748B" strokeWidth={0.8} />
        </g>
      );
    }

    // 3. Wardrobe / Closet
    if (item.type.includes("wardrobe") || item.type.includes("closet")) {
      return (
        <g
          key={item.id}
          transform={`rotate(${item.rotation || 0}, ${ix}, ${iy})`}
          onClick={handleFurnitureClick}
          className="cursor-pointer"
        >
          <rect
            x={ix - iw / 2}
            y={iy - il / 2}
            width={iw}
            height={il}
            rx={1}
            fill="#F3EFE6"
            stroke={strokeCol}
            strokeWidth={strokeW}
          />
          {/* Sliding door separation lines */}
          <line
            x1={ix}
            y1={iy - il / 2}
            x2={ix}
            y2={iy + il / 2}
            stroke="#94A3B8"
            strokeWidth={1.2}
          />
          <line
            x1={ix - iw / 4}
            y1={iy - il / 2 + 4}
            x2={ix - iw / 4}
            y2={iy + il / 2 - 4}
            stroke="#CBD5E1"
            strokeWidth={0.8}
            strokeDasharray="2 2"
          />
          <line
            x1={ix + iw / 4}
            y1={iy - il / 2 + 4}
            x2={ix + iw / 4}
            y2={iy + il / 2 - 4}
            stroke="#CBD5E1"
            strokeWidth={0.8}
            strokeDasharray="2 2"
          />
        </g>
      );
    }

    // 4. Sofa / Living Couch
    if (item.type.includes("sofa") || item.type.includes("couch")) {
      const armW = Math.max(6, iw * 0.12);
      const backH = Math.max(8, il * 0.28);
      const seatW = (iw - 2 * armW) / 3;

      return (
        <g
          key={item.id}
          transform={`rotate(${item.rotation || 0}, ${ix}, ${iy})`}
          onClick={handleFurnitureClick}
          className="cursor-pointer"
        >
          {/* Main Frame */}
          <rect
            x={ix - iw / 2}
            y={iy - il / 2}
            width={iw}
            height={il}
            rx={5}
            fill="#FFFFFF"
            stroke={strokeCol}
            strokeWidth={strokeW}
          />
          {/* Rear Backrest */}
          <rect
            x={ix - iw / 2 + armW}
            y={iy - il / 2}
            width={iw - 2 * armW}
            height={backH}
            rx={2}
            fill="#E2E8F0"
            stroke="#94A3B8"
            strokeWidth={1}
          />
          {/* Left & Right Rounded Armrests */}
          <rect
            x={ix - iw / 2}
            y={iy - il / 2}
            width={armW}
            height={il}
            rx={3}
            fill="#E2E8F0"
            stroke="#94A3B8"
            strokeWidth={1}
          />
          <rect
            x={ix + iw / 2 - armW}
            y={iy - il / 2}
            width={armW}
            height={il}
            rx={3}
            fill="#E2E8F0"
            stroke="#94A3B8"
            strokeWidth={1}
          />
          {/* 3 Individual Seat Cushions */}
          {Array.from({ length: 3 }).map((_, cIdx) => (
            <rect
              key={`sofa_cushion_${cIdx}`}
              x={ix - iw / 2 + armW + cIdx * seatW + 1}
              y={iy - il / 2 + backH + 1}
              width={seatW - 2}
              height={il - backH - 2}
              rx={2}
              fill="#F8FAFC"
              stroke="#CBD5E1"
              strokeWidth={0.8}
            />
          ))}
        </g>
      );
    }

    // 5. Coffee Table
    if (item.type.includes("coffee_table")) {
      return (
        <g
          key={item.id}
          transform={`rotate(${item.rotation || 0}, ${ix}, ${iy})`}
          onClick={handleFurnitureClick}
          className="cursor-pointer"
        >
          <rect
            x={ix - iw / 2}
            y={iy - il / 2}
            width={iw}
            height={il}
            rx={4}
            fill="#FFFFFF"
            stroke={strokeCol}
            strokeWidth={strokeW}
          />
          <rect
            x={ix - iw / 2 + 3}
            y={iy - il / 2 + 3}
            width={iw - 6}
            height={il - 6}
            rx={2}
            fill="#F8FAFC"
            stroke="#CBD5E1"
            strokeWidth={0.8}
          />
        </g>
      );
    }

    // 6. TV Unit / Media Console
    if (item.type.includes("tv")) {
      return (
        <g
          key={item.id}
          transform={`rotate(${item.rotation || 0}, ${ix}, ${iy})`}
          onClick={handleFurnitureClick}
          className="cursor-pointer"
        >
          <rect
            x={ix - iw / 2}
            y={iy - il / 2}
            width={iw}
            height={il}
            rx={1}
            fill="#F8FAFC"
            stroke={strokeCol}
            strokeWidth={strokeW}
          />
          {/* TV Screen Profile */}
          <line
            x1={ix - iw * 0.38}
            y1={iy}
            x2={ix + iw * 0.38}
            y2={iy}
            stroke="#0F172A"
            strokeWidth={2.5}
            strokeLinecap="round"
          />
          <text
            x={ix}
            y={iy + il / 2 - 3}
            textAnchor="middle"
            fill="#64748B"
            className="font-mono text-[7px] font-bold select-none"
          >
            TV
          </text>
        </g>
      );
    }

    // 7. Dining Table & Individual Chairs
    if (item.type.includes("dining_table")) {
      const chairW = Math.min(14, iw * 0.22);
      const chairD = Math.min(12, il * 0.28);

      return (
        <g
          key={item.id}
          transform={`rotate(${item.rotation || 0}, ${ix}, ${iy})`}
          onClick={handleFurnitureClick}
          className="cursor-pointer"
        >
          {/* Main Table Surface */}
          <rect
            x={ix - iw / 2}
            y={iy - il / 2}
            width={iw}
            height={il}
            rx={3}
            fill="#FFFFFF"
            stroke={strokeCol}
            strokeWidth={strokeW}
          />
          {/* Chairs on Top & Bottom */}
          {[-iw * 0.28, 0, iw * 0.28].map((cxOffset, idx) => (
            <React.Fragment key={`chair_${idx}`}>
              {/* Top Chair */}
              <rect
                x={ix + cxOffset - chairW / 2}
                y={iy - il / 2 - chairD - 2}
                width={chairW}
                height={chairD}
                rx={2}
                fill="#F8FAFC"
                stroke="#64748B"
                strokeWidth={1}
              />
              <path
                d={`M ${ix + cxOffset - chairW / 2} ${iy - il / 2 - 2} Q ${ix + cxOffset} ${iy - il / 2 - 5} ${ix + cxOffset + chairW / 2} ${iy - il / 2 - 2}`}
                fill="none"
                stroke="#475569"
                strokeWidth={1.2}
              />
              {/* Bottom Chair */}
              <rect
                x={ix + cxOffset - chairW / 2}
                y={iy + il / 2 + 2}
                width={chairW}
                height={chairD}
                rx={2}
                fill="#F8FAFC"
                stroke="#64748B"
                strokeWidth={1}
              />
              <path
                d={`M ${ix + cxOffset - chairW / 2} ${iy + il / 2 + 2} Q ${ix + cxOffset} ${iy + il / 2 + 5} ${ix + cxOffset + chairW / 2} ${iy + il / 2 + 2}`}
                fill="none"
                stroke="#475569"
                strokeWidth={1.2}
              />
            </React.Fragment>
          ))}
        </g>
      );
    }

    // 8. Kitchen Counter, Hob, Sink, Refrigerator
    if (item.type.includes("kitchen_counter")) {
      return (
        <g
          key={item.id}
          transform={`rotate(${item.rotation || 0}, ${ix}, ${iy})`}
          onClick={handleFurnitureClick}
          className="cursor-pointer"
        >
          <rect
            x={ix - iw / 2}
            y={iy - il / 2}
            width={iw}
            height={il}
            fill="#F8FAFC"
            stroke={strokeCol}
            strokeWidth={strokeW}
          />
          <line
            x1={ix - iw / 2}
            y1={iy + il / 2 - 3}
            x2={ix + iw / 2}
            y2={iy + il / 2 - 3}
            stroke="#CBD5E1"
            strokeWidth={1}
          />
        </g>
      );
    }

    if (item.type.includes("hob") || item.type.includes("cooktop")) {
      return (
        <g
          key={item.id}
          transform={`rotate(${item.rotation || 0}, ${ix}, ${iy})`}
          onClick={handleFurnitureClick}
          className="cursor-pointer"
        >
          <rect
            x={ix - iw / 2}
            y={iy - il / 2}
            width={iw}
            height={il}
            rx={2}
            fill="#1E293B"
            stroke="#0F172A"
            strokeWidth={1}
          />
          {/* 3 Burners */}
          <circle cx={ix - iw * 0.25} cy={iy} r={iw * 0.16} fill="#334155" stroke="#E2E8F0" strokeWidth={1} />
          <circle cx={ix} cy={iy - il * 0.15} r={iw * 0.14} fill="#334155" stroke="#E2E8F0" strokeWidth={1} />
          <circle cx={ix + iw * 0.25} cy={iy} r={iw * 0.16} fill="#334155" stroke="#E2E8F0" strokeWidth={1} />
        </g>
      );
    }

    if (item.type.includes("sink")) {
      return (
        <g
          key={item.id}
          transform={`rotate(${item.rotation || 0}, ${ix}, ${iy})`}
          onClick={handleFurnitureClick}
          className="cursor-pointer"
        >
          <rect
            x={ix - iw / 2}
            y={iy - il / 2}
            width={iw}
            height={il}
            rx={2}
            fill="#F1F5F9"
            stroke="#64748B"
            strokeWidth={1.2}
          />
          {/* Bowl and drainboard */}
          <rect
            x={ix - iw / 2 + 3}
            y={iy - il / 2 + 3}
            width={iw * 0.55}
            height={il - 6}
            rx={2}
            fill="#E2E8F0"
            stroke="#94A3B8"
            strokeWidth={1}
          />
          <circle cx={ix - iw * 0.22} cy={iy} r={3} fill="#64748B" />
          {/* Drainboard grooves */}
          {[-il * 0.2, 0, il * 0.2].map((dy, idx) => (
            <line
              key={`drain_${idx}`}
              x1={ix + iw * 0.15}
              y1={iy + dy}
              x2={ix + iw / 2 - 5}
              y2={iy + dy}
              stroke="#94A3B8"
              strokeWidth={1}
            />
          ))}
        </g>
      );
    }

    if (item.type.includes("fridge") || item.type.includes("refrigerator")) {
      return (
        <g
          key={item.id}
          transform={`rotate(${item.rotation || 0}, ${ix}, ${iy})`}
          onClick={handleFurnitureClick}
          className="cursor-pointer"
        >
          <rect
            x={ix - iw / 2}
            y={iy - il / 2}
            width={iw}
            height={il}
            rx={2}
            fill="#F8FAFC"
            stroke={strokeCol}
            strokeWidth={strokeW}
          />
          <line
            x1={ix - iw / 2}
            y1={iy - il / 2 + il * 0.32}
            x2={ix + iw / 2}
            y2={iy - il / 2 + il * 0.32}
            stroke="#64748B"
            strokeWidth={1.5}
          />
          <text
            x={ix}
            y={iy + il * 0.2}
            textAnchor="middle"
            fill="#64748B"
            className="font-mono text-[8px] font-bold select-none"
          >
            FRIDGE
          </text>
        </g>
      );
    }

    // 9. Bathroom WC / Toilet
    if (item.type.includes("toilet") || item.type.includes("wc")) {
      const tankH = Math.max(6, il * 0.3);
      return (
        <g
          key={item.id}
          transform={`rotate(${item.rotation || 0}, ${ix}, ${iy})`}
          onClick={handleFurnitureClick}
          className="cursor-pointer"
        >
          {/* Cistern Tank */}
          <rect
            x={ix - iw / 2}
            y={iy - il / 2}
            width={iw}
            height={tankH}
            rx={2}
            fill="#FFFFFF"
            stroke={strokeCol}
            strokeWidth={strokeW}
          />
          {/* Oval Toilet Bowl */}
          <ellipse
            cx={ix}
            cy={iy - il / 2 + tankH + (il - tankH) / 2}
            rx={iw * 0.42}
            ry={(il - tankH) * 0.45}
            fill="#FFFFFF"
            stroke={strokeCol}
            strokeWidth={strokeW}
          />
          <ellipse
            cx={ix}
            cy={iy - il / 2 + tankH + (il - tankH) / 2}
            rx={iw * 0.26}
            ry={(il - tankH) * 0.28}
            fill="#F1F5F9"
            stroke="#94A3B8"
            strokeWidth={1}
          />
        </g>
      );
    }

    // 10. Bathroom Basin / Vanity
    if (item.type.includes("basin") || item.type.includes("sink")) {
      return (
        <g
          key={item.id}
          transform={`rotate(${item.rotation || 0}, ${ix}, ${iy})`}
          onClick={handleFurnitureClick}
          className="cursor-pointer"
        >
          <rect
            x={ix - iw / 2}
            y={iy - il / 2}
            width={iw}
            height={il}
            rx={3}
            fill="#FFFFFF"
            stroke={strokeCol}
            strokeWidth={strokeW}
          />
          <ellipse
            cx={ix}
            cy={iy + 2}
            rx={iw * 0.38}
            ry={il * 0.35}
            fill="#F8FAFC"
            stroke="#64748B"
            strokeWidth={1}
          />
          <circle cx={ix} cy={iy + 2} r={2.5} fill="#475569" />
          <line x1={ix} y1={iy - il / 2 + 2} x2={ix} y2={iy - 2} stroke="#334155" strokeWidth={2} />
        </g>
      );
    }

    // 11. Bathroom Shower Stall
    if (item.type.includes("shower")) {
      return (
        <g
          key={item.id}
          transform={`rotate(${item.rotation || 0}, ${ix}, ${iy})`}
          onClick={handleFurnitureClick}
          className="cursor-pointer"
        >
          <rect
            x={ix - iw / 2}
            y={iy - il / 2}
            width={iw}
            height={il}
            rx={2}
            fill="#F1F5F9"
            stroke={strokeCol}
            strokeWidth={strokeW}
          />
          {/* Diagonal Drain Pitch Lines */}
          <line
            x1={ix - iw / 2 + 3}
            y1={iy - il / 2 + 3}
            x2={ix + iw / 2 - 3}
            y2={iy + il / 2 - 3}
            stroke="#CBD5E1"
            strokeWidth={0.8}
            strokeDasharray="3 3"
          />
          <line
            x1={ix + iw / 2 - 3}
            y1={iy - il / 2 + 3}
            x2={ix - iw / 2 + 3}
            y2={iy + il / 2 - 3}
            stroke="#CBD5E1"
            strokeWidth={0.8}
            strokeDasharray="3 3"
          />
          {/* Circular Drain */}
          <circle cx={ix} cy={iy} r={5} fill="#FFFFFF" stroke="#64748B" strokeWidth={1} />
        </g>
      );
    }

    // Default Fallback
    return (
      <rect
        key={item.id}
        x={ix - iw / 2}
        y={iy - il / 2}
        width={iw}
        height={il}
        rx={2}
        fill="#F8FAFC"
        stroke={strokeCol}
        strokeWidth={strokeW}
        onClick={handleFurnitureClick}
        className="cursor-pointer"
      />
    );
  };

  const selectedRoom = displayRooms.find((r) => r.id === selectedRoomId);

  return (
    <div className="relative w-full h-full flex flex-col select-none overflow-hidden bg-[#ECEEF2]">
      {/* 1. TOP FLOATING ACTION BAR: VIEW CONTROLS, EDIT MODE & EXPORT */}
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

        {/* STRUCTURE / COLUMN GRID TOGGLE */}
        <button
          onClick={() => {
            setShowStructure((prev) => !prev);
            if (showStructure) setSelectedColumnId(null);
          }}
          className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-full text-[10px] sm:text-[11px] font-mono tracking-wider transition-all shadow-2xl ${
            showStructure
              ? "bg-[#C48446] text-[#0A0B0E] font-semibold ring-2 ring-[#C48446]/40"
              : "bg-[#12141A]/90 hover:bg-[#1A1D24] text-[#F5F3EF] border border-white/10 hover:border-[#C48446]/40"
          }`}
          title="Toggle preliminary structural column grid and pillar locations"
        >
          <Grid className="w-3 sm:w-3.5 h-3 sm:h-3.5" />
          <span>{showStructure ? "STRUCTURE ON" : "STRUCTURE"}</span>
        </button>

        {/* LANDSCAPE LAYER TOGGLE */}
        <button
          onClick={() => setShowLandscape((prev) => !prev)}
          className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-full text-[10px] sm:text-[11px] font-mono tracking-wider transition-all shadow-2xl ${
            showLandscape
              ? "bg-[#2D6A4F] text-[#F5F3EF] font-semibold ring-2 ring-[#2D6A4F]/40"
              : "bg-[#12141A]/90 hover:bg-[#1A1D24] text-[#F5F3EF] border border-white/10 hover:border-[#2D6A4F]/40"
          }`}
          title="Toggle site landscaping layer (lawns, trees, pathway, driveway, features)"
        >
          <Trees className="w-3 sm:w-3.5 h-3 sm:h-3.5" />
          <span>{showLandscape ? "LANDSCAPE ON" : "LANDSCAPE"}</span>
        </button>

        {/* EDIT IN DEDICATED STUDIO BUTTON */}
        <button
          onClick={() => router.push(`/project/${layout.id}/edit`)}
          className="flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-full text-[10px] sm:text-[11px] font-mono tracking-wider transition-all shadow-2xl bg-[#12141A]/90 hover:bg-[#1A1D24] text-[#F5F3EF] border border-white/10 hover:border-[#C48446]/40"
          title="Open Dedicated Full-Screen Architectural Studio Editor"
        >
          <Move className="w-3 sm:w-3.5 h-3 sm:h-3.5 text-[#C48446]" />
          <span>EDITING</span>
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



      {/* 3. MAIN DRAFTING SVG CANVAS */}
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
                <circle cx={SCALE / 2} cy={SCALE / 2} r={0.7} fill="#CBD5E1" />
              </pattern>

              <pattern id="drafting-grid-major" width={SCALE * 5} height={SCALE * 5} patternUnits="userSpaceOnUse">
                <path d={`M ${SCALE * 5} 0 L 0 0 0 ${SCALE * 5}`} fill="none" stroke="#E2E8F0" strokeWidth="0.8" />
              </pattern>
            </defs>

            {/* Architectural Drafting Sheet Paper Canvas with subtle border */}
            <rect
              x={-padding + 10}
              y={-padding + 10}
              width={svgWidth + padding * 2 - 20}
              height={svgHeight + padding * 2 - 20}
              fill="#FFFFFF"
              stroke="#CBD5E1"
              strokeWidth={1.5}
              rx={4}
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
              stroke="#475569"
              strokeWidth={1.5}
              strokeDasharray="8 4"
            />

            {/* Site Boundary Label */}
            <text x={10} y={-14} fill="#475569" className="font-mono text-[10px] tracking-widest uppercase font-semibold">
              PROPERTY BOUNDARY: {layout.plot_width}&apos; × {layout.plot_length}&apos; (
              {(layout.plot_width * layout.plot_length).toLocaleString()} SQ FT)
            </text>

            {/* Architectural Plot Boundary Dimension Chains */}
            <g id="dimension-chains" pointerEvents="none">
              {/* Top Dimension String */}
              <line
                x1={dimensionChains.top.ext1.x1}
                y1={dimensionChains.top.ext1.y1}
                x2={dimensionChains.top.ext1.x2}
                y2={dimensionChains.top.ext1.y2}
                stroke="#94A3B8"
                strokeWidth={0.8}
              />
              <line
                x1={dimensionChains.top.ext2.x1}
                y1={dimensionChains.top.ext2.y1}
                x2={dimensionChains.top.ext2.x2}
                y2={dimensionChains.top.ext2.y2}
                stroke="#94A3B8"
                strokeWidth={0.8}
              />
              <line
                x1={dimensionChains.top.x1}
                y1={dimensionChains.top.y1}
                x2={dimensionChains.top.x2}
                y2={dimensionChains.top.y2}
                stroke="#334155"
                strokeWidth={1.2}
              />
              {/* 45-degree architectural tick marks */}
              <line
                x1={dimensionChains.top.tick1.x1}
                y1={dimensionChains.top.tick1.y1}
                x2={dimensionChains.top.tick1.x2}
                y2={dimensionChains.top.tick1.y2}
                stroke="#0F172A"
                strokeWidth={1.8}
              />
              <line
                x1={dimensionChains.top.tick2.x1}
                y1={dimensionChains.top.tick2.y1}
                x2={dimensionChains.top.tick2.x2}
                y2={dimensionChains.top.tick2.y2}
                stroke="#0F172A"
                strokeWidth={1.8}
              />
              <rect
                x={dimensionChains.top.textX - 55}
                y={dimensionChains.top.textY - 11}
                width={110}
                height={16}
                fill="#FFFFFF"
                stroke="#CBD5E1"
                strokeWidth={0.8}
                rx={2}
              />
              <text
                x={dimensionChains.top.textX}
                y={dimensionChains.top.textY + 1}
                textAnchor="middle"
                fill="#0F172A"
                className="font-mono text-[8.5px] font-bold select-none"
              >
                {dimensionChains.top.text}
              </text>

              {/* Left Dimension String */}
              <line
                x1={dimensionChains.left.ext1.x1}
                y1={dimensionChains.left.ext1.y1}
                x2={dimensionChains.left.ext1.x2}
                y2={dimensionChains.left.ext1.y2}
                stroke="#94A3B8"
                strokeWidth={0.8}
              />
              <line
                x1={dimensionChains.left.ext2.x1}
                y1={dimensionChains.left.ext2.y1}
                x2={dimensionChains.left.ext2.x2}
                y2={dimensionChains.left.ext2.y2}
                stroke="#94A3B8"
                strokeWidth={0.8}
              />
              <line
                x1={dimensionChains.left.x1}
                y1={dimensionChains.left.y1}
                x2={dimensionChains.left.x2}
                y2={dimensionChains.left.y2}
                stroke="#334155"
                strokeWidth={1.2}
              />
              <line
                x1={dimensionChains.left.tick1.x1}
                y1={dimensionChains.left.tick1.y1}
                x2={dimensionChains.left.tick1.x2}
                y2={dimensionChains.left.tick1.y2}
                stroke="#0F172A"
                strokeWidth={1.8}
              />
              <line
                x1={dimensionChains.left.tick2.x1}
                y1={dimensionChains.left.tick2.y1}
                x2={dimensionChains.left.tick2.x2}
                y2={dimensionChains.left.tick2.y2}
                stroke="#0F172A"
                strokeWidth={1.8}
              />
              <g transform={`rotate(-90, ${dimensionChains.left.textX}, ${dimensionChains.left.textY})`}>
                <rect
                  x={dimensionChains.left.textX - 55}
                  y={dimensionChains.left.textY - 8}
                  width={110}
                  height={16}
                  fill="#FFFFFF"
                  stroke="#CBD5E1"
                  strokeWidth={0.8}
                  rx={2}
                />
                <text
                  x={dimensionChains.left.textX}
                  y={dimensionChains.left.textY + 4}
                  textAnchor="middle"
                  fill="#0F172A"
                  className="font-mono text-[8.5px] font-bold select-none"
                >
                  {dimensionChains.left.text}
                </text>
              </g>
            </g>

            {/* 2D ARCHITECTURAL LANDSCAPE BACKGROUND (LAWNS, DRIVEWAY, PATH) */}
            {showLandscape && activeLandscape && (
              <g id="landscape-background-layer">
                {/* 1. Lawns & Turf Surfaces */}
                {(activeLandscape.elements || [])
                  .filter((e) => e.type === "lawn")
                  .map((lawn) => {
                    const lx = (lawn.x - (lawn.width || 0) / 2) * SCALE;
                    const ly = (lawn.y - (lawn.length || 0) / 2) * SCALE;
                    const lw = (lawn.width || 0) * SCALE;
                    const lh = (lawn.length || 0) * SCALE;
                    return (
                      <g key={lawn.element_id}>
                        <rect
                          x={lx}
                          y={ly}
                          width={lw}
                          height={lh}
                          fill="#EDF7ED"
                          stroke="#81C784"
                          strokeWidth={1.2}
                          strokeDasharray="4 3"
                          rx={3}
                        />
                        <text
                          x={lx + lw / 2}
                          y={ly + lh / 2 + 3}
                          fill="#2E7D32"
                          textAnchor="middle"
                          className="font-mono text-[9px] tracking-widest uppercase font-semibold pointer-events-none select-none"
                          opacity={0.65}
                        >
                          {lawn.zone === "front_garden" ? "FRONT LAWN" : "GARDEN TURF"}
                        </text>
                      </g>
                    );
                  })}

                {/* 2. Vehicular Driveway */}
                {activeLandscape.driveway && (() => {
                  const dw = activeLandscape.driveway;
                  const dx = (dw.x - (dw.width || 0) / 2) * SCALE;
                  const dy = (dw.y - (dw.length || 0) / 2) * SCALE;
                  const dwidth = (dw.width || 0) * SCALE;
                  const dlength = (dw.length || 0) * SCALE;
                  return (
                    <g key={dw.element_id}>
                      <rect
                        x={dx}
                        y={dy}
                        width={dwidth}
                        height={dlength}
                        fill="#F1F5F9"
                        stroke="#94A3B8"
                        strokeWidth={1.2}
                        strokeDasharray="6 3"
                      />
                      <text
                        x={dx + dwidth / 2}
                        y={dy + dlength / 2 + 3}
                        fill="#64748B"
                        textAnchor="middle"
                        className="font-mono text-[8.5px] tracking-wider uppercase font-semibold pointer-events-none select-none"
                      >
                        DRIVEWAY
                      </text>
                    </g>
                  );
                })()}

                {/* 3. Pedestrian Pathway */}
                {(activeLandscape.paths || []).map((p) => {
                  if (!p.points || p.points.length < 2) return null;
                  const pts = p.points.map((pt) => `${pt.x * SCALE},${pt.y * SCALE}`).join(" ");
                  return (
                    <g key={p.element_id}>
                      <polyline
                        points={pts}
                        fill="none"
                        stroke="#E2E8F0"
                        strokeWidth={(p.width || 3.5) * SCALE}
                        strokeLinecap="square"
                        strokeLinejoin="round"
                      />
                      <polyline
                        points={pts}
                        fill="none"
                        stroke="#94A3B8"
                        strokeWidth={1.2}
                        strokeDasharray="4 3"
                      />
                      {p.points.map((pt, pIdx) => (
                        <circle
                          key={`step_${pIdx}`}
                          cx={pt.x * SCALE}
                          cy={pt.y * SCALE}
                          r={5}
                          fill="#CBD5E1"
                          stroke="#64748B"
                          strokeWidth={1}
                        />
                      ))}
                    </g>
                  );
                })}

                {/* 4. Perimeter Hedges / Boundary Planting */}
                {(activeLandscape.elements || [])
                  .filter((e) => e.type === "hedge" || e.type === "boundary_greenery")
                  .map((hedge) => {
                    const hx = (hedge.x - (hedge.width || 0) / 2) * SCALE;
                    const hy = (hedge.y - (hedge.length || 0) / 2) * SCALE;
                    const hw = (hedge.width || 0) * SCALE;
                    const hl = (hedge.length || 0) * SCALE;
                    return (
                      <rect
                        key={hedge.element_id}
                        x={hx}
                        y={hy}
                        width={hw}
                        height={hl}
                        fill="#D1E7DD"
                        stroke="#2D6A4F"
                        strokeWidth={1.2}
                        strokeDasharray="3 2"
                        rx={2}
                      />
                    );
                  })}
              </g>
            )}

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
                    fill={isSelected ? "#EFF6FF" : isHovered ? "#F8FAFC" : "#FFFFFF"}
                    stroke={
                      isEditMode
                        ? isSelected
                          ? "#2563EB"
                          : "#94A3B8"
                        : isSelected
                        ? "#2563EB"
                        : "#CBD5E1"
                    }
                    strokeWidth={isSelected || isEditMode ? 2 : 1}
                    strokeDasharray={isEditMode ? "4 2" : "none"}
                    className="transition-colors duration-150"
                  />

                  {/* Clear Stair Tread Lines for Staircases */}
                  {(room.type === "staircase" || room.name.toLowerCase().includes("stair")) && (
                    <g pointerEvents="none" opacity={0.65}>
                      {Array.from({ length: 8 }).map((_, sIdx) => {
                        const stepY = (rl / 9) * (sIdx + 1);
                        return (
                          <line
                            key={`stair-step-${sIdx}`}
                            x1={4}
                            y1={stepY}
                            x2={rw - 4}
                            y2={stepY}
                            stroke="#64748B"
                            strokeWidth={1.2}
                          />
                        );
                      })}
                      <line x1={rw / 2} y1={rl - 8} x2={rw / 2} y2={12} stroke="#334155" strokeWidth={1.5} />
                      <polygon points={`${rw / 2},6 ${rw / 2 - 4},14 ${rw / 2 + 4},14`} fill="#334155" />
                      <text x={rw / 2 + 8} y={20} fill="#334155" className="font-mono text-[7.5px] font-bold">UP</text>
                    </g>
                  )}

                  {/* Room Name & Dimensions */}
                  <text
                    x={rw / 2}
                    y={rl / 2 - 6}
                    textAnchor="middle"
                    fill={isSelected ? "#1D4ED8" : "#0F172A"}
                    className="font-mono text-[11px] font-semibold tracking-wider pointer-events-none select-none"
                  >
                    {room.name.toUpperCase()}
                  </text>

                  <text
                    x={rw / 2}
                    y={rl / 2 + 10}
                    textAnchor="middle"
                    fill={isSelected ? "#2563EB" : "#64748B"}
                    className="font-mono text-[9px] font-medium pointer-events-none select-none"
                  >
                    {room.rect.width}&apos; × {room.rect.length}&apos; ({room.area_sqft || Math.round(room.rect.width * room.rect.length)} SQ FT)
                  </text>

                  {/* Drag Icon Indicator in Edit Mode */}
                  {isEditMode && (
                    <circle cx={rw - 10} cy={10} r={4} fill="#2563EB" className="pointer-events-none" />
                  )}
                </g>
              );
            })}

            {/* Furniture Symbols (Only visible when not actively dragging edit mode) */}
            {!isEditMode &&
              displayRooms.flatMap((r) => r.furniture || []).map((item) => renderFurniture(item))}

            {/* Architectural Cut Walls (Double-face with Real Thickness & Opening Voids) */}
            {/* 1. Exterior Walls (9" / 18px thickness, rich dark charcoal fill) */}
            {cutExteriorWalls.segments.map((seg) => (
              <line
                key={seg.id}
                x1={seg.x1}
                y1={seg.y1}
                x2={seg.x2}
                y2={seg.y2}
                stroke="#1E293B"
                strokeWidth={seg.thickness}
                strokeLinecap="square"
              />
            ))}

            {/* 2. Interior Partition Walls (4.5" / 10px thickness) */}
            {cutInteriorWalls.segments.map((seg) => (
              <line
                key={seg.id}
                x1={seg.x1}
                y1={seg.y1}
                x2={seg.x2}
                y2={seg.y2}
                stroke="#334155"
                strokeWidth={seg.thickness}
                strokeLinecap="square"
              />
            ))}

            {/* 3. Opening Jamb End-Caps (Returns across wall thickness) */}
            {[...cutExteriorWalls.jambs, ...cutInteriorWalls.jambs].map((jamb, jIdx) => (
              <line
                key={`jamb_${jIdx}`}
                x1={jamb.x - jamb.nx * jamb.halfThick}
                y1={jamb.y - jamb.ny * jamb.halfThick}
                x2={jamb.x + jamb.nx * jamb.halfThick}
                y2={jamb.y + jamb.ny * jamb.halfThick}
                stroke="#0F172A"
                strokeWidth={1.5}
              />
            ))}

            {/* 4. Windows with Glass Glazing, Frame, Chajja Overhang, and Direction Badge */}
            {windowGeometries.map((wGeom) => (
              <g key={wGeom.id} pointerEvents="none">
                {/* Clear Opening Gap */}
                <line
                  x1={wGeom.x1}
                  y1={wGeom.y1}
                  x2={wGeom.x2}
                  y2={wGeom.y2}
                  stroke="#FFFFFF"
                  strokeWidth={18}
                  strokeLinecap="square"
                />

                {/* Chajja / Sunshade Overhang Projection */}
                <path
                  d={wGeom.chajjaPath}
                  fill="none"
                  stroke="#64748B"
                  strokeWidth={1}
                  strokeDasharray="4 2"
                />

                {/* Double Glazing Lines */}
                <line
                  x1={wGeom.glaze1.x1}
                  y1={wGeom.glaze1.y1}
                  x2={wGeom.glaze1.x2}
                  y2={wGeom.glaze1.y2}
                  stroke="#0284C7"
                  strokeWidth={1.5}
                />
                <line
                  x1={wGeom.glaze2.x1}
                  y1={wGeom.glaze2.y1}
                  x2={wGeom.glaze2.x2}
                  y2={wGeom.glaze2.y2}
                  stroke="#0284C7"
                  strokeWidth={1.5}
                />

                {/* Frame Jamb Caps */}
                {wGeom.jambs.map((jb, jIdx) => (
                  <rect
                    key={`win_jb_${jIdx}`}
                    x={jb.x - 2}
                    y={jb.y - 8}
                    width={4}
                    height={16}
                    transform={`rotate(${(jb.angle * 180) / Math.PI}, ${jb.x}, ${jb.y})`}
                    fill="#334155"
                    stroke="#0F172A"
                    strokeWidth={0.8}
                  />
                ))}

                {/* Direction Badge Pill (e.g. W01 · E) */}
                <g transform={`translate(${wGeom.badgeX}, ${wGeom.badgeY})`}>
                  <rect
                    x={-22}
                    y={-7}
                    width={44}
                    height={14}
                    rx={3}
                    fill="#0F172A"
                    stroke="#38BDF8"
                    strokeWidth={0.8}
                  />
                  <text
                    x={0}
                    y={3}
                    textAnchor="middle"
                    fill="#38BDF8"
                    className="font-mono text-[7.5px] font-bold select-none"
                  >
                    {wGeom.label}
                  </text>
                </g>
              </g>
            ))}

            {/* 5. Doors with Wooden Leaf, Circular Swing Arc, Frame Jambs, and Direction Badge */}
            {doorGeometries.map((dGeom) => (
              <g key={dGeom.id} pointerEvents="none">
                {/* Clear Opening Gap in Wall */}
                <line
                  x1={dGeom.hingeX}
                  y1={dGeom.hingeY}
                  x2={dGeom.latchX}
                  y2={dGeom.latchY}
                  stroke="#FFFFFF"
                  strokeWidth={18}
                  strokeLinecap="square"
                />

                {/* Frame Jamb Blocks */}
                {dGeom.jambs.map((jb, jIdx) => (
                  <rect
                    key={`door_jb_${jIdx}`}
                    x={jb.x - 3}
                    y={jb.y - 7}
                    width={6}
                    height={14}
                    transform={`rotate(${(jb.angle * 180) / Math.PI}, ${jb.x}, ${jb.y})`}
                    fill="#451A03"
                    stroke="#1E293B"
                    strokeWidth={0.8}
                  />
                ))}

                {/* Dashed Circular Swing Arc */}
                <path
                  d={dGeom.arcPath}
                  fill="none"
                  stroke="#64748B"
                  strokeWidth={1.2}
                  strokeDasharray="3 3"
                />

                {/* Solid Wood Door Leaf */}
                <line
                  x1={dGeom.hingeX}
                  y1={dGeom.hingeY}
                  x2={dGeom.leafEndX}
                  y2={dGeom.leafEndY}
                  stroke="#78350F"
                  strokeWidth={3}
                  strokeLinecap="round"
                />

                {/* Direction Badge Pill (e.g. D01 · S) */}
                <g transform={`translate(${dGeom.badgeX}, ${dGeom.badgeY})`}>
                  <rect
                    x={-22}
                    y={-7}
                    width={44}
                    height={14}
                    rx={3}
                    fill="#FFFFFF"
                    stroke="#78350F"
                    strokeWidth={1}
                  />
                  <text
                    x={0}
                    y={3}
                    textAnchor="middle"
                    fill="#78350F"
                    className="font-mono text-[7.5px] font-bold select-none"
                  >
                    {dGeom.label}
                  </text>
                </g>
              </g>
            ))}

            {/* STRUCTURAL COLUMN PLANNING OVERLAY (TOGGLEABLE) */}
            {showStructure && (
              <g id="structural-overlay">
                {/* Structural Column Grid Lines */}
                {layout.structural_planning?.grid && (
                  <g pointerEvents="none" opacity={0.65}>
                    {(layout.structural_planning.grid.x_grid_lines || []).map((gx, idx) => (
                      <g key={`grid-x-${idx}`}>
                        <line
                          x1={gx * SCALE}
                          y1={-15}
                          x2={gx * SCALE}
                          y2={svgHeight + 15}
                          stroke="#DC2626"
                          strokeWidth={1}
                          strokeDasharray="4 4"
                        />
                        <circle cx={gx * SCALE} cy={-20} r={7} fill="#FFFFFF" stroke="#DC2626" strokeWidth={1} />
                        <text
                          x={gx * SCALE}
                          y={-17}
                          textAnchor="middle"
                          fill="#DC2626"
                          className="font-mono text-[7.5px] font-bold"
                        >
                          {String.fromCharCode(65 + (idx % 26))}
                        </text>
                      </g>
                    ))}
                    {(layout.structural_planning.grid.y_grid_lines || []).map((gy, idx) => (
                      <g key={`grid-y-${idx}`}>
                        <line
                          x1={-15}
                          y1={gy * SCALE}
                          x2={svgWidth + 15}
                          y2={gy * SCALE}
                          stroke="#DC2626"
                          strokeWidth={1}
                          strokeDasharray="4 4"
                        />
                        <circle cx={-20} cy={gy * SCALE} r={7} fill="#FFFFFF" stroke="#DC2626" strokeWidth={1} />
                        <text
                          x={-20}
                          y={gy * SCALE + 2.5}
                          textAnchor="middle"
                          fill="#DC2626"
                          className="font-mono text-[7.5px] font-bold"
                        >
                          {idx + 1}
                        </text>
                      </g>
                    ))}
                  </g>
                )}

                {/* Structural Columns */}
                {(layout.structural_planning?.columns || []).map((col) => {
                  const cx = col.x * SCALE;
                  const cy = col.y * SCALE;
                  const cw = (col.width || 0.75) * SCALE;
                  const cd = (col.depth || 0.75) * SCALE;
                  const isSelected = selectedColumnId === col.column_id;

                  return (
                    <g
                      key={col.column_id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedColumnId((prev) => (prev === col.column_id ? null : col.column_id));
                      }}
                      className="cursor-pointer"
                    >
                      {/* Selection Halo */}
                      {isSelected && (
                        <rect
                          x={cx - cw / 2 - 4}
                          y={cy - cd / 2 - 4}
                          width={cw + 8}
                          height={cd + 8}
                          rx={3}
                          fill="none"
                          stroke="#2563EB"
                          strokeWidth={2}
                          strokeDasharray="3 3"
                          className="animate-pulse"
                        />
                      )}

                      {/* Distinct Architectural Column Symbol: Dark charcoal solid + cross hatch */}
                      <rect
                        x={cx - cw / 2}
                        y={cy - cd / 2}
                        width={cw}
                        height={cd}
                        fill={isSelected ? "#2563EB" : "#0F172A"}
                        stroke={isSelected ? "#1D4ED8" : "#0F172A"}
                        strokeWidth={isSelected ? 2 : 1.5}
                      />
                      <line
                        x1={cx - cw / 2}
                        y1={cy - cd / 2}
                        x2={cx + cw / 2}
                        y2={cy + cd / 2}
                        stroke={isSelected ? "#FFFFFF" : "#CBD5E1"}
                        strokeWidth={1}
                      />
                      <line
                        x1={cx + cw / 2}
                        y1={cy - cd / 2}
                        x2={cx - cw / 2}
                        y2={cy + cd / 2}
                        stroke={isSelected ? "#FFFFFF" : "#CBD5E1"}
                        strokeWidth={1}
                      />

                      {/* Monospace Column ID pill badge */}
                      <rect
                        x={cx + cw / 2 + 2}
                        y={cy - 6}
                        width={22}
                        height={12}
                        rx={2}
                        fill="#FFFFFF"
                        stroke={isSelected ? "#2563EB" : "#64748B"}
                        strokeWidth={0.8}
                      />
                      <text
                        x={cx + cw / 2 + 13}
                        y={cy + 2.5}
                        textAnchor="middle"
                        fill={isSelected ? "#2563EB" : "#0F172A"}
                        className="font-mono text-[7.5px] font-bold select-none pointer-events-none"
                      >
                        {col.column_id}
                      </text>
                    </g>
                  );
                })}
              </g>
            )}

            {/* 2D ARCHITECTURAL LANDSCAPE FOREGROUND (TREES, LIGHTS, WATER) */}
            {showLandscape && activeLandscape && (
              <g id="landscape-foreground-layer">
                {(activeLandscape.elements || [])
                  .filter((e) =>
                    ["tree", "planter", "outdoor_light", "garden_seating", "water_feature"].includes(e.type)
                  )
                  .map((elem) => {
                    const ex = elem.x * SCALE;
                    const ey = elem.y * SCALE;
                    const r = (elem.radius || 2.5) * SCALE;

                    if (elem.type === "tree") {
                      return (
                        <g
                          key={elem.element_id}
                          transform={`translate(${ex}, ${ey})`}
                          className="cursor-pointer"
                          onMouseEnter={() => setHoveredLandscapeId(elem.element_id)}
                          onMouseLeave={() => setHoveredLandscapeId(null)}
                        >
                          {/* Soft shadow */}
                          <circle cx={2} cy={2} r={r} fill="#000000" fillOpacity={0.06} />
                          {/* Outer Canopy */}
                          <circle
                            cx={0}
                            cy={0}
                            r={r}
                            fill="#C6E6C3"
                            fillOpacity={0.55}
                            stroke="#2D6A4F"
                            strokeWidth={1.5}
                          />
                          {/* Inner Dashed Canopy */}
                          <circle
                            cx={0}
                            cy={0}
                            r={r * 0.75}
                            fill="none"
                            stroke="#40916C"
                            strokeWidth={0.9}
                            strokeDasharray="3 2"
                          />
                          {/* Radial Branches */}
                          <line x1={-r * 0.6} y1={0} x2={r * 0.6} y2={0} stroke="#2D6A4F" strokeWidth={0.8} />
                          <line x1={0} y1={-r * 0.6} x2={0} y2={r * 0.6} stroke="#2D6A4F" strokeWidth={0.8} />
                          <line x1={-r * 0.4} y1={-r * 0.4} x2={r * 0.4} y2={r * 0.4} stroke="#2D6A4F" strokeWidth={0.6} />
                          <line x1={-r * 0.4} y1={r * 0.4} x2={r * 0.4} y2={-r * 0.4} stroke="#2D6A4F" strokeWidth={0.6} />
                          {/* Center Trunk */}
                          <circle cx={0} cy={0} r={2.8} fill="#3E2723" />
                          {/* Hover Tooltip */}
                          {hoveredLandscapeId === elem.element_id && (
                            <g>
                              <rect x={-48} y={-r - 20} width={96} height={16} rx={3} fill="#1E293B" />
                              <text x={0} y={-r - 9} fill="#F8FAFC" textAnchor="middle" className="font-mono text-[8.5px] font-medium">
                                {elem.species || "Specimen Tree"}
                              </text>
                            </g>
                          )}
                        </g>
                      );
                    }

                    if (elem.type === "planter") {
                      const pw = (elem.width || 2.5) * SCALE;
                      const pl = (elem.length || 1.5) * SCALE;
                      return (
                        <g key={elem.element_id} transform={`translate(${ex - pw / 2}, ${ey - pl / 2})`}>
                          <rect x={0} y={0} width={pw} height={pl} fill="#E2E8F0" stroke="#475569" strokeWidth={1.5} rx={1} />
                          <rect x={2} y={2} width={Math.max(1, pw - 4)} height={Math.max(1, pl - 4)} fill="#A7F3D0" fillOpacity={0.6} />
                        </g>
                      );
                    }

                    if (elem.type === "outdoor_light") {
                      return (
                        <g key={elem.element_id} transform={`translate(${ex}, ${ey})`}>
                          <circle cx={0} cy={0} r={6.5} fill="#FEF3C7" fillOpacity={0.6} stroke="#F59E0B" strokeWidth={0.8} />
                          <circle cx={0} cy={0} r={2.2} fill="#B45309" />
                        </g>
                      );
                    }

                    if (elem.type === "garden_seating") {
                      const bw = (elem.width || 4.5) * SCALE;
                      const bl = (elem.length || 1.8) * SCALE;
                      return (
                        <g key={elem.element_id} transform={`translate(${ex - bw / 2}, ${ey - bl / 2})`}>
                          <rect x={0} y={0} width={bw} height={bl} fill="#E2D9C8" stroke="#854D0E" strokeWidth={1.2} rx={2} />
                          <line x1={0} y1={bl * 0.35} x2={bw} y2={bl * 0.35} stroke="#854D0E" strokeWidth={1} />
                        </g>
                      );
                    }

                    if (elem.type === "water_feature") {
                      const wr = (elem.radius || 3) * SCALE;
                      return (
                        <g key={elem.element_id} transform={`translate(${ex}, ${ey})`}>
                          <circle cx={0} cy={0} r={wr} fill="#E0F2FE" stroke="#0284C7" strokeWidth={1.8} />
                          <circle cx={0} cy={0} r={wr * 0.65} fill="none" stroke="#38BDF8" strokeWidth={1} strokeDasharray="3 2" />
                          <circle cx={0} cy={0} r={wr * 0.3} fill="#0284C7" />
                        </g>
                      );
                    }

                    return null;
                  })}
              </g>
            )}

            {/* Architectural Compass Rose & Vastu Orientation */}
            <g transform={`translate(${svgWidth - 45}, -30)`} pointerEvents="none">
              {/* Outer degree ring */}
              <circle cx={0} cy={0} r={22} fill="#FFFFFF" stroke="#334155" strokeWidth={1.5} />
              <circle cx={0} cy={0} r={18} fill="none" stroke="#CBD5E1" strokeWidth={0.8} strokeDasharray="2 2" />
              {/* Crosshairs */}
              <line x1={-20} y1={0} x2={20} y2={0} stroke="#94A3B8" strokeWidth={0.8} />
              <line x1={0} y1={-20} x2={0} y2={20} stroke="#94A3B8" strokeWidth={0.8} />
              {/* North Pointer Needle */}
              <polygon points="0,-18 5,0 0,-2 -5,0" fill="#DC2626" />
              <polygon points="0,0 5,0 0,18 -5,0" fill="#0F172A" />
              {/* Cardinal Labels */}
              <text x={0} y={-24} textAnchor="middle" fill="#DC2626" className="font-mono font-bold text-[10px]">
                N
              </text>
              <text x={0} y={30} textAnchor="middle" fill="#64748B" className="font-mono font-semibold text-[8px]">
                S
              </text>
              <text x={28} y={3} textAnchor="middle" fill="#64748B" className="font-mono font-semibold text-[8px]">
                E
              </text>
              <text x={-28} y={3} textAnchor="middle" fill="#64748B" className="font-mono font-semibold text-[8px]">
                W
              </text>
            </g>

            {/* Architectural Graphic Scale Bar */}
            <g transform={`translate(10, ${svgHeight + 35})`} pointerEvents="none">
              <line x1={0} y1={0} x2={SCALE * 20} y2={0} stroke="#0F172A" strokeWidth={2.5} />
              <line x1={0} y1={-5} x2={0} y2={5} stroke="#0F172A" strokeWidth={2} />
              <line x1={SCALE * 5} y1={-3.5} x2={SCALE * 5} y2={3.5} stroke="#0F172A" strokeWidth={1.2} />
              <line x1={SCALE * 10} y1={-5} x2={SCALE * 10} y2={5} stroke="#0F172A" strokeWidth={2} />
              <line x1={SCALE * 20} y1={-5} x2={SCALE * 20} y2={5} stroke="#0F172A" strokeWidth={2} />
              <text x={0} y={14} fill="#0F172A" className="font-mono text-[8px] font-bold">0&apos;</text>
              <text x={SCALE * 5} y={14} textAnchor="middle" fill="#475569" className="font-mono text-[8px] font-semibold">5&apos;</text>
              <text x={SCALE * 10} y={14} textAnchor="middle" fill="#475569" className="font-mono text-[8px] font-semibold">10&apos;</text>
              <text x={SCALE * 20} y={14} textAnchor="middle" fill="#0F172A" className="font-mono text-[8px] font-bold">20&apos; (6.1m)</text>
              <text x={SCALE * 10} y={26} textAnchor="middle" fill="#64748B" className="font-mono text-[7px] tracking-wider uppercase">GRAPHIC BAR SCALE</text>
            </g>

            {/* Architectural Master Blueprint Title Block */}
            <g transform={`translate(${Math.max(0, svgWidth - 280)}, ${svgHeight + 20})`} pointerEvents="none">
              <rect
                x={0}
                y={0}
                width={280}
                height={55}
                fill="#FFFFFF"
                stroke="#0F172A"
                strokeWidth={1.5}
                rx={2}
              />
              <line x1={0} y1={20} x2={280} y2={20} stroke="#CBD5E1" strokeWidth={1} />
              <line x1={175} y1={20} x2={175} y2={55} stroke="#CBD5E1" strokeWidth={1} />
              {/* Title Header */}
              <text x={10} y={14} fill="#0F172A" className="font-mono text-[10px] font-extrabold tracking-wider">
                {currentFloor.floor_name ? currentFloor.floor_name.toUpperCase() : "GROUND FLOOR"} BLUEPRINT
              </text>
              <text x={270} y={14} textAnchor="end" fill="#DC2626" className="font-mono text-[8px] font-bold tracking-widest">
                DK-STYLE ARCH
              </text>
              {/* Details Left */}
              <text x={10} y={32} fill="#64748B" className="font-mono text-[8px]">
                PLOT: <tspan fill="#0F172A" fontWeight="bold">{layout.plot_width}&apos; × {layout.plot_length}&apos;</tspan> ({layout.plot_width * layout.plot_length} SQ FT)
              </text>
              <text x={10} y={46} fill="#64748B" className="font-mono text-[8px]">
                BUILT-UP: <tspan fill="#0F172A" fontWeight="bold">{layout.total_area_sqft || Math.round(displayRooms.reduce((acc, r) => acc + (r.area_sqft || (r.rect ? r.rect.width * r.rect.length : 0)), 0))} SQ FT</tspan>
              </text>
              {/* Details Right */}
              <text x={185} y={32} fill="#64748B" className="font-mono text-[8px]">
                FACING: <tspan fill="#0F172A" fontWeight="bold">{layout.facing || "EAST"}</tspan>
              </text>
              <text x={185} y={46} fill="#2563EB" className="font-mono text-[8px] font-semibold">
                SCALE: 1/4&quot; = 1&apos;-0&quot;
              </text>
            </g>
          </svg>
        </div>
      </div>

      {/* 4. INTERACTIVE COLUMN INFORMATION CARD (WHEN SELECTED) */}
      {showStructure && selectedColumnId && (() => {
        const col = (layout.structural_planning?.columns || []).find((c) => c.column_id === selectedColumnId);
        if (!col) return null;

        return (
          <div className="absolute bottom-6 left-6 z-40 w-80 bg-[#12141A]/95 backdrop-blur-md border border-[#C48446]/40 rounded-2xl p-4 shadow-2xl text-[#F5F3EF]">
            <div className="flex items-start justify-between pb-2 border-b border-white/10">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#C48446]/15 border border-[#C48446]/30 flex items-center justify-center text-[#C48446] font-mono font-bold text-xs">
                  {col.column_id}
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-[#F5F3EF]">
                    Column {col.column_id}
                  </h4>
                  <span className="text-[10px] font-mono uppercase text-[#C48446] tracking-wider">
                    {col.column_type.replace(/_/g, " ")}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedColumnId(null)}
                className="w-6 h-6 rounded-full bg-white/5 hover:bg-white/10 text-[#9E9C98] hover:text-white flex items-center justify-center transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="mt-3 space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-white/5">
                <span className="text-[#9E9C98] font-light">Dimensions</span>
                <span className="font-mono font-medium text-[#F5F3EF]">
                  {col.width} ft × {col.depth} ft ({Math.round(col.width * 12)}&quot; × {Math.round(col.depth * 12)}&quot;)
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/5">
                <span className="text-[#9E9C98] font-light">Coordinates</span>
                <span className="font-mono text-[#F5F3EF]">
                  X: {col.x} ft, Y: {col.y} ft
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/5">
                <span className="text-[#9E9C98] font-light">Serving Floors</span>
                <span className="font-mono text-[#F5F3EF]">
                  {col.floors ? col.floors.map((f) => `Floor ${f}`).join(", ") : "Ground Floor"}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/5">
                <span className="text-[#9E9C98] font-light">Confidence</span>
                <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 text-[10px] font-mono font-semibold">
                  {col.confidence}
                </span>
              </div>
            </div>

            {/* Engineering Disclaimer */}
            <div className="mt-3 pt-2.5 border-t border-white/10 flex items-start gap-2 text-[10px] text-[#9E9C98] font-light leading-relaxed">
              <Info className="w-3.5 h-3.5 text-[#C48446] shrink-0 mt-0.5" />
              <span>
                Preliminary structural planning — final column size, spacing, reinforcement and foundation design require structural-engineer verification.
              </span>
            </div>
          </div>
        );
      })()}

      {/* Structure Status Banner (When structure mode is on but no column selected) */}
      {showStructure && !selectedColumnId && layout.structural_planning && (
        <div className="absolute bottom-6 left-6 z-30 flex items-center gap-2.5 px-4 py-2 rounded-full bg-[#12141A]/90 backdrop-blur-md border border-white/10 text-xs font-mono text-[#9E9C98] shadow-xl">
          <Grid className="w-3.5 h-3.5 text-[#C48446]" />
          <span>
            {layout.structural_planning.column_count || layout.structural_planning.columns?.length || 0} PRELIMINARY COLUMNS (RCC FRAME)
          </span>
          <span className="text-white/20">|</span>
          <span className="text-[10px] text-[#C48446]">CLICK ANY COLUMN TO INSPECT</span>
        </div>
      )}

      {/* Landscape Status Banner (When landscape layer is enabled) */}
      {showLandscape && activeLandscape && (
        <div className="absolute bottom-6 right-6 z-30 hidden md:flex items-center gap-2.5 px-4 py-2 rounded-full bg-[#12141A]/90 backdrop-blur-md border border-white/10 text-xs font-mono text-[#9E9C98] shadow-xl">
          <Trees className="w-3.5 h-3.5 text-[#2D6A4F]" />
          <span className="text-[#F5F3EF] font-medium">{activeLandscape.style || "SITE LANDSCAPE"}</span>
          <span className="text-white/20">|</span>
          <span>{activeLandscape.total_green_area_sqft} SQ FT GREENERY ({activeLandscape.green_coverage_percentage}%)</span>
          <span className="text-white/20">|</span>
          <span>{activeLandscape.trees_count} TREES · {activeLandscape.lights_count} LIGHTS</span>
        </div>
      )}
    </div>
  );
};
