"use client";

import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import {
  Camera,
  ChevronDown,
  RotateCcw,
  Sun,
  Moon,
  Sparkles,
  Layers,
  Eye,
  Scissors,
  Building,
  Plus,
  Minus,
  Maximize2,
  Minimize2,
  Compass,
  Download,
} from "lucide-react";
import {
  HouseLayout,
  FloorPlan,
  Room,
  FurnitureItem,
  Wall,
  Door,
  WindowItem,
  Rect,
} from "@/types/house";
import {
  generateArchitecturalLandscape,
  buildArchitecturalLandscapeScene,
} from "@/utils/residentialLandscapeGenerator";
import { RealisticRenderModal } from "@/components/RealisticRenderModal";
import { editRoomLayoutFull } from "@/utils/api";

export interface Dollhouse3DProps {
  layout: HouseLayout;
  activeFloorIndex: number;
  onSelectFloor?: (floorIndex: number) => void;
  selectedRoomId: string | null;
  selectedFurnitureId?: string | null;
  onSelectRoom: (roomId: string | null) => void;
  onSelectFurniture?: (furnitureId: string | null) => void;
  onUpdateLayout?: (updatedLayout: HouseLayout) => void;
  isDarkMode?: boolean;
  lightingPreset?: "day" | "sunset" | "night" | "studio";
  onChangeLightingPreset?: (preset: "day" | "sunset" | "night" | "studio") => void;
  cameraPreset?: "isometric" | "perspective" | "interior" | "top" | "front";
  onChangeCameraPreset?: (preset: "isometric" | "perspective" | "interior" | "top" | "front") => void;
  wallHeightMode?: "cutaway" | "full";
  onToggleWallHeightMode?: () => void;
  showRoof?: boolean;
  onToggleRoof?: () => void;
  showStructure?: boolean;
  onToggleStructure?: () => void;
  showLandscape?: boolean;
  onToggleLandscape?: () => void;
  initialPresentationMode?: PresentationMode;
  hasNotification?: boolean;
}

export type PresentationMode = "cutaway" | "exterior" | "interior" | "landscape" | "all";

export type CameraPresetType =
  | "cutaway"
  | "exterior"
  | "iso"
  | "top"
  | "front"
  | "entrance"
  | "living"
  | "kitchen"
  | "bedroom"
  | "garden";

