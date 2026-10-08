"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { HouseLayout, FloorPlan, Room, FurnitureItem, Door, Window, Wall, MEPCategory } from "@/types/house";
import { generateFallbackLandscape } from "@/utils/landscapeFallback";
import { generateArchitecturalLandscape, ArchitecturalLandscapeModel } from "@/utils/residentialLandscapeData";
import {
  computeCutWalls,
  computeDoorGeometry,
  computeWindowGeometry,
  generateDimensionChains,
} from "@/utils/blueprint2D";
import { refineHouseLayout, editRoomLayoutFull, reviewLayoutWithGemini } from "@/utils/api";
import { validateAndSanitizeHouseLayout } from "@/utils/layoutValidator";
import { FloatingNav, NavView } from "./FloatingNav";
import {
  generateCanonicalWallNetwork,
  synchronizeOpeningsWithWalls,
} from "@/utils/geometryEngine";
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
  Hand,
  Move,
  MousePointer,
  Square,
  DoorClosed,
  AppWindow,
  Armchair,
  Ruler,
  Bed,
  Bath,
  Utensils,
  PanelLeftClose,
  PanelLeft,
  PanelRightClose,
  PanelRight,
  ChevronDown,
  ChevronRight,
  PenTool,
  MoreHorizontal,
} from "lucide-react";
import {
  distanceWorld,
  angleWorld,
  screenToWorld,
} from "@/utils/cadCoordinates";
import { CadSnapEngine, SnapResult } from "@/utils/cadSnapEngine";
import {
  applyWallMovementTopology,
  checkWallDeleteDependencies,
  createCanonicalWall,
  WallDeleteDependencyCheck,
} from "@/utils/cadTopology";
import { CadContextualToolbar } from "./CadContextualToolbar";
import { executeLocalCadAiCommand } from "@/utils/cadAiCommands";

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

export function getRoomBackgroundFill(type: string, isSelected: boolean, isHovered: boolean): string {
  if (isSelected) return "#EFF6FF";
  if (isHovered) return "#F8FAFC";
  const clean = (type || "").toLowerCase();
  if (clean.includes("bed") || clean.includes("primary") || clean.includes("master")) return "#FDFCF7";
  if (clean.includes("bath") || clean.includes("toilet") || clean.includes("powder") || clean.includes("wc")) return "#F1F5F9";
  if (clean.includes("kitchen") || clean.includes("utility") || clean.includes("store")) return "#F8FAFC";
  if (clean.includes("pooja") || clean.includes("mandir")) return "#FFFDF5";
  if (clean.includes("balcony") || clean.includes("terrace") || clean.includes("sitout") || clean.includes("verandah")) return "#F5F5F0";
  if (clean.includes("stair")) return "#F3F4F6";
  if (clean.includes("living") || clean.includes("dining") || clean.includes("hall") || clean.includes("drawing") || clean.includes("lounge")) return "#FAFAF8";
  return "#FAF9F5";
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
  onSelectEntity?: (entityId: string | null) => void;
  onBack?: () => void;
  onRegenerateLayout?: (arg?: any) => Promise<void> | void;
  isRegenerating?: boolean;
  showAtelierNav?: boolean;
  onStudioNavigate?: (view: NavView) => void;
  onToggleEditMode?: () => void;
  onOpenVastuAudit?: () => void;
  hasVastuResult?: boolean;
  mepVisibility?: Partial<Record<MEPCategory, boolean>>;
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

interface DraggingWallState {
  wallId: string;
  startMouseX: number;
  startMouseY: number;
  initialX1: number;
  initialY1: number;
  initialX2: number;
  initialY2: number;
  affectedRoomIds: string[];
  initialRooms: Room[];
  initialWalls: Wall[];
  initialDoors: Door[];
  initialWindows: Window[];
  initialFloor: FloorPlan;
}

interface ResizingWallEndpointState {
  wallId: string;
  endpoint: "start" | "end";
  startMouseX: number;
  startMouseY: number;
  initialX1: number;
  initialY1: number;
  initialX2: number;
  initialY2: number;
  initialWalls: Wall[];
  initialRooms: Room[];
}

interface DrawingWallState {
  start: { x: number; y: number };
  end: { x: number; y: number };
}

interface DraggingOpeningState {
  kind: "door" | "window";
  id: string;
  wallId: string;
  initialOpening: Door | Window;
}

function syncPrimaryFloor(layout: HouseLayout): HouseLayout {
  const sourceFloor = layout.floors?.[0];
  if (!sourceFloor) return layout;
  const openingIdsByWall = new Map<string, string[]>();
  [...(sourceFloor.doors || []), ...(sourceFloor.windows || [])].forEach((opening) => {
    const wallId = opening.host_wall_id || opening.wall_id;
    if (wallId) openingIdsByWall.set(wallId, [...(openingIdsByWall.get(wallId) || []), opening.id]);
  });
  const exteriorWalls = (sourceFloor.exterior_walls || []).map((wall) => ({
    ...wall,
    openings: openingIdsByWall.get(wall.id) || [],
  }));
  const interiorWalls = (sourceFloor.interior_walls || []).map((wall) => ({
    ...wall,
    openings: openingIdsByWall.get(wall.id) || [],
  }));
  const primaryFloor: FloorPlan = {
    ...sourceFloor,
    exterior_walls: exteriorWalls,
    interior_walls: interiorWalls,
    walls: [...exteriorWalls, ...interiorWalls],
  };
  const floors = [...(layout.floors || [])];
  floors[0] = primaryFloor;
  const walls = [
    ...exteriorWalls,
    ...interiorWalls,
  ];
  const totalArea = primaryFloor.rooms.reduce(
    (area, room) => area + (room.area_sqft || room.rect.width * room.rect.length),
    0
  );
  return {
    ...layout,
    floors,
    rooms: primaryFloor.rooms,
    walls,
    exterior_walls: exteriorWalls,
    interior_walls: interiorWalls,
    doors: primaryFloor.doors || [],
    windows: primaryFloor.windows || [],
    total_area_sqft: totalArea,
    stats: { ...layout.stats, total_area_sqft: totalArea },
  };
}

function projectOpeningToWall(
  wall: Wall,
  point: { x: number; y: number },
  width: number
): { x1: number; y1: number; x2: number; y2: number; width: number } | null {
  const dx = wall.x2 - wall.x1;
  const dy = wall.y2 - wall.y1;
  const length = Math.hypot(dx, dy);
  const fittedWidth = Math.min(width, length - 0.5);
  if (length < 1 || fittedWidth < 1) return null;
  const ux = dx / length;
  const uy = dy / length;
  const projection = Math.max(
    fittedWidth / 2 + 0.25,
    Math.min(
      length - fittedWidth / 2 - 0.25,
      ((point.x - wall.x1) * dx + (point.y - wall.y1) * dy) / length
    )
  );
  const cx = wall.x1 + ux * projection;
  const cy = wall.y1 + uy * projection;
  return {
    x1: cx - ux * fittedWidth / 2,
    y1: cy - uy * fittedWidth / 2,
    x2: cx + ux * fittedWidth / 2,
    y2: cy + uy * fittedWidth / 2,
    width: fittedWidth,
  };
}

function hasValidWallGeometry(walls: Wall[], plotWidth: number, plotLength: number): boolean {
  for (let i = 0; i < walls.length; i += 1) {
    const wall = walls[i];
    const length = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
    if (
      length < 1 ||
      wall.thickness <= 0 ||
      Math.min(wall.x1, wall.x2) < 0 ||
      Math.min(wall.y1, wall.y2) < 0 ||
      Math.max(wall.x1, wall.x2) > plotWidth ||
      Math.max(wall.y1, wall.y2) > plotLength
    ) {
      return false;
    }
    for (let j = 0; j < i; j += 1) {
      const other = walls[j];
      const parallelHorizontal =
        Math.abs(wall.y1 - wall.y2) < 0.05 &&
        Math.abs(other.y1 - other.y2) < 0.05 &&
        Math.abs(wall.y1 - other.y1) < 0.05;
      const parallelVertical =
        Math.abs(wall.x1 - wall.x2) < 0.05 &&
        Math.abs(other.x1 - other.x2) < 0.05 &&
        Math.abs(wall.x1 - other.x1) < 0.05;
      if (parallelHorizontal || parallelVertical) {
        const wallMin = parallelHorizontal ? Math.min(wall.x1, wall.x2) : Math.min(wall.y1, wall.y2);
        const wallMax = parallelHorizontal ? Math.max(wall.x1, wall.x2) : Math.max(wall.y1, wall.y2);
        const otherMin = parallelHorizontal ? Math.min(other.x1, other.x2) : Math.min(other.y1, other.y2);
        const otherMax = parallelHorizontal ? Math.max(other.x1, other.x2) : Math.max(other.y1, other.y2);
        if (Math.min(wallMax, otherMax) - Math.max(wallMin, otherMin) > 0.05) return false;
      }
    }
  }
  return true;
}

function openingOverlaps(
  candidate: Door | Window,
  openings: Array<Door | Window>,
  wall: Wall
): boolean {
  const dx = wall.x2 - wall.x1;
  const dy = wall.y2 - wall.y1;
  const length = Math.hypot(dx, dy);
  if (length === 0) return true;
  const interval = (opening: Door | Window) => {
    const start = (opening.x1 - wall.x1) * dx / length + (opening.y1 - wall.y1) * dy / length;
    const end = (opening.x2 - wall.x1) * dx / length + (opening.y2 - wall.y1) * dy / length;
    return { start: Math.min(start, end), end: Math.max(start, end) };
  };
  const candidateInterval = interval(candidate);
  return openings.some((opening) => {
    if (
      opening.id === candidate.id ||
      (opening.host_wall_id || opening.wall_id) !== wall.id
    ) {
      return false;
    }
    const other = interval(opening);
    return Math.min(candidateInterval.end, other.end) - Math.max(candidateInterval.start, other.start) > 0.05;
  });
}

function constrainFurnitureToRoom(room: Room): Room {
  if (!room.rect) return room;
  return {
    ...room,
    furniture: (room.furniture || []).map((item) => {
      const halfWidth = Math.min(item.width / 2, room.rect.width / 2);
      const halfLength = Math.min((item.depth || item.length) / 2, room.rect.length / 2);
      return {
        ...item,
        x: Math.max(room.rect.x + halfWidth, Math.min(room.rect.x + room.rect.width - halfWidth, item.x)),
        y: Math.max(room.rect.y + halfLength, Math.min(room.rect.y + room.rect.length - halfLength, item.y)),
      };
    }),
  };
}

function findCanonicalWallMatch(walls: Wall[], reference: Wall): Wall | undefined {
  const dx = reference.x2 - reference.x1;
  const dy = reference.y2 - reference.y1;
  const length = Math.hypot(dx, dy);
  if (length === 0) return undefined;
  const midpoint = { x: (reference.x1 + reference.x2) / 2, y: (reference.y1 + reference.y2) / 2 };
  return walls.find((wall) => {
    if (wall.is_exterior !== reference.is_exterior) return false;
    const cross = Math.abs(dx * (wall.y1 - reference.y1) - dy * (wall.x1 - reference.x1)) / length;
    const t = ((midpoint.x - wall.x1) * (wall.x2 - wall.x1) + (midpoint.y - wall.y1) * (wall.y2 - wall.y1)) /
      (Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1) || 1);
    return cross < 0.1 && t >= -0.05 && t <= Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1) + 0.05;
  });
}

