"use client";

import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  HouseLayout,
  FloorPlan,
  Room,
  FurnitureItem,
  Wall,
  Door,
  WindowItem,
  LandscapePlan,
  LandscapeElement,
} from "@/types/house";
import {
  generateArchitecturalLandscape,
  buildArchitecturalLandscapeScene,
} from "@/utils/residentialLandscapeGenerator";

export interface Dollhouse3DProps {
  layout: HouseLayout;
  activeFloorIndex: number;
  onSelectFloor?: (floorIndex: number) => void;
  selectedRoomId: string | null;
  selectedFurnitureId?: string | null;
  onSelectRoom: (roomId: string | null) => void;
  onSelectFurniture?: (furnitureId: string | null) => void;
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
}

export type PresentationMode = "exterior" | "interior" | "landscape";

export const Dollhouse3D: React.FC<Dollhouse3DProps> = ({
  layout,
  activeFloorIndex,
  onSelectFloor,
  selectedRoomId,
  selectedFurnitureId,
  onSelectRoom,
  onSelectFurniture,
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
}) => {
  const mountRef = useRef<HTMLDivElement>(null);

  // Dedicated primary presentation modes: EXTERIOR | INTERIOR | LANDSCAPE
  const [presentationMode, setPresentationMode] = useState<PresentationMode>(
    initialPresentationMode || "landscape"
  );
  const [multiFloorStacked, setMultiFloorStacked] = useState(true);
  const [explodedFloors, setExplodedFloors] = useState(false);
  const [cameraView, setCameraView] = useState<"iso" | "top" | "front" | "side">("iso");

  const [internalShowStructure, setInternalShowStructure] = useState(false);
  const effectiveShowStructure = showStructure !== undefined ? showStructure : internalShowStructure;

  const [internalShowLandscape, setInternalShowLandscape] = useState(true);
  const effectiveShowLandscape = showLandscape !== undefined ? showLandscape : internalShowLandscape;
  const [landscapeCategory, setLandscapeCategory] = useState<"all" | "vegetation" | "paths" | "lighting" | "furniture">("all");

  // Three.js Core Refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const houseRootRef = useRef<THREE.Group | null>(null);
  const sunLightRef = useRef<THREE.DirectionalLight | null>(null);
  const skyLightRef = useRef<THREE.HemisphereLight | null>(null);
  const interiorLightsGroupRef = useRef<THREE.Group | null>(null);

  // Smooth Camera Target Lerp Vectors
  const targetCamPos = useRef(new THREE.Vector3());
  const targetControlsTarget = useRef(new THREE.Vector3());
  const isTransitioningCamera = useRef(false);

  // Raycasting for interactive 3D entity selection
  const raycaster = useRef(new THREE.Raycaster());
  const mouse = useRef(new THREE.Vector2());

  const fullWallHeight = 9.5;
  const cutawayWallHeight = 3.5;
  const floorElevation = 10.5;

  const pw = layout.plot_width || 40;
  const pl = layout.plot_length || 50;
  const cx = pw / 2;
  const cz = pl / 2;

  // Real CC0 lightweight assets state
  interface LandscapingAssets {
    bush?: THREE.Group;
    bushDetailed?: THREE.Group;
    flowerPurple?: THREE.Group;
    flowerRed?: THREE.Group;
    flowerYellow?: THREE.Group;
    treeSmall?: THREE.Group;
  }
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const loadedModelsRef = useRef<LandscapingAssets>({});

  // Real CC0 tileable textures (self-hosted in /public/textures)
  const [grassTexture, setGrassTexture] = useState<THREE.Texture | null>(null);
  const [paverTexture, setPaverTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const loader = new THREE.TextureLoader();
    let mounted = true;

    loader.load(
      "/textures/grass.jpg",
      (tex) => {
        if (!mounted) return;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(Math.max(4, Math.round(pw / 5)), Math.max(4, Math.round(pl / 5)));
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.needsUpdate = true;
        setGrassTexture(tex);
      },
      undefined,
      (err) => console.warn("Notice: /textures/grass.jpg fallback will be used:", err)
    );

    loader.load(
      "/textures/pavers.jpg",
      (tex) => {
        if (!mounted) return;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(2, 6);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.needsUpdate = true;
        setPaverTexture(tex);
      },
      undefined,
      (err) => console.warn("Notice: /textures/pavers.jpg fallback will be used:", err)
    );

    return () => {
      mounted = false;
    };
  }, [pw, pl]);

  // Preload CC0 low-poly nature models (Kenney Nature Kit)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const loader = new GLTFLoader();
    const assets: Record<keyof LandscapingAssets, string> = {
      bush: "/models/bush.glb",
      bushDetailed: "/models/bush_detailed.glb",
      flowerPurple: "/models/flower_purple.glb",
      flowerRed: "/models/flower_red.glb",
      flowerYellow: "/models/flower_yellow.glb",
      treeSmall: "/models/tree_small.glb",
    };

    let mounted = true;
    let loaded = 0;
    const total = Object.keys(assets).length;

    Object.entries(assets).forEach(([key, path]) => {
      loader.load(
        path,
        (gltf) => {
          if (!mounted) return;
          gltf.scene.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });
          loadedModelsRef.current[key as keyof LandscapingAssets] = gltf.scene;
          loaded++;
          if (loaded === total) {
            setModelsLoaded(true);
          }
        },
        undefined,
        (err) => {
          console.warn(`Error loading model ${path}:`, err);
          loaded++;
          if (loaded === total) {
            setModelsLoaded(true);
          }
        }
      );
    });

    return () => {
      mounted = false;
    };
  }, []);

  // ==========================================
  // PROCEDURAL HIGH-QUALITY PBR TEXTURES
  // ==========================================
  const createWoodTexture = useCallback((isDark: boolean, tintHex: string = "#E4D5B7") => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    if (!ctx) return new THREE.Texture();

    ctx.fillStyle = isDark ? "#2C2218" : tintHex;
    ctx.fillRect(0, 0, 512, 512);

    ctx.fillStyle = isDark ? "#1C150F" : "rgba(0,0,0,0.08)";
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
    tex.repeat.set(3, 3);
    return tex;
  }, []);

  const createTileTexture = useCallback((isDark: boolean, baseColor: string = "#FAF9F6", gridColor: string = "#E2DDD5") => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    if (!ctx) return new THREE.Texture();

    ctx.fillStyle = isDark ? "#262626" : baseColor;
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = isDark ? "#3F3F46" : gridColor;
    ctx.lineWidth = 2.5;
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
    tex.repeat.set(2, 2);
    return tex;
  }, []);

  const createGrassTexture = useCallback(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    if (!ctx) return new THREE.Texture();

    ctx.fillStyle = "#4E8A37";
    ctx.fillRect(0, 0, 512, 512);

    // Subtle natural grass blades and organic noise
    for (let i = 0; i < 4000; i++) {
      const gx = Math.random() * 512;
      const gy = Math.random() * 512;
      const shade = Math.random() > 0.5 ? "#3F752B" : "#5DA143";
      ctx.fillStyle = shade;
      ctx.fillRect(gx, gy, 2, 4);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(6, 6);
    return tex;
  }, []);

  const createPaverTexture = useCallback(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    if (!ctx) return new THREE.Texture();

    ctx.fillStyle = "#D6D3D1";
    ctx.fillRect(0, 0, 512, 512);

    ctx.strokeStyle = "#A8A29E";
    ctx.lineWidth = 3;
    for (let y = 0; y < 512; y += 64) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(512, y);
      ctx.stroke();

      const offset = (y / 64) % 2 === 0 ? 0 : 32;
      for (let x = offset; x <= 512; x += 64) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + 64);
        ctx.stroke();
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(4, 4);
    return tex;
  }, []);

  const createStoneAccentTexture = useCallback(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    if (!ctx) return new THREE.Texture();

    ctx.fillStyle = "#2D323E";
    ctx.fillRect(0, 0, 512, 512);

    ctx.fillStyle = "#374151";
    for (let y = 0; y < 512; y += 40) {
      ctx.fillRect(0, y, 512, 2);
      for (let x = (y % 80 === 0 ? 0 : 60); x < 512; x += 120) {
        ctx.fillRect(x, y, 2, 40);
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 2);
    return tex;
  }, []);

  // Room Type to Floor Material Mapper (matches 2D floor plan color language)
  const getRoomFloorMaterial = useCallback(
    (room: Room, isDark: boolean): THREE.MeshStandardMaterial => {
      const type = (room.type || "").toLowerCase();
      const name = (room.name || "").toLowerCase();

      // Master Bedroom: Rich Warm Oak Hardwood
      if (type.includes("master") || name.includes("master")) {
        return new THREE.MeshStandardMaterial({
          color: isDark ? "#38271A" : "#C49A6C",
          roughness: 0.42,
          metalness: 0.04,
          map: createWoodTexture(isDark, "#C49A6C"),
        });
      }

      // Guest / Other Bedrooms: Smoked Walnut Wood
      if (type.includes("bed") || name.includes("bed") || type.includes("guest")) {
        return new THREE.MeshStandardMaterial({
          color: isDark ? "#281D14" : "#A67C52",
          roughness: 0.46,
          metalness: 0.03,
          map: createWoodTexture(isDark, "#A67C52"),
        });
      }

      // Kitchen: Ivory Porcellanato Tile
      if (type.includes("kitchen") || name.includes("kitchen")) {
        return new THREE.MeshStandardMaterial({
          color: isDark ? "#2A2A2E" : "#EAE5DC",
          roughness: 0.28,
          metalness: 0.08,
          map: createTileTexture(isDark, "#EAE5DC", "#D3CCC1"),
        });
      }

      // Bathrooms / Toilet / Powder: Calacatta White Marble Tile
      if (type.includes("bath") || type.includes("toilet") || type.includes("powder") || name.includes("bath")) {
        return new THREE.MeshStandardMaterial({
          color: isDark ? "#202226" : "#F5F6F8",
          roughness: 0.18,
          metalness: 0.12,
          map: createTileTexture(isDark, "#F5F6F8", "#E2E4E8"),
        });
      }

      // Living Room: Travertine / Terrazzo Stone
      if (type.includes("living") || name.includes("living") || type.includes("drawing")) {
        return new THREE.MeshStandardMaterial({
          color: isDark ? "#2E2A25" : "#EFE8DC",
          roughness: 0.48,
          metalness: 0.04,
        });
      }

      // Dining: Polished Natural Wood / Stone
      if (type.includes("dining") || name.includes("dining")) {
        return new THREE.MeshStandardMaterial({
          color: isDark ? "#33261C" : "#E5D9C8",
          roughness: 0.45,
          metalness: 0.04,
          map: createWoodTexture(isDark, "#E5D9C8"),
        });
      }

      // Pooja Sanctuary: Teakwood / Rosewood
      if (type.includes("pooja") || name.includes("pooja") || type.includes("mandir")) {
        return new THREE.MeshStandardMaterial({
          color: isDark ? "#301509" : "#6E331A",
          roughness: 0.38,
          metalness: 0.05,
        });
      }

      // Foyer & Circulation: Honed Limestone
      return new THREE.MeshStandardMaterial({
        color: isDark ? "#242528" : "#EBE6DD",
        roughness: 0.52,
        metalness: 0.03,
      });
    },
    [createWoodTexture, createTileTexture]
  );

  // ==========================================
  // BUILD SINGLE FLOOR ARCHITECTURAL GEOMETRY
  // ==========================================
  const buildFloorGeometry = useCallback(
    (
      floor: FloorPlan,
      floorIndex: number,
      yOffset: number,
      isExteriorView: boolean,
      materials: Record<string, THREE.Material>,
      interiorLights: THREE.Group
    ): THREE.Group => {
      const floorGroup = new THREE.Group();
      floorGroup.position.y = yOffset;

      const {
        extWallMat,
        extWallAccentMat,
        intWallMat,
        wallTrimMat,
        glassMat,
        frameMat,
        doorLeafMat,
        curtainMat,
      } = materials;

      const effectiveWallH = isExteriorView ? fullWallHeight : cutawayWallHeight;

      // 1. Structural Finished Floor Slabs for each Room
      (floor.rooms || []).forEach((room) => {
        if (!room || !room.rect) return;
        const rw = Math.max(1, room.rect.width);
        const rl = Math.max(1, room.rect.length);
        const rx = room.rect.x + rw / 2;
        const rz = room.rect.y + rl / 2;

        const floorMat = getRoomFloorMaterial(room, isDarkMode);

        // Finished Floor Surface (Raised slightly above 0.5ft plinth to prevent clipping)
        const floorGeo = new THREE.PlaneGeometry(Math.max(0.1, rw - 0.04), Math.max(0.1, rl - 0.04));
        const floorMesh = new THREE.Mesh(floorGeo, floorMat);
        floorMesh.rotation.x = -Math.PI / 2;
        floorMesh.position.set(rx, 0.52, rz);
        floorMesh.receiveShadow = true;
        floorMesh.userData = { roomId: room.id, type: "room_floor" };
        floorGroup.add(floorMesh);

        // Highlight selected room
        if (selectedRoomId === room.id) {
          const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(rw, 0.08, rl));
          const lineMat = new THREE.LineBasicMaterial({ color: 0xc48446, linewidth: 3 });
          const wireframe = new THREE.LineSegments(edges, lineMat);
          wireframe.position.set(rx, 0.56, rz);
          floorGroup.add(wireframe);
        }

        // Room Downlights in dusk mode
        if (lightingPreset === "sunset" || lightingPreset === "night") {
          const roomLight = new THREE.PointLight(0xffecd1, lightingPreset === "night" ? 0.8 : 0.45, 20);
          roomLight.position.set(rx, 0.52 + 7.5, rz);
          roomLight.castShadow = false;
          interiorLights.add(roomLight);
        }

        // 2. Furnished Interior (Always rendered inside cutaway mode; hidden in solid exterior view)
        if (!isExteriorView) {
          (room.furniture || []).forEach((item) => {
            if (!item) return;
            const fMesh = buildArchitecturalFurniture(item, room.type, isDarkMode, selectedFurnitureId === item.id);
            if (fMesh) {
              const itemX = item.x !== undefined ? item.x : rx;
              const itemZ = item.y !== undefined ? item.y : rz;
              fMesh.position.set(itemX, 0.52, itemZ);
              fMesh.rotation.y = -THREE.MathUtils.degToRad(item.rotation || 0);
              fMesh.userData = { furnitureId: item.id, roomId: room.id };
              floorGroup.add(fMesh);
            }
          });
        }
      });

      // 3. Real Architectural Staircase connecting floors (Rendered ONLY in Interior/cutaway mode)
      if (!isExteriorView) {
        const stairRooms = (floor.rooms || []).filter(
          (r) => r.type === "staircase" || r.name.toLowerCase().includes("stair")
        );
        stairRooms.forEach((stairRoom) => {
          if (!stairRoom.rect) return;
          const stairMesh = buildArchitecturalStaircase(
            stairRoom.rect,
            floorElevation,
            materials.wallTrimMat,
            materials.frameMat
          );
          if (stairMesh) {
            stairMesh.position.y = 0.52;
            floorGroup.add(stairMesh);
          }
        });
      }

      // 4. Canonical Wall Network with PHYSICAL OPENINGS
      const allWalls: Wall[] = [
        ...(floor.exterior_walls || []).map((w) => ({ ...w, is_exterior: true })),
        ...(floor.interior_walls || []).map((w) => ({ ...w, is_exterior: false })),
      ];

      allWalls.forEach((wall, wallIdx) => {
        const dx = wall.x2 - wall.x1;
        const dz = wall.y2 - wall.y1;
        const wallLen = Math.hypot(dx, dz);
        if (wallLen < 0.3) return;

        const angle = Math.atan2(dz, dx);
        const ux = dx / wallLen;
        const uz = dz / wallLen;

        const isExt = wall.is_exterior;
        const thickness = wall.thickness || (isExt ? 0.75 : 0.375);

        // Exterior multi-material distinction: Alternate accent stone on certain exterior walls
        const wallMat = isExt
          ? wallIdx % 3 === 0
            ? extWallAccentMat
            : extWallMat
          : intWallMat;

        // Wall Height:
        // Exterior view: Solid 9.5ft massed walls
        // Interior view: 3.5ft for exterior front walls, 4.2ft for interior partitions
        const activeH = isExteriorView ? fullWallHeight : cutawayWallHeight;

        // Detect openings hosted along this wall
        type OpeningInterval = {
          type: "door" | "window";
          id: string;
          start: number;
          end: number;
          width: number;
          midX: number;
          midZ: number;
        };

        const openings: OpeningInterval[] = [];

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

        (floor.windows || []).forEach((w) => {
          const wmx = (w.x1 + w.x2) / 2;
          const wmz = (w.y1 + w.y2) / 2;
          const distToStart = Math.hypot(wmx - wall.x1, wmz - wall.y1);
          const distToEnd = Math.hypot(wmx - wall.x2, wmz - wall.y2);
          if (Math.abs(distToStart + distToEnd - wallLen) < 0.6) {
            const sMid = (wmx - wall.x1) * ux + (wmz - wall.y1) * uz;
            const winW = Math.max(2.0, w.width || 4.0);
            openings.push({
              type: "window",
              id: w.id,
              start: Math.max(0, sMid - winW / 2),
              end: Math.min(wallLen, sMid + winW / 2),
              width: winW,
              midX: wmx,
              midZ: wmz,
            });
          }
        });

        if (openings.length === 0) {
          // Solid Wall Segment
          const geo = new THREE.BoxGeometry(wallLen, activeH, thickness);
          const mesh = new THREE.Mesh(geo, wallMat);
          mesh.position.set((wall.x1 + wall.x2) / 2, 0.5 + activeH / 2, (wall.y1 + wall.y2) / 2);
          mesh.rotation.y = -angle;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          floorGroup.add(mesh);
        } else {
          // Subdivided Wall Segments with Openings
          openings.sort((a, b) => a.start - b.start);
          let currentS = 0;

          openings.forEach((op) => {
            const segLen = op.start - currentS;
            if (segLen > 0.25) {
              const segMidS = currentS + segLen / 2;
              const mx = wall.x1 + ux * segMidS;
              const mz = wall.y1 + uz * segMidS;

              const geo = new THREE.BoxGeometry(segLen, activeH, thickness);
              const mesh = new THREE.Mesh(geo, wallMat);
              mesh.position.set(mx, 0.5 + activeH / 2, mz);
              mesh.rotation.y = -angle;
              mesh.castShadow = true;
              mesh.receiveShadow = true;
              floorGroup.add(mesh);
            }

            // Window Elements: Lintel, Sill, Reflective Glass Pane, Aluminum Frame, Curtains
            if (op.type === "window") {
              const sillH = 2.8;
              const headH = 7.0;
              const winH = headH - sillH;

              // Sill Wall below window
              if (activeH >= sillH) {
                const sH = Math.min(sillH, activeH);
                const sGeo = new THREE.BoxGeometry(op.width, sH, thickness);
                const sMesh = new THREE.Mesh(sGeo, wallMat);
                sMesh.position.set(op.midX, 0.5 + sH / 2, op.midZ);
                sMesh.rotation.y = -angle;
                sMesh.castShadow = true;
                sMesh.receiveShadow = true;
                floorGroup.add(sMesh);
              }

              // Lintel Wall above window (in full height exterior view)
              if (activeH >= fullWallHeight) {
                const lH = fullWallHeight - headH;
                const lGeo = new THREE.BoxGeometry(op.width, lH, thickness);
                const lMesh = new THREE.Mesh(lGeo, wallMat);
                lMesh.position.set(op.midX, 0.5 + headH + lH / 2, op.midZ);
                lMesh.rotation.y = -angle;
                lMesh.castShadow = true;
                lMesh.receiveShadow = true;
                floorGroup.add(lMesh);
              }

              // Glass Pane & Modern Aluminum Frame
              if (activeH >= sillH + 0.5) {
                const renderWinH = Math.min(winH, activeH - sillH);

                // Semi-Transparent Reflective Glass Pane
                const gGeo = new THREE.BoxGeometry(op.width - 0.1, renderWinH - 0.1, 0.08);
                const gMesh = new THREE.Mesh(gGeo, glassMat);
                gMesh.position.set(op.midX, 0.5 + sillH + renderWinH / 2, op.midZ);
                gMesh.rotation.y = -angle;
                floorGroup.add(gMesh);

                // Thin Perimeter Aluminum Frame
                const frameThick = 0.15;
                const fTop = new THREE.Mesh(new THREE.BoxGeometry(op.width, frameThick, thickness + 0.05), frameMat);
                fTop.position.set(op.midX, 0.5 + sillH + renderWinH, op.midZ);
                fTop.rotation.y = -angle;
                const fBot = new THREE.Mesh(new THREE.BoxGeometry(op.width, frameThick, thickness + 0.05), frameMat);
                fBot.position.set(op.midX, 0.5 + sillH, op.midZ);
                fBot.rotation.y = -angle;
                floorGroup.add(fTop, fBot);

                // Indian Architectural RCC Chajja (Sunshade)
                if (isExt) {
                  const chajjaProj = 1.5;
                  const chajjaThick = 0.25;
                  const chajjaW = op.width + 1.0;
                  const normX = -Math.sin(angle);
                  const normZ = Math.cos(angle);
                  const chajjaGeo = new THREE.BoxGeometry(chajjaW, chajjaThick, chajjaProj);
                  const chajjaMesh = new THREE.Mesh(chajjaGeo, materials.terraceMat);
                  chajjaMesh.position.set(
                    op.midX + normX * (chajjaProj / 2 + thickness / 2),
                    0.5 + headH + chajjaThick / 2,
                    op.midZ + normZ * (chajjaProj / 2 + thickness / 2)
                  );
                  chajjaMesh.rotation.y = -angle;
                  chajjaMesh.castShadow = true;
                  chajjaMesh.receiveShadow = true;
                  floorGroup.add(chajjaMesh);
                }

                // Curtained Windows in Bedrooms
                if (!isExteriorView) {
                  const curtainL = new THREE.Mesh(new THREE.BoxGeometry(0.5, renderWinH * 0.95, 0.2), curtainMat);
                  const offsetNormX = -Math.sin(angle) * 0.35;
                  const offsetNormZ = Math.cos(angle) * 0.35;
                  curtainL.position.set(op.midX - (ux * op.width) / 2 + 0.3 + offsetNormX, 0.5 + sillH + renderWinH / 2, op.midZ - (uz * op.width) / 2 + offsetNormZ);
                  curtainL.rotation.y = -angle;
                  const curtainR = curtainL.clone();
                  curtainR.position.set(op.midX + (ux * op.width) / 2 - 0.3 + offsetNormX, 0.5 + sillH + renderWinH / 2, op.midZ + (uz * op.width) / 2 + offsetNormZ);
                  floorGroup.add(curtainL, curtainR);
                }
              }
            }

            // Door Opening: Lintel + Door Leaf
            if (op.type === "door") {
              const doorHeadH = 7.0;
              if (activeH >= fullWallHeight) {
                const lH = fullWallHeight - doorHeadH;
                const lGeo = new THREE.BoxGeometry(op.width, lH, thickness);
                const lMesh = new THREE.Mesh(lGeo, wallMat);
                lMesh.position.set(op.midX, 0.5 + doorHeadH + lH / 2, op.midZ);
                lMesh.rotation.y = -angle;
                lMesh.castShadow = true;
                lMesh.receiveShadow = true;
                floorGroup.add(lMesh);
              }

              // Wooden Door Leaf
              const renderDoorH = Math.min(doorHeadH, activeH);
              const leafGeo = new THREE.BoxGeometry(op.width - 0.1, renderDoorH, 0.15);
              const leafMesh = new THREE.Mesh(leafGeo, doorLeafMat);
              leafMesh.position.set(op.midX, 0.5 + renderDoorH / 2, op.midZ);
              leafMesh.rotation.y = -angle;
              leafMesh.castShadow = true;
              floorGroup.add(leafMesh);
            }

            currentS = op.end;
          });

          // Final wall segment after last opening
          if (wallLen - currentS > 0.25) {
            const segLen = wallLen - currentS;
            const segMidS = currentS + segLen / 2;
            const mx = wall.x1 + ux * segMidS;
            const mz = wall.y1 + uz * segMidS;

            const geo = new THREE.BoxGeometry(segLen, activeH, thickness);
            const mesh = new THREE.Mesh(geo, wallMat);
            mesh.position.set(mx, 0.5 + activeH / 2, mz);
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
      isDarkMode,
      fullWallHeight,
      cutawayWallHeight,
      floorElevation,
      selectedRoomId,
      selectedFurnitureId,
      lightingPreset,
    ]
  );

  // ==========================================
  // BUILD COMPLETE 3D SCENE
  // ==========================================
  const rebuildScene = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (houseRootRef.current) {
      scene.remove(houseRootRef.current);
    }
    const rootGroup = new THREE.Group();
    scene.add(rootGroup);
    houseRootRef.current = rootGroup;

    if (interiorLightsGroupRef.current) {
      scene.remove(interiorLightsGroupRef.current);
    }
    const interiorLights = new THREE.Group();
    scene.add(interiorLights);
    interiorLightsGroupRef.current = interiorLights;

    // Architectural PBR Materials
    const materials: Record<string, THREE.Material> = {
      // Primary Exterior Wall: Warm Off-White Stucco
      extWallMat: new THREE.MeshStandardMaterial({
        color: isDarkMode ? "#2D3039" : "#F4F1EA",
        roughness: 0.82,
        metalness: 0.02,
      }),
      // Accent Exterior Wall: Dark Charcoal Stone Cladding
      extWallAccentMat: new THREE.MeshStandardMaterial({
        color: isDarkMode ? "#1F232B" : "#2E333D",
        roughness: 0.65,
        metalness: 0.05,
        map: createStoneAccentTexture(),
      }),
      // Interior Partition Plaster
      intWallMat: new THREE.MeshStandardMaterial({
        color: isDarkMode ? "#26282E" : "#FAF8F5",
        roughness: 0.78,
      }),
      wallTrimMat: new THREE.MeshStandardMaterial({
        color: isDarkMode ? "#453325" : "#6B4423",
        roughness: 0.45,
      }),
      // Semi-Transparent Reflective Window Glass
      glassMat: new THREE.MeshStandardMaterial({
        color: "#7DD3FC",
        transparent: true,
        opacity: 0.38,
        roughness: 0.08,
        metalness: 0.25,
        depthWrite: false,
      }),
      // Aluminum Window Frame
      frameMat: new THREE.MeshStandardMaterial({
        color: "#1E242B",
        roughness: 0.4,
        metalness: 0.85,
      }),
      // Wooden Door Leaf
      doorLeafMat: new THREE.MeshStandardMaterial({
        color: isDarkMode ? "#3D2617" : "#78350F",
        roughness: 0.5,
      }),
      // Bedroom Curtains
      curtainMat: new THREE.MeshStandardMaterial({
        color: isDarkMode ? "#4B463E" : "#D4CCC0",
        roughness: 0.9,
      }),
      // RCC Slab / Terrace
      terraceMat: new THREE.MeshStandardMaterial({
        color: isDarkMode ? "#27272A" : "#C4C8CC",
        roughness: 0.85,
        metalness: 0.05,
      }),
      // Plinth Foundation
      plinthMat: new THREE.MeshStandardMaterial({
        color: isDarkMode ? "#1E2024" : "#CBD5E1",
        roughness: 0.85,
        metalness: 0.05,
      }),
      // Boundary Masonry Wall
      boundaryMat: new THREE.MeshStandardMaterial({
        color: isDarkMode ? "#2D3036" : "#E8E4DC",
        roughness: 0.85,
      }),
      // Wall / Parapet Coping
      copingMat: new THREE.MeshStandardMaterial({
        color: "#27272A",
        roughness: 0.5,
      }),
      // Steel Gate
      gateMat: new THREE.MeshStandardMaterial({
        color: "#18181B",
        roughness: 0.35,
        metalness: 0.85,
      }),
      // Entrance Canopy
      canopyMat: new THREE.MeshStandardMaterial({
        color: "#C48446",
        roughness: 0.5,
        metalness: 0.2,
      }),
      // Paved Walkway & Driveway
      paverMat: new THREE.MeshStandardMaterial({
        color: "#ECEAE6",
        map: paverTexture || createPaverTexture(),
        roughness: 0.72,
      }),
      // Natural Grass Ground
      grassMat: new THREE.MeshStandardMaterial({
        color: "#5B8C3A",
        map: grassTexture || createGrassTexture(),
        roughness: 0.88,
        metalness: 0.02,
      }),
      // Dark Soil / Mulch Beds
      soilMat: new THREE.MeshStandardMaterial({
        color: "#30251C",
        roughness: 0.95,
      }),
      // Carport Pergola
      carportMat: new THREE.MeshStandardMaterial({
        color: "#27272A",
        roughness: 0.45,
        metalness: 0.7,
      }),
      // Stone Curbing
      curbMat: new THREE.MeshStandardMaterial({
        color: "#3F3F46",
        roughness: 0.65,
      }),
    };

    // 1. BUILDING FOOTPRINT CALCULATION & FOUNDATION PLINTH
    let minBx = Infinity;
    let maxBx = -Infinity;
    let minBz = Infinity;
    let maxBz = -Infinity;

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

    // Raised Plinth Foundation (Height 0.5ft, finished top at y=0.5)
    const plinthGeo = new THREE.BoxGeometry(plinthW, 0.5, plinthL);
    const plinthMesh = new THREE.Mesh(plinthGeo, materials.plinthMat);
    plinthMesh.position.set(plinthX, 0.25, plinthZ);
    plinthMesh.receiveShadow = true;
    rootGroup.add(plinthMesh);

    // 2. SITE & CANONICAL RESIDENTIAL ARCHITECTURAL LANDSCAPE
    const isLandscape = presentationMode === "landscape";
    const isExterior = presentationMode === "exterior";
    const isExteriorView = isLandscape || isExterior;
    const showSiteAndLandscape = isLandscape || (isExterior && effectiveShowLandscape);

    if (showSiteAndLandscape) {
      const landscapeModel = generateArchitecturalLandscape(layout);
      const landscapeScene = buildArchitecturalLandscapeScene(
        landscapeModel,
        materials,
        loadedModelsRef.current as Record<string, THREE.Group>,
        {
          filterCategory: landscapeCategory,
          lightingPreset,
          isDarkMode,
        }
      );
      rootGroup.add(landscapeScene);
    }

    // 3. FLOORS GENERATION (SINGLE FLOOR OR MULTI-FLOOR STACKED)
    const numFloors = Math.max(1, layout.floors?.length || layout.num_floors || 1);
    const floorSpacing = multiFloorStacked && explodedFloors ? floorElevation + 8.0 : floorElevation;

    if (multiFloorStacked) {
      // Stack all floors in full architectural residence mode
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

        const yOffset = fIdx * floorSpacing;
        const flGroup = buildFloorGeometry(
          floorPlan,
          fIdx,
          yOffset,
          isExteriorView,
          materials,
          interiorLights
        );
        rootGroup.add(flGroup);

        // Intermediate RCC Slab between floors
        if (fIdx > 0) {
          const slabGeo = new THREE.BoxGeometry(plinthW, 0.6, plinthL);
          const slabMesh = new THREE.Mesh(slabGeo, materials.terraceMat);
          slabMesh.position.set(plinthX, yOffset - 0.3, plinthZ);
          slabMesh.castShadow = true;
          slabMesh.receiveShadow = true;
          rootGroup.add(slabMesh);
        }
      });
    } else {
      // Single isolated floor
      const activeFl: FloorPlan =
        layout.floors && layout.floors[activeFloorIndex]
          ? layout.floors[activeFloorIndex]
          : {
              floor_number: activeFloorIndex + 1,
              floor_name: `Level ${activeFloorIndex + 1}`,
              rooms: layout.rooms || [],
              exterior_walls: layout.exterior_walls || [],
              interior_walls: layout.interior_walls || [],
              doors: layout.doors || [],
              windows: layout.windows || [],
            };

      const yOffset = isExteriorView ? activeFloorIndex * floorElevation : 0;
      const flGroup = buildFloorGeometry(
        activeFl,
        activeFloorIndex,
        yOffset,
        isExteriorView,
        materials,
        interiorLights
      );
      rootGroup.add(flGroup);
    }

    // 3b. Column and Beam Structural Layer (when effectiveShowStructure is enabled)
    if (effectiveShowStructure && layout.structural_planning?.columns) {
      const colMat = new THREE.MeshStandardMaterial({
        color: "#374151",
        roughness: 0.6,
        metalness: 0.3,
      });
      const beamMat = new THREE.MeshStandardMaterial({
        color: "#4B5563",
        roughness: 0.7,
        metalness: 0.2,
      });
      layout.structural_planning.columns.forEach((col) => {
        const colW = col.width || 0.75;
        const totalColH = floorSpacing * numFloors;
        const colGeo = new THREE.BoxGeometry(colW, totalColH, colW);
        const colMesh = new THREE.Mesh(colGeo, colMat);
        colMesh.position.set(col.x, totalColH / 2 + 0.5, col.y);
        colMesh.castShadow = true;
        rootGroup.add(colMesh);
      });
      // Ring tie beams at each floor slab level
      for (let fIdx = 0; fIdx < numFloors; fIdx++) {
        const beamY = (fIdx + 1) * floorSpacing - 0.3;
        (layout.exterior_walls || []).forEach((w) => {
          const bdx = w.x2 - w.x1;
          const bdz = w.y2 - w.y1;
          const bLen = Math.hypot(bdx, bdz);
          if (bLen < 1.0) return;
          const bAngle = Math.atan2(bdz, bdx);
          const beamGeo = new THREE.BoxGeometry(bLen, 0.6, 0.75);
          const beamMesh = new THREE.Mesh(beamGeo, beamMat);
          beamMesh.position.set((w.x1 + w.x2) / 2, beamY, (w.y1 + w.y2) / 2);
          beamMesh.rotation.y = -bAngle;
          rootGroup.add(beamMesh);
        });
      }
    }

    // 4. RCC ROOF SLAB, PARAPET & STAIR MUMTY (IN EXTERIOR & LANDSCAPE MODES)
    if (isExteriorView && showRoof) {
      const topFloorY = multiFloorStacked
        ? (numFloors - 1) * floorSpacing + fullWallHeight
        : (activeFloorIndex + 1) * floorElevation;

      // Cantilevered RCC Roof Slab (1.2ft overhang)
      const roofW = plinthW + 1.6;
      const roofL = plinthL + 1.6;
      const roofGeo = new THREE.BoxGeometry(roofW, 0.6, roofL);
      const roofMesh = new THREE.Mesh(roofGeo, materials.terraceMat);
      roofMesh.position.set(plinthX, topFloorY + 0.3, plinthZ);
      roofMesh.castShadow = true;
      roofMesh.receiveShadow = true;
      rootGroup.add(roofMesh);

      // Perimeter Parapet Wall (2.5ft height with coping)
      const parapetH = 2.5;
      const parapetThick = 0.5;
      const pFront = new THREE.Mesh(
        new THREE.BoxGeometry(roofW, parapetH, parapetThick),
        materials.extWallMat
      );
      pFront.position.set(plinthX, topFloorY + 0.6 + parapetH / 2, plinthZ + roofL / 2 - parapetThick / 2);
      const pRear = pFront.clone();
      pRear.position.z = plinthZ - roofL / 2 + parapetThick / 2;

      const pLeft = new THREE.Mesh(
        new THREE.BoxGeometry(parapetThick, parapetH, roofL),
        materials.extWallMat
      );
      pLeft.position.set(plinthX - roofW / 2 + parapetThick / 2, topFloorY + 0.6 + parapetH / 2, plinthZ);
      const pRight = pLeft.clone();
      pRight.position.x = plinthX + roofW / 2 - parapetThick / 2;

      rootGroup.add(pFront, pRear, pLeft, pRight);

      // Coping Cap along Parapet
      const copingH = 0.15;
      const cFront = new THREE.Mesh(new THREE.BoxGeometry(roofW + 0.2, copingH, parapetThick + 0.2), materials.copingMat);
      cFront.position.set(plinthX, topFloorY + 0.6 + parapetH + copingH / 2, plinthZ + roofL / 2 - parapetThick / 2);
      const cRear = cFront.clone();
      cRear.position.z = plinthZ - roofL / 2 + parapetThick / 2;
      const cLeft = new THREE.Mesh(new THREE.BoxGeometry(parapetThick + 0.2, copingH, roofL + 0.2), materials.copingMat);
      cLeft.position.set(plinthX - roofW / 2 + parapetThick / 2, topFloorY + 0.6 + parapetH + copingH / 2, plinthZ);
      const cRight = cLeft.clone();
      cRight.position.x = plinthX + roofW / 2 - parapetThick / 2;
      rootGroup.add(cFront, cRear, cLeft, cRight);

      // Staircase Mumty Tower (Overhead Headroom Box on Roof)
      const mumtyW = 10.0;
      const mumtyL = 12.0;
      const mumtyH = 7.5;
      const mumtyGeo = new THREE.BoxGeometry(mumtyW, mumtyH, mumtyL);
      const mumtyMesh = new THREE.Mesh(mumtyGeo, materials.extWallAccentMat);
      mumtyMesh.position.set(plinthX - plinthW * 0.15, topFloorY + 0.6 + mumtyH / 2, plinthZ - plinthL * 0.15);
      mumtyMesh.castShadow = true;
      mumtyMesh.receiveShadow = true;
      rootGroup.add(mumtyMesh);
    }

    // 5. FRONT ENTRANCE PORCH CANOPY & STONE STEPS
    const mainDoor = (layout.doors || []).find((d) => d.door_type === "entry") || (layout.doors || [])[0];
    if (mainDoor) {
      const stepW = (mainDoor.width || 3.2) + 1.6;
      const stepRun = 0.9;
      const mdx = (mainDoor.x1 + mainDoor.x2) / 2;
      const mdz = (mainDoor.y1 + mainDoor.y2) / 2;
      const dAngle = Math.atan2(mainDoor.y2 - mainDoor.y1, mainDoor.x2 - mainDoor.x1);
      const nx = -Math.sin(dAngle);
      const nz = Math.cos(dAngle);

      // 3 Architectural Stone Entrance Treads
      for (let sIdx = 0; sIdx < 3; sIdx++) {
        const sGeo = new THREE.BoxGeometry(stepW + sIdx * 0.4, 0.16, stepRun);
        const sMesh = new THREE.Mesh(sGeo, materials.terraceMat);
        sMesh.position.set(
          mdx + nx * (1.2 + sIdx * stepRun),
          0.5 - (sIdx + 1) * 0.16 + 0.08,
          mdz + nz * (1.2 + sIdx * stepRun)
        );
        sMesh.rotation.y = -dAngle;
        sMesh.castShadow = true;
        sMesh.receiveShadow = true;
        rootGroup.add(sMesh);
      }

      // Modern Cantilevered Porch Canopy
      const canopyW = stepW + 2.5;
      const canopyProj = 4.5;
      const canopyGeo = new THREE.BoxGeometry(canopyW, 0.35, canopyProj);
      const canopyMesh = new THREE.Mesh(canopyGeo, materials.canopyMat);
      canopyMesh.position.set(mdx + nx * (canopyProj / 2 + 0.4), 8.5, mdz + nz * (canopyProj / 2 + 0.4));
      canopyMesh.rotation.y = -dAngle;
      canopyMesh.castShadow = true;
      rootGroup.add(canopyMesh);
    }
  }, [
    createGrassTexture,
    createPaverTexture,
    createStoneAccentTexture,
    buildFloorGeometry,
    layout,
    presentationMode,
    multiFloorStacked,
    activeFloorIndex,
    showRoof,
    isDarkMode,
    pw,
    pl,
    cx,
    cz,
    fullWallHeight,
    floorElevation,
    modelsLoaded,
    grassTexture,
    paverTexture,
    effectiveShowLandscape,
    effectiveShowStructure,
    explodedFloors,
    landscapeCategory,
    lightingPreset,
  ]);

  // Three.js Mount & Animation Loop
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth || 800;
    const height = mount.clientHeight || 600;

    // 1. Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(isDarkMode ? "#121214" : "#F3F4F6");
    sceneRef.current = scene;

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.5, 500);
    // Initial camera position based on mode
    if (presentationMode === "landscape") {
      camera.position.set(cx + pw * 1.35, pl * 1.05, cz + pl * 1.45);
    } else if (presentationMode === "exterior") {
      camera.position.set(cx + pw * 1.05, pl * 0.7, cz + pl * 1.15);
    } else {
      camera.position.set(cx + pw * 0.35, pl * 1.35, cz + pl * 0.85);
    }
    cameraRef.current = camera;
    targetCamPos.current.copy(camera.position);

    // 3. Renderer with Soft Shadows
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    rendererRef.current = renderer;
    mount.appendChild(renderer.domElement);

    // 4. OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
    controls.minDistance = 8;
    controls.maxDistance = 250;
    if (presentationMode === "landscape") {
      controls.target.set(cx, 2.5, cz);
    } else if (presentationMode === "exterior") {
      controls.target.set(cx, 4.0, cz);
    } else {
      controls.target.set(cx, 0.5, cz);
    }
    controlsRef.current = controls;
    targetControlsTarget.current.copy(controls.target);

    // 5. Lighting: Sun (DirectionalLight) & Sky (HemisphereLight)
    const skyLight = new THREE.HemisphereLight(0xffffff, 0xcbd5e1, 0.95);
    scene.add(skyLight);
    skyLightRef.current = skyLight;

    const sunLight = new THREE.DirectionalLight(0xfffbf0, 1.45);
    sunLight.position.set(cx + 40, 55, cz + 30);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 1.0;
    sunLight.shadow.camera.far = 180;
    const d = Math.max(pw, pl) * 0.9;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.bias = -0.0004;
    scene.add(sunLight);
    sunLightRef.current = sunLight;

    // Build the scene
    rebuildScene();

    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);

      // Smooth Camera & Orbit Lerp Transition
      if (isTransitioningCamera.current && cameraRef.current && controlsRef.current) {
        cameraRef.current.position.lerp(targetCamPos.current, 0.08);
        controlsRef.current.target.lerp(targetControlsTarget.current, 0.08);
        if (
          cameraRef.current.position.distanceTo(targetCamPos.current) < 0.2 &&
          controlsRef.current.target.distanceTo(targetControlsTarget.current) < 0.2
        ) {
          isTransitioningCamera.current = false;
        }
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!mount || !rendererRef.current || !cameraRef.current) return;
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animId);
      controls.dispose();
      renderer.dispose();
      if (mount && renderer.domElement) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [cx, cz, isDarkMode, pl, pw, rebuildScene]);

  // Re-run geometry on dependency changes
  useEffect(() => {
    rebuildScene();
  }, [rebuildScene]);

  // Mode Transition Handler (EXTERIOR | INTERIOR | LANDSCAPE)
  const handleSwitchMode = (mode: PresentationMode) => {
    setPresentationMode(mode);
    if (!cameraRef.current || !controlsRef.current) return;

    isTransitioningCamera.current = true;
    if (mode === "landscape") {
      // Professional Architectural 3/4 Site Landscape Overview
      targetCamPos.current.set(cx + pw * 1.35, pl * 1.05, cz + pl * 1.45);
      targetControlsTarget.current.set(cx, 2.5, cz);
    } else if (mode === "exterior") {
      // Architectural Building Residence Close View
      targetCamPos.current.set(cx + pw * 1.05, pl * 0.7, cz + pl * 1.15);
      targetControlsTarget.current.set(cx, 4.0, cz);
    } else {
      // Steep Cutaway Dollhouse View looking directly down into rooms
      targetCamPos.current.set(cx + pw * 0.35, pl * 1.35, cz + pl * 0.85);
      targetControlsTarget.current.set(cx, 0.5, cz);
    }
  };

  // Lighting Preset Adjustments
  useEffect(() => {
    if (sunLightRef.current && skyLightRef.current && sceneRef.current) {
      if (lightingPreset === "sunset") {
        sunLightRef.current.color.set("#FF8E4D");
        sunLightRef.current.intensity = 1.5;
        sunLightRef.current.position.set(cx + 50, 20, cz - 20);
        skyLightRef.current.color.set("#FED7AA");
        skyLightRef.current.groundColor.set("#B45309");
        sceneRef.current.background = new THREE.Color(isDarkMode ? "#181412" : "#FFF7ED");
      } else if (lightingPreset === "night") {
        sunLightRef.current.color.set("#38BDF8");
        sunLightRef.current.intensity = 0.35;
        skyLightRef.current.color.set("#1E293B");
        skyLightRef.current.groundColor.set("#0F172A");
        sceneRef.current.background = new THREE.Color("#0F1218");
      } else {
        // Daylight
        sunLightRef.current.color.set("#FFFBF0");
        sunLightRef.current.intensity = 1.45;
        sunLightRef.current.position.set(cx + 40, 55, cz + 30);
        skyLightRef.current.color.set("#FFFFFF");
        skyLightRef.current.groundColor.set("#CBD5E1");
        sceneRef.current.background = new THREE.Color(isDarkMode ? "#121214" : "#F3F4F6");
      }
    }
  }, [lightingPreset, isDarkMode, cx, cz]);

  const handleResetCamera = () => {
    if (!cameraRef.current || !controlsRef.current) return;
    isTransitioningCamera.current = true;
    if (presentationMode === "landscape") {
      targetCamPos.current.set(cx + pw * 1.35, pl * 1.05, cz + pl * 1.45);
      targetControlsTarget.current.set(cx, 2.5, cz);
    } else if (presentationMode === "exterior") {
      targetCamPos.current.set(cx + pw * 1.05, pl * 0.7, cz + pl * 1.15);
      targetControlsTarget.current.set(cx, 4.0, cz);
    } else {
      targetCamPos.current.set(cx + pw * 0.35, pl * 1.35, cz + pl * 0.85);
      targetControlsTarget.current.set(cx, 0.5, cz);
    }
  };

  const handleCameraPreset = (preset: "iso" | "top" | "front" | "side") => {
    setCameraView(preset);
    if (!cameraRef.current || !controlsRef.current) return;
    isTransitioningCamera.current = true;
    if (preset === "top") {
      targetCamPos.current.set(cx, pl * 2.2, cz + 0.01);
      targetControlsTarget.current.set(cx, 0, cz);
    } else if (preset === "front") {
      targetCamPos.current.set(cx, pl * 0.45, cz + pl * 1.55);
      targetControlsTarget.current.set(cx, 4.0, cz);
    } else if (preset === "side") {
      targetCamPos.current.set(cx + pw * 1.6, pl * 0.45, cz);
      targetControlsTarget.current.set(cx, 4.0, cz);
    } else {
      // Iso
      targetCamPos.current.set(cx + pw * 1.15, pl * 0.95, cz + pl * 1.25);
      targetControlsTarget.current.set(cx, 3.0, cz);
    }
  };

  return (
    <div className="relative w-full h-full select-none overflow-hidden bg-[#ECEEF2]">
      {/* FLOATING 3D CONTROLS (TOP LEFT) */}
      <div className="absolute top-16 sm:top-20 left-3 sm:left-6 z-30 flex flex-wrap items-center gap-1.5 sm:gap-2 max-w-[calc(100vw-24px)] pointer-events-auto">
        {/* Primary Presentation Modes: EXTERIOR | INTERIOR | LANDSCAPE */}
        <div className="flex items-center p-0.5 sm:p-1 rounded-full bg-[#12141A]/90 backdrop-blur-md border border-white/10 shadow-2xl text-[10px] sm:text-[11px] font-mono text-[#9E9C98]">
          <button
            onClick={() => handleSwitchMode("exterior")}
            className={`px-3 py-1 rounded-full transition-all ${
              presentationMode === "exterior"
                ? "bg-[#C48446] text-[#0A0B0E] font-semibold shadow-sm"
                : "hover:text-[#F5F3EF]"
            }`}
          >
            EXTERIOR
          </button>
          <button
            onClick={() => handleSwitchMode("interior")}
            className={`px-3 py-1 rounded-full transition-all ${
              presentationMode === "interior"
                ? "bg-[#C48446] text-[#0A0B0E] font-semibold shadow-sm"
                : "hover:text-[#F5F3EF]"
            }`}
          >
            INTERIOR
          </button>
          <button
            onClick={() => handleSwitchMode("landscape")}
            className={`px-3 py-1 rounded-full transition-all ${
              presentationMode === "landscape"
                ? "bg-[#C48446] text-[#0A0B0E] font-semibold shadow-sm"
                : "hover:text-[#F5F3EF]"
            }`}
          >
            LANDSCAPE
          </button>
        </div>

        {/* When LANDSCAPE is active, provide visibility filters: ALL | VEGETATION | PATHS | LIGHTS | FURNITURE */}
        {presentationMode === "landscape" && (
          <div className="flex items-center p-0.5 sm:p-1 rounded-full bg-[#12141A]/90 backdrop-blur-md border border-[#C48446]/40 shadow-2xl text-[10px] sm:text-[11px] font-mono text-[#9E9C98]">
            {(
              [
                { id: "all", label: "ALL" },
                { id: "vegetation", label: "VEGETATION" },
                { id: "paths", label: "PATHS" },
                { id: "lighting", label: "LIGHTS" },
                { id: "furniture", label: "FURNITURE" },
              ] as const
            ).map((cat) => (
              <button
                key={cat.id}
                onClick={() => setLandscapeCategory(cat.id)}
                className={`px-2.5 sm:px-3 py-1 rounded-full transition-all ${
                  landscapeCategory === cat.id
                    ? "bg-[#C48446] text-[#0A0B0E] font-semibold shadow-sm"
                    : "hover:text-[#F5F3EF]"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        )}

        {/* Floor Level Switcher (Single floor cutaway or ALL stacked) */}
        {layout.floors && layout.floors.length > 1 && (
          <div className="flex items-center p-0.5 sm:p-1 rounded-full bg-[#12141A]/90 backdrop-blur-md border border-white/10 shadow-2xl text-[10px] sm:text-[11px] font-mono text-[#9E9C98]">
            {layout.floors.map((fl, idx) => {
              const label = fl.floor_name
                ? fl.floor_name.replace(" Floor", "").toUpperCase()
                : idx === 0
                ? "GROUND"
                : idx === 1
                ? "FIRST"
                : idx === 2
                ? "SECOND"
                : `L${fl.floor_number}`;
              const isActive = !multiFloorStacked && activeFloorIndex === idx;
              return (
                <button
                  key={fl.floor_number}
                  onClick={() => {
                    setMultiFloorStacked(false);
                    onSelectFloor?.(idx);
                  }}
                  className={`px-2.5 sm:px-3 py-1 rounded-full transition-all ${
                    isActive
                      ? "bg-[#C48446] text-[#0A0B0E] font-medium shadow-sm"
                      : "hover:text-[#F5F3EF]"
                  }`}
                >
                  {label}
                </button>
              );
            })}
            <button
              onClick={() => setMultiFloorStacked(true)}
              className={`px-2.5 sm:px-3 py-1 rounded-full transition-all ${
                multiFloorStacked
                  ? "bg-[#C48446] text-[#0A0B0E] font-medium shadow-sm"
                  : "hover:text-[#F5F3EF]"
              }`}
            >
              ALL
            </button>
          </div>
        )}

        {/* Lighting: DAY / DUSK */}
        <div className="flex items-center p-0.5 sm:p-1 rounded-full bg-[#12141A]/90 backdrop-blur-md border border-white/10 shadow-2xl text-[10px] sm:text-[11px] font-mono text-[#9E9C98]">
          <button
            onClick={() => onChangeLightingPreset?.("day")}
            className={`px-2.5 sm:px-3 py-1 rounded-full transition-all ${
              lightingPreset === "day"
                ? "bg-[#F5F3EF] text-[#0A0B0E] font-medium shadow-sm"
                : "hover:text-[#F5F3EF]"
            }`}
          >
            DAY
          </button>
          <button
            onClick={() => onChangeLightingPreset?.("sunset")}
            className={`px-2.5 sm:px-3 py-1 rounded-full transition-all ${
              lightingPreset === "sunset" || lightingPreset === "night"
                ? "bg-[#C48446] text-[#0A0B0E] font-medium shadow-sm"
                : "hover:text-[#F5F3EF]"
            }`}
          >
            DUSK
          </button>
        </div>

        {/* Camera Angles: ISO | TOP | FRONT | SIDE */}
        <div className="flex items-center p-0.5 sm:p-1 rounded-full bg-[#12141A]/90 backdrop-blur-md border border-white/10 shadow-2xl text-[10px] sm:text-[11px] font-mono text-[#9E9C98]">
          {(["iso", "top", "front", "side"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => handleCameraPreset(mode)}
              className={`px-2.5 sm:px-3 py-1 rounded-full transition-all ${
                cameraView === mode
                  ? "bg-[#C48446] text-[#0A0B0E] font-medium shadow-sm"
                  : "hover:text-[#F5F3EF]"
              }`}
            >
              {mode.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Multi-Floor Exploded View Toggle */}
        {layout.floors && layout.floors.length > 1 && multiFloorStacked && (
          <button
            onClick={() => setExplodedFloors((prev) => !prev)}
            className={`px-3 py-1.5 rounded-full transition-all text-[10px] sm:text-[11px] font-mono border shadow-2xl ${
              explodedFloors
                ? "bg-[#C48446] text-[#0A0B0E] border-[#C48446] font-semibold"
                : "bg-[#12141A]/90 hover:bg-[#1A1D24] text-[#F5F3EF] border-white/10"
            }`}
          >
            {explodedFloors ? "COLLAPSE" : "EXPLODED"}
          </button>
        )}

        {/* Structure (Columns & Beams) Toggle */}
        <button
          onClick={() => {
            if (onToggleStructure) {
              onToggleStructure();
            } else {
              setInternalShowStructure((prev) => !prev);
            }
          }}
          className={`px-3 py-1.5 rounded-full transition-all text-[10px] sm:text-[11px] font-mono border shadow-2xl ${
            effectiveShowStructure
              ? "bg-[#C48446] text-[#0A0B0E] border-[#C48446] font-semibold"
              : "bg-[#12141A]/90 hover:bg-[#1A1D24] text-[#F5F3EF] border-white/10"
          }`}
        >
          STRUCTURE
        </button>

        {/* Reset Camera Button */}
        <button
          onClick={handleResetCamera}
          className="px-3 py-1.5 rounded-full bg-[#12141A]/90 hover:bg-[#1A1D24] text-[#F5F3EF] border border-white/10 text-[10px] sm:text-[11px] font-mono shadow-2xl transition-all"
        >
          RESET VIEW
        </button>
      </div>

      {/* 3D WebGL Canvas */}
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />
    </div>
  );
};

// ==========================================
// PROCEDURAL ARCHITECTURAL STAIRCASE
// ==========================================
function buildArchitecturalStaircase(
  rect: { x: number; y: number; width: number; length: number },
  elevationH: number,
  treadMat: THREE.Material,
  railingMat: THREE.Material
): THREE.Group {
  const stairGroup = new THREE.Group();
  const numSteps = 16;
  const riserH = elevationH / numSteps;
  const treadDepth = (rect.length * 0.85) / (numSteps / 2);
  const flightW = Math.max(2.8, (rect.width - 0.4) / 2);

  // Flight 1: Up to landing
  const halfSteps = numSteps / 2;
  for (let i = 0; i < halfSteps; i++) {
    const stepGeo = new THREE.BoxGeometry(flightW, riserH, treadDepth);
    const stepMesh = new THREE.Mesh(stepGeo, treadMat);
    stepMesh.position.set(
      rect.x + flightW / 2,
      i * riserH + riserH / 2,
      rect.y + i * treadDepth + treadDepth / 2
    );
    stepMesh.castShadow = true;
    stepMesh.receiveShadow = true;
    stairGroup.add(stepMesh);
  }

  // Mid Landing
  const landingGeo = new THREE.BoxGeometry(rect.width, 0.4, 3.5);
  const landingMesh = new THREE.Mesh(landingGeo, treadMat);
  landingMesh.position.set(
    rect.x + rect.width / 2,
    halfSteps * riserH + 0.2,
    rect.y + rect.length - 1.75
  );
  landingMesh.castShadow = true;
  landingMesh.receiveShadow = true;
  stairGroup.add(landingMesh);

  // Flight 2: Landing to Next Floor
  for (let i = 0; i < halfSteps; i++) {
    const stepGeo = new THREE.BoxGeometry(flightW, riserH, treadDepth);
    const stepMesh = new THREE.Mesh(stepGeo, treadMat);
    stepMesh.position.set(
      rect.x + rect.width - flightW / 2,
      (halfSteps + i) * riserH + riserH / 2,
      rect.y + rect.length - 3.5 - i * treadDepth - treadDepth / 2
    );
    stepMesh.castShadow = true;
    stepMesh.receiveShadow = true;
    stairGroup.add(stepMesh);
  }

  // Railing
  const railGeo = new THREE.CylinderGeometry(0.04, 0.04, rect.length * 0.8, 8);
  const rail1 = new THREE.Mesh(railGeo, railingMat);
  rail1.position.set(rect.x + flightW, (halfSteps * riserH) / 2 + 2.8, rect.y + rect.length / 2 - 1.5);
  rail1.rotation.x = Math.PI / 4;
  stairGroup.add(rail1);

  return stairGroup;
}

// ==========================================
// PROCEDURAL ARCHITECTURAL 3D FURNITURE LIBRARY
// ==========================================
function buildArchitecturalFurniture(
  item: FurnitureItem,
  roomType: string,
  isDark: boolean,
  isSelected: boolean
): THREE.Group | null {
  const group = new THREE.Group();
  const iw = Math.max(0.6, Number(item.width) || 2.0);
  const il = Math.max(0.6, Number(item.length) || 2.0);
  const type = (item.type || "").toLowerCase();

  // Materials Library for Furniture
  const oakMat = new THREE.MeshStandardMaterial({
    color: isDark ? "#453325" : "#8A6D4B",
    roughness: 0.55,
  });
  const darkWoodMat = new THREE.MeshStandardMaterial({
    color: isDark ? "#241B14" : "#4A3525",
    roughness: 0.6,
  });
  const whiteMat = new THREE.MeshStandardMaterial({
    color: isDark ? "#E5E5E5" : "#FFFFFF",
    roughness: 0.25,
  });
  const linenFabricMat = new THREE.MeshStandardMaterial({
    color: isDark ? "#524E4A" : isSelected ? "#FDBA74" : "#D4CCC0",
    roughness: 0.85,
  });
  const accentAmberMat = new THREE.MeshStandardMaterial({
    color: "#D97706",
    roughness: 0.8,
  });
  const metalMat = new THREE.MeshStandardMaterial({
    color: "#1E242B",
    roughness: 0.35,
    metalness: 0.85,
  });
  const chromeMat = new THREE.MeshStandardMaterial({
    color: "#E2E8F0",
    roughness: 0.15,
    metalness: 0.9,
  });
  const quartzMat = new THREE.MeshStandardMaterial({
    color: isDark ? "#3F3F46" : "#F8F7F4",
    roughness: 0.2,
    metalness: 0.08,
  });

  // Bedding Color: Distinct per room type
  let beddingColor = "#1E3A8A"; // Default Navy for Master
  if (roomType.includes("guest") || type.includes("queen")) {
    beddingColor = "#C2410C"; // Terracotta Rust
  } else if (roomType.includes("2") || type.includes("single")) {
    beddingColor = "#2D6A4F"; // Forest / Sage
  }
  const beddingMat = new THREE.MeshStandardMaterial({
    color: isDark ? "#3B4252" : isSelected ? "#FDBA74" : beddingColor,
    roughness: 0.82,
  });

  // 1. Bed (King, Queen, Single)
  if (type.includes("bed")) {
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(iw, 0.45, il), oakMat);
    plinth.position.y = 0.22;
    plinth.castShadow = true;
    group.add(plinth);

    const mattress = new THREE.Mesh(new THREE.BoxGeometry(iw - 0.2, 0.75, il - 0.25), whiteMat);
    mattress.position.y = 0.8;
    mattress.castShadow = true;
    group.add(mattress);

    const headboard = new THREE.Mesh(new THREE.BoxGeometry(iw + 0.3, 2.6, 0.3), darkWoodMat);
    headboard.position.set(0, 1.3, -il / 2 + 0.15);
    headboard.castShadow = true;
    group.add(headboard);

    // Pillows
    const pw = (iw - 0.6) / 2;
    const p1 = new THREE.Mesh(new THREE.BoxGeometry(pw, 0.25, 1.3), whiteMat);
    p1.position.set(-pw / 2 - 0.1, 1.25, -il / 2 + 1.1);
    p1.rotation.x = THREE.MathUtils.degToRad(12);
    const p2 = p1.clone();
    p2.position.x = pw / 2 + 0.1;
    group.add(p1, p2);

    // Colorful Duvet Runner
    const runner = new THREE.Mesh(new THREE.BoxGeometry(iw - 0.15, 0.25, il * 0.55), beddingMat);
    runner.position.set(0, 1.2, il / 2 - il * 0.27);
    runner.castShadow = true;
    group.add(runner);

    return group;
  }

  // 2. Nightstand / Side Table
  if (type.includes("side_table") || type.includes("nightstand")) {
    const stand = new THREE.Mesh(new THREE.BoxGeometry(iw, 1.8, il), oakMat);
    stand.position.y = 0.9;
    stand.castShadow = true;
    group.add(stand);

    // Metallic drawer pull knob
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.08, 8), metalMat);
    knob.rotation.x = Math.PI / 2;
    knob.position.set(0, 1.2, il / 2 + 0.05);
    group.add(knob);
    return group;
  }

  // 3. Wardrobe / Closet
  if (type.includes("wardrobe") || type.includes("closet")) {
    const wardrobeH = 6.5;
    const wardrobe = new THREE.Mesh(new THREE.BoxGeometry(iw, wardrobeH, il), darkWoodMat);
    wardrobe.position.y = wardrobeH / 2;
    wardrobe.castShadow = true;
    group.add(wardrobe);

    // Sliding door seam and vertical handles
    const handleL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.8, 0.06), chromeMat);
    handleL.position.set(-0.25, wardrobeH / 2, il / 2 + 0.04);
    const handleR = handleL.clone();
    handleR.position.x = 0.25;
    group.add(handleL, handleR);
    return group;
  }

  // 4. Sofa / Living Couch
  if (type.includes("sofa") || type.includes("couch")) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(iw, 0.4, il), darkWoodMat);
    base.position.y = 0.2;
    base.castShadow = true;
    group.add(base);

    const seat = new THREE.Mesh(new THREE.BoxGeometry(iw - 0.2, 0.55, il - 0.6), linenFabricMat);
    seat.position.set(0, 0.65, 0.15);
    seat.castShadow = true;
    group.add(seat);

    const back = new THREE.Mesh(new THREE.BoxGeometry(iw, 1.4, 0.55), linenFabricMat);
    back.position.set(0, 1.1, -il / 2 + 0.28);
    back.castShadow = true;
    group.add(back);

    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.05, il), linenFabricMat);
    armL.position.set(-iw / 2 + 0.22, 0.72, 0);
    const armR = armL.clone();
    armR.position.x = iw / 2 - 0.22;
    group.add(armL, armR);

    // Two Amber Throw Pillows
    const pillow1 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.35), accentAmberMat);
    pillow1.position.set(-iw / 2 + 0.75, 1.0, 0);
    pillow1.rotation.y = THREE.MathUtils.degToRad(20);
    const pillow2 = pillow1.clone();
    pillow2.position.x = iw / 2 - 0.75;
    pillow2.rotation.y = THREE.MathUtils.degToRad(-20);
    group.add(pillow1, pillow2);

    return group;
  }

  // 5. Coffee Table
  if (type.includes("coffee_table")) {
    const top = new THREE.Mesh(new THREE.BoxGeometry(iw, 0.12, il), oakMat);
    top.position.y = 1.0;
    top.castShadow = true;
    group.add(top);

    const legGeo = new THREE.CylinderGeometry(0.05, 0.04, 1.0, 8);
    const ox = iw / 2 - 0.25;
    const oz = il / 2 - 0.25;
    [[-ox, -oz], [ox, -oz], [-ox, oz], [ox, oz]].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(legGeo, metalMat);
      leg.position.set(lx, 0.5, lz);
      group.add(leg);
    });
    return group;
  }

  // 6. TV Unit / Media Console
  if (type.includes("tv")) {
    // Low credenza console
    const credenza = new THREE.Mesh(new THREE.BoxGeometry(iw, 1.8, il), darkWoodMat);
    credenza.position.y = 0.9;
    credenza.castShadow = true;
    group.add(credenza);

    // Flat Screen TV
    const tvScreen = new THREE.Mesh(
      new THREE.BoxGeometry(Math.min(iw * 0.75, 5.5), 2.8, 0.15),
      new THREE.MeshStandardMaterial({ color: "#0F172A", roughness: 0.15 })
    );
    tvScreen.position.set(0, 1.8 + 1.4, 0);
    tvScreen.castShadow = true;
    group.add(tvScreen);
    return group;
  }

  // 7. Dining Table with 6 Chairs
  if (type.includes("dining_table")) {
    const tableTop = new THREE.Mesh(new THREE.BoxGeometry(iw, 0.18, il), oakMat);
    tableTop.position.y = 2.4;
    tableTop.castShadow = true;
    group.add(tableTop);

    const legGeo = new THREE.BoxGeometry(0.18, 2.4, 0.18);
    const ox = iw / 2 - 0.35;
    const oz = il / 2 - 0.35;
    [[-ox, -oz], [ox, -oz], [-ox, oz], [ox, oz]].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(legGeo, oakMat);
      leg.position.set(lx, 1.2, lz);
      group.add(leg);
    });

    // 4 to 6 Dining Chairs around table
    const chairW = 1.3;
    const chairD = 1.3;
    const chairSeatH = 1.5;
    const chairBackH = 1.6;

    const buildChair = (cx: number, cz: number, rotY: number) => {
      const chair = new THREE.Group();
      chair.position.set(cx, 0, cz);
      chair.rotation.y = rotY;

      const seat = new THREE.Mesh(new THREE.BoxGeometry(chairW, 0.12, chairD), linenFabricMat);
      seat.position.y = chairSeatH;
      const back = new THREE.Mesh(new THREE.BoxGeometry(chairW, chairBackH, 0.1), oakMat);
      back.position.set(0, chairSeatH + chairBackH / 2, -chairD / 2);
      chair.add(seat, back);

      // 4 thin legs
      const cLegGeo = new THREE.CylinderGeometry(0.04, 0.03, chairSeatH, 6);
      [[-chairW / 2 + 0.15, -chairD / 2 + 0.15], [chairW / 2 - 0.15, -chairD / 2 + 0.15], [-chairW / 2 + 0.15, chairD / 2 - 0.15], [chairW / 2 - 0.15, chairD / 2 - 0.15]].forEach(([clx, clz]) => {
        const leg = new THREE.Mesh(cLegGeo, oakMat);
        leg.position.set(clx, chairSeatH / 2, clz);
        chair.add(leg);
      });
      return chair;
    };

    // Place chairs on long sides
    const spacing = il * 0.3;
    group.add(buildChair(-iw / 2 - 0.7, -spacing, Math.PI / 2));
    group.add(buildChair(-iw / 2 - 0.7, spacing, Math.PI / 2));
    group.add(buildChair(iw / 2 + 0.7, -spacing, -Math.PI / 2));
    group.add(buildChair(iw / 2 + 0.7, spacing, -Math.PI / 2));
    return group;
  }

  // 8. Study Desk & Chair
  if (type.includes("study") || type.includes("desk")) {
    const deskTop = new THREE.Mesh(new THREE.BoxGeometry(iw, 0.15, il), oakMat);
    deskTop.position.y = 2.4;
    deskTop.castShadow = true;
    group.add(deskTop);

    // Left leg and right drawer unit
    const drawerUnit = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.3, il - 0.2), darkWoodMat);
    drawerUnit.position.set(iw / 2 - 0.7, 1.15, 0);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.3, il - 0.2), metalMat);
    legL.position.set(-iw / 2 + 0.2, 1.15, 0);
    group.add(drawerUnit, legL);
    return group;
  }

  // 9. Kitchen Cabinetry & Appliances
  if (type.includes("counter") || type.includes("kitchen")) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(iw, 2.6, il), darkWoodMat);
    base.position.y = 1.3;
    base.castShadow = true;
    group.add(base);

    const top = new THREE.Mesh(new THREE.BoxGeometry(iw + 0.1, 0.16, il + 0.1), quartzMat);
    top.position.y = 2.68;
    group.add(top);
    return group;
  }

  if (type.includes("cooktop") || type.includes("hob")) {
    const hob = new THREE.Mesh(
      new THREE.BoxGeometry(iw, 0.08, il),
      new THREE.MeshStandardMaterial({ color: "#111827", roughness: 0.15 })
    );
    hob.position.y = 2.72;
    // 3 circular burners
    const burnerGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.06, 12);
    const bMat = new THREE.MeshStandardMaterial({ color: "#374151", metalness: 0.8 });
    const b1 = new THREE.Mesh(burnerGeo, bMat);
    b1.position.set(-iw * 0.25, 2.76, 0);
    const b2 = new THREE.Mesh(burnerGeo, bMat);
    b2.position.set(iw * 0.25, 2.76, 0);
    group.add(hob, b1, b2);
    return group;
  }

  if (type.includes("sink")) {
    const sink = new THREE.Mesh(new THREE.BoxGeometry(iw, 0.06, il), chromeMat);
    sink.position.y = 2.7;
    // Faucet
    const faucet = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 8), chromeMat);
    faucet.position.set(0, 3.15, -il / 2 + 0.2);
    group.add(sink, faucet);
    return group;
  }

  if (type.includes("fridge") || type.includes("refrigerator")) {
    const fridgeH = 6.2;
    const fridge = new THREE.Mesh(new THREE.BoxGeometry(iw, fridgeH, il), chromeMat);
    fridge.position.y = fridgeH / 2;
    fridge.castShadow = true;
    group.add(fridge);
    return group;
  }

  // 10. Bathroom Suite (Toilet, Basin, Shower, Bathtub)
  if (type.includes("toilet") || type.includes("wc")) {
    const cistern = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.8, 0.7), whiteMat);
    cistern.position.set(0, 1.2, -0.45);
    cistern.castShadow = true;
    const bowl = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.5), whiteMat);
    bowl.position.set(0, 0.55, 0.35);
    bowl.castShadow = true;
    group.add(cistern, bowl);
    return group;
  }

  if (type.includes("basin") || type.includes("vanity")) {
    const vanity = new THREE.Mesh(new THREE.BoxGeometry(iw, 2.2, il), darkWoodMat);
    vanity.position.y = 1.1;
    vanity.castShadow = true;
    const sinkBowl = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.45, 0.4, 16), whiteMat);
    sinkBowl.position.set(0, 2.4, 0);
    const tap = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8), chromeMat);
    tap.position.set(0, 2.8, -il / 2 + 0.25);
    group.add(vanity, sinkBowl, tap);
    return group;
  }

  if (type.includes("shower")) {
    const tray = new THREE.Mesh(new THREE.BoxGeometry(iw, 0.15, il), whiteMat);
    tray.position.y = 0.08;
    const glassScreen = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 6.5, il * 0.7),
      new THREE.MeshStandardMaterial({
        color: "#7DD3FC",
        transparent: true,
        opacity: 0.4,
        roughness: 0.1,
      })
    );
    glassScreen.position.set(iw / 2 - 0.1, 3.25, 0);
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 6.0, 8), chromeMat);
    column.position.set(-iw / 2 + 0.2, 3.0, -il / 2 + 0.2);
    group.add(tray, glassScreen, column);
    return group;
  }

  // Default clean geometric furniture
  const box = new THREE.Mesh(new THREE.BoxGeometry(iw, 1.4, il), linenFabricMat);
  box.position.y = 0.7;
  box.castShadow = true;
  group.add(box);
  return group;
}
