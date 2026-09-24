"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Sparkles,
  Check,
  X,
  Compass,
  Layers,
  Car,
  Home,
  ChevronRight,
  Edit3,
  Plus,
  Minus,
  AlertTriangle,
  CheckCircle2,
  SlidersHorizontal,
  Building2,
  Trash2,
  Info,
} from "lucide-react";
import * as THREE from "three";
import {
  IntakeRequest,
  RoomAllocationItem,
  DimensionRecommendationResponse,
  StrategyOption,
} from "@/types/house";
import { recommendDimensions } from "@/utils/api";

interface ArchitecturalConsultationProps {
  onClose: () => void;
  onSubmit: (req: IntakeRequest) => void;
  initialPlotWidth?: number;
  initialPlotLength?: number;
}

export interface AllocatableRoom {
  id: string;
  name: string;
  type: string;
  zone: string;
  floorNumber: number;
  sizeMode: "manual" | "ai_recommended";
  length: number;
  width: number;
  min_length?: number;
  min_width?: number;
  preferred_length?: number;
  preferred_width?: number;
  isHardConstraint?: boolean;
  quantity?: number;
  rationale?: string;
}

// Compute default dimensions based on room type and plot size tier
const getDefaultRoomDimensions = (
  type: string,
  plotArea: number
): { width: number; length: number; min_width: number; min_length: number } => {
  const isCompact = plotArea <= 850;
  const isSpacious = plotArea >= 2200;
  const clean = type.toLowerCase();

  if (clean.includes("master") || clean.includes("primary")) {
    return isCompact
      ? { width: 10.5, length: 12.0, min_width: 9.5, min_length: 10.5 }
      : isSpacious
      ? { width: 14.0, length: 17.0, min_width: 13.0, min_length: 15.0 }
      : { width: 12.0, length: 14.5, min_width: 11.0, min_length: 13.0 };
  }
  if (clean.includes("bed") || clean.includes("guest")) {
    return isCompact
      ? { width: 9.5, length: 10.5, min_width: 8.5, min_length: 9.5 }
      : isSpacious
      ? { width: 12.5, length: 14.5, min_width: 11.5, min_length: 13.0 }
      : { width: 11.0, length: 12.5, min_width: 10.0, min_length: 11.0 };
  }
  if (clean.includes("living") || clean.includes("drawing") || clean.includes("lounge")) {
    return isCompact
      ? { width: 11.0, length: 12.5, min_width: 10.0, min_length: 11.5 }
      : isSpacious
      ? { width: 16.0, length: 20.0, min_width: 15.0, min_length: 18.0 }
      : { width: 14.0, length: 16.5, min_width: 12.5, min_length: 15.0 };
  }
  if (clean.includes("dining")) {
    return isCompact
      ? { width: 8.0, length: 9.0, min_width: 7.5, min_length: 8.5 }
      : isSpacious
      ? { width: 12.0, length: 14.0, min_width: 11.0, min_length: 13.0 }
      : { width: 10.5, length: 12.0, min_width: 9.5, min_length: 10.5 };
  }
  if (clean.includes("kitchen")) {
    return isCompact
      ? { width: 7.0, length: 8.0, min_width: 6.5, min_length: 7.5 }
      : isSpacious
      ? { width: 11.0, length: 14.0, min_width: 10.0, min_length: 12.0 }
      : { width: 9.5, length: 11.5, min_width: 8.5, min_length: 10.0 };
  }
  if (clean.includes("bath") || clean.includes("toilet") || clean.includes("powder")) {
    return isCompact
      ? { width: 4.0, length: 6.0, min_width: 3.8, min_length: 5.5 }
      : isSpacious
      ? { width: 6.0, length: 9.5, min_width: 5.5, min_length: 8.0 }
      : { width: 5.0, length: 7.5, min_width: 4.5, min_length: 6.5 };
  }
  if (clean.includes("pooja") || clean.includes("mandir")) {
    return isCompact
      ? { width: 4.0, length: 5.0, min_width: 3.5, min_length: 4.5 }
      : isSpacious
      ? { width: 6.0, length: 7.5, min_width: 5.0, min_length: 6.5 }
      : { width: 5.0, length: 6.0, min_width: 4.5, min_length: 5.0 };
  }
  if (clean.includes("study") || clean.includes("office")) {
    return isCompact
      ? { width: 8.5, length: 9.5, min_width: 7.5, min_length: 8.5 }
      : isSpacious
      ? { width: 11.5, length: 13.5, min_width: 10.0, min_length: 12.0 }
      : { width: 9.5, length: 11.0, min_width: 8.5, min_length: 9.5 };
  }
  if (clean.includes("balcony") || clean.includes("patio") || clean.includes("terrace")) {
    return isCompact
      ? { width: 4.0, length: 7.5, min_width: 3.5, min_length: 6.0 }
      : isSpacious
      ? { width: 7.0, length: 14.0, min_width: 6.0, min_length: 10.0 }
      : { width: 5.5, length: 10.0, min_width: 4.5, min_length: 8.0 };
  }
  if (clean.includes("utility") || clean.includes("laundry") || clean.includes("store")) {
    return isCompact
      ? { width: 4.5, length: 6.0, min_width: 4.0, min_length: 5.0 }
      : isSpacious
      ? { width: 7.0, length: 9.0, min_width: 6.0, min_length: 7.5 }
      : { width: 5.5, length: 7.0, min_width: 4.5, min_length: 6.0 };
  }
  if (clean.includes("garage") || clean.includes("parking") || clean.includes("car")) {
    return isCompact
      ? { width: 10.0, length: 16.0, min_width: 9.0, min_length: 15.0 }
      : isSpacious
      ? { width: 18.0, length: 20.0, min_width: 10.0, min_length: 18.0 }
      : { width: 11.0, length: 18.0, min_width: 9.5, min_length: 16.0 };
  }
  if (clean.includes("dress") || clean.includes("closet") || clean.includes("walkin")) {
    return isCompact
      ? { width: 5.0, length: 6.0, min_width: 4.5, min_length: 5.0 }
      : isSpacious
      ? { width: 8.0, length: 10.0, min_width: 6.0, min_length: 7.0 }
      : { width: 6.0, length: 7.5, min_width: 5.0, min_length: 6.0 };
  }

  return isCompact
    ? { width: 8.5, length: 9.5, min_width: 7.0, min_length: 8.5 }
    : isSpacious
    ? { width: 12.0, length: 14.0, min_width: 10.5, min_length: 12.5 }
    : { width: 10.0, length: 11.5, min_width: 8.5, min_length: 10.0 };
};

export const ALL_SUPPORTED_ROOM_TYPES = [
  { type: "living_room", name: "Living Room", zone: "public" },
  { type: "drawing_room", name: "Drawing Room", zone: "public" },
  { type: "dining", name: "Dining Room", zone: "public" },
  { type: "master_bedroom", name: "Master Bedroom", zone: "private" },
  { type: "bedroom", name: "Bedroom", zone: "private" },
  { type: "kitchen", name: "Kitchen", zone: "service" },
  { type: "bathroom", name: "Bathroom", zone: "service" },
  { type: "pooja", name: "Pooja Room", zone: "special" },
  { type: "study", name: "Study / Office", zone: "private" },
  { type: "utility", name: "Utility", zone: "service" },
  { type: "store", name: "Store Room", zone: "service" },
  { type: "dressing_room", name: "Dressing Room", zone: "private" },
  { type: "balcony", name: "Balcony / Terrace", zone: "outdoor" },
  { type: "garage", name: "Garage / Parking", zone: "service" },
  { type: "custom", name: "Custom Room", zone: "public" },
];

const generateDefaultAllocations = (
  numFloors: number,
  bedroomCount: number,
  attachedBathsOption: "None" | "1" | "2" | "3" | "All",
  spaces: string[],
  plotArea: number = 2000,
  prevAllocations?: AllocatableRoom[]
): AllocatableRoom[] => {
  const rooms: AllocatableRoom[] = [];
  const existingMap = new Map<string, AllocatableRoom>();
  if (prevAllocations) {
    prevAllocations.forEach((r) => existingMap.set(r.id, r));
  }

  const createRoom = (
    id: string,
    name: string,
    type: string,
    zone: string,
    defaultFloor: number
  ): AllocatableRoom => {
    const existing = existingMap.get(id);
    const dims = getDefaultRoomDimensions(type, plotArea);

    if (existing) {
      return {
        ...existing,
        name,
        type,
        zone,
        floorNumber: Math.min(existing.floorNumber, numFloors),
      };
    }

    return {
      id,
      name,
      type,
      zone,
      floorNumber: Math.min(defaultFloor, numFloors),
      sizeMode: "ai_recommended",
      width: dims.width,
      length: dims.length,
      min_width: dims.min_width,
      min_length: dims.min_length,
      preferred_width: dims.width,
      preferred_length: dims.length,
      isHardConstraint: false,
      quantity: 1,
    };
  };

  // 1. Social Core (Ground Floor)
  rooms.push(createRoom("living_room", "Living Room", "living_room", "public", 1));
  rooms.push(createRoom("kitchen", "Kitchen", "kitchen", "service", 1));
  rooms.push(createRoom("dining", "Dining Room", "dining", "public", 1));

  // 2. Bedrooms
  rooms.push(
    createRoom("master_bedroom", "Master Suite", "master_bedroom", "private", numFloors > 1 ? 2 : 1)
  );

  for (let i = 2; i <= bedroomCount; i++) {
    const bedId = `bedroom_${i}`;
    const defaultFloor = numFloors >= 3 && i >= 3 ? 3 : numFloors > 1 ? 2 : 1;
    rooms.push(createRoom(bedId, `Bedroom ${i}`, "bedroom", "private", defaultFloor));
  }

  // 3. Bathrooms
  let attachedCount = 1;
  if (attachedBathsOption === "None") attachedCount = 0;
  else if (attachedBathsOption === "All") attachedCount = bedroomCount;
  else attachedCount = Math.min(bedroomCount, parseInt(attachedBathsOption, 10) || 1);

  for (let a = 1; a <= attachedCount; a++) {
    const bathId = `attached_bath_${a}`;
    const parentFloor =
      a === 1
        ? rooms.find((r) => r.id === "master_bedroom")?.floorNumber || (numFloors > 1 ? 2 : 1)
        : rooms.find((r) => r.id === `bedroom_${a}`)?.floorNumber || (numFloors > 1 ? 2 : 1);
    rooms.push(
      createRoom(
        bathId,
        a === 1 ? "Master En-suite" : `Attached Bath ${a}`,
        "bathroom",
        "private",
        parentFloor
      )
    );
  }

  // Common Bathroom
  rooms.push(createRoom("common_bathroom", "Common Bathroom", "bathroom", "service", 1));

  // 4. Specialized Program Spaces
  if (spaces.includes("Pooja room")) {
    rooms.push(createRoom("pooja", "Pooja Room", "pooja", "special", 1));
  }
  if (spaces.includes("Study")) {
    rooms.push(createRoom("study", "Study / Home Office", "office", "private", numFloors > 1 ? 2 : 1));
  }
  if (spaces.includes("Balcony")) {
    rooms.push(createRoom("balcony", "Balcony / Terrace", "balcony", "outdoor", numFloors > 1 ? 2 : 1));
  }
  if (spaces.includes("Home Theater")) {
    rooms.push(
      createRoom(
        "home_theater",
        "Home Theater",
        "family_lounge",
        "special",
        numFloors >= 3 ? 3 : numFloors > 1 ? 2 : 1
      )
    );
  }
  if (spaces.includes("Garden")) {
    rooms.push(createRoom("courtyard", "Courtyard Garden", "patio", "outdoor", 1));
  }

  return rooms;
};