function architecturalFingerprint(layout: HouseLayout): string {
  const rooms = (items: Room[]) => items.map((room) => ({
    id: room.id,
    name: room.name,
    type: room.type,
    rect: room.rect,
    area_sqft: room.area_sqft,
    furniture: room.furniture,
  }));
  const walls = (items: Wall[] = []) => items.map((wall) => ({
    id: wall.id,
    x1: wall.x1,
    y1: wall.y1,
    x2: wall.x2,
    y2: wall.y2,
    thickness: wall.thickness,
    is_exterior: wall.is_exterior,
    openings: wall.openings,
  }));
  const openings = (items: Array<Door | Window>) => items.map((item) => ({
    id: item.id,
    host_wall_id: item.host_wall_id || item.wall_id,
    x1: item.x1,
    y1: item.y1,
    x2: item.x2,
    y2: item.y2,
    width: item.width,
    height: item.height,
    position_along_wall: item.position_along_wall,
  }));
  return JSON.stringify({
    plot: [layout.plot_width, layout.plot_length, layout.num_floors],
    rooms: rooms(layout.rooms || []),
    walls: walls(layout.walls || []),
    doors: openings(layout.doors || []),
    windows: openings(layout.windows || []),
    floors: (layout.floors || []).map((floor) => ({
      id: floor.floor_id,
      number: floor.floor_number,
      rooms: rooms(floor.rooms || []),
      walls: walls(floor.walls || []),
      doors: openings(floor.doors || []),
      windows: openings(floor.windows || []),
      staircase: floor.staircase,
    })),
  });
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
  onSelectEntity,
  onBack,
  showAtelierNav = false,
  onStudioNavigate,
  onToggleEditMode,
  onOpenVastuAudit,
  hasVastuResult = false,
  mepVisibility = {},
}) => {
  const router = useRouter();

  // Internal working layout state (for live editing & undo/redo)
  const [layout, setLayout] = useState<HouseLayout>(initialLayout);
  const lastProjectRef = useRef<string>(initialLayout.id || "");
  const lastSyncedLayoutRef = useRef(architecturalFingerprint(initialLayout));
  const lastRenderedLayoutRef = useRef(JSON.stringify(initialLayout));

  // Undo / Redo History Stack
  const [history, setHistory] = useState<HouseLayout[]>([initialLayout]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const historyStateRef = useRef({ history: [initialLayout], index: 0 });
  useEffect(() => {
    const incomingFingerprint = architecturalFingerprint(initialLayout);
    const incomingSerialized = JSON.stringify(initialLayout);
    if (initialLayout.id && initialLayout.id !== lastProjectRef.current) {
      lastProjectRef.current = initialLayout.id;
      lastSyncedLayoutRef.current = incomingFingerprint;
      lastRenderedLayoutRef.current = incomingSerialized;
      historyStateRef.current = { history: [initialLayout], index: 0 };
      setLayout(initialLayout);
      setHistory([initialLayout]);
      setHistoryIndex(0);
    } else if (incomingFingerprint !== lastSyncedLayoutRef.current) {
      lastSyncedLayoutRef.current = incomingFingerprint;
      const currentHistory = historyStateRef.current;
      const nextHistory = [
        ...currentHistory.history.slice(0, currentHistory.index + 1),
        JSON.parse(JSON.stringify(initialLayout)) as HouseLayout,
      ];
      const nextIndex = currentHistory.index + 1;
      historyStateRef.current = { history: nextHistory, index: nextIndex };
      lastRenderedLayoutRef.current = incomingSerialized;
      setLayout(initialLayout);
      setHistory(nextHistory);
      setHistoryIndex(nextIndex);
    } else if (incomingSerialized !== lastRenderedLayoutRef.current) {
      lastRenderedLayoutRef.current = incomingSerialized;
      setLayout(initialLayout);
    }
  }, [initialLayout]);

  const pushSnapshot = useCallback((newLayout: HouseLayout) => {
    const syncedLayout = syncPrimaryFloor(newLayout);
    const canonicalLayout = validateAndSanitizeHouseLayout(syncedLayout) || syncedLayout;
    const serializedLayout = JSON.stringify(canonicalLayout);
    const currentHistory = historyStateRef.current;
    const currentSnapshot = currentHistory.history[currentHistory.index];
    if (currentSnapshot && JSON.stringify(currentSnapshot) === serializedLayout) return;

    lastSyncedLayoutRef.current = architecturalFingerprint(canonicalLayout);
    lastRenderedLayoutRef.current = serializedLayout;
    const nextHistory = [
      ...currentHistory.history.slice(0, currentHistory.index + 1),
      JSON.parse(JSON.stringify(canonicalLayout)),
    ];
    const nextIndex = currentHistory.index + 1;
    historyStateRef.current = { history: nextHistory, index: nextIndex };
    setHistory(nextHistory);
    setHistoryIndex(nextIndex);
    setLayout(canonicalLayout);
    onUpdateLayout?.(canonicalLayout);
  }, [onUpdateLayout]);

  const undo = useCallback(() => {
    const currentHistory = historyStateRef.current;
    if (currentHistory.index <= 0) return;
    const nextIndex = currentHistory.index - 1;
    const previousLayout = currentHistory.history[nextIndex];
    historyStateRef.current = { ...currentHistory, index: nextIndex };
    lastSyncedLayoutRef.current = architecturalFingerprint(previousLayout);
    lastRenderedLayoutRef.current = JSON.stringify(previousLayout);
    setHistoryIndex(nextIndex);
    setLayout(previousLayout);
    onUpdateLayout?.(previousLayout);
  }, [onUpdateLayout]);

  const redo = useCallback(() => {
    const currentHistory = historyStateRef.current;
    if (currentHistory.index >= currentHistory.history.length - 1) return;
    const nextIndex = currentHistory.index + 1;
    const nextLayout = currentHistory.history[nextIndex];
    historyStateRef.current = { ...currentHistory, index: nextIndex };
    lastSyncedLayoutRef.current = architecturalFingerprint(nextLayout);
    lastRenderedLayoutRef.current = JSON.stringify(nextLayout);
    setHistoryIndex(nextIndex);
    setLayout(nextLayout);
    onUpdateLayout?.(nextLayout);
  }, [onUpdateLayout]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  // Selections
  const [internalSelectedRoomId, setInternalSelectedRoomId] = useState<string | null>(null);
  const [internalSelectedFurnitureId, setInternalSelectedFurnitureId] = useState<string | null>(null);
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  const [selectedDoorId, setSelectedDoorId] = useState<string | null>(null);
  const [selectedWindowId, setSelectedWindowId] = useState<string | null>(null);

  const selectedRoomId = externalSelectedRoomId !== undefined ? externalSelectedRoomId : internalSelectedRoomId;
  const selectedFurnitureId = externalSelectedFurnitureId !== undefined ? externalSelectedFurnitureId : internalSelectedFurnitureId;
  useEffect(() => {
    onSelectEntity?.(selectedWallId || selectedDoorId || selectedWindowId || selectedRoomId);
  }, [onSelectEntity, selectedWallId, selectedDoorId, selectedWindowId, selectedRoomId]);

  const handleSelectRoom = (id: string | null) => {
    if (externalOnSelectRoom) {
      externalOnSelectRoom(id);
    } else {
      setInternalSelectedRoomId(id);
    }
    if (id) {
      if (externalOnSelectFurniture) externalOnSelectFurniture(null);
      setInternalSelectedFurnitureId(null);
      setSelectedWallId(null);
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
      setSelectedWallId(null);
      setSelectedDoorId(null);
      setSelectedWindowId(null);
    }
  };

  const handleSelectWall = (id: string | null) => {
    setSelectedWallId(id);
    if (id) {
      handleSelectRoom(null);
      handleSelectFurniture(null);
      setSelectedDoorId(null);
      setSelectedWindowId(null);
    }
  };

  // Canvas Transform (Pan & Zoom)
  const [zoom, setZoom] = useState(1.0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [isPanMode, setIsPanMode] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isWheelZooming, setIsWheelZooming] = useState(false);
  const wheelTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const touchStateRef = useRef<{
    initialDist: number | null;
    initialZoom: number;
    startX: number;
    startY: number;
    startPanX: number;
    startPanY: number;
  }>({
    initialDist: null,
    initialZoom: 1.0,
    startX: 0,
    startY: 0,
    startPanX: 0,
    startPanY: 0,
  });

  // Parametric CAD Interactive Tools & State
  const [activeTool, setActiveTool] = useState<"select" | "room" | "wall" | "door" | "window" | "furniture" | "dimension" | "measure">("select");
  useEffect(() => {
    if (mode !== "edit") return;
    setActiveTool((currentTool) => {
      if (currentTool === "select") return currentTool;
      return "select";
    });
  }, [mode]);
  const [showDimensions, setShowDimensions] = useState(true);
  const [currentSnap, setCurrentSnap] = useState<SnapResult | null>(null);
  const [measureState, setMeasureState] = useState<{ p1: { x: number; y: number } | null; p2: { x: number; y: number } | null; isConfirmed: boolean } | null>(null);
  const [pendingWallDelete, setPendingWallDelete] = useState<WallDeleteDependencyCheck | null>(null);
  const [editingDimension, setEditingDimension] = useState<{
    type: "wall" | "room_width" | "room_length";
    id: string;
    label: string;
    currentValue: number;
  } | null>(null);
  const [ghostOpening, setGhostOpening] = useState<{ kind: "door" | "window"; geom: { x1: number; y1: number; x2: number; y2: number; width: number }; wall: Wall } | null>(null);

  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(false);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);
  const [isMobileToolsOpen, setIsMobileToolsOpen] = useState(false);
  const [alignmentGuides, setAlignmentGuides] = useState<Array<{ type: "h" | "v"; pos: number }>>([]);
  const [isAiOpen, setIsAiOpen] = useState(false);

  // Overlays
  const [showStructure, setShowStructure] = useState(false);
  const [showLandscape, setShowLandscape] = useState(true);
  const [hoveredRoom, setHoveredRoom] = useState<Room | null>(null);
  const [hoveredLandscapeId, setHoveredLandscapeId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia("(max-width: 767px)").matches) return;
    const hasSelection = Boolean(selectedWallId || selectedDoorId || selectedWindowId || selectedRoomId || selectedFurnitureId);
    // Controlled selections need to open the mobile inspector.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsRightPanelOpen(hasSelection);
    if (hasSelection) {
      setIsLeftPanelOpen(false);
      setIsAiOpen(false);
    }
  }, [selectedWallId, selectedDoorId, selectedWindowId, selectedRoomId, selectedFurnitureId]);

  // AI Architect Popover
  const [aiPrompt, setAiPrompt] = useState("");
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [aiNotice, setAiNotice] = useState<string | null>(null);

  // Gemini QA Visual Review
  const [isQaReviewing, setIsQaReviewing] = useState(false);
  const [qaReport, setQaReport] = useState<{
    score?: number;
    critique?: string;
    issues?: Array<{ category: string; description: string; severity: "low" | "medium" | "high"; recommendation?: string }>;
    strengths?: string[];
  } | null>(null);

  // Dragging & Resizing States
  const [draggingRoom, setDraggingRoom] = useState<DraggingRoomState | null>(null);
  const [draggingFurniture, setDraggingFurniture] = useState<DraggingFurnitureState | null>(null);
  const [resizingRoom, setResizingRoom] = useState<ResizingRoomState | null>(null);
  const [draggingWall, setDraggingWall] = useState<DraggingWallState | null>(null);
  const [resizingWallEndpoint, setResizingWallEndpoint] = useState<ResizingWallEndpointState | null>(null);
  const [drawingWall, setDrawingWall] = useState<DrawingWallState | null>(null);
  const [draggingOpening, setDraggingOpening] = useState<DraggingOpeningState | null>(null);
  const [invalidMoveNotice, setInvalidMoveNotice] = useState<string | null>(null);

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

  const commitFloorUpdate = (updates: Partial<FloorPlan>) => {
    const floors = [...(layout.floors || [])];
    const floor = floors[activeFloorIndex] || currentFloor;
    const updatedFloor = { ...floor, ...updates };
    floors[activeFloorIndex] = {
      ...updatedFloor,
      walls: [
        ...(updatedFloor.exterior_walls || []),
        ...(updatedFloor.interior_walls || []),
      ],
    };
    const nextLayout = syncPrimaryFloor({ ...layout, floors });
    pushSnapshot(nextLayout);
  };

  // Selected Wall Entity
  const selectedWall = useMemo(() => {
    if (!selectedWallId) return null;
    return (
      (currentFloor.exterior_walls || []).find((w) => w.id === selectedWallId) ||
      (currentFloor.interior_walls || []).find((w) => w.id === selectedWallId) ||
      null
    );
  }, [currentFloor.exterior_walls, currentFloor.interior_walls, selectedWallId]);

  // Selected Door Entity
  const selectedDoor = useMemo(() => {
    if (!selectedDoorId) return null;
    return (currentFloor.doors || []).find((d) => d.id === selectedDoorId) || null;
  }, [currentFloor.doors, selectedDoorId]);

  // Selected Window Entity
  const selectedWindow = useMemo(() => {
    if (!selectedWindowId) return null;
    return (currentFloor.windows || []).find((w) => w.id === selectedWindowId) || null;
  }, [currentFloor.windows, selectedWindowId]);

  const selectedEntityPayload = useMemo(() => {
    if (selectedWallId && selectedWall) {
      return { type: "wall" as const, id: selectedWallId, wall: selectedWall };
    }
    if (selectedDoorId && selectedDoor) {
      return { type: "door" as const, id: selectedDoorId, door: selectedDoor };
    }
    if (selectedWindowId && selectedWindow) {
      return { type: "window" as const, id: selectedWindowId, window: selectedWindow };
    }
    if (selectedRoomId) {
      const rm = (currentFloor.rooms || []).find((r) => r.id === selectedRoomId);
      if (rm) return { type: "room" as const, id: selectedRoomId, room: rm };
    }
    return { type: null };
  }, [selectedWallId, selectedWall, selectedDoorId, selectedDoor, selectedWindowId, selectedWindow, selectedRoomId, currentFloor.rooms]);

  const handleToggleWallThickness = () => {
    if (!selectedWall) return;
    const newThickness = selectedWall.thickness > 0.5 ? 0.375 : 0.75;
    const updateWall = (wall: Wall) => (wall.id === selectedWall.id ? { ...wall, thickness: newThickness } : wall);
    commitFloorUpdate({
      exterior_walls: (currentFloor.exterior_walls || []).map(updateWall),
      interior_walls: (currentFloor.interior_walls || []).map(updateWall),
    });
  };

  const handleDeleteWall = () => {
    if (!selectedWall) return;
    if (selectedWall.is_exterior) {
      setInvalidMoveNotice("Perimeter exterior wall cannot be deleted.");
      setTimeout(() => setInvalidMoveNotice(null), 3000);
      return;
    }
    const check = checkWallDeleteDependencies(currentFloor, selectedWall.id);
    if (check && !check.canDeleteDirectly) {
      setPendingWallDelete(check);
      return;
    }
    commitWallDeletion(selectedWall.id);
  };

  const commitWallDeletion = (wallId: string) => {
    const doors = (currentFloor.doors || []).filter(
      (opening) => (opening.host_wall_id || opening.wall_id) !== wallId
    );
    const windows = (currentFloor.windows || []).filter(
      (opening) => (opening.host_wall_id || opening.wall_id) !== wallId
    );
    commitFloorUpdate({
      interior_walls: (currentFloor.interior_walls || []).filter((wall) => wall.id !== wallId),
      doors,
      windows,
    });
    setSelectedWallId(null);
  };

  const handleApplyInlineDimension = (newValStr: string) => {
    if (!editingDimension) return;
    const targetVal = parseArchitecturalDimension(newValStr);
    if (targetVal === null) {
      setInvalidMoveNotice("Invalid dimension entered (e.g. 14'-6\" or 14.5).");
      setTimeout(() => setInvalidMoveNotice(null), 3000);
      setEditingDimension(null);
      return;
    }

    if (editingDimension.type === "wall") {
      const allWalls = [...(currentFloor.exterior_walls || []), ...(currentFloor.interior_walls || [])];
      const wall = allWalls.find((w) => w.id === editingDimension.id);
      if (!wall) {
        setEditingDimension(null);
        return;
      }
      const currentLen = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
      const delta = targetVal - currentLen;
      if (targetVal < 2.5) {
        setInvalidMoveNotice("Wall length cannot be less than 2.5 feet.");
        setTimeout(() => setInvalidMoveNotice(null), 3000);
        setEditingDimension(null);
        return;
      }
      const dx = wall.x2 - wall.x1;
      const dy = wall.y2 - wall.y1;
      const len = currentLen || 1;
      const ux = dx / len;
      const uy = dy / len;

      const newX2 = Math.round((wall.x2 + ux * delta) * 4) / 4;
      const newY2 = Math.round((wall.y2 + uy * delta) * 4) / 4;

      const updateWall = (w: Wall): Wall =>
        w.id === wall.id ? { ...w, x2: newX2, y2: newY2, end: { x: newX2, y: newY2 } } : w;

      commitFloorUpdate({
        exterior_walls: (currentFloor.exterior_walls || []).map(updateWall),
        interior_walls: (currentFloor.interior_walls || []).map(updateWall),
      });
    } else if (editingDimension.type === "room_width") {
      const rm = (currentFloor.rooms || []).find((r) => r.id === editingDimension.id);
      if (rm && rm.rect) {
        const deltaW = targetVal - rm.rect.width;
        const rightEdge = rm.rect.x + rm.rect.width;
        const allWalls = [...(currentFloor.exterior_walls || []), ...(currentFloor.interior_walls || [])];
        const rightWall = allWalls.find(
          (w) => Math.abs(w.x1 - rightEdge) < 0.35 && Math.abs(w.x2 - rightEdge) < 0.35
        );
        if (rightWall) {
          const topo = applyWallMovementTopology(currentFloor, rightWall.id, deltaW, 0, layout.plot_width, layout.plot_length);
          if (topo.isValid) {
            commitFloorUpdate(topo.updatedFloor);
          } else {
            setInvalidMoveNotice(topo.errorMessage || "Cannot resize room.");
            setTimeout(() => setInvalidMoveNotice(null), 3000);
          }
        } else {
          const newW = Math.max(3.5, targetVal);
          commitFloorUpdate({
            rooms: (currentFloor.rooms || []).map((r) =>
              r.id === rm.id ? { ...r, rect: { ...r.rect, width: newW }, area_sqft: Math.round(newW * r.rect.length) } : r
            ),
          });
        }
      }
    } else if (editingDimension.type === "room_length") {
      const rm = (currentFloor.rooms || []).find((r) => r.id === editingDimension.id);
      if (rm && rm.rect) {
        const deltaL = targetVal - rm.rect.length;
        const bottomEdge = rm.rect.y + rm.rect.length;
        const allWalls = [...(currentFloor.exterior_walls || []), ...(currentFloor.interior_walls || [])];
        const bottomWall = allWalls.find(
          (w) => Math.abs(w.y1 - bottomEdge) < 0.35 && Math.abs(w.y2 - bottomEdge) < 0.35
        );
        if (bottomWall) {
          const topo = applyWallMovementTopology(currentFloor, bottomWall.id, 0, deltaL, layout.plot_width, layout.plot_length);
          if (topo.isValid) {
            commitFloorUpdate(topo.updatedFloor);
          } else {
            setInvalidMoveNotice(topo.errorMessage || "Cannot resize room.");
            setTimeout(() => setInvalidMoveNotice(null), 3000);
          }
        } else {
          const newL = Math.max(3.5, targetVal);
          commitFloorUpdate({
            rooms: (currentFloor.rooms || []).map((r) =>
              r.id === rm.id ? { ...r, rect: { ...r.rect, length: newL }, area_sqft: Math.round(r.rect.width * newL) } : r
            ),
          });
        }
      }
    }
    setEditingDimension(null);
  };

  const handleSetWallThickness = (thickness: number) => {
    if (!selectedWall || !Number.isFinite(thickness) || thickness < 0.125 || thickness > 1.5) return;
    commitFloorUpdate({
      exterior_walls: (currentFloor.exterior_walls || []).map((wall) =>
        wall.id === selectedWall.id ? { ...wall, thickness } : wall
      ),
      interior_walls: (currentFloor.interior_walls || []).map((wall) =>
        wall.id === selectedWall.id ? { ...wall, thickness } : wall
      ),
    });
  };

  const handleSplitSelectedWall = () => {
    if (!selectedWall) return;
    const midpoint = { x: (selectedWall.x1 + selectedWall.x2) / 2, y: (selectedWall.y1 + selectedWall.y2) / 2 };
    const hostedOpenings = [
      ...(currentFloor.doors || []),
      ...(currentFloor.windows || []),
    ].filter((opening) => (opening.host_wall_id || opening.wall_id) === selectedWall.id);
    const dx = selectedWall.x2 - selectedWall.x1;
    const dy = selectedWall.y2 - selectedWall.y1;
    if (hostedOpenings.some((opening) => {
      const a = (opening.x1 - selectedWall.x1) * dx + (opening.y1 - selectedWall.y1) * dy;
      const b = (opening.x2 - selectedWall.x1) * dx + (opening.y2 - selectedWall.y1) * dy;
      return Math.min(a, b) < (dx * dx + dy * dy) / 2 && Math.max(a, b) > (dx * dx + dy * dy) / 2;
    })) {
      setInvalidMoveNotice("Move the opening away from the midpoint before splitting this wall.");
      setTimeout(() => setInvalidMoveNotice(null), 3000);
      return;
    }
    const firstId = `wall_${crypto.randomUUID()}`;
    const secondId = `wall_${crypto.randomUUID()}`;
    const first: Wall = {
      ...selectedWall,
      id: firstId,
      wall_id: firstId,
      x2: midpoint.x,
      y2: midpoint.y,
      end: midpoint,
      openings: [],
    };
    const second: Wall = {
      ...selectedWall,
      id: secondId,
      wall_id: secondId,
      x1: midpoint.x,
      y1: midpoint.y,
      start: midpoint,
      openings: [],
    };
    const exteriorWalls = (currentFloor.exterior_walls || []).filter((wall) => wall.id !== selectedWall.id);
    const interiorWalls = (currentFloor.interior_walls || []).filter((wall) => wall.id !== selectedWall.id);
    if (selectedWall.is_exterior) exteriorWalls.push(first, second);
    else interiorWalls.push(first, second);
    if (!hasValidWallGeometry([...exteriorWalls, ...interiorWalls], layout.plot_width, layout.plot_length)) {
      setInvalidMoveNotice("The wall cannot be split at this location.");
      setTimeout(() => setInvalidMoveNotice(null), 3000);
      return;
    }
    const updateOpening = <T extends Door | Window,>(opening: T): T => {
      if ((opening.host_wall_id || opening.wall_id) !== selectedWall.id) return opening;
      const centerX = (opening.x1 + opening.x2) / 2;
      const centerY = (opening.y1 + opening.y2) / 2;
      const distance =
        ((centerX - selectedWall.x1) * dx + (centerY - selectedWall.y1) * dy) /
        (Math.hypot(dx, dy) || 1);
      const id = distance <= Math.hypot(dx, dy) / 2 ? firstId : secondId;
      return { ...opening, wall_id: id, host_wall_id: id };
    };
    commitFloorUpdate({
      exterior_walls: exteriorWalls,
      interior_walls: interiorWalls,
      doors: (currentFloor.doors || []).map(updateOpening),
      windows: (currentFloor.windows || []).map(updateOpening),
    });
    setSelectedWallId(firstId);
  };

  const handleJoinSelectedWall = () => {
    if (!selectedWall) return;
    const allWalls = [...(currentFloor.exterior_walls || []), ...(currentFloor.interior_walls || [])];
    const points = [
      { x: selectedWall.x1, y: selectedWall.y1 },
      { x: selectedWall.x2, y: selectedWall.y2 },
    ];
    const other = allWalls.find((wall) => {
      if (wall.id === selectedWall.id || wall.is_exterior !== selectedWall.is_exterior) return false;
      const parallel =
        Math.abs((selectedWall.x2 - selectedWall.x1) * (wall.y2 - wall.y1) -
          (selectedWall.y2 - selectedWall.y1) * (wall.x2 - wall.x1)) < 0.05;
      const lineDistance = Math.abs(
        (wall.x1 - selectedWall.x1) * (selectedWall.y2 - selectedWall.y1) -
        (wall.y1 - selectedWall.y1) * (selectedWall.x2 - selectedWall.x1)
      ) / (Math.hypot(selectedWall.x2 - selectedWall.x1, selectedWall.y2 - selectedWall.y1) || 1);
      const touches = points.some((point) =>
        Math.hypot(point.x - wall.x1, point.y - wall.y1) < 0.05 ||
        Math.hypot(point.x - wall.x2, point.y - wall.y2) < 0.05
      );
      return parallel && lineDistance < 0.05 && touches;
    });
    if (!other) {
      setInvalidMoveNotice("Select a wall connected and parallel to this one to join it.");
      setTimeout(() => setInvalidMoveNotice(null), 3000);
      return;
    }
    const endpoints = [
      { x: selectedWall.x1, y: selectedWall.y1 },
      { x: selectedWall.x2, y: selectedWall.y2 },
      { x: other.x1, y: other.y1 },
      { x: other.x2, y: other.y2 },
    ];
    let start = endpoints[0];
    let end = endpoints[1];
    for (let i = 0; i < endpoints.length; i += 1) {
      for (let j = i + 1; j < endpoints.length; j += 1) {
        if (Math.hypot(endpoints[i].x - endpoints[j].x, endpoints[i].y - endpoints[j].y) >
          Math.hypot(start.x - end.x, start.y - end.y)) {
          start = endpoints[i];
          end = endpoints[j];
        }
      }
    }
    const joinedId = `wall_${crypto.randomUUID()}`;
    const joined: Wall = {
      ...selectedWall,
      id: joinedId,
      wall_id: joinedId,
      x1: start.x,
      y1: start.y,
      x2: end.x,
      y2: end.y,
      start,
      end,
      adjacent_room_ids: Array.from(new Set([
        ...(selectedWall.adjacent_room_ids || []),
        ...(other.adjacent_room_ids || []),
      ])),
      room_ids: Array.from(new Set([
        ...(selectedWall.room_ids || []),
        ...(other.room_ids || []),
      ])),
      connected_room_ids: Array.from(new Set([
        ...(selectedWall.connected_room_ids || []),
        ...(other.connected_room_ids || []),
      ])),
      openings: [],
    };
    const replaceWalls = (walls: Wall[]) => [
      ...walls.filter((wall) => wall.id !== selectedWall.id && wall.id !== other.id),
      joined,
    ];
    const replaceOpeningHost = <T extends Door | Window,>(opening: T): T =>
      [selectedWall.id, other.id].includes(opening.host_wall_id || opening.wall_id || "")
        ? { ...opening, wall_id: joinedId, host_wall_id: joinedId }
        : opening;
    const joinedExterior = selectedWall.is_exterior
      ? replaceWalls(currentFloor.exterior_walls || [])
      : currentFloor.exterior_walls || [];
    const joinedInterior = selectedWall.is_exterior
      ? currentFloor.interior_walls || []
      : replaceWalls(currentFloor.interior_walls || []);
    if (!hasValidWallGeometry([...joinedExterior, ...joinedInterior], layout.plot_width, layout.plot_length)) {
      setInvalidMoveNotice("Joining these walls would create invalid geometry.");
      setTimeout(() => setInvalidMoveNotice(null), 3000);
      return;
    }
    commitFloorUpdate({
      exterior_walls: joinedExterior,
      interior_walls: joinedInterior,
      doors: (currentFloor.doors || []).map(replaceOpeningHost),
      windows: (currentFloor.windows || []).map(replaceOpeningHost),
    });
    setSelectedWallId(joinedId);
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

  // Canonical Residential Architectural Landscape (Shared 1:1 with 3D model)
  const archLandscape = useMemo(() => {
    return generateArchitecturalLandscape(layout);
  }, [layout]);

  // Fallback Landscape Layer
  const activeLandscape = useMemo(() => {
    return layout.landscape &&
      ((layout.landscape.elements && layout.landscape.elements.length > 0) ||
        (layout.landscape.zones && layout.landscape.zones.length > 0))
      ? layout.landscape
      : generateFallbackLandscape(layout);
  }, [layout]);

  // Architectural Canonical Wall Network:
  // Guarantees every single room is 100% enclosed by connected walls with no missing partitions
  const canonicalWallNet = useMemo(() => {
    const storedWalls = [
      ...(currentFloor.exterior_walls || []),
      ...(currentFloor.interior_walls || []),
    ];
    const hasFullWalls =
      currentFloor.exterior_walls &&
      currentFloor.exterior_walls.length >= 4 &&
      currentFloor.interior_walls &&
      currentFloor.interior_walls.length > 0;

    if (storedWalls.length > 0 && (mode === "edit" || hasFullWalls)) {
      return {
        walls: storedWalls,
        exteriorWalls: currentFloor.exterior_walls || [],
        interiorWalls: currentFloor.interior_walls || [],
      };
    }
    return generateCanonicalWallNetwork(currentFloor.rooms || [], layout.site);
  }, [currentFloor.exterior_walls, currentFloor.interior_walls, currentFloor.rooms, layout.site, mode]);

  const regenerateFloorGeometry = (
    rooms: Room[],
    doors: Door[],
    windows: Window[]
  ) => {
    const generated = generateCanonicalWallNetwork(rooms, layout.site, 9.5);
    const customWalls = canonicalWallNet.walls.filter(
      (wall) => wall.id.startsWith("wall_") && !(wall.adjacent_room_ids?.length)
    );
    const interiorWalls = [...generated.interiorWalls, ...customWalls];
    const synchronized = synchronizeOpeningsWithWalls(
      doors,
      windows,
      [...generated.exteriorWalls, ...interiorWalls]
    );
    return {
      exteriorWalls: generated.exteriorWalls,
      interiorWalls,
      doors: synchronized.doors,
      windows: synchronized.windows,
    };
  };

  const getModelPoint = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return null;
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const transformed = point.matrixTransform(matrix.inverse());
    return { x: transformed.x / SCALE, y: transformed.y / SCALE };
  };

  const snapWallPoint = (
    point: { x: number; y: number },
    excludedWallId?: string,
    excludedEndpoint?: { x: number; y: number }
  ) => {
    const gridPoint = { x: Math.round(point.x * 2) / 2, y: Math.round(point.y * 2) / 2 };
    const endpoints = canonicalWallNet.walls.filter((wall) => wall.id !== excludedWallId).flatMap((wall) => [
      { x: wall.x1, y: wall.y1 },
      { x: wall.x2, y: wall.y2 },
    ]).filter((endpoint) =>
      !excludedEndpoint || Math.hypot(endpoint.x - excludedEndpoint.x, endpoint.y - excludedEndpoint.y) > 0.05
    );
    return endpoints.find((endpoint) => Math.hypot(endpoint.x - point.x, endpoint.y - point.y) <= 0.6) || gridPoint;
  };

  const findWallAtPoint = (point: { x: number; y: number }) => {
    let nearest: Wall | null = null;
    let nearestDistance = Infinity;
    for (const wall of canonicalWallNet.walls) {
      const dx = wall.x2 - wall.x1;
      const dy = wall.y2 - wall.y1;
      const lengthSquared = dx * dx + dy * dy;
      const t = lengthSquared === 0
        ? 0
        : Math.max(0, Math.min(1, ((point.x - wall.x1) * dx + (point.y - wall.y1) * dy) / lengthSquared));
      const distance = Math.hypot(point.x - (wall.x1 + t * dx), point.y - (wall.y1 + t * dy));
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = wall;
      }
    }
    return nearestDistance <= 0.75 ? nearest : null;
  };

  const isPointerInsideCadViewport = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return false;
    const rect = svg.getBoundingClientRect();
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  }, []);

  const isCadUiTarget = useCallback(
    (target: EventTarget | null) =>
      target instanceof Element &&
      Boolean(target.closest("[data-cad-ui], button, input, select, textarea, [role='dialog']")),
    []
  );

  const handleSvgMouseDownCapture = (event: React.MouseEvent<SVGSVGElement>) => {
    if (mode !== "edit" || event.button !== 0) return;
    const point = getModelPoint(event.clientX, event.clientY);
    if (!point) return;

    const wallAtPoint = findWallAtPoint(point);
    if (activeTool === "wall" && wallAtPoint) {
      event.preventDefault();
      event.stopPropagation();
      setSelectedWallId(wallAtPoint.id);
      setSelectedDoorId(null);
      setSelectedWindowId(null);
      handleSelectRoom(null);
      handleSelectFurniture(null);
      setActiveTool("select");
      return;
    }

    if (activeTool === "measure") {
      event.preventDefault();
      event.stopPropagation();
      const snapResult = CadSnapEngine.snap(point, canonicalWallNet.walls, currentFloor.rooms);
      setCurrentSnap(snapResult);
      const snapped = snapResult.point;
      if (!measureState || !measureState.p1 || measureState.isConfirmed) {
        setMeasureState({ p1: snapped, p2: snapped, isConfirmed: false });
      } else {
        setMeasureState({ ...measureState, p2: snapped, isConfirmed: true });
      }
      return;
    }

    if (activeTool === "wall") {
      event.preventDefault();
      event.stopPropagation();
      const snapResult = CadSnapEngine.snap(point, canonicalWallNet.walls, currentFloor.rooms);
      setCurrentSnap(snapResult);
      const snapped = snapResult.point;
      if (!drawingWall) {
        setDrawingWall({ start: snapped, end: snapped });
      } else {
        finishWallDrawing();
      }
      return;
    }

    if (activeTool !== "door" && activeTool !== "window") return;
    event.preventDefault();
    event.stopPropagation();
    const proj = CadSnapEngine.projectToNearestWall(point, canonicalWallNet.walls, 1.5);
    const wall = proj?.wall || findWallAtPoint(point);
    if (!wall) {
      setInvalidMoveNotice("Select a valid wall to place an opening.");
      setTimeout(() => setInvalidMoveNotice(null), 2500);
      return;
    }
    const kind = activeTool;
    const width = kind === "door" ? 3.0 : 4.0;
    const openingGeometry = projectOpeningToWall(wall, point, width);
    if (!openingGeometry) return;
    const id = `${kind === "door" ? "d" : "win"}_${crypto.randomUUID()}`;
    const opening = kind === "door"
      ? {
          id,
          wall_id: wall.id,
          host_wall_id: wall.id,
          floor_id: String(currentFloor.floor_number),
          ...openingGeometry,
          height: 7,
          door_type: "interior" as const,
          swing_direction: "inward" as const,
          hinge_side: "left" as const,
        }
      : {
          id,
          wall_id: wall.id,
          host_wall_id: wall.id,
          floor_id: String(currentFloor.floor_number),
          ...openingGeometry,
          height: 4,
          sill_height: 3,
          window_type: "casement" as const,
        };
    if (
      openingOverlaps(
        opening,
        [...(currentFloor.doors || []), ...(currentFloor.windows || [])],
        wall
      )
    ) {
      setInvalidMoveNotice("There is not enough clear wall space for another opening.");
      setTimeout(() => setInvalidMoveNotice(null), 2500);
      return;
    }
    if (kind === "door") {
      commitFloorUpdate({ doors: [...(currentFloor.doors || []), opening] });
      setSelectedDoorId(id);
      setSelectedWindowId(null);
    } else {
      commitFloorUpdate({ windows: [...(currentFloor.windows || []), opening] });
      setSelectedWindowId(id);
      setSelectedDoorId(null);
    }
    setSelectedWallId(null);
    handleSelectRoom(null);
    handleSelectFurniture(null);
    setActiveTool("select");
  };

  const handleSvgClickCapture = (event: React.MouseEvent<SVGSVGElement>) => {
    if (
      mode === "edit" &&
      (activeTool === "wall" || activeTool === "door" || activeTool === "window" || activeTool === "measure")
    ) {
      event.stopPropagation();
    }
  };

  const finishWallDrawing = () => {
    if (!drawingWall) return;
    const { start, end } = drawingWall;
    setDrawingWall(null);
    setCurrentSnap(null);
    const len = Math.hypot(end.x - start.x, end.y - start.y);
    if (len < 1.5) {
      setInvalidMoveNotice("Wall is too short (minimum 1.5 ft).");
      setTimeout(() => setInvalidMoveNotice(null), 2500);
      return;
    }
    const newWall = createCanonicalWall(start, end, 0.375, false, 9.5);
    const updatedWalls = [...canonicalWallNet.walls, newWall];
    if (!hasValidWallGeometry(updatedWalls, layout.plot_width, layout.plot_length)) {
      setInvalidMoveNotice("Wall geometry is invalid or overlaps an existing wall.");
      setTimeout(() => setInvalidMoveNotice(null), 3000);
      return;
    }
    commitFloorUpdate({
      exterior_walls: currentFloor.exterior_walls || [],
      interior_walls: [...(currentFloor.interior_walls || []), newWall],
      walls: updatedWalls,
    });
    setSelectedWallId(newWall.id);
    setSelectedDoorId(null);
    setSelectedWindowId(null);
    handleSelectRoom(null);
    handleSelectFurniture(null);
    setActiveTool("select");
  };

  // Synchronize doors and windows so they are physically embedded into host walls
  const synchedOpenings = useMemo(() => {
    return synchronizeOpeningsWithWalls(
      currentFloor.doors || [],
      currentFloor.windows || [],
      canonicalWallNet.walls,
      0
    );
  }, [currentFloor.doors, currentFloor.windows, canonicalWallNet.walls]);

  // Wall Cuts, Doors, Windows, Dimensions
  const cutExteriorWalls = useMemo(
    () =>
      computeCutWalls(
        canonicalWallNet.exteriorWalls,
        synchedOpenings.doors,
        synchedOpenings.windows,
        SCALE,
        true
      ),
    [canonicalWallNet.exteriorWalls, synchedOpenings.doors, synchedOpenings.windows, SCALE]
  );

  const cutInteriorWalls = useMemo(
    () =>
      computeCutWalls(
        canonicalWallNet.interiorWalls,
        synchedOpenings.doors,
        synchedOpenings.windows,
        SCALE,
        false
      ),
    [canonicalWallNet.interiorWalls, synchedOpenings.doors, synchedOpenings.windows, SCALE]
  );

  const doorGeometries = useMemo(
    () =>
      synchedOpenings.doors.map((door, idx) =>
        computeDoorGeometry(door, idx, SCALE)
      ),
    [synchedOpenings.doors, SCALE]
  );

  const windowGeometries = useMemo(
    () =>
      synchedOpenings.windows.map((win, idx) =>
        computeWindowGeometry(win, idx, SCALE)
      ),
    [synchedOpenings.windows, SCALE]
  );

  const dimensionChains = useMemo(
    () => generateDimensionChains(layout.plot_width, layout.plot_length, SCALE),
    [layout.plot_width, layout.plot_length, SCALE]
  );

  // Wheel Zoom (Cursor-Centered Math, Non-Passive Listener, Trackpad Support)
  const handleWheelNative = useCallback(
    (e: WheelEvent) => {
      const container = containerRef.current;
      if (
        !container ||
        isCadUiTarget(e.target) ||
        !isPointerInsideCadViewport(e.clientX, e.clientY)
      ) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left - rect.width / 2;
      const mouseY = e.clientY - rect.top - rect.height / 2;

      // Trackpad pinch emits wheel with ctrlKey=true
      const zoomFactor = e.ctrlKey
        ? Math.exp(-e.deltaY * 0.01)
        : e.deltaY < 0
        ? 1.14
        : 0.88;

      setIsWheelZooming(true);
      if (wheelTimeoutRef.current) clearTimeout(wheelTimeoutRef.current);
      wheelTimeoutRef.current = setTimeout(() => setIsWheelZooming(false), 140);

      setZoom((prevZoom) => {
        const nextZoom = Math.min(5.0, Math.max(0.2, prevZoom * zoomFactor));
        setPan((prevPan) => ({
          x: mouseX - (mouseX - prevPan.x) * (nextZoom / prevZoom),
          y: mouseY - (mouseY - prevPan.y) * (nextZoom / prevZoom),
        }));
        return nextZoom;
      });
    },
    [isCadUiTarget, isPointerInsideCadViewport]
  );

  const setContainerRef = useCallback(
    (node: HTMLElement | null) => {
      if (containerRef.current) {
        containerRef.current.removeEventListener("wheel", handleWheelNative);
      }
      containerRef.current = node as HTMLDivElement;
      if (node) {
        node.addEventListener("wheel", handleWheelNative, { passive: false });
      }
    },
    [handleWheelNative]
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheelNative, { passive: false });
    return () => {
      el.removeEventListener("wheel", handleWheelNative);
    };
  }, [handleWheelNative, mode]);

  // Reset / Zoom-to-fit Canvas View (Center Floor Plan with Padding)
  const handleResetView = useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const isMobile = rect.width <= 768 || (typeof window !== "undefined" && window.innerWidth <= 768);
      const pad = isMobile ? 24 : 60;
      const fitZoom = Math.min(
        (rect.width - pad * 2) / (svgWidth + (isMobile ? 40 : 120)),
        (rect.height - pad * 2) / (svgHeight + (isMobile ? 40 : 120)),
        1.5
      );
      // On mobile, keep viewport readable rather than over-shrinking; user can pan and pinch-zoom freely
      const resolvedZoom = isMobile ? Math.max(0.65, fitZoom) : Math.max(0.4, Math.min(2.0, fitZoom));
      setZoom(resolvedZoom);
      setPan({ x: 0, y: 0 });
    } else {
      setZoom(1.0);
      setPan({ x: 0, y: 0 });
    }
  }, [svgWidth, svgHeight]);

  // Initial Auto-Fit on Mount or Project Change
  useEffect(() => {
    const timer = setTimeout(() => {
      handleResetView();
    }, 150);
    return () => clearTimeout(timer);
  }, [handleResetView, layout.id]);

  // Helper: Room Type Icon
  const getRoomIcon = (type: string) => {
    const t = type.toLowerCase();
    if (t.includes("bed")) return <Bed className="w-3.5 h-3.5" />;
    if (t.includes("bath") || t.includes("toilet") || t.includes("powder")) return <Bath className="w-3.5 h-3.5" />;
    if (t.includes("kitchen") || t.includes("dining") || t.includes("pantry")) return <Utensils className="w-3.5 h-3.5" />;
    if (t.includes("living") || t.includes("lounge")) return <Armchair className="w-3.5 h-3.5" />;
    return <Square className="w-3.5 h-3.5" />;
  };

  // Helper: Update Room Property (live with undo/redo snapshot)
  const handleUpdateRoomProperty = (roomId: string, updates: Partial<Room>) => {
    const floor = layout.floors?.[activeFloorIndex];
    if (!floor) return;
    const updatedRooms = (floor.rooms || []).map((room) => {
      if (room.id !== roomId) return room;
      const updated = { ...room, ...updates };
      if (updates.rect) {
        updated.area_sqft = Math.round(updates.rect.width * updates.rect.length);
      }
      return updated;
    });
    commitFloorUpdate({ rooms: updatedRooms });
  };

  // Helper: Quick Room Size Increment (+1ft / -1ft)
  const handleAdjustRoomSize = (roomId: string, deltaW: number, deltaL: number) => {
    const target = (currentFloor.rooms || []).find((r) => r.id === roomId);
    if (!target || !target.rect) return;
    const newW = Math.max(3.0, Math.min(layout.plot_width - target.rect.x - 1, target.rect.width + deltaW));
    const newL = Math.max(3.0, Math.min(layout.plot_length - target.rect.y - 1, target.rect.length + deltaL));
    handleUpdateRoomProperty(roomId, {
      rect: { ...target.rect, width: newW, length: newL },
      area_sqft: Math.round(newW * newL),
    });
  };

  // Keyboard Shortcuts (Undo / Redo / Deselect)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      const isInput = activeTag === "input" || activeTag === "textarea" || activeTag === "select";

      if (e.code === "Space" && !isInput) {
        e.preventDefault();
        setIsSpacePressed(true);
        return;
      }
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
        setSelectedWallId(null);
        setIsAiOpen(false);
      } else if ((e.key === "Delete" || e.key === "Backspace") && !isInput) {
        if (selectedRoomId || selectedFurnitureId || selectedWallId || selectedDoorId || selectedWindowId) {
          e.preventDefault();
          handleDeleteSelected();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        setIsSpacePressed(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [canUndo, canRedo, undo, redo]);

  // Mobile Touch Gestures (Pan, Pinch-to-Zoom, Two-Finger Pan, Tap-Selection)
  const pinchStartRef = useRef<{ dist: number; zoom: number; midX: number; midY: number; panX: number; panY: number } | null>(null);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const touchMovedRef = useRef<boolean>(false);

  // Prevent browser viewport pinch-zoom on mobile when gesturing inside the plan canvas
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleNativeTouchMove = (e: TouchEvent) => {
      if (
        e.touches.length >= 2 &&
        svgRef.current &&
        e.target instanceof Node &&
        svgRef.current.contains(e.target)
      ) {
        e.preventDefault();
      }
    };
    el.addEventListener("touchmove", handleNativeTouchMove, { passive: false });
    return () => el.removeEventListener("touchmove", handleNativeTouchMove);
  }, []);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (isCadUiTarget(e.target)) return;
    if (e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;
      pinchStartRef.current = { dist, zoom, midX, midY, panX: pan.x, panY: pan.y };
      touchMovedRef.current = true;
      setIsPanning(false);
      return;
    }

    if (e.touches.length === 1) {
      const touch = e.touches[0];
      touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
      touchMovedRef.current = false;
      if (
        isPanMode ||
        mode === "view" ||
        (!draggingRoom && !draggingFurniture && !resizingRoom && !draggingWall && !resizingWallEndpoint)
      ) {
        setIsPanning(true);
        setPanStart({ x: touch.clientX - pan.x, y: touch.clientY - pan.y });
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isCadUiTarget(e.target)) return;
    if (e.touches.length === 2 && pinchStartRef.current) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;
      const { dist: startDist, zoom: startZoom, midX: startMidX, midY: startMidY, panX: startPanX, panY: startPanY } = pinchStartRef.current;

      if (startDist > 0 && containerRef.current) {
        const scaleFactor = dist / startDist;
        const newZoom = Math.min(3.5, Math.max(0.4, startZoom * scaleFactor));
        const deltaX = midX - startMidX;
        const deltaY = midY - startMidY;

        const rect = containerRef.current.getBoundingClientRect();
        const relX = startMidX - rect.left - rect.width / 2;
        const relY = startMidY - rect.top - rect.height / 2;
        const newPanX = relX - (relX - startPanX) * (newZoom / startZoom) + deltaX;
        const newPanY = relY - (relY - startPanY) * (newZoom / startZoom) + deltaY;

        setZoom(newZoom);
        setPan({ x: newPanX, y: newPanY });
      }
      return;
    }

    if (e.touches.length === 1 && touchStartRef.current) {
      const touch = e.touches[0];
      const dx = touch.clientX - touchStartRef.current.x;
      const dy = touch.clientY - touchStartRef.current.y;
      if (Math.hypot(dx, dy) > 6) {
        touchMovedRef.current = true;
      }

      if (isPanning && !draggingRoom && !draggingFurniture && !resizingRoom && !draggingWall && !resizingWallEndpoint) {
        setPan({ x: touch.clientX - panStart.x, y: touch.clientY - panStart.y });
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) {
      pinchStartRef.current = null;
    }
    if (e.touches.length === 0) {
      setIsPanning(false);
      touchStartRef.current = null;
    }
  };

  // Global Mouse Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (isCadUiTarget(e.target)) return;
    // 1. Middle mouse button -> ALWAYS pan
    if (e.button === 1) {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      return;
    }

    // 2. Space + Left mouse -> ALWAYS pan
    if (isSpacePressed && e.button === 0) {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      return;
    }

    // 3. Dedicated pan mode (Hand tool) -> Pan
    if (isPanMode && e.button === 0) {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      return;
    }

    // 4. In "view" mode -> Left click on canvas background pans
    if (mode === "view" && e.button === 0) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      return;
    }

    // 5. In "edit" mode: Left click ONLY pans if in "select" tool AND NOT interacting with an object
    if (
      mode === "edit" &&
      activeTool === "select" &&
      e.button === 0 &&
      !draggingRoom &&
      !draggingFurniture &&
      !resizingRoom &&
      !draggingWall &&
      !resizingWallEndpoint &&
      !draggingOpening
    ) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      return;
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (
      isPanning &&
      !draggingRoom &&
      !draggingFurniture &&
      !resizingRoom &&
      !draggingWall &&
      !resizingWallEndpoint &&
      !draggingOpening
    ) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
      return;
    }

    if (mode !== "edit") return;

    const currentPoint = getModelPoint(e.clientX, e.clientY);

    // Live snap feedback & hover tracking
    if (currentPoint) {
      if (activeTool === "measure") {
        const snapRes = CadSnapEngine.snap(currentPoint, canonicalWallNet.walls, currentFloor.rooms, {
          referencePoint: measureState?.p1 || undefined,
        });
        setCurrentSnap(snapRes);
        if (measureState?.p1 && !measureState.isConfirmed) {
          setMeasureState((prev) => (prev ? { ...prev, p2: snapRes.point } : null));
        }
        return;
      }

      if ((activeTool === "door" || activeTool === "window") && !draggingOpening && !drawingWall) {
        const proj = CadSnapEngine.projectToNearestWall(currentPoint, canonicalWallNet.walls, 1.5);
        if (proj) {
          const width = activeTool === "door" ? 3.0 : 4.0;
          const geom = projectOpeningToWall(proj.wall, currentPoint, width);
          if (geom) {
            setGhostOpening({ kind: activeTool, geom, wall: proj.wall });
          } else {
            setGhostOpening(null);
          }
        } else {
          setGhostOpening(null);
        }
      }
    }

    if (drawingWall) {
      if (!currentPoint) return;
      const snapRes = CadSnapEngine.snap(currentPoint, canonicalWallNet.walls, currentFloor.rooms, {
        referencePoint: drawingWall.start,
      });
      setCurrentSnap(snapRes);
      const snapped = snapRes.point;
      const dx = snapped.x - drawingWall.start.x;
      const dy = snapped.y - drawingWall.start.y;
      setDrawingWall({
        ...drawingWall,
        end: Math.abs(dx) >= Math.abs(dy)
          ? { x: snapped.x, y: drawingWall.start.y }
          : { x: drawingWall.start.x, y: snapped.y },
      });
      return;
    }

    if (draggingOpening) {
      if (!currentPoint) return;
      const wall = canonicalWallNet.walls.find((candidate) => candidate.id === draggingOpening.wallId);
      if (!wall) return;
      const openingGeometry = projectOpeningToWall(wall, currentPoint, draggingOpening.initialOpening.width);
      if (!openingGeometry) return;
      setLayout((prev) => {
        const floors = [...(prev.floors || [])];
        const floor = floors[activeFloorIndex] || currentFloor;
        const updatedFloor = draggingOpening.kind === "door"
          ? {
              ...floor,
              doors: (floor.doors || []).map((opening) =>
                opening.id === draggingOpening.id
                  ? { ...opening, ...openingGeometry, wall_id: wall.id, host_wall_id: wall.id }
                  : opening
              ),
            }
          : {
              ...floor,
              windows: (floor.windows || []).map((opening) =>
                opening.id === draggingOpening.id
                  ? { ...opening, ...openingGeometry, wall_id: wall.id, host_wall_id: wall.id }
                  : opening
              ),
            };
        floors[activeFloorIndex] = updatedFloor;
        return syncPrimaryFloor({ ...prev, floors });
      });
      return;
    }

    // 1. Wall Dragging: Real-time Parametric CAD Topology Preservation
    if (draggingWall) {
      const deltaXFeet = (e.clientX - draggingWall.startMouseX) / (SCALE * zoom);
      const deltaYFeet = (e.clientY - draggingWall.startMouseY) / (SCALE * zoom);

      const isHorizontal = Math.abs(draggingWall.initialY1 - draggingWall.initialY2) < 0.2;
      const snapDelta = (v: number) => Math.round(v * 2) / 2; // 0.5ft snap increments

      const snappedDeltaX = isHorizontal ? 0 : snapDelta(deltaXFeet);
      const snappedDeltaY = isHorizontal ? snapDelta(deltaYFeet) : 0;

      const topo = applyWallMovementTopology(
        draggingWall.initialFloor,
        draggingWall.wallId,
        snappedDeltaX,
        snappedDeltaY,
        layout.plot_width,
        layout.plot_length
      );

      if (topo.isValid) {
        setLayout((prev) => {
          const nextFloors = prev.floors ? [...prev.floors] : [];
          nextFloors[activeFloorIndex] = topo.updatedFloor;
          return syncPrimaryFloor({ ...prev, floors: nextFloors });
        });
      }
      return;
    }

    // 2. Wall Endpoint Resizing (Extend / Shorten with Snapping)
    if (resizingWallEndpoint) {
      if (!currentPoint) return;
      const isHorizontal = Math.abs(resizingWallEndpoint.initialY1 - resizingWallEndpoint.initialY2) < 0.2;
      const endpoint = resizingWallEndpoint.endpoint;
      const excludedEndpoint = endpoint === "start"
        ? { x: resizingWallEndpoint.initialX1, y: resizingWallEndpoint.initialY1 }
        : { x: resizingWallEndpoint.initialX2, y: resizingWallEndpoint.initialY2 };

      const snapRes = CadSnapEngine.snap(currentPoint, canonicalWallNet.walls, currentFloor.rooms, {
        referencePoint: excludedEndpoint,
        excludedWallId: resizingWallEndpoint.wallId,
        excludedEndpoint,
      });
      setCurrentSnap(snapRes);
      const snapped = snapRes.point;

      setLayout((prev) => {
        const nextFloors = prev.floors ? [...prev.floors] : [];
        if (nextFloors[activeFloorIndex]) {
          const floor = nextFloors[activeFloorIndex];
          const updateWallEndpoint = (w: Wall) => {
            if (w.id === resizingWallEndpoint.wallId) {
              if (endpoint === "start") {
                const nextX = isHorizontal ? snapped.x : w.x1;
                const nextY = isHorizontal ? w.y1 : snapped.y;
                return { ...w, x1: nextX, y1: nextY, start: { x: nextX, y: nextY } };
              } else {
                const nextX = isHorizontal ? snapped.x : w.x2;
                const nextY = isHorizontal ? w.y2 : snapped.y;
                return { ...w, x2: nextX, y2: nextY, end: { x: nextX, y: nextY } };
              }
            }
            return w;
          };
          nextFloors[activeFloorIndex] = {
            ...floor,
            exterior_walls: (floor.exterior_walls || []).map(updateWallEndpoint),
            interior_walls: (floor.interior_walls || []).map(updateWallEndpoint),
          };
          return { ...prev, floors: nextFloors };
        }
        return prev;
      });
      return;
    }

    // 3. Room Dragging with Smart Alignment Guides (Figma-Style)
    if (draggingRoom) {
      const deltaXFeet = (e.clientX - draggingRoom.startMouseX) / (SCALE * zoom);
      const deltaYFeet = (e.clientY - draggingRoom.startMouseY) / (SCALE * zoom);

      const targetRoom = (currentFloor.rooms || []).find((r) => r.id === draggingRoom.roomId);
      if (!targetRoom || !targetRoom.rect) return;

      const rawX = draggingRoom.initialX + deltaXFeet;
      const rawY = draggingRoom.initialY + deltaYFeet;
      const roomW = targetRoom.rect.width;
      const roomL = targetRoom.rect.length;

      let finalX = Math.round(rawX * 2) / 2;
      let finalY = Math.round(rawY * 2) / 2;
      const guides: Array<{ type: "h" | "v"; pos: number }> = [];
      const snapThreshold = 0.4;

      // Snap to plot boundaries
      if (Math.abs(rawX - 0) < snapThreshold) {
        finalX = 0;
        guides.push({ type: "v", pos: 0 });
      } else if (Math.abs(rawX + roomW - layout.plot_width) < snapThreshold) {
        finalX = layout.plot_width - roomW;
        guides.push({ type: "v", pos: layout.plot_width });
      }

      if (Math.abs(rawY - 0) < snapThreshold) {
        finalY = 0;
        guides.push({ type: "h", pos: 0 });
      } else if (Math.abs(rawY + roomL - layout.plot_length) < snapThreshold) {
        finalY = layout.plot_length - roomL;
        guides.push({ type: "h", pos: layout.plot_length });
      }

      // Snap to other room boundaries on the active floor
      for (const other of currentFloor.rooms || []) {
        if (other.id === draggingRoom.roomId || !other.rect) continue;
        const ox1 = other.rect.x;
        const ox2 = other.rect.x + other.rect.width;
        const oy1 = other.rect.y;
        const oy2 = other.rect.y + other.rect.length;

        // X alignments
        if (Math.abs(rawX - ox1) < snapThreshold) {
          finalX = ox1;
          guides.push({ type: "v", pos: ox1 });
        } else if (Math.abs(rawX - ox2) < snapThreshold) {
          finalX = ox2;
          guides.push({ type: "v", pos: ox2 });
        } else if (Math.abs(rawX + roomW - ox1) < snapThreshold) {
          finalX = ox1 - roomW;
          guides.push({ type: "v", pos: ox1 });
        } else if (Math.abs(rawX + roomW - ox2) < snapThreshold) {
          finalX = ox2 - roomW;
          guides.push({ type: "v", pos: ox2 });
        }

        // Y alignments
        if (Math.abs(rawY - oy1) < snapThreshold) {
          finalY = oy1;
          guides.push({ type: "h", pos: oy1 });
        } else if (Math.abs(rawY - oy2) < snapThreshold) {
          finalY = oy2;
          guides.push({ type: "h", pos: oy2 });
        } else if (Math.abs(rawY + roomL - oy1) < snapThreshold) {
          finalY = oy1 - roomL;
          guides.push({ type: "h", pos: oy1 });
        } else if (Math.abs(rawY + roomL - oy2) < snapThreshold) {
          finalY = oy2 - roomL;
          guides.push({ type: "h", pos: oy2 });
        }
      }

      setAlignmentGuides(guides);

      const clampedX = Math.max(0, Math.min(layout.plot_width - roomW, finalX));
      const clampedY = Math.max(0, Math.min(layout.plot_length - roomL, finalY));

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

    // 4. Furniture Dragging
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

    // 5. Room Edge / Corner Resizing
    else if (resizingRoom) {
      const deltaXFeet = (e.clientX - resizingRoom.startMouseX) / (SCALE * zoom);
      const deltaYFeet = (e.clientY - resizingRoom.startMouseY) / (SCALE * zoom);
      const orig = resizingRoom.initialRect;
      const targetRoom = (currentFloor.rooms || []).find((r) => r.id === resizingRoom.roomId);
      const minDims = getRoomMinimumDimensions(targetRoom?.type || "");

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

    if (drawingWall) {
      finishWallDrawing();
      return;
    }

    if (draggingOpening) {
      const activeDrag = draggingOpening;
      setDraggingOpening(null);
      const allOpenings: Array<Door | Window> = [
        ...(currentFloor.doors || []),
        ...(currentFloor.windows || []),
      ];
      const candidate = allOpenings.find((opening) => opening.id === activeDrag.id);
      const wall = canonicalWallNet.walls.find((item) => item.id === activeDrag.wallId);
      if (!candidate || !wall || openingOverlaps(candidate, allOpenings, wall)) {
        const restoredOpening = activeDrag.initialOpening;
        const restoredFloor = activeDrag.kind === "door"
          ? { doors: (currentFloor.doors || []).map((opening) => opening.id === activeDrag.id ? restoredOpening as Door : opening) }
          : { windows: (currentFloor.windows || []).map((opening) => opening.id === activeDrag.id ? restoredOpening as Window : opening) };
        commitFloorUpdate(restoredFloor);
        setInvalidMoveNotice("Opening must remain attached to its host wall without overlapping another opening.");
        setTimeout(() => setInvalidMoveNotice(null), 3000);
      } else {
        pushSnapshot(layout);
      }
      return;
    }

    // Wall Dragging Completion: Direct Parametric CAD Topology Commit
    if (draggingWall) {
      const activeDrag = draggingWall;
      setDraggingWall(null);
      setCurrentSnap(null);

      const currentRooms = currentFloor.rooms || [];
      const hasInvalidRoom = currentRooms.some((r) => {
        if (!r.rect) return false;
        return (
          r.rect.width < 3.5 ||
          r.rect.length < 3.5 ||
          r.rect.x < 0 ||
          r.rect.y < 0 ||
          r.rect.x + r.rect.width > layout.plot_width ||
          r.rect.y + r.rect.length > layout.plot_length
        );
      });

      if (hasInvalidRoom) {
        setInvalidMoveNotice("Wall movement violates room boundary constraints.");
        setTimeout(() => setInvalidMoveNotice(null), 3000);
        // Revert to initial
        setLayout((prev) => {
          const nextFloors = prev.floors ? [...prev.floors] : [];
          if (nextFloors[activeFloorIndex]) {
            nextFloors[activeFloorIndex] = activeDrag.initialFloor || {
              ...nextFloors[activeFloorIndex],
              exterior_walls: activeDrag.initialWalls.filter((wall) => wall.is_exterior),
              interior_walls: activeDrag.initialWalls.filter((wall) => !wall.is_exterior),
              rooms: activeDrag.initialRooms,
              doors: activeDrag.initialDoors,
              windows: activeDrag.initialWindows,
            };
            return syncPrimaryFloor({ ...prev, floors: nextFloors });
          }
          return prev;
        });
        return;
      }

      // Commit canonical floor layout with undo snapshot
      pushSnapshot(layout);
      return;
    }

    // Wall Endpoint Resizing Completion: Check Min Length
    if (resizingWallEndpoint) {
      const activeEndpoint = resizingWallEndpoint;
      setResizingWallEndpoint(null);

      const currentWall = [
        ...(currentFloor.exterior_walls || []),
        ...(currentFloor.interior_walls || []),
      ].find((w) => w.id === activeEndpoint.wallId);

      if (currentWall) {
        const len = Math.hypot(currentWall.x2 - currentWall.x1, currentWall.y2 - currentWall.y1);
        if (len < 3.0) {
          setInvalidMoveNotice("Wall cannot be shortened below 3 feet.");
          setTimeout(() => setInvalidMoveNotice(null), 3000);
          setLayout((prev) => {
            const nextFloors = prev.floors ? [...prev.floors] : [];
            if (nextFloors[activeFloorIndex]) {
              nextFloors[activeFloorIndex] = {
                ...nextFloors[activeFloorIndex],
                exterior_walls: activeEndpoint.initialWalls.filter((w) => w.is_exterior),
                interior_walls: activeEndpoint.initialWalls.filter((w) => !w.is_exterior),
              };
              return { ...prev, floors: nextFloors };
            }
            return prev;
          });
          return;
        }
        const walls = activeEndpoint.initialWalls.map((wall) => {
          const current = [
            ...(currentFloor.exterior_walls || []),
            ...(currentFloor.interior_walls || []),
          ].find((item) => item.id === wall.id);
          return current || wall;
        });
        if (!hasValidWallGeometry(walls, layout.plot_width, layout.plot_length)) {
          commitFloorUpdate({
            exterior_walls: activeEndpoint.initialWalls.filter((wall) => wall.is_exterior),
            interior_walls: activeEndpoint.initialWalls.filter((wall) => !wall.is_exterior),
          });
          setInvalidMoveNotice("Wall geometry is invalid; the previous endpoint was restored.");
          setTimeout(() => setInvalidMoveNotice(null), 3000);
          return;
        }
        const initialWall = activeEndpoint.initialWalls.find((wall) => wall.id === currentWall.id);
        if (initialWall?.adjacent_room_ids?.length) {
          const initialX = activeEndpoint.endpoint === "start" ? initialWall.x1 : initialWall.x2;
          const initialY = activeEndpoint.endpoint === "start" ? initialWall.y1 : initialWall.y2;
          const targetX = activeEndpoint.endpoint === "start" ? currentWall.x1 : currentWall.x2;
          const targetY = activeEndpoint.endpoint === "start" ? currentWall.y1 : currentWall.y2;
          let changedBoundary = false;
          const updatedRooms = activeEndpoint.initialRooms.map((room) => {
            if (!initialWall.adjacent_room_ids?.includes(room.id) || !room.rect) return room;
            let rect = { ...room.rect };
            if (Math.abs(initialWall.y1 - initialWall.y2) < 0.05) {
              if (Math.abs(rect.x - initialX) < 0.05) {
                rect = { ...rect, x: targetX, width: rect.x + rect.width - targetX };
                changedBoundary = true;
              } else if (Math.abs(rect.x + rect.width - initialX) < 0.05) {
                rect = { ...rect, width: targetX - rect.x };
                changedBoundary = true;
              }
            } else if (Math.abs(rect.y - initialY) < 0.05) {
              rect = { ...rect, y: targetY, length: rect.y + rect.length - targetY };
              changedBoundary = true;
            } else if (Math.abs(rect.y + rect.length - initialY) < 0.05) {
              rect = { ...rect, length: targetY - rect.y };
              changedBoundary = true;
            }
            if (rect.width === room.rect.width && rect.length === room.rect.length && rect.x === room.rect.x && rect.y === room.rect.y) {
              return room;
            }
            return constrainFurnitureToRoom({
              ...room,
              rect,
              area_sqft: Math.round(rect.width * rect.length),
            });
          });
          const invalidRoom = updatedRooms.some((room) =>
            !room.rect ||
            room.rect.width < 4 ||
            room.rect.length < 4 ||
            room.rect.x < 0 ||
            room.rect.y < 0 ||
            room.rect.x + room.rect.width > layout.plot_width ||
            room.rect.y + room.rect.length > layout.plot_length
          );
          if (!changedBoundary || invalidRoom) {
            commitFloorUpdate({
              exterior_walls: activeEndpoint.initialWalls.filter((wall) => wall.is_exterior),
              interior_walls: activeEndpoint.initialWalls.filter((wall) => !wall.is_exterior),
            });
            setInvalidMoveNotice("This endpoint cannot be moved without violating room boundaries.");
            setTimeout(() => setInvalidMoveNotice(null), 3000);
            return;
          }
          const { exteriorWalls, interiorWalls, doors, windows } = regenerateFloorGeometry(
            updatedRooms,
            currentFloor.doors || [],
            currentFloor.windows || []
          );
          setSelectedWallId(
            findCanonicalWallMatch(
              [...exteriorWalls, ...interiorWalls],
              currentWall
            )?.id || null
          );
          commitFloorUpdate({
            rooms: updatedRooms,
            exterior_walls: exteriorWalls,
            interior_walls: interiorWalls,
            doors,
            windows,
          });
          return;
        }
        const nextDoors = (currentFloor.doors || []).map((opening) => {
          if ((opening.host_wall_id || opening.wall_id) !== currentWall.id) return opening;
          const geometry = projectOpeningToWall(
            currentWall,
            { x: (opening.x1 + opening.x2) / 2, y: (opening.y1 + opening.y2) / 2 },
            opening.width
          );
          return geometry ? { ...opening, ...geometry } : opening;
        });
        const nextWindows = (currentFloor.windows || []).map((opening) => {
          if ((opening.host_wall_id || opening.wall_id) !== currentWall.id) return opening;
          const geometry = projectOpeningToWall(
            currentWall,
            { x: (opening.x1 + opening.x2) / 2, y: (opening.y1 + opening.y2) / 2 },
            opening.width
          );
          return geometry ? { ...opening, ...geometry } : opening;
        });
        const allOpenings: Array<Door | Window> = [...nextDoors, ...nextWindows];
        const attachedOpenings = allOpenings.filter(
          (opening) => (opening.host_wall_id || opening.wall_id) === currentWall.id
        );
        if (
          attachedOpenings.some((opening) =>
            opening.width > Math.hypot(currentWall.x2 - currentWall.x1, currentWall.y2 - currentWall.y1) - 0.5 ||
            openingOverlaps(opening, attachedOpenings, currentWall)
          )
        ) {
          commitFloorUpdate({
            exterior_walls: activeEndpoint.initialWalls.filter((wall) => wall.is_exterior),
            interior_walls: activeEndpoint.initialWalls.filter((wall) => !wall.is_exterior),
          });
          setInvalidMoveNotice("Endpoint edit would detach or overlap an opening; the previous geometry was restored.");
          setTimeout(() => setInvalidMoveNotice(null), 3000);
          return;
        }
        commitFloorUpdate({
          exterior_walls: currentFloor.exterior_walls || [],
          interior_walls: currentFloor.interior_walls || [],
          doors: nextDoors,
          windows: nextWindows,
        });
        return;
      }
      pushSnapshot(layout);
      return;
    }

    // Room Resizing Completion: Client-Side Geometry Engine Update
    if (resizingRoom) {
      const activeResizing = resizingRoom;
      setResizingRoom(null);
      const currentRooms = currentFloor.rooms || [];
      const hasInvalidRoom = currentRooms.some(
        (r) => !r.rect || r.rect.width < 4.0 || r.rect.length < 4.0
      );

      if (hasInvalidRoom) {
        setInvalidMoveNotice("Room dimensions cannot be less than 4 feet.");
        setTimeout(() => setInvalidMoveNotice(null), 3000);
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
        return;
      }

      const { exteriorWalls, interiorWalls, doors: syncedDoors, windows: syncedWindows } = regenerateFloorGeometry(
        currentRooms,
        currentFloor.doors || [],
        currentFloor.windows || []
      );
      commitFloorUpdate({
        exterior_walls: exteriorWalls,
        interior_walls: interiorWalls,
        doors: syncedDoors,
        windows: syncedWindows,
      });
      return;
    }

    // Room Dragging Completion: Client-Side Geometry Engine Update
    if (draggingRoom) {
      setDraggingRoom(null);
      setAlignmentGuides([]);
      const currentRooms = currentFloor.rooms || [];
      const { exteriorWalls, interiorWalls, doors: syncedDoors, windows: syncedWindows } = regenerateFloorGeometry(
        currentRooms,
        currentFloor.doors || [],
        currentFloor.windows || []
      );

      commitFloorUpdate({
        exterior_walls: exteriorWalls,
        interior_walls: interiorWalls,
        doors: syncedDoors,
        windows: syncedWindows,
      });
      return;
    }

    // Furniture Dragging Completion
    if (draggingFurniture) {
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
    let targetW = 0;
    let targetL = 0;
    const updatedRooms = (currentFloor.rooms || []).map((r) => {
      if (r.id !== selectedRoomId || !r.rect) return r;
      const currentW = r.rect.width;
      const currentL = r.rect.length;
      const newW = dimension === "width" ? Math.max(6, Math.min(45, currentW + delta)) : currentW;
      const newL = dimension === "length" ? Math.max(6, Math.min(45, currentL + delta)) : currentL;
      targetW = newW;
      targetL = newL;
      return {
        ...r,
        rect: { ...r.rect, width: newW, length: newL },
        area_sqft: Math.round(newW * newL),
      };
    });

    const { exteriorWalls, interiorWalls, doors: sDoors, windows: sWins } = regenerateFloorGeometry(
      updatedRooms,
      currentFloor.doors || [],
      currentFloor.windows || []
    );

    const nextFloors = layout.floors
      ? layout.floors.map((f, idx) =>
          idx === activeFloorIndex
            ? {
                ...f,
                rooms: updatedRooms,
                exterior_walls: exteriorWalls,
                interior_walls: interiorWalls,
                doors: sDoors,
                windows: sWins,
              }
            : f
        )
      : [];
    const nextLayout: HouseLayout = {
      ...layout,
      floors: nextFloors.length > 0 ? nextFloors : (layout.floors || []),
      rooms: updatedRooms,
    };
    if (targetW > 0) setExactWidthInput(feetToArchitectural(targetW));
    if (targetL > 0) setExactLengthInput(feetToArchitectural(targetL));
    setLayout(nextLayout);
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
    setLayout(nextLayout);
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
      setLayout(nextLayout);
      pushSnapshot(nextLayout);
    } else if (selectedWallId) {
      handleDeleteWall();
    } else if (selectedRoomId) {
      if ((currentFloor.rooms || []).length <= 1) {
        setInvalidMoveNotice("Cannot delete the only room.");
        setTimeout(() => setInvalidMoveNotice(null), 3000);
        return;
      }
      const remainingRooms = (currentFloor.rooms || []).filter((r) => r.id !== selectedRoomId);
      const { exteriorWalls, interiorWalls, doors: sDoors, windows: sWins } = regenerateFloorGeometry(
        remainingRooms,
        (currentFloor.doors || []).filter((d) => d.room_id !== selectedRoomId),
        (currentFloor.windows || []).filter((w) => w.room_id !== selectedRoomId)
      );
      commitFloorUpdate({
        rooms: remainingRooms,
        exterior_walls: exteriorWalls,
        interior_walls: interiorWalls,
        doors: sDoors,
        windows: sWins,
      });
      handleSelectRoom(null);
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
      setLayout(nextLayout);
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
      setLayout(nextLayout);
      pushSnapshot(nextLayout);
    }
  };

  // Flip Door Swing (Inward / Outward & Hinge Side)
  const handleFlipDoorSwing = () => {
    if (!selectedDoorId) return;
    const nextDoors = (currentFloor.doors || []).map((door) => {
      if (door.id !== selectedDoorId) return door;
      return {
        ...door,
        swing: door.swing === "inward" ? ("outward" as const) : ("inward" as const),
        swing_direction: door.swing_direction === "inward" ? ("outward" as const) : ("inward" as const),
        hinge_side: door.hinge_side === "left" ? ("right" as const) : ("left" as const),
      };
    });
    commitFloorUpdate({ doors: nextDoors });
  };

  const resizeOpeningWidth = (kind: "door" | "window", deltaFt: number) => {
    const id = kind === "door" ? selectedDoorId : selectedWindowId;
    if (!id) return;
    const existing = kind === "door"
      ? (currentFloor.doors || []).find((opening) => opening.id === id)
      : (currentFloor.windows || []).find((opening) => opening.id === id);
    if (!existing) return;
    const wallId = existing.host_wall_id || existing.wall_id;
    const wall = canonicalWallNet.walls.find((item) => item.id === wallId);
    if (!wall) return;
    const maxWidth = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1) - 0.5;
    const width = Math.max(kind === "door" ? 2 : 1, Math.min(maxWidth, existing.width + deltaFt));
    const geometry = projectOpeningToWall(
      wall,
      { x: (existing.x1 + existing.x2) / 2, y: (existing.y1 + existing.y2) / 2 },
      width
    );
    if (!geometry) return;
    const candidate = { ...existing, ...geometry };
    const siblings = [...(currentFloor.doors || []), ...(currentFloor.windows || [])];
    if (openingOverlaps(candidate, siblings, wall)) {
      setInvalidMoveNotice("Opening resize would overlap another opening.");
      setTimeout(() => setInvalidMoveNotice(null), 2500);
      return;
    }
    if (kind === "door") {
      commitFloorUpdate({
        doors: (currentFloor.doors || []).map((opening) => opening.id === id ? candidate as Door : opening),
      });
    } else {
      commitFloorUpdate({
        windows: (currentFloor.windows || []).map((opening) => opening.id === id ? candidate as Window : opening),
      });
    }
  };

  const handleResizeDoorWidth = (deltaFt: number) => resizeOpeningWidth("door", deltaFt);
  const handleResizeWindowWidth = (deltaFt: number) => resizeOpeningWidth("window", deltaFt);

  const handleResizeWindowHeight = (deltaFt: number) => {
    if (!selectedWindowId) return;
    commitFloorUpdate({
      windows: (currentFloor.windows || []).map((opening) =>
        opening.id === selectedWindowId
          ? { ...opening, height: Math.max(1, Math.min(10, (opening.height || 4) + deltaFt)) }
          : opening
      ),
    });
  };

  // Unified Exit / Return to Plan helper
  const exitEditToPlan = useCallback(
    async (shouldSave = true) => {
      // 1. Cancel in-progress drafting & measurements safely
      if (drawingWall) {
        setDrawingWall(null);
        setCurrentSnap(null);
      }
      if (measureState) {
        setMeasureState(null);
      }

      // 2. Commit required changes & preserve canonical HouseLayout
      if (shouldSave) {
        try {
          const canonicalLayout = syncPrimaryFloor(layout);
          const sanitizedLayout = validateAndSanitizeHouseLayout(canonicalLayout) || canonicalLayout;
          await onSave?.(sanitizedLayout);
          onUpdateLayout?.(sanitizedLayout);
        } catch (e) {
          console.warn("Save on exit error:", e);
        }
      }

      // 3. Switch / navigate to PLAN
      if (onBack) {
        onBack();
      } else {
        const targetId = layout.id || (layout as any).project_id;
        if (targetId) {
          router.push(`/project/${targetId}/plan`);
        } else {
          router.push("/plan");
        }
      }
    },
    [drawingWall, measureState, layout, onSave, onUpdateLayout, onBack, router]
  );

  // Done Editing: Save and Return to Plan
  const handleDone = async () => {
    setIsSaving(true);
    try {
      await exitEditToPlan(true);
    } finally {
      setIsSaving(false);
    }
  };

  // Exit Editor: Return to Plan
  const handleExit = async () => {
    await exitEditToPlan(true);
  };

  // AI Architect Quick Actions & Natural Language Refinement
  const handleAiAction = async (promptText: string) => {
    if (!promptText.trim() || isAiProcessing) return;
    setIsAiProcessing(true);
    setAiNotice(null);

    // 1. Deterministic Local CAD AI Command first (preserves canonical model locally)
    const activeEntityId = selectedWallId || selectedDoorId || selectedWindowId || selectedRoomId;
    const localResult = executeLocalCadAiCommand(
      layout,
      activeFloorIndex,
      promptText,
      activeEntityId
    );

    if (localResult && localResult.success && localResult.layout) {
      const sanitized = validateAndSanitizeHouseLayout(localResult.layout) || localResult.layout;
      pushSnapshot(sanitized);
      setAiNotice(localResult.message || `Locally executed: "${promptText}"`);
      setAiPrompt("");
      setIsAiProcessing(false);
      return;
    }

    // 2. Fall back to backend refinement if not handled locally
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

  // Run Gemini Visual Architectural QA
  const handleRunGeminiQa = async () => {
    setIsQaReviewing(true);
    setAiNotice(null);
    try {
      const result = await reviewLayoutWithGemini(layout, Boolean(layout.vastu_result));
      if (result) {
        setQaReport(result);
        const issueCount = result.issues?.length || 0;
        setAiNotice(`Gemini QA completed. Score: ${result.score ?? "N/A"}/100 with ${issueCount} architectural check${issueCount === 1 ? "" : "s"}.`);
      } else {
        setAiNotice("Gemini QA completed. No architectural conflicts identified.");
      }
    } catch (err) {
      console.warn("Visual QA check failed:", err);
      setAiNotice("Visual QA check encountered an issue. Layout remains intact.");
    } finally {
      setIsQaReviewing(false);
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

    // Minimal Architectural CAD Furniture Outlines
    const isBed = item.type.includes("bed");
    const isSofa = item.type.includes("sofa") || item.type.includes("couch");
    const isDining = item.type.includes("dining") || item.type.includes("table");
    const isBath = item.type.includes("toilet") || item.type.includes("commode") || item.type.includes("wc");
    const isBasin = item.type.includes("sink") || item.type.includes("basin") || item.type.includes("vanity");
    const isShower = item.type.includes("shower") || item.type.includes("bath");
    const isKitchen = item.type.includes("counter") || item.type.includes("stove") || item.type.includes("kitchen") || item.type.includes("cooktop");
    const isWardrobe = item.type.includes("wardrobe") || item.type.includes("closet");

    return (
      <g
        key={item.id}
        transform={`rotate(${item.rotation || 0}, ${ix}, ${iy})`}
        onClick={handleFurnitureClick}
        onMouseDown={handleFurnitureMouseDown}
        className={`${mode === "edit" ? "cursor-move" : "cursor-pointer"}`}
      >
        {/* Main Boundary Outline */}
        <rect
          x={ix - iw / 2}
          y={iy - il / 2}
          width={iw}
          height={il}
          rx={isSofa || isBasin ? 4 : 2}
          fill={isSelected ? "#FFFBF5" : "#FFFFFF"}
          stroke={strokeCol}
          strokeWidth={strokeW}
        />

        {/* Minimal Bed Outline */}
        {isBed && (
          <>
            <line
              x1={ix - iw / 2}
              y1={iy - il / 2 + Math.max(4, il * 0.14)}
              x2={ix + iw / 2}
              y2={iy - il / 2 + Math.max(4, il * 0.14)}
              stroke={strokeCol}
              strokeWidth={1}
            />
            <rect
              x={ix - iw / 2 + iw * 0.1}
              y={iy - il / 2 + 5}
              width={iw * 0.34}
              height={Math.min(14, il * 0.22)}
              rx={2}
              fill="none"
              stroke="#94A3B8"
              strokeWidth={0.9}
            />
            <rect
              x={ix + iw / 2 - iw * 0.1 - iw * 0.34}
              y={iy - il / 2 + 5}
              width={iw * 0.34}
              height={Math.min(14, il * 0.22)}
              rx={2}
              fill="none"
              stroke="#94A3B8"
              strokeWidth={0.9}
            />
          </>
        )}

        {/* Minimal Sofa Outline */}
        {isSofa && (
          <>
            <line
              x1={ix - iw / 2 + 6}
              y1={iy - il / 2 + Math.max(6, il * 0.25)}
              x2={ix + iw / 2 - 6}
              y2={iy - il / 2 + Math.max(6, il * 0.25)}
              stroke={strokeCol}
              strokeWidth={1}
            />
            <line
              x1={ix - iw / 2 + Math.max(5, iw * 0.12)}
              y1={iy - il / 2}
              x2={ix - iw / 2 + Math.max(5, iw * 0.12)}
              y2={iy + il / 2}
              stroke={strokeCol}
              strokeWidth={0.9}
            />
            <line
              x1={ix + iw / 2 - Math.max(5, iw * 0.12)}
              y1={iy - il / 2}
              x2={ix + iw / 2 - Math.max(5, iw * 0.12)}
              y2={iy + il / 2}
              stroke={strokeCol}
              strokeWidth={0.9}
            />
          </>
        )}

        {/* Minimal Dining Table */}
        {isDining && (
          <rect
            x={ix - iw / 2 + 3}
            y={iy - il / 2 + 3}
            width={Math.max(2, iw - 6)}
            height={Math.max(2, il - 6)}
            fill="none"
            stroke="#CBD5E1"
            strokeWidth={0.7}
            strokeDasharray="2 2"
          />
        )}

        {/* Minimal Toilet */}
        {isBath && (
          <>
            <rect
              x={ix - iw / 2 + 3}
              y={iy - il / 2 + 2}
              width={Math.max(4, iw - 6)}
              height={Math.max(4, il * 0.3)}
              rx={1}
              fill="none"
              stroke={strokeCol}
              strokeWidth={1}
            />
            <ellipse
              cx={ix}
              cy={iy + il * 0.15}
              rx={Math.max(3, iw * 0.32)}
              ry={Math.max(4, il * 0.32)}
              fill="none"
              stroke={strokeCol}
              strokeWidth={1}
            />
          </>
        )}

        {/* Minimal Basin */}
        {isBasin && (
          <circle
            cx={ix}
            cy={iy}
            r={Math.min(iw, il) * 0.28}
            fill="none"
            stroke={strokeCol}
            strokeWidth={1}
          />
        )}

        {/* Minimal Shower */}
        {isShower && (
          <>
            <line
              x1={ix - iw / 2 + 3}
              y1={iy - il / 2 + 3}
              x2={ix + iw / 2 - 3}
              y2={iy + il / 2 - 3}
              stroke="#CBD5E1"
              strokeWidth={0.8}
            />
            <line
              x1={ix + iw / 2 - 3}
              y1={iy - il / 2 + 3}
              x2={ix - iw / 2 + 3}
              y2={iy + il / 2 - 3}
              stroke="#CBD5E1"
              strokeWidth={0.8}
            />
            <circle cx={ix} cy={iy} r={3.5} fill="#FFFFFF" stroke={strokeCol} strokeWidth={1} />
          </>
        )}

        {/* Minimal Kitchen Counter / Cooktop */}
        {isKitchen && (
          <>
            <circle cx={ix - iw * 0.22} cy={iy} r={Math.min(iw, il) * 0.18} fill="none" stroke="#94A3B8" strokeWidth={0.9} />
            <circle cx={ix + iw * 0.22} cy={iy} r={Math.min(iw, il) * 0.18} fill="none" stroke="#94A3B8" strokeWidth={0.9} />
          </>
        )}

        {/* Minimal Wardrobe */}
        {isWardrobe && (
          <>
            <line x1={ix} y1={iy - il / 2} x2={ix} y2={iy + il / 2} stroke={strokeCol} strokeWidth={1} />
            <line x1={ix - 3} y1={iy} x2={ix - 3} y2={iy + 6} stroke={strokeCol} strokeWidth={1.2} />
            <line x1={ix + 3} y1={iy} x2={ix + 3} y2={iy + 6} stroke={strokeCol} strokeWidth={1.2} />
          </>
        )}

        {/* Selected visual indicator */}
        {isSelected && mode === "edit" && (
          <circle cx={ix} cy={iy - il / 2 - 7} r={3.5} fill="#C48446" />
        )}
      </g>
    );
  };

  // Selected Room Object
  const selectedRoom = (currentFloor.rooms || []).find((r) => r.id === selectedRoomId);
  const selectedFurniture = (currentFloor.rooms || [])
    .flatMap((r) => r.furniture || [])
    .find((f) => f.id === selectedFurnitureId);

  // Selected Entity helper
  const selectedEntity = selectedRoom || selectedFurniture || selectedDoor || selectedWindow || selectedWall;

  // Sync exact dimension inputs when selectedRoom changes
  useEffect(() => {
    if (selectedRoom && selectedRoom.rect) {
      setExactWidthInput(feetToArchitectural(selectedRoom.rect.width));
      setExactLengthInput(feetToArchitectural(selectedRoom.rect.length));
    }
  }, [selectedRoom?.id, selectedRoom?.rect?.width, selectedRoom?.rect?.length]);

  // Render SVG Drawing Sheet
  const renderSvgSheet = () => (
    <svg
            ref={svgRef}
            id="architectural-svg"
            onMouseDownCapture={handleSvgMouseDownCapture}
            onClickCapture={handleSvgClickCapture}
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
            {drawingWall && (
              <line
                x1={drawingWall.start.x * SCALE}
                y1={drawingWall.start.y * SCALE}
                x2={drawingWall.end.x * SCALE}
                y2={drawingWall.end.y * SCALE}
                stroke="#C48446"
                strokeWidth={3}
                strokeDasharray="7 4"
                pointerEvents="none"
              />
            )}

            {/* Site Boundary Label */}
            <text x={10} y={-14} fill="#475569" className="font-mono text-[10px] tracking-widest uppercase font-semibold">
              PROPERTY BOUNDARY: {layout.plot_width}&apos; × {layout.plot_length}&apos; (
              {(layout.plot_width * layout.plot_length).toLocaleString()} SQ FT)
            </text>

            {/* Canonical Road / Front Access Graphic (Oriented to matching plot edge) */}
            {(() => {
              const resolvedFacing = (layout.facing || layout.orientation || layout.site?.road_side || "south").toLowerCase();
              if (resolvedFacing === "west") {
                return (
                  <g id="road-frontage-west" pointerEvents="none">
                    <rect
                      x={-34}
                      y={-10}
                      width={30}
                      height={svgHeight + 20}
                      fill="#F1F5F9"
                      stroke="#94A3B8"
                      strokeWidth={1.2}
                      rx={2}
                    />
                    <line
                      x1={-19}
                      y1={-10}
                      x2={-19}
                      y2={svgHeight + 10}
                      stroke="#CBD5E1"
                      strokeWidth={1.2}
                      strokeDasharray="6 4"
                    />
                    <g transform={`rotate(-90, -19, ${svgHeight / 2})`}>
                      <text
                        x={-19}
                        y={svgHeight / 2 + 3}
                        textAnchor="middle"
                        fill="#334155"
                        className="font-mono text-[9px] font-bold tracking-wider"
                      >
                        ROAD / FRONT ACCESS (WEST)
                      </text>
                    </g>
                  </g>
                );
              } else if (resolvedFacing === "east") {
                return (
                  <g id="road-frontage-east" pointerEvents="none">
                    <rect
                      x={svgWidth + 4}
                      y={-10}
                      width={30}
                      height={svgHeight + 20}
                      fill="#F1F5F9"
                      stroke="#94A3B8"
                      strokeWidth={1.2}
                      rx={2}
                    />
                    <line
                      x1={svgWidth + 19}
                      y1={-10}
                      x2={svgWidth + 19}
                      y2={svgHeight + 10}
                      stroke="#CBD5E1"
                      strokeWidth={1.2}
                      strokeDasharray="6 4"
                    />
                    <g transform={`rotate(90, ${svgWidth + 19}, ${svgHeight / 2})`}>
                      <text
                        x={svgWidth + 19}
                        y={svgHeight / 2 + 3}
                        textAnchor="middle"
                        fill="#334155"
                        className="font-mono text-[9px] font-bold tracking-wider"
                      >
                        ROAD / FRONT ACCESS (EAST)
                      </text>
                    </g>
                  </g>
                );
              } else if (resolvedFacing === "north") {
                return (
                  <g id="road-frontage-north" pointerEvents="none">
                    <rect
                      x={-10}
                      y={-34}
                      width={svgWidth + 20}
                      height={30}
                      fill="#F1F5F9"
                      stroke="#94A3B8"
                      strokeWidth={1.2}
                      rx={2}
                    />
                    <line
                      x1={-10}
                      y1={-19}
                      x2={svgWidth + 10}
                      y2={-19}
                      stroke="#CBD5E1"
                      strokeWidth={1.2}
                      strokeDasharray="6 4"
                    />
                    <text
                      x={svgWidth / 2}
                      y={-15}
                      textAnchor="middle"
                      fill="#334155"
                      className="font-mono text-[9px] font-bold tracking-wider"
                    >
                      ROAD / FRONT ACCESS (NORTH)
                    </text>
                  </g>
                );
              } else {
                return (
                  <g id="road-frontage-south" pointerEvents="none">
                    <rect
                      x={-10}
                      y={svgHeight + 4}
                      width={svgWidth + 20}
                      height={30}
                      fill="#F1F5F9"
                      stroke="#94A3B8"
                      strokeWidth={1.2}
                      rx={2}
                    />
                    <line
                      x1={-10}
                      y1={svgHeight + 19}
                      x2={svgWidth + 10}
                      y2={svgHeight + 19}
                      stroke="#CBD5E1"
                      strokeWidth={1.2}
                      strokeDasharray="6 4"
                    />
                    <text
                      x={svgWidth / 2}
                      y={svgHeight + 23}
                      textAnchor="middle"
                      fill="#334155"
                      className="font-mono text-[9px] font-bold tracking-wider"
                    >
                      ROAD / FRONT ACCESS (SOUTH)
                    </text>
                  </g>
                );
              }
            })()}

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

            {/* 2D CANONICAL ARCHITECTURAL LANDSCAPE (SHARED 1:1 WITH 3D MODEL) */}
            {showLandscape && archLandscape && (
              <g id="landscape-background-layer" pointerEvents="none">
                {/* 1. Discrete Lawn Zones */}
                {archLandscape.lawnZones.map((lawn) => {
                  const lx = lawn.rect.x * SCALE;
                  const ly = lawn.rect.y * SCALE;
                  const lw = lawn.rect.width * SCALE;
                  const lh = lawn.rect.length * SCALE;
                  return (
                    <g key={lawn.id}>
                      <rect
                        x={lx}
                        y={ly}
                        width={lw}
                        height={lh}
                        fill="#F2FBF5"
                        stroke="#86EFAC"
                        strokeWidth={1.1}
                        strokeDasharray="4 3"
                        rx={3}
                      />
                      <text
                        x={lx + lw / 2}
                        y={ly + lh / 2 + 3}
                        fill="#16A34A"
                        textAnchor="middle"
                        className="font-mono text-[8.5px] tracking-widest uppercase font-semibold pointer-events-none select-none"
                        opacity={0.65}
                      >
                        {lawn.name}
                      </text>
                    </g>
                  );
                })}

                {/* 2. Structured Planting Beds */}
                {archLandscape.plantingBeds.map((bed) => {
                  const bx = bed.rect.x * SCALE;
                  const by = bed.rect.y * SCALE;
                  const bw = bed.rect.width * SCALE;
                  const bl = bed.rect.length * SCALE;
                  return (
                    <g key={bed.id}>
                      <rect
                        x={bx}
                        y={by}
                        width={bw}
                        height={bl}
                        fill="#ECFDF5"
                        stroke="#6EE7B7"
                        strokeWidth={0.9}
                        rx={2}
                      />
                      {bw > 32 && bl > 14 && (
                        <text
                          x={bx + bw / 2}
                          y={by + bl / 2 + 3}
                          fill="#059669"
                          textAnchor="middle"
                          className="font-mono text-[7px] tracking-wider uppercase font-medium pointer-events-none select-none"
                          opacity={0.55}
                        >
                          {bed.name}
                        </text>
                      )}
                    </g>
                  );
                })}

                {/* 3. Parking Stall / Carport */}
                {archLandscape.parkingRect && (() => {
                  const pr = archLandscape.parkingRect;
                  const px = pr.x * SCALE;
                  const py = pr.y * SCALE;
                  const pw = pr.width * SCALE;
                  const pl = pr.length * SCALE;
                  return (
                    <g key="canonical-parking">
                      <rect
                        x={px}
                        y={py}
                        width={pw}
                        height={pl}
                        fill="#F8FAFC"
                        stroke="#94A3B8"
                        strokeWidth={1.2}
                        strokeDasharray="5 3"
                        rx={2}
                      />
                      <line
                        x1={px + 4}
                        y1={py + 4}
                        x2={px + 4}
                        y2={py + pl - 4}
                        stroke="#CBD5E1"
                        strokeWidth={1}
                      />
                      <line
                        x1={px + pw - 4}
                        y1={py + 4}
                        x2={px + pw - 4}
                        y2={py + pl - 4}
                        stroke="#CBD5E1"
                        strokeWidth={1}
                      />
                      <text
                        x={px + pw / 2}
                        y={py + pl / 2 + 3}
                        fill="#64748B"
                        textAnchor="middle"
                        className="font-mono text-[8px] tracking-wider uppercase font-semibold pointer-events-none select-none"
                      >
                        PARKING / CARPORT
                      </text>
                    </g>
                  );
                })()}

                {/* 4. Vehicular Driveway */}
                {archLandscape.drivewayRect && (() => {
                  const dw = archLandscape.drivewayRect;
                  const dx = dw.x * SCALE;
                  const dy = dw.y * SCALE;
                  const dwidth = dw.width * SCALE;
                  const dlength = dw.length * SCALE;
                  return (
                    <g key="canonical-driveway">
                      <rect
                        x={dx}
                        y={dy}
                        width={dwidth}
                        height={dlength}
                        fill="#F8FAFC"
                        stroke="#94A3B8"
                        strokeWidth={1.2}
                        strokeDasharray="6 3"
                      />
                      <text
                        x={dx + dwidth / 2}
                        y={dy + dlength / 2 + 3}
                        fill="#64748B"
                        textAnchor="middle"
                        className="font-mono text-[8px] tracking-wider uppercase font-semibold pointer-events-none select-none"
                      >
                        DRIVEWAY
                      </text>
                    </g>
                  );
                })()}

                {/* 5. Pedestrian Pathway Segments (Paved from Gate/Road to Main Entrance) */}
                {archLandscape.walkwaySegments.map((seg, sIdx) => {
                  const x1 = seg.p1.x * SCALE;
                  const y1 = seg.p1.y * SCALE;
                  const x2 = seg.p2.x * SCALE;
                  const y2 = seg.p2.y * SCALE;
                  const w = (seg.width || 3.6) * SCALE;
                  const dx = x2 - x1;
                  const dy = y2 - y1;
                  const len = Math.hypot(dx, dy);
                  if (len < 1) return null;
                  const perpX = (-dy / len) * (w / 2);
                  const perpY = (dx / len) * (w / 2);

                  const pts = `${x1 + perpX},${y1 + perpY} ${x2 + perpX},${y2 + perpY} ${x2 - perpX},${y2 - perpY} ${x1 - perpX},${y1 - perpY}`;

                  return (
                    <g key={`canonical-walkway-${sIdx}`}>
                      <polygon
                        points={pts}
                        fill="#F8FAFC"
                        stroke="#CBD5E1"
                        strokeWidth={1.0}
                      />
                      <line
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke="#94A3B8"
                        strokeWidth={1.0}
                        strokeDasharray="3 3"
                      />
                    </g>
                  );
                })}

                {/* 6. Landscape Bollard Lights along Pathway */}
                {archLandscape.bollardLights.map((bl) => {
                  const bx = bl.x * SCALE;
                  const by = bl.z * SCALE;
                  return (
                    <g key={bl.id}>
                      <circle cx={bx} cy={by} r={4.5} fill="#FEF08A" opacity={0.35} />
                      <circle cx={bx} cy={by} r={2.0} fill="#F59E0B" stroke="#B45309" strokeWidth={0.7} />
                    </g>
                  );
                })}

                {/* 7. Shrubs & Accent Flower Plantings */}
                {archLandscape.shrubs.map((shrub) => {
                  const sx = shrub.x * SCALE;
                  const sy = shrub.z * SCALE;
                  const sr = Math.max(2.5, (shrub.scale || 1.0) * 1.1 * SCALE);
                  return (
                    <g key={shrub.id}>
                      <circle cx={sx} cy={sy} r={sr} fill="#DCFCE7" stroke="#4ADE80" strokeWidth={0.8} />
                      <circle cx={sx} cy={sy} r={sr * 0.4} fill="#86EFAC" opacity={0.6} />
                    </g>
                  );
                })}
                {archLandscape.flowers.map((fl) => {
                  const fx = fl.x * SCALE;
                  const fy = fl.z * SCALE;
                  const col =
                    fl.assetKey === "flowerRed"
                      ? "#F43F5E"
                      : fl.assetKey === "flowerYellow"
                      ? "#FBBF24"
                      : "#A855F7";
                  return (
                    <circle
                      key={fl.id}
                      cx={fx}
                      cy={fy}
                      r={2.2}
                      fill={col}
                      opacity={0.8}
                    />
                  );
                })}

                {/* 8. Architectural Canopy Trees (Clean Simple CAD Drafting Symbols) */}
                {archLandscape.trees.map((tree) => {
                  const tx = tree.x * SCALE;
                  const ty = tree.z * SCALE;
                  const canopyR = (tree.scale || 1.5) * 2.2 * SCALE;
                  const innerR = canopyR * 0.65;
                  return (
                    <g key={tree.id}>
                      {/* Outer Canopy Circle */}
                      <circle
                        cx={tx}
                        cy={ty}
                        r={canopyR}
                        fill="#ECFDF5"
                        stroke="#10B981"
                        strokeWidth={1.2}
                        opacity={0.7}
                      />
                      {/* Concentric Inner Dashed Ring */}
                      <circle
                        cx={tx}
                        cy={ty}
                        r={innerR}
                        fill="none"
                        stroke="#34D399"
                        strokeWidth={0.8}
                        strokeDasharray="3 2"
                        opacity={0.8}
                      />
                      {/* Subtle 4 Cardinal Orientation Ticks */}
                      <line x1={tx - canopyR} y1={ty} x2={tx - canopyR + 4} y2={ty} stroke="#10B981" strokeWidth={1.0} />
                      <line x1={tx + canopyR - 4} y1={ty} x2={tx + canopyR} y2={ty} stroke="#10B981" strokeWidth={1.0} />
                      <line x1={tx} y1={ty - canopyR} x2={tx} y2={ty - canopyR + 4} stroke="#10B981" strokeWidth={1.0} />
                      <line x1={tx} y1={ty + canopyR - 4} x2={tx} y2={ty + canopyR} stroke="#10B981" strokeWidth={1.0} />
                      {/* Center Trunk Dot */}
                      <circle cx={tx} cy={ty} r={2.4} fill="#065F46" />
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
                  id={`canvas-room-${room.id}`}
                  data-room-id={room.id}
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
                  {/* Room Fill Floor Slab with Distinct Architectural Zoning Tint */}
                  <rect
                    x={0}
                    y={0}
                    width={rw}
                    height={rl}
                    fill={getRoomBackgroundFill(room.type, isSelected, isHovered)}
                    stroke={isSelected ? "#C48446" : mode === "edit" ? "#94A3B8" : "#CBD5E1"}
                    strokeWidth={isSelected ? 2 : 1}
                    strokeDasharray={isSelected ? "none" : mode === "edit" ? "4 2" : "none"}
                    className="transition-colors duration-150"
                  />

                  {/* Staircase Step Treads */}
                  {(room.type === "staircase" || room.name.toLowerCase().includes("stair")) && (
                    <g pointerEvents="none" opacity={0.75}>
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

            {/* ARCHITECTURAL CUT WALLS (CLEAN CAD DRAFTING LINEWORK) */}
            {/* 1. Exterior Walls (Strong line weight: 2.8px, #1E293B, square joins) */}
            {cutExteriorWalls.segments.map((seg) => {
              const baseWallId = seg.id.split("_seg_")[0];
              const isSelected = selectedWallId === seg.id || selectedWallId === baseWallId;
              return (
                <line
                  key={seg.id}
                  x1={seg.x1}
                  y1={seg.y1}
                  x2={seg.x2}
                  y2={seg.y2}
                  stroke={isSelected ? "#C48446" : "#1E293B"}
                  strokeWidth={isSelected ? 3.5 : 2.8}
                  strokeLinecap="square"
                />
              );
            })}

            {/* 2. Interior Partition Walls (Lighter line weight: 1.8px, #475569, square joins) */}
            {cutInteriorWalls.segments.map((seg) => {
              const baseWallId = seg.id.split("_seg_")[0];
              const isSelected = selectedWallId === seg.id || selectedWallId === baseWallId;
              return (
                <line
                  key={seg.id}
                  x1={seg.x1}
                  y1={seg.y1}
                  x2={seg.x2}
                  y2={seg.y2}
                  stroke={isSelected ? "#C48446" : "#475569"}
                  strokeWidth={isSelected ? 3.0 : 1.8}
                  strokeLinecap="square"
                />
              );
            })}

            {/* 3. Opening Jamb End-Caps */}
            {[...cutExteriorWalls.jambs, ...cutInteriorWalls.jambs].map((jamb, jIdx) => (
              <line
                key={`jamb_${jIdx}`}
                x1={jamb.x - jamb.nx * 2}
                y1={jamb.y - jamb.ny * 2}
                x2={jamb.x + jamb.nx * 2}
                y2={jamb.y + jamb.ny * 2}
                stroke="#475569"
                strokeWidth={1.2}
                strokeLinecap="square"
              />
            ))}

            {/* 4. Interactive Wall Selection Hit Areas & Endpoint Handles (in EDIT mode) */}
            {mode === "edit" &&
              [...canonicalWallNet.exteriorWalls, ...canonicalWallNet.interiorWalls].map((wall) => {
                const isSelected = selectedWallId === wall.id;
                const wx1 = wall.x1 * SCALE;
                const wy1 = wall.y1 * SCALE;
                const wx2 = wall.x2 * SCALE;
                const wy2 = wall.y2 * SCALE;

                return (
                  <g key={`hit_wall_${wall.id}`}>
                    {/* Transparent thick hit area for easy selection & direct dragging */}
                    <line
                      x1={wx1}
                      y1={wy1}
                      x2={wx2}
                      y2={wy2}
                      stroke="transparent"
                      strokeWidth={16}
                      className="cursor-move"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectWall(wall.id);
                      }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        handleSelectWall(wall.id);

                        setDraggingWall({
                          wallId: wall.id,
                          startMouseX: e.clientX,
                          startMouseY: e.clientY,
                          initialX1: wall.x1,
                          initialY1: wall.y1,
                          initialX2: wall.x2,
                          initialY2: wall.y2,
                          initialFloor: JSON.parse(JSON.stringify(currentFloor)),
                          affectedRoomIds: wall.adjacent_room_ids || [],
                          initialRooms: JSON.parse(JSON.stringify(currentFloor.rooms || [])),
                          initialWalls: JSON.parse(
                            JSON.stringify([
                              ...(currentFloor.exterior_walls || []),
                              ...(currentFloor.interior_walls || []),
                            ])
                          ),
                          initialDoors: JSON.parse(JSON.stringify(currentFloor.doors || [])),
                          initialWindows: JSON.parse(JSON.stringify(currentFloor.windows || [])),
                        });
                      }}
                    />

                    {/* Endpoint & Midpoint Handles when Selected: Extend / Shorten / Move */}
                    {isSelected && (
                      <g pointerEvents="all">
                        {/* Start Endpoint Handle */}
                        <circle
                          cx={wx1}
                          cy={wy1}
                          r={6}
                          fill="#C48446"
                          stroke="#FFFFFF"
                          strokeWidth={2}
                          className="cursor-crosshair hover:scale-125 transition-transform"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setResizingWallEndpoint({
                              wallId: wall.id,
                              endpoint: "start",
                              startMouseX: e.clientX,
                              startMouseY: e.clientY,
                              initialX1: wall.x1,
                              initialY1: wall.y1,
                              initialX2: wall.x2,
                              initialY2: wall.y2,
                              initialWalls: JSON.parse(
                                JSON.stringify([
                                  ...(currentFloor.exterior_walls || []),
                                  ...(currentFloor.interior_walls || []),
                                ])
                              ),
                              initialRooms: JSON.parse(JSON.stringify(currentFloor.rooms || [])),
                            });
                          }}
                        />

                        {/* End Endpoint Handle */}
                        <circle
                          cx={wx2}
                          cy={wy2}
                          r={6}
                          fill="#C48446"
                          stroke="#FFFFFF"
                          strokeWidth={2}
                          className="cursor-crosshair hover:scale-125 transition-transform"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setResizingWallEndpoint({
                              wallId: wall.id,
                              endpoint: "end",
                              startMouseX: e.clientX,
                              startMouseY: e.clientY,
                              initialX1: wall.x1,
                              initialY1: wall.y1,
                              initialX2: wall.x2,
                              initialY2: wall.y2,
                              initialWalls: JSON.parse(
                                JSON.stringify([
                                  ...(currentFloor.exterior_walls || []),
                                  ...(currentFloor.interior_walls || []),
                                ])
                              ),
                              initialRooms: JSON.parse(JSON.stringify(currentFloor.rooms || [])),
                            });
                          }}
                        />

                        {/* Midpoint Move Handle and Interactive Dimension Badge */}
                        {(() => {
                          const midX = (wx1 + wx2) / 2;
                          const midY = (wy1 + wy2) / 2;
                          const wallLen = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
                          const dx = wx2 - wx1;
                          const dy = wy2 - wy1;
                          const lenPx = Math.hypot(dx, dy) || 1;
                          const normX = -dy / lenPx;
                          const normY = dx / lenPx;
                          const badgeX = midX + normX * 22;
                          const badgeY = midY + normY * 22;

                          return (
                            <g>
                              {/* Midpoint translation grip handle */}
                              <circle
                                cx={midX}
                                cy={midY}
                                r={7}
                                fill="#C48446"
                                stroke="#FFFFFF"
                                strokeWidth={2}
                                className="cursor-move hover:scale-125 transition-transform"
                                onMouseDown={(e) => {
                                  e.stopPropagation();
                                  setDraggingWall({
                                    wallId: wall.id,
                                    startMouseX: e.clientX,
                                    startMouseY: e.clientY,
                                    initialX1: wall.x1,
                                    initialY1: wall.y1,
                                    initialX2: wall.x2,
                                    initialY2: wall.y2,
                                    initialFloor: JSON.parse(JSON.stringify(currentFloor)),
                                    affectedRoomIds: wall.adjacent_room_ids || [],
                                    initialRooms: JSON.parse(JSON.stringify(currentFloor.rooms || [])),
                                    initialWalls: JSON.parse(
                                      JSON.stringify([
                                        ...(currentFloor.exterior_walls || []),
                                        ...(currentFloor.interior_walls || []),
                                      ])
                                    ),
                                    initialDoors: JSON.parse(JSON.stringify(currentFloor.doors || [])),
                                    initialWindows: JSON.parse(JSON.stringify(currentFloor.windows || [])),
                                  });
                                }}
                              />
                              <circle cx={midX} cy={midY} r={2.5} fill="#FFFFFF" pointerEvents="none" />

                              {/* Interactive Dimension Badge on Selected Wall */}
                              <g
                                transform={`translate(${badgeX}, ${badgeY})`}
                                className="cursor-pointer"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingDimension({
                                    type: "wall",
                                    id: wall.id,
                                    label: "Wall Length",
                                    currentValue: wallLen,
                                  });
                                }}
                              >
                                <rect
                                  x={-30}
                                  y={-11}
                                  width={60}
                                  height={22}
                                  rx={5}
                                  fill="#16171B"
                                  stroke="#C48446"
                                  strokeWidth={1.2}
                                  className="hover:fill-[#202227] transition-colors"
                                />
                                <text
                                  x={0}
                                  y={4}
                                  textAnchor="middle"
                                  fill="#F5F3EF"
                                  fontSize={11}
                                  fontFamily="monospace"
                                  fontWeight="bold"
                                  pointerEvents="none"
                                >
                                  {feetToArchitectural(wallLen)}
                                </text>
                              </g>
                            </g>
                          );
                        })()}
                      </g>
                    )}
                  </g>
                );
              })}

            {/* WINDOWS: Clean wall-embedded representation */}
            {windowGeometries.map((wGeom) => {
              const isSelected = selectedWindowId === wGeom.id;
              return (
                <g
                  key={wGeom.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedWindowId(wGeom.id);
                  }}
                  onMouseDown={(e) => {
                    if (mode !== "edit" || activeTool !== "select") return;
                    e.stopPropagation();
                    const opening = (currentFloor.windows || []).find((item) => item.id === wGeom.id);
                    if (!opening) return;
                    setSelectedWindowId(opening.id);
                    setSelectedDoorId(null);
                    setDraggingOpening({
                      kind: "window",
                      id: opening.id,
                      wallId:
                        opening.host_wall_id ||
                        opening.wall_id ||
                        findWallAtPoint({ x: (opening.x1 + opening.x2) / 2, y: (opening.y1 + opening.y2) / 2 })?.id ||
                        "",
                      initialOpening: { ...opening },
                    });
                  }}
                  className={`${mode === "edit" ? "cursor-pointer" : "pointer-events-none"}`}
                >
                  {/* Clean wall opening mask */}
                  <line
                    x1={wGeom.x1}
                    y1={wGeom.y1}
                    x2={wGeom.x2}
                    y2={wGeom.y2}
                    stroke="#FFFFFF"
                    strokeWidth={14}
                    strokeLinecap="square"
                  />
                  {/* Outer & Inner Sill Lines */}
                  <line
                    x1={wGeom.x1}
                    y1={wGeom.y1}
                    x2={wGeom.x2}
                    y2={wGeom.y2}
                    stroke={isSelected ? "#C48446" : "#64748B"}
                    strokeWidth={1.5}
                    strokeLinecap="square"
                  />
                  {/* Double Glazing Centerlines */}
                  <line
                    x1={wGeom.glaze1.x1}
                    y1={wGeom.glaze1.y1}
                    x2={wGeom.glaze1.x2}
                    y2={wGeom.glaze1.y2}
                    stroke={isSelected ? "#C48446" : "#38BDF8"}
                    strokeWidth={1.2}
                  />
                  <line
                    x1={wGeom.glaze2.x1}
                    y1={wGeom.glaze2.y1}
                    x2={wGeom.glaze2.x2}
                    y2={wGeom.glaze2.y2}
                    stroke={isSelected ? "#C48446" : "#38BDF8"}
                    strokeWidth={1.2}
                  />
                  {/* Subtle selection badge only in edit mode when selected */}
                  {mode === "edit" && isSelected && (
                    <g transform={`translate(${wGeom.badgeX}, ${wGeom.badgeY})`}>
                      <rect
                        x={-20}
                        y={-7}
                        width={40}
                        height={14}
                        rx={3}
                        fill="#0F172A"
                        stroke="#C48446"
                        strokeWidth={1}
                      />
                      <text
                        x={0}
                        y={3.5}
                        textAnchor="middle"
                        fill="#C48446"
                        className="font-mono text-[8px] font-bold select-none"
                      >
                        {wGeom.label}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* DOORS: Clean opening, door leaf, and swing arc */}
            {doorGeometries.map((dGeom) => {
              const isSelected = selectedDoorId === dGeom.id;
              return (
                <g
                  key={dGeom.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedDoorId(dGeom.id);
                  }}
                  onMouseDown={(e) => {
                    if (mode !== "edit" || activeTool !== "select") return;
                    e.stopPropagation();
                    const opening = (currentFloor.doors || []).find((item) => item.id === dGeom.id);
                    if (!opening) return;
                    setSelectedDoorId(opening.id);
                    setSelectedWindowId(null);
                    setDraggingOpening({
                      kind: "door",
                      id: opening.id,
                      wallId:
                        opening.host_wall_id ||
                        opening.wall_id ||
                        findWallAtPoint({ x: (opening.x1 + opening.x2) / 2, y: (opening.y1 + opening.y2) / 2 })?.id ||
                        "",
                      initialOpening: { ...opening },
                    });
                  }}
                  className={`${mode === "edit" ? "cursor-pointer" : "pointer-events-none"}`}
                >
                  {/* Clean wall opening mask */}
                  <line
                    x1={dGeom.hingeX}
                    y1={dGeom.hingeY}
                    x2={dGeom.latchX}
                    y2={dGeom.latchY}
                    stroke="#FFFFFF"
                    strokeWidth={14}
                    strokeLinecap="square"
                  />
                  {/* Hinge Pivot Dot */}
                  <circle
                    cx={dGeom.hingeX}
                    cy={dGeom.hingeY}
                    r={2.4}
                    fill={isSelected ? "#C48446" : "#1E293B"}
                  />
                  {/* 90-Degree Swing Arc */}
                  <path
                    d={dGeom.arcPath}
                    fill="none"
                    stroke={isSelected ? "#C48446" : "#94A3B8"}
                    strokeWidth={1.2}
                    strokeDasharray="3 2"
                  />
                  {/* Solid Door Leaf */}
                  <line
                    x1={dGeom.hingeX}
                    y1={dGeom.hingeY}
                    x2={dGeom.leafEndX}
                    y2={dGeom.leafEndY}
                    stroke={isSelected ? "#C48446" : "#475569"}
                    strokeWidth={2.4}
                    strokeLinecap="round"
                  />
                  {/* Subtle selection badge only in edit mode when selected */}
                  {mode === "edit" && isSelected && (
                    <g transform={`translate(${dGeom.badgeX}, ${dGeom.badgeY})`}>
                      <rect
                        x={-20}
                        y={-7}
                        width={40}
                        height={14}
                        rx={3}
                        fill="#0F172A"
                        stroke="#C48446"
                        strokeWidth={1}
                      />
                      <text
                        x={0}
                        y={3.5}
                        textAnchor="middle"
                        fill="#C48446"
                        className="font-mono text-[8px] font-bold select-none"
                      >
                        {dGeom.label}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* SMART ALIGNMENT GUIDES (RENDERED DURING ROOM/WALL DRAGGING) */}
            {alignmentGuides && alignmentGuides.length > 0 && (
              <g id="alignment-guides-layer" pointerEvents="none">
                {alignmentGuides.map((g, idx) => (
                  <g key={`guide-${idx}`}>
                    {g.type === "v" ? (
                      <>
                        <line
                          x1={g.pos * SCALE}
                          y1={-padding}
                          x2={g.pos * SCALE}
                          y2={svgHeight + padding}
                          stroke="#E11D48"
                          strokeWidth={1.2}
                          strokeDasharray="4 3"
                        />
                        <rect
                          x={g.pos * SCALE - 14}
                          y={-16}
                          width={28}
                          height={12}
                          rx={2}
                          fill="#E11D48"
                        />
                        <text
                          x={g.pos * SCALE}
                          y={-7}
                          textAnchor="middle"
                          fill="#FFFFFF"
                          className="font-mono text-[7px] font-bold select-none"
                        >
                          SNAP
                        </text>
                      </>
                    ) : (
                      <>
                        <line
                          x1={-padding}
                          y1={g.pos * SCALE}
                          x2={svgWidth + padding}
                          y2={g.pos * SCALE}
                          stroke="#E11D48"
                          strokeWidth={1.2}
                          strokeDasharray="4 3"
                        />
                        <rect
                          x={-26}
                          y={g.pos * SCALE - 6}
                          width={28}
                          height={12}
                          rx={2}
                          fill="#E11D48"
                        />
                        <text
                          x={-12}
                          y={g.pos * SCALE + 3}
                          textAnchor="middle"
                          fill="#FFFFFF"
                          className="font-mono text-[7px] font-bold select-none"
                        >
                          SNAP
                        </text>
                      </>
                    )}
                  </g>
                ))}
              </g>
            )}

            {/* MASTER ARCHITECTURAL ROOM LABELS (HIGHLY LEGIBLE, CENTERED, CLEAN MASKING OF FURNITURE UNDERNEATH) */}
            <g id="master-room-labels-layer" pointerEvents="none">
              {(currentFloor.rooms || []).map((room) => {
                if (!room.rect) return null;
                const rx = room.rect.x * SCALE;
                const ry = room.rect.y * SCALE;
                const rw = room.rect.width * SCALE;
                const rl = room.rect.length * SCALE;
                const isSelected = selectedRoomId === room.id;

                let roomName = (room.name || "ROOM").toUpperCase().trim();
                // Clean abbreviations for compact secondary spaces
                if (rw < 100 || rl < 70) {
                  if (roomName.includes("BALCONY") || roomName.includes("TERRACE")) roomName = "BALCONY";
                  else if (roomName.includes("PRIMARY SUITE") || roomName.includes("MASTER BEDROOM")) roomName = "MASTER BED";
                  else if (roomName.includes("ENTRY FOYER") || roomName.includes("FOYER")) roomName = "ENTRY";
                  else if (roomName.includes("CIRCULATION") || roomName.includes("HALLWAY")) roomName = "HALLWAY";
                  else if (roomName.includes("POWDER")) roomName = "POWDER";
                  else if (roomName.includes("GUEST BEDROOM")) roomName = "GUEST BED";
                  else if (roomName.includes("LIVING ROOM")) roomName = "LIVING";
                }
                if (roomName.includes(" / ")) {
                  roomName = roomName.split(" / ")[0];
                }

                const dimStr = `${feetToArchitectural(room.rect.width)} × ${feetToArchitectural(room.rect.length)}`;
                const areaSqFt = room.area_sqft || Math.round(room.rect.width * room.rect.length);
                const areaStr = `${areaSqFt} SQ FT`;

                const isCompact = rw < 90 || rl < 65;
                const titleFont = isCompact ? 10 : 12;
                const dimFont = isCompact ? 8.5 : 10;
                const areaFont = isCompact ? 7.5 : 8.5;

                const estTitleW = roomName.length * titleFont * 0.65;
                const estDimW = dimStr.length * dimFont * 0.62;
                const maxContentW = Math.max(estTitleW, estDimW);

                const patchW = Math.min(rw - 12, Math.max(70, maxContentW + 20));
                const patchH = isCompact ? 32 : 46;
                const labelScale = zoom < 0.85 ? Math.min(1.35, 0.85 / zoom) : 1.0;

                return (
                  <g key={`lbl-${room.id}`} transform={`translate(${rx + rw / 2}, ${ry + rl / 2}) scale(${labelScale})`}>
                    {/* Clean background badge completely masks furniture lines underneath */}
                    <rect
                      x={-patchW / 2}
                      y={-patchH / 2}
                      width={patchW}
                      height={patchH}
                      rx={4}
                      fill="#FFFFFF"
                      fillOpacity={0.96}
                      stroke={isSelected ? "#C48446" : "#CBD5E1"}
                      strokeWidth={isSelected ? 1.5 : 0.8}
                    />
                    {/* Room Name */}
                    <text
                      x={0}
                      y={isCompact ? -2 : -6}
                      textAnchor="middle"
                      fill={isSelected ? "#C48446" : "#0F172A"}
                      style={{ fontSize: `${titleFont}px`, letterSpacing: "0.04em" }}
                      className="font-sans font-bold select-none"
                    >
                      {roomName}
                    </text>
                    {/* Room Dimensions */}
                    <text
                      x={0}
                      y={isCompact ? 9 : 8}
                      textAnchor="middle"
                      fill={isSelected ? "#92400E" : "#334155"}
                      style={{ fontSize: `${dimFont}px` }}
                      className="font-mono font-semibold select-none"
                    >
                      {dimStr}
                    </text>
                    {/* Area (shown when not compact) */}
                    {!isCompact && (
                      <text
                        x={0}
                        y={19}
                        textAnchor="middle"
                        fill="#64748B"
                        style={{ fontSize: `${areaFont}px` }}
                        className="font-mono font-medium select-none"
                      >
                        {areaStr}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>

            {/* COMPASS: Small and unobtrusive */}
            <g transform={`translate(${svgWidth - 30}, -20)`} pointerEvents="none">
              <circle cx={0} cy={0} r={14} fill="#FFFFFF" stroke="#64748B" strokeWidth={1} />
              <line x1={-12} y1={0} x2={12} y2={0} stroke="#CBD5E1" strokeWidth={0.8} />
              <line x1={0} y1={-12} x2={0} y2={12} stroke="#CBD5E1" strokeWidth={0.8} />
              <polygon points="0,-11 3.5,0 0,-1.5 -3.5,0" fill="#DC2626" />
              <polygon points="0,0 3.5,0 0,11 -3.5,0" fill="#334155" />
              <text x={0} y={-16} textAnchor="middle" fill="#DC2626" className="font-mono font-bold text-[8px]">
                N
              </text>
            </g>

            {/* ARCHITECTURAL GRAPHIC SCALE BAR */}
            <g transform={`translate(10, ${svgHeight + 25})`} pointerEvents="none">
              <line x1={0} y1={0} x2={SCALE * 20} y2={0} stroke="#0F172A" strokeWidth={2} />
              <line x1={0} y1={-4} x2={0} y2={4} stroke="#0F172A" strokeWidth={1.5} />
              <line x1={SCALE * 5} y1={-2.5} x2={SCALE * 5} y2={2.5} stroke="#0F172A" strokeWidth={1} />
              <line x1={SCALE * 10} y1={-4} x2={SCALE * 10} y2={4} stroke="#0F172A" strokeWidth={1.5} />
              <line x1={SCALE * 20} y1={-4} x2={SCALE * 20} y2={4} stroke="#0F172A" strokeWidth={1.5} />
              <text x={0} y={12} fill="#0F172A" className="font-mono text-[7.5px] font-bold">0&apos;</text>
              <text x={SCALE * 10} y={12} textAnchor="middle" fill="#475569" className="font-mono text-[7.5px] font-semibold">10&apos;</text>
              <text x={SCALE * 20} y={12} textAnchor="middle" fill="#0F172A" className="font-mono text-[7.5px] font-bold">20&apos;</text>
            </g>

            {/* MASTER BLUEPRINT TITLE BLOCK: Compact & Professional */}
            <g transform={`translate(${Math.max(0, svgWidth - 230)}, ${svgHeight + 15})`} pointerEvents="none">
              <rect
                x={0}
                y={0}
                width={230}
                height={46}
                fill="#FFFFFF"
                stroke="#0F172A"
                strokeWidth={1.2}
                rx={2}
              />
              <line x1={0} y1={18} x2={230} y2={18} stroke="#E2E8F0" strokeWidth={0.8} />
              <text x={8} y={13} fill="#0F172A" className="font-mono text-[9px] font-bold tracking-wider">
                {currentFloor.floor_name ? currentFloor.floor_name.toUpperCase() : "FLOOR PLAN"}
              </text>
              <text x={222} y={13} textAnchor="end" fill="#C48446" className="font-mono text-[8px] font-bold">
                SCALE: 1/4&quot; = 1&apos;-0&quot;
              </text>
              <text x={8} y={29} fill="#64748B" className="font-mono text-[7.5px]">
                PLOT: <tspan fill="#0F172A" fontWeight="bold">{layout.plot_width}&apos; × {layout.plot_length}&apos;</tspan> ({(layout.plot_width * layout.plot_length).toLocaleString()} SQ FT)
              </text>
              <text x={8} y={40} fill="#64748B" className="font-mono text-[7.5px]">
                BUILT-UP: <tspan fill="#0F172A" fontWeight="bold">{layout.total_area_sqft || Math.round((currentFloor.rooms || []).reduce((acc, r) => acc + (r.area_sqft || (r.rect ? r.rect.width * r.rect.length : 0)), 0))} SQ FT</tspan> · FACING: <tspan fill="#0F172A" fontWeight="bold">{(layout.facing || layout.orientation || layout.site?.road_side || "SOUTH").toUpperCase()}</tspan>
              </text>
            </g>
            {layout.mep_plan && (
              <g id="canonical-mep-plan" pointerEvents="none">
                {layout.mep_plan.routes
                  .filter((route) => route.floor_number === currentFloor.floor_number && mepVisibility[route.category])
                  .map((route) => {
                    const color = route.category === "electrical"
                      ? "#D97706"
                      : route.category === "plumbing"
                        ? "#0284C7"
                        : "#9333EA";
                    return (
                      <polyline
                        key={route.id}
                        data-mep-id={route.id}
                        points={route.points.map((point) => `${point.x * SCALE},${point.y * SCALE}`).join(" ")}
                        fill="none"
                        stroke={color}
                        strokeWidth={2}
                        strokeDasharray="5 3"
                        opacity={0.85}
                      >
                        <title>{`${route.category}: ${route.kind} (preliminary)`}</title>
                      </polyline>
                    );
                  })}
                {layout.mep_plan.points
                  .filter((point) => point.floor_number === currentFloor.floor_number && mepVisibility[point.category])
                  .map((point) => {
                    const color = point.category === "electrical"
                      ? "#D97706"
                      : point.category === "plumbing"
                        ? "#0284C7"
                        : "#9333EA";
                    return (
                      <g key={point.id} data-mep-id={point.id}>
                        <circle
                          cx={point.position.x * SCALE}
                          cy={point.position.y * SCALE}
                          r={4.5}
                          fill="#FFFFFF"
                          stroke={color}
                          strokeWidth={2}
                        />
                        <title>{`${point.category}: ${point.kind} (preliminary)`}</title>
                      </g>
                    );
                  })}
              </g>
            )}

            {/* REAL-TIME WALL DRAWING PREVIEW */}
            {drawingWall && (
              <g pointerEvents="none">
                <line
                  x1={drawingWall.start.x * SCALE}
                  y1={drawingWall.start.y * SCALE}
                  x2={drawingWall.end.x * SCALE}
                  y2={drawingWall.end.y * SCALE}
                  stroke="#C48446"
                  strokeWidth={3}
                  strokeDasharray="6 3"
                />
                <circle
                  cx={drawingWall.start.x * SCALE}
                  cy={drawingWall.start.y * SCALE}
                  r={5}
                  fill="#C48446"
                  stroke="#FFFFFF"
                  strokeWidth={2}
                />
                <circle
                  cx={drawingWall.end.x * SCALE}
                  cy={drawingWall.end.y * SCALE}
                  r={5}
                  fill="#C48446"
                  stroke="#FFFFFF"
                  strokeWidth={2}
                />
                {(() => {
                  const mx = ((drawingWall.start.x + drawingWall.end.x) / 2) * SCALE;
                  const my = ((drawingWall.start.y + drawingWall.end.y) / 2) * SCALE - 14;
                  const len = distanceWorld(drawingWall.start, drawingWall.end);
                  const ang = Math.round(angleWorld(drawingWall.start, drawingWall.end));
                  return (
                    <g transform={`translate(${mx}, ${my})`}>
                      <rect
                        x={-35}
                        y={-10}
                        width={70}
                        height={20}
                        rx={4}
                        fill="#16171B"
                        stroke="#C48446"
                        strokeWidth={1}
                      />
                      <text
                        x={0}
                        y={3.5}
                        textAnchor="middle"
                        fill="#F5F3EF"
                        fontSize={9.5}
                        fontFamily="monospace"
                        fontWeight="bold"
                      >
                        {feetToArchitectural(len)} ∠{ang}°
                      </text>
                    </g>
                  );
                })()}
              </g>
            )}

            {/* GHOST OPENING HOVER PREVIEW */}
            {ghostOpening && (
              <g pointerEvents="none">
                <line
                  x1={ghostOpening.geom.x1 * SCALE}
                  y1={ghostOpening.geom.y1 * SCALE}
                  x2={ghostOpening.geom.x2 * SCALE}
                  y2={ghostOpening.geom.y2 * SCALE}
                  stroke={ghostOpening.kind === "door" ? "#C48446" : "#38BDF8"}
                  strokeWidth={4}
                  strokeDasharray="4 2"
                />
                <circle
                  cx={ghostOpening.geom.x1 * SCALE}
                  cy={ghostOpening.geom.y1 * SCALE}
                  r={3.5}
                  fill={ghostOpening.kind === "door" ? "#C48446" : "#38BDF8"}
                />
                <circle
                  cx={ghostOpening.geom.x2 * SCALE}
                  cy={ghostOpening.geom.y2 * SCALE}
                  r={3.5}
                  fill={ghostOpening.kind === "door" ? "#C48446" : "#38BDF8"}
                />
              </g>
            )}

            {/* MEASURE TOOL OVERLAY */}
            {measureState?.p1 && (
              <g pointerEvents="none">
                <circle
                  cx={measureState.p1.x * SCALE}
                  cy={measureState.p1.y * SCALE}
                  r={4.5}
                  fill="#38BDF8"
                  stroke="#FFFFFF"
                  strokeWidth={1.5}
                />
                {measureState.p2 && (
                  <>
                    <line
                      x1={measureState.p1.x * SCALE}
                      y1={measureState.p1.y * SCALE}
                      x2={measureState.p2.x * SCALE}
                      y2={measureState.p2.y * SCALE}
                      stroke="#38BDF8"
                      strokeWidth={2}
                      strokeDasharray="5 3"
                    />
                    <circle
                      cx={measureState.p2.x * SCALE}
                      cy={measureState.p2.y * SCALE}
                      r={4.5}
                      fill="#38BDF8"
                      stroke="#FFFFFF"
                      strokeWidth={1.5}
                    />
                    {(() => {
                      const mx = ((measureState.p1.x + measureState.p2.x) / 2) * SCALE;
                      const my = ((measureState.p1.y + measureState.p2.y) / 2) * SCALE - 14;
                      const dist = distanceWorld(measureState.p1, measureState.p2);
                      return (
                        <g transform={`translate(${mx}, ${my})`}>
                          <rect
                            x={-34}
                            y={-10}
                            width={68}
                            height={20}
                            rx={4}
                            fill="#0F172A"
                            stroke="#38BDF8"
                            strokeWidth={1}
                          />
                          <text
                            x={0}
                            y={3.5}
                            textAnchor="middle"
                            fill="#38BDF8"
                            fontSize={10}
                            fontFamily="monospace"
                            fontWeight="bold"
                          >
                            {feetToArchitectural(dist)}
                          </text>
                        </g>
                      );
                    })()}
                  </>
                )}
              </g>
            )}

            {/* CAD SNAP INDICATOR */}
            {currentSnap?.snapped && currentSnap.type && (
              <g
                pointerEvents="none"
                transform={`translate(${currentSnap.point.x * SCALE}, ${currentSnap.point.y * SCALE})`}
              >
                <rect
                  x={-5}
                  y={-5}
                  width={10}
                  height={10}
                  fill="none"
                  stroke="#38BDF8"
                  strokeWidth={1.8}
                  transform={currentSnap.type === "midpoint" ? "rotate(45)" : undefined}
                />
                <circle cx={0} cy={0} r={1.5} fill="#38BDF8" />
                <rect
                  x={8}
                  y={-14}
                  width={(currentSnap.type || "").length * 6 + 10}
                  height={15}
                  rx={3}
                  fill="#0F172A"
                  fillOpacity={0.9}
                  stroke="#38BDF8"
                  strokeWidth={0.8}
                />
                <text
                  x={(currentSnap.type || "").length * 3 + 13}
                  y={-3.5}
                  textAnchor="middle"
                  fill="#38BDF8"
                  fontSize={8}
                  fontFamily="monospace"
                  fontWeight="bold"
                >
                  {(currentSnap.type || "").toUpperCase()}
                </text>
              </g>
            )}
          </svg>
  );

  // -------------------------------------------------------------
  // 1. FIGMA-STYLE PROFESSIONAL EDITOR (when mode === 'edit')
  // -------------------------------------------------------------
  if (mode === "edit") {
    return (
      <div className="edit-cad-shell relative w-full h-full min-h-0 flex flex-col select-none overflow-hidden bg-[#07080A] text-[#F3F4F6] font-sans">
        {/* COMPACT SHAPR3D-INSPIRED CAD HEADER */}
        <header data-cad-ui className="edit-cad-header relative h-11 sm:h-12 border-b border-[#1E2028] bg-[#0E0F13] flex items-center justify-between px-3 sm:px-4 z-40 shrink-0 select-none">
          {/* Left: Back to Plan, Title, small EDIT badge, floor switcher */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              id="cad-btn-back"
              type="button"
              onClick={handleExit}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-mono text-[#E2E8F0] hover:text-white border border-white/5 transition-all shrink-0 pointer-events-auto cursor-pointer"
              title="Return to Plan Overview"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-[#C48446]" />
              <span className="font-semibold text-[11px] tracking-wider hidden xs:inline">PLAN</span>
            </button>

            <div className="h-4 w-px bg-white/10 shrink-0" />

            <div className="flex items-center gap-2 min-w-0">
              <span className="max-md:hidden text-xs font-semibold text-white/90 truncate max-w-[120px] sm:max-w-[180px] md:max-w-[260px]">
                {layout.title || "Architectural Floor Plan"}
              </span>
              <span className="px-1.5 py-0.5 rounded bg-[#C48446]/20 text-[#E69F58] font-mono text-[9px] uppercase font-bold tracking-widest border border-[#C48446]/30 shrink-0">
                CAD EDIT
              </span>
            </div>

            {/* Floor Level Switcher if multi-floor */}
            {layout.floors && layout.floors.length > 1 && onSelectFloor && (
              <div className="hidden lg:flex items-center p-0.5 rounded-lg bg-white/5 border border-white/10 text-[10px] font-mono text-[#94A3B8]">
                {layout.floors.map((fl, idx) => (
                  <button
                    key={fl.floor_number}
                    type="button"
                    onClick={() => onSelectFloor(idx)}
                    className={`px-2 py-0.5 rounded transition-all ${
                      activeFloorIndex === idx
                        ? "bg-[#C48446] text-[#0A0B0E] font-bold shadow-xs"
                        : "hover:text-white"
                    }`}
                  >
                    {fl.floor_name ? fl.floor_name.replace(" Floor", "").toUpperCase() : `L${fl.floor_number}`}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Center: Minimal tool state / active operation indicator */}
          <div className="hidden lg:flex items-center justify-center pointer-events-none">
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.04] border border-white/10 text-[11px] font-mono text-[#94A3B8]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#C48446] animate-pulse" />
              <span className="text-white/80 font-medium">
                {selectedEntityPayload.type === "wall" && selectedEntityPayload.wall
                  ? `WALL // ${feetToArchitectural(Math.hypot(selectedEntityPayload.wall.x2 - selectedEntityPayload.wall.x1, selectedEntityPayload.wall.y2 - selectedEntityPayload.wall.y1))}`
                  : selectedEntityPayload.type === "door" && selectedEntityPayload.door
                  ? `DOOR // ${feetToArchitectural(selectedEntityPayload.door.width || 3.0)} (${selectedEntityPayload.door.swing_direction || "inward"})`
                  : selectedEntityPayload.type === "window" && selectedEntityPayload.window
                  ? `WINDOW // ${feetToArchitectural(selectedEntityPayload.window.width || 4.0)}`
                  : selectedEntityPayload.type === "room" && selectedEntityPayload.room
                  ? `ROOM // ${selectedEntityPayload.room.name.toUpperCase()}`
                  : activeTool === "wall"
                  ? (drawingWall ? "DRAWING WALL // Click end point" : "WALL TOOL // Click start point to draw")
                  : activeTool === "door"
                  ? "DOOR TOOL // Click a wall to place door"
                  : activeTool === "window"
                  ? "WINDOW TOOL // Click a wall to place window"
                  : activeTool === "measure"
                  ? (measureState?.p1 ? "MEASURE // Click second point" : "MEASURE // Click first point")
                  : "SELECT TOOL // Direct manipulation active"}
              </span>
            </div>
          </div>

          {/* Right: Undo, Redo, AI Architect, Layers, Properties, Done */}
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            <button
              id="cad-btn-undo"
              type="button"
              onClick={undo}
              disabled={!canUndo}
              className="edit-header-icon p-1.5 rounded-lg hover:bg-white/5 text-[#94A3B8] hover:text-white disabled:opacity-30 transition-colors"
              title="Undo (Ctrl+Z)"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button
              id="cad-btn-redo"
              type="button"
              onClick={redo}
              disabled={!canRedo}
              className="edit-header-icon p-1.5 rounded-lg hover:bg-white/5 text-[#94A3B8] hover:text-white disabled:opacity-30 transition-colors"
              title="Redo (Ctrl+Y)"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>

            <div className="h-4 w-px bg-white/10 mx-0.5 hidden xs:block" />

            {/* AI Architect Assistant */}
            <button
              id="cad-btn-ai-architect"
              type="button"
              onClick={() => {
                setIsAiOpen((prev) => !prev);
                setIsLeftPanelOpen(false);
                setIsRightPanelOpen(false);
              }}
              className={`edit-header-action flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all ${
                isAiOpen
                  ? "bg-[#C48446] text-[#0A0B0E] shadow"
                  : "bg-[#C48446]/15 hover:bg-[#C48446]/25 text-[#E69F58] border border-[#C48446]/30"
              }`}
              title="AI Architectural CAD Assistant"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">AI ARCHITECT</span>
              <span className="sm:hidden">AI</span>
            </button>

            <button
              type="button"
              onClick={() => setIsMobileToolsOpen((open) => !open)}
              aria-label="More editor controls"
              aria-expanded={isMobileToolsOpen}
              className="edit-header-icon flex lg:hidden rounded-lg text-[#94A3B8] hover:bg-white/5 hover:text-white"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>

            {/* Layers / Structure Drawer Toggle */}
            <button
              id="cad-btn-layers"
              type="button"
              onClick={() => setIsLeftPanelOpen((prev) => !prev)}
              className={`edit-header-icon hidden lg:flex rounded-lg transition-all ${
                isLeftPanelOpen
                  ? "bg-[#C48446] text-[#0A0B0E] shadow"
                  : "text-[#94A3B8] hover:text-white hover:bg-white/5"
              }`}
              title="Toggle Structure & Layers (L)"
            >
              <Layers className="w-3.5 h-3.5" />
            </button>

            {/* Properties Drawer Toggle */}
            <button
              id="cad-btn-properties"
              type="button"
              onClick={() => setIsRightPanelOpen((prev) => !prev)}
              className={`edit-header-icon hidden lg:flex rounded-lg transition-all ${
                isRightPanelOpen
                  ? "bg-[#C48446] text-[#0A0B0E] shadow"
                  : "text-[#94A3B8] hover:text-white hover:bg-white/5"
              }`}
              title="Toggle Properties Panel (P)"
            >
              <Sliders className="w-3.5 h-3.5" />
            </button>

            <div className="h-4 w-px bg-white/10 mx-0.5" />

            {/* Done Button */}
            <button
              id="cad-btn-done"
              type="button"
              onClick={handleDone}
              disabled={isSaving}
              className="edit-header-action flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-lg bg-[#C48446] hover:bg-[#D49456] text-[#0A0B0E] font-bold text-xs font-mono tracking-wider shadow transition-all"
              title="Save & Return to Plan"
            >
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
              <span>DONE</span>
            </button>
          </div>

          {isMobileToolsOpen && (
            <div data-cad-ui className="edit-mobile-menu absolute right-2 top-full z-[60] mt-1 w-52 rounded-xl border border-white/10 bg-[#12141A]/98 p-2 shadow-2xl lg:hidden">
              {layout.floors && layout.floors.length > 1 && (
                <div className="mb-1 border-b border-white/10 pb-2">
                  <div className="px-2 py-1 text-[9px] font-mono uppercase text-white/50">Floor</div>
                  {layout.floors.map((floor, index) => (
                    <button
                      key={floor.floor_number}
                      type="button"
                      onClick={() => {
                        onSelectFloor?.(index);
                        setIsMobileToolsOpen(false);
                      }}
                      className="min-h-11 w-full rounded-lg px-2 text-left text-xs text-white/80 hover:bg-white/5"
                    >
                      {floor.floor_name || `Floor ${floor.floor_number}`}
                    </button>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  setIsLeftPanelOpen((open) => !open);
                  setIsRightPanelOpen(false);
                  setIsMobileToolsOpen(false);
                }}
                className="min-h-11 w-full rounded-lg px-2 text-left text-xs text-white/80 hover:bg-white/5"
              >
                {isLeftPanelOpen ? "Close layers" : "Open layers"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsRightPanelOpen((open) => !open);
                  setIsLeftPanelOpen(false);
                  setIsMobileToolsOpen(false);
                }}
                className="min-h-11 w-full rounded-lg px-2 text-left text-xs text-white/80 hover:bg-white/5"
              >
                {isRightPanelOpen ? "Close properties" : "Open properties"}
              </button>
            </div>
          )}
        </header>

        {/* WORKBENCH BODY: Left Panel + Dominant Canvas + Right Inspector Panel */}
        <div className="flex-1 flex overflow-hidden relative">
          {/* Mobile backdrop for Left Panel */}
          {isLeftPanelOpen && (
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-xs z-25 md:hidden"
              onClick={() => setIsLeftPanelOpen(false)}
            />
          )}
          {/* LEFT PANEL: LAYERS / STRUCTURE (FLOATING DRAWER) */}
          {isLeftPanelOpen && (
            <aside data-cad-ui className={`edit-layer-panel absolute top-3 left-3 bottom-20 md:bottom-6 w-72 bg-[#12141A]/95 backdrop-blur-xl border border-white/10 rounded-2xl flex flex-col z-35 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-left-2 duration-150 ${isAiOpen ? "max-md:hidden" : ""}`}>
              {/* Floor switcher */}
              <div className="p-3 border-b border-[#23252B]">
                <div className="text-[10px] font-mono uppercase font-bold tracking-wider text-[#94A3B8] mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span>FLOORS</span>
                    <span className="text-white/40">({layout.floors?.length || 1})</span>
                  </div>
                  <button
                    id="btn-close-layers"
                    onClick={() => setIsLeftPanelOpen(false)}
                    className="p-1 rounded hover:bg-white/10 text-[#94A3B8] hover:text-white md:hidden"
                    title="Close Layers Panel"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex gap-1 p-0.5 rounded-lg bg-[#202227] border border-white/5">
                  {(layout.floors || [{ floor_number: 1, floor_name: "Ground Floor" }]).map((fl, idx) => (
                    <button
                      key={fl.floor_number}
                      id={`btn-floor-${idx}`}
                      onClick={() => onSelectFloor?.(idx)}
                      className={`flex-1 py-1 rounded text-[11px] font-mono font-medium transition-all ${
                        activeFloorIndex === idx
                          ? "bg-[#C48446] text-[#0A0B0E] shadow"
                          : "text-[#94A3B8] hover:text-white"
                      }`}
                    >
                      {fl.floor_name ? fl.floor_name.replace(" Floor", "") : `L${fl.floor_number}`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Structure / Layers List */}
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                <div className="px-2 py-1 text-[10px] font-mono uppercase font-bold tracking-wider text-[#94A3B8] flex items-center justify-between">
                  <span>ROOMS ({(currentFloor.rooms || []).length})</span>
                  <span className="text-[9px] text-white/40">SELECT</span>
                </div>

                {(currentFloor.rooms || []).map((room) => {
                  const isSelected = selectedRoomId === room.id;
                  return (
                    <div
                      key={room.id}
                      id={`layer-room-${room.id}`}
                      data-room-id={room.id}
                      onClick={() => handleSelectRoom(isSelected ? null : room.id)}
                      className={`group flex items-center justify-between px-2.5 py-2 rounded-lg cursor-pointer transition-all ${
                        isSelected
                          ? "bg-[#C48446]/20 border-l-2 border-[#C48446] text-white"
                          : "hover:bg-white/5 text-[#CBD5E1]"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={isSelected ? "text-[#C48446]" : "text-[#94A3B8]"}>
                          {getRoomIcon(room.type)}
                        </span>
                        <div className="truncate">
                          <div className="text-xs font-medium truncate">{room.name}</div>
                          <div className="text-[10px] font-mono text-[#94A3B8]">
                            {feetToArchitectural(room.rect.width)} × {feetToArchitectural(room.rect.length)}
                          </div>
                        </div>
                      </div>
                      <span className="shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-[#94A3B8]">
                        {room.area_sqft || Math.round(room.rect.width * room.rect.length)} sf
                      </span>
                    </div>
                  );
                })}

                {/* Structural Entities count */}
                <div className="pt-3 mt-3 border-t border-[#23252B] px-2 space-y-1.5 text-[11px] font-mono text-[#94A3B8]">
                  <div className="flex justify-between">
                    <span>Walls:</span>
                    <span className="text-white/70">{(currentFloor.walls || layout.walls || []).length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Doors:</span>
                    <span className="text-white/70">{(currentFloor.doors || layout.doors || []).length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Windows:</span>
                    <span className="text-white/70">{(currentFloor.windows || layout.windows || []).length}</span>
                  </div>
                </div>
              </div>
            </aside>
          )}

          {/* CENTER HERO CANVAS */}
          <main
            ref={setContainerRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
            onDoubleClick={handleResetView}
            className={`edit-cad-viewport w-full h-full min-w-0 relative overflow-hidden bg-[#07080A] flex items-center justify-center select-none ${
              isPanning ? "cursor-grabbing" : isPanMode || isSpacePressed ? "cursor-grab" : "cursor-default"
            }`}
          >
            {/* SVG Canvas with Pan & Zoom */}
            <div
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: "center center",
                transition: isWheelZooming || isPanning || draggingRoom || draggingFurniture || resizingRoom || draggingWall || resizingWallEndpoint || draggingOpening ? "none" : "transform 0.1s cubic-bezier(0.16, 1, 0.3, 1)",
              }}
              className="cad-drawing-surface flex items-center justify-center pointer-events-auto touch-none"
            >
              {renderSvgSheet()}
            </div>

            {/* FLOATING CAD CONTEXTUAL TOOLBAR */}
            <div data-cad-ui className="edit-cad-toolbar absolute bottom-6 md:left-1/2 md:-translate-x-1/2 z-30 pointer-events-auto max-w-[calc(100vw-32px)]">
              <CadContextualToolbar
                activeTool={activeTool as any}
                onSelectTool={(tool) => setActiveTool(tool)}
                selectedEntity={selectedEntityPayload}
                canUndo={canUndo}
                canRedo={canRedo}
                onUndo={undo}
                onRedo={redo}
                showDimensions={showDimensions}
                onToggleDimensions={() => setShowDimensions((p) => !p)}
                onDeselect={() => {
                  setSelectedWallId(null);
                  setSelectedDoorId(null);
                  setSelectedWindowId(null);
                  handleSelectRoom(null);
                  handleSelectFurniture(null);
                  setActiveTool("select");
                }}
                onDeleteSelected={handleDeleteSelected}
                onToggleWallThickness={() => {
                  if (selectedWall) handleSetWallThickness(selectedWall.thickness === 0.75 ? 0.375 : 0.75);
                }}
                onSetWallThickness={handleSetWallThickness}
                onSplitWall={handleSplitSelectedWall}
                onEditDimension={(type, id, val) => {
                  setEditingDimension({
                    type,
                    id,
                    label: type === "wall" ? "Wall Length" : type === "room_width" ? "Room Width" : "Room Length",
                    currentValue: parseFloat(val) || 0,
                  });
                }}
                onFlipDoorSwing={handleFlipDoorSwing}
                onResizeDoorWidth={(delta) => resizeOpeningWidth("door", delta)}
                onResizeWindowWidth={(delta) => resizeOpeningWidth("window", delta)}
                onResetMeasure={() => setMeasureState(null)}
                measureDistance={measureState?.p1 && measureState?.p2 ? distanceWorld(measureState.p1, measureState.p2) : null}
                onDone={handleExit}
                isSaving={isSaving}
              />
            </div>

            {/* INLINE DIMENSION EDIT MODAL */}
            {editingDimension && (
              <div data-cad-ui role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150 pointer-events-auto">
                <div className="w-full max-w-xs bg-[#16171B] border border-[#C48446]/40 rounded-2xl p-4 shadow-2xl space-y-3">
                  <div className="flex items-center justify-between pb-1 border-b border-white/10">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#E69F58]">
                      Edit {editingDimension.label}
                    </span>
                    <button
                      onClick={() => setEditingDimension(null)}
                      className="p-1 rounded text-[#94A3B8] hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono uppercase text-[#94A3B8]">
                      Dimension (e.g. 14&apos;-6&quot; or 14.5)
                    </label>
                    <input
                      autoFocus
                      id="inline-dimension-input"
                      type="text"
                      defaultValue={feetToArchitectural(editingDimension.currentValue)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleApplyInlineDimension((e.target as HTMLInputElement).value);
                        } else if (e.key === "Escape") {
                          setEditingDimension(null);
                        }
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white font-mono text-sm focus:outline-none focus:border-[#C48446]"
                      placeholder="e.g. 16'-0&quot;"
                    />
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      onClick={() => setEditingDimension(null)}
                      className="px-3 py-1.5 rounded-xl text-xs font-mono text-[#94A3B8] hover:text-white hover:bg-white/5"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        const input = document.getElementById("inline-dimension-input") as HTMLInputElement | null;
                        if (input) handleApplyInlineDimension(input.value);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-[#C48446] hover:bg-[#D49456] text-[#0A0B0E] font-mono text-xs font-bold shadow"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* DELETE WALL CONFIRMATION MODAL */}
            {pendingWallDelete && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150 pointer-events-auto">
                <div className="w-full max-w-sm bg-[#16171B] border border-red-500/30 rounded-2xl p-5 shadow-2xl space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-xl bg-red-500/10 text-red-400 shrink-0">
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-white font-sans">Delete Wall Dependencies</h3>
                      <p className="text-xs text-[#94A3B8] mt-1 font-mono leading-relaxed">
                        {pendingWallDelete.summaryMessage}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                    <button
                      onClick={() => setPendingWallDelete(null)}
                      className="px-3 py-1.5 rounded-xl text-xs font-mono text-[#94A3B8] hover:text-white hover:bg-white/5"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        const wallId = pendingWallDelete.wall.id;
                        setPendingWallDelete(null);
                        commitWallDeletion(wallId);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-mono text-xs font-bold shadow"
                    >
                      Delete Wall + Openings
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* INVALID OPERATION WARNING BANNER */}
            {invalidMoveNotice && (
              <div data-cad-ui className="cad-inline-alert absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 rounded-full bg-red-950/90 text-red-200 border border-red-500/40 shadow-2xl text-xs font-mono animate-in fade-in slide-in-from-top-2 duration-200">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <span className="min-w-0 break-words">{invalidMoveNotice}</span>
              </div>
            )}

            {/* EDIT NOTICE / CONSTRAINT WARNING BANNER */}
            {editNotice && (
              <div data-cad-ui className="cad-inline-alert absolute top-4 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-full bg-[#12141A]/95 border border-[#C48446]/60 shadow-2xl text-xs font-mono text-[#F5F3EF] flex items-center gap-2.5 animate-in fade-in slide-in-from-top-1 duration-200">
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

            {/* AI ARCHITECT POPOVER CARD */}
            {isAiOpen && (
              <>
              <div className="edit-ai-backdrop fixed inset-0 z-35 bg-black/50 md:hidden" onClick={() => setIsAiOpen(false)} />
              <div data-cad-ui className="edit-ai-panel absolute bottom-16 right-4 z-40 w-[min(20rem,calc(100%-2rem))] max-h-[calc(100%-5rem)] overflow-y-auto p-4 rounded-2xl bg-[#16171B]/95 backdrop-blur-md border border-[#C48446]/30 shadow-2xl text-[#F5F3EF] animate-in fade-in slide-in-from-left-2 duration-200">
                <div className="flex items-center justify-between pb-2 border-b border-white/10">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#C48446]" />
                    <span className="font-mono text-xs font-semibold uppercase tracking-wider text-[#E69F58]">
                      AI Architectural Assistant
                    </span>
                  </div>
                  <button
                    onClick={() => setIsAiOpen(false)}
                    className="p-1 rounded-full hover:bg-white/10 text-[#9E9C98] hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Quick Prompts */}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {[
                    "Enlarge living room by 2ft",
                    "Optimize bedroom circulation",
                    "Add a walk-in wardrobe",
                    "Align dining with kitchen",
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
                  <div className="mt-2.5 p-2 rounded-lg bg-[#C48446]/10 border border-[#C48446]/20 text-[11px] font-mono text-[#C48446] leading-relaxed">
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

                {/* Gemini QA Review Button */}
                <div className="mt-3 pt-2.5 border-t border-white/10">
                  <button
                    onClick={handleRunGeminiQa}
                    disabled={isQaReviewing || isAiProcessing}
                    className="w-full py-1.5 px-3 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 hover:text-sky-300 border border-sky-500/30 text-[11px] font-mono font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                  >
                    {isQaReviewing ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Reviewing Floor Plan...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                        <span>RUN VISUAL QA REVIEW</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
              </>
            )}

            {/* BOTTOM-RIGHT FLOATING ZOOM/PAN CONTROLS */}
            {!isAiOpen && <div data-cad-ui className="edit-zoom-controls absolute bottom-16 md:bottom-4 right-3 sm:right-4 z-30 flex items-center gap-1 p-1 rounded-xl bg-[#16171B]/95 backdrop-blur-md border border-white/10 shadow-2xl text-xs font-mono text-[#94A3B8]">
              <button
                onClick={() => setZoom((z) => Math.max(0.4, z * 0.85))}
                className="p-1.5 rounded-lg hover:bg-white/5 hover:text-white"
                title="Zoom Out (-)"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="px-2 text-[11px] font-bold text-white select-none">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => setZoom((z) => Math.min(5.0, z * 1.15))}
                className="p-1.5 rounded-xl hover:bg-white/10 hover:text-white transition-colors"
                title="Zoom In (+)"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <div className="h-4 w-px bg-white/10 mx-0.5" />
              <button
                onClick={handleResetView}
                className="px-2 py-1 rounded-xl hover:bg-white/10 hover:text-white text-[10px] font-bold tracking-wider"
                title="Fit to Screen"
              >
                FIT
              </button>
              <button
                onClick={() => setIsPanMode((prev) => !prev)}
                className={`p-1.5 rounded-xl transition-colors ${isPanMode ? "bg-[#C48446] text-[#0A0B0E]" : "hover:bg-white/10 hover:text-white"}`}
                title="Pan Tool (Hand)"
              >
                <Hand className="w-3.5 h-3.5" />
              </button>
            </div>}
          </main>

          {/* Mobile backdrop for Right Panel */}
          {isRightPanelOpen && (
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-xs z-25 md:hidden"
              onClick={() => setIsRightPanelOpen(false)}
            />
          )}
          {/* RIGHT PANEL: PROPERTIES / INSPECTOR (FLOATING DRAWER) */}
          {isRightPanelOpen && (
            <aside data-cad-ui className={`edit-properties-panel absolute top-3 right-3 bottom-20 md:bottom-6 w-80 max-w-[calc(100vw-24px)] bg-[#12141A]/95 backdrop-blur-xl border border-white/10 rounded-2xl flex flex-col z-35 shadow-2xl overflow-y-auto animate-in fade-in slide-in-from-right-2 duration-150 ${isAiOpen ? "max-md:hidden" : ""}`}>
              {/* Inspector Header */}
              <div className="p-3 border-b border-[#23252B] flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase font-bold tracking-wider text-[#94A3B8]">
                  PROPERTIES
                </span>
                <div className="flex items-center gap-1">
                  {selectedEntity && (
                    <button
                      id="btn-deselect-entity"
                      onClick={() => {
                        handleSelectRoom(null);
                        handleSelectFurniture(null);
                        setSelectedWallId(null);
                        setSelectedDoorId(null);
                        setSelectedWindowId(null);
                      }}
                      className="p-1 rounded hover:bg-white/10 text-[#94A3B8] hover:text-white"
                      title="Deselect"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    id="btn-close-properties"
                    onClick={() => setIsRightPanelOpen(false)}
                    className="p-1 rounded hover:bg-white/10 text-[#94A3B8] hover:text-white md:hidden"
                    title="Close Properties Panel"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="p-4 space-y-4">
                {selectedRoom ? (
                  <>
                    {/* Room Name & Type */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-mono uppercase text-[#94A3B8] block">Room Name</label>
                      <input
                        id="inspector-room-name"
                        type="text"
                        value={selectedRoom.name}
                        onChange={(e) => {
                          const newName = e.target.value;
                          setLayout((prev) => {
                            const nextFloors = prev.floors ? [...prev.floors] : [];
                            if (nextFloors[activeFloorIndex]) {
                              nextFloors[activeFloorIndex] = {
                                ...nextFloors[activeFloorIndex],
                                rooms: nextFloors[activeFloorIndex].rooms.map((r) =>
                                  r.id === selectedRoom.id ? { ...r, name: newName } : r
                                ),
                              };
                              return { ...prev, floors: nextFloors };
                            }
                            return prev;
                          });
                        }}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-[#202227] border border-white/10 text-xs font-sans text-white focus:outline-none focus:border-[#C48446]"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono uppercase text-[#94A3B8] block">Room Type</label>
                      <select
                        id="inspector-room-type"
                        value={selectedRoom.type}
                        onChange={(e) => {
                          const newType = e.target.value as any;
                          setLayout((prev) => {
                            const nextFloors = prev.floors ? [...prev.floors] : [];
                            if (nextFloors[activeFloorIndex]) {
                              nextFloors[activeFloorIndex] = {
                                ...nextFloors[activeFloorIndex],
                                rooms: nextFloors[activeFloorIndex].rooms.map((r) =>
                                  r.id === selectedRoom.id ? { ...r, type: newType } : r
                                ),
                              };
                              return { ...prev, floors: nextFloors };
                            }
                            return prev;
                          });
                        }}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-[#202227] border border-white/10 text-xs font-mono text-[#CBD5E1] focus:outline-none focus:border-[#C48446]"
                      >
                        <option value="living_room">Living Room</option>
                        <option value="master_bedroom">Master Bedroom / Primary Suite</option>
                        <option value="bedroom">Bedroom</option>
                        <option value="guest_bedroom">Guest Bedroom</option>
                        <option value="dining">Dining Room</option>
                        <option value="kitchen">Kitchen</option>
                        <option value="bathroom">Bathroom</option>
                        <option value="powder_room">Powder Room</option>
                        <option value="entry_foyer">Entry Foyer</option>
                        <option value="hallway">Circulation / Hallway</option>
                        <option value="office">Home Office / Study</option>
                        <option value="pooja">Pooja Room</option>
                        <option value="balcony">Balcony / Terrace</option>
                        <option value="utility">Utility / Laundry</option>
                      </select>
                    </div>

                    {/* Dimensions */}
                    <div className="space-y-2 pt-2 border-t border-[#23252B]">
                      <label className="text-[10px] font-mono uppercase text-[#94A3B8] block">Dimensions</label>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-[9px] font-mono text-[#94A3B8] block mb-1">Width</span>
                          <input
                            id="inspector-exact-width"
                            type="text"
                            value={exactWidthInput}
                            onChange={(e) => setExactWidthInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleApplyExactDimensions();
                            }}
                            className="w-full px-2 py-1.5 rounded-lg bg-[#202227] border border-white/10 text-xs font-mono text-white text-center focus:outline-none focus:border-[#C48446]"
                            placeholder="12'-0&quot;"
                          />
                        </div>
                        <div>
                          <span className="text-[9px] font-mono text-[#94A3B8] block mb-1">Depth / Length</span>
                          <input
                            id="inspector-exact-depth"
                            type="text"
                            value={exactLengthInput}
                            onChange={(e) => setExactLengthInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleApplyExactDimensions();
                            }}
                            className="w-full px-2 py-1.5 rounded-lg bg-[#202227] border border-white/10 text-xs font-mono text-white text-center focus:outline-none focus:border-[#C48446]"
                            placeholder="14'-0&quot;"
                          />
                        </div>
                      </div>

                      {/* Live Area Pill */}
                      <div className="p-2 rounded-lg bg-white/5 border border-white/5 flex items-center justify-between text-xs font-mono">
                        <span className="text-[#94A3B8]">Floor Area:</span>
                        <span id="inspector-live-area" className="text-[#C48446] font-bold">
                          {selectedRoom.area_sqft || Math.round(selectedRoom.rect.width * selectedRoom.rect.length)} SQ FT
                        </span>
                      </div>

                      {/* Apply Dimensions Button */}
                      <button
                        id="inspector-apply-dimensions"
                        type="button"
                        onClick={handleApplyExactDimensions}
                        disabled={isApplyingExact}
                        className="w-full py-2 rounded-lg bg-[#C48446] hover:bg-[#D49456] text-[#0A0B0E] font-bold text-xs font-mono flex items-center justify-center gap-1.5 transition-all shadow"
                      >
                        {isApplyingExact ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
                        <span>APPLY DIMENSIONS</span>
                      </button>
                    </div>

                    {/* Quick Adjustments */}
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-mono uppercase text-[#94A3B8] block">Step Adjustments</span>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          id="inspector-step-w-plus"
                          onClick={() => handleStepResizeRoom("width", 1)}
                          className="py-1.5 rounded bg-white/5 hover:bg-white/10 text-[11px] font-mono text-[#CBD5E1] border border-white/5"
                        >
                          +1&apos; Width
                        </button>
                        <button
                          id="inspector-step-w-minus"
                          onClick={() => handleStepResizeRoom("width", -1)}
                          className="py-1.5 rounded bg-white/5 hover:bg-white/10 text-[11px] font-mono text-[#CBD5E1] border border-white/5"
                        >
                          -1&apos; Width
                        </button>
                        <button
                          id="inspector-step-l-plus"
                          onClick={() => handleStepResizeRoom("length", 1)}
                          className="py-1.5 rounded bg-white/5 hover:bg-white/10 text-[11px] font-mono text-[#CBD5E1] border border-white/5"
                        >
                          +1&apos; Depth
                        </button>
                        <button
                          id="inspector-step-l-minus"
                          onClick={() => handleStepResizeRoom("length", -1)}
                          className="py-1.5 rounded bg-white/5 hover:bg-white/10 text-[11px] font-mono text-[#CBD5E1] border border-white/5"
                        >
                          -1&apos; Depth
                        </button>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="pt-2 border-t border-[#23252B] space-y-2">
                      <button
                        id="inspector-ask-ai"
                        type="button"
                        onClick={() => {
                          setAiPrompt(`Optimize layout and furniture of ${selectedRoom.name}`);
                          setIsAiOpen(true);
                        }}
                        className="w-full py-2 rounded-lg bg-[#C48446]/10 hover:bg-[#C48446]/20 border border-[#C48446]/30 text-[#E69F58] text-xs font-mono flex items-center justify-center gap-1.5"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>✦ Ask AI to Optimize</span>
                      </button>
                      <button
                        id="inspector-delete-room"
                        type="button"
                        onClick={handleDeleteSelected}
                        className="w-full py-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 text-xs font-mono flex items-center justify-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete Room</span>
                      </button>
                    </div>
                  </>
                ) : selectedWall ? (
                /* Wall Properties */
                <div className="space-y-3">
                  <div>
                    <div className="text-xs font-bold text-white uppercase">
                      WALL ({selectedWall.is_exterior ? "EXTERIOR" : "INTERIOR PARTITION"})
                    </div>
                    <div className="text-[10px] font-mono text-[#94A3B8] mt-0.5">
                      Thickness: {Math.round(selectedWall.thickness * 12)}&quot;
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-white/5 border border-white/5 space-y-2 text-xs font-mono">
                    <div className="flex justify-between">
                      <span className="text-[#94A3B8]">Length:</span>
                      <span className="text-white font-bold">
                        {feetToArchitectural(Math.hypot(selectedWall.x2 - selectedWall.x1, selectedWall.y2 - selectedWall.y1))}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#94A3B8]">Orientation:</span>
                      <span className="text-white font-bold">
                        {Math.abs(selectedWall.y1 - selectedWall.y2) < 0.2 ? "Horizontal" : "Vertical"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#94A3B8]">Thickness:</span>
                      <span className="text-white font-bold">{Math.round(selectedWall.thickness * 12)}&quot;</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleToggleWallThickness}
                    className="w-full py-2 rounded-lg bg-[#C48446] hover:bg-[#D49456] text-[#0A0B0E] font-bold text-xs font-mono shadow transition-all"
                  >
                    TOGGLE THICKNESS (4.5&quot; / 9&quot;)
                  </button>

                  <label className="block space-y-1 text-[10px] font-mono text-[#94A3B8]">
                    WALL THICKNESS (INCHES)
                    <input
                      type="number"
                      min="1.5"
                      max="18"
                      step="0.5"
                      value={(selectedWall.thickness * 12).toFixed(1)}
                      onChange={(event) => handleSetWallThickness(Number(event.target.value) / 12)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-[#202227] border border-white/10 text-xs text-white focus:outline-none focus:border-[#C48446]"
                    />
                  </label>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={handleSplitSelectedWall}
                      className="py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-mono text-white"
                    >
                      SPLIT WALL
                    </button>
                    <button
                      type="button"
                      onClick={handleJoinSelectedWall}
                      className="py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-mono text-white"
                    >
                      JOIN WALL
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleDeleteSelected}
                    className="w-full py-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 text-xs font-mono flex items-center justify-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Wall</span>
                  </button>

                  <div className="text-[10px] text-[#94A3B8] leading-relaxed">
                    Drag the wall to move it. Drag either endpoint to extend or shorten it.
                  </div>
                </div>
              ) : selectedDoor ? (
                /* Door Properties */
                <div className="space-y-3">
                  <div>
                    <div className="text-xs font-bold text-white uppercase">
                      DOOR ({selectedDoor.door_type || selectedDoor.type || "INTERIOR"})
                    </div>
                    <div className="text-[10px] font-mono text-[#94A3B8] mt-0.5">
                      ID: {selectedDoor.id}
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-white/5 border border-white/5 space-y-2 text-xs font-mono">
                    <div className="flex justify-between">
                      <span className="text-[#94A3B8]">Width:</span>
                      <span className="text-white font-bold">{feetToArchitectural(selectedDoor.width || 3.0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#94A3B8]">Swing:</span>
                      <span className="text-white font-bold capitalize">{selectedDoor.swing_direction || "Inward"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#94A3B8]">Type:</span>
                      <span className="text-white font-bold capitalize">{selectedDoor.door_type || selectedDoor.type || "Single Leaf"}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleResizeDoorWidth(0.5)}
                      className="py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-mono text-white"
                    >
                      +6&quot; Width
                    </button>
                    <button
                      type="button"
                      onClick={() => handleResizeDoorWidth(-0.5)}
                      className="py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-mono text-white"
                    >
                      -6&quot; Width
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleFlipDoorSwing}
                    className="w-full py-2 rounded-lg bg-[#C48446]/15 hover:bg-[#C48446]/25 border border-[#C48446]/30 text-[#E69F58] text-xs font-mono font-semibold flex items-center justify-center gap-1.5 transition-all"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    <span>FLIP SWING DIRECTION</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDeleteSelected}
                    className="w-full py-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 text-xs font-mono flex items-center justify-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Door</span>
                  </button>
                </div>
              ) : selectedWindow ? (
                /* Window Properties */
                <div className="space-y-3">
                  <div>
                    <div className="text-xs font-bold text-white uppercase">
                      WINDOW ({selectedWindow.window_type || selectedWindow.type || "CASEMENT"})
                    </div>
                    <div className="text-[10px] font-mono text-[#94A3B8] mt-0.5">
                      ID: {selectedWindow.id}
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-white/5 border border-white/5 space-y-2 text-xs font-mono">
                    <div className="flex justify-between">
                      <span className="text-[#94A3B8]">Width:</span>
                      <span className="text-white font-bold">{feetToArchitectural(selectedWindow.width || 4.0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#94A3B8]">Height:</span>
                      <span className="text-white font-bold">{feetToArchitectural(selectedWindow.height || 4.0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#94A3B8]">Type:</span>
                      <span className="text-white font-bold capitalize">{selectedWindow.window_type || selectedWindow.type || "Casement"}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleResizeWindowWidth(1)}
                      className="py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-mono text-white"
                    >
                      +1&apos; Width
                    </button>
                    <button
                      type="button"
                      onClick={() => handleResizeWindowWidth(-1)}
                      className="py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-mono text-white"
                    >
                      -1&apos; Width
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleResizeWindowHeight(0.5)}
                      className="py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-mono text-white"
                    >
                      +6&quot; Height
                    </button>
                    <button
                      type="button"
                      onClick={() => handleResizeWindowHeight(-0.5)}
                      className="py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-mono text-white"
                    >
                      -6&quot; Height
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleDeleteSelected}
                    className="w-full py-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 text-xs font-mono flex items-center justify-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Window</span>
                  </button>
                </div>
              ) : selectedFurniture ? (
                /* Furniture Properties */
                <div className="space-y-3">
                  <div>
                    <div className="text-xs font-bold text-white uppercase">
                      {selectedFurniture.type.replace(/_/g, " ")}
                    </div>
                    <div className="text-[10px] font-mono text-[#94A3B8] mt-0.5">
                      ID: {selectedFurniture.id}
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-white/5 border border-white/5 space-y-2 text-xs font-mono">
                    <div className="flex justify-between">
                      <span className="text-[#94A3B8]">Size:</span>
                      <span className="text-white font-bold">
                        {selectedFurniture.width}&apos; × {selectedFurniture.depth || selectedFurniture.length}&apos;
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#94A3B8]">Position:</span>
                      <span className="text-white font-bold">
                        {selectedFurniture.x.toFixed(1)}&apos;, {selectedFurniture.y.toFixed(1)}&apos;
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#94A3B8]">Rotation:</span>
                      <span className="text-white font-bold">{selectedFurniture.rotation || 0}°</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleRotateFurniture}
                    className="w-full py-2 rounded-lg bg-[#C48446]/15 hover:bg-[#C48446]/25 border border-[#C48446]/30 text-[#E69F58] text-xs font-mono font-semibold flex items-center justify-center gap-1.5 transition-all"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    <span>ROTATE 90°</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDeleteSelected}
                    className="w-full py-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 text-xs font-mono flex items-center justify-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Item</span>
                  </button>
                </div>
              ) : (
                /* Default Plan Overview */
                <div className="space-y-3 text-xs font-mono">
                  <div className="p-3 rounded-xl bg-white/5 border border-white/5 space-y-2">
                    <div className="text-[10px] uppercase font-bold text-[#C48446]">PLAN OVERVIEW</div>
                    <div className="flex justify-between text-[#94A3B8]">
                      <span>Plot Size:</span>
                      <span className="text-white font-medium">{layout.plot_width}&apos; × {layout.plot_length}&apos;</span>
                    </div>
                    <div className="flex justify-between text-[#94A3B8]">
                      <span>Built-Up Area:</span>
                      <span className="text-white font-medium">{layout.total_area_sqft || 949} SQ FT</span>
                    </div>
                    <div className="flex justify-between text-[#94A3B8]">
                      <span>Road Frontage:</span>
                      <span className="text-white font-medium">{layout.site?.road_side?.toUpperCase() || "SOUTH"}</span>
                    </div>
                    <div className="flex justify-between text-[#94A3B8]">
                      <span>Rooms on Floor:</span>
                      <span className="text-white font-medium">{(currentFloor.rooms || []).length}</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-[#64748B] leading-relaxed">
                    Select any room, wall, door, or furniture on the canvas or from the Layers panel to inspect and customize properties.
                  </p>
                </div>
              )}
            </div>
          </aside>
        )}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // 2. PRESENTATION VIEW MODE (when mode === 'view')
  // -------------------------------------------------------------
  return (
    <div className="plan-presentation-shell relative w-full h-full min-h-0 flex flex-col select-none overflow-hidden bg-[#030303]">
      {/* Presentation Top Bar */}
      <div className="plan-presentation-toolbar absolute top-16 sm:top-5 left-3 sm:left-6 right-3 sm:right-6 z-30 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            onClick={() => router.push(`/project/${layout.id}/plan`)}
            className="hidden items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#080F1C]/80 hover:bg-[#0D1526]/90 text-[#F5F5F5] border border-blue-500/20 backdrop-blur-md text-xs font-mono tracking-wider shadow-lg transition-all sm:flex"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-[#C48446]" />
            <span>PLAN</span>
          </button>

          {/* Floor Level Switcher */}
          {layout.floors && layout.floors.length > 1 && onSelectFloor && (
            <div className="flex items-center p-0.5 rounded-full bg-[#080F1C]/80 border border-blue-500/20 backdrop-blur-md shadow-lg text-[10px] font-mono text-[#9E9C98]">
              {layout.floors.map((fl, idx) => (
                <button
                  key={fl.floor_number}
                  onClick={() => onSelectFloor(idx)}
                  className={`px-2.5 py-1 rounded-full transition-all ${
                    activeFloorIndex === idx
                      ? "bg-[#C48446] text-[#030303] font-medium shadow-sm"
                      : "hover:text-[#F5F5F5]"
                  }`}
                >
                  {fl.floor_name ? fl.floor_name.replace(" Floor", "").toUpperCase() : idx === 0 ? "GROUND" : idx === 1 ? "FIRST" : `L${fl.floor_number}`}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Export PNG */}
        <div className="pointer-events-auto">
          <button
            onClick={handleExportPNG}
            disabled={isExporting}
            className="p-2 rounded-full bg-[#080F1C]/80 hover:bg-[#0D1526]/90 text-[#9E9C98] hover:text-[#F5F5F5] border border-blue-500/20 backdrop-blur-md shadow-lg transition-all disabled:opacity-50"
            title="Export Architectural Drawing (PNG)"
          >
            {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Main Drafting SVG Canvas */}
      <div
        ref={setContainerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onDoubleClick={handleResetView}
        className={`plan-canvas-viewport relative min-h-0 w-full flex-1 flex items-center justify-center p-2 sm:p-4 select-none ${
          isPanning ? "cursor-grabbing" : isPanMode ? "cursor-grab" : "cursor-default"
        }`}
      >
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "center center",
            transition: isPanning || isWheelZooming || draggingRoom || draggingFurniture || resizingRoom ? "none" : "transform 0.12s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
          className="cad-drawing-surface flex items-center justify-center touch-none"
        >
          {renderSvgSheet()}
        </div>
      </div>

      {/* Minimal Bottom Zoom Controls */}
      <div data-cad-ui className="plan-zoom-controls absolute bottom-4 sm:bottom-6 right-4 sm:right-6 z-30 flex items-center p-1 rounded-full bg-[#12141A]/90 backdrop-blur-md border border-white/10 shadow-2xl text-[11px] font-mono text-[#9E9C98]">
        <button
          onClick={() => setZoom((z) => Math.min(3.5, z * 1.15))}
          className="p-1.5 rounded-full hover:bg-white/5 text-[#9E9C98] hover:text-[#F5F3EF] transition-colors"
          title="Zoom In (+)"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => setZoom((z) => Math.max(0.4, z * 0.85))}
          className="p-1.5 rounded-full hover:bg-white/5 text-[#9E9C98] hover:text-[#F5F3EF] transition-colors"
          title="Zoom Out (-)"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <span className="px-2 select-none text-[10px] text-[#F5F3EF] font-bold">
          {Math.round(zoom * 100)}%
        </span>
        <div className="h-4 w-px bg-white/10 mx-1" />
        <button
          onClick={handleResetView}
          className="p-1.5 rounded-full hover:bg-white/5 text-[#9E9C98] hover:text-[#F5F3EF] transition-colors"
          title="Fit to Sheet"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => setIsPanMode(!isPanMode)}
          className={`p-1.5 rounded-full transition-colors ${
            isPanMode
              ? "bg-[#C48446] text-black"
              : "hover:bg-white/5 text-[#9E9C98] hover:text-[#F5F3EF]"
          }`}
          title={isPanMode ? "Exit Pan Mode" : "Pan Mode"}
        >
          <Hand className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );

};
