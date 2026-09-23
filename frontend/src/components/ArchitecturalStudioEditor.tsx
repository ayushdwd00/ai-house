"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  HouseLayout,
  Room,
  FurnitureItem,
  Door,
  WindowItem,
  FloorPlan,
  Rect,
} from "@/types/house";
import { useEditorHistory } from "@/utils/useEditorHistory";
import {
  generateCanonicalWallNetwork,
  synchronizeOpeningsWithWalls,
} from "@/utils/geometryEngine";
import { refineHouseLayout } from "@/utils/api";
import { validateAndSanitizeHouseLayout } from "@/utils/layoutValidator";
import { useProject } from "@/context/ProjectContext";
import { FloatingNav, NavView } from "@/components/FloatingNav";
import {
  Sparkles,
  Undo2,
  Redo2,
  Save,
  Eye,
  Box,
  RotateCw,
  Trash2,
  Plus,
  Minus,
  Compass,
  Send,
  Loader2,
  Check,
  MousePointer,
  Square,
  PenTool,
  DoorClosed,
  AppWindow,
  Armchair,
  Ruler,
  X,
} from "lucide-react";

interface ArchitecturalStudioEditorProps {
  initialLayout: HouseLayout;
}

interface ChatMessage {
  id: string;
  sender: "ai" | "user";
  text: string;
  timestamp: string;
}

type EditorTool = "select" | "room" | "wall" | "door" | "window" | "furniture";