export const Dollhouse3D: React.FC<Dollhouse3DProps> = ({
  layout,
  activeFloorIndex,
  onSelectFloor,
  selectedRoomId,
  selectedFurnitureId,
  onSelectRoom,
  onSelectFurniture,
  onUpdateLayout,
  isDarkMode = false,
  lightingPreset = "day",
  onChangeLightingPreset,
  cameraPreset = "perspective",
  onChangeCameraPreset,
  wallHeightMode = "full",
  onToggleWallHeightMode,
  showRoof = true,
  onToggleRoof,
  showStructure,
  onToggleStructure,
  showLandscape = true,
  onToggleLandscape,
  initialPresentationMode,
  hasNotification,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);

  // Authoritative Architectural Elevation Constants
  const plinthHeight = 0.8;   // Finished plinth at y = 0.8 ft
  const floorHeight = 10.0;   // Height from floor level to next floor level (10 ft)
  const fullWallHeight = 9.5; // Clear wall height (9.5 ft)
  const cutawayWallHeight = 3.2; // Selective cutaway wall height
  const slabThickness = 0.6;  // Concrete intermediate slab thickness (0.6 ft)

  const pw = layout.plot_width || 40;
  const pl = layout.plot_length || 50;
  const cx = pw / 2;
  const cz = pl / 2;

  // Canonical Facing / Road Orientation
  const resolvedFacing = (
    layout.facing ||
    layout.orientation ||
    layout.site?.road_side ||
    "south"
  ).toLowerCase();

  // Mode States
  const [isCutawayMode, setIsCutawayMode] = useState<boolean>(true);
  const [presentationMode, setPresentationMode] = useState<PresentationMode>(
    initialPresentationMode || "cutaway"
  );
  const [cameraView, setCameraView] = useState<CameraPresetType>("cutaway");
  const [isCameraMenuOpen, setIsCameraMenuOpen] = useState(false);
  const [showFurnitureState, setShowFurnitureState] = useState(true);
  const [showVegetationState, setShowVegetationState] = useState(true);
  const [multiFloorStacked, setMultiFloorStacked] = useState(true);

  const [internalLightingPreset, setInternalLightingPreset] = useState<"day" | "sunset" | "night">(
    lightingPreset === "night" || lightingPreset === "sunset" ? lightingPreset : "day"
  );
  const effectiveLightingPreset = onChangeLightingPreset ? (lightingPreset as "day" | "sunset" | "night") : internalLightingPreset;

  const [internalShowRoof, setInternalShowRoof] = useState(showRoof !== undefined ? showRoof : true);
  const effectiveShowRoof = onToggleRoof ? showRoof : internalShowRoof;

  const [internalShowLandscape, setInternalShowLandscape] = useState(true);
  const effectiveShowLandscape = showLandscape !== undefined ? showLandscape : internalShowLandscape;

  // Realistic Render Modal
  const [isRenderModalOpen, setIsRenderModalOpen] = useState(false);
  const [isEditingRoom, setIsEditingRoom] = useState(false);

  // Three.js Core Refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const composerRef = useRef<EffectComposer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const houseRootRef = useRef<THREE.Group | null>(null);
  const sunLightRef = useRef<THREE.DirectionalLight | null>(null);
  const skyLightRef = useRef<THREE.HemisphereLight | null>(null);
  const interiorLightsGroupRef = useRef<THREE.Group | null>(null);

  // Camera Target Lerp
  const targetCamPos = useRef(new THREE.Vector3());
  const targetControlsTarget = useRef(new THREE.Vector3());
  const isTransitioningCamera = useRef(false);

  // Raycaster for touch/click interaction
  const raycaster = useRef(new THREE.Raycaster());
  const pointer = useRef(new THREE.Vector2());

  // GLTF Asset Caches
  const loadedFurnitureRef = useRef<Record<string, THREE.Group>>({});
  const loadedNatureRef = useRef<Record<string, THREE.Group>>({});
  const [assetsReady, setAssetsReady] = useState(false);

  // Preload CC0 / Procedural Textures & GLB Assets
  useEffect(() => {
    if (typeof window === "undefined") return;
    const loader = new GLTFLoader();
    let mounted = true;

    // Furniture Library
    const furnitureModels = [
      "sofa", "coffee_table", "tv_unit", "bed", "nightstand",
      "wardrobe", "dining_table", "dining_chair", "kitchen_counter",
      "refrigerator", "toilet", "basin", "shower", "outdoor_chair",
      "outdoor_table", "planter"
    ];

    let loadedCount = 0;
    const totalCount = furnitureModels.length;

    furnitureModels.forEach((name) => {
      loader.load(
        `/models/furniture/${name}.glb`,
        (gltf) => {
          if (!mounted) return;
          gltf.scene.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });
          loadedFurnitureRef.current[name] = gltf.scene;
          loadedCount++;
          if (loadedCount === totalCount) setAssetsReady(true);
        },
        undefined,
        () => {
          loadedCount++;
          if (loadedCount === totalCount) setAssetsReady(true);
        }
      );
    });

    // Nature Kit Models
    const natureModels: Record<string, string> = {
      bush: "/models/bush.glb",
      bushDetailed: "/models/bush_detailed.glb",
      flowerPurple: "/models/flower_purple.glb",
      flowerRed: "/models/flower_red.glb",
      flowerYellow: "/models/flower_yellow.glb",
      treeSmall: "/models/tree_small.glb",
    };

    Object.entries(natureModels).forEach(([k, path]) => {
      loader.load(
        path,
        (gltf) => {
          if (!mounted) return;
          loadedNatureRef.current[k] = gltf.scene;
        },
        undefined,
        () => {}
      );
    });

    return () => {
      mounted = false;
    };
  }, []);

  // Procedural Wood / Marble / Plaster Texture Generators
  const woodTexture = useMemo(() => {
    if (typeof window === "undefined") return null;
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#C49A6C";
    ctx.fillRect(0, 0, 512, 512);
    ctx.fillStyle = "rgba(0,0,0,0.06)";
    for (let y = 0; y < 512; y += 32) {
      ctx.fillRect(0, y, 512, 1.5);
      const offset = (y / 32) % 2 === 0 ? 128 : 256;
      for (let x = offset; x < 512; x += 256) {
        ctx.fillRect(x, y, 1.5, 32);
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(4, 4);
    return tex;
  }, []);

  const tileTexture = useMemo(() => {
    if (typeof window === "undefined") return null;
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#F5F6F8";
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = "#E2E4E8";
    ctx.lineWidth = 2;
    for (let i = 0; i <= 512; i += 64) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 512);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(512, i);
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 3);
    return tex;
  }, []);

  // PBR Materials System
  const materials = useMemo(() => {
    return {
      // Exterior Stucco / Plaster
      extPlaster: new THREE.MeshStandardMaterial({
        color: isDarkMode ? "#33353A" : "#F3EFEA",
        roughness: 0.85,
        metalness: 0.02,
      }),
      // Accent Architectural Stone / Siding
      accentStone: new THREE.MeshStandardMaterial({
        color: isDarkMode ? "#1F232B" : "#2B303A",
        roughness: 0.62,
        metalness: 0.05,
      }),
      // Interior Plaster Partition
      intPlaster: new THREE.MeshStandardMaterial({
        color: isDarkMode ? "#27292D" : "#FAF8F5",
        roughness: 0.88,
        metalness: 0.01,
      }),
      // Concrete Plinth Foundation
      plinthMat: new THREE.MeshStandardMaterial({
        color: isDarkMode ? "#26282E" : "#D1D5DB",
        roughness: 0.72,
        metalness: 0.04,
      }),
      // Concrete Intermediate Slabs & Roof
      slabMat: new THREE.MeshStandardMaterial({
        color: isDarkMode ? "#2D3036" : "#E5E7EB",
        roughness: 0.68,
        metalness: 0.03,
      }),
      // Hardwood Oak Floor
      woodFloor: new THREE.MeshStandardMaterial({
        color: isDarkMode ? "#3A291C" : "#C49A6C",
        roughness: 0.38,
        metalness: 0.04,
        map: woodTexture || undefined,
      }),
      // Marble Tile Floor
      marbleFloor: new THREE.MeshStandardMaterial({
        color: isDarkMode ? "#22252A" : "#F8F9FA",
        roughness: 0.16,
        metalness: 0.06,
        map: tileTexture || undefined,
      }),
      // Architectural Transparent Glass
      glassMat: new THREE.MeshStandardMaterial({
        color: "#D0E7F9",
        transparent: true,
        opacity: 0.38,
        roughness: 0.05,
        metalness: 0.15,
      }),
      // Dark Aluminum Frame
      frameMat: new THREE.MeshStandardMaterial({
        color: "#1E2229",
        roughness: 0.4,
        metalness: 0.82,
      }),
      // Wooden Door Leaf
      doorLeafMat: new THREE.MeshStandardMaterial({
        color: isDarkMode ? "#362215" : "#6E4527",
        roughness: 0.45,
        metalness: 0.05,
      }),
      // Polished Chrome Hardware
      chromeMat: new THREE.MeshStandardMaterial({
        color: "#E2E8F0",
        roughness: 0.15,
        metalness: 0.95,
      }),
      // Coping Cap
      copingMat: new THREE.MeshStandardMaterial({
        color: "#374151",
        roughness: 0.6,
      }),
      // Entrance Canopy
      canopyMat: new THREE.MeshStandardMaterial({
        color: "#1F2937",
        roughness: 0.3,
        metalness: 0.85,
      }),
      // Fallback Furniture Materials
      furnitureWood: new THREE.MeshStandardMaterial({ color: "#8A6D4B", roughness: 0.55 }),
      furnitureFabric: new THREE.MeshStandardMaterial({ color: "#D4CCC0", roughness: 0.85 }),
    };
  }, [isDarkMode, woodTexture, tileTexture]);

  // Floor Material Mapper
  const getRoomFloorMaterial = useCallback(
    (room: Room): THREE.MeshStandardMaterial => {
      const type = (room.type || "").toLowerCase();
      const name = (room.name || "").toLowerCase();
      if (type.includes("bed") || name.includes("bed") || type.includes("living") || name.includes("living")) {
        return materials.woodFloor;
      }
      return materials.marbleFloor;
    },
    [materials]
  );

  // Helper to place GLTF or fallback procedural furniture
  const placeFurniturePiece = useCallback(
    (item: FurnitureItem, hostGroup: THREE.Group, floorBaseY: number) => {
      const type = (item.type || "").toLowerCase();
      const fw = Math.max(1.0, Number(item.width) || 3.0);
      const fl = Math.max(1.0, Number(item.length) || 3.0);
      const fx = item.x !== undefined ? item.x : 0;
      const fz = item.y !== undefined ? item.y : 0;
      const rotY = -THREE.MathUtils.degToRad(item.rotation || 0);

      // Match item to GLB model
      let modelKey = "sofa";
      if (type.includes("bed")) modelKey = "bed";
      else if (type.includes("nightstand") || type.includes("side_table")) modelKey = "nightstand";
      else if (type.includes("wardrobe") || type.includes("closet")) modelKey = "wardrobe";
      else if (type.includes("coffee")) modelKey = "coffee_table";
      else if (type.includes("tv")) modelKey = "tv_unit";
      else if (type.includes("dining_table")) modelKey = "dining_table";
      else if (type.includes("chair")) modelKey = "dining_chair";
      else if (type.includes("counter") || type.includes("kitchen")) modelKey = "kitchen_counter";
      else if (type.includes("fridge") || type.includes("refrigerator")) modelKey = "refrigerator";
      else if (type.includes("toilet") || type.includes("wc")) modelKey = "toilet";
      else if (type.includes("basin") || type.includes("vanity")) modelKey = "basin";
      else if (type.includes("shower")) modelKey = "shower";
      else if (type.includes("outdoor") && type.includes("chair")) modelKey = "outdoor_chair";
      else if (type.includes("outdoor") && type.includes("table")) modelKey = "outdoor_table";
      else if (type.includes("plant") || type.includes("planter")) modelKey = "planter";

      const cachedModel = loadedFurnitureRef.current[modelKey];
      if (cachedModel) {
        const cloned = cachedModel.clone(true);
        cloned.position.set(fx, floorBaseY + 0.02, fz);
        cloned.rotation.y = rotY;
        cloned.userData = { furnitureId: item.id, type: "furniture" };
        hostGroup.add(cloned);
      } else {
        // Fallback procedural box
        const boxGeo = new THREE.BoxGeometry(fw, 1.2, fl);
        const boxMesh = new THREE.Mesh(boxGeo, materials.furnitureFabric);
        boxMesh.position.set(fx, floorBaseY + 0.6, fz);
        boxMesh.rotation.y = rotY;
        boxMesh.castShadow = true;
        boxMesh.receiveShadow = true;
        boxMesh.userData = { furnitureId: item.id, type: "furniture" };
        hostGroup.add(boxMesh);
      }
    },
    [materials]
  );

  // Build Staircase connecting floorBaseY to floorBaseY + floorHeight
  const buildArchitecturalStaircase = useCallback(
    (rect: Rect, baseElevation: number): THREE.Group => {
      const group = new THREE.Group();
      const sw = Math.max(3.0, rect.width || 6.0);
      const sl = Math.max(6.0, rect.length || 10.0);
      const sx = rect.x + sw / 2;
      const sz = rect.y + sl / 2;
      const numSteps = 16;
      const stepH = floorHeight / numSteps;
      const stepD = sl / (numSteps / 2); // Dog-legged flight run
      const flightW = sw / 2 - 0.2;

      // Flight 1 (Rising to mid landing)
      for (let i = 0; i < numSteps / 2; i++) {
        const stepGeo = new THREE.BoxGeometry(flightW, stepH, stepD);
        const stepMesh = new THREE.Mesh(stepGeo, materials.woodFloor);
        stepMesh.position.set(
          sx - flightW / 2 - 0.1,
          baseElevation + (i + 0.5) * stepH,
          sz - sl / 2 + (i + 0.5) * stepD
        );
        stepMesh.castShadow = true;
        stepMesh.receiveShadow = true;
        group.add(stepMesh);
      }

      // Mid-landing slab
      const landingH = (numSteps / 2) * stepH;
      const landingGeo = new THREE.BoxGeometry(sw, 0.4, sl * 0.35);
      const landingMesh = new THREE.Mesh(landingGeo, materials.slabMat);
      landingMesh.position.set(sx, baseElevation + landingH - 0.2, sz + sl / 2 - (sl * 0.35) / 2);
      landingMesh.castShadow = true;
      group.add(landingMesh);

      // Flight 2 (Rising to top floor)
      for (let i = numSteps / 2; i < numSteps; i++) {
        const stepIdx = i - numSteps / 2;
        const stepGeo = new THREE.BoxGeometry(flightW, stepH, stepD);
        const stepMesh = new THREE.Mesh(stepGeo, materials.woodFloor);
        stepMesh.position.set(
          sx + flightW / 2 + 0.1,
          baseElevation + (i + 0.5) * stepH,
          sz + sl / 2 - sl * 0.35 - (stepIdx + 0.5) * stepD
        );
        stepMesh.castShadow = true;
        stepMesh.receiveShadow = true;
        group.add(stepMesh);
      }

      // Handrail
      const railGeo = new THREE.CylinderGeometry(0.04, 0.04, sl * 0.85, 8);
      const railMesh = new THREE.Mesh(railGeo, materials.frameMat);
      railMesh.rotation.x = Math.PI / 4.2;
      railMesh.position.set(sx - flightW, baseElevation + landingH / 2 + 2.5, sz - 0.5);
      group.add(railMesh);

      return group;
    },
    [floorHeight, materials]
  );

  // Build Single Floor Architectural Geometry
  const buildFloorGeometry = useCallback(
    (
      floor: FloorPlan,
      floorIndex: number,
      floorBaseY: number,
      isCutaway: boolean,
      interiorLights: THREE.Group,
      houseCenter: { x: number; z: number }
    ): THREE.Group => {
      const floorGroup = new THREE.Group();

      // 1. Room Finished Floor Slabs
      (floor.rooms || []).forEach((room) => {
        if (!room || !room.rect) return;
        const rw = Math.max(1.0, room.rect.width);
        const rl = Math.max(1.0, room.rect.length);
        const rx = room.rect.x + rw / 2;
        const rz = room.rect.y + rl / 2;

        const floorMat = getRoomFloorMaterial(room);
        const floorGeo = new THREE.PlaneGeometry(rw - 0.04, rl - 0.04);
        const floorMesh = new THREE.Mesh(floorGeo, floorMat);
        floorMesh.rotation.x = -Math.PI / 2;
        floorMesh.position.set(rx, floorBaseY + 0.02, rz);
        floorMesh.receiveShadow = true;
        floorMesh.userData = { roomId: room.id, type: "room_floor" };
        floorGroup.add(floorMesh);

        // Highlight selected room
        if (selectedRoomId === room.id) {
          const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(rw, 0.1, rl));
          const lineMat = new THREE.LineBasicMaterial({ color: 0xc48446, linewidth: 3 });
          const wireframe = new THREE.LineSegments(edges, lineMat);
          wireframe.position.set(rx, floorBaseY + 0.06, rz);
          floorGroup.add(wireframe);
        }

        // Warm Interior Ceiling Light
        if (effectiveLightingPreset === "sunset" || effectiveLightingPreset === "night") {
          const light = new THREE.PointLight(
            0xffeed1,
            effectiveLightingPreset === "night" ? 1.4 : 0.65,
            24
          );
          light.position.set(rx, floorBaseY + 8.2, rz);
          interiorLights.add(light);
        }

        // Interior Furniture
        if (showFurnitureState) {
          (room.furniture || []).forEach((item) => {
            placeFurniturePiece(item, floorGroup, floorBaseY);
          });
        }
      });

      // 2. Staircase
      const stairRooms = (floor.rooms || []).filter(
        (r) => r.type === "staircase" || r.name.toLowerCase().includes("stair")
      );
      stairRooms.forEach((sr) => {
        if (sr.rect) {
          const stairMesh = buildArchitecturalStaircase(sr.rect, floorBaseY);
          floorGroup.add(stairMesh);
        }
      });

      // 3. Canonical Wall Network with Door/Window Cutouts
      const allWalls: Wall[] = [
        ...(floor.exterior_walls || []).map((w) => ({ ...w, is_exterior: true })),
        ...(floor.interior_walls || []).map((w) => ({ ...w, is_exterior: false })),
      ];

      allWalls.forEach((wall, wallIdx) => {
        const dx = wall.x2 - wall.x1;
        const dz = wall.y2 - wall.y1;
        const wallLen = Math.hypot(dx, dz);
        if (wallLen < 0.25) return;

        const angle = Math.atan2(dz, dx);
        const ux = dx / wallLen;
        const uz = dz / wallLen;
        const isExt = wall.is_exterior;
        const thickness = wall.thickness || (isExt ? 0.75 : 0.38);

        // Architectural Cutaway Determination:
        // Front-facing exterior walls are cut to cutawayWallHeight (3.2 ft) in cutaway mode
        let curWallH = fullWallHeight;
        if (isCutaway && isExt) {
          const midX = (wall.x1 + wall.x2) / 2;
          const midZ = (wall.y1 + wall.y2) / 2;
          let isFrontFacing = false;

          if (resolvedFacing === "south" && midZ >= houseCenter.z) isFrontFacing = true;
          else if (resolvedFacing === "north" && midZ <= houseCenter.z) isFrontFacing = true;
          else if (resolvedFacing === "east" && midX >= houseCenter.x) isFrontFacing = true;
          else if (resolvedFacing === "west" && midX <= houseCenter.x) isFrontFacing = true;

          if (isFrontFacing) {
            curWallH = cutawayWallHeight;
          }
        }

        const wallMat = isExt
          ? wallIdx % 3 === 0
            ? materials.accentStone
            : materials.extPlaster
          : materials.intPlaster;

        // Collect openings on this wall
        interface Opening {
          type: "door" | "window";
          id: string;
          start: number;
          end: number;
          width: number;
          midX: number;
          midZ: number;
        }
        const openings: Opening[] = [];

        (floor.doors || []).forEach((d) => {
          const dmx = (d.x1 + d.x2) / 2;
          const dmz = (d.y1 + d.y2) / 2;
          const distToStart = Math.hypot(dmx - wall.x1, dmz - wall.y1);
          const distToEnd = Math.hypot(dmx - wall.x2, dmz - wall.y2);
          if (Math.abs(distToStart + distToEnd - wallLen) < 0.6) {
            const sMid = (dmx - wall.x1) * ux + (dmz - wall.y1) * uz;
            const w = Math.max(1.8, d.width || 3.0);
            openings.push({
              type: "door",
              id: d.id,
              start: Math.max(0, sMid - w / 2),
              end: Math.min(wallLen, sMid + w / 2),
              width: w,
              midX: dmx,
              midZ: dmz,
            });
          }
        });

        (floor.windows || []).forEach((win) => {
          const wmx = (win.x1 + win.x2) / 2;
          const wmz = (win.y1 + win.y2) / 2;
          const distToStart = Math.hypot(wmx - wall.x1, wmz - wall.y1);
          const distToEnd = Math.hypot(wmx - wall.x2, wmz - wall.y2);
          if (Math.abs(distToStart + distToEnd - wallLen) < 0.6) {
            const sMid = (wmx - wall.x1) * ux + (wmz - wall.y1) * uz;
            const winW = Math.max(2.0, win.width || 4.0);
            openings.push({
              type: "window",
              id: win.id,
              start: Math.max(0, sMid - winW / 2),
              end: Math.min(wallLen, sMid + winW / 2),
              width: winW,
              midX: wmx,
              midZ: wmz,
            });
          }
        });

        // Render wall segments
        if (openings.length === 0) {
          const geo = new THREE.BoxGeometry(wallLen, curWallH, thickness);
          const mesh = new THREE.Mesh(geo, wallMat);
          mesh.position.set(
            (wall.x1 + wall.x2) / 2,
            floorBaseY + curWallH / 2,
            (wall.y1 + wall.y2) / 2
          );
          mesh.rotation.y = -angle;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          floorGroup.add(mesh);
        } else {
          openings.sort((a, b) => a.start - b.start);
          let currentS = 0;

          openings.forEach((op) => {
            const segLen = op.start - currentS;
            if (segLen > 0.25) {
              const segMidS = currentS + segLen / 2;
              const mx = wall.x1 + ux * segMidS;
              const mz = wall.y1 + uz * segMidS;
              const geo = new THREE.BoxGeometry(segLen, curWallH, thickness);
              const mesh = new THREE.Mesh(geo, wallMat);
              mesh.position.set(mx, floorBaseY + curWallH / 2, mz);
              mesh.rotation.y = -angle;
              mesh.castShadow = true;
              mesh.receiveShadow = true;
              floorGroup.add(mesh);
            }

            // Window Joinery
            if (op.type === "window") {
              const sillH = 2.8;
              const headH = 7.0;
              const winH = headH - sillH;

              // Sill wall below window
              if (curWallH >= sillH) {
                const sH = Math.min(sillH, curWallH);
                const sMesh = new THREE.Mesh(new THREE.BoxGeometry(op.width, sH, thickness), wallMat);
                sMesh.position.set(op.midX, floorBaseY + sH / 2, op.midZ);
                sMesh.rotation.y = -angle;
                sMesh.castShadow = true;
                sMesh.receiveShadow = true;
                floorGroup.add(sMesh);
              }

              // Lintel wall above window (in full height walls)
              if (curWallH >= fullWallHeight) {
                const lH = fullWallHeight - headH;
                const lMesh = new THREE.Mesh(new THREE.BoxGeometry(op.width, lH, thickness), wallMat);
                lMesh.position.set(op.midX, floorBaseY + headH + lH / 2, op.midZ);
                lMesh.rotation.y = -angle;
                lMesh.castShadow = true;
                floorGroup.add(lMesh);
              }

              // Glass and aluminum frame
              if (curWallH >= sillH + 0.5) {
                const renderWinH = Math.min(winH, curWallH - sillH);
                const gMesh = new THREE.Mesh(
                  new THREE.BoxGeometry(op.width - 0.2, renderWinH - 0.2, 0.08),
                  materials.glassMat
                );
                gMesh.position.set(op.midX, floorBaseY + sillH + renderWinH / 2, op.midZ);
                gMesh.rotation.y = -angle;
                floorGroup.add(gMesh);

                const fMesh = new THREE.Mesh(
                  new THREE.BoxGeometry(op.width, renderWinH, thickness + 0.05),
                  materials.frameMat
                );
                fMesh.position.set(op.midX, floorBaseY + sillH + renderWinH / 2, op.midZ);
                fMesh.rotation.y = -angle;
                floorGroup.add(fMesh);
              }
            }

            // Door Joinery
            if (op.type === "door") {
              const doorHeadH = 7.0;
              if (curWallH >= fullWallHeight) {
                const lH = fullWallHeight - doorHeadH;
                const lMesh = new THREE.Mesh(new THREE.BoxGeometry(op.width, lH, thickness), wallMat);
                lMesh.position.set(op.midX, floorBaseY + doorHeadH + lH / 2, op.midZ);
                lMesh.rotation.y = -angle;
                floorGroup.add(lMesh);
              }

              const renderDoorH = Math.min(doorHeadH, curWallH);
              // Door frame
              const frameMesh = new THREE.Mesh(
                new THREE.BoxGeometry(op.width, renderDoorH, thickness + 0.04),
                materials.frameMat
              );
              frameMesh.position.set(op.midX, floorBaseY + renderDoorH / 2, op.midZ);
              frameMesh.rotation.y = -angle;
              floorGroup.add(frameMesh);

              // Recessed leaf
              const leafMesh = new THREE.Mesh(
                new THREE.BoxGeometry(op.width - 0.2, renderDoorH - 0.1, 0.12),
                materials.doorLeafMat
              );
              leafMesh.position.set(op.midX, floorBaseY + renderDoorH / 2, op.midZ);
              leafMesh.rotation.y = -angle;
              floorGroup.add(leafMesh);
            }

            currentS = op.end;
          });

          // Final wall segment
          if (wallLen - currentS > 0.25) {
            const segLen = wallLen - currentS;
            const segMidS = currentS + segLen / 2;
            const mx = wall.x1 + ux * segMidS;
            const mz = wall.y1 + uz * segMidS;
            const geo = new THREE.BoxGeometry(segLen, curWallH, thickness);
            const mesh = new THREE.Mesh(geo, wallMat);
            mesh.position.set(mx, floorBaseY + curWallH / 2, mz);
            mesh.rotation.y = -angle;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            floorGroup.add(mesh);
          }
        }
      });

      return floorGroup;
    },
    [
      getRoomFloorMaterial,
      materials,
      effectiveLightingPreset,
      showFurnitureState,
      placeFurniturePiece,
      buildArchitecturalStaircase,
      fullWallHeight,
      cutawayWallHeight,
      resolvedFacing,
      selectedRoomId,
    ]
  );

  // Complete 3D Scene Rebuild
  const rebuildScene = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (houseRootRef.current) {
      scene.remove(houseRootRef.current);
    }
    const rootGroup = new THREE.Group();
    scene.add(rootGroup);
    houseRootRef.current = rootGroup;

    const interiorLights = new THREE.Group();
    rootGroup.add(interiorLights);
    interiorLightsGroupRef.current = interiorLights;

    // Calculate Canonical Bounding Footprint
    let minBx = Infinity, maxBx = -Infinity, minBz = Infinity, maxBz = -Infinity;
    (layout.rooms || []).forEach((r) => {
      if (r.rect) {
        minBx = Math.min(minBx, r.rect.x);
        maxBx = Math.max(maxBx, r.rect.x + r.rect.width);
        minBz = Math.min(minBz, r.rect.y);
        maxBz = Math.max(maxBz, r.rect.y + r.rect.length);
      }
    });

    const hasRooms = isFinite(minBx) && minBx < maxBx;
    const plinthW = hasRooms ? maxBx - minBx + 1.2 : pw * 0.7;
    const plinthL = hasRooms ? maxBz - minBz + 1.2 : pl * 0.7;
    const plinthX = hasRooms ? (minBx + maxBx) / 2 : cx;
    const plinthZ = hasRooms ? (minBz + maxBz) / 2 : cz;

    // 1. Plinth Foundation (Elevation 0 to plinthHeight)
    const plinthGeo = new THREE.BoxGeometry(plinthW, plinthHeight, plinthL);
    const plinthMesh = new THREE.Mesh(plinthGeo, materials.plinthMat);
    plinthMesh.position.set(plinthX, plinthHeight / 2, plinthZ);
    plinthMesh.receiveShadow = true;
    rootGroup.add(plinthMesh);

    // 2. Site Landscaping
    if (effectiveShowLandscape) {
      const landscapeModel = generateArchitecturalLandscape(layout);
      const landscapeScene = buildArchitecturalLandscapeScene(
        landscapeModel,
        materials as any,
        loadedNatureRef.current as any,
        {
          filterCategory: showVegetationState ? "all" : "paths",
          lightingPreset: effectiveLightingPreset,
          isDarkMode,
        }
      );
      rootGroup.add(landscapeScene);
    }

    // 3. Multi-Floor / Single Floor Construction
    const numFloors = Math.max(1, layout.floors?.length || layout.num_floors || 1);

    if (multiFloorStacked) {
      (layout.floors || [layout]).forEach((fl, fIdx) => {
        const floorPlan: FloorPlan =
          layout.floors && layout.floors[fIdx]
            ? layout.floors[fIdx]
            : {
                floor_number: fIdx + 1,
                floor_name: `Level ${fIdx + 1}`,
                rooms: layout.rooms || [],
                exterior_walls: layout.exterior_walls || [],
                interior_walls: layout.interior_walls || [],
                doors: layout.doors || [],
                windows: layout.windows || [],
              };

        const floorBaseY = plinthHeight + fIdx * floorHeight;

        // Intermediate RCC Slab between floors
        if (fIdx > 0) {
          const slabGeo = new THREE.BoxGeometry(plinthW, slabThickness, plinthL);
          const slabMesh = new THREE.Mesh(slabGeo, materials.slabMat);
          slabMesh.position.set(plinthX, floorBaseY - slabThickness / 2, plinthZ);
          slabMesh.castShadow = true;
          slabMesh.receiveShadow = true;
          rootGroup.add(slabMesh);
        }

        const flGroup = buildFloorGeometry(
          floorPlan,
          fIdx,
          floorBaseY,
          isCutawayMode,
          interiorLights,
          { x: plinthX, z: plinthZ }
        );
        rootGroup.add(flGroup);
      });
    }

    // 4. RCC Roof Slab & Parapet Wall
    const topFloorBaseY = plinthHeight + (numFloors - 1) * floorHeight;
    const roofBaseY = topFloorBaseY + fullWallHeight;
    const roofW = plinthW + 1.2;
    const roofL = plinthL + 1.2;

    if (effectiveShowRoof) {
      if (!isCutawayMode) {
        // Complete roof slab
        const roofGeo = new THREE.BoxGeometry(roofW, slabThickness, roofL);
        const roofMesh = new THREE.Mesh(roofGeo, materials.slabMat);
        roofMesh.position.set(plinthX, roofBaseY + slabThickness / 2, plinthZ);
        roofMesh.castShadow = true;
        roofMesh.receiveShadow = true;
        rootGroup.add(roofMesh);

        // Parapet Walls
        const parapetH = 2.5;
        const parapetThick = 0.5;
        const pFront = new THREE.Mesh(new THREE.BoxGeometry(roofW, parapetH, parapetThick), materials.extPlaster);
        pFront.position.set(plinthX, roofBaseY + slabThickness + parapetH / 2, plinthZ + roofL / 2 - parapetThick / 2);
        const pRear = pFront.clone();
        pRear.position.z = plinthZ - roofL / 2 + parapetThick / 2;

        const pLeft = new THREE.Mesh(new THREE.BoxGeometry(parapetThick, parapetH, roofL), materials.extPlaster);
        pLeft.position.set(plinthX - roofW / 2 + parapetThick / 2, roofBaseY + slabThickness + parapetH / 2, plinthZ);
        const pRight = pLeft.clone();
        pRight.position.x = plinthX + roofW / 2 - parapetThick / 2;

        rootGroup.add(pFront, pRear, pLeft, pRight);

        // Stair Mumty Tower
        const mumtyGeo = new THREE.BoxGeometry(10.0, 7.5, 12.0);
        const mumtyMesh = new THREE.Mesh(mumtyGeo, materials.accentStone);
        mumtyMesh.position.set(plinthX - plinthW * 0.15, roofBaseY + slabThickness + 3.75, plinthZ - plinthL * 0.15);
        mumtyMesh.castShadow = true;
        rootGroup.add(mumtyMesh);
      } else {
        // Cutaway Roof: Retain rear half to reveal interior while maintaining architectural massing
        const cutawayL = roofL * 0.45;
        const roofGeo = new THREE.BoxGeometry(roofW, slabThickness, cutawayL);
        const roofMesh = new THREE.Mesh(roofGeo, materials.slabMat);
        roofMesh.position.set(plinthX, roofBaseY + slabThickness / 2, plinthZ - roofL / 2 + cutawayL / 2);
        rootGroup.add(roofMesh);

        const pRear = new THREE.Mesh(new THREE.BoxGeometry(roofW, 2.5, 0.5), materials.extPlaster);
        pRear.position.set(plinthX, roofBaseY + slabThickness + 1.25, plinthZ - roofL / 2 + 0.25);
        rootGroup.add(pRear);
      }
    }

    // 5. Entrance Porch Canopy & Stone Steps
    const groundDoors = layout.floors?.[0]?.doors || layout.doors || [];
    const mainDoor =
      groundDoors.find((d) => d.door_type === "entrance" || d.door_type === "entry") ||
      groundDoors[0];

    if (mainDoor) {
      const mdx = (mainDoor.x1 + mainDoor.x2) / 2;
      const mdz = (mainDoor.y1 + mainDoor.y2) / 2;
      const stepW = (mainDoor.width || 3.2) + 2.0;

      // 3 Architectural Plinth Steps
      for (let s = 0; s < 3; s++) {
        const stepGeo = new THREE.BoxGeometry(stepW + s * 0.4, 0.18, 1.0);
        const stepMesh = new THREE.Mesh(stepGeo, materials.slabMat);
        let offZ = (s + 1) * 1.0;
        if (resolvedFacing === "north") offZ = -offZ;
        stepMesh.position.set(mdx, plinthHeight - (s + 1) * 0.18 + 0.09, mdz + offZ);
        stepMesh.castShadow = true;
        stepMesh.receiveShadow = true;
        rootGroup.add(stepMesh);
      }

      // Porch Canopy
      const canopyGeo = new THREE.BoxGeometry(stepW + 2.0, 0.35, 4.5);
      const canopyMesh = new THREE.Mesh(canopyGeo, materials.canopyMat);
      canopyMesh.position.set(mdx, plinthHeight + 8.5, mdz + (resolvedFacing === "north" ? -2.25 : 2.25));
      canopyMesh.castShadow = true;
      rootGroup.add(canopyMesh);
    }
  }, [
    layout,
    pw,
    pl,
    cx,
    cz,
    plinthHeight,
    floorHeight,
    fullWallHeight,
    slabThickness,
    materials,
    multiFloorStacked,
    isCutawayMode,
    effectiveShowRoof,
    effectiveShowLandscape,
    showVegetationState,
    effectiveLightingPreset,
    isDarkMode,
    resolvedFacing,
    buildFloorGeometry,
  ]);

  // Three.js Mount, HDRI Environment, Postprocessing & Animation Loop
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth || 800;
    const height = mount.clientHeight || 600;

    // 1. Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(isDarkMode ? "#0E1015" : "#F3F4F6");
    sceneRef.current = scene;

    // 2. Camera: Elevated 3/4 Dollhouse Perspective framing the building
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.5, 600);
    cameraRef.current = camera;

    // 3. Renderer with ACES Filmic Tone Mapping and Shadows
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. Post-processing Composer
    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      0.18, // subtle architectural bloom
      0.4,
      0.85
    );
    composer.addPass(bloomPass);

    const outputPass = new OutputPass();
    composer.addPass(outputPass);
    composerRef.current = composer;

    // 5. OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2 - 0.02; // Don't dip below horizon
    controls.minDistance = 15;
    controls.maxDistance = 220;
    controls.target.set(cx, plinthHeight + 4.0, cz);
    controlsRef.current = controls;

    // 6. HDRI Environment via RGBELoader + PMREMGenerator
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();

    const rgbeLoader = new RGBELoader();
    rgbeLoader.load(
      "/environments/sky_architectural.hdr",
      (texture) => {
        const envMap = pmremGenerator.fromEquirectangular(texture).texture;
        scene.environment = envMap;
        texture.dispose();
        pmremGenerator.dispose();
      },
      undefined,
      (err) => {
        console.warn("[Notice] Fallback ambient environment will be used:", err);
      }
    );

    // 7. Architectural Sunlight and Sky Fill
    const sunLight = new THREE.DirectionalLight(0xfffaed, 1.8);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 300;
    const d = Math.max(pw, pl) * 0.9;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.bias = -0.0003;
    scene.add(sunLight);
    sunLightRef.current = sunLight;

    const skyLight = new THREE.HemisphereLight(0xe0f2fe, 0x475569, 0.75);
    scene.add(skyLight);
    skyLightRef.current = skyLight;

    // Set Default 3/4 Dollhouse Camera Position
    const diag = Math.hypot(pw, pl);
    let camX = cx + diag * 0.85;
    let camZ = cz + diag * 0.95;
    if (resolvedFacing === "west") {
      camX = cx - diag * 0.95;
      camZ = cz + diag * 0.65;
    } else if (resolvedFacing === "east") {
      camX = cx + diag * 0.95;
      camZ = cz - diag * 0.65;
    } else if (resolvedFacing === "north") {
      camX = cx + diag * 0.65;
      camZ = cz - diag * 0.95;
    }
    camera.position.set(camX, diag * 0.75, camZ);
    controls.update();

    // 8. Animation & Render Loop
    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);

      // Smooth camera transition
      if (isTransitioningCamera.current) {
        camera.position.lerp(targetCamPos.current, 0.08);
        controls.target.lerp(targetControlsTarget.current, 0.08);
        if (
          camera.position.distanceTo(targetCamPos.current) < 0.2 &&
          controls.target.distanceTo(targetControlsTarget.current) < 0.2
        ) {
          isTransitioningCamera.current = false;
        }
      }

      controls.update();
      if (composerRef.current) {
        composerRef.current.render();
      } else {
        renderer.render(scene, camera);
      }
    };
    animate();

    // 9. Resize Handling
    const handleResize = () => {
      if (!mount) return;
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      composer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", handleResize);
      renderer.dispose();
      pmremGenerator.dispose();
      if (mount && renderer.domElement) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [cx, cz, pw, pl, isDarkMode, resolvedFacing, plinthHeight]);

  // Lighting Mode Updates
  useEffect(() => {
    if (!sunLightRef.current || !skyLightRef.current) return;
    const sun = sunLightRef.current;
    const sky = skyLightRef.current;

    const diag = Math.hypot(pw, pl);

    if (effectiveLightingPreset === "day") {
      sun.color.setHex(0xfffaed);
      sun.intensity = 1.8;
      sun.position.set(cx + diag * 0.6, diag * 0.9, cz + diag * 0.6);
      sky.color.setHex(0xe0f2fe);
      sky.groundColor.setHex(0x475569);
      sky.intensity = 0.75;
    } else if (effectiveLightingPreset === "sunset") {
      sun.color.setHex(0xf59e0b);
      sun.intensity = 1.3;
      sun.position.set(cx - diag * 0.8, diag * 0.35, cz + diag * 0.4);
      sky.color.setHex(0xfb923c);
      sky.groundColor.setHex(0x1e1b4b);
      sky.intensity = 0.55;
    } else if (effectiveLightingPreset === "night") {
      sun.color.setHex(0x93c5fd);
      sun.intensity = 0.35;
      sun.position.set(cx + diag * 0.5, diag * 0.8, cz - diag * 0.5);
      sky.color.setHex(0x1e293b);
      sky.groundColor.setHex(0x090a0f);
      sky.intensity = 0.25;
    }
  }, [effectiveLightingPreset, cx, cz, pw, pl]);

  // Trigger rebuild when layout, mode, or assets change
  useEffect(() => {
    rebuildScene();
  }, [rebuildScene, assetsReady]);

  // Camera Presets
  const handleCameraPreset = (preset: CameraPresetType) => {
    setCameraView(preset);
    setIsCameraMenuOpen(false);
    if (!cameraRef.current || !controlsRef.current) return;
    isTransitioningCamera.current = true;

    const diag = Math.hypot(pw, pl);

    if (preset === "cutaway") {
      setIsCutawayMode(true);
      targetCamPos.current.set(cx + diag * 0.85, diag * 0.7, cz + diag * 0.95);
      targetControlsTarget.current.set(cx, plinthHeight + 4.0, cz);
    } else if (preset === "exterior") {
      setIsCutawayMode(false);
      targetCamPos.current.set(cx + diag * 0.95, diag * 0.65, cz + diag * 1.05);
      targetControlsTarget.current.set(cx, plinthHeight + 4.5, cz);
    } else if (preset === "iso") {
      targetCamPos.current.set(cx + diag * 0.9, diag * 0.9, cz + diag * 0.9);
      targetControlsTarget.current.set(cx, plinthHeight + 3.0, cz);
    } else if (preset === "top") {
      targetCamPos.current.set(cx, diag * 1.8, cz + 0.01);
      targetControlsTarget.current.set(cx, 0, cz);
    } else if (preset === "front") {
      let fz = cz + diag * 1.2;
      let fx = cx;
      if (resolvedFacing === "north") fz = cz - diag * 1.2;
      else if (resolvedFacing === "east") { fx = cx + diag * 1.2; fz = cz; }
      else if (resolvedFacing === "west") { fx = cx - diag * 1.2; fz = cz; }
      targetCamPos.current.set(fx, diag * 0.45, fz);
      targetControlsTarget.current.set(cx, plinthHeight + 4.0, cz);
    } else if (preset === "entrance") {
      targetCamPos.current.set(cx, plinthHeight + 5.5, cz + diag * 0.55);
      targetControlsTarget.current.set(cx, plinthHeight + 3.5, cz);
    } else if (preset === "living" || preset === "kitchen" || preset === "bedroom") {
      const matchRoom = (layout.rooms || []).find((r) =>
        (r.type || "").toLowerCase().includes(preset) || (r.name || "").toLowerCase().includes(preset)
      );
      if (matchRoom && matchRoom.rect) {
        const rx = matchRoom.rect.x + matchRoom.rect.width / 2;
        const rz = matchRoom.rect.y + matchRoom.rect.length / 2;
        targetCamPos.current.set(rx - 8, plinthHeight + 10, rz + 10);
        targetControlsTarget.current.set(rx, plinthHeight + 2.0, rz);
        setIsCutawayMode(true);
      }
    } else if (preset === "garden") {
      targetCamPos.current.set(cx + pw * 0.6, plinthHeight + 8, cz + pl * 0.7);
      targetControlsTarget.current.set(cx, plinthHeight + 1.5, cz + pl * 0.3);
    }
  };

  // 3D Dimension Editing (Width / Depth increments without room dragging)
  const handleAdjustRoomDimension = async (axis: "width" | "length", delta: number) => {
    if (!selectedRoomId) return;
    const room = (layout.rooms || []).find((r) => r.id === selectedRoomId);
    if (!room || !room.rect) return;

    setIsEditingRoom(true);
    const newW = Math.max(6, Math.min(40, room.rect.width + (axis === "width" ? delta : 0)));
    const newL = Math.max(6, Math.min(40, room.rect.length + (axis === "length" ? delta : 0)));

    const proposedRect: Rect = {
      x: room.rect.x,
      y: room.rect.y,
      width: newW,
      length: newL,
    };

    try {
      const res = await editRoomLayoutFull(layout, selectedRoomId, proposedRect, true);
      if (res && res.layout) {
        if (onUpdateLayout) {
          onUpdateLayout(res.layout);
        }
      }
    } catch (err) {
      console.error("[3D EDIT ERROR] Could not adjust room dimension:", err);
    } finally {
      setIsEditingRoom(false);
    }
  };

  // Pointer Click / Tap selection
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const mount = mountRef.current;
    if (!mount || !cameraRef.current || !sceneRef.current) return;
    const rect = mount.getBoundingClientRect();
    pointer.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.current.setFromCamera(pointer.current, cameraRef.current);
    const intersects = raycaster.current.intersectObjects(sceneRef.current.children, true);

    for (const hit of intersects) {
      const uData = hit.object.userData;
      if (uData && uData.roomId) {
        onSelectRoom(uData.roomId);
        return;
      }
    }
  };

  const selectedRoom = useMemo(() => {
    if (!selectedRoomId) return null;
    return (layout.rooms || []).find((r) => r.id === selectedRoomId);
  }, [layout.rooms, selectedRoomId]);

  return (
    <div
      ref={mountRef}
      onPointerDown={handlePointerDown}
      className="relative w-full h-full select-none overflow-hidden bg-[#0E1015]"
    >
      {/* FLOATING TOP BAR CONTROLS */}
      <div className="absolute top-4 left-4 right-4 z-20 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        {/* Left: Presentation Mode & Camera Presets */}
        <div className="flex items-center gap-1.5 p-1 rounded-full bg-[#12141A]/90 backdrop-blur-md border border-white/10 shadow-2xl pointer-events-auto text-xs font-mono text-[#9E9C98]">
          <button
            type="button"
            onClick={() => {
              setIsCutawayMode(true);
              setPresentationMode("cutaway");
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all ${
              isCutawayMode
                ? "bg-[#C48446] text-[#0A0B0E] font-semibold shadow-md"
                : "hover:text-white"
            }`}
          >
            <Scissors className="w-3.5 h-3.5" />
            DOLLHOUSE CUTAWAY
          </button>
          <button
            type="button"
            onClick={() => {
              setIsCutawayMode(false);
              setPresentationMode("exterior");
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all ${
              !isCutawayMode
                ? "bg-[#C48446] text-[#0A0B0E] font-semibold shadow-md"
                : "hover:text-white"
            }`}
          >
            <Building className="w-3.5 h-3.5" />
            FULL EXTERIOR
          </button>

          <div className="w-[1px] h-4 bg-white/10 mx-1" />

          {/* Camera Preset Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsCameraMenuOpen(!isCameraMenuOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-white transition-all"
            >
              <Camera className="w-3.5 h-3.5 text-[#C48446]" />
              <span className="capitalize">{cameraView} View</span>
              <ChevronDown className="w-3 h-3 text-[#9E9C98]" />
            </button>

            {isCameraMenuOpen && (
              <div className="absolute top-full left-0 mt-2 w-44 rounded-xl bg-[#161922] border border-white/10 shadow-2xl overflow-hidden py-1 z-30">
                {[
                  { id: "cutaway", label: "Dollhouse 3/4" },
                  { id: "exterior", label: "Exterior Perspective" },
                  { id: "iso", label: "Isometric 45°" },
                  { id: "top", label: "Top (Plan)" },
                  { id: "front", label: "Front Facade" },
                  { id: "entrance", label: "Main Entrance" },
                  { id: "living", label: "Living Room" },
                  { id: "kitchen", label: "Kitchen" },
                  { id: "bedroom", label: "Master Bedroom" },
                  { id: "garden", label: "Site & Garden" },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleCameraPreset(item.id as CameraPresetType)}
                    className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                      cameraView === item.id
                        ? "bg-[#C48446]/20 text-[#C48446] font-semibold"
                        : "text-[#9E9C98] hover:text-white hover:bg-white/5"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Lighting Atmosphere & Realistic Photo Action */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {/* Lighting Mode */}
          <div className="flex items-center p-1 rounded-full bg-[#12141A]/90 backdrop-blur-md border border-white/10 shadow-2xl text-xs font-mono text-[#9E9C98]">
            <button
              type="button"
              onClick={() => {
                if (onChangeLightingPreset) onChangeLightingPreset("day");
                else setInternalLightingPreset("day");
              }}
              className={`p-1.5 px-2.5 rounded-full flex items-center gap-1 transition-all ${
                effectiveLightingPreset === "day"
                  ? "bg-white/20 text-white font-medium"
                  : "hover:text-white"
              }`}
            >
              <Sun className="w-3.5 h-3.5 text-amber-300" />
              Day
            </button>
            <button
              type="button"
              onClick={() => {
                if (onChangeLightingPreset) onChangeLightingPreset("sunset");
                else setInternalLightingPreset("sunset");
              }}
              className={`p-1.5 px-2.5 rounded-full flex items-center gap-1 transition-all ${
                effectiveLightingPreset === "sunset"
                  ? "bg-white/20 text-white font-medium"
                  : "hover:text-white"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-orange-400" />
              Dusk
            </button>
            <button
              type="button"
              onClick={() => {
                if (onChangeLightingPreset) onChangeLightingPreset("night");
                else setInternalLightingPreset("night");
              }}
              className={`p-1.5 px-2.5 rounded-full flex items-center gap-1 transition-all ${
                effectiveLightingPreset === "night"
                  ? "bg-white/20 text-white font-medium"
                  : "hover:text-white"
              }`}
            >
              <Moon className="w-3.5 h-3.5 text-indigo-300" />
              Night
            </button>
          </div>

          {/* GENERATE REALISTIC PHOTO (BLENDER CYCLES) */}
          <button
            type="button"
            onClick={() => setIsRenderModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-[#C48446] to-[#E59E58] hover:from-[#B37438] hover:to-[#D48D47] text-[#0A0B0E] font-semibold text-xs shadow-xl hover:shadow-orange-500/25 transition-all transform hover:scale-[1.02] active:scale-[0.98]"
          >
            <Sparkles className="w-4 h-4 fill-current" />
            <span>Generate Realistic Photo</span>
          </button>
        </div>
      </div>

      {/* FLOATING SELECTED ROOM 3D DIMENSION CONTROLS */}
      {selectedRoom && selectedRoom.rect && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 p-2 px-4 rounded-2xl bg-[#12141A]/95 backdrop-blur-md border border-[#C48446]/40 shadow-2xl text-white pointer-events-auto">
          <div className="border-r border-white/10 pr-3">
            <span className="text-[10px] font-mono text-[#C48446] block uppercase tracking-wider">
              Selected Space
            </span>
            <span className="text-xs font-semibold block capitalize">
              {selectedRoom.name || selectedRoom.type}
            </span>
            <span className="text-[11px] text-[#9E9C98] font-mono">
              {Math.round(selectedRoom.rect.width)}&apos; × {Math.round(selectedRoom.rect.length)}&apos; ({Math.round(selectedRoom.rect.width * selectedRoom.rect.length)} sqft)
            </span>
          </div>

          {/* Width adjustment */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-mono text-[#9E9C98]">Width:</span>
            <button
              type="button"
              disabled={isEditingRoom}
              onClick={() => handleAdjustRoomDimension("width", -1)}
              className="p-1 rounded-md bg-white/10 hover:bg-white/20 disabled:opacity-40 transition-colors"
              title="Decrease width by 1 ft"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={isEditingRoom}
              onClick={() => handleAdjustRoomDimension("width", 1)}
              className="p-1 rounded-md bg-white/10 hover:bg-white/20 disabled:opacity-40 transition-colors"
              title="Increase width by 1 ft"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Length / Depth adjustment */}
          <div className="flex items-center gap-1.5 pl-2 border-l border-white/10">
            <span className="text-[11px] font-mono text-[#9E9C98]">Depth:</span>
            <button
              type="button"
              disabled={isEditingRoom}
              onClick={() => handleAdjustRoomDimension("length", -1)}
              className="p-1 rounded-md bg-white/10 hover:bg-white/20 disabled:opacity-40 transition-colors"
              title="Decrease depth by 1 ft"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={isEditingRoom}
              onClick={() => handleAdjustRoomDimension("length", 1)}
              className="p-1 rounded-md bg-white/10 hover:bg-white/20 disabled:opacity-40 transition-colors"
              title="Increase depth by 1 ft"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => onSelectRoom(null)}
            className="text-[11px] text-[#9E9C98] hover:text-white ml-2 underline"
          >
            Deselect
          </button>
        </div>
      )}

      {/* ORIENTATION COMPASS INDICATOR (BOTTOM RIGHT) */}
      <div className="absolute bottom-6 right-6 z-10 flex items-center gap-2 p-2 px-3 rounded-full bg-[#12141A]/80 backdrop-blur-sm border border-white/10 text-xs font-mono text-[#9E9C98] pointer-events-none">
        <Compass className="w-4 h-4 text-[#C48446]" />
        <span>Road Facing: <strong className="text-white uppercase">{resolvedFacing}</strong></span>
      </div>

      {/* PHOTOREALISTIC RENDER MODAL */}
      <RealisticRenderModal
        isOpen={isRenderModalOpen}
        onClose={() => setIsRenderModalOpen(false)}
        layout={layout}
        currentLighting={effectiveLightingPreset}
        isCutawayMode={isCutawayMode}
      />
    </div>
  );
};