// Subtle Three.js Atmosphere
const SubtleAtmosphere3D: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth || window.innerWidth;
    const height = mount.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2("#0A0B0E", 0.015);

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(16, 12, 20);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    const group = new THREE.Group();
    scene.add(group);

    const grid = new THREE.GridHelper(50, 50, 0x333742, 0x181a22);
    grid.position.y = -0.01;
    group.add(grid);

    const boxMat = new THREE.MeshBasicMaterial({
      color: 0x1f232d,
      wireframe: true,
      transparent: true,
      opacity: 0.35,
    });
    const mainBox = new THREE.Mesh(new THREE.BoxGeometry(10, 6, 14), boxMat);
    mainBox.position.set(0, 3, 0);
    group.add(mainBox);

    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      group.rotation.y += 0.0008;
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      if (mount && renderer.domElement) {
        mount.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  return <div ref={mountRef} className="absolute inset-0 pointer-events-none opacity-40 z-0" />;
};

export const ArchitecturalConsultation: React.FC<ArchitecturalConsultationProps> = ({
  onClose,
  onSubmit,
  initialPlotWidth = 40,
  initialPlotLength = 50,
}) => {
  // 1. Plot Dimensions State (Manual, arbitrary dimensions with unit toggle)
  const [plotWidthInput, setPlotWidthInput] = useState<number>(initialPlotWidth);
  const [plotLengthInput, setPlotLengthInput] = useState<number>(initialPlotLength);
  const [plotUnit, setPlotUnit] = useState<"ft" | "m">("ft");

  // Canonical measurements in feet
  const plotWidthInFt = useMemo(() => {
    return plotUnit === "m" ? Math.round(plotWidthInput * 3.28084 * 10) / 10 : plotWidthInput;
  }, [plotWidthInput, plotUnit]);

  const plotLengthInFt = useMemo(() => {
    return plotUnit === "m" ? Math.round(plotLengthInput * 3.28084 * 10) / 10 : plotLengthInput;
  }, [plotLengthInput, plotUnit]);

  const plotAreaDisplay = useMemo(() => {
    const area = Math.round(plotWidthInput * plotLengthInput);
    return `${area.toLocaleString()} SQ ${plotUnit === "m" ? "M" : "FT"}`;
  }, [plotWidthInput, plotLengthInput, plotUnit]);

  // Validation
  const plotValidationError = useMemo(() => {
    if (isNaN(plotWidthInput) || isNaN(plotLengthInput)) {
      return "Please enter valid numeric dimensions.";
    }
    if (plotWidthInput <= 0 || plotLengthInput <= 0) {
      return "Plot dimensions must be greater than zero.";
    }
    const minW = plotUnit === "m" ? 4.5 : 15;
    const minL = plotUnit === "m" ? 6.0 : 20;
    const maxW = plotUnit === "m" ? 60 : 200;
    const maxL = plotUnit === "m" ? 75 : 250;

    if (plotWidthInput < minW) {
      return `Plot width must be at least ${minW} ${plotUnit} for residential building.`;
    }
    if (plotLengthInput < minL) {
      return `Plot length must be at least ${minL} ${plotUnit}.`;
    }
    if (plotWidthInput > maxW) {
      return `Plot width cannot exceed ${maxW} ${plotUnit}.`;
    }
    if (plotLengthInput > maxL) {
      return `Plot length cannot exceed ${maxL} ${plotUnit}.`;
    }
    return null;
  }, [plotWidthInput, plotLengthInput, plotUnit]);

  // Flag extreme aspect ratios (> 4:1 or < 1:4)
  const plotAspectRatioNote = useMemo(() => {
    if (plotWidthInput <= 0 || plotLengthInput <= 0) return null;
    const ratio = Math.max(plotWidthInput, plotLengthInput) / Math.min(plotWidthInput, plotLengthInput);
    if (ratio > 4.0) {
      return `This plot has a very narrow aspect ratio (${ratio.toFixed(1)}:1). The layout will prioritize linear flow and vertical circulation.`;
    }
    return null;
  }, [plotWidthInput, plotLengthInput]);

  // 2. Household & Requirements State
  const [families, setFamilies] = useState<"1" | "2" | "3+">("1");
  const [kids, setKids] = useState<"0" | "1" | "2" | "3+">("2");
  const [bedrooms, setBedrooms] = useState<number>(3);
  const [attachedBaths, setAttachedBaths] = useState<"None" | "1" | "2" | "3" | "All">("2");
  const [separateKidsBedrooms, setSeparateKidsBedrooms] = useState<"Yes" | "No" | "Let AI decide">("Yes");
  const [floors, setFloors] = useState<"Ground" | "Ground + 1" | "Ground + 2" | "Ground + 3" | "Custom">("Ground + 1");
  const [customFloors, setCustomFloors] = useState<number>(4);
  const [orientation, setOrientation] = useState<"North" | "South" | "East" | "West" | "Doesn't matter">("South");
  const [parking, setParking] = useState<"No parking" | "1 car" | "2 cars">("1 car");
  const [style, setStyle] = useState<"Modern" | "Minimal" | "Traditional" | "Luxury" | "Let AI decide">("Modern");
  const [isVastuEnabled, setIsVastuEnabled] = useState<boolean>(true);
  const [additionalSpaces, setAdditionalSpaces] = useState<string[]>([
    "Kitchen",
    "Dining",
    "Study",
    "Balcony",
  ]);

  const numFloorsCount = useMemo(() => {
    if (floors === "Ground") return 1;
    if (floors === "Ground + 1") return 2;
    if (floors === "Ground + 2") return 3;
    if (floors === "Ground + 3") return 4;
    return Math.max(1, customFloors);
  }, [floors, customFloors]);

  // Room Allocations & Dimensions
  const [roomAllocations, setRoomAllocations] = useState<AllocatableRoom[]>(() =>
    generateDefaultAllocations(
      2,
      3,
      "2",
      ["Kitchen", "Dining", "Study", "Balcony"],
      plotWidthInFt * plotLengthInFt
    )
  );

  // Sync rooms on requirements change while preserving user manual dimensions
  useEffect(() => {
    setRoomAllocations((prev) =>
      generateDefaultAllocations(
        numFloorsCount,
        bedrooms,
        attachedBaths,
        additionalSpaces,
        plotWidthInFt * plotLengthInFt,
        prev
      )
    );
  }, [numFloorsCount, bedrooms, attachedBaths, additionalSpaces, plotWidthInFt, plotLengthInFt]);

  // 3. AI Recommendation & Feasibility Engine State
  const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(false);
  const [strategies, setStrategies] = useState<StrategyOption[]>([]);

  // Live Feasibility Calculation
  const feasibilityData = useMemo(() => {
    const pw = plotWidthInFt;
    const pl = plotLengthInFt;
    const area = pw * pl;

    // Adaptive setbacks
    let sb_front = 4.5,
      sb_rear = 3.0,
      sb_left = 2.5,
      sb_right = 2.5;
    if (area <= 700) {
      sb_front = 3.0;
      sb_rear = 2.0;
      sb_left = 1.5;
      sb_right = 1.5;
    } else if (area <= 1000) {
      sb_front = 3.5;
      sb_rear = 2.5;
      sb_left = 2.0;
      sb_right = 2.0;
    } else if (area <= 1600) {
      sb_front = 4.5;
      sb_rear = 3.0;
      sb_left = 2.5;
      sb_right = 2.5;
    } else if (area <= 2800) {
      sb_front = 5.0;
      sb_rear = 4.0;
      sb_left = 3.0;
      sb_right = 3.0;
    } else {
      sb_front = 8.0;
      sb_rear = 5.0;
      sb_left = 4.0;
      sb_right = 4.0;
    }

    const buildableW = Math.max(10, pw - sb_left - sb_right);
    const buildableL = Math.max(12, pl - sb_front - sb_rear);
    const buildableGroundArea = Math.round(buildableW * buildableL);

    const groundRooms = roomAllocations.filter((r) => r.floorNumber === 1);
    let groundCarpet = 0;
    groundRooms.forEach((r) => {
      groundCarpet += (r.width || 10) * (r.length || 12);
    });

    const isCompact = area <= 850;
    const staircaseArea = numFloorsCount > 1 ? (isCompact ? 55 : 80) : 0;
    const circMult = isCompact ? 1.14 : 1.22;
    const totalGroundReq = Math.round(groundCarpet * circMult + staircaseArea);
    const coveragePct = Math.round((totalGroundReq / Math.max(1, buildableGroundArea)) * 100);

    let status: "comfortable" | "tight" | "requires_multistage" | "infeasible" = "comfortable";
    let headline = "✓ Requirements fit within available buildable area.";
    let message = "";
    let recommendation = "";

    const bedroomCount = roomAllocations.filter((r) => r.type.includes("bed")).length;

    if (coveragePct <= 85) {
      status = "comfortable";
      headline = "✓ Requirements fit within available buildable area.";
      message = `Your requirements fit comfortably within this plot (${coveragePct}% ground coverage).`;
      recommendation = "Balanced layout with comfortable circulation and natural daylighting.";
    } else if (coveragePct <= 105) {
      status = "tight";
      headline = "⚠ Requirements are tight for this plot.";
      if (numFloorsCount === 1) {
        message = `Your ${Math.round(pw)} × ${Math.round(pl)} ft plot is tight for the requested program (${coveragePct}% coverage).`;
        recommendation = `AI recommends moving ${Math.max(1, bedroomCount - 1)} bedrooms to the first floor.`;
      } else {
        message = `The ground floor program is tight (${coveragePct}% coverage). AI has optimized circulation and room dimensions.`;
        recommendation = "Compact planning with efficient common circulation corridors.";
      }
    } else {
      if (numFloorsCount === 1) {
        status = "requires_multistage";
        headline = "⚠ Requirements are tight for this plot.";
        message = `Your ${Math.round(pw)} × ${Math.round(pl)} ft plot is tight for the requested program.`;
        recommendation = `AI recommends moving ${Math.max(1, bedroomCount - 1)} bedrooms to the first floor.`;
      } else {
        const upperRooms = roomAllocations.filter((r) => r.floorNumber > 1);
        if (groundRooms.length > upperRooms.length + 2) {
          status = "tight";
          headline = "⚠ Requirements are tight for this plot.";
          message = `Too many rooms on Ground Floor (${coveragePct}% coverage).`;
          recommendation = "AI recommends moving bedrooms to the first floor.";
        } else {
          status = "infeasible";
          headline = "⚠ Requested dimensions cannot fit with the current plot and room program.";
          message = `Requested dimensions exceed buildable envelope on a ${Math.round(pw)} × ${Math.round(pl)} ft plot.`;
          recommendation = "Consider reducing room counts or slightly decreasing manual dimensions.";
        }
      }
    }

    return {
      buildableW,
      buildableL,
      buildableGroundArea,
      totalGroundReq,
      coveragePct,
      status,
      headline,
      message,
      recommendation,
      isCompact,
    };
  }, [plotWidthInFt, plotLengthInFt, roomAllocations, numFloorsCount]);

  // Client-side fallback if backend is loading or unreachable
  const applyClientFallbackRecommendations = () => {
    const area = plotWidthInFt * plotLengthInFt;
    setRoomAllocations((prev) =>
      prev.map((r) => {
        const dims = getDefaultRoomDimensions(r.type, area);
        return {
          ...r,
          sizeMode: "ai_recommended",
          width: dims.width,
          length: dims.length,
          min_width: dims.min_width,
          min_length: dims.min_length,
          preferred_width: dims.width,
          preferred_length: dims.length,
          rationale: `AI-calculated optimal proportion for ${plotWidthInFt}×${plotLengthInFt} ft plot.`,
        };
      })
    );
  };

  // AI Recommendation Trigger
  const handleGetAIRecommendations = async () => {
    setIsLoadingRecommendations(true);
    try {
      let attachedCount = 1;
      if (attachedBaths === "None") attachedCount = 0;
      else if (attachedBaths === "All") attachedCount = bedrooms;
      else attachedCount = Math.min(bedrooms, parseInt(attachedBaths, 10) || 1);

      let cars = 0;
      if (parking === "1 car") cars = 1;
      else if (parking === "2 cars") cars = 2;

      let roadSide: "north" | "south" | "east" | "west" = "south";
      if (orientation !== "Doesn't matter") {
        roadSide = orientation.toLowerCase() as "north" | "south" | "east" | "west";
      }

      const data = await recommendDimensions({
        plot_width: plotWidthInFt,
        plot_length: plotLengthInFt,
        plot_unit: "ft",
        num_floors: numFloorsCount,
        bedrooms,
        bathrooms: Math.max(attachedCount + 1, 2),
        attached_bathroom_count: attachedCount,
        parking_cars: cars,
        road_side: roadSide,
        special_rooms: additionalSpaces,
        rooms: roomAllocations.map((r) => ({
          id: r.id,
          room_id: r.id,
          floor_id: `floor_${r.floorNumber}`,
          name: r.name,
          type: r.type,
          zone: r.zone,
          floor_number: r.floorNumber,
          quantity: r.quantity || 1,
          size_mode: r.sizeMode,
          is_hard_constraint: r.isHardConstraint,
          length: r.length,
          width: r.width,
          min_length: r.min_length,
          min_width: r.min_width,
          preferred_length: r.preferred_length,
          preferred_width: r.preferred_width,
        })),
      });

      if (data) {
        if (data.rooms && data.rooms.length > 0) {
          const recMap = new Map<string, RoomAllocationItem>();
          data.rooms.forEach((r) => {
            if (r.id) recMap.set(r.id, r);
            if (r.type) recMap.set(r.type, r);
          });

          setRoomAllocations((prev) =>
            prev.map((r) => {
              // Never silently overwrite explicit user manual dimensions!
              if (r.sizeMode === "manual" && r.isHardConstraint) {
                return r;
              }

              const matched = (r.id ? recMap.get(r.id) : undefined) || recMap.get(r.type);
              if (matched) {
                return {
                  ...r,
                  length: matched.length || r.length,
                  width: matched.width || r.width,
                  min_length: matched.min_length || r.min_length,
                  min_width: matched.min_width || r.min_width,
                  preferred_length: matched.preferred_length || matched.length || r.length,
                  preferred_width: matched.preferred_width || matched.width || r.width,
                  sizeMode: "ai_recommended",
                  floorNumber: matched.floor_number
                    ? Math.min(matched.floor_number, numFloorsCount)
                    : r.floorNumber,
                  rationale: matched.rationale,
                };
              }
              return r;
            })
          );
        }
        if (data.strategies) {
          setStrategies(data.strategies);
        }
      } else {
        applyClientFallbackRecommendations();
      }
    } catch {
      applyClientFallbackRecommendations();
    } finally {
      setIsLoadingRecommendations(false);
    }
  };

  // Dimension Edit Handlers
  const toggleRoomSizeMode = (roomId: string) => {
    setRoomAllocations((prev) =>
      prev.map((r) =>
        r.id === roomId
          ? {
              ...r,
              sizeMode: r.sizeMode === "manual" ? "ai_recommended" : "manual",
              isHardConstraint: r.sizeMode !== "manual",
            }
          : r
      )
    );
  };

  const updateRoomDimensions = (roomId: string, width: number, length: number) => {
    setRoomAllocations((prev) =>
      prev.map((r) =>
        r.id === roomId
          ? {
              ...r,
              width: Math.max(3.0, width),
              length: Math.max(3.0, length),
              sizeMode: "manual",
              isHardConstraint: true,
            }
          : r
      )
    );
  };

  const applyRoomPreset = (roomId: string, tier: "compact" | "standard" | "spacious") => {
    const area = tier === "compact" ? 600 : tier === "spacious" ? 2500 : 1500;
    setRoomAllocations((prev) =>
      prev.map((r) => {
        if (r.id !== roomId) return r;
        const dims = getDefaultRoomDimensions(r.type, area);
        return {
          ...r,
          width: dims.width,
          length: dims.length,
          min_width: dims.min_width,
          min_length: dims.min_length,
          preferred_width: dims.width,
          preferred_length: dims.length,
          sizeMode: "manual",
          isHardConstraint: true,
        };
      })
    );
  };

  const applyGlobalPreset = (tier: "compact" | "standard" | "spacious") => {
    const area = tier === "compact" ? 600 : tier === "spacious" ? 2500 : 1500;
    setRoomAllocations((prev) =>
      prev.map((r) => {
        const dims = getDefaultRoomDimensions(r.type, area);
        return {
          ...r,
          width: dims.width,
          length: dims.length,
          min_width: dims.min_width,
          min_length: dims.min_length,
          preferred_width: dims.width,
          preferred_length: dims.length,
          sizeMode: "manual",
          isHardConstraint: true,
        };
      })
    );
  };

  const applyStrategy = (strat: StrategyOption) => {
    const map = new Map<string, { floor: number; length: number; width: number }>();
    strat.room_allocations.forEach((item) => {
      map.set(item.room_id, {
        floor: item.floor_number,
        length: item.length,
        width: item.width,
      });
    });

    setRoomAllocations((prev) =>
      prev.map((r) => {
        const sMatch = map.get(r.id);
        if (sMatch) {
          return {
            ...r,
            floorNumber: Math.min(sMatch.floor, numFloorsCount),
            length: sMatch.length,
            width: sMatch.width,
          };
        }
        return r;
      })
    );
  };

  const moveRoomToFloor = (roomId: string, targetFloor: number) => {
    setRoomAllocations((prev) =>
      prev.map((r) => (r.id === roomId ? { ...r, floorNumber: targetFloor } : r))
    );
  };

  const updateRoomQuantity = (roomId: string, delta: number) => {
    setRoomAllocations((prev) =>
      prev.map((r) => {
        if (r.id !== roomId) return r;
        const currentQty = r.quantity || 1;
        const newQty = Math.max(1, Math.min(10, currentQty + delta));
        return { ...r, quantity: newQty };
      })
    );
  };

  const removeRoom = (roomId: string) => {
    setRoomAllocations((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((r) => r.id !== roomId);
    });
  };

  const [isAddRoomPickerOpen, setIsAddRoomPickerOpen] = useState(false);
  const [customRoomNameInput, setCustomRoomNameInput] = useState("");
  const [isAddingCustom, setIsAddingCustom] = useState(false);

  const addRoom = (type: string, customName?: string) => {
    const matchedPreset = ALL_SUPPORTED_ROOM_TYPES.find((item) => item.type === type);
    const name = customName || matchedPreset?.name || "Room";
    const zone = matchedPreset?.zone || "public";
    const dims = getDefaultRoomDimensions(type, plotWidthInFt * plotLengthInFt);
    const newRoom: AllocatableRoom = {
      id: `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      name,
      type,
      zone,
      floorNumber: 1,
      sizeMode: "ai_recommended",
      width: dims.width,
      length: dims.length,
      min_width: dims.min_width,
      min_length: dims.min_length,
      preferred_width: dims.width,
      preferred_length: dims.length,
      isHardConstraint: false,
      quantity: 1,
    };
    setRoomAllocations((prev) => [...prev, newRoom]);
    setIsAddRoomPickerOpen(false);
    setIsAddingCustom(false);
    setCustomRoomNameInput("");
  };

  // Questions Configuration
  const [step, setStep] = useState<number>(1);
  const [jumpBackFromSummary, setJumpBackFromSummary] = useState(false);

  // Dedicated scroll container reference to control and reset scrolling
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Reset scroll to absolute top whenever step changes
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, left: 0, behavior: "instant" });
    }
  }, [step]);

  const questionsList = useMemo(() => {
    const list: { id: number; title: string; subtitle: string }[] = [
      {
        id: 1,
        title: "Plot Dimensions",
        subtitle: "Define the exact site boundary and unit of measurement.",
      },
      { id: 2, title: "Families", subtitle: "How many families or generations will reside here?" },
      { id: 3, title: "Children", subtitle: "How many kids will live in the home?" },
      { id: 4, title: "Bedrooms", subtitle: "Total number of private sleeping suites required." },
      {
        id: 5,
        title: "En-suite Bathrooms",
        subtitle: "How many bedrooms require dedicated attached bathrooms?",
      },
    ];

    if (kids !== "0") {
      list.push({
        id: 6,
        title: "Children's Quarters",
        subtitle: "Do the children require separate bedrooms or shared suites?",
      });
    }

    list.push(
      { id: 7, title: "Levels & Verticality", subtitle: "How many floors will the residence span?" },
      {
        id: 8,
        title: "Solar & Road Orientation",
        subtitle: "Which cardinal direction is the primary frontage facing?",
      },
      { id: 9, title: "Vehicular Parking", subtitle: "On-site vehicular capacity requirements." },
      {
        id: 10,
        title: "Architectural Language",
        subtitle: "Preferred materiality, geometry, and stylistic tone.",
      },
      {
        id: 11,
        title: "Spatial Program",
        subtitle: "Select additional specialized living and utility spaces.",
      },
      {
        id: 12,
        title: "Room Sizes & Allocation",
        subtitle: "Define manual dimensions or choose AI-recommended room sizing.",
      }
    );

    return list;
  }, [kids]);

  const totalSteps = questionsList.length;
  const currentStepIndex = questionsList.findIndex((q) => q.id === step);
  const progressRatio = step === 13 ? 1 : (currentStepIndex + 1) / (totalSteps + 1);

  const handleNext = () => {
    if (step === 1 && plotValidationError) return;

    if (jumpBackFromSummary) {
      setStep(13);
      setJumpBackFromSummary(false);
      return;
    }

    const currentIndex = questionsList.findIndex((q) => q.id === step);
    if (currentIndex >= 0 && currentIndex < questionsList.length - 1) {
      setStep(questionsList[currentIndex + 1].id);
    } else {
      setStep(13);
    }
  };

  const handleBack = () => {
    if (step === 13) {
      setStep(questionsList[questionsList.length - 1].id);
      return;
    }

    const currentIndex = questionsList.findIndex((q) => q.id === step);
    if (currentIndex > 0) {
      setStep(questionsList[currentIndex - 1].id);
    } else {
      onClose();
    }
  };

  const jumpToStep = (targetStep: number) => {
    setJumpBackFromSummary(true);
    setStep(targetStep);
  };

  const toggleAdditionalSpace = (space: string) => {
    setAdditionalSpaces((prev) =>
      prev.includes(space) ? prev.filter((s) => s !== space) : [...prev, space]
    );
  };

  // Convert collected brief into canonical IntakeRequest
  const handleFinalGenerate = () => {
    let attachedCount = 1;
    if (attachedBaths === "None") attachedCount = 0;
    else if (attachedBaths === "All") attachedCount = bedrooms;
    else attachedCount = Math.min(bedrooms, parseInt(attachedBaths, 10) || 1);

    const totalBaths = Math.max(attachedCount + 1, 2);

    let roadSide: "north" | "south" | "east" | "west" = "south";
    if (orientation !== "Doesn't matter") {
      roadSide = orientation.toLowerCase() as "north" | "south" | "east" | "west";
    }

    let cars = 0;
    if (parking === "1 car") cars = 1;
    else if (parking === "2 cars") cars = 2;

    const roomAllocationsPayload: RoomAllocationItem[] = roomAllocations.map((ra) => ({
      room_id: ra.id,
      name: ra.name,
      type: ra.type,
      floor_id: `floor_${ra.floorNumber}`,
      floor_number: ra.floorNumber,
      zone: ra.zone,
      required: true,
      size_mode: ra.sizeMode,
      length: ra.length,
      width: ra.width,
      min_length: ra.min_length,
      min_width: ra.min_width,
      preferred_length: ra.preferred_length,
      preferred_width: ra.preferred_width,
      is_hard_constraint: ra.sizeMode === "manual",
      quantity: ra.quantity || 1,
      rationale: ra.rationale,
    }));

    const intake: IntakeRequest = {
      plot_width: plotWidthInFt,
      plot_length: plotLengthInFt,
      plot: {
        length: plotLengthInput,
        width: plotWidthInput,
        unit: plotUnit,
      },
      num_floors: numFloorsCount,
      bedrooms: bedrooms,
      bathrooms: totalBaths,
      attached_bathroom_count: attachedCount,
      road_side: roadSide,
      parking_cars: cars,
      style: style === "Let AI decide" ? "Modern Minimalist" : style,
      special_rooms: additionalSpaces,
      open_concept: true,
      vastu_compliant: isVastuEnabled,
      room_allocations: roomAllocationsPayload,
      room_requirements: roomAllocationsPayload,
    };

    onSubmit(intake);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0A0B0E] text-[#F5F3EF] overflow-hidden select-none">
      {/* 3D Atmospheric Background */}
      <SubtleAtmosphere3D />

      {/* Top Header Bar */}
      <div className="relative z-10 w-full px-8 py-5 flex items-center justify-between border-b border-white/5 bg-[#0A0B0E]/70 backdrop-blur-sm shrink-0">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 text-xs font-mono tracking-widest text-[#9E9C98] hover:text-[#F5F3EF] transition-colors group"
        >
          <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-1" />
          <span>{step === 1 ? "RETURN TO STUDIO" : "PREVIOUS STEP"}</span>
        </button>

        {/* Step Indicator */}
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-mono tracking-widest text-[#9E9C98]">
            {step === 13
              ? "YOUR HOME BRIEF & BUILDING PROGRAM"
              : `CONSULTATION // STEP ${String(currentStepIndex + 1).padStart(2, "0")} OF ${String(
                  totalSteps
                ).padStart(2, "0")}`}
          </span>
        </div>

        <button
          onClick={onClose}
          className="p-2 text-[#9E9C98] hover:text-[#F5F3EF] transition-colors rounded-full hover:bg-white/5"
          title="Exit Consultation"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Hairline Progress Bar */}
      <div className="relative z-10 w-full h-[2px] bg-white/5 shrink-0">
        <motion.div
          className="h-full bg-[#C48446]"
          initial={{ width: 0 }}
          animate={{ width: `${progressRatio * 100}%` }}
          transition={{ duration: 0.35, ease: "easeInOut" }}
        />
      </div>

      {/* Main Consultation Canvas - Dedicated Single Scroll Container */}
      <div
        ref={scrollContainerRef}
        className="relative z-10 flex-1 w-full overflow-y-auto overflow-x-hidden min-h-0"
      >
        <div className="w-full min-h-full flex flex-col items-center justify-start px-4 sm:px-6 md:px-12 py-8 md:py-12">
          <AnimatePresence mode="wait">
          {/* STEP 1: MANUAL PLOT DIMENSIONS & UNIT SELECTION */}
          {step === 1 && (
            <motion.div
              key="step-1"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.28 }}
              className="w-full flex flex-col items-center text-center max-w-xl"
            >
              <span className="text-xs font-mono tracking-widest text-[#C48446] uppercase mb-2">
                01 — SITE & PLOT DIMENSIONS
              </span>
              <h2 className="text-3xl md:text-4xl font-serif font-light tracking-tight text-[#F5F3EF] mb-2">
                Enter your plot dimensions
              </h2>
              <p className="text-sm text-[#9E9C98] max-w-md mb-6">
                Specify exact length and width in feet or meters. The architectural engine calculates
                setbacks, buildable envelope, and optimal layout from your real site.
              </p>

              {/* Main Dimension Card */}
              <div className="w-full p-6 rounded-2xl bg-[#12141A]/90 border border-white/10 mb-6 backdrop-blur-md text-left">
                {/* Unit Switcher & Live Plot Area */}
                <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-6">
                  <div>
                    <span className="text-[10px] font-mono tracking-widest text-[#9E9C98] block">
                      TOTAL PLOT AREA
                    </span>
                    <span className="text-[#C48446] font-mono font-semibold text-lg">
                      {plotAreaDisplay}
                    </span>
                    {plotUnit === "m" && (
                      <span className="text-[10px] font-mono text-[#9E9C98] block">
                        ≈ {Math.round(plotWidthInFt * plotLengthInFt).toLocaleString()} SQ FT
                      </span>
                    )}
                  </div>

                  {/* Unit Toggle */}
                  <div className="inline-flex rounded-full p-1 bg-[#0A0B0E] border border-white/10 text-xs font-mono">
                    <button
                      type="button"
                      onClick={() => setPlotUnit("ft")}
                      className={`px-3 py-1 rounded-full transition-all ${
                        plotUnit === "ft"
                          ? "bg-[#C48446] text-[#0A0B0E] font-bold shadow-sm"
                          : "text-[#9E9C98] hover:text-[#F5F3EF]"
                      }`}
                    >
                      FEET (FT)
                    </button>
                    <button
                      type="button"
                      onClick={() => setPlotUnit("m")}
                      className={`px-3 py-1 rounded-full transition-all ${
                        plotUnit === "m"
                          ? "bg-[#C48446] text-[#0A0B0E] font-bold shadow-sm"
                          : "text-[#9E9C98] hover:text-[#F5F3EF]"
                      }`}
                    >
                      METERS (M)
                    </button>
                  </div>
                </div>

                {/* Length & Width Inputs */}
                <div className="grid grid-cols-2 gap-5 mb-5">
                  {/* Plot Width Input */}
                  <div className="flex flex-col">
                    <label className="text-[11px] font-mono text-[#9E9C98] mb-1.5 flex items-center justify-between">
                      <span>PLOT WIDTH ({plotUnit.toUpperCase()})</span>
                      <span className="text-[10px] text-[#6B6964]">Frontage</span>
                    </label>
                    <div className="flex items-center rounded-xl bg-[#0A0B0E] border border-white/10 focus-within:border-[#C48446] transition-colors p-1">
                      <button
                        type="button"
                        onClick={() => setPlotWidthInput((prev) => Math.max(1, prev - 1))}
                        className="w-9 h-9 rounded-lg bg-white/5 hover:bg-white/10 text-[#F5F3EF] flex items-center justify-center transition-colors"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <input
                        type="number"
                        min={1}
                        step={plotUnit === "m" ? 0.5 : 1}
                        value={plotWidthInput}
                        onChange={(e) => setPlotWidthInput(parseFloat(e.target.value) || 0)}
                        className="flex-1 bg-transparent text-center font-mono text-lg font-light text-[#F5F3EF] focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setPlotWidthInput((prev) => prev + 1)}
                        className="w-9 h-9 rounded-lg bg-white/5 hover:bg-white/10 text-[#F5F3EF] flex items-center justify-center transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Plot Length Input */}
                  <div className="flex flex-col">
                    <label className="text-[11px] font-mono text-[#9E9C98] mb-1.5 flex items-center justify-between">
                      <span>PLOT LENGTH ({plotUnit.toUpperCase()})</span>
                      <span className="text-[10px] text-[#6B6964]">Depth</span>
                    </label>
                    <div className="flex items-center rounded-xl bg-[#0A0B0E] border border-white/10 focus-within:border-[#C48446] transition-colors p-1">
                      <button
                        type="button"
                        onClick={() => setPlotLengthInput((prev) => Math.max(1, prev - 1))}
                        className="w-9 h-9 rounded-lg bg-white/5 hover:bg-white/10 text-[#F5F3EF] flex items-center justify-center transition-colors"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <input
                        type="number"
                        min={1}
                        step={plotUnit === "m" ? 0.5 : 1}
                        value={plotLengthInput}
                        onChange={(e) => setPlotLengthInput(parseFloat(e.target.value) || 0)}
                        className="flex-1 bg-transparent text-center font-mono text-lg font-light text-[#F5F3EF] focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setPlotLengthInput((prev) => prev + 1)}
                        className="w-9 h-9 rounded-lg bg-white/5 hover:bg-white/10 text-[#F5F3EF] flex items-center justify-center transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Inline Validation Warning */}
                {plotValidationError && (
                  <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-800/40 text-amber-300 text-xs font-mono flex items-center gap-2 mb-4">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                    <span>{plotValidationError}</span>
                  </div>
                )}

                {/* Aspect Ratio Note */}
                {plotAspectRatioNote && !plotValidationError && (
                  <div className="p-3 rounded-xl bg-blue-950/30 border border-blue-800/40 text-blue-300 text-xs font-mono flex items-center gap-2 mb-4">
                    <Info className="w-4 h-4 shrink-0 text-blue-400" />
                    <span>{plotAspectRatioNote}</span>
                  </div>
                )}

                {/* Quick Dimensions Chips */}
                <div>
                  <span className="text-[10px] font-mono text-[#6B6964] block mb-2">
                    COMMON DIMENSIONS (CLICK TO FILL):
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { label: "20 × 30 ft", w: 20, l: 30 },
                      { label: "25 × 40 ft", w: 25, l: 40 },
                      { label: "30 × 40 ft", w: 30, l: 40 },
                      { label: "35 × 50 ft", w: 35, l: 50 },
                      { label: "40 × 60 ft", w: 40, l: 60 },
                      { label: "45 × 70 ft", w: 45, l: 70 },
                    ].map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => {
                          setPlotUnit("ft");
                          setPlotWidthInput(item.w);
                          setPlotLengthInput(item.l);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 text-[11px] font-mono text-[#9E9C98] hover:text-[#F5F3EF] transition-all"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Step 1 Continue Button */}
              <button
                onClick={handleNext}
                disabled={Boolean(plotValidationError)}
                className={`px-8 py-3.5 rounded-full font-medium text-xs tracking-widest transition-all duration-200 flex items-center gap-2 group ${
                  plotValidationError
                    ? "bg-white/10 text-[#6B6964] cursor-not-allowed"
                    : "bg-[#F5F3EF] text-[#0A0B0E] hover:bg-[#E8E4DC] shadow-xl shadow-white/5"
                }`}
              >
                <span>CONTINUE</span>
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
              </button>
            </motion.div>
          )}

          {/* STEP 2: FAMILIES */}
          {step === 2 && (
            <motion.div
              key="step-2"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.28 }}
              className="w-full flex flex-col items-center text-center"
            >
              <span className="text-xs font-mono tracking-widest text-[#C48446] uppercase mb-2">
                02 — HOUSEHOLD CONFIGURATION
              </span>
              <h2 className="text-3xl md:text-4xl font-serif font-light tracking-tight text-[#F5F3EF] mb-3">
                How many families will live here?
              </h2>
              <p className="text-sm text-[#9E9C98] max-w-md mb-10">
                Determines multi-generational zoning, privacy separation, and shared social areas.
              </p>

              <div className="grid grid-cols-3 gap-5 w-full max-w-xl mb-10">
                {(["1", "2", "3+"] as const).map((count) => {
                  const isSelected = families === count;
                  return (
                    <button
                      key={count}
                      onClick={() => setFamilies(count)}
                      className={`p-8 rounded-2xl border text-center transition-all duration-200 flex flex-col items-center justify-center gap-3 ${
                        isSelected
                          ? "bg-[#1A1D24] border-[#C48446] text-[#F5F3EF] shadow-xl shadow-[#C48446]/10 scale-105"
                          : "bg-[#12141A]/80 border-white/10 text-[#9E9C98] hover:border-white/20 hover:text-[#F5F3EF]"
                      }`}
                    >
                      <span className="text-4xl font-serif font-light">{count}</span>
                      <span className="text-xs font-mono tracking-wider uppercase">
                        {count === "1" ? "Nuclear" : count === "2" ? "Joint" : "Multi-Gen"}
                      </span>
                    </button>
                  );
                })}
              </div>

              <button
                onClick={handleNext}
                className="px-8 py-3.5 rounded-full bg-[#F5F3EF] text-[#0A0B0E] hover:bg-[#E8E4DC] font-medium text-xs tracking-widest transition-all duration-200 flex items-center gap-2 group"
              >
                <span>CONTINUE</span>
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
              </button>
            </motion.div>
          )}

          {/* STEP 3: KIDS */}
          {step === 3 && (
            <motion.div
              key="step-3"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.28 }}
              className="w-full flex flex-col items-center text-center"
            >
              <span className="text-xs font-mono tracking-widest text-[#C48446] uppercase mb-2">
                03 — RESIDENT CHILDREN
              </span>
              <h2 className="text-3xl md:text-4xl font-serif font-light tracking-tight text-[#F5F3EF] mb-3">
                How many kids will live here?
              </h2>
              <p className="text-sm text-[#9E9C98] max-w-md mb-10">
                Informs playroom placement, study sanctuaries, and bedroom zoning proximity.
              </p>

              <div className="grid grid-cols-4 gap-4 w-full max-w-xl mb-10">
                {(["0", "1", "2", "3+"] as const).map((count) => {
                  const isSelected = kids === count;
                  return (
                    <button
                      key={count}
                      onClick={() => setKids(count)}
                      className={`p-6 rounded-2xl border text-center transition-all duration-200 flex flex-col items-center justify-center gap-2 ${
                        isSelected
                          ? "bg-[#1A1D24] border-[#C48446] text-[#F5F3EF] shadow-xl shadow-[#C48446]/10 scale-105"
                          : "bg-[#12141A]/80 border-white/10 text-[#9E9C98] hover:border-white/20 hover:text-[#F5F3EF]"
                      }`}
                    >
                      <span className="text-3xl font-serif font-light">{count}</span>
                      <span className="text-[10px] font-mono tracking-wider uppercase">
                        {count === "0" ? "None" : count === "1" ? "Child" : "Children"}
                      </span>
                    </button>
                  );
                })}
              </div>

              <button
                onClick={handleNext}
                className="px-8 py-3.5 rounded-full bg-[#F5F3EF] text-[#0A0B0E] hover:bg-[#E8E4DC] font-medium text-xs tracking-widest transition-all duration-200 flex items-center gap-2 group"
              >
                <span>CONTINUE</span>
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
              </button>
            </motion.div>
          )}

          {/* STEP 4: BEDROOMS */}
          {step === 4 && (
            <motion.div
              key="step-4"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.28 }}
              className="w-full flex flex-col items-center text-center"
            >
              <span className="text-xs font-mono tracking-widest text-[#C48446] uppercase mb-2">
                04 — BEDROOM PROGRAM
              </span>
              <h2 className="text-3xl md:text-4xl font-serif font-light tracking-tight text-[#F5F3EF] mb-3">
                How many bedrooms do you need?
              </h2>
              <p className="text-sm text-[#9E9C98] max-w-md mb-10">
                Primary Master Suite plus additional guest, children, or elder care suites.
              </p>

              <div className="grid grid-cols-5 gap-3 w-full max-w-2xl mb-10">
                {[1, 2, 3, 4, 5].map((num) => {
                  const isSelected = bedrooms === num;
                  return (
                    <button
                      key={num}
                      onClick={() => setBedrooms(num)}
                      className={`p-6 rounded-2xl border text-center transition-all duration-200 flex flex-col items-center justify-center gap-2 ${
                        isSelected
                          ? "bg-[#1A1D24] border-[#C48446] text-[#F5F3EF] shadow-xl shadow-[#C48446]/10 scale-105"
                          : "bg-[#12141A]/80 border-white/10 text-[#9E9C98] hover:border-white/20 hover:text-[#F5F3EF]"
                      }`}
                    >
                      <span className="text-3xl font-serif font-light">{num}</span>
                      <span className="text-[10px] font-mono tracking-wider uppercase">
                        {num === 1 ? "Studio" : `${num} BHK`}
                      </span>
                    </button>
                  );
                })}
              </div>

              <button
                onClick={handleNext}
                className="px-8 py-3.5 rounded-full bg-[#F5F3EF] text-[#0A0B0E] hover:bg-[#E8E4DC] font-medium text-xs tracking-widest transition-all duration-200 flex items-center gap-2 group"
              >
                <span>CONTINUE</span>
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
              </button>
            </motion.div>
          )}

          {/* STEP 5: ATTACHED BATHROOMS */}
          {step === 5 && (
            <motion.div
              key="step-5"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.28 }}
              className="w-full flex flex-col items-center text-center"
            >
              <span className="text-xs font-mono tracking-widest text-[#C48446] uppercase mb-2">
                05 — EN-SUITE PRIVACY
              </span>
              <h2 className="text-3xl md:text-4xl font-serif font-light tracking-tight text-[#F5F3EF] mb-3">
                How many attached bathrooms?
              </h2>
              <p className="text-sm text-[#9E9C98] max-w-md mb-10">
                Direct en-suite access balances plumbing shaft efficiency with acoustic privacy.
              </p>

              <div className="grid grid-cols-5 gap-3 w-full max-w-2xl mb-10">
                {(["None", "1", "2", "3", "All"] as const).map((opt) => {
                  const isSelected = attachedBaths === opt;
                  return (
                    <button
                      key={opt}
                      onClick={() => setAttachedBaths(opt)}
                      className={`p-6 rounded-2xl border text-center transition-all duration-200 flex flex-col items-center justify-center gap-2 ${
                        isSelected
                          ? "bg-[#1A1D24] border-[#C48446] text-[#F5F3EF] shadow-xl shadow-[#C48446]/10 scale-105"
                          : "bg-[#12141A]/80 border-white/10 text-[#9E9C98] hover:border-white/20 hover:text-[#F5F3EF]"
                      }`}
                    >
                      <span className="text-2xl font-serif font-light">{opt}</span>
                      <span className="text-[10px] font-mono tracking-wider uppercase">
                        {opt === "None" ? "Powder only" : opt === "All" ? "Every Bed" : "En-suite"}
                      </span>
                    </button>
                  );
                })}
              </div>

              <button
                onClick={handleNext}
                className="px-8 py-3.5 rounded-full bg-[#F5F3EF] text-[#0A0B0E] hover:bg-[#E8E4DC] font-medium text-xs tracking-widest transition-all duration-200 flex items-center gap-2 group"
              >
                <span>CONTINUE</span>
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
              </button>
            </motion.div>
          )}

          {/* STEP 6: CHILDREN'S QUARTERS */}
          {step === 6 && (
            <motion.div
              key="step-6"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.28 }}
              className="w-full flex flex-col items-center text-center"
            >
              <span className="text-xs font-mono tracking-widest text-[#C48446] uppercase mb-2">
                06 — CHILDREN&apos;S QUARTERS
              </span>
              <h2 className="text-3xl md:text-4xl font-serif font-light tracking-tight text-[#F5F3EF] mb-3">
                Separate bedrooms for children?
              </h2>
              <p className="text-sm text-[#9E9C98] max-w-md mb-10">
                Individual private rooms for focus and age growth, or interconnected shared suite.
              </p>

              <div className="grid grid-cols-3 gap-5 w-full max-w-xl mb-10">
                {(["Yes", "No", "Let AI decide"] as const).map((opt) => {
                  const isSelected = separateKidsBedrooms === opt;
                  return (
                    <button
                      key={opt}
                      onClick={() => setSeparateKidsBedrooms(opt)}
                      className={`p-8 rounded-2xl border text-center transition-all duration-200 flex flex-col items-center justify-center gap-2 ${
                        isSelected
                          ? "bg-[#1A1D24] border-[#C48446] text-[#F5F3EF] shadow-xl shadow-[#C48446]/10 scale-105"
                          : "bg-[#12141A]/80 border-white/10 text-[#9E9C98] hover:border-white/20 hover:text-[#F5F3EF]"
                      }`}
                    >
                      <span className="text-xl font-serif font-light">{opt}</span>
                      <span className="text-[10px] font-mono tracking-wider uppercase">
                        {opt === "Yes" ? "Individual" : opt === "No" ? "Shared Suite" : "Optimal"}
                      </span>
                    </button>
                  );
                })}
              </div>

              <button
                onClick={handleNext}
                className="px-8 py-3.5 rounded-full bg-[#F5F3EF] text-[#0A0B0E] hover:bg-[#E8E4DC] font-medium text-xs tracking-widest transition-all duration-200 flex items-center gap-2 group"
              >
                <span>CONTINUE</span>
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
              </button>
            </motion.div>
          )}

          {/* STEP 7: LEVELS & VERTICALITY */}
          {step === 7 && (
            <motion.div
              key="step-7"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.28 }}
              className="w-full flex flex-col items-center text-center"
            >
              <span className="text-xs font-mono tracking-widest text-[#C48446] uppercase mb-2">
                07 — BUILDING ELEVATION
              </span>
              <h2 className="text-3xl md:text-4xl font-serif font-light tracking-tight text-[#F5F3EF] mb-3">
                How many levels or floors?
              </h2>
              <p className="text-sm text-[#9E9C98] max-w-md mb-8">
                Distributes horizontal footprint vertically, freeing site area for parking and gardens.
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 w-full max-w-2xl mb-8">
                {(["Ground", "Ground + 1", "Ground + 2", "Ground + 3"] as const).map((fl) => {
                  const isSelected = floors === fl;
                  return (
                    <button
                      key={fl}
                      onClick={() => setFloors(fl)}
                      className={`p-6 rounded-2xl border text-center transition-all duration-200 flex flex-col items-center justify-center gap-2 ${
                        isSelected
                          ? "bg-[#1A1D24] border-[#C48446] text-[#F5F3EF] shadow-xl shadow-[#C48446]/10 scale-105"
                          : "bg-[#12141A]/80 border-white/10 text-[#9E9C98] hover:border-white/20 hover:text-[#F5F3EF]"
                      }`}
                    >
                      <Layers className={`w-5 h-5 ${isSelected ? "text-[#C48446]" : "text-[#9E9C98]"}`} />
                      <span className="text-lg font-serif font-light">{fl}</span>
                      <span className="text-[10px] font-mono tracking-wider uppercase">
                        {fl === "Ground"
                          ? "Single Story"
                          : fl === "Ground + 1"
                          ? "2 Floors (Duplex)"
                          : fl === "Ground + 2"
                          ? "3 Floors (Triplex)"
                          : "4 Floors"}
                      </span>
                    </button>
                  );
                })}
              </div>

              <button
                onClick={handleNext}
                className="px-8 py-3.5 rounded-full bg-[#F5F3EF] text-[#0A0B0E] hover:bg-[#E8E4DC] font-medium text-xs tracking-widest transition-all duration-200 flex items-center gap-2 group"
              >
                <span>CONTINUE</span>
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
              </button>
            </motion.div>
          )}

          {/* STEP 8: ORIENTATION */}
          {step === 8 && (
            <motion.div
              key="step-8"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.28 }}
              className="w-full flex flex-col items-center text-center"
            >
              <span className="text-xs font-mono tracking-widest text-[#C48446] uppercase mb-2">
                08 — SOLAR FRONTAGE
              </span>
              <h2 className="text-3xl md:text-4xl font-serif font-light tracking-tight text-[#F5F3EF] mb-3">
                Road and solar frontage
              </h2>
              <p className="text-sm text-[#9E9C98] max-w-md mb-10">
                Facing direction coordinates entrance foyer, natural daylight, and cross-ventilation.
              </p>

              <div className="grid grid-cols-5 gap-3 w-full max-w-2xl mb-10">
                {(["North", "South", "East", "West", "Doesn't matter"] as const).map((dir) => {
                  const isSelected = orientation === dir;
                  return (
                    <button
                      key={dir}
                      onClick={() => setOrientation(dir)}
                      className={`p-6 rounded-2xl border text-center transition-all duration-200 flex flex-col items-center justify-center gap-2 ${
                        isSelected
                          ? "bg-[#1A1D24] border-[#C48446] text-[#F5F3EF] shadow-xl shadow-[#C48446]/10 scale-105"
                          : "bg-[#12141A]/80 border-white/10 text-[#9E9C98] hover:border-white/20 hover:text-[#F5F3EF]"
                      }`}
                    >
                      <Compass className={`w-5 h-5 ${isSelected ? "text-[#C48446]" : "text-[#9E9C98]"}`} />
                      <span className="text-lg font-serif font-light">{dir}</span>
                      <span className="text-[10px] font-mono tracking-wider uppercase">
                        {dir === "North" ? "Soft Light" : dir === "East" ? "Morning Sun" : "Orientation"}
                      </span>
                    </button>
                  );
                })}
              </div>

              <button
                onClick={handleNext}
                className="px-8 py-3.5 rounded-full bg-[#F5F3EF] text-[#0A0B0E] hover:bg-[#E8E4DC] font-medium text-xs tracking-widest transition-all duration-200 flex items-center gap-2 group"
              >
                <span>CONTINUE</span>
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
              </button>
            </motion.div>
          )}

          {/* STEP 9: PARKING */}
          {step === 9 && (
            <motion.div
              key="step-9"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.28 }}
              className="w-full flex flex-col items-center text-center"
            >
              <span className="text-xs font-mono tracking-widest text-[#C48446] uppercase mb-2">
                09 — VEHICULAR ACCESS
              </span>
              <h2 className="text-3xl md:text-4xl font-serif font-light tracking-tight text-[#F5F3EF] mb-3">
                Vehicular parking requirements
              </h2>
              <p className="text-sm text-[#9E9C98] max-w-md mb-10">
                Designates covered pergola or garage bay, turning radiuses, and curb cuts.
              </p>

              <div className="grid grid-cols-3 gap-5 w-full max-w-xl mb-10">
                {(["No parking", "1 car", "2 cars"] as const).map((opt) => {
                  const isSelected = parking === opt;
                  return (
                    <button
                      key={opt}
                      onClick={() => setParking(opt)}
                      className={`p-8 rounded-2xl border text-center transition-all duration-200 flex flex-col items-center justify-center gap-3 ${
                        isSelected
                          ? "bg-[#1A1D24] border-[#C48446] text-[#F5F3EF] shadow-xl shadow-[#C48446]/10 scale-105"
                          : "bg-[#12141A]/80 border-white/10 text-[#9E9C98] hover:border-white/20 hover:text-[#F5F3EF]"
                      }`}
                    >
                      <Car className={`w-6 h-6 ${isSelected ? "text-[#C48446]" : "text-[#9E9C98]"}`} />
                      <span className="text-2xl font-serif font-light">{opt}</span>
                      <span className="text-[10px] font-mono tracking-wider uppercase">
                        {opt === "No parking" ? "Pedestrian Only" : opt === "1 car" ? "Single Bay" : "Double Bay"}
                      </span>
                    </button>
                  );
                })}
              </div>

              <button
                onClick={handleNext}
                className="px-8 py-3.5 rounded-full bg-[#F5F3EF] text-[#0A0B0E] hover:bg-[#E8E4DC] font-medium text-xs tracking-widest transition-all duration-200 flex items-center gap-2 group"
              >
                <span>CONTINUE</span>
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
              </button>
            </motion.div>
          )}

          {/* STEP 10: ARCHITECTURAL STYLE */}
          {step === 10 && (
            <motion.div
              key="step-10"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.28 }}
              className="w-full flex flex-col items-center text-center"
            >
              <span className="text-xs font-mono tracking-widest text-[#C48446] uppercase mb-2">
                10 — DESIGN LANGUAGE
              </span>
              <h2 className="text-3xl md:text-4xl font-serif font-light tracking-tight text-[#F5F3EF] mb-3">
                Preferred architectural style
              </h2>
              <p className="text-sm text-[#9E9C98] max-w-md mb-10">
                Dictates interior finishes, facade textures, glazing expanses, and volumetric proportions.
              </p>

              <div className="grid grid-cols-5 gap-3 w-full max-w-2xl mb-10">
                {(["Modern", "Minimal", "Traditional", "Luxury", "Let AI decide"] as const).map((st) => {
                  const isSelected = style === st;
                  return (
                    <button
                      key={st}
                      onClick={() => setStyle(st)}
                      className={`p-6 rounded-2xl border text-center transition-all duration-200 flex flex-col items-center justify-center gap-2 ${
                        isSelected
                          ? "bg-[#1A1D24] border-[#C48446] text-[#F5F3EF] shadow-xl shadow-[#C48446]/10 scale-105"
                          : "bg-[#12141A]/80 border-white/10 text-[#9E9C98] hover:border-white/20 hover:text-[#F5F3EF]"
                      }`}
                    >
                      <Home className={`w-5 h-5 ${isSelected ? "text-[#C48446]" : "text-[#9E9C98]"}`} />
                      <span className="text-lg font-serif font-light">{st}</span>
                      <span className="text-[10px] font-mono tracking-wider uppercase">
                        {st === "Let AI decide" ? "Contextual" : st}
                      </span>
                    </button>
                  );
                })}
              </div>

              <button
                onClick={handleNext}
                className="px-8 py-3.5 rounded-full bg-[#F5F3EF] text-[#0A0B0E] hover:bg-[#E8E4DC] font-medium text-xs tracking-widest transition-all duration-200 flex items-center gap-2 group"
              >
                <span>CONTINUE</span>
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
              </button>
            </motion.div>
          )}

          {/* STEP 11: ADDITIONAL SPACES */}
          {step === 11 && (
            <motion.div
              key="step-11"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.28 }}
              className="w-full flex flex-col items-center text-center"
            >
              <span className="text-xs font-mono tracking-widest text-[#C48446] uppercase mb-2">
                11 — SPECIALIZED PROGRAM
              </span>
              <h2 className="text-3xl md:text-4xl font-serif font-light tracking-tight text-[#F5F3EF] mb-3">
                Additional specialized spaces
              </h2>
              <p className="text-sm text-[#9E9C98] max-w-md mb-8">
                Select custom functional rooms to synthesize into the residence program.
              </p>

              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3.5 w-full max-w-xl mb-10">
                {[
                  "Kitchen",
                  "Dining",
                  "Pooja room",
                  "Study",
                  "Garden",
                  "Balcony",
                  "Home Theater",
                  "Utility",
                ].map((space) => {
                  const isSelected = additionalSpaces.includes(space);
                  return (
                    <button
                      key={space}
                      onClick={() => toggleAdditionalSpace(space)}
                      className={`p-4 rounded-xl border text-center transition-all duration-200 flex items-center justify-between gap-2 ${
                        isSelected
                          ? "bg-[#1A1D24] border-[#C48446] text-[#F5F3EF]"
                          : "bg-[#12141A]/70 border-white/10 text-[#9E9C98] hover:border-white/20"
                      }`}
                    >
                      <span className="text-xs font-medium tracking-wide">{space}</span>
                      <div
                        className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                          isSelected
                            ? "border-[#C48446] bg-[#C48446] text-[#0A0B0E]"
                            : "border-white/20"
                        }`}
                      >
                        {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                      </div>
                    </button>
                  );
                })}
              </div>

              <button
                onClick={handleNext}
                className="px-8 py-3.5 rounded-full bg-[#F5F3EF] text-[#0A0B0E] hover:bg-[#E8E4DC] font-medium text-xs tracking-widest transition-all duration-200 flex items-center gap-2 group"
              >
                <span>CONFIGURE ROOM SIZES & ALLOCATION</span>
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
              </button>
            </motion.div>
          )}

          {/* STEP 12: ROOM SIZES (MANUAL VS AI RECOMMENDED) & ALLOCATION */}
          {step === 12 && (
            <motion.div
              key="step-12"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.28 }}
              className="w-full max-w-5xl flex flex-col items-center text-center"
            >
              <span className="text-xs font-mono tracking-widest text-[#C48446] uppercase mb-2">
                12 — ROOM SIZES & ALLOCATION
              </span>
              <h2 className="text-3xl md:text-4xl font-serif font-light tracking-tight text-[#F5F3EF] mb-2">
                Room Dimensions & Vertical Allocation
              </h2>
              <p className="text-sm text-[#9E9C98] max-w-xl mb-6">
                Choose whether each room uses exact manual dimensions or intelligent AI recommendation
                adapted to your {plotWidthInFt} × {plotLengthInFt} ft plot.
              </p>

              {/* ACTION TOOLBAR: GET AI RECOMMENDATIONS & BATCH PRESETS */}
              <div className="w-full flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-[#12141A]/90 border border-white/10 mb-6 backdrop-blur-md">
                <button
                  type="button"
                  onClick={handleGetAIRecommendations}
                  disabled={isLoadingRecommendations}
                  className="px-5 py-2.5 rounded-xl bg-[#C48446] text-[#0A0B0E] hover:bg-[#D49354] text-xs font-mono font-semibold tracking-wider transition-all flex items-center gap-2 shadow-lg shadow-[#C48446]/20 disabled:opacity-60"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>
                    {isLoadingRecommendations ? "ANALYZING PLOT..." : "GET AI RECOMMENDATIONS"}
                  </span>
                </button>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-[#9E9C98]">QUICK SIZING PRESETS:</span>
                  {(["compact", "standard", "spacious"] as const).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => applyGlobalPreset(preset)}
                      className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-mono text-[#9E9C98] hover:text-[#F5F3EF] transition-all capitalize"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* FEASIBILITY ANALYSIS BANNER */}
              <div
                className={`w-full p-4 rounded-2xl border text-left mb-6 flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                  feasibilityData.status === "comfortable"
                    ? "bg-emerald-950/20 border-emerald-800/40 text-emerald-200"
                    : feasibilityData.status === "tight"
                    ? "bg-amber-950/20 border-amber-800/40 text-amber-200"
                    : "bg-rose-950/20 border-rose-800/40 text-rose-200"
                }`}
              >
                <div className="flex items-start gap-3">
                  {feasibilityData.status === "comfortable" ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono font-semibold uppercase tracking-wider">
                        FEASIBILITY // {feasibilityData.status.toUpperCase().replace("_", " ")}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/10">
                        {feasibilityData.coveragePct}% Ground Coverage
                      </span>
                    </div>
                    <p className="text-xs opacity-90">{feasibilityData.message}</p>
                    <p className="text-[11px] font-mono text-[#C48446] mt-1">
                      {feasibilityData.recommendation}
                    </p>
                  </div>
                </div>

                <div className="text-right font-mono text-[11px] opacity-80 shrink-0">
                  <div>Envelope: {feasibilityData.buildableGroundArea} sq ft</div>
                  <div>Ground Req: {feasibilityData.totalGroundReq} sq ft</div>
                </div>
              </div>

              {/* AI STRATEGY OPTIONS (IF PROVIDED) */}
              {strategies.length > 0 && (
                <div className="w-full mb-6 text-left">
                  <span className="text-[11px] font-mono text-[#9E9C98] block mb-2">
                    RECOMMENDED ARCHITECTURAL STRATEGIES (CLICK TO APPLY):
                  </span>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {strategies.map((strat) => (
                      <button
                        key={strat.id}
                        type="button"
                        onClick={() => applyStrategy(strat)}
                        className="p-3.5 rounded-xl bg-[#12141A]/90 hover:bg-[#1A1D24] border border-white/10 hover:border-[#C48446]/60 transition-all text-left flex flex-col justify-between gap-2 group"
                      >
                        <div>
                          <span className="text-xs font-semibold text-[#F5F3EF] group-hover:text-[#C48446] block mb-1">
                            {strat.title}
                          </span>
                          <p className="text-[11px] text-[#9E9C98] line-clamp-2">
                            {strat.description}
                          </p>
                        </div>
                        <span className="text-[10px] font-mono text-[#C48446]">
                          {strat.recommended_floors} Floors · {strat.feasibility_status.toUpperCase()}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ROOMS TABLE & DIMENSION CONTROLS */}
              <div className="w-full space-y-3 mb-8 text-left">
                {roomAllocations.map((room) => {
                  const areaSqFt = Math.round(room.width * room.length);
                  return (
                    <div
                      key={room.id}
                      className="p-4 rounded-2xl bg-[#12141A]/90 border border-white/10 hover:border-white/20 transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                    >
                      {/* Room Info & Quantity */}
                      <div className="flex items-center gap-3 min-w-[200px]">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-sm font-medium text-[#F5F3EF]">{room.name}</span>
                            <span className="text-[9px] font-mono px-2 py-0.5 rounded uppercase border bg-white/5 border-white/10 text-[#9E9C98]">
                              {room.zone}
                            </span>
                          </div>
                          <span className="text-[11px] font-mono text-[#C48446]">
                            {areaSqFt} SQ FT ({room.width}&apos; × {room.length}&apos;)
                          </span>
                        </div>

                        {/* Quantity Counter */}
                        <div className="flex items-center gap-1 bg-[#0A0B0E] p-1 rounded-xl border border-white/10 ml-auto lg:ml-2">
                          <button
                            type="button"
                            onClick={() => updateRoomQuantity(room.id, -1)}
                            disabled={(room.quantity || 1) <= 1}
                            className="w-6 h-6 rounded-lg bg-white/5 hover:bg-white/10 text-[#9E9C98] hover:text-[#F5F3EF] flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Decrease quantity"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="font-mono text-xs font-semibold px-1 text-[#F5F3EF] min-w-[18px] text-center">
                            {room.quantity || 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateRoomQuantity(room.id, 1)}
                            disabled={(room.quantity || 1) >= 10}
                            className="w-6 h-6 rounded-lg bg-white/5 hover:bg-white/10 text-[#9E9C98] hover:text-[#F5F3EF] flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Increase quantity"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      {/* Size Mode Switcher (MANUAL vs AI RECOMMEND) */}
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="inline-flex rounded-full p-1 bg-[#0A0B0E] border border-white/10 text-[11px] font-mono">
                          <button
                            type="button"
                            onClick={() => toggleRoomSizeMode(room.id)}
                            className={`px-3 py-1 rounded-full transition-all ${
                              room.sizeMode === "ai_recommended"
                                ? "bg-[#C48446] text-[#0A0B0E] font-bold shadow-sm"
                                : "text-[#9E9C98] hover:text-[#F5F3EF]"
                            }`}
                          >
                            AI RECOMMEND
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleRoomSizeMode(room.id)}
                            className={`px-3 py-1 rounded-full transition-all ${
                              room.sizeMode === "manual"
                                ? "bg-white/20 text-[#F5F3EF] font-bold"
                                : "text-[#9E9C98] hover:text-[#F5F3EF]"
                            }`}
                          >
                            MANUAL
                          </button>
                        </div>

                        {/* Dimension Inputs or Recommendation Display */}
                        {room.sizeMode === "manual" ? (
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1.5 bg-[#0A0B0E] px-2.5 py-1 rounded-xl border border-white/10">
                              <span className="text-[10px] font-mono text-[#6B6964]">W:</span>
                              <input
                                type="number"
                                min={3}
                                step={0.5}
                                value={room.width}
                                onChange={(e) =>
                                  updateRoomDimensions(
                                    room.id,
                                    parseFloat(e.target.value) || 3,
                                    room.length
                                  )
                                }
                                className="w-12 bg-transparent text-center font-mono text-xs text-[#F5F3EF] focus:outline-none"
                              />
                              <span className="text-[10px] font-mono text-[#6B6964]">ft</span>
                            </div>

                            <span className="text-xs text-[#6B6964]">×</span>

                            <div className="flex items-center gap-1.5 bg-[#0A0B0E] px-2.5 py-1 rounded-xl border border-white/10">
                              <span className="text-[10px] font-mono text-[#6B6964]">L:</span>
                              <input
                                type="number"
                                min={3}
                                step={0.5}
                                value={room.length}
                                onChange={(e) =>
                                  updateRoomDimensions(
                                    room.id,
                                    room.width,
                                    parseFloat(e.target.value) || 3
                                  )
                                }
                                className="w-12 bg-transparent text-center font-mono text-xs text-[#F5F3EF] focus:outline-none"
                              />
                              <span className="text-[10px] font-mono text-[#6B6964]">ft</span>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-xs font-mono text-[#9E9C98] bg-white/[0.03] px-3 py-1 rounded-xl border border-white/5">
                            <span>
                              Recommended: {room.width}&apos; × {room.length}&apos;
                            </span>
                            <button
                              type="button"
                              onClick={() => toggleRoomSizeMode(room.id)}
                              className="text-[#C48446] hover:underline text-[10px] ml-1"
                            >
                              EDIT
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Floor Assignment & Remove Room */}
                      <div className="flex items-center gap-3 shrink-0 ml-auto lg:ml-0">
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] font-mono text-[#6B6964] mr-1">FLOOR:</span>
                          {Array.from({ length: numFloorsCount }, (_, fIdx) => fIdx + 1).map((f) => {
                            const isAssigned = room.floorNumber === f;
                            const label = f === 1 ? "G" : `L${f}`;
                            return (
                              <button
                                key={f}
                                type="button"
                                onClick={() => moveRoomToFloor(room.id, f)}
                                className={`w-7 h-7 rounded-lg text-xs font-mono transition-all flex items-center justify-center ${
                                  isAssigned
                                    ? "bg-[#C48446] text-[#0A0B0E] font-bold shadow-sm"
                                    : "bg-white/5 hover:bg-white/10 text-[#9E9C98]"
                                }`}
                                title={`Assign to ${f === 1 ? "Ground Floor" : `Level ${f}`}`}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>

                        {/* Remove Room Button */}
                        <button
                          type="button"
                          onClick={() => removeRoom(room.id)}
                          disabled={roomAllocations.length <= 1}
                          className="p-1.5 text-[#9E9C98] hover:text-red-400 hover:bg-red-950/20 rounded-xl transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                          title="Remove Room"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}

                {/* + Add Room Button and Dropdown */}
                <div className="pt-2">
                  {!isAddRoomPickerOpen ? (
                    <button
                      type="button"
                      onClick={() => setIsAddRoomPickerOpen(true)}
                      className="w-full py-3.5 rounded-2xl border border-dashed border-white/20 hover:border-[#C48446] text-[#9E9C98] hover:text-[#C48446] bg-white/[0.02] hover:bg-white/[0.05] transition-all flex items-center justify-center gap-2 font-mono text-xs font-semibold tracking-wider uppercase"
                    >
                      <Plus className="w-4 h-4" />
                      <span>+ ADD ROOM ({ALL_SUPPORTED_ROOM_TYPES.length} TYPES AVAILABLE)</span>
                    </button>
                  ) : (
                    <div className="p-5 rounded-2xl bg-[#0A0B0E] border border-[#C48446]/40 shadow-2xl backdrop-blur-md">
                      <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/10">
                        <span className="text-xs font-mono font-semibold tracking-wider text-[#C48446] uppercase flex items-center gap-2">
                          <Building2 className="w-4 h-4" />
                          <span>Select Room Type to Add</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setIsAddRoomPickerOpen(false);
                            setIsAddingCustom(false);
                          }}
                          className="text-[#9E9C98] hover:text-[#F5F3EF] p-1 rounded-lg hover:bg-white/5"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      {isAddingCustom ? (
                        <div className="flex flex-col sm:flex-row items-center gap-3">
                          <input
                            type="text"
                            placeholder="Enter custom room name (e.g. Yoga Studio, Library...)"
                            value={customRoomNameInput}
                            onChange={(e) => setCustomRoomNameInput(e.target.value)}
                            className="flex-1 w-full bg-white/5 border border-white/15 rounded-xl px-4 py-2.5 text-xs font-mono text-[#F5F3EF] focus:outline-none focus:border-[#C48446]"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                addRoom("custom", customRoomNameInput.trim() || "Custom Room");
                              }
                            }}
                          />
                          <div className="flex items-center gap-2 w-full sm:w-auto">
                            <button
                              type="button"
                              onClick={() => addRoom("custom", customRoomNameInput.trim() || "Custom Room")}
                              className="flex-1 sm:flex-initial px-5 py-2.5 rounded-xl bg-[#C48446] text-[#0A0B0E] font-mono text-xs font-bold hover:bg-[#D49354] transition-all"
                            >
                              Add Custom Room
                            </button>
                            <button
                              type="button"
                              onClick={() => setIsAddingCustom(false)}
                              className="px-4 py-2.5 rounded-xl bg-white/5 text-[#9E9C98] font-mono text-xs hover:text-[#F5F3EF]"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
                          {ALL_SUPPORTED_ROOM_TYPES.map((rt) => (
                            <button
                              key={rt.type}
                              type="button"
                              onClick={() => {
                                if (rt.type === "custom") {
                                  setIsAddingCustom(true);
                                } else {
                                  addRoom(rt.type);
                                }
                              }}
                              className="p-3 rounded-xl bg-white/5 hover:bg-[#1A1D24] hover:border-[#C48446]/60 border border-white/5 text-left transition-all group flex flex-col justify-between"
                            >
                              <span className="text-xs font-medium text-[#F5F3EF] group-hover:text-[#C48446] block truncate">
                                {rt.name}
                              </span>
                              <span className="text-[9px] font-mono text-[#6B6964] uppercase block mt-1">
                                {rt.zone}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Step 12 Action Button */}
              <button
                onClick={handleNext}
                className="px-8 py-3.5 rounded-full bg-[#F5F3EF] text-[#0A0B0E] hover:bg-[#E8E4DC] font-medium text-xs tracking-widest transition-all duration-200 flex items-center gap-2 group"
              >
                <span>REVIEW BRIEF & PROGRAM</span>
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
              </button>
            </motion.div>
          )}

          {/* FINAL STEP 13: YOUR HOME BRIEF & BUILDING PROGRAM */}
          {step === 13 && (
            <motion.div
              key="step-13"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.28 }}
              className="w-full max-w-3xl flex flex-col items-center text-center"
            >
              <span className="text-xs font-mono tracking-widest text-[#C48446] uppercase mb-2">
                FINAL BRIEF // ATELIER CONSULTATION
              </span>
              <h2 className="text-3xl md:text-4xl font-serif font-light tracking-tight text-[#F5F3EF] mb-3">
                YOUR HOME BRIEF & BUILDING PROGRAM
              </h2>
              <p className="text-sm text-[#9E9C98] max-w-md mb-8">
                Your bespoke architectural specifications and vertical floor program. Tap any item to revise
                before generation.
              </p>

              {/* Brief Specification Grid */}
              <div className="w-full rounded-2xl bg-[#12141A]/90 border border-white/10 p-6 backdrop-blur-md mb-8 text-left divide-y divide-white/5">
                {/* 01. Plot */}
                <div className="flex items-center justify-between py-3">
                  <div>
                    <span className="text-[10px] font-mono tracking-widest text-[#9E9C98] block">
                      01. PLOT BOUNDARY & AREA
                    </span>
                    <span className="text-sm font-medium text-[#F5F3EF]">
                      {plotWidthInput} × {plotLengthInput} {plotUnit.toUpperCase()} ({plotAreaDisplay})
                    </span>
                  </div>
                  <button
                    onClick={() => jumpToStep(1)}
                    className="text-[#C48446] text-xs font-mono flex items-center gap-1 hover:underline"
                  >
                    <span>EDIT</span> <Edit3 className="w-3 h-3" />
                  </button>
                </div>

                {/* 02. Household */}
                <div className="flex items-center justify-between py-3">
                  <div>
                    <span className="text-[10px] font-mono tracking-widest text-[#9E9C98] block">
                      02. HOUSEHOLD & KIDS
                    </span>
                    <span className="text-sm font-medium text-[#F5F3EF]">
                      {families} {families === "1" ? "Family" : "Families"} · {kids}{" "}
                      {kids === "1" ? "Child" : "Kids"}
                    </span>
                  </div>
                  <button
                    onClick={() => jumpToStep(2)}
                    className="text-[#C48446] text-xs font-mono flex items-center gap-1 hover:underline"
                  >
                    <span>EDIT</span> <Edit3 className="w-3 h-3" />
                  </button>
                </div>

                {/* 03. Bedrooms */}
                <div className="flex items-center justify-between py-3">
                  <div>
                    <span className="text-[10px] font-mono tracking-widest text-[#9E9C98] block">
                      03. BEDROOM PROGRAM
                    </span>
                    <span className="text-sm font-medium text-[#F5F3EF]">
                      {bedrooms} Bedrooms (
                      {attachedBaths === "All" ? "All Attached Baths" : `${attachedBaths} Attached`})
                    </span>
                  </div>
                  <button
                    onClick={() => jumpToStep(4)}
                    className="text-[#C48446] text-xs font-mono flex items-center gap-1 hover:underline"
                  >
                    <span>EDIT</span> <Edit3 className="w-3 h-3" />
                  </button>
                </div>

                {/* 04. Elevation & Road */}
                <div className="flex items-center justify-between py-3">
                  <div>
                    <span className="text-[10px] font-mono tracking-widest text-[#9E9C98] block">
                      04. ELEVATION & ROAD
                    </span>
                    <span className="text-sm font-medium text-[#F5F3EF]">
                      {floors === "Custom" ? `${customFloors} Floors` : floors} · {orientation} Facing ·{" "}
                      {parking}
                    </span>
                  </div>
                  <button
                    onClick={() => jumpToStep(7)}
                    className="text-[#C48446] text-xs font-mono flex items-center gap-1 hover:underline"
                  >
                    <span>EDIT</span> <Edit3 className="w-3 h-3" />
                  </button>
                </div>

                {/* 05. Style */}
                <div className="flex items-center justify-between py-3">
                  <div>
                    <span className="text-[10px] font-mono tracking-widest text-[#9E9C98] block">
                      05. STYLE & SPACES
                    </span>
                    <span className="text-sm font-medium text-[#F5F3EF]">
                      {style} · {additionalSpaces.join(", ")}
                    </span>
                  </div>
                  <button
                    onClick={() => jumpToStep(10)}
                    className="text-[#C48446] text-xs font-mono flex items-center gap-1 hover:underline"
                  >
                    <span>EDIT</span> <Edit3 className="w-3 h-3" />
                  </button>
                </div>

                {/* 06. Feasibility & Dimensions Summary */}
                <div className="flex items-center justify-between py-3">
                  <div>
                    <span className="text-[10px] font-mono tracking-widest text-[#9E9C98] block">
                      06. ROOM SIZING & FEASIBILITY
                    </span>
                    <span className="text-sm font-medium text-[#F5F3EF] flex items-center gap-2">
                      <span className="text-[#C48446]">
                        {roomAllocations.filter((r) => r.sizeMode === "manual").length} Manual ·{" "}
                        {roomAllocations.filter((r) => r.sizeMode === "ai_recommended").length} AI
                        Recommended
                      </span>
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                          feasibilityData.status === "comfortable"
                            ? "bg-emerald-950/40 text-emerald-300"
                            : "bg-amber-950/40 text-amber-300"
                        }`}
                      >
                        {feasibilityData.coveragePct}% Coverage
                      </span>
                    </span>
                    <p className="text-xs text-[#9E9C98] mt-1">{feasibilityData.message}</p>
                  </div>
                  <button
                    onClick={() => jumpToStep(12)}
                    className="text-[#C48446] text-xs font-mono flex items-center gap-1 hover:underline"
                  >
                    <span>EDIT SIZES</span> <Edit3 className="w-3 h-3" />
                  </button>
                </div>

                {/* 07. Building Program */}
                <div className="py-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <span className="text-[10px] font-mono tracking-widest text-[#C48446] block font-semibold">
                        07. BUILDING PROGRAM ({numFloorsCount} {numFloorsCount === 1 ? "LEVEL" : "LEVELS"})
                      </span>
                      <span className="text-xs text-[#9E9C98]">Floor-wise room allocation</span>
                    </div>
                    <button
                      onClick={() => jumpToStep(12)}
                      className="text-[#C48446] text-xs font-mono flex items-center gap-1 hover:underline"
                    >
                      <span>EDIT ALLOCATION</span> <Edit3 className="w-3 h-3" />
                    </button>
                  </div>

                  <div className="space-y-2 mt-2">
                    {Array.from({ length: numFloorsCount }, (_, i) => i + 1).map((fNum) => {
                      const fName =
                        fNum === 1
                          ? "Ground Floor"
                          : fNum === 2
                          ? "First Floor"
                          : fNum === 3
                          ? "Second Floor"
                          : `Level ${fNum}`;

                      const floorRooms = roomAllocations.filter((r) => r.floorNumber === fNum);

                      return (
                        <div key={fNum} className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
                          <div className="flex items-center justify-between text-xs font-mono text-[#F5F3EF] mb-2 font-medium">
                            <span className="text-[#C48446]">{fName.toUpperCase()}</span>
                            <span className="text-[10px] text-[#9E9C98]">{floorRooms.length} spaces</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {floorRooms.map((r) => (
                              <span
                                key={r.id}
                                className="px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-[11px] text-[#F5F3EF]"
                              >
                                {r.name} ({r.width}&apos;×{r.length}&apos;)
                              </span>
                            ))}
                            {floorRooms.length === 0 && (
                              <span className="text-[11px] text-[#6B6964] italic">None</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Master CTA: GENERATE MY HOME */}
              <button
                onClick={handleFinalGenerate}
                className="w-full py-4 rounded-full bg-[#C48446] text-[#0A0B0E] hover:bg-[#D49354] font-medium text-xs tracking-widest transition-all duration-300 shadow-2xl shadow-[#C48446]/30 flex items-center justify-center gap-2 group uppercase"
              >
                <Sparkles className="w-4 h-4" />
                <span>GENERATE ARCHITECTURAL DESIGN</span>
                <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        </div>
      </div>

      {/* Footer Details */}
      <div className="relative z-10 w-full px-8 py-4 flex items-center justify-between text-[11px] font-mono text-[#6B6964] border-t border-white/5 bg-[#0A0B0E]/70 backdrop-blur-sm shrink-0">
        <span>ARCHITECTURAL INTELLIGENCE CORE // CP-SAT + SHAPELY</span>
        <span>ATELIER ARCHAI v2.5</span>
      </div>
    </div>
  );
};