export const ArchitecturalStudioEditor: React.FC<ArchitecturalStudioEditorProps> = ({
  initialLayout,
}) => {
  const router = useRouter();
  const { updateProject } = useProject();

  // History state for undo / redo
  const {
    layout,
    canUndo,
    canRedo,
    undo,
    redo,
    pushSnapshot,
    setPresentDirectly,
  } = useEditorHistory(initialLayout);

  const [activeFloorIndex, setActiveFloorIndex] = useState(0);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [selectedFurnitureId, setSelectedFurnitureId] = useState<string | null>(null);
  const [selectedDoorId, setSelectedDoorId] = useState<string | null>(null);
  const [selectedWindowId, setSelectedWindowId] = useState<string | null>(null);

  // Tools & Presentation state
  const [activeTool, setActiveTool] = useState<EditorTool>("select");
  const [showDimensions, setShowDimensions] = useState(true);
  const [isPresenting, setIsPresenting] = useState(false);

  // UI state
  const [isAiSidebarOpen, setIsAiSidebarOpen] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState(false);

  // AI Architect chat messages
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "msg_1",
      sender: "ai",
      text: `Architectural Studio active. Plot size: ${layout.plot_width}' × ${layout.plot_length}'. Total area: ${layout.stats?.total_area_sqft || Math.round(layout.plot_width * layout.plot_length * 0.7)} SQ FT. Select any room to inspect or drag to modify boundaries.`,
      timestamp: "Just now",
    },
  ]);

  // Pan & Zoom
  const [zoom, setZoom] = useState(1.0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Dragging Room / Furniture state
  const [draggingRoomId, setDraggingRoomId] = useState<string | null>(null);
  const [resizingRoomId, setResizingRoomId] = useState<string | null>(null);
  const [draggingFurnitureId, setDraggingFurnitureId] = useState<string | null>(null);
  const [dragStartPos, setDragStartPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [initialEntityRect, setInitialEntityRect] = useState<Rect | null>(null);
  const [initialFurnPos, setInitialFurnPos] = useState<{ x: number; y: number } | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);

  // Active Floor Data
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

  const rooms = currentFloor.rooms || [];
  const selectedRoom = rooms.find((r) => r.id === selectedRoomId);
  const selectedFurniture = rooms
    .flatMap((r) => r.furniture || [])
    .find((f) => f.id === selectedFurnitureId);
  const selectedDoor = (currentFloor.doors || []).find((d) => d.id === selectedDoorId);
  const selectedWindow = (currentFloor.windows || []).find((w) => w.id === selectedWindowId);

  const selectedEntity = selectedRoom || selectedFurniture || selectedDoor || selectedWindow;

  // Keyboard shortcuts (Ctrl+Z, Ctrl+Y, Escape)
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
        setSelectedRoomId(null);
        setSelectedFurnitureId(null);
        setSelectedDoorId(null);
        setSelectedWindowId(null);
        setIsAiSidebarOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canUndo, canRedo, undo, redo]);

  // Coordinate conversion from screen SVG mouse event to plot feet
  const getSvgCoordinates = useCallback(
    (e: React.MouseEvent<SVGSVGElement>): { x: number; y: number } => {
      if (!svgRef.current) return { x: 0, y: 0 };
      const CTM = svgRef.current.getScreenCTM();
      if (!CTM) return { x: 0, y: 0 };
      const pt = svgRef.current.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const svgPt = pt.matrixTransform(CTM.inverse());
      return { x: svgPt.x, y: svgPt.y };
    },
    []
  );

  // Save changes
  const handleSave = async () => {
    setIsSaving(true);
    try {
      updateProject(layout);
      setSaveSuccessNotice(true);
      setTimeout(() => setSaveSuccessNotice(false), 2200);
    } catch (err) {
      console.error("Save error:", err);
    } finally {
      setIsSaving(false);
    }
  };

  // AI Architect Quick Actions & Natural Language Refinement
  const handleAiAction = async (promptText: string) => {
    if (!promptText.trim() || isAiProcessing) return;

    const userMsg: ChatMessage = {
      id: `usr_${Date.now()}`,
      sender: "user",
      text: promptText,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setChatMessages((prev) => [...prev, userMsg]);
    setAiInput("");
    setIsAiProcessing(true);

    try {
      const refined = await refineHouseLayout(layout, promptText, selectedRoomId);
      const sanitized = validateAndSanitizeHouseLayout(refined) || refined;
      pushSnapshot(sanitized);

      const aiMsg: ChatMessage = {
        id: `ai_${Date.now()}`,
        sender: "ai",
        text:
          sanitized.designer_rationale ||
          `Executed: "${promptText}". Layout adjusted with verified wall geometry and circulation.`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setChatMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      console.error("AI Architect refinement failed:", err);
      const errMsg: ChatMessage = {
        id: `ai_${Date.now()}`,
        sender: "ai",
        text: "Could not execute the requested modification while satisfying physical boundaries. Please try with different dimensions.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setChatMessages((prev) => [...prev, errMsg]);
    } finally {
      setIsAiProcessing(false);
    }
  };

  // Room Drag & Resize Handlers
  const handleRoomMouseDown = (e: React.MouseEvent, room: Room) => {
    if (activeTool !== "select") return;
    e.stopPropagation();
    setSelectedRoomId(room.id);
    setSelectedFurnitureId(null);
    setSelectedDoorId(null);
    setSelectedWindowId(null);
    setDraggingRoomId(room.id);
    const coords = getSvgCoordinates(e as unknown as React.MouseEvent<SVGSVGElement>);
    setDragStartPos(coords);
    setInitialEntityRect({ ...room.rect });
  };

  const handleResizeHandleMouseDown = (e: React.MouseEvent, room: Room) => {
    e.stopPropagation();
    setSelectedRoomId(room.id);
    setResizingRoomId(room.id);
    const coords = getSvgCoordinates(e as unknown as React.MouseEvent<SVGSVGElement>);
    setDragStartPos(coords);
    setInitialEntityRect({ ...room.rect });
  };

  const handleFurnitureMouseDown = (e: React.MouseEvent, item: FurnitureItem) => {
    if (activeTool !== "select") return;
    e.stopPropagation();
    setSelectedFurnitureId(item.id);
    setSelectedDoorId(null);
    setSelectedWindowId(null);
    setDraggingFurnitureId(item.id);
    const coords = getSvgCoordinates(e as unknown as React.MouseEvent<SVGSVGElement>);
    setDragStartPos(coords);
    setInitialFurnPos({ x: item.x, y: item.y });
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (isPanning) {
      setPan((prev) => ({
        x: prev.x + (e.clientX - panStart.x),
        y: prev.y + (e.clientY - panStart.y),
      }));
      setPanStart({ x: e.clientX, y: e.clientY });
      return;
    }

    const coords = getSvgCoordinates(e);
    const dx = coords.x - dragStartPos.x;
    const dy = coords.y - dragStartPos.y;

    // 1. Dragging Room
    if (draggingRoomId && initialEntityRect) {
      const snapX = Math.round((initialEntityRect.x + dx) * 2) / 2;
      const snapY = Math.round((initialEntityRect.y + dy) * 2) / 2;

      const maxX = layout.plot_width - initialEntityRect.width;
      const maxY = layout.plot_length - initialEntityRect.length;
      const clampedX = Math.max(0, Math.min(maxX, snapX));
      const clampedY = Math.max(0, Math.min(maxY, snapY));

      const updatedRooms = rooms.map((r) => {
        if (r.id !== draggingRoomId) return r;
        const xOffset = clampedX - r.rect.x;
        const yOffset = clampedY - r.rect.y;

        const movedFurniture = (r.furniture || []).map((f) => ({
          ...f,
          x: f.x + xOffset,
          y: f.y + yOffset,
        }));

        return {
          ...r,
          rect: {
            ...r.rect,
            x: clampedX,
            y: clampedY,
          },
          furniture: movedFurniture,
        };
      });

      const updatedLayout: HouseLayout = {
        ...layout,
        floors: layout.floors.map((fl, fIdx) =>
          fIdx === activeFloorIndex ? { ...fl, rooms: updatedRooms } : fl
        ),
      };
      setPresentDirectly(updatedLayout);
    }

    // 2. Resizing Room
    if (resizingRoomId && initialEntityRect) {
      const newW = Math.max(4, Math.round((initialEntityRect.width + dx) * 2) / 2);
      const newL = Math.max(4, Math.round((initialEntityRect.length + dy) * 2) / 2);

      const updatedRooms = rooms.map((r) => {
        if (r.id !== resizingRoomId) return r;
        return {
          ...r,
          rect: {
            ...r.rect,
            width: newW,
            length: newL,
          },
          area_sqft: Math.round(newW * newL),
          dimensions_label: `${newW}' × ${newL}'`,
        };
      });

      const updatedLayout: HouseLayout = {
        ...layout,
        floors: layout.floors.map((fl, fIdx) =>
          fIdx === activeFloorIndex ? { ...fl, rooms: updatedRooms } : fl
        ),
      };
      setPresentDirectly(updatedLayout);
    }

    // 3. Dragging Furniture
    if (draggingFurnitureId && initialFurnPos) {
      const newFx = Math.round((initialFurnPos.x + dx) * 2) / 2;
      const newFy = Math.round((initialFurnPos.y + dy) * 2) / 2;

      const updatedRooms = rooms.map((r) => ({
        ...r,
        furniture: (r.furniture || []).map((f) =>
          f.id === draggingFurnitureId ? { ...f, x: newFx, y: newFy } : f
        ),
      }));

      const updatedLayout: HouseLayout = {
        ...layout,
        floors: layout.floors.map((fl, fIdx) =>
          fIdx === activeFloorIndex ? { ...fl, rooms: updatedRooms } : fl
        ),
      };
      setPresentDirectly(updatedLayout);
    }
  };

  const handleMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
    }

    if (draggingRoomId || resizingRoomId || draggingFurnitureId) {
      const floorRooms = layout.floors[activeFloorIndex]?.rooms || [];
      const { walls, exteriorWalls, interiorWalls } = generateCanonicalWallNetwork(
        floorRooms,
        layout.site
      );
      const { doors, windows } = synchronizeOpeningsWithWalls(
        currentFloor.doors || [],
        currentFloor.windows || [],
        walls
      );

      const finalLayout: HouseLayout = {
        ...layout,
        floors: layout.floors.map((fl, fIdx) =>
          fIdx === activeFloorIndex
            ? {
                ...fl,
                walls,
                exterior_walls: exteriorWalls,
                interior_walls: interiorWalls,
                doors,
                windows,
              }
            : fl
        ),
      };

      pushSnapshot(finalLayout);
      setDraggingRoomId(null);
      setResizingRoomId(null);
      setDraggingFurnitureId(null);
      setInitialEntityRect(null);
      setInitialFurnPos(null);
    }
  };

  // Modify Selected Room Dimensions via Steppers
  const handleAdjustRoomDimension = (dimension: "width" | "length", delta: number) => {
    if (!selectedRoom) return;
    const currentW = selectedRoom.rect.width;
    const currentL = selectedRoom.rect.length;
    const newW = dimension === "width" ? Math.max(4, currentW + delta) : currentW;
    const newL = dimension === "length" ? Math.max(4, currentL + delta) : currentL;

    const updatedRooms = rooms.map((r) => {
      if (r.id !== selectedRoom.id) return r;
      return {
        ...r,
        rect: {
          ...r.rect,
          width: newW,
          length: newL,
        },
        area_sqft: Math.round(newW * newL),
        dimensions_label: `${newW}' × ${newL}'`,
      };
    });

    const { walls, exteriorWalls, interiorWalls } = generateCanonicalWallNetwork(
      updatedRooms,
      layout.site
    );
    const { doors, windows } = synchronizeOpeningsWithWalls(
      currentFloor.doors || [],
      currentFloor.windows || [],
      walls
    );

    const updatedLayout: HouseLayout = {
      ...layout,
      floors: layout.floors.map((fl, fIdx) =>
        fIdx === activeFloorIndex
          ? {
              ...fl,
              rooms: updatedRooms,
              walls,
              exterior_walls: exteriorWalls,
              interior_walls: interiorWalls,
              doors,
              windows,
            }
          : fl
      ),
    };
    pushSnapshot(updatedLayout);
  };

  // Rotate selected furniture by 90 degrees
  const handleRotateFurniture = () => {
    if (!selectedFurniture || !selectedRoom) return;
    const newRot = ((selectedFurniture.rotation || 0) + 90) % 360;

    const updatedRooms = rooms.map((r) => {
      if (r.id !== selectedRoom.id) return r;
      return {
        ...r,
        furniture: (r.furniture || []).map((f) =>
          f.id === selectedFurniture.id ? { ...f, rotation: newRot } : f
        ),
      };
    });

    const updatedLayout: HouseLayout = {
      ...layout,
      floors: layout.floors.map((fl, fIdx) =>
        fIdx === activeFloorIndex ? { ...fl, rooms: updatedRooms } : fl
      ),
    };
    pushSnapshot(updatedLayout);
  };

  // Delete selected furniture item
  const handleDeleteFurniture = () => {
    if (!selectedFurniture || !selectedRoom) return;
    const updatedRooms = rooms.map((r) => {
      if (r.id !== selectedRoom.id) return r;
      return {
        ...r,
        furniture: (r.furniture || []).filter((f) => f.id !== selectedFurniture.id),
      };
    });

    const updatedLayout: HouseLayout = {
      ...layout,
      floors: layout.floors.map((fl, fIdx) =>
        fIdx === activeFloorIndex ? { ...fl, rooms: updatedRooms } : fl
      ),
    };
    setSelectedFurnitureId(null);
    pushSnapshot(updatedLayout);
  };

  // Toggle Door Swing Direction
  const handleToggleDoorSwing = () => {
    if (!selectedDoor) return;
    const newSwing: "inward" | "outward" =
      selectedDoor.swing_direction === "outward" ? "inward" : "outward";
    const updatedDoors: Door[] = (currentFloor.doors || []).map((d) =>
      d.id === selectedDoor.id ? { ...d, swing_direction: newSwing } : d
    );

    const updatedLayout: HouseLayout = {
      ...layout,
      floors: layout.floors.map((fl, fIdx) =>
        fIdx === activeFloorIndex ? { ...fl, doors: updatedDoors } : fl
      ),
    };
    pushSnapshot(updatedLayout);
  };

  // Add Room or Furniture from tool click
  const handleCanvasClickToAdd = (e: React.MouseEvent<SVGSVGElement>) => {
    if (activeTool === "select") return;
    const coords = getSvgCoordinates(e);
    const snapX = Math.max(2, Math.min(pw - 14, Math.round(coords.x)));
    const snapY = Math.max(2, Math.min(pl - 14, Math.round(coords.y)));

    if (activeTool === "room") {
      const newRoom: Room = {
        id: `room_${Date.now()}`,
        name: "New Room",
        type: "bedroom",
        zone: "private",
        rect: { x: snapX, y: snapY, width: 12, length: 12 },
        color: "#94A3B8",
        floor_material: "hardwood_oak",
        area_sqft: 144,
        dimensions_label: "12' × 12'",
        furniture: [],
      };
      const updatedRooms = [...rooms, newRoom];
      const { walls, exteriorWalls, interiorWalls } = generateCanonicalWallNetwork(
        updatedRooms,
        layout.site
      );
      const updatedLayout: HouseLayout = {
        ...layout,
        floors: layout.floors.map((fl, fIdx) =>
          fIdx === activeFloorIndex
            ? {
                ...fl,
                rooms: updatedRooms,
                walls,
                exterior_walls: exteriorWalls,
                interior_walls: interiorWalls,
              }
            : fl
        ),
      };
      pushSnapshot(updatedLayout);
      setSelectedRoomId(newRoom.id);
      setActiveTool("select");
    } else if (activeTool === "furniture" && selectedRoom) {
      const newFurn: FurnitureItem = {
        id: `furn_${Date.now()}`,
        type: "armchair",
        x: coords.x,
        y: coords.y,
        width: 3,
        length: 3,
        rotation: 0,
      };
      const updatedRooms = rooms.map((r) =>
        r.id === selectedRoom.id
          ? { ...r, furniture: [...(r.furniture || []), newFurn] }
          : r
      );
      const updatedLayout: HouseLayout = {
        ...layout,
        floors: layout.floors.map((fl, fIdx) =>
          fIdx === activeFloorIndex ? { ...fl, rooms: updatedRooms } : fl
        ),
      };
      pushSnapshot(updatedLayout);
      setSelectedFurnitureId(newFurn.id);
      setActiveTool("select");
    }
  };

  const pw = layout.plot_width || 40;
  const pl = layout.plot_length || 50;
  // Auto-fit viewBox so the plot occupies 80-85% of available space with clean margins
  const originX = -4;
  const originY = -4;
  const viewBoxWidth = pw + 8;
  const viewBoxHeight = pl + 8;

  const handleFloatingNavigate = (view: NavView) => {
    if (view === "home") router.push("/");
    else if (view === "plan") router.push(`/project/${layout.id}/plan`);
    else if (view === "model") router.push(`/project/${layout.id}/model`);
    else if (view === "structure") router.push(`/project/${layout.id}/structure`);
    else if (view === "estimate") router.push(`/project/${layout.id}/estimate`);
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden select-none font-sans bg-[#F4F1EA]">
      {/* 1. TOP FLOATING STUDIO NAVIGATION PILL (MATCHING MODEL PAGE) */}
      {!isPresenting && (
        <FloatingNav
          currentView="edit"
          onNavigate={handleFloatingNavigate}
          isProjectWorkspace={true}
          hasProject={true}
        />
      )}

      {/* 2. TOP-LEFT FLOATING EDITOR CONTROLS PILL */}
      {!isPresenting && (
        <div className="fixed top-16 sm:top-20 left-4 sm:left-6 z-40 flex flex-wrap items-center gap-2 pointer-events-auto">
          {/* Primary Tool Palette */}
          <div className="flex items-center p-1 rounded-full bg-[#12141A]/90 backdrop-blur-md border border-white/10 shadow-2xl text-[10px] sm:text-[11px] font-mono text-[#9E9C98]">
            {[
              { id: "select", label: "SELECT", icon: MousePointer },
              { id: "room", label: "ROOM", icon: Square },
              { id: "wall", label: "WALL", icon: PenTool },
              { id: "door", label: "DOOR", icon: DoorClosed },
              { id: "window", label: "WINDOW", icon: AppWindow },
              { id: "furniture", label: "FURN.", icon: Armchair },
            ].map((tool) => (
              <button
                key={tool.id}
                onClick={() => setActiveTool(tool.id as EditorTool)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all ${
                  activeTool === tool.id
                    ? "bg-[#C48446] text-[#0A0B0E] font-semibold shadow-sm"
                    : "hover:text-[#F5F3EF]"
                }`}
                title={tool.label}
              >
                <tool.icon className="w-3.5 h-3.5" />
                <span>{tool.label}</span>
              </button>
            ))}
          </div>

          {/* Dimension Toggle Pill */}
          <div className="flex items-center p-1 rounded-full bg-[#12141A]/90 backdrop-blur-md border border-white/10 shadow-2xl text-[10px] sm:text-[11px] font-mono text-[#9E9C98]">
            <button
              onClick={() => setShowDimensions((d) => !d)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all ${
                showDimensions
                  ? "bg-white/15 text-[#F5F3EF] font-medium"
                  : "hover:text-[#F5F3EF]"
              }`}
            >
              <Ruler className="w-3 h-3 text-[#C48446]" />
              <span>DIMENSIONS</span>
            </button>
          </div>
        </div>
      )}

      {/* 3. TOP-RIGHT FLOATING ACTION PILLS */}
      {!isPresenting && (
        <div className="fixed top-16 sm:top-20 right-4 sm:right-6 z-40 flex items-center gap-2 pointer-events-auto">
          {/* Multi-story floor selector */}
          {layout.floors && layout.floors.length > 1 && (
            <div className="flex items-center p-1 rounded-full bg-[#12141A]/90 backdrop-blur-md border border-white/10 shadow-2xl text-[10px] sm:text-[11px] font-mono text-[#9E9C98]">
              {layout.floors.map((fl, idx) => (
                <button
                  key={fl.floor_number}
                  onClick={() => {
                    setActiveFloorIndex(idx);
                    setSelectedRoomId(null);
                    setSelectedFurnitureId(null);
                    setSelectedDoorId(null);
                    setSelectedWindowId(null);
                  }}
                  className={`px-3 py-1 rounded-full transition-all ${
                    activeFloorIndex === idx
                      ? "bg-[#C48446] text-[#0A0B0E] font-semibold shadow-sm"
                      : "hover:text-[#F5F3EF]"
                  }`}
                >
                  {fl.floor_name || `L${fl.floor_number}`}
                </button>
              ))}
            </div>
          )}

          {/* History & Save Pill */}
          <div className="flex items-center p-1 rounded-full bg-[#12141A]/90 backdrop-blur-md border border-white/10 shadow-2xl text-[10px] sm:text-[11px] font-mono text-[#9E9C98]">
            <button
              onClick={undo}
              disabled={!canUndo}
              className="p-1.5 hover:text-[#F5F3EF] disabled:opacity-30 rounded-full transition-colors"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              className="p-1.5 hover:text-[#F5F3EF] disabled:opacity-30 rounded-full transition-colors"
              title="Redo (Ctrl+Y)"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>

            <div className="h-3 w-px bg-white/15 mx-1" />

            <button
              onClick={handleSave}
              disabled={isSaving}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full transition-all ${
                saveSuccessNotice
                  ? "bg-emerald-600 text-white font-semibold"
                  : "hover:text-[#F5F3EF]"
              }`}
            >
              {isSaving ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : saveSuccessNotice ? (
                <Check className="w-3 h-3" />
              ) : (
                <Save className="w-3 h-3" />
              )}
              <span>{saveSuccessNotice ? "SAVED" : "SAVE"}</span>
            </button>

            <button
              onClick={() => setIsPresenting(true)}
              className="flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-[#C48446] hover:bg-[#B37438] text-[#0A0B0E] font-semibold transition-colors shadow-md"
              title="Portfolio Presentation View"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>PRESENT</span>
            </button>
          </div>
        </div>
      )}

      {/* 4. EXIT PRESENTATION BUTTON (WHEN IN PRESENTATION MODE) */}
      {isPresenting && (
        <button
          onClick={() => setIsPresenting(false)}
          className="fixed top-6 right-6 z-50 flex items-center gap-2 px-4 py-2 rounded-full bg-[#12141A]/90 backdrop-blur-md border border-white/10 shadow-2xl text-xs font-mono text-[#F5F3EF] hover:text-[#C48446] transition-all"
        >
          <span>← EXIT PRESENTATION</span>
        </button>
      )}

      {/* 5. LEFT FLOATING AI ARCHITECT PANEL */}
      {!isPresenting && (
        <>
          {/* Collapsed Trigger Pill */}
          {!isAiSidebarOpen && (
            <button
              onClick={() => setIsAiSidebarOpen(true)}
              className="fixed top-32 left-4 sm:left-6 z-40 flex items-center gap-2 px-3.5 py-2 rounded-full bg-[#12141A]/90 backdrop-blur-md border border-white/10 shadow-2xl text-[11px] font-mono text-[#F5F3EF] hover:text-[#C48446] transition-all hover:scale-105"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#C48446]" />
              <span>AI ARCHITECT</span>
            </button>
          )}

          {/* Expanded Floating AI Card */}
          <AnimatePresence>
            {isAiSidebarOpen && (
              <motion.aside
                initial={{ opacity: 0, x: -20, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -20, scale: 0.95 }}
                transition={{ duration: 0.18 }}
                className="fixed top-32 left-4 sm:left-6 z-40 w-76 sm:w-84 max-h-[calc(100vh-170px)] bg-[#12141A]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-xs text-[#F5F3EF]"
              >
                {/* Header */}
                <div className="h-11 border-b border-white/10 px-3.5 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-[#C48446]" />
                    <span className="font-semibold tracking-wider text-[11px]">AI ARCHITECT</span>
                    <span className="text-[9px] font-mono text-[#9E9C98]">· Assistant</span>
                  </div>
                  <button
                    onClick={() => setIsAiSidebarOpen(false)}
                    className="p-1 rounded-md text-[#9E9C98] hover:text-[#F5F3EF] hover:bg-white/5 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-3 space-y-2.5 text-xs">
                  {chatMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`p-2.5 rounded-xl leading-relaxed ${
                        msg.sender === "user"
                          ? "bg-[#C48446]/20 border border-[#C48446]/30 text-[#F5F3EF] ml-4"
                          : "bg-white/5 border border-white/10 text-[#E8E4DC] mr-2"
                      }`}
                    >
                      <div className="text-[9px] font-mono text-[#9E9C98] mb-0.5">
                        {msg.sender === "user" ? "YOU" : "AI ARCHITECT"} · {msg.timestamp}
                      </div>
                      <p className="text-[11px] leading-relaxed">{msg.text}</p>
                    </div>
                  ))}

                  {isAiProcessing && (
                    <div className="flex items-center gap-2 p-2.5 rounded-xl bg-white/5 border border-white/10 text-[#9E9C98]">
                      <Loader2 className="w-3 h-3 animate-spin text-[#C48446]" />
                      <span className="text-[10px] font-mono">Synthesizing architectural modifications...</span>
                    </div>
                  )}
                </div>

                {/* Quick Actions */}
                <div className="p-2.5 border-t border-white/10 bg-black/20 shrink-0">
                  <div className="text-[9px] font-mono uppercase tracking-wider text-[#9E9C98] mb-1.5">
                    Quick Actions
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {[
                      "Expand room",
                      "Move door",
                      "Add window",
                      "Rearrange furniture",
                      "Improve circulation",
                      "Optimize room",
                    ].map((action) => (
                      <button
                        key={action}
                        onClick={() => handleAiAction(action)}
                        disabled={isAiProcessing}
                        className="px-2 py-0.5 rounded-md bg-white/5 hover:bg-white/10 text-[#9E9C98] hover:text-[#F5F3EF] text-[9.5px] font-mono transition-colors border border-white/5 hover:border-white/15 disabled:opacity-40"
                      >
                        {action}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Prompt Input */}
                <div className="p-2.5 border-t border-white/10 bg-[#0E1015] shrink-0">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleAiAction(aiInput);
                    }}
                    className="flex items-center gap-2"
                  >
                    <input
                      type="text"
                      value={aiInput}
                      onChange={(e) => setAiInput(e.target.value)}
                      placeholder="Ask the AI Architect..."
                      disabled={isAiProcessing}
                      className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-[11px] text-[#F5F3EF] placeholder-[#6B7280] focus:outline-none focus:border-[#C48446]/60 transition-colors"
                    />
                    <button
                      type="submit"
                      disabled={isAiProcessing || !aiInput.trim()}
                      className="p-1.5 rounded-lg bg-[#C48446] hover:bg-[#B37438] text-[#0A0B0E] disabled:opacity-40 transition-colors"
                    >
                      <Send className="w-3 h-3" />
                    </button>
                  </form>
                </div>
              </motion.aside>
            )}
          </AnimatePresence>
        </>
      )}

      {/* 6. RIGHT CONTEXTUAL FLOATING SPECIFICATION CARD (INSPECTOR) */}
      {!isPresenting && selectedEntity && (
        <AnimatePresence>
          <motion.aside
            initial={{ opacity: 0, x: 20, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 20, scale: 0.95 }}
            transition={{ duration: 0.18 }}
            className="fixed top-32 right-4 sm:right-6 z-40 w-76 sm:w-84 max-h-[calc(100vh-170px)] bg-[#12141A]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-4 flex flex-col overflow-y-auto text-xs text-[#F5F3EF]"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-3 shrink-0">
              <span className="text-[10px] font-mono uppercase tracking-widest text-[#C48446] font-semibold">
                ARCHITECTURAL SPECIFICATION
              </span>
              <button
                onClick={() => {
                  setSelectedRoomId(null);
                  setSelectedFurnitureId(null);
                  setSelectedDoorId(null);
                  setSelectedWindowId(null);
                }}
                className="p-1 rounded-md text-[#9E9C98] hover:text-[#F5F3EF] hover:bg-white/5 transition-colors"
                title="Close"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Room Properties */}
            {selectedRoom && (
              <div className="space-y-3">
                <div>
                  <div className="text-sm font-semibold text-[#F5F3EF]">{selectedRoom.name}</div>
                  <div className="text-[10px] font-mono text-[#C48446] uppercase mt-0.5">
                    {selectedRoom.zone} ZONE
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-2.5">
                  <div className="text-[9.5px] font-mono text-[#9E9C98] uppercase">Proportions</div>
                  {/* Width Stepper */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#9E9C98]">Width:</span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleAdjustRoomDimension("width", -1)}
                        className="p-1 rounded bg-white/10 hover:bg-white/15"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="font-mono text-xs w-10 text-center">
                        {selectedRoom.rect.width}&apos;
                      </span>
                      <button
                        onClick={() => handleAdjustRoomDimension("width", 1)}
                        className="p-1 rounded bg-white/10 hover:bg-white/15"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Length Stepper */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#9E9C98]">Depth:</span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleAdjustRoomDimension("length", -1)}
                        className="p-1 rounded bg-white/10 hover:bg-white/15"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="font-mono text-xs w-10 text-center">
                        {selectedRoom.rect.length}&apos;
                      </span>
                      <button
                        onClick={() => handleAdjustRoomDimension("length", 1)}
                        className="p-1 rounded bg-white/10 hover:bg-white/15"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-white/5 flex items-center justify-between font-mono text-xs">
                    <span className="text-[#9E9C98]">Area:</span>
                    <span className="text-[#C48446] font-semibold">
                      {selectedRoom.area_sqft || Math.round(selectedRoom.rect.width * selectedRoom.rect.length)} SQ FT
                    </span>
                  </div>
                </div>

                {/* Contained Furniture */}
                <div className="space-y-1.5">
                  <div className="text-[9.5px] font-mono text-[#9E9C98] uppercase">Room Items</div>
                  {(selectedRoom.furniture || []).length === 0 ? (
                    <div className="text-[10px] text-[#6B7280] italic">No furniture placed</div>
                  ) : (
                    selectedRoom.furniture?.map((f) => (
                      <div
                        key={f.id}
                        onClick={() => setSelectedFurnitureId(f.id)}
                        className={`p-2 rounded-lg border text-xs flex items-center justify-between cursor-pointer transition-colors ${
                          selectedFurnitureId === f.id
                            ? "bg-[#C48446]/20 border-[#C48446]/40 text-[#F5F3EF]"
                            : "bg-white/5 border-white/5 text-[#9E9C98] hover:text-[#F5F3EF]"
                        }`}
                      >
                        <span className="capitalize">{f.type.replace(/_/g, " ")}</span>
                        <span className="font-mono text-[10px]">{f.width}&apos; × {f.length}&apos;</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Furniture Properties */}
            {!selectedRoom && selectedFurniture && (
              <div className="space-y-3">
                <div>
                  <div className="text-sm font-semibold capitalize text-[#F5F3EF]">
                    {selectedFurniture.type.replace(/_/g, " ")}
                  </div>
                  <div className="text-[10px] font-mono text-[#9E9C98] mt-0.5">
                    Dimensions: {selectedFurniture.width}&apos; × {selectedFurniture.length}&apos; · {selectedFurniture.rotation || 0}°
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleRotateFurniture}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-mono text-[#F5F3EF] border border-white/10"
                  >
                    <RotateCw className="w-3.5 h-3.5 text-[#C48446]" />
                    <span>ROTATE 90°</span>
                  </button>
                  <button
                    onClick={handleDeleteFurniture}
                    className="p-2 rounded-lg bg-red-950/40 hover:bg-red-900/60 text-red-400 border border-red-500/30"
                    title="Remove Furniture"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Door Properties */}
            {!selectedRoom && !selectedFurniture && selectedDoor && (
              <div className="space-y-3">
                <div>
                  <div className="text-sm font-semibold text-[#F5F3EF]">
                    DOOR {selectedDoor.direction_label || selectedDoor.id}
                  </div>
                  <div className="text-[10px] font-mono text-[#9E9C98] mt-0.5">
                    Width: {selectedDoor.width || 3.0}&apos;-0&quot; · Swing: {selectedDoor.swing_direction || "inward"}
                  </div>
                </div>

                <button
                  onClick={handleToggleDoorSwing}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-mono text-[#F5F3EF] border border-white/10"
                >
                  <span>FLIP SWING DIRECTION</span>
                </button>
              </div>
            )}

            {/* Window Properties */}
            {!selectedRoom && !selectedFurniture && !selectedDoor && selectedWindow && (
              <div className="space-y-3">
                <div>
                  <div className="text-sm font-semibold text-[#F5F3EF]">
                    WINDOW {selectedWindow.direction_label || selectedWindow.id}
                  </div>
                  <div className="text-[10px] font-mono text-[#9E9C98] mt-0.5">
                    Width: {selectedWindow.width || 4.0}&apos;-0&quot; · Orientation: {selectedWindow.orientation || "external"}
                  </div>
                </div>
              </div>
            )}
          </motion.aside>
        </AnimatePresence>
      )}

      {/* 7. FULL-SCREEN ARCHITECTURAL DRAWING CANVAS (THE HERO) */}
      <main
        className="w-full h-full relative overflow-hidden flex items-center justify-center cursor-default"
        onWheel={(e) => {
          e.preventDefault();
          const delta = e.deltaY > 0 ? 0.9 : 1.1;
          setZoom((z) => Math.max(0.5, Math.min(3.5, z * delta)));
        }}
      >
        {/* Floating Pan & Zoom Controls (Bottom Left) */}
        {!isPresenting && (
          <div className="fixed bottom-6 left-6 z-40 flex items-center gap-2 pointer-events-auto">
            <div className="flex items-center p-1 rounded-full bg-[#12141A]/90 backdrop-blur-md border border-white/10 shadow-2xl text-[10px] sm:text-[11px] font-mono text-[#9E9C98]">
              <button
                onClick={() => setZoom((z) => Math.min(3.5, z * 1.15))}
                className="p-1.5 hover:text-[#F5F3EF] rounded-full"
                title="Zoom In"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
              <span className="px-2 text-[10px]">{Math.round(zoom * 100)}%</span>
              <button
                onClick={() => setZoom((z) => Math.max(0.5, z * 0.85))}
                className="p-1.5 hover:text-[#F5F3EF] rounded-full"
                title="Zoom Out"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <div className="h-3 w-px bg-white/10 mx-0.5" />
              <button
                onClick={() => {
                  setZoom(1.0);
                  setPan({ x: 0, y: 0 });
                }}
                className="px-2 py-1 hover:text-[#F5F3EF] rounded-full text-[10px]"
                title="Fit to Screen"
              >
                FIT
              </button>
            </div>

            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#12141A]/90 backdrop-blur-md border border-white/10 shadow-2xl text-[10px] font-mono text-[#9E9C98]">
              <Compass className="w-3.5 h-3.5 text-[#C48446]" />
              <span className="text-[#F5F3EF] font-semibold">NORTH ↑</span>
            </div>
          </div>
        )}

        {/* 2D ARCHITECTURAL BLUEPRINT CANVAS (OCCUPIES 80-85% OF SCREEN) */}
        <div
          className="w-full h-full flex items-center justify-center p-4 sm:p-8"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "center center",
            transition: isPanning ? "none" : "transform 0.05s ease-out",
          }}
        >
          <svg
            ref={svgRef}
            viewBox={`${originX} ${originY} ${viewBoxWidth} ${viewBoxHeight}`}
            className="w-[90vw] h-[85vh] max-w-[1400px] max-h-[900px] drop-shadow-2xl select-none"
            onClick={handleCanvasClickToAdd}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseDown={(e) => {
              if (e.target === svgRef.current) {
                setIsPanning(true);
                setPanStart({ x: e.clientX, y: e.clientY });
                setSelectedRoomId(null);
                setSelectedFurnitureId(null);
                setSelectedDoorId(null);
                setSelectedWindowId(null);
              }
            }}
          >
            <defs>
              {/* Very Subtle Architectural Presentation Grid */}
              <pattern id="archGrid" width="4" height="4" patternUnits="userSpaceOnUse">
                <path
                  d="M 4 0 L 0 0 0 4"
                  fill="none"
                  stroke="rgba(30,41,59,0.04)"
                  strokeWidth="0.12"
                />
              </pattern>
            </defs>

            {/* Plot Background Surface (Warm Ivory Presentation Tone) */}
            <rect
              x="0"
              y="0"
              width={pw}
              height={pl}
              fill="#FAF9F5"
              stroke="#64748B"
              strokeWidth="0.6"
              strokeDasharray="2,2"
            />

            {/* Subtle Grid */}
            <rect x="0" y="0" width={pw} height={pl} fill="url(#archGrid)" />

            {/* Plot Boundary Dimension Labels */}
            <text
              x={pw / 2}
              y="-1.4"
              textAnchor="middle"
              fill="#475569"
              fontSize="1.5"
              fontFamily="monospace"
              fontWeight="600"
            >
              PLOT WIDTH: {pw}&apos;-0&quot;
            </text>
            <text
              x="-1.4"
              y={pl / 2}
              textAnchor="middle"
              fill="#475569"
              fontSize="1.5"
              fontFamily="monospace"
              fontWeight="600"
              transform={`rotate(-90, -1.4, ${pl / 2})`}
            >
              PLOT LENGTH: {pl}&apos;-0&quot;
            </text>

            {/* Setbacks Envelope */}
            <rect
              x="3"
              y="3"
              width={Math.max(10, pw - 6)}
              height={Math.max(10, pl - 6)}
              fill="none"
              stroke="rgba(100,116,139,0.2)"
              strokeWidth="0.25"
              strokeDasharray="1,1"
            />

            {/* ROOMS LAYER */}
            {rooms.map((room) => {
              const isSelected = selectedRoomId === room.id;
              const rx = room.rect.x;
              const ry = room.rect.y;
              const rw = room.rect.width;
              const rl = room.rect.length;

              return (
                <g
                  key={room.id}
                  className={activeTool === "select" ? "cursor-move" : "cursor-pointer"}
                  onMouseDown={(e) => handleRoomMouseDown(e, room)}
                >
                  {/* Room Floor Fill on Presentation Sheet */}
                  <rect
                    x={rx}
                    y={ry}
                    width={rw}
                    height={rl}
                    fill={
                      isSelected
                        ? "rgba(196,132,70,0.12)"
                        : room.zone === "service"
                        ? "rgba(226,232,240,0.55)"
                        : "#FFFFFF"
                    }
                    stroke={isSelected ? "#C48446" : "#CBD5E1"}
                    strokeWidth={isSelected ? "0.6" : "0.2"}
                  />

                  {/* Room Label (3-Line Technical Architectural Standard) */}
                  <g pointerEvents="none">
                    <text
                      x={rx + rw / 2}
                      y={ry + rl / 2 - 1.2}
                      textAnchor="middle"
                      fill={isSelected ? "#B45309" : "#0F172A"}
                      fontSize={Math.min(1.8, Math.max(1.1, rw / 9))}
                      fontWeight="700"
                      letterSpacing="0.05em"
                      fontFamily="sans-serif"
                    >
                      {room.name.toUpperCase()}
                    </text>
                    <text
                      x={rx + rw / 2}
                      y={ry + rl / 2 + 0.8}
                      textAnchor="middle"
                      fill="#475569"
                      fontSize={Math.min(1.4, Math.max(0.9, rw / 11))}
                      fontFamily="monospace"
                    >
                      {rw}&apos; × {rl}&apos;
                    </text>
                    {showDimensions && (
                      <text
                        x={rx + rw / 2}
                        y={ry + rl / 2 + 2.5}
                        textAnchor="middle"
                        fill="#C48446"
                        fontSize={Math.min(1.3, Math.max(0.8, rw / 13))}
                        fontFamily="monospace"
                        fontWeight="600"
                      >
                        {room.area_sqft || Math.round(rw * rl)} SQ FT
                      </text>
                    )}
                  </g>

                  {/* Furniture Items within Room */}
                  {(room.furniture || []).map((item) => {
                    const isFurnSelected = selectedFurnitureId === item.id;
                    const fw = item.width || 2.5;
                    const fl = item.length || 2.5;

                    return (
                      <g
                        key={item.id}
                        transform={`translate(${item.x}, ${item.y}) rotate(${item.rotation || 0})`}
                        className="cursor-pointer"
                        onMouseDown={(e) => handleFurnitureMouseDown(e, item)}
                      >
                        <rect
                          x={-fw / 2}
                          y={-fl / 2}
                          width={fw}
                          height={fl}
                          rx="0.3"
                          fill={isFurnSelected ? "rgba(196,132,70,0.3)" : "#F1F5F9"}
                          stroke={isFurnSelected ? "#C48446" : "#475569"}
                          strokeWidth={isFurnSelected ? "0.4" : "0.22"}
                        />
                        {/* Orientation Notch */}
                        <line
                          x1={-fw / 4}
                          y1={-fl / 2}
                          x2={fw / 4}
                          y2={-fl / 2}
                          stroke="#C48446"
                          strokeWidth="0.35"
                        />
                      </g>
                    );
                  })}

                  {/* Selection Corner Handles */}
                  {isSelected && (
                    <g>
                      <circle
                        cx={rx + rw}
                        cy={ry + rl}
                        r="0.75"
                        fill="#C48446"
                        stroke="#FFFFFF"
                        strokeWidth="0.25"
                        className="cursor-nwse-resize"
                        onMouseDown={(e) => handleResizeHandleMouseDown(e, room)}
                      />
                    </g>
                  )}
                </g>
              );
            })}

            {/* GLOBAL DEDUPLICATED WALL NETWORK (DARK CHARCOAL/NAVY ON PAPER) */}
            {(currentFloor.walls || layout.walls || []).map((wall) => {
              const isExt = wall.is_exterior;
              return (
                <line
                  key={wall.id}
                  x1={wall.x1}
                  y1={wall.y1}
                  x2={wall.x2}
                  y2={wall.y2}
                  stroke={isExt ? "#0F172A" : "#334155"}
                  strokeWidth={isExt ? "1.05" : "0.55"}
                  strokeLinecap="round"
                />
              );
            })}

            {/* DOORS & TECHNICAL SWING ARCS */}
            {(currentFloor.doors || layout.doors || []).map((door) => {
              const dw = door.width || 3.0;
              const dmx = (door.x1 + door.x2) / 2;
              const dmz = (door.y1 + door.y2) / 2;
              const isDoorSelected = selectedDoorId === door.id;

              return (
                <g
                  key={door.id}
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedDoorId(door.id);
                    setSelectedRoomId(null);
                    setSelectedFurnitureId(null);
                    setSelectedWindowId(null);
                  }}
                >
                  {/* Opening Gap */}
                  <line
                    x1={door.x1}
                    y1={door.y1}
                    x2={door.x2}
                    y2={door.y2}
                    stroke="#FAF9F5"
                    strokeWidth="1.3"
                  />
                  {/* Door Leaf */}
                  <line
                    x1={door.x1}
                    y1={door.y1}
                    x2={door.x1 + dw * 0.7}
                    y2={door.y1 - dw * 0.7}
                    stroke={isDoorSelected ? "#C48446" : "#0F172A"}
                    strokeWidth="0.38"
                  />
                  {/* Light dashed swing arc */}
                  <path
                    d={`M ${door.x2} ${door.y2} A ${dw} ${dw} 0 0 0 ${door.x1 + dw * 0.7} ${door.y1 - dw * 0.7}`}
                    fill="none"
                    stroke="#94A3B8"
                    strokeWidth="0.18"
                    strokeDasharray="0.6,0.6"
                  />
                  {/* Door Direction Code */}
                  <text
                    x={dmx}
                    y={dmz - 0.75}
                    textAnchor="middle"
                    fill="#B45309"
                    fontSize="0.85"
                    fontFamily="monospace"
                    fontWeight="600"
                  >
                    {door.direction_label || door.id}
                  </text>
                </g>
              );
            })}

            {/* WINDOWS LAYER */}
            {(currentFloor.windows || layout.windows || []).map((win) => {
              const wmx = (win.x1 + win.x2) / 2;
              const wmz = (win.y1 + win.y2) / 2;
              const isWinSelected = selectedWindowId === win.id;

              return (
                <g
                  key={win.id}
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedWindowId(win.id);
                    setSelectedDoorId(null);
                    setSelectedRoomId(null);
                    setSelectedFurnitureId(null);
                  }}
                >
                  {/* Opening Gap */}
                  <line
                    x1={win.x1}
                    y1={win.y1}
                    x2={win.x2}
                    y2={win.y2}
                    stroke="#FAF9F5"
                    strokeWidth="1.3"
                  />
                  {/* Window Glass Technical Frame */}
                  <line
                    x1={win.x1}
                    y1={win.y1}
                    x2={win.x2}
                    y2={win.y2}
                    stroke={isWinSelected ? "#C48446" : "#0284C7"}
                    strokeWidth="0.38"
                  />
                  <line
                    x1={win.x1}
                    y1={win.y1 - 0.2}
                    x2={win.x2}
                    y2={win.y2 - 0.2}
                    stroke="#64748B"
                    strokeWidth="0.18"
                  />
                  {/* Window Direction Code */}
                  <text
                    x={wmx}
                    y={wmz - 0.75}
                    textAnchor="middle"
                    fill="#0284C7"
                    fontSize="0.85"
                    fontFamily="monospace"
                    fontWeight="600"
                  >
                    {win.direction_label || win.id}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </main>
    </div>
  );
};
