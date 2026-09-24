"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { HouseLayout, FloorPlan, Room, FurnitureItem, Door, Window } from "@/types/house";
import { generateFallbackLandscape } from "@/utils/landscapeFallback";
import {
  computeCutWalls,
  computeDoorGeometry,
  computeWindowGeometry,
  generateDimensionChains,
} from "@/utils/blueprint2D";
import { refineHouseLayout, editRoomLayoutFull } from "@/utils/api";
import { validateAndSanitizeHouseLayout } from "@/utils/layoutValidator";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Download,
  RotateCcw,
  RotateCw,
  Sparkles,
  Loader2,
  Grid,
  Info,
  X,
  Trees,
  ArrowLeft,
  Save,
  Check,
  Plus,
  Minus,
  Trash2,
  Compass,
  Layers,
  Send,
  Sliders,
  AlertTriangle,
} from "lucide-react";

export type PlanMode = "view" | "edit";

export function feetToArchitectural(feet: number): string {
  const totalInches = Math.round(feet * 12);
  const ft = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return `${ft}'-${inches}"`;
}

export function parseArchitecturalDimension(input: string): number | null {
  if (!input) return null;
  const trimmed = input.trim();
  const asFloat = parseFloat(trimmed);
  if (!isNaN(asFloat) && !trimmed.includes("'") && !trimmed.includes('"')) {
    return asFloat > 0 ? asFloat : null;
  }
  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*(?:'|ft|feet)?(?:\s*(\d+(?:\.\d+)?)\s*(?:"|in|inch|inches)?)?$/i);
  if (match) {
    const feet = parseFloat(match[1]) || 0;
    const inches = match[2] ? parseFloat(match[2]) : 0;
    const total = feet + inches / 12;
    return total > 0 ? total : null;
  }
  return null;
}

export function getRoomMinimumDimensions(type: string): { minWidth: number; minLength: number } {
  const clean = (type || "").toLowerCase();
  if (clean.includes("bath") || clean.includes("toilet") || clean.includes("powder")) {
    return { minWidth: 3.5, minLength: 5.5 };
  }
  if (clean.includes("master") || clean.includes("primary")) {
    return { minWidth: 10.0, minLength: 11.0 };
  }
  if (clean.includes("bed")) {
    return { minWidth: 8.5, minLength: 9.5 };
  }
  if (clean.includes("living") || clean.includes("drawing") || clean.includes("hall")) {
    return { minWidth: 10.0, minLength: 12.0 };
  }
  if (clean.includes("kitchen")) {
    return { minWidth: 6.5, minLength: 7.5 };
  }
  if (clean.includes("dining")) {
    return { minWidth: 7.5, minLength: 8.5 };
  }
  if (clean.includes("pooja") || clean.includes("mandir")) {
    return { minWidth: 3.5, minLength: 4.5 };
  }
  if (clean.includes("utility") || clean.includes("store")) {
    return { minWidth: 4.0, minLength: 5.0 };
  }
  if (clean.includes("balcony") || clean.includes("terrace")) {
    return { minWidth: 3.5, minLength: 5.0 };
  }
  if (clean.includes("garage") || clean.includes("parking")) {
    return { minWidth: 9.0, minLength: 15.0 };
  }
  return { minWidth: 5.0, minLength: 5.0 };
}

export interface ArchitecturalPlanRendererProps {
  layout: HouseLayout;
  mode?: PlanMode;
  activeFloorIndex?: number;
  onSelectFloor?: (index: number) => void;
  onUpdateLayout?: (newLayout: HouseLayout) => void;
  onSave?: (savedLayout: HouseLayout) => Promise<void> | void;
  selectedRoomId?: string | null;
  selectedFurnitureId?: string | null;
  onSelectRoom?: (roomId: string | null) => void;
  onSelectFurniture?: (furnitureId: string | null) => void;
  onBack?: () => void;
}

interface DraggingRoomState {
  roomId: string;
  startMouseX: number;
  startMouseY: number;
  initialX: number;
  initialY: number;
}

interface DraggingFurnitureState {
  furnitureId: string;
  roomId: string;
  startMouseX: number;
  startMouseY: number;
  initialX: number;
  initialY: number;
}

interface ResizingRoomState {
  roomId: string;
  edge: "top" | "bottom" | "left" | "right" | "top-left" | "top-right" | "bottom-left" | "bottom-right";
  startMouseX: number;
  startMouseY: number;
  initialRect: { x: number; y: number; width: number; length: number };
}

export const ArchitecturalPlanRenderer: React.FC<ArchitecturalPlanRendererProps> = ({
  layout: initialLayout,
  mode = "view",
  activeFloorIndex = 0,
  onSelectFloor,
  onUpdateLayout,
  onSave,
  selectedRoomId: externalSelectedRoomId,
  selectedFurnitureId: externalSelectedFurnitureId,
  onSelectRoom: externalOnSelectRoom,
  onSelectFurniture: externalOnSelectFurniture,
  onBack,
}) => {
  const router = useRouter();

  // Internal working layout state (for live editing & undo/redo)
  const [layout, setLayout] = useState<HouseLayout>(initialLayout);
  const lastProjectRef = useRef<string>(initialLayout.id || "");
  useEffect(() => {
    // Only re-sync from initialLayout if the project ID actually changed (e.g. user loaded different layout)
    if (initialLayout.id && initialLayout.id !== lastProjectRef.current) {
      lastProjectRef.current = initialLayout.id;
      setLayout(initialLayout);
      setHistory([initialLayout]);
      setHistoryIndex(0);
    }
  }, [initialLayout]);

  // Undo / Redo History Stack
  const [history, setHistory] = useState<HouseLayout[]>([initialLayout]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const pushSnapshot = useCallback((newLayout: HouseLayout) => {
    setHistory((prev) => {
      const next = prev.slice(0, historyIndex + 1);
      return [...next, JSON.parse(JSON.stringify(newLayout))];
    });
    setHistoryIndex((prev) => prev + 1);
    setLayout(newLayout);
    onUpdateLayout?.(newLayout);
  }, [historyIndex, onUpdateLayout]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const nextIdx = historyIndex - 1;
      setHistoryIndex(nextIdx);
      const prevLayout = history[nextIdx];
      setLayout(prevLayout);
      onUpdateLayout?.(prevLayout);
    }
  }, [historyIndex, history, onUpdateLayout]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextIdx = historyIndex + 1;
      setHistoryIndex(nextIdx);
      const nextLayout = history[nextIdx];
      setLayout(nextLayout);
      onUpdateLayout?.(nextLayout);
    }
  }, [historyIndex, history, onUpdateLayout]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  // Selections
  const [internalSelectedRoomId, setInternalSelectedRoomId] = useState<string | null>(null);
  const [internalSelectedFurnitureId, setInternalSelectedFurnitureId] = useState<string | null>(null);
  const [selectedDoorId, setSelectedDoorId] = useState<string | null>(null);
  const [selectedWindowId, setSelectedWindowId] = useState<string | null>(null);

  const selectedRoomId = externalSelectedRoomId !== undefined ? externalSelectedRoomId : internalSelectedRoomId;
  const selectedFurnitureId = externalSelectedFurnitureId !== undefined ? externalSelectedFurnitureId : internalSelectedFurnitureId;

  const handleSelectRoom = (id: string | null) => {
    if (externalOnSelectRoom) {
      externalOnSelectRoom(id);
    } else {
      setInternalSelectedRoomId(id);
    }
    if (id) {
      if (externalOnSelectFurniture) externalOnSelectFurniture(null);
      setInternalSelectedFurnitureId(null);
      setSelectedDoorId(null);
      setSelectedWindowId(null);
    }
  };

  const handleSelectFurniture = (id: string | null) => {
    if (externalOnSelectFurniture) {
      externalOnSelectFurniture(id);
    } else {
      setInternalSelectedFurnitureId(id);
    }
    if (id) {
      handleSelectRoom(null);
      setSelectedDoorId(null);
      setSelectedWindowId(null);
    }
  };

  // Canvas Transform (Pan & Zoom)
  const [zoom, setZoom] = useState(1.0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Overlays
  const [showStructure, setShowStructure] = useState(false);
  const [showLandscape, setShowLandscape] = useState(true);
  const [hoveredRoom, setHoveredRoom] = useState<Room | null>(null);
  const [hoveredLandscapeId, setHoveredLandscapeId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // AI Architect Popover
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [aiNotice, setAiNotice] = useState<string | null>(null);

  // Dragging & Resizing States
  const [draggingRoom, setDraggingRoom] = useState<DraggingRoomState | null>(null);
  const [draggingFurniture, setDraggingFurniture] = useState<DraggingFurnitureState | null>(null);
  const [resizingRoom, setResizingRoom] = useState<ResizingRoomState | null>(null);

  // Contextual Exact Dimension Inputs & Notices
  const [exactWidthInput, setExactWidthInput] = useState("");
  const [exactLengthInput, setExactLengthInput] = useState("");
  const [editNotice, setEditNotice] = useState<string | null>(null);
  const [isApplyingExact, setIsApplyingExact] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Active Floor & Coordinate Scaling (1 foot = 24 SVG pixels)
  const SCALE = 24;
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

  const svgWidth = (layout.plot_width || 50) * SCALE;
  const svgHeight = (layout.plot_length || 70) * SCALE;
  const padding = 80;

  // Auto-fit to viewport on mount
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const availableWidth = rect.width - 60;
    const availableHeight = rect.height - 60;
    const totalDocW = svgWidth + padding * 2;
    const totalDocH = svgHeight + padding * 2;
    const fitScale = Math.min(availableWidth / totalDocW, availableHeight / totalDocH, 1.3);
    const clampedScale = Math.max(0.65, Math.min(1.4, fitScale));
    setZoom(clampedScale);
    setPan({ x: 0, y: 0 });
  }, [svgWidth, svgHeight, padding]);

  // Landscape Layer
  const activeLandscape = useMemo(() => {
    return layout.landscape &&
      ((layout.landscape.elements && layout.landscape.elements.length > 0) ||
        (layout.landscape.zones && layout.landscape.zones.length > 0))
      ? layout.landscape
      : generateFallbackLandscape(layout);
  }, [layout]);

  // Wall Cuts, Doors, Windows, Dimensions
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

  // Wheel Zoom
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

  // Keyboard Shortcuts (Undo / Redo / Deselect)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          if (canRedo) redo();
        } else {
          if (canUndo) undo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === "y") {
        e.preventDefault();
        if (canRedo) redo();
      } else if (e.key === "Escape") {
        handleSelectRoom(null);
        handleSelectFurniture(null);
        setSelectedDoorId(null);
        setSelectedWindowId(null);
        setIsAiOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canUndo, canRedo, undo, redo]);

  // Global Mouse Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    // Only pan if middle click or background left click
    if (e.button === 1 || (e.button === 0 && !draggingRoom && !draggingFurniture && !resizingRoom)) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning && !draggingRoom && !draggingFurniture && !resizingRoom) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
      return;
    }

    if (mode !== "edit") return;

    // 1. Room Dragging
    if (draggingRoom) {
      const deltaXFeet = (e.clientX - draggingRoom.startMouseX) / (SCALE * zoom);
      const deltaYFeet = (e.clientY - draggingRoom.startMouseY) / (SCALE * zoom);

      const targetRoom = (currentFloor.rooms || []).find((r) => r.id === draggingRoom.roomId);
      if (!targetRoom || !targetRoom.rect) return;

      const rawX = draggingRoom.initialX + deltaXFeet;
      const rawY = draggingRoom.initialY + deltaYFeet;

      const roomW = targetRoom.rect.width;
      const roomL = targetRoom.rect.length;
      const clampedX = Math.max(1, Math.min(layout.plot_width - roomW - 1, Math.round(rawX * 2) / 2));
      const clampedY = Math.max(1, Math.min(layout.plot_length - roomL - 1, Math.round(rawY * 2) / 2));

      setLayout((prev) => {
        const nextFloors = prev.floors ? [...prev.floors] : [];
        if (nextFloors[activeFloorIndex]) {
          nextFloors[activeFloorIndex] = {
            ...nextFloors[activeFloorIndex],
            rooms: nextFloors[activeFloorIndex].rooms.map((r) =>
              r.id === draggingRoom.roomId ? { ...r, rect: { ...r.rect, x: clampedX, y: clampedY } } : r
            ),
          };
          return { ...prev, floors: nextFloors };
        }
        return {
          ...prev,
          rooms: (prev.rooms || []).map((r) =>
            r.id === draggingRoom.roomId ? { ...r, rect: { ...r.rect, x: clampedX, y: clampedY } } : r
          ),
        };
      });
    }

    // 2. Furniture Dragging
    else if (draggingFurniture) {
      const deltaXFeet = (e.clientX - draggingFurniture.startMouseX) / (SCALE * zoom);
      const deltaYFeet = (e.clientY - draggingFurniture.startMouseY) / (SCALE * zoom);

      const rawX = draggingFurniture.initialX + deltaXFeet;
      const rawY = draggingFurniture.initialY + deltaYFeet;
      const clampedX = Math.max(0.5, Math.min(layout.plot_width - 0.5, Math.round(rawX * 2) / 2));
      const clampedY = Math.max(0.5, Math.min(layout.plot_length - 0.5, Math.round(rawY * 2) / 2));

      setLayout((prev) => {
        const nextFloors = prev.floors ? [...prev.floors] : [];
        if (nextFloors[activeFloorIndex]) {
          nextFloors[activeFloorIndex] = {
            ...nextFloors[activeFloorIndex],
            rooms: nextFloors[activeFloorIndex].rooms.map((r) => ({
              ...r,
              furniture: (r.furniture || []).map((f) =>
                f.id === draggingFurniture.furnitureId ? { ...f, x: clampedX, y: clampedY } : f
              ),
            })),
          };
          return { ...prev, floors: nextFloors };
        }
        return {
          ...prev,
          rooms: (prev.rooms || []).map((r) => ({
            ...r,
            furniture: (r.furniture || []).map((f) =>
              f.id === draggingFurniture.furnitureId ? { ...f, x: clampedX, y: clampedY } : f
            ),
          })),
        };
      });
    }

    // 3. Room Edge / Corner Resizing
    else if (resizingRoom) {
      const deltaXFeet = (e.clientX - resizingRoom.startMouseX) / (SCALE * zoom);
      const deltaYFeet = (e.clientY - resizingRoom.startMouseY) / (SCALE * zoom);
      const orig = resizingRoom.initialRect;
      const targetRoom = (currentFloor.rooms || []).find((r) => r.id === resizingRoom.roomId);
      const minDims = getRoomMinimumDimensions(targetRoom?.type || "");

      // 6-inch (0.5 ft) standard snap, or 0.1 ft fine snap when holding Shift
      const snapStep = e.shiftKey ? 0.1 : 0.5;

      let newX = orig.x;
      let newY = orig.y;
      let newW = orig.width;
      let newL = orig.length;

      if (resizingRoom.edge.includes("right")) {
        const rawW = orig.width + deltaXFeet;
        const snappedW = Math.round(rawW / snapStep) * snapStep;
        newW = Math.max(minDims.minWidth, Math.min(layout.plot_width - orig.x - 1, snappedW));
      }
      if (resizingRoom.edge.includes("left")) {
        const rawW = orig.width - deltaXFeet;
        const snappedW = Math.round(rawW / snapStep) * snapStep;
        if (snappedW >= minDims.minWidth) {
          const changeInW = orig.width - snappedW;
          newX = Math.max(1, orig.x + changeInW);
          newW = snappedW;
        }
      }
      if (resizingRoom.edge.includes("bottom")) {
        const rawL = orig.length + deltaYFeet;
        const snappedL = Math.round(rawL / snapStep) * snapStep;
        newL = Math.max(minDims.minLength, Math.min(layout.plot_length - orig.y - 1, snappedL));
      }
      if (resizingRoom.edge.includes("top")) {
        const rawL = orig.length - deltaYFeet;
        const snappedL = Math.round(rawL / snapStep) * snapStep;
        if (snappedL >= minDims.minLength) {
          const changeInL = orig.length - snappedL;
          newY = Math.max(1, orig.y + changeInL);
          newL = snappedL;
        }
      }

      setLayout((prev) => {
        const nextFloors = prev.floors ? [...prev.floors] : [];
        if (nextFloors[activeFloorIndex]) {
          nextFloors[activeFloorIndex] = {
            ...nextFloors[activeFloorIndex],
            rooms: nextFloors[activeFloorIndex].rooms.map((r) =>
              r.id === resizingRoom.roomId
                ? {
                    ...r,
                    rect: { x: newX, y: newY, width: newW, length: newL },
                    area_sqft: Math.round(newW * newL),
                  }
                : r
            ),
          };
          return { ...prev, floors: nextFloors };
        }
        return {
          ...prev,
          rooms: (prev.rooms || []).map((r) =>
            r.id === resizingRoom.roomId
              ? {
                  ...r,
                  rect: { x: newX, y: newY, width: newW, length: newL },
                  area_sqft: Math.round(newW * newL),
                }
              : r
          ),
        };
      });
    }
  };

  const handleMouseUp = async () => {
    setIsPanning(false);

    if (resizingRoom) {
      const activeResizing = resizingRoom;
      setResizingRoom(null);
      const targetRoom = (currentFloor.rooms || []).find((r) => r.id === activeResizing.roomId);
      if (targetRoom && targetRoom.rect) {
        try {
          const res = await editRoomLayoutFull(
            layout,
            targetRoom.id,
            {
              x: targetRoom.rect.x,
              y: targetRoom.rect.y,
              width: targetRoom.rect.width,
              length: targetRoom.rect.length,
            },
            true
          );

          if (res && res.success && res.layout) {
            setLayout(res.layout);
            pushSnapshot(res.layout);
            onSave?.(res.layout);
            if (res.affected_rooms && res.affected_rooms.length > 0) {
              setEditNotice(`Adjusted ${res.affected_rooms.join(", ")} along shared boundary.`);
            }
          } else if (res && !res.success) {
            setEditNotice(res.message || "Could not resize room due to minimum or boundary constraints.");
            // Revert room rect to initial
            setLayout((prev) => {
              const nextFloors = prev.floors ? [...prev.floors] : [];
              if (nextFloors[activeFloorIndex]) {
                nextFloors[activeFloorIndex] = {
                  ...nextFloors[activeFloorIndex],
                  rooms: nextFloors[activeFloorIndex].rooms.map((r) =>
                    r.id === activeResizing.roomId ? { ...r, rect: activeResizing.initialRect } : r
                  ),
                };
                return { ...prev, floors: nextFloors };
              }
              return prev;
            });
          }
        } catch {
          pushSnapshot(layout);
        }
      } else {
        pushSnapshot(layout);
      }
    } else if (draggingRoom) {
      const activeDrag = draggingRoom;
      setDraggingRoom(null);
      const targetRoom = (currentFloor.rooms || []).find((r) => r.id === activeDrag.roomId);
      if (targetRoom && targetRoom.rect) {
        try {
          const res = await editRoomLayoutFull(
            layout,
            targetRoom.id,
            {
              x: targetRoom.rect.x,
              y: targetRoom.rect.y,
              width: targetRoom.rect.width,
              length: targetRoom.rect.length,
            },
            true
          );
          if (res && res.success && res.layout) {
            setLayout(res.layout);
            pushSnapshot(res.layout);
            onSave?.(res.layout);
          } else {
            pushSnapshot(layout);
          }
        } catch {
          pushSnapshot(layout);
        }
      } else {
        pushSnapshot(layout);
      }
    } else if (draggingFurniture) {
      pushSnapshot(layout);
      setDraggingFurniture(null);
    }
  };

  const handleApplyExactDimensions = async () => {
    if (!selectedRoomId) return;
    const room = (currentFloor.rooms || []).find((r) => r.id === selectedRoomId);
    if (!room || !room.rect) return;

    let targetW = parseArchitecturalDimension(exactWidthInput);
    let targetL = parseArchitecturalDimension(exactLengthInput);

    if (targetW === null || targetL === null) {
      setEditNotice("Please enter valid dimensions (e.g. 13'-0\" or 13.5).");
      return;
    }

    const minDims = getRoomMinimumDimensions(room.type);
    let correctedNotice = "";
    if (targetW < minDims.minWidth) {
      targetW = minDims.minWidth;
      correctedNotice = `Auto-corrected ${room.name} to minimum width of ${feetToArchitectural(minDims.minWidth)}.`;
    }
    if (targetL < minDims.minLength) {
      targetL = minDims.minLength;
      correctedNotice = `Auto-corrected ${room.name} to minimum length of ${feetToArchitectural(minDims.minLength)}.`;
    }

    setIsApplyingExact(true);
    try {
      const res = await editRoomLayoutFull(
        layout,
        room.id,
        {
          x: room.rect.x,
          y: room.rect.y,
          width: targetW,
          length: targetL,
        },
        true
      );

      if (res && res.success && res.layout) {
        setLayout(res.layout);
        pushSnapshot(res.layout);
        onSave?.(res.layout);
        setExactWidthInput(feetToArchitectural(targetW));
        setExactLengthInput(feetToArchitectural(targetL));
        if (correctedNotice) {
          setEditNotice(correctedNotice);
        } else if (res.affected_rooms && res.affected_rooms.length > 0) {
          setEditNotice(`Adjusted ${res.affected_rooms.join(", ")} along shared boundary.`);
        } else {
          setEditNotice(`Updated ${room.name} to ${feetToArchitectural(targetW)} × ${feetToArchitectural(targetL)}.`);
        }
      } else {
        setEditNotice(res?.message || "Could not apply dimensions due to boundary constraints.");
      }
    } catch (err: any) {
      setEditNotice(err?.message || "Error updating room dimensions.");
    } finally {
      setIsApplyingExact(false);
    }
  };

  // Reset View to Fit
  const handleResetView = () => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const availableWidth = rect.width - 60;
    const availableHeight = rect.height - 60;
    const totalDocW = svgWidth + padding * 2;
    const totalDocH = svgHeight + padding * 2;
    const fitScale = Math.min(availableWidth / totalDocW, availableHeight / totalDocH, 1.3);
    setZoom(Math.max(0.65, Math.min(1.4, fitScale)));
    setPan({ x: 0, y: 0 });
  };

  // Save changes
  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (onSave) {
        await onSave(layout);
      }
      setSaveSuccessNotice(true);
      setTimeout(() => setSaveSuccessNotice(false), 2400);
    } catch (err) {
      console.error("Save error:", err);
    } finally {
      setIsSaving(false);
    }
  };

  // Stepper Resizing on Selected Room
  const handleStepResizeRoom = (dimension: "width" | "length", delta: number) => {
    if (!selectedRoomId) return;
    const updatedRooms = (currentFloor.rooms || []).map((r) => {
      if (r.id !== selectedRoomId || !r.rect) return r;
      const currentW = r.rect.width;
      const currentL = r.rect.length;
      const newW = dimension === "width" ? Math.max(6, Math.min(45, currentW + delta)) : currentW;
      const newL = dimension === "length" ? Math.max(6, Math.min(45, currentL + delta)) : currentL;
      return {
        ...r,
        rect: { ...r.rect, width: newW, length: newL },
        area_sqft: Math.round(newW * newL),
      };
    });

    const nextFloors = layout.floors
      ? layout.floors.map((f, idx) => (idx === activeFloorIndex ? { ...f, rooms: updatedRooms } : f))
      : [];
    const nextLayout: HouseLayout = {
      ...layout,
      floors: nextFloors.length > 0 ? nextFloors : (layout.floors || []),
      rooms: updatedRooms,
    };
    pushSnapshot(nextLayout);
  };

  // Rotate Selected Furniture
  const handleRotateFurniture = () => {
    if (!selectedFurnitureId) return;
    const nextFloors = layout.floors
      ? layout.floors.map((f, idx) =>
          idx === activeFloorIndex
            ? {
                ...f,
                rooms: f.rooms.map((r) => ({
                  ...r,
                  furniture: (r.furniture || []).map((item) =>
                    item.id === selectedFurnitureId
                      ? { ...item, rotation: ((item.rotation || 0) + 90) % 360 }
                      : item
                  ),
                })),
              }
            : f
        )
      : [];
    const nextLayout: HouseLayout = {
      ...layout,
      floors: nextFloors.length > 0 ? nextFloors : (layout.floors || []),
      rooms: (layout.rooms || []).map((r) => ({
        ...r,
        furniture: (r.furniture || []).map((item) =>
          item.id === selectedFurnitureId
            ? { ...item, rotation: ((item.rotation || 0) + 90) % 360 }
            : item
        ),
      })),
    };
    pushSnapshot(nextLayout);
  };

  // Delete Selected Entity
  const handleDeleteSelected = () => {
    if (selectedFurnitureId) {
      const nextFloors = layout.floors
        ? layout.floors.map((f, idx) =>
            idx === activeFloorIndex
              ? {
                  ...f,
                  rooms: f.rooms.map((r) => ({
                    ...r,
                    furniture: (r.furniture || []).filter((item) => item.id !== selectedFurnitureId),
                  })),
                }
              : f
          )
        : [];
      const nextLayout: HouseLayout = {
        ...layout,
        floors: nextFloors.length > 0 ? nextFloors : (layout.floors || []),
        rooms: (layout.rooms || []).map((r) => ({
          ...r,
          furniture: (r.furniture || []).filter((item) => item.id !== selectedFurnitureId),
        })),
      };
      handleSelectFurniture(null);
      pushSnapshot(nextLayout);
    } else if (selectedRoomId) {
      const nextFloors = layout.floors
        ? layout.floors.map((f, idx) =>
            idx === activeFloorIndex
              ? {
                  ...f,
                  rooms: f.rooms.filter((r) => r.id !== selectedRoomId),
                }
              : f
          )
        : [];
      const nextLayout: HouseLayout = {
        ...layout,
        floors: nextFloors.length > 0 ? nextFloors : (layout.floors || []),
        rooms: (layout.rooms || []).filter((r) => r.id !== selectedRoomId),
      };
      handleSelectRoom(null);
      pushSnapshot(nextLayout);
    } else if (selectedDoorId) {
      const nextDoors = (currentFloor.doors || []).filter((d) => d.id !== selectedDoorId);
      const nextFloors = layout.floors
        ? layout.floors.map((f, idx) => (idx === activeFloorIndex ? { ...f, doors: nextDoors } : f))
        : [];
      const nextLayout: HouseLayout = {
        ...layout,
        floors: nextFloors.length > 0 ? nextFloors : (layout.floors || []),
        doors: nextDoors,
      };
      setSelectedDoorId(null);
      pushSnapshot(nextLayout);
    } else if (selectedWindowId) {
      const nextWindows = (currentFloor.windows || []).filter((w) => w.id !== selectedWindowId);
      const nextFloors = layout.floors
        ? layout.floors.map((f, idx) => (idx === activeFloorIndex ? { ...f, windows: nextWindows } : f))
        : [];
      const nextLayout: HouseLayout = {
        ...layout,
        floors: nextFloors.length > 0 ? nextFloors : (layout.floors || []),
        windows: nextWindows,
      };
      setSelectedWindowId(null);
      pushSnapshot(nextLayout);
    }
  };

  // Flip Door Swing
  const handleFlipDoorSwing = () => {
    if (!selectedDoorId) return;
    const nextDoors = (currentFloor.doors || []).map((d) => {
      if (d.id !== selectedDoorId) return d;
      return {
        ...d,
        swing: d.swing === "inward" ? ("outward" as const) : ("inward" as const),
      };
    });
    const nextFloors = layout.floors
      ? layout.floors.map((f, idx) => (idx === activeFloorIndex ? { ...f, doors: nextDoors } : f))
      : [];
    const nextLayout: HouseLayout = {
      ...layout,
      floors: nextFloors.length > 0 ? nextFloors : (layout.floors || []),
      doors: nextDoors,
    };
    pushSnapshot(nextLayout);
  };

  // AI Architect Quick Actions & Natural Language Refinement
  const handleAiAction = async (promptText: string) => {
    if (!promptText.trim() || isAiProcessing) return;
    setIsAiProcessing(true);
    setAiNotice(null);

    try {
      const refined = await refineHouseLayout(layout, promptText, selectedRoomId);
      const sanitized = validateAndSanitizeHouseLayout(refined) || refined;
      pushSnapshot(sanitized);
      setAiNotice(
        sanitized.designer_rationale ||
          `Executed: "${promptText}". Layout adjusted with verified wall geometry and circulation.`
      );
      setAiPrompt("");
    } catch (err) {
      console.error("AI Architect refinement failed:", err);
      setAiNotice("Could not execute modification while satisfying boundaries. Please try with different parameters.");
    } finally {
      setIsAiProcessing(false);
    }
  };

  // Export 2D Blueprint as PNG
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
        const exportScale = 2.0;
        canvas.width = (svgWidth + padding * 2) * exportScale;
        canvas.height = (svgHeight + padding * 2) * exportScale;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          setIsExporting(false);
          return;
        }

        ctx.fillStyle = "#ECEEF2";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);

        const a = document.createElement("a");
        a.href = canvas.toDataURL("image/png");
        a.download = `${(layout.title || "Residence").replace(/[^a-zA-Z0-9]/g, "_")}_Blueprint.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setIsExporting(false);
      };

      img.onerror = () => setIsExporting(false);
      img.src = url;
    } catch (err) {
      console.error("Export error:", err);
      setIsExporting(false);
    }
  };

  // Render individual 2D CAD furniture symbols
  const renderFurniture = (item: FurnitureItem, roomId: string) => {
    const ix = item.x * SCALE;
    const iy = item.y * SCALE;
    const iw = item.width * SCALE;
    const il = (item.depth || item.length) * SCALE;
    const isSelected = selectedFurnitureId === item.id;

    const strokeCol = isSelected ? "#C48446" : "#334155";
    const strokeW = isSelected ? 2.5 : 1.2;

    const handleFurnitureClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      handleSelectFurniture(item.id);
    };

    const handleFurnitureMouseDown = (e: React.MouseEvent) => {
      if (mode !== "edit") return;
      e.stopPropagation();
      handleSelectFurniture(item.id);
      setDraggingFurniture({
        furnitureId: item.id,
        roomId: roomId,
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        initialX: item.x,
        initialY: item.y,
      });
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
          onMouseDown={handleFurnitureMouseDown}
          className={`${mode === "edit" ? "cursor-move" : "cursor-pointer"}`}
        >
          <rect
            x={ix - iw / 2}
            y={iy - il / 2}
            width={iw}
            height={il}
            rx={3}
            fill={isSelected ? "#FFFDF9" : "#FFFFFF"}
            stroke={strokeCol}
            strokeWidth={strokeW}
          />
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
          <path
            d={`M ${ix - iw / 2 + 2} ${iy - il / 2 + il * 0.42} Q ${ix} ${iy - il / 2 + il * 0.48} ${ix + iw / 2 - 2} ${iy - il / 2 + il * 0.42} L ${ix + iw / 2 - 2} ${iy + il / 2 - 2} L ${ix - iw / 2 + 2} ${iy + il / 2 - 2} Z`}
            fill="#F1F5F9"
            stroke="#94A3B8"
            strokeWidth={1}
          />
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
          {isSelected && mode === "edit" && (
            <circle cx={ix} cy={iy - il / 2 - 8} r={4} fill="#C48446" />
          )}
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
          onMouseDown={handleFurnitureMouseDown}
          className={`${mode === "edit" ? "cursor-move" : "cursor-pointer"}`}
        >
          <rect
            x={ix - iw / 2}
            y={iy - il / 2}
            width={iw}
            height={il}
            rx={2}
            fill={isSelected ? "#FFFDF9" : "#FAF5EE"}
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
          {isSelected && mode === "edit" && (
            <circle cx={ix} cy={iy - il / 2 - 6} r={3.5} fill="#C48446" />
          )}
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
          onMouseDown={handleFurnitureMouseDown}
          className={`${mode === "edit" ? "cursor-move" : "cursor-pointer"}`}
        >
          <rect
            x={ix - iw / 2}
            y={iy - il / 2}
            width={iw}
            height={il}
            rx={1}
            fill={isSelected ? "#FFFDF9" : "#F3EFE6"}
            stroke={strokeCol}
            strokeWidth={strokeW}
          />
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
          {isSelected && mode === "edit" && (
            <circle cx={ix} cy={iy - il / 2 - 6} r={3.5} fill="#C48446" />
          )}
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
          onMouseDown={handleFurnitureMouseDown}
          className={`${mode === "edit" ? "cursor-move" : "cursor-pointer"}`}
        >
          <rect
            x={ix - iw / 2}
            y={iy - il / 2}
            width={iw}
            height={il}
            rx={5}
            fill={isSelected ? "#FFFDF9" : "#FFFFFF"}
            stroke={strokeCol}
            strokeWidth={strokeW}
          />
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
          {isSelected && mode === "edit" && (
            <circle cx={ix} cy={iy - il / 2 - 8} r={4} fill="#C48446" />
          )}
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
          onMouseDown={handleFurnitureMouseDown}
          className={`${mode === "edit" ? "cursor-move" : "cursor-pointer"}`}
        >
          <rect
            x={ix - iw / 2}
            y={iy - il / 2}
            width={iw}
            height={il}
            rx={4}
            fill={isSelected ? "#FFFDF9" : "#FFFFFF"}
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

    // 6. Dining Table & Chairs
    if (item.type.includes("dining_table")) {
      const chairW = Math.min(14, iw * 0.22);
      const chairD = Math.min(12, il * 0.28);

      return (
        <g
          key={item.id}
          transform={`rotate(${item.rotation || 0}, ${ix}, ${iy})`}
          onClick={handleFurnitureClick}
          onMouseDown={handleFurnitureMouseDown}
          className={`${mode === "edit" ? "cursor-move" : "cursor-pointer"}`}
        >
          <rect
            x={ix - iw / 2}
            y={iy - il / 2}
            width={iw}
            height={il}
            rx={3}
            fill={isSelected ? "#FFFDF9" : "#FFFFFF"}
            stroke={strokeCol}
            strokeWidth={strokeW}
          />
          {[-iw * 0.28, 0, iw * 0.28].map((cxOffset, idx) => (
            <React.Fragment key={`chair_${idx}`}>
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
            </React.Fragment>
          ))}
          {isSelected && mode === "edit" && (
            <circle cx={ix} cy={iy - il / 2 - 8} r={4} fill="#C48446" />
          )}
        </g>
      );
    }

    // 7. Kitchen Counter & Appliances
    if (item.type.includes("kitchen_counter")) {
      return (
        <g
          key={item.id}
          transform={`rotate(${item.rotation || 0}, ${ix}, ${iy})`}
          onClick={handleFurnitureClick}
          onMouseDown={handleFurnitureMouseDown}
          className={`${mode === "edit" ? "cursor-move" : "cursor-pointer"}`}
        >
          <rect
            x={ix - iw / 2}
            y={iy - il / 2}
            width={iw}
            height={il}
            fill={isSelected ? "#FFFDF9" : "#F8FAFC"}
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
          onMouseDown={handleFurnitureMouseDown}
          className={`${mode === "edit" ? "cursor-move" : "cursor-pointer"}`}
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
          onMouseDown={handleFurnitureMouseDown}
          className={`${mode === "edit" ? "cursor-move" : "cursor-pointer"}`}
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
        </g>
      );
    }

    // 8. Bathroom WC / Toilet
    if (item.type.includes("toilet") || item.type.includes("wc")) {
      const tankH = Math.max(6, il * 0.3);
      return (
        <g
          key={item.id}
          transform={`rotate(${item.rotation || 0}, ${ix}, ${iy})`}
          onClick={handleFurnitureClick}
          onMouseDown={handleFurnitureMouseDown}
          className={`${mode === "edit" ? "cursor-move" : "cursor-pointer"}`}
        >
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

    // 9. Bathroom Basin / Vanity
    if (item.type.includes("basin") || item.type.includes("vanity")) {
      return (
        <g
          key={item.id}
          transform={`rotate(${item.rotation || 0}, ${ix}, ${iy})`}
          onClick={handleFurnitureClick}
          onMouseDown={handleFurnitureMouseDown}
          className={`${mode === "edit" ? "cursor-move" : "cursor-pointer"}`}
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
        </g>
      );
    }

    // 10. Shower
    if (item.type.includes("shower")) {
      return (
        <g
          key={item.id}
          transform={`rotate(${item.rotation || 0}, ${ix}, ${iy})`}
          onClick={handleFurnitureClick}
          onMouseDown={handleFurnitureMouseDown}
          className={`${mode === "edit" ? "cursor-move" : "cursor-pointer"}`}
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
          <circle cx={ix} cy={iy} r={5} fill="#FFFFFF" stroke="#64748B" strokeWidth={1} />
        </g>
      );
    }

    // Default Fallback
    return (
      <g
        key={item.id}
        transform={`rotate(${item.rotation || 0}, ${ix}, ${iy})`}
        onClick={handleFurnitureClick}
        onMouseDown={handleFurnitureMouseDown}
        className={`${mode === "edit" ? "cursor-move" : "cursor-pointer"}`}
      >
        <rect
          x={ix - iw / 2}
          y={iy - il / 2}
          width={iw}
          height={il}
          rx={2}
          fill={isSelected ? "#FFFDF9" : "#F8FAFC"}
          stroke={strokeCol}
          strokeWidth={strokeW}
        />
        {isSelected && mode === "edit" && (
          <circle cx={ix} cy={iy - il / 2 - 8} r={4} fill="#C48446" />
        )}
      </g>
    );
  };

  // Selected Room Object
  const selectedRoom = (currentFloor.rooms || []).find((r) => r.id === selectedRoomId);
  const selectedFurniture = (currentFloor.rooms || [])
    .flatMap((r) => r.furniture || [])
    .find((f) => f.id === selectedFurnitureId);
  const selectedDoor = (currentFloor.doors || []).find((d) => d.id === selectedDoorId);
  const selectedWindow = (currentFloor.windows || []).find((w) => w.id === selectedWindowId);

  return (
    <div className="relative w-full h-full flex flex-col select-none overflow-hidden bg-[#ECEEF2]">
      {/* 1. MINIMAL ARCHITECTURAL STUDIO TOP BAR */}
      <div className="absolute top-4 sm:top-5 left-4 sm:left-6 right-4 sm:right-6 z-30 flex items-center justify-between pointer-events-none">
        {/* Left: Back Link & Minimal Studio Title */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {onBack ? (
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#12141A]/90 hover:bg-[#1A1D24] text-[#F5F3EF] border border-white/10 text-xs font-mono tracking-wider shadow-lg transition-all"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-[#C48446]" />
              <span>EXIT</span>
            </button>
          ) : (
            <button
              onClick={() => router.push(`/project/${layout.id}/plan`)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#12141A]/90 hover:bg-[#1A1D24] text-[#F5F3EF] border border-white/10 text-xs font-mono tracking-wider shadow-lg transition-all"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-[#C48446]" />
              <span>PLAN</span>
            </button>
          )}

          {/* Mode Badge */}
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#12141A]/90 text-[#F5F3EF] border border-white/10 text-[11px] font-mono tracking-wider shadow-lg">
            <span className="w-2 h-2 rounded-full bg-[#C48446] animate-pulse" />
            <span className="font-semibold text-[#F5F3EF]">
              {mode === "edit" ? "EDIT MODE" : "BLUEPRINT PRESENTATION"}
            </span>
          </div>

          {/* Adaptive Small Plot Optimization Note */}
          {Boolean((layout as any)?.metadata?.optimization_note) && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#12141A]/90 text-amber-200 border border-amber-500/30 text-[11px] font-mono tracking-wide shadow-lg">
              <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>{String((layout as any)?.metadata?.optimization_note)}</span>
            </div>
          )}

          {/* Floor Level Switcher (If multi-story) */}
          {layout.floors && layout.floors.length > 1 && onSelectFloor && (
            <div className="flex items-center p-0.5 rounded-full bg-[#12141A]/90 border border-white/10 shadow-lg text-[10px] font-mono text-[#9E9C98]">
              {layout.floors.map((fl, idx) => (
                <button
                  key={fl.floor_number}
                  onClick={() => onSelectFloor(idx)}
                  className={`px-2.5 py-1 rounded-full transition-all ${
                    activeFloorIndex === idx
                      ? "bg-[#C48446] text-[#0A0B0E] font-medium shadow-sm"
                      : "hover:text-[#F5F3EF]"
                  }`}
                >
                  {fl.floor_name ? fl.floor_name.replace(" Floor", "").toUpperCase() : idx === 0 ? "GROUND" : idx === 1 ? "FIRST" : idx === 2 ? "SECOND" : `L${fl.floor_number}`}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: Minimal Undo/Redo & Save Controls */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {mode === "edit" && (
            <>
              {/* Undo / Redo */}
              <div className="flex items-center p-0.5 rounded-full bg-[#12141A]/90 border border-white/10 shadow-lg text-[11px] font-mono text-[#9E9C98]">
                <button
                  onClick={undo}
                  disabled={!canUndo}
                  className="p-1.5 rounded-full hover:bg-white/5 text-[#9E9C98] hover:text-[#F5F3EF] disabled:opacity-30 transition-colors"
                  title="Undo (Ctrl+Z)"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={redo}
                  disabled={!canRedo}
                  className="p-1.5 rounded-full hover:bg-white/5 text-[#9E9C98] hover:text-[#F5F3EF] disabled:opacity-30 transition-colors"
                  title="Redo (Ctrl+Y)"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Save Button */}
              <button
                onClick={handleSave}
                disabled={isSaving}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-mono tracking-wider shadow-lg transition-all ${
                  saveSuccessNotice
                    ? "bg-[#2D6A4F] text-white"
                    : "bg-[#C48446] hover:bg-[#D49456] text-[#0A0B0E] font-semibold"
                }`}
                title="Save Architectural Plan Changes"
              >
                {isSaving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : saveSuccessNotice ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>{saveSuccessNotice ? "SAVED" : "SAVE"}</span>
              </button>
            </>
          )}

          {/* Export PNG */}
          <button
            onClick={handleExportPNG}
            disabled={isExporting}
            className="p-1.5 rounded-full bg-[#12141A]/90 hover:bg-[#1A1D24] text-[#9E9C98] hover:text-[#F5F3EF] border border-white/10 shadow-lg transition-all disabled:opacity-50"
            title="Export Architectural Drawing (PNG)"
          >
            {isExporting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* 2. CONTEXTUAL FLOATING TOOLBAR (APPEARS NEAR SELECTION) */}
      {mode === "edit" && (selectedRoom || selectedFurniture || selectedDoor || selectedWindow) && (
        <div className="absolute top-16 sm:top-18 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 p-1 rounded-full bg-[#12141A]/95 backdrop-blur-md border border-[#C48446]/40 shadow-2xl text-xs font-mono text-[#F5F3EF] animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Room Selection Controls: Exact Dimension Inputs & Steppers */}
          {selectedRoom && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="px-2.5 py-1 text-[#C48446] font-bold truncate max-w-[140px]">
                {selectedRoom.name.toUpperCase()}
              </div>
              <div className="h-4 w-px bg-white/10" />

              {/* Exact Width input */}
              <div className="flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded-full border border-white/10">
                <span className="text-[10px] text-[#9E9C98]">W:</span>
                <input
                  type="text"
                  value={exactWidthInput}
                  onChange={(e) => setExactWidthInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleApplyExactDimensions();
                  }}
                  className="w-16 bg-transparent text-center font-mono text-xs text-[#F5F3EF] focus:outline-none focus:text-[#C48446]"
                  placeholder="13'-0&quot;"
                  title="Width (e.g. 13'-0&quot; or 13.5)"
                />
              </div>

              <span className="text-white/30 text-[10px]">×</span>

              {/* Exact Length / Depth input */}
              <div className="flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded-full border border-white/10">
                <span className="text-[10px] text-[#9E9C98]">D:</span>
                <input
                  type="text"
                  value={exactLengthInput}
                  onChange={(e) => setExactLengthInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleApplyExactDimensions();
                  }}
                  className="w-16 bg-transparent text-center font-mono text-xs text-[#F5F3EF] focus:outline-none focus:text-[#C48446]"
                  placeholder="14'-0&quot;"
                  title="Depth / Length (e.g. 14'-0&quot; or 14.0)"
                />
              </div>

              {/* Apply Button */}
              <button
                type="button"
                onClick={handleApplyExactDimensions}
                disabled={isApplyingExact}
                className="px-2.5 py-1 rounded-full bg-[#C48446] text-[#0A0B0E] font-bold text-[10px] hover:bg-[#D49354] transition-all flex items-center gap-1 disabled:opacity-50"
                title="Apply Exact Dimensions"
              >
                {isApplyingExact ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3 stroke-[2.5]" />}
                <span>APPLY</span>
              </button>

              <div className="h-4 w-px bg-white/10" />

              {/* Steppers */}
              <button
                onClick={() => handleStepResizeRoom("width", 1)}
                className="px-1.5 py-0.5 rounded-full hover:bg-white/10 text-[10px] text-[#9E9C98] hover:text-[#F5F3EF]"
                title="Expand Width +1ft"
              >
                +1&apos;W
              </button>
              <button
                onClick={() => handleStepResizeRoom("width", -1)}
                className="px-1.5 py-0.5 rounded-full hover:bg-white/10 text-[10px] text-[#9E9C98] hover:text-[#F5F3EF]"
                title="Shrink Width -1ft"
              >
                -1&apos;W
              </button>
              <button
                onClick={() => handleStepResizeRoom("length", 1)}
                className="px-1.5 py-0.5 rounded-full hover:bg-white/10 text-[10px] text-[#9E9C98] hover:text-[#F5F3EF]"
                title="Expand Length +1ft"
              >
                +1&apos;L
              </button>
              <button
                onClick={() => handleStepResizeRoom("length", -1)}
                className="px-1.5 py-0.5 rounded-full hover:bg-white/10 text-[10px] text-[#9E9C98] hover:text-[#F5F3EF]"
                title="Shrink Length -1ft"
              >
                -1&apos;L
              </button>
            </div>
          )}

          {/* Furniture Selection Controls */}
          {selectedFurniture && (
            <>
              <div className="px-3 py-1 text-[#C48446] font-bold uppercase">
                {selectedFurniture.type.replace(/_/g, " ")}
              </div>
              <div className="h-4 w-px bg-white/10" />
              <button
                onClick={handleRotateFurniture}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 text-[#F5F3EF]"
                title="Rotate 90 Degrees"
              >
                <RotateCw className="w-3 h-3 text-[#C48446]" />
                <span>ROTATE 90°</span>
              </button>
            </>
          )}

          {/* Door Controls */}
          {selectedDoor && (
            <>
              <div className="px-3 py-1 text-[#C48446] font-bold uppercase">
                DOOR {selectedDoor.id}
              </div>
              <div className="h-4 w-px bg-white/10" />
              <button
                onClick={handleFlipDoorSwing}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 text-[#F5F3EF]"
                title="Flip Swing Direction"
              >
                <RotateCw className="w-3 h-3 text-[#C48446]" />
                <span>FLIP SWING</span>
              </button>
            </>
          )}

          {/* Window Controls */}
          {selectedWindow && (
            <div className="px-3 py-1 text-[#C48446] font-bold uppercase">
              WINDOW {selectedWindow.id} ({selectedWindow.width}&apos; {selectedWindow.outward_direction || selectedWindow.orientation || "EXT"} WALL)
            </div>
          )}

          <div className="h-4 w-px bg-white/10" />

          {/* Delete Entity */}
          <button
            onClick={handleDeleteSelected}
            className="p-1.5 rounded-full hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors"
            title="Delete Selected Item"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          {/* Close Context Toolbar */}
          <button
            onClick={() => {
              handleSelectRoom(null);
              handleSelectFurniture(null);
              setSelectedDoorId(null);
              setSelectedWindowId(null);
            }}
            className="p-1 rounded-full hover:bg-white/10 text-[#9E9C98] hover:text-[#F5F3EF]"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* EDIT NOTICE / CONSTRAINT WARNING BANNER */}
      {editNotice && (
        <div className="absolute top-28 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-full bg-[#12141A]/95 border border-[#C48446]/60 shadow-2xl text-xs font-mono text-[#F5F3EF] flex items-center gap-2.5 animate-in fade-in slide-in-from-top-1 duration-200">
          <Info className="w-4 h-4 text-[#C48446] shrink-0" />
          <span>{editNotice}</span>
          <button
            onClick={() => setEditNotice(null)}
            className="ml-2 text-[#9E9C98] hover:text-white p-0.5 rounded-full hover:bg-white/10"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* 3. LEFT FLOATING AI ARCHITECT BUTTON & POPOVER */}
      {mode === "edit" && (
        <div className="absolute top-20 left-4 sm:left-6 z-30 flex flex-col items-start pointer-events-auto">
          <button
            onClick={() => setIsAiOpen((prev) => !prev)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-mono tracking-wider shadow-xl transition-all ${
              isAiOpen
                ? "bg-[#C48446] text-[#0A0B0E] font-bold ring-2 ring-[#C48446]/40"
                : "bg-[#12141A]/90 hover:bg-[#1A1D24] text-[#F5F3EF] border border-white/10 hover:border-[#C48446]/40"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-[#C48446]" />
            <span>✦ AI ARCHITECT</span>
          </button>

          {/* Collapsible Popover Card */}
          {isAiOpen && (
            <div className="mt-2 w-80 p-4 rounded-2xl bg-[#12141A]/95 backdrop-blur-md border border-white/10 shadow-2xl text-[#F5F3EF] animate-in fade-in slide-in-from-left-2 duration-200">
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#C48446]" />
                  <span className="font-mono text-xs font-semibold uppercase tracking-wider">
                    Architectural Assistant
                  </span>
                </div>
                <button
                  onClick={() => setIsAiOpen(false)}
                  className="p-1 rounded-full hover:bg-white/10 text-[#9E9C98] hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Quick Prompt Chips */}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {[
                  "Enlarge living room by 2ft",
                  "Optimize bedroom circulation",
                  "Add a walk-in wardrobe",
                  "Align dining with kitchen",
                  "Maximize master bedroom",
                ].map((chip) => (
                  <button
                    key={chip}
                    onClick={() => handleAiAction(chip)}
                    disabled={isAiProcessing}
                    className="px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 text-[10px] font-mono text-[#9E9C98] hover:text-[#F5F3EF] border border-white/5 transition-all text-left"
                  >
                    {chip}
                  </button>
                ))}
              </div>

              {/* Notice */}
              {aiNotice && (
                <div className="mt-3 p-2 rounded-lg bg-[#C48446]/10 border border-[#C48446]/20 text-[11px] font-mono text-[#C48446] leading-relaxed">
                  {aiNotice}
                </div>
              )}

              {/* Custom Input */}
              <div className="mt-3 flex items-center gap-2">
                <input
                  type="text"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleAiAction(aiPrompt);
                    }
                  }}
                  placeholder="Request architectural change..."
                  disabled={isAiProcessing}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-xs font-mono text-[#F5F3EF] placeholder-[#9E9C98] focus:outline-none focus:border-[#C48446]"
                />
                <button
                  onClick={() => handleAiAction(aiPrompt)}
                  disabled={isAiProcessing || !aiPrompt.trim()}
                  className="p-2 rounded-lg bg-[#C48446] hover:bg-[#D49456] text-[#0A0B0E] disabled:opacity-30 transition-colors"
                >
                  {isAiProcessing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. MAIN DRAFTING SVG CANVAS */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleResetView}
        className={`w-full h-full flex items-center justify-center p-4 ${
          isPanning ? "cursor-grabbing" : "cursor-default"
        }`}
      >
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "center center",
            transition: isPanning || draggingRoom || draggingFurniture || resizingRoom ? "none" : "transform 0.12s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
          className="flex items-center justify-center"
        >
          <svg
            ref={svgRef}
            id="architectural-svg"
            width={svgWidth + padding * 2}
            height={svgHeight + padding * 2}
            viewBox={`-${padding} -${padding} ${svgWidth + padding * 2} ${svgHeight + padding * 2}`}
            className="overflow-visible shadow-2xl"
          >
            <defs>
              {/* Architectural Fine Drafting Grid Pattern (1ft minor, 5ft major) */}
              <pattern id="drafting-grid" width={SCALE} height={SCALE} patternUnits="userSpaceOnUse">
                <circle cx={SCALE / 2} cy={SCALE / 2} r={0.7} fill="#CBD5E1" />
              </pattern>

              <pattern id="drafting-grid-major" width={SCALE * 5} height={SCALE * 5} patternUnits="userSpaceOnUse">
                <path d={`M ${SCALE * 5} 0 L 0 0 0 ${SCALE * 5}`} fill="none" stroke="#E2E8F0" strokeWidth={0.8} />
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

            {/* 2D ARCHITECTURAL LANDSCAPE (LAWNS, DRIVEWAY, PATH) */}
            {showLandscape && activeLandscape && (
              <g id="landscape-background-layer" pointerEvents="none">
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

                {/* Vehicular Driveway */}
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

                {/* Pedestrian Pathway */}
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
                    </g>
                  );
                })}
              </g>
            )}

            {/* ROOMS GEOMETRY */}
            {(currentFloor.rooms || []).map((room) => {
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
                    handleSelectRoom(room.id);
                  }}
                  onMouseEnter={() => setHoveredRoom(room)}
                  onMouseLeave={() => setHoveredRoom(null)}
                  onMouseDown={(e) => {
                    if (mode === "edit") {
                      e.stopPropagation();
                      handleSelectRoom(room.id);
                      setDraggingRoom({
                        roomId: room.id,
                        startMouseX: e.clientX,
                        startMouseY: e.clientY,
                        initialX: room.rect.x,
                        initialY: room.rect.y,
                      });
                    }
                  }}
                  className={`${mode === "edit" ? "cursor-move" : "cursor-pointer"}`}
                >
                  {/* Room Fill Floor Slab */}
                  <rect
                    x={0}
                    y={0}
                    width={rw}
                    height={rl}
                    fill={isSelected ? "#FFFDF9" : isHovered ? "#F8FAFC" : "#FFFFFF"}
                    stroke={isSelected ? "#C48446" : mode === "edit" ? "#94A3B8" : "#CBD5E1"}
                    strokeWidth={isSelected ? 2 : 1}
                    strokeDasharray={isSelected ? "none" : mode === "edit" ? "4 2" : "none"}
                    className="transition-colors duration-150"
                  />

                  {/* Staircase Step Treads */}
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
                    fill={isSelected ? "#92400E" : "#0F172A"}
                    className="font-mono text-[11px] font-semibold tracking-wider pointer-events-none select-none"
                  >
                    {room.name.toUpperCase()}
                  </text>

                  <text
                    x={rw / 2}
                    y={rl / 2 + 10}
                    textAnchor="middle"
                    fill={isSelected ? "#C48446" : "#64748B"}
                    className="font-mono text-[9px] font-medium pointer-events-none select-none"
                  >
                    {room.rect.width}&apos; × {room.rect.length}&apos; ({room.area_sqft || Math.round(room.rect.width * room.rect.length)} SQ FT)
                  </text>

                  {/* Corner & Edge Resize Handles in Edit Mode */}
                  {mode === "edit" && isSelected && (
                    <g>
                      {/* 1. Four Corner Handles */}
                      <rect
                        x={-5}
                        y={-5}
                        width={10}
                        height={10}
                        rx={1}
                        fill="#C48446"
                        stroke="#FFFFFF"
                        strokeWidth={1.5}
                        className="cursor-nwse-resize hover:fill-[#D49354] transition-colors"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setResizingRoom({
                            roomId: room.id,
                            edge: "top-left",
                            startMouseX: e.clientX,
                            startMouseY: e.clientY,
                            initialRect: { ...room.rect },
                          });
                        }}
                      />
                      <rect
                        x={rw - 5}
                        y={-5}
                        width={10}
                        height={10}
                        rx={1}
                        fill="#C48446"
                        stroke="#FFFFFF"
                        strokeWidth={1.5}
                        className="cursor-nesw-resize hover:fill-[#D49354] transition-colors"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setResizingRoom({
                            roomId: room.id,
                            edge: "top-right",
                            startMouseX: e.clientX,
                            startMouseY: e.clientY,
                            initialRect: { ...room.rect },
                          });
                        }}
                      />
                      <rect
                        x={-5}
                        y={rl - 5}
                        width={10}
                        height={10}
                        rx={1}
                        fill="#C48446"
                        stroke="#FFFFFF"
                        strokeWidth={1.5}
                        className="cursor-nesw-resize hover:fill-[#D49354] transition-colors"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setResizingRoom({
                            roomId: room.id,
                            edge: "bottom-left",
                            startMouseX: e.clientX,
                            startMouseY: e.clientY,
                            initialRect: { ...room.rect },
                          });
                        }}
                      />
                      <rect
                        x={rw - 5}
                        y={rl - 5}
                        width={10}
                        height={10}
                        rx={1}
                        fill="#C48446"
                        stroke="#FFFFFF"
                        strokeWidth={1.5}
                        className="cursor-nwse-resize hover:fill-[#D49354] transition-colors"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setResizingRoom({
                            roomId: room.id,
                            edge: "bottom-right",
                            startMouseX: e.clientX,
                            startMouseY: e.clientY,
                            initialRect: { ...room.rect },
                          });
                        }}
                      />

                      {/* 2. Four Wall Edge Drag Handles */}
                      {/* Top Wall Edge */}
                      <rect
                        x={rw / 2 - 16}
                        y={-4}
                        width={32}
                        height={8}
                        rx={2}
                        fill="#C48446"
                        stroke="#FFFFFF"
                        strokeWidth={1}
                        className="cursor-ns-resize hover:fill-[#D49354] transition-colors"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setResizingRoom({
                            roomId: room.id,
                            edge: "top",
                            startMouseX: e.clientX,
                            startMouseY: e.clientY,
                            initialRect: { ...room.rect },
                          });
                        }}
                      />
                      {/* Bottom Wall Edge */}
                      <rect
                        x={rw / 2 - 16}
                        y={rl - 4}
                        width={32}
                        height={8}
                        rx={2}
                        fill="#C48446"
                        stroke="#FFFFFF"
                        strokeWidth={1}
                        className="cursor-ns-resize hover:fill-[#D49354] transition-colors"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setResizingRoom({
                            roomId: room.id,
                            edge: "bottom",
                            startMouseX: e.clientX,
                            startMouseY: e.clientY,
                            initialRect: { ...room.rect },
                          });
                        }}
                      />
                      {/* Left Wall Edge */}
                      <rect
                        x={-4}
                        y={rl / 2 - 16}
                        width={8}
                        height={32}
                        rx={2}
                        fill="#C48446"
                        stroke="#FFFFFF"
                        strokeWidth={1}
                        className="cursor-ew-resize hover:fill-[#D49354] transition-colors"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setResizingRoom({
                            roomId: room.id,
                            edge: "left",
                            startMouseX: e.clientX,
                            startMouseY: e.clientY,
                            initialRect: { ...room.rect },
                          });
                        }}
                      />
                      {/* Right Wall Edge */}
                      <rect
                        x={rw - 4}
                        y={rl / 2 - 16}
                        width={8}
                        height={32}
                        rx={2}
                        fill="#C48446"
                        stroke="#FFFFFF"
                        strokeWidth={1}
                        className="cursor-ew-resize hover:fill-[#D49354] transition-colors"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setResizingRoom({
                            roomId: room.id,
                            edge: "right",
                            startMouseX: e.clientX,
                            startMouseY: e.clientY,
                            initialRect: { ...room.rect },
                          });
                        }}
                      />

                      {/* 3. Live Architectural Dimension Overlay Tooltip while Resizing */}
                      {resizingRoom && resizingRoom.roomId === room.id && (
                        <g transform={`translate(${rw / 2}, ${-26})`} className="pointer-events-none select-none">
                          <rect
                            x={-68}
                            y={-14}
                            width={136}
                            height={26}
                            rx={13}
                            fill="#0A0B0E"
                            stroke="#C48446"
                            strokeWidth={1.5}
                          />
                          <text
                            x={0}
                            y={4}
                            textAnchor="middle"
                            fill="#F5F3EF"
                            className="font-mono text-[11px] font-bold"
                          >
                            {feetToArchitectural(room.rect.width)} × {feetToArchitectural(room.rect.length)}
                          </text>
                        </g>
                      )}
                    </g>
                  )}
                </g>
              );
            })}

            {/* FURNITURE SYMBOLS */}
            {(currentFloor.rooms || []).flatMap((r) =>
              (r.furniture || []).map((item) => renderFurniture(item, r.id))
            )}

            {/* ARCHITECTURAL CUT WALLS */}
            {/* Exterior Walls */}
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

            {/* Interior Partition Walls */}
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

            {/* Jamb Caps */}
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

            {/* WINDOWS */}
            {windowGeometries.map((wGeom) => {
              const isSelected = selectedWindowId === wGeom.id;
              return (
                <g
                  key={wGeom.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedWindowId(wGeom.id);
                  }}
                  className={`${mode === "edit" ? "cursor-pointer" : "pointer-events-none"}`}
                >
                  <line
                    x1={wGeom.x1}
                    y1={wGeom.y1}
                    x2={wGeom.x2}
                    y2={wGeom.y2}
                    stroke="#FFFFFF"
                    strokeWidth={18}
                    strokeLinecap="square"
                  />
                  <path
                    d={wGeom.chajjaPath}
                    fill="none"
                    stroke="#64748B"
                    strokeWidth={1}
                    strokeDasharray="4 2"
                  />
                  <line
                    x1={wGeom.glaze1.x1}
                    y1={wGeom.glaze1.y1}
                    x2={wGeom.glaze1.x2}
                    y2={wGeom.glaze1.y2}
                    stroke={isSelected ? "#C48446" : "#0284C7"}
                    strokeWidth={1.5}
                  />
                  <line
                    x1={wGeom.glaze2.x1}
                    y1={wGeom.glaze2.y1}
                    x2={wGeom.glaze2.x2}
                    y2={wGeom.glaze2.y2}
                    stroke={isSelected ? "#C48446" : "#0284C7"}
                    strokeWidth={1.5}
                  />
                  {/* Direction Badge */}
                  <g transform={`translate(${wGeom.badgeX}, ${wGeom.badgeY})`}>
                    <rect
                      x={-22}
                      y={-7}
                      width={44}
                      height={14}
                      rx={3}
                      fill="#0F172A"
                      stroke={isSelected ? "#C48446" : "#38BDF8"}
                      strokeWidth={0.8}
                    />
                    <text
                      x={0}
                      y={3}
                      textAnchor="middle"
                      fill={isSelected ? "#C48446" : "#38BDF8"}
                      className="font-mono text-[7.5px] font-bold select-none"
                    >
                      {wGeom.label}
                    </text>
                  </g>
                </g>
              );
            })}

            {/* DOORS */}
            {doorGeometries.map((dGeom) => {
              const isSelected = selectedDoorId === dGeom.id;
              return (
                <g
                  key={dGeom.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedDoorId(dGeom.id);
                  }}
                  className={`${mode === "edit" ? "cursor-pointer" : "pointer-events-none"}`}
                >
                  <line
                    x1={dGeom.hingeX}
                    y1={dGeom.hingeY}
                    x2={dGeom.latchX}
                    y2={dGeom.latchY}
                    stroke="#FFFFFF"
                    strokeWidth={18}
                    strokeLinecap="square"
                  />
                  <path
                    d={dGeom.arcPath}
                    fill="none"
                    stroke={isSelected ? "#C48446" : "#64748B"}
                    strokeWidth={1.2}
                    strokeDasharray="3 3"
                  />
                  <line
                    x1={dGeom.hingeX}
                    y1={dGeom.hingeY}
                    x2={dGeom.leafEndX}
                    y2={dGeom.leafEndY}
                    stroke={isSelected ? "#C48446" : "#78350F"}
                    strokeWidth={3}
                    strokeLinecap="round"
                  />
                  <g transform={`translate(${dGeom.badgeX}, ${dGeom.badgeY})`}>
                    <rect
                      x={-22}
                      y={-7}
                      width={44}
                      height={14}
                      rx={3}
                      fill="#FFFFFF"
                      stroke={isSelected ? "#C48446" : "#78350F"}
                      strokeWidth={1}
                    />
                    <text
                      x={0}
                      y={3}
                      textAnchor="middle"
                      fill={isSelected ? "#C48446" : "#78350F"}
                      className="font-mono text-[7.5px] font-bold select-none"
                    >
                      {dGeom.label}
                    </text>
                  </g>
                </g>
              );
            })}

            {/* COMPASS ROSE / NORTH ARROW */}
            <g transform={`translate(${svgWidth - 45}, -30)`} pointerEvents="none">
              <circle cx={0} cy={0} r={22} fill="#FFFFFF" stroke="#334155" strokeWidth={1.5} />
              <circle cx={0} cy={0} r={18} fill="none" stroke="#CBD5E1" strokeWidth={0.8} strokeDasharray="2 2" />
              <line x1={-20} y1={0} x2={20} y2={0} stroke="#94A3B8" strokeWidth={0.8} />
              <line x1={0} y1={-20} x2={0} y2={20} stroke="#94A3B8" strokeWidth={0.8} />
              <polygon points="0,-18 5,0 0,-2 -5,0" fill="#DC2626" />
              <polygon points="0,0 5,0 0,18 -5,0" fill="#0F172A" />
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

            {/* ARCHITECTURAL GRAPHIC SCALE BAR */}
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

            {/* MASTER BLUEPRINT TITLE BLOCK */}
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
              <text x={10} y={14} fill="#0F172A" className="font-mono text-[10px] font-extrabold tracking-wider">
                {currentFloor.floor_name ? currentFloor.floor_name.toUpperCase() : "GROUND FLOOR"} BLUEPRINT
              </text>
              <text x={270} y={14} textAnchor="end" fill="#DC2626" className="font-mono text-[8px] font-bold tracking-widest">
                DK-STYLE ARCH
              </text>
              <text x={10} y={32} fill="#64748B" className="font-mono text-[8px]">
                PLOT: <tspan fill="#0F172A" fontWeight="bold">{layout.plot_width}&apos; × {layout.plot_length}&apos;</tspan> ({(layout.plot_width * layout.plot_length).toLocaleString()} SQ FT)
              </text>
              <text x={10} y={46} fill="#64748B" className="font-mono text-[8px]">
                BUILT-UP: <tspan fill="#0F172A" fontWeight="bold">{layout.total_area_sqft || Math.round((currentFloor.rooms || []).reduce((acc, r) => acc + (r.area_sqft || (r.rect ? r.rect.width * r.rect.length : 0)), 0))} SQ FT</tspan>
              </text>
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

      {/* 5. MINIMAL BOTTOM CONTROLS (CLEAN & NON-OBTRUSIVE) */}
      <div className="absolute bottom-4 sm:bottom-6 right-4 sm:right-6 z-30 flex items-center p-1 rounded-full bg-[#12141A]/90 backdrop-blur-md border border-white/10 shadow-2xl text-[11px] font-mono text-[#9E9C98]">
        <button
          onClick={() => setZoom((z) => Math.max(0.4, z * 0.85))}
          className="p-1.5 rounded-full hover:bg-white/5 text-[#9E9C98] hover:text-[#F5F3EF] transition-colors"
          title="Zoom Out"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <span className="px-2 select-none text-[10px] text-[#F5F3EF] font-bold">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => setZoom((z) => Math.min(3.5, z * 1.15))}
          className="p-1.5 rounded-full hover:bg-white/5 text-[#9E9C98] hover:text-[#F5F3EF] transition-colors"
          title="Zoom In"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <div className="h-4 w-px bg-white/10 mx-1" />
        <button
          onClick={handleResetView}
          className="p-1.5 rounded-full hover:bg-white/5 text-[#9E9C98] hover:text-[#F5F3EF] transition-colors"
          title="Fit to Sheet"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
