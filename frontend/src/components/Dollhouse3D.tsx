"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
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
import { generateFallbackLandscape } from "@/utils/landscapeFallback";
import { getThreeMaterial } from "@/utils/materials";

interface Dollhouse3DProps {
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
}

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
  cameraPreset = "isometric",
  onChangeCameraPreset,
  wallHeightMode = "cutaway",
  onToggleWallHeightMode,
  showRoof = false,
  onToggleRoof,
  showStructure,
  onToggleStructure,
  showLandscape,
  onToggleLandscape,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [internalShowStructure, setInternalShowStructure] = useState(false);
  const effectiveShowStructure = showStructure !== undefined ? showStructure : internalShowStructure;

  // 3D Landscape Visibility & Category Filter
  const [internalShowLandscape, setInternalShowLandscape] = useState(true);
  const effectiveShowLandscape = showLandscape !== undefined ? showLandscape : internalShowLandscape;
  const [landscapeCategory, setLandscapeCategory] = useState<"all" | "vegetation" | "paths" | "lighting" | "furniture">("all");
  const landscapeGroupRef = useRef<THREE.Group | null>(null);

  // References to Three.js core objects
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const houseRootRef = useRef<THREE.Group | null>(null);
  const sunLightRef = useRef<THREE.DirectionalLight | null>(null);
  const skyLightRef = useRef<THREE.HemisphereLight | null>(null);
  const interiorLightsGroupRef = useRef<THREE.Group | null>(null);

  // Raycasting for interactive 3D entity selection
  const raycaster = useRef(new THREE.Raycaster());
  const mouse = useRef(new THREE.Vector2());

  const fullWallHeight = 9.0;
  const cutawayHeight = 3.5;
  const currentWallHeight = wallHeightMode === "cutaway" ? cutawayHeight : fullWallHeight;
  const floorElevation = 10.5;

  // PBR Texture Generators
  const createWoodTexture = (isDark: boolean) => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    if (!ctx) return new THREE.Texture();

    ctx.fillStyle = isDark ? "#2C2218" : "#E4D5B7";
    ctx.fillRect(0, 0, 512, 512);

    // Staggered planks
    ctx.fillStyle = isDark ? "#1C150F" : "#CDBF9E";
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
  };

  const createTileTexture = (isDark: boolean) => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    if (!ctx) return new THREE.Texture();

    ctx.fillStyle = isDark ? "#262626" : "#FAF9F6";
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = isDark ? "#3F3F46" : "#E2DDD5";
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
    tex.repeat.set(2, 2);
    return tex;
  };

  // Build Architectural Geometry
  const rebuildScene = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (houseRootRef.current) {
      scene.remove(houseRootRef.current);
    }
    const rootGroup = new THREE.Group();
    scene.add(rootGroup);
    houseRootRef.current = rootGroup;

    // Reset interior lights group
    if (interiorLightsGroupRef.current) {
      scene.remove(interiorLightsGroupRef.current);
    }
    const interiorLights = new THREE.Group();
    scene.add(interiorLights);
    interiorLightsGroupRef.current = interiorLights;

    // PBR Shared Canonical Architectural Materials
    const extWallMat = getThreeMaterial("cement_plaster_exterior", isDarkMode);
    const intWallMat = getThreeMaterial("cement_plaster_interior", isDarkMode);
    const wallTrimMat = getThreeMaterial("granite_counter", isDarkMode);
    const glassMat = getThreeMaterial("tinted_glazing", isDarkMode);
    const frameMat = getThreeMaterial("aluminum_frame_window", isDarkMode);
    const doorLeafMat = getThreeMaterial("teak_wood_door", isDarkMode);
    const ceilingMat = getThreeMaterial("cement_plaster_interior", isDarkMode);

    const woodFloorTex = createWoodTexture(isDarkMode);
    const tileFloorTex = createTileTexture(isDarkMode);

    const floor = layout.floors[activeFloorIndex] || layout.floors[0] || {
      rooms: layout.rooms || [],
      walls: layout.walls || [],
      exterior_walls: layout.exterior_walls || [],
      interior_walls: layout.interior_walls || [],
      doors: layout.doors || [],
      windows: layout.windows || [],
    };

    const floorGroup = new THREE.Group();
    rootGroup.add(floorGroup);

    // 1. Property Site Ground Plinth & Boundary
    const pw = layout.plot_width;
    const pl = layout.plot_length;
    const cx = pw / 2;
    const cz = pl / 2;

    // Architectural Site Base for the Property
    const siteGeo = new THREE.BoxGeometry(pw, 0.12, pl);
    const siteMat = new THREE.MeshStandardMaterial({
      color: isDarkMode ? "#1C1D21" : "#E8E4DC",
      roughness: 0.95,
      metalness: 0.02,
    });
    const siteMesh = new THREE.Mesh(siteGeo, siteMat);
    siteMesh.position.set(cx, -0.06, cz);
    siteMesh.receiveShadow = true;
    rootGroup.add(siteMesh);

    // Property Boundary Line around actual plot dimensions
    const boundaryPts = [
      new THREE.Vector3(0, 0.01, 0),
      new THREE.Vector3(pw, 0.01, 0),
      new THREE.Vector3(pw, 0.01, pl),
      new THREE.Vector3(0, 0.01, pl),
      new THREE.Vector3(0, 0.01, 0),
    ];
    const boundaryGeo = new THREE.BufferGeometry().setFromPoints(boundaryPts);
    const boundaryLine = new THREE.Line(
      boundaryGeo,
      new THREE.LineBasicMaterial({
        color: isDarkMode ? "#52525B" : "#94A3B8",
        linewidth: 2,
      })
    );
    rootGroup.add(boundaryLine);

    // 2. Building Foundation Plinth (Under Rooms Footprint Only)
    let minBx = Infinity;
    let maxBx = -Infinity;
    let minBz = Infinity;
    let maxBz = -Infinity;

    (floor.rooms || []).forEach((room) => {
      if (room.rect) {
        minBx = Math.min(minBx, room.rect.x);
        maxBx = Math.max(maxBx, room.rect.x + room.rect.width);
        minBz = Math.min(minBz, room.rect.y);
        maxBz = Math.max(maxBz, room.rect.y + room.rect.length);
      }
    });

    const hasRooms = isFinite(minBx) && minBx < maxBx;
    const plinthW = hasRooms ? (maxBx - minBx) + 0.6 : pw * 0.7;
    const plinthL = hasRooms ? (maxBz - minBz) + 0.6 : pl * 0.7;
    const plinthX = hasRooms ? (minBx + maxBx) / 2 : cx;
    const plinthZ = hasRooms ? (minBz + maxBz) / 2 : cz;

    const plinthGeo = new THREE.BoxGeometry(plinthW, 0.2, plinthL);
    const plinthMat = new THREE.MeshStandardMaterial({
      color: isDarkMode ? "#292524" : "#CBD5E1",
      roughness: 0.8,
    });
    const plinthMesh = new THREE.Mesh(plinthGeo, plinthMat);
    plinthMesh.position.set(plinthX, -0.1, plinthZ);
    plinthMesh.receiveShadow = true;
    floorGroup.add(plinthMesh);

    // 2. Room Floor Finishes
    (floor.rooms || []).forEach((room) => {
      if (!room || !room.rect) return;
      const rw = Math.max(1, room.rect.width);
      const rl = Math.max(1, room.rect.length);
      const rx = room.rect.x + rw / 2;
      const rz = room.rect.y + rl / 2;

      const isWetZone = room.zone === "service" || room.type.includes("bath");
      const floorMat = new THREE.MeshStandardMaterial({
        map: isWetZone ? tileFloorTex : woodFloorTex,
        roughness: isWetZone ? 0.3 : 0.6,
        metalness: isWetZone ? 0.1 : 0.05,
      });

      const floorGeo = new THREE.PlaneGeometry(Math.max(0.1, rw - 0.05), Math.max(0.1, rl - 0.05));
      const floorMesh = new THREE.Mesh(floorGeo, floorMat);
      floorMesh.rotation.x = -Math.PI / 2;
      floorMesh.position.set(rx, 0.02, rz);
      floorMesh.receiveShadow = true;
      floorMesh.userData = { roomId: room.id, type: "room_floor" };

      // Highlight selected room with edge outline
      if (selectedRoomId === room.id) {
        const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(rw, 0.05, rl));
        const lineMat = new THREE.LineBasicMaterial({ color: 0xc2410c, linewidth: 3 });
        const wireframe = new THREE.LineSegments(edges, lineMat);
        wireframe.position.set(rx, 0.05, rz);
        floorGroup.add(wireframe);
      }

      floorGroup.add(floorMesh);

      // Add warm recessed interior downlight for each room in night/sunset mode
      if (lightingPreset === "night" || lightingPreset === "sunset") {
        const roomLight = new THREE.PointLight(0xffecd1, lightingPreset === "night" ? 0.75 : 0.4, 18);
        roomLight.position.set(rx, 7.5, rz);
        roomLight.castShadow = false;
        interiorLights.add(roomLight);
      }

      // 3. Detailed Procedural Furniture
      (room.furniture || []).forEach((item) => {
        if (!item) return;
        const fMesh = buildArchitecturalFurniture(item, isDarkMode, selectedFurnitureId === item.id);
        if (fMesh) {
          fMesh.position.set(item.x || rx, 0, item.y || rz);
          fMesh.rotation.y = -THREE.MathUtils.degToRad(item.rotation || 0);
          fMesh.userData = { furnitureId: item.id, roomId: room.id };
          floorGroup.add(fMesh);
        }
      });
    });

    // 4. Architectural Walls with Openings
    const allWalls: Wall[] = [
      ...(floor.exterior_walls || []).map((w) => ({ ...w, is_exterior: true })),
      ...(floor.interior_walls || []).map((w) => ({ ...w, is_exterior: false })),
    ];

    allWalls.forEach((wall) => {
      const dx = wall.x2 - wall.x1;
      const dz = wall.y2 - wall.y1;
      const wallLen = Math.hypot(dx, dz);
      if (wallLen < 0.3) return;

      const angle = Math.atan2(dz, dx);
      const ux = dx / wallLen;
      const uz = dz / wallLen;
      const thickness = wall.thickness || (wall.is_exterior ? 0.75 : 0.45);
      const isExt = wall.is_exterior;
      const wallMat = isExt ? extWallMat : intWallMat;

      // Find hosted openings along this wall
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
          const w = Math.max(1.5, d.width || 3.0);
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
        // Solid wall without any openings
        const geo = new THREE.BoxGeometry(wallLen, currentWallHeight, thickness);
        const mesh = new THREE.Mesh(geo, wallMat);
        mesh.position.set((wall.x1 + wall.x2) / 2, currentWallHeight / 2, (wall.y1 + wall.y2) / 2);
        mesh.rotation.y = -angle;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        floorGroup.add(mesh);
        return;
      }

      // Sort openings along wall length
      openings.sort((a, b) => a.start - b.start);

      // 1. Solid wall segments between openings
      let cur = 0;
      openings.forEach((op) => {
        if (op.start - cur > 0.2) {
          const segLen = op.start - cur;
          const segMid = (cur + op.start) / 2;
          const sx = wall.x1 + ux * segMid;
          const sz = wall.y1 + uz * segMid;

          const geo = new THREE.BoxGeometry(segLen, currentWallHeight, thickness);
          const mesh = new THREE.Mesh(geo, wallMat);
          mesh.position.set(sx, currentWallHeight / 2, sz);
          mesh.rotation.y = -angle;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          floorGroup.add(mesh);
        }

        // 2. Openings: Lintel/Header above door, Sill & Header for window
        const opLen = op.end - op.start;
        const opMid = (op.start + op.end) / 2;
        const ox = wall.x1 + ux * opMid;
        const oz = wall.y1 + uz * opMid;

        if (op.type === "door") {
          const doorH = 6.8;
          // In full height mode, render header lintel above door opening
          if (currentWallHeight > doorH + 0.3) {
            const lintelH = currentWallHeight - doorH;
            const lintelY = doorH + lintelH / 2;
            const geo = new THREE.BoxGeometry(opLen, lintelH, thickness);
            const mesh = new THREE.Mesh(geo, wallMat);
            mesh.position.set(ox, lintelY, oz);
            mesh.rotation.y = -angle;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            floorGroup.add(mesh);
          }
        } else if (op.type === "window") {
          const sillH = 2.8;
          const winHeadH = 7.0;

          // Wall sill below window
          const sH = Math.min(currentWallHeight, sillH);
          if (sH > 0.2) {
            const geo = new THREE.BoxGeometry(opLen, sH, thickness);
            const mesh = new THREE.Mesh(geo, wallMat);
            mesh.position.set(ox, sH / 2, oz);
            mesh.rotation.y = -angle;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            floorGroup.add(mesh);
          }

          // Header lintel above window
          if (currentWallHeight > winHeadH + 0.3) {
            const headH = currentWallHeight - winHeadH;
            const headY = winHeadH + headH / 2;
            const geo = new THREE.BoxGeometry(opLen, headH, thickness);
            const mesh = new THREE.Mesh(geo, wallMat);
            mesh.position.set(ox, headY, oz);
            mesh.rotation.y = -angle;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            floorGroup.add(mesh);
          }
        }

        cur = Math.max(cur, op.end);
      });

      // Remaining wall segment to end of wall
      if (wallLen - cur > 0.2) {
        const segLen = wallLen - cur;
        const segMid = (cur + wallLen) / 2;
        const sx = wall.x1 + ux * segMid;
        const sz = wall.y1 + uz * segMid;

        const geo = new THREE.BoxGeometry(segLen, currentWallHeight, thickness);
        const mesh = new THREE.Mesh(geo, wallMat);
        mesh.position.set(sx, currentWallHeight / 2, sz);
        mesh.rotation.y = -angle;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        floorGroup.add(mesh);
      }
    });

    // 5. Doors: Frames, Panels & Jambs
    (floor.doors || []).forEach((door) => {
      const dw = door.width || 3.0;
      const dh = 6.8;
      const dmx = (door.x1 + door.x2) / 2;
      const dmz = (door.y1 + door.y2) / 2;
      const dAngle = Math.atan2(door.y2 - door.y1, door.x2 - door.x1);

      const doorGroup = new THREE.Group();
      doorGroup.position.set(dmx, 0, dmz);
      doorGroup.rotation.y = -dAngle;

      // Frame
      const frameL = new THREE.Mesh(new THREE.BoxGeometry(0.15, dh, 0.45), frameMat);
      frameL.position.set(-dw / 2 + 0.08, dh / 2, 0);
      const frameR = frameL.clone();
      frameR.position.x = dw / 2 - 0.08;
      const frameTop = new THREE.Mesh(new THREE.BoxGeometry(dw, 0.15, 0.45), frameMat);
      frameTop.position.set(0, dh - 0.08, 0);

      // Door Leaf (partially open 30° to show swing)
      const leafGeo = new THREE.BoxGeometry(dw - 0.16, dh - 0.16, 0.12);
      const leaf = new THREE.Mesh(leafGeo, doorLeafMat);
      leaf.position.set((-dw + 0.16) / 2, dh / 2, 0.2);
      leaf.rotation.y = THREE.MathUtils.degToRad(30);

      doorGroup.add(frameL, frameR, frameTop, leaf);
      floorGroup.add(doorGroup);
    });

    // 5b. Front Entrance Plinth Transition Steps & Veranda Canopy
    const mainDoor = (floor.doors || []).find((d) => d.door_type === "entry") || (floor.doors || [])[0];
    if (mainDoor) {
      const stepW = (mainDoor.width || 3.2) + 1.2;
      const stepRun = 0.9;
      const mdx = (mainDoor.x1 + mainDoor.x2) / 2;
      const mdz = (mainDoor.y1 + mainDoor.y2) / 2;
      const dAngle = Math.atan2(mainDoor.y2 - mainDoor.y1, mainDoor.x2 - mainDoor.x1);
      const nx = -Math.sin(dAngle);
      const nz = Math.cos(dAngle);

      // 2 architectural stone entry treads
      for (let sIdx = 0; sIdx < 2; sIdx++) {
        const treadH = 0.12;
        const treadGeo = new THREE.BoxGeometry(stepW + sIdx * 0.3, treadH, stepRun);
        const treadMesh = new THREE.Mesh(treadGeo, wallTrimMat);
        treadMesh.position.set(
          mdx + nx * (0.6 + sIdx * stepRun * 0.85),
          (1 - sIdx) * treadH + treadH / 2,
          mdz + nz * (0.6 + sIdx * stepRun * 0.85)
        );
        treadMesh.rotation.y = -dAngle;
        treadMesh.receiveShadow = true;
        floorGroup.add(treadMesh);
      }

      // Entrance Porch Canopy Overhang with warm downlight
      if (wallHeightMode === "full" || showRoof) {
        const canopyGeo = new THREE.BoxGeometry(stepW + 1.4, 0.22, 2.8);
        const canopyMesh = new THREE.Mesh(canopyGeo, extWallMat);
        canopyMesh.position.set(mdx + nx * 1.4, 7.5, mdz + nz * 1.4);
        canopyMesh.rotation.y = -dAngle;
        canopyMesh.castShadow = true;
        floorGroup.add(canopyMesh);

        const canopyLight = new THREE.PointLight(0xffecd1, 0.65, 10);
        canopyLight.position.set(mdx + nx * 1.4, 7.2, mdz + nz * 1.4);
        floorGroup.add(canopyLight);
      }
    }

    // 6. Windows: Glazing, Mullions & Sills
    (floor.windows || []).forEach((win) => {
      const ww = win.width || 4.0;
      const wh = 4.2;
      const sillH = 2.8;
      const wmx = (win.x1 + win.x2) / 2;
      const wmz = (win.y1 + win.y2) / 2;
      const wAngle = Math.atan2(win.y2 - win.y1, win.x2 - win.x1);

      const winGroup = new THREE.Group();
      winGroup.position.set(wmx, sillH, wmz);
      winGroup.rotation.y = -wAngle;

      // Aluminum Frame
      const frameTop = new THREE.Mesh(new THREE.BoxGeometry(ww, 0.12, 0.48), frameMat);
      frameTop.position.set(0, wh, 0);
      const frameBottom = new THREE.Mesh(new THREE.BoxGeometry(ww + 0.3, 0.14, 0.65), wallTrimMat);
      frameBottom.position.set(0, 0, 0); // Exterior Sill
      const frameLeft = new THREE.Mesh(new THREE.BoxGeometry(0.12, wh, 0.48), frameMat);
      frameLeft.position.set(-ww / 2, wh / 2, 0);
      const frameRight = frameLeft.clone();
      frameRight.position.x = ww / 2;
      const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.08, wh, 0.4), frameMat);
      mullion.position.set(0, wh / 2, 0);

      // Glass Panes
      const glass = new THREE.Mesh(new THREE.BoxGeometry(ww - 0.15, wh - 0.15, 0.05), glassMat);
      glass.position.set(0, wh / 2, 0);

      winGroup.add(frameTop, frameBottom, frameLeft, frameRight, mullion, glass);
      floorGroup.add(winGroup);
    });

    // 7. Roof Parapet & Terrace (if enabled or Full Massing)
    if (showRoof || wallHeightMode === "full") {
      const parapetHeight = 2.5;
      const parapetGeo = new THREE.BoxGeometry(plinthW, parapetHeight, 0.4);
      const parapetMat = extWallMat;

      // Front & Rear Parapets
      const pFront = new THREE.Mesh(parapetGeo, parapetMat);
      pFront.position.set(plinthX, fullWallHeight + parapetHeight / 2, plinthZ + plinthL / 2);
      const pRear = pFront.clone();
      pRear.position.z = plinthZ - plinthL / 2;

      floorGroup.add(pFront, pRear);
    }

    // 8. Preliminary Structural Columns (When Structure Mode is Enabled)
    if (effectiveShowStructure && layout.structural_planning?.columns) {
      const columnGroup = new THREE.Group();
      columnGroup.name = "structural_columns";

      // Architectural subtle concrete PBR material
      const colMat = new THREE.MeshStandardMaterial({
        color: isDarkMode ? "#52525B" : "#CBD5E1",
        roughness: 0.85,
        metalness: 0.1,
      });
      const colEdgeMat = new THREE.LineBasicMaterial({
        color: isDarkMode ? "#C48446" : "#A16207",
      });

      const colH = currentWallHeight;
      const activeFloorNum = activeFloorIndex + 1;

      layout.structural_planning.columns.forEach((col) => {
        const cw = col.width || 0.75;
        const cd = col.depth || 0.75;
        const cx = col.x;
        const cz = col.y;

        const colFloors = col.floors || col.floor_ids || [1];
        if (!colFloors.includes(activeFloorNum)) return;

        const colGeo = new THREE.BoxGeometry(cw, colH, cd);
        const colMesh = new THREE.Mesh(colGeo, colMat);
        colMesh.position.set(cx, colH / 2, cz);
        colMesh.castShadow = true;
        colMesh.receiveShadow = true;
        colMesh.userData = { columnId: col.column_id, type: "column" };

        const colEdges = new THREE.EdgesGeometry(colGeo);
        const edgeLine = new THREE.LineSegments(colEdges, colEdgeMat);
        colMesh.add(edgeLine);

        columnGroup.add(colMesh);
      });

      floorGroup.add(columnGroup);
    }

    // 6. Site Landscaping Layer (Procedural & Shared Low-Poly Architectural Geometry)
    const activeLandscape: LandscapePlan =
      layout.landscape &&
      ((layout.landscape.elements && layout.landscape.elements.length > 0) ||
        (layout.landscape.zones && layout.landscape.zones.length > 0))
        ? layout.landscape
        : generateFallbackLandscape(layout);

    if (effectiveShowLandscape && activeLandscape) {
      const lsGroup = new THREE.Group();
      lsGroup.name = "landscape_root";
      landscapeGroupRef.current = lsGroup;
      rootGroup.add(lsGroup);

      buildLandscape3D(
        lsGroup,
        activeLandscape,
        layout.plot_width,
        layout.plot_length,
        lightingPreset,
        isDarkMode,
        landscapeCategory
      );
    }
  }, [
    layout,
    activeFloorIndex,
    selectedRoomId,
    selectedFurnitureId,
    isDarkMode,
    wallHeightMode,
    lightingPreset,
    showRoof,
    currentWallHeight,
    effectiveShowStructure,
    effectiveShowLandscape,
    landscapeCategory,
  ]);

  // Scene Mount & Animation Loop
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth || 800;
    const height = mount.clientHeight || 600;

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(isDarkMode ? "#121214" : "#FAF8F5");

    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 1000);
    cameraRef.current = camera;
    const cx = layout.plot_width / 2;
    const cz = layout.plot_length / 2;
    camera.position.set(cx + 42, 38, cz + 42);
    camera.lookAt(cx, 0, cz);

    const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
    const renderer = new THREE.WebGLRenderer({
      antialias: !isMobile,
      alpha: true,
      powerPreference: isMobile ? "default" : "high-performance",
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.0 : 1.5));
    renderer.shadowMap.enabled = !isMobile;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    rendererRef.current = renderer;

    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.target.set(cx, 0, cz);
    controls.maxPolarAngle = Math.PI / 2 - 0.04;
    controls.minDistance = 12;
    controls.maxDistance = 220;
    controlsRef.current = controls;

    // Ambient Hemisphere Sky
    const skyLight = new THREE.HemisphereLight(0xffffff, 0xebe6df, 0.85);
    scene.add(skyLight);
    skyLightRef.current = skyLight;

    // Directional Sun with Soft Shadows
    const sunLight = new THREE.DirectionalLight(0xfffaed, 1.4);
    sunLight.position.set(cx + 35, 52, cz - 30);
    sunLight.castShadow = !isMobile;
    sunLight.shadow.mapSize.width = isMobile ? 512 : 1024;
    sunLight.shadow.mapSize.height = isMobile ? 512 : 1024;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 160;
    const shadowDist = 55;
    sunLight.shadow.camera.left = -shadowDist;
    sunLight.shadow.camera.right = shadowDist;
    sunLight.shadow.camera.top = shadowDist;
    sunLight.shadow.camera.bottom = -shadowDist;
    sunLight.shadow.bias = -0.0004;
    scene.add(sunLight);
    sunLightRef.current = sunLight;

    // Ground Plane with Architectural Grid
    const groundGeo = new THREE.PlaneGeometry(layout.plot_width + 80, layout.plot_length + 80);
    const groundMat = new THREE.MeshStandardMaterial({
      color: isDarkMode ? "#18181A" : "#E2E8F0",
      roughness: 0.95,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(cx, -0.25, cz);
    ground.receiveShadow = true;
    scene.add(ground);

    rebuildScene();

    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
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

    // 3D Click Interaction (Entity Raycasting)
    const handleClick = (e: MouseEvent) => {
      if (!mount || !cameraRef.current || !houseRootRef.current) return;
      const rect = mount.getBoundingClientRect();
      mouse.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.current.setFromCamera(mouse.current, cameraRef.current);
      const intersects = raycaster.current.intersectObjects(houseRootRef.current.children, true);

      if (intersects.length > 0) {
        // Find closest object with attached user data
        for (const hit of intersects) {
          let curr: THREE.Object3D | null = hit.object;
          while (curr && curr !== houseRootRef.current) {
            if (curr.userData?.furnitureId) {
              onSelectFurniture?.(curr.userData.furnitureId);
              if (curr.userData.roomId) onSelectRoom(curr.userData.roomId);
              return;
            }
            if (curr.userData?.roomId) {
              onSelectRoom(curr.userData.roomId);
              onSelectFurniture?.(null);
              return;
            }
            curr = curr.parent;
          }
        }
      }
    };
    mount.addEventListener("click", handleClick);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", handleResize);
      mount.removeEventListener("click", handleClick);
      renderer.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [layout]);

  // Re-render meshes when parameters change
  useEffect(() => {
    rebuildScene();
  }, [rebuildScene]);

  // Lighting Preset Adjustments
  useEffect(() => {
    if (sunLightRef.current && skyLightRef.current && sceneRef.current) {
      if (lightingPreset === "sunset") {
        sunLightRef.current.color.set("#FF8E4D");
        sunLightRef.current.intensity = 1.5;
        sunLightRef.current.position.set(
          layout.plot_width / 2 + 50,
          18,
          layout.plot_length / 2 - 20
        );
        skyLightRef.current.color.set("#FED7AA");
        skyLightRef.current.groundColor.set("#B45309");
        sceneRef.current.background = new THREE.Color(isDarkMode ? "#181412" : "#FFF7ED");
      } else if (lightingPreset === "night") {
        sunLightRef.current.color.set("#38BDF8");
        sunLightRef.current.intensity = 0.35;
        skyLightRef.current.color.set("#1E293B");
        skyLightRef.current.groundColor.set("#0F172A");
        sceneRef.current.background = new THREE.Color("#0F1218");
      } else if (lightingPreset === "studio") {
        sunLightRef.current.color.set("#FFFFFF");
        sunLightRef.current.intensity = 1.25;
        skyLightRef.current.color.set("#FFFFFF");
        skyLightRef.current.groundColor.set("#E2E8F0");
        sceneRef.current.background = new THREE.Color(isDarkMode ? "#1A1A1D" : "#F8FAFC");
      } else {
        // Daylight
        sunLightRef.current.color.set("#FFFBF0");
        sunLightRef.current.intensity = 1.45;
        sunLightRef.current.position.set(
          layout.plot_width / 2 + 35,
          52,
          layout.plot_length / 2 - 30
        );
        skyLightRef.current.color.set("#FFFFFF");
        skyLightRef.current.groundColor.set("#CBD5E1");
        sceneRef.current.background = new THREE.Color(isDarkMode ? "#121214" : "#F3F4F6");
      }
    }
  }, [lightingPreset, isDarkMode, layout]);

  // Camera Preset Adjustments
  useEffect(() => {
    if (!cameraRef.current || !controlsRef.current) return;
    const cx = layout.plot_width / 2;
    const cz = layout.plot_length / 2;

    if (cameraPreset === "top") {
      cameraRef.current.position.set(cx, 85, cz + 0.1);
      controlsRef.current.target.set(cx, 0, cz);
    } else if (cameraPreset === "front") {
      cameraRef.current.position.set(cx, 12, cz + 65);
      controlsRef.current.target.set(cx, 5, cz);
    } else if (cameraPreset === "perspective") {
      cameraRef.current.position.set(cx + 46, 28, cz + 46);
      controlsRef.current.target.set(cx, 3, cz);
    } else if (cameraPreset === "interior") {
      cameraRef.current.position.set(cx - 5, 5.5, cz - 5);
      controlsRef.current.target.set(cx + 10, 5.5, cz + 10);
    } else {
      // Isometric default
      cameraRef.current.position.set(cx + 42, 38, cz + 42);
      controlsRef.current.target.set(cx, 0, cz);
    }
  }, [cameraPreset, layout]);

  // Focus camera when room selection changes
  useEffect(() => {
    if (!selectedRoomId || !cameraRef.current || !controlsRef.current) return;
    const allRooms = [
      ...(layout.rooms || []),
      ...(layout.floors ? layout.floors.flatMap((f) => f.rooms || []) : []),
    ];
    const room = allRooms.find((r) => r.id === selectedRoomId);
    if (room && room.rect) {
      const rx = room.rect.x + room.rect.width / 2;
      const rz = room.rect.y + room.rect.length / 2;
      controlsRef.current.target.set(rx, 1.5, rz);
    }
  }, [selectedRoomId, layout]);

  const handleResetCamera = () => {
    onChangeCameraPreset?.("isometric");
    if (controlsRef.current && cameraRef.current) {
      const cx = layout.plot_width / 2;
      const cz = layout.plot_length / 2;
      cameraRef.current.position.set(cx + 42, 38, cz + 42);
      controlsRef.current.target.set(cx, 0, cz);
    }
  };

  return (
    <div className="relative w-full h-full select-none overflow-hidden bg-[#ECEEF2]">
      {/* Floating 3D Controls (Top Left / Responsive) */}
      <div className="absolute top-16 sm:top-20 left-3 sm:left-6 z-30 flex flex-wrap items-center gap-1.5 sm:gap-2 max-w-[calc(100vw-24px)] pointer-events-auto">
        {/* View Perspective */}
        <div className="flex items-center p-0.5 sm:p-1 rounded-full bg-[#12141A]/90 backdrop-blur-md border border-white/10 shadow-2xl text-[10px] sm:text-[11px] font-mono text-[#9E9C98]">
          <button
            onClick={() => onChangeCameraPreset?.("isometric")}
            className={`px-2.5 sm:px-3 py-1 rounded-full transition-all ${
              cameraPreset === "isometric" || cameraPreset === "perspective"
                ? "bg-[#F5F3EF] text-[#0A0B0E] font-medium shadow-sm"
                : "hover:text-[#F5F3EF]"
            }`}
          >
            EXTERIOR
          </button>
          <button
            onClick={() => onChangeCameraPreset?.("interior")}
            className={`px-2.5 sm:px-3 py-1 rounded-full transition-all ${
              cameraPreset === "interior"
                ? "bg-[#F5F3EF] text-[#0A0B0E] font-medium shadow-sm"
                : "hover:text-[#F5F3EF]"
            }`}
          >
            INTERIOR
          </button>
          <button
            onClick={onToggleWallHeightMode}
            className={`px-2.5 sm:px-3 py-1 rounded-full transition-all ${
              wallHeightMode === "cutaway"
                ? "bg-[#C48446] text-[#0A0B0E] font-medium"
                : "hover:text-[#F5F3EF]"
            }`}
            title="Toggle Cutaway / Full Walls"
          >
            CUTAWAY
          </button>
          <button
            onClick={() => {
              if (onToggleStructure) {
                onToggleStructure();
              } else {
                setInternalShowStructure((prev) => !prev);
              }
            }}
            className={`px-2.5 sm:px-3 py-1 rounded-full transition-all ${
              effectiveShowStructure
                ? "bg-[#C48446] text-[#0A0B0E] font-medium"
                : "hover:text-[#F5F3EF]"
            }`}
            title="Toggle preliminary structural column grid and vertical pillars"
          >
            {effectiveShowStructure ? "STRUCTURE ON" : "STRUCTURE"}
          </button>
          <button
            onClick={() => {
              if (onToggleLandscape) {
                onToggleLandscape();
              } else {
                setInternalShowLandscape((prev) => !prev);
              }
            }}
            className={`px-2.5 sm:px-3 py-1 rounded-full transition-all ${
              effectiveShowLandscape
                ? "bg-[#2D6A4F] text-[#F5F3EF] font-medium"
                : "hover:text-[#F5F3EF]"
            }`}
            title="Toggle site landscaping layer (lawns, trees, pathway, driveway, features)"
          >
            {effectiveShowLandscape ? "LANDSCAPE ON" : "LANDSCAPE"}
          </button>
        </div>

        {/* Landscape Category Filter */}
        {effectiveShowLandscape && (
          <div className="flex items-center p-0.5 sm:p-1 rounded-full bg-[#12141A]/90 backdrop-blur-md border border-white/10 shadow-2xl text-[9px] sm:text-[10px] font-mono text-[#9E9C98]">
            {(["all", "vegetation", "paths", "lighting", "furniture"] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => setLandscapeCategory(cat)}
                className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full transition-all uppercase ${
                  landscapeCategory === cat
                    ? "bg-[#2D6A4F] text-[#F5F3EF] font-medium shadow-sm"
                    : "hover:text-[#F5F3EF]"
                }`}
              >
                {cat === "vegetation" ? "VEG" : cat === "lighting" ? "LIGHTS" : cat}
              </button>
            ))}
          </div>
        )}

        {/* Lighting: Daylight / Sunset */}
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

        {/* Reset Camera */}
        <button
          onClick={handleResetCamera}
          className="hidden sm:inline-flex px-3.5 py-1.5 rounded-full bg-[#12141A]/90 backdrop-blur-md border border-white/10 text-[#9E9C98] hover:text-[#F5F3EF] text-[11px] font-mono shadow-2xl transition-colors"
          title="Reset Camera Orientation"
        >
          RESET ORBIT
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

      {/* 3D WebGL Canvas */}
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />
    </div>
  );
};

// Procedural Detailed Architectural Furniture Library
function buildArchitecturalFurniture(
  item: FurnitureItem,
  isDark: boolean,
  isSelected: boolean
): THREE.Group | null {
  const group = new THREE.Group();
  const iw = Math.max(0.5, Number(item.width) || 2.0);
  const il = Math.max(0.5, Number(item.length) || 2.0);

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
    roughness: 0.3,
  });
  const linenFabricMat = new THREE.MeshStandardMaterial({
    color: isDark ? "#524E4A" : isSelected ? "#FDBA74" : "#D4CCC0",
    roughness: 0.85,
  });
  const accentFabricMat = new THREE.MeshStandardMaterial({
    color: isDark ? "#9A3412" : "#C2410C",
    roughness: 0.85,
  });
  const metalMat = new THREE.MeshStandardMaterial({
    color: isDark ? "#1C1917" : "#2B2825",
    roughness: 0.35,
    metalness: 0.8,
  });
  const quartzMat = new THREE.MeshStandardMaterial({
    color: isDark ? "#3F3F46" : "#F1EFEB",
    roughness: 0.2,
    metalness: 0.1,
  });

  // Wardrobe / Closet
  if (item.type.includes("wardrobe") || item.type.includes("closet")) {
    const wardrobe = new THREE.Mesh(new THREE.BoxGeometry(iw, 6.5, il), darkWoodMat);
    wardrobe.position.y = 3.25;
    wardrobe.castShadow = true;
    group.add(wardrobe);
    return group;
  }

  // Nightstand / Side Table
  if (item.type.includes("nightstand") || item.type.includes("side_table")) {
    const table = new THREE.Mesh(new THREE.BoxGeometry(iw, 1.8, il), oakMat);
    table.position.y = 0.9;
    table.castShadow = true;
    group.add(table);
    return group;
  }

  // 1. BED / PRIMARY SUITE
  if (item.type.includes("bed")) {
    // Wood Plinth Base
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(iw, 0.45, il), oakMat);
    plinth.position.y = 0.22;
    plinth.castShadow = true;
    group.add(plinth);

    // Mattress
    const mattress = new THREE.Mesh(new THREE.BoxGeometry(iw - 0.2, 0.75, il - 0.25), whiteMat);
    mattress.position.y = 0.8;
    mattress.castShadow = true;
    group.add(mattress);

    // Headboard
    const headboard = new THREE.Mesh(new THREE.BoxGeometry(iw + 0.3, 2.6, 0.3), linenFabricMat);
    headboard.position.set(0, 1.3, -il / 2 + 0.15);
    headboard.castShadow = true;
    group.add(headboard);

    // Pair of Pillows
    const pw = (iw - 0.6) / 2;
    const p1 = new THREE.Mesh(new THREE.BoxGeometry(pw, 0.25, 1.3), whiteMat);
    p1.position.set(-pw / 2 - 0.1, 1.25, -il / 2 + 1.1);
    p1.rotation.x = THREE.MathUtils.degToRad(12);
    const p2 = p1.clone();
    p2.position.x = pw / 2 + 0.1;
    group.add(p1, p2);

    // Folded Duvet Runner
    const runner = new THREE.Mesh(new THREE.BoxGeometry(iw - 0.15, 0.2, il * 0.4), accentFabricMat);
    runner.position.set(0, 1.25, il / 2 - il * 0.2);
    group.add(runner);

    return group;
  }

  // 2. SOFA / LIVING ROOM
  if (item.type.includes("sofa") || item.type.includes("couch")) {
    const seatH = 0.55;
    // Seat base
    const base = new THREE.Mesh(new THREE.BoxGeometry(iw, 0.4, il), darkWoodMat);
    base.position.y = 0.2;
    base.castShadow = true;
    group.add(base);

    // Seat Cushions
    const seat = new THREE.Mesh(new THREE.BoxGeometry(iw - 0.2, seatH, il - 0.6), linenFabricMat);
    seat.position.set(0, 0.65, 0.15);
    seat.castShadow = true;
    group.add(seat);

    // Backrest
    const back = new THREE.Mesh(new THREE.BoxGeometry(iw, 1.4, 0.55), linenFabricMat);
    back.position.set(0, 1.1, -il / 2 + 0.28);
    back.castShadow = true;
    group.add(back);

    // Armrests
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.05, il), linenFabricMat);
    armL.position.set(-iw / 2 + 0.22, 0.72, 0);
    const armR = armL.clone();
    armR.position.x = iw / 2 - 0.22;
    group.add(armL, armR);

    return group;
  }

  // 3. COFFEE TABLE
  if (item.type.includes("coffee_table")) {
    const top = new THREE.Mesh(new THREE.BoxGeometry(iw, 0.12, il), oakMat);
    top.position.y = 1.0;
    top.castShadow = true;
    group.add(top);

    // 4 Slim Metal Legs
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

  // 4. DINING TABLE & CHAIRS
  if (item.type.includes("dining_table")) {
    const tableTop = new THREE.Mesh(new THREE.BoxGeometry(iw, 0.18, il), oakMat);
    tableTop.position.y = 2.4;
    tableTop.castShadow = true;
    group.add(tableTop);

    // Table legs
    const legGeo = new THREE.BoxGeometry(0.18, 2.4, 0.18);
    const ox = iw / 2 - 0.35;
    const oz = il / 2 - 0.35;
    [[-ox, -oz], [ox, -oz], [-ox, oz], [ox, oz]].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(legGeo, oakMat);
      leg.position.set(lx, 1.2, lz);
      group.add(leg);
    });

    // 4 Chairs Tucked In
    const chairSeats = [
      { x: -iw / 2 + 0.6, z: 0, rot: 90 },
      { x: iw / 2 - 0.6, z: 0, rot: -90 },
      { x: 0, z: -il / 2 + 0.6, rot: 0 },
      { x: 0, z: il / 2 - 0.6, rot: 180 },
    ];
    chairSeats.forEach((cs) => {
      const chair = new THREE.Group();
      chair.position.set(cs.x, 0, cs.z);
      chair.rotation.y = THREE.MathUtils.degToRad(cs.rot);

      const seat = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.1, 1.4), darkWoodMat);
      seat.position.y = 1.4;
      const back = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.3, 0.1), darkWoodMat);
      back.position.set(0, 2.05, -0.65);
      chair.add(seat, back);
      group.add(chair);
    });

    return group;
  }

  // 5. KITCHEN CABINETRY & APPLIANCES
  if (item.type.includes("counter") || item.type.includes("kitchen")) {
    // Base Cabinet
    const base = new THREE.Mesh(new THREE.BoxGeometry(iw, 2.6, il), darkWoodMat);
    base.position.y = 1.3;
    base.castShadow = true;
    group.add(base);

    // Quartz Countertop
    const top = new THREE.Mesh(new THREE.BoxGeometry(iw + 0.1, 0.16, il + 0.1), quartzMat);
    top.position.y = 2.68;
    group.add(top);

    // Undermount Sink
    const sink = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.05, 1.2), metalMat);
    sink.position.set(-iw * 0.2, 2.7, 0);
    group.add(sink);

    // Cooktop
    const cooktop = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.04, 1.4),
      new THREE.MeshStandardMaterial({ color: "#111827", roughness: 0.1 })
    );
    cooktop.position.set(iw * 0.2, 2.72, 0);
    group.add(cooktop);

    return group;
  }

  // 6. SANITARYWARE: TOILET & VANITY
  if (item.type.includes("toilet")) {
    const cistern = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.8, 0.7), whiteMat);
    cistern.position.set(0, 1.2, -0.45);
    cistern.castShadow = true;
    const bowl = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.5), whiteMat);
    bowl.position.set(0, 0.55, 0.35);
    bowl.castShadow = true;
    group.add(cistern, bowl);
    return group;
  }

  if (item.type.includes("vanity") || item.type.includes("shower")) {
    const vanity = new THREE.Mesh(new THREE.BoxGeometry(iw, 2.2, il), oakMat);
    vanity.position.y = 1.1;
    vanity.castShadow = true;
    const basin = new THREE.Mesh(new THREE.BoxGeometry(iw - 0.4, 0.3, il - 0.4), whiteMat);
    basin.position.y = 2.35;
    group.add(vanity, basin);
    return group;
  }

  // 7. DECOR & PLANT
  if (item.type.includes("plant")) {
    const pot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.35, 1.1, 16),
      new THREE.MeshStandardMaterial({ color: "#9A3412", roughness: 0.85 })
    );
    pot.position.y = 0.55;
    pot.castShadow = true;
    const foliage = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.85, 1),
      new THREE.MeshStandardMaterial({ color: "#2D5A27", roughness: 0.9 })
    );
    foliage.position.y = 1.6;
    foliage.castShadow = true;
    group.add(pot, foliage);
    return group;
  }

  // Generic Clean Geometric Furniture Box
  const box = new THREE.Mesh(new THREE.BoxGeometry(iw, 1.2, il), linenFabricMat);
  box.position.y = 0.6;
  box.castShadow = true;
  group.add(box);
  return group;
}

// Procedural Architectural 3D Landscaping Engine & Reusable Builders

function createLawn(lawn: LandscapeElement, lawnMat: THREE.Material): THREE.Mesh {
  const lw = Math.max(2.0, lawn.width || 8.0);
  const ll = Math.max(2.0, lawn.length || 6.0);
  const lawnGeo = new THREE.BoxGeometry(lw, 0.05, ll);
  const lawnMesh = new THREE.Mesh(lawnGeo, lawnMat);
  lawnMesh.position.set(lawn.x, 0.025, lawn.y);
  lawnMesh.receiveShadow = true;
  lawnMesh.castShadow = false;
  lawnMesh.userData = { elementId: lawn.element_id, type: "lawn" };
  return lawnMesh;
}

function createDriveway(driveway: LandscapeElement, drivewayMat: THREE.Material): THREE.Group {
  const dwGroup = new THREE.Group();
  const dw = Math.max(4.0, driveway.width || 10.0);
  const dl = Math.max(4.0, driveway.length || 16.0);
  const driveGeo = new THREE.BoxGeometry(dw, 0.04, dl);
  const driveMesh = new THREE.Mesh(driveGeo, drivewayMat);
  driveMesh.position.set(driveway.x, 0.02, driveway.y);
  driveMesh.receiveShadow = true;
  dwGroup.add(driveMesh);

  // Concrete joint score lines
  const jointCount = Math.max(1, Math.floor(dl / 5));
  for (let j = 1; j <= jointCount; j++) {
    const jz = driveway.y - dl / 2 + (j * dl) / (jointCount + 1);
    const linePts = [
      new THREE.Vector3(driveway.x - dw / 2, 0.042, jz),
      new THREE.Vector3(driveway.x + dw / 2, 0.042, jz),
    ];
    const lineGeo = new THREE.BufferGeometry().setFromPoints(linePts);
    const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0x27272a }));
    dwGroup.add(line);
  }
  dwGroup.userData = { elementId: driveway.element_id, type: "driveway" };
  return dwGroup;
}

function createPathway(
  path: LandscapeElement,
  paverGeo: THREE.BufferGeometry,
  pathMat: THREE.Material
): THREE.Group {
  const pathGroup = new THREE.Group();
  if (!path.points || path.points.length < 2) return pathGroup;

  for (let i = 0; i < path.points.length - 1; i++) {
    const p1 = path.points[i];
    const p2 = path.points[i + 1];
    const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    if (segLen < 0.5) continue;
    const steps = Math.max(1, Math.round(segLen / 2.6));
    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);

    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const px = p1.x + (p2.x - p1.x) * t;
      const pz = p1.y + (p2.y - p1.y) * t;
      const paver = new THREE.Mesh(paverGeo, pathMat);
      paver.position.set(px, 0.035, pz);
      paver.rotation.y = -angle;
      paver.receiveShadow = true;
      pathGroup.add(paver);
    }
  }
  pathGroup.userData = { elementId: path.element_id, type: "pathway" };
  return pathGroup;
}

function createTree(
  tree: LandscapeElement,
  idx: number,
  trunkGeo: THREE.BufferGeometry,
  trunkMat: THREE.Material,
  foliageMat1: THREE.Material,
  foliageMat2: THREE.Material,
  canopyDodecGeo: THREE.BufferGeometry,
  canopyConeGeo: THREE.BufferGeometry
): THREE.Group {
  const treeGroup = new THREE.Group();
  treeGroup.position.set(tree.x, 0, tree.y);

  // Deterministic slight scale and rotation variation
  const scaleMult = 0.9 + (idx % 3) * 0.12;
  const rotY = ((idx * 47) % 360) * (Math.PI / 180);

  // Trunk
  const trunkMesh = new THREE.Mesh(trunkGeo, trunkMat);
  trunkMesh.position.y = 2.25 * scaleMult;
  trunkMesh.scale.set(scaleMult, scaleMult, scaleMult);
  trunkMesh.castShadow = true;
  trunkMesh.receiveShadow = true;
  treeGroup.add(trunkMesh);

  // Foliage
  const isConical = idx % 2 === 1 || tree.properties?.foliage_type === "conical";
  const foliageMat = idx % 3 === 0 ? foliageMat1 : foliageMat2;

  if (isConical) {
    const canopy = new THREE.Mesh(canopyConeGeo, foliageMat);
    canopy.position.y = 5.2 * scaleMult;
    canopy.scale.set(scaleMult, scaleMult, scaleMult);
    canopy.rotation.y = rotY;
    canopy.castShadow = true;
    canopy.receiveShadow = true;
    treeGroup.add(canopy);
  } else {
    const mainCanopy = new THREE.Mesh(canopyDodecGeo, foliageMat);
    mainCanopy.position.y = 4.8 * scaleMult;
    mainCanopy.scale.set(scaleMult, scaleMult, scaleMult);
    mainCanopy.rotation.y = rotY;
    mainCanopy.castShadow = true;
    mainCanopy.receiveShadow = true;

    const subCanopy = new THREE.Mesh(canopyDodecGeo, foliageMat);
    subCanopy.position.set(0.4 * scaleMult, 5.8 * scaleMult, -0.3 * scaleMult);
    subCanopy.scale.set(scaleMult * 0.7, scaleMult * 0.7, scaleMult * 0.7);
    subCanopy.castShadow = true;

    treeGroup.add(mainCanopy, subCanopy);
  }

  treeGroup.userData = { elementId: tree.element_id, type: "tree" };
  return treeGroup;
}

function createShrub(
  shrub: LandscapeElement,
  shrubGeo: THREE.BufferGeometry,
  hedgeMat: THREE.Material
): THREE.Mesh {
  const shrubMesh = new THREE.Mesh(shrubGeo, hedgeMat);
  const scale = 0.8 + ((Math.abs(Math.sin(shrub.x + shrub.y))) % 0.4);
  shrubMesh.scale.set(scale, scale, scale);
  shrubMesh.position.set(shrub.x, 0.5 * scale, shrub.y);
  shrubMesh.castShadow = true;
  shrubMesh.receiveShadow = true;
  shrubMesh.userData = { elementId: shrub.element_id, type: "shrub" };
  return shrubMesh;
}

function createFlowerBed(
  flowerBed: LandscapeElement,
  planterMat: THREE.Material,
  soilMat: THREE.Material,
  shrubGeo: THREE.BufferGeometry,
  flowerMat1: THREE.Material,
  flowerMat2: THREE.Material
): THREE.Group {
  const group = new THREE.Group();
  const fw = Math.max(2.0, flowerBed.width || 4.0);
  const fl = Math.max(2.0, flowerBed.length || 3.0);

  const border = new THREE.Mesh(new THREE.BoxGeometry(fw, 0.25, fl), planterMat);
  border.position.set(flowerBed.x, 0.125, flowerBed.y);
  border.receiveShadow = true;
  group.add(border);

  const soil = new THREE.Mesh(new THREE.BoxGeometry(fw - 0.3, 0.08, fl - 0.3), soilMat);
  soil.position.set(flowerBed.x, 0.22, flowerBed.y);
  group.add(soil);

  [-fw * 0.25, fw * 0.25].forEach((ox, i) => {
    const flower = new THREE.Mesh(shrubGeo, i % 2 === 0 ? flowerMat1 : flowerMat2);
    flower.position.set(flowerBed.x + ox, 0.45, flowerBed.y);
    flower.scale.set(0.45, 0.45, 0.45);
    flower.castShadow = true;
    group.add(flower);
  });

  group.userData = { elementId: flowerBed.element_id, type: "flower_bed" };
  return group;
}

function createPlanter(
  planter: LandscapeElement,
  planterMat: THREE.Material,
  soilMat: THREE.Material,
  shrubGeo: THREE.BufferGeometry,
  hedgeMat: THREE.Material
): THREE.Group {
  const group = new THREE.Group();
  const pw = planter.width || 2.5;
  const pl = planter.length || 1.5;

  const pBox = new THREE.Mesh(new THREE.BoxGeometry(pw, 1.1, pl), planterMat);
  pBox.position.set(planter.x, 0.55, planter.y);
  pBox.castShadow = true;
  pBox.receiveShadow = true;

  const pSoil = new THREE.Mesh(new THREE.BoxGeometry(pw - 0.3, 0.08, pl - 0.3), soilMat);
  pSoil.position.set(planter.x, 1.05, planter.y);

  [-0.45, 0.45].forEach((ox) => {
    const shrub = new THREE.Mesh(shrubGeo, hedgeMat);
    shrub.position.set(planter.x + ox, 1.45, planter.y);
    shrub.scale.set(0.65, 0.65, 0.65);
    shrub.castShadow = true;
    group.add(shrub);
  });

  group.add(pBox, pSoil);
  group.userData = { elementId: planter.element_id, type: "planter" };
  return group;
}

function createGardenLight(
  light: LandscapeElement,
  bollardPostGeo: THREE.BufferGeometry,
  bollardPostMat: THREE.Material,
  bollardCapGeo: THREE.BufferGeometry,
  bollardGlowMat: THREE.Material,
  isNightOrSunset: boolean,
  lightingPreset: string
): THREE.Group {
  const lightGroup = new THREE.Group();
  lightGroup.position.set(light.x, 0, light.y);

  const post = new THREE.Mesh(bollardPostGeo, bollardPostMat);
  post.position.y = 0.9;
  post.castShadow = true;

  const cap = new THREE.Mesh(bollardCapGeo, bollardGlowMat);
  cap.position.y = 1.95;
  cap.castShadow = false;

  lightGroup.add(post, cap);

  if (isNightOrSunset) {
    const pLight = new THREE.PointLight(
      0xffd08a,
      lightingPreset === "night" ? 0.7 : 0.4,
      14
    );
    pLight.position.y = 2.1;
    pLight.castShadow = false;
    lightGroup.add(pLight);
  }

  lightGroup.userData = { elementId: light.element_id, type: "outdoor_light" };
  return lightGroup;
}

function createGardenSeating(
  bench: LandscapeElement,
  woodBenchMat: THREE.Material,
  metalMat: THREE.Material
): THREE.Group {
  const benchGroup = new THREE.Group();
  benchGroup.position.set(bench.x, 0, bench.y);

  const seat = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.15, 1.6), woodBenchMat);
  seat.position.y = 1.4;
  seat.castShadow = true;

  const back = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.9, 0.12), woodBenchMat);
  back.position.set(0, 2.2, -0.75);
  back.castShadow = true;

  [-2.0, 2.0].forEach((lx) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.4, 1.5), metalMat);
    leg.position.set(lx, 0.7, 0);
    leg.castShadow = true;
    benchGroup.add(leg);
  });

  benchGroup.add(seat, back);
  benchGroup.userData = { elementId: bench.element_id, type: "garden_seating" };
  return benchGroup;
}

function createWaterFeature(
  wf: LandscapeElement,
  planterMat: THREE.Material,
  waterPoolMat: THREE.Material
): THREE.Group {
  const wfGroup = new THREE.Group();
  wfGroup.position.set(wf.x, 0, wf.y);

  const wr = wf.radius || 3.0;
  const basin = new THREE.Mesh(
    new THREE.CylinderGeometry(wr + 0.4, wr + 0.5, 0.45, 24),
    planterMat
  );
  basin.position.y = 0.225;
  basin.castShadow = true;
  basin.receiveShadow = true;

  const water = new THREE.Mesh(new THREE.CylinderGeometry(wr, wr, 0.05, 24), waterPoolMat);
  water.position.y = 0.42;
  wfGroup.add(basin, water);

  wfGroup.userData = { elementId: wf.element_id, type: "water_feature" };
  return wfGroup;
}

function buildLandscape3D(
  group: THREE.Group,
  landscape: LandscapePlan,
  plotWidth: number,
  plotLength: number,
  lightingPreset: string,
  isDarkMode: boolean,
  categoryFilter: "all" | "vegetation" | "paths" | "lighting" | "furniture"
) {
  // 1. Shared PBR Architectural Landscape Materials (Muted palette, never cartoon neon)
  const lawnMat = new THREE.MeshStandardMaterial({
    color: isDarkMode ? "#344B30" : "#557351",
    roughness: 0.92,
    metalness: 0.02,
  });
  const pathMat = new THREE.MeshStandardMaterial({
    color: isDarkMode ? "#3D3A37" : "#D4CEB8",
    roughness: 0.78,
    metalness: 0.05,
  });
  const drivewayMat = new THREE.MeshStandardMaterial({
    color: isDarkMode ? "#27272A" : "#475569",
    roughness: 0.85,
    metalness: 0.08,
  });
  const hedgeMat = new THREE.MeshStandardMaterial({
    color: isDarkMode ? "#263B22" : "#3B5A34",
    roughness: 0.9,
  });
  const trunkMat = new THREE.MeshStandardMaterial({
    color: "#4A3B32",
    roughness: 0.85,
  });
  const foliageMat1 = new THREE.MeshStandardMaterial({
    color: isDarkMode ? "#2B4427" : "#43663C",
    roughness: 0.88,
    flatShading: true,
  });
  const foliageMat2 = new THREE.MeshStandardMaterial({
    color: isDarkMode ? "#243B20" : "#4E7345",
    roughness: 0.9,
    flatShading: true,
  });
  const planterMat = new THREE.MeshStandardMaterial({
    color: isDarkMode ? "#3F3C38" : "#E2E8F0",
    roughness: 0.7,
  });
  const soilMat = new THREE.MeshStandardMaterial({
    color: "#2C221A",
    roughness: 0.96,
  });
  const metalMat = new THREE.MeshStandardMaterial({
    color: "#1E293B",
    roughness: 0.35,
    metalness: 0.8,
  });
  const bollardPostMat = metalMat;
  const isNightOrSunset = lightingPreset === "sunset" || lightingPreset === "night";
  const bollardGlowMat = new THREE.MeshStandardMaterial({
    color: "#FEF3C7",
    emissive: isNightOrSunset ? "#F59E0B" : "#000000",
    emissiveIntensity: lightingPreset === "night" ? 1.6 : lightingPreset === "sunset" ? 0.9 : 0.0,
    roughness: 0.25,
  });
  const woodBenchMat = new THREE.MeshStandardMaterial({
    color: "#78350F",
    roughness: 0.6,
  });
  const waterPoolMat = new THREE.MeshStandardMaterial({
    color: "#38BDF8",
    roughness: 0.08,
    metalness: 0.3,
    transparent: true,
    opacity: 0.85,
  });

  // 2. Shared Low-Poly Geometries (Ensures high WebGL performance)
  const trunkGeo = new THREE.CylinderGeometry(0.32, 0.44, 4.5, 7);
  const canopyDodecGeo = new THREE.DodecahedronGeometry(2.3, 1);
  const canopyConeGeo = new THREE.ConeGeometry(2.5, 5.2, 7);
  const shrubGeo = new THREE.DodecahedronGeometry(0.85, 1);
  const bollardPostGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.8, 8);
  const bollardCapGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.35, 8);
  const paverGeo = new THREE.BoxGeometry(2.2, 0.05, 1.5);

  const showVeg = categoryFilter === "all" || categoryFilter === "vegetation";
  const showPaths = categoryFilter === "all" || categoryFilter === "paths";
  const showLights = categoryFilter === "all" || categoryFilter === "lighting";
  const showFurn = categoryFilter === "all" || categoryFilter === "furniture";

  // A. Lawns & Turf
  if (showVeg) {
    (landscape.elements || [])
      .filter((e) => e.type === "lawn")
      .forEach((lawn) => {
        group.add(createLawn(lawn, lawnMat));
      });
  }

  // B. Vehicular Driveway
  if (showPaths && landscape.driveway) {
    group.add(createDriveway(landscape.driveway, drivewayMat));
  }

  // C. Pedestrian Pathway Stepping Stones
  if (showPaths) {
    (landscape.paths || []).forEach((path) => {
      group.add(createPathway(path, paverGeo, pathMat));
    });
  }

  // D. Perimeter Boundary Hedges
  if (showVeg) {
    (landscape.elements || [])
      .filter((e) => e.type === "hedge" || e.type === "boundary_greenery")
      .forEach((hedge) => {
        const hw = hedge.width || 1.6;
        const hl = hedge.length || 10.0;
        const hh = (hedge.properties?.height as number) || 4.2;
        const hedgeGeo = new THREE.BoxGeometry(hw, hh, hl);
        const hedgeMesh = new THREE.Mesh(hedgeGeo, hedgeMat);
        hedgeMesh.position.set(hedge.x, hh / 2, hedge.y);
        hedgeMesh.castShadow = true;
        hedgeMesh.receiveShadow = true;
        hedgeMesh.userData = { elementId: hedge.element_id, type: "hedge" };
        group.add(hedgeMesh);
      });
  }

  // E. Trees (Specimen Architectural Vegetation)
  if (showVeg) {
    (landscape.elements || [])
      .filter((e) => e.type === "tree")
      .forEach((tree, idx) => {
        group.add(
          createTree(
            tree,
            idx,
            trunkGeo,
            trunkMat,
            foliageMat1,
            foliageMat2,
            canopyDodecGeo,
            canopyConeGeo
          )
        );
      });
  }

  // F. Shrubs & Bushes
  if (showVeg) {
    (landscape.elements || [])
      .filter((e) => (e.type as string) === "shrub" || (e.type as string) === "bush")
      .forEach((shrub) => {
        group.add(createShrub(shrub, shrubGeo, hedgeMat));
      });
  }

  // G. Flower Beds
  if (showVeg) {
    (landscape.elements || [])
      .filter((e) => e.type === "flower_bed")
      .forEach((fb) => {
        group.add(
          createFlowerBed(fb, planterMat, soilMat, shrubGeo, foliageMat1, foliageMat2)
        );
      });
  }

  // H. Planter Boxes & Entry Landings
  if (showVeg) {
    (landscape.elements || [])
      .filter((e) => e.type === "planter")
      .forEach((planter) => {
        group.add(createPlanter(planter, planterMat, soilMat, shrubGeo, hedgeMat));
      });
  }

  // I. Outdoor Lighting (Bollards & Feature Spotlights)
  if (showLights) {
    (landscape.elements || [])
      .filter((e) => e.type === "outdoor_light")
      .forEach((light) => {
        group.add(
          createGardenLight(
            light,
            bollardPostGeo,
            bollardPostMat,
            bollardCapGeo,
            bollardGlowMat,
            isNightOrSunset,
            lightingPreset
          )
        );
      });
  }

  // J. Garden Seating & Furniture
  if (showFurn) {
    (landscape.elements || [])
      .filter((e) => e.type === "garden_seating")
      .forEach((bench) => {
        group.add(createGardenSeating(bench, woodBenchMat, metalMat));
      });
  }

  // K. Water Feature / Reflecting Pool
  if (showFurn) {
    (landscape.elements || [])
      .filter((e) => e.type === "water_feature")
      .forEach((wf) => {
        group.add(createWaterFeature(wf, planterMat, waterPoolMat));
      });
  }
}
