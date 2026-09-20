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
} from "@/types/house";

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
}

export const Dollhouse3D: React.FC<Dollhouse3DProps> = ({
  layout,
  activeFloorIndex,
  onSelectFloor,
  selectedRoomId,
  selectedFurnitureId,
  onSelectRoom,
  onSelectFurniture,
  isDarkMode = true,
  lightingPreset = "day",
  onChangeLightingPreset,
  cameraPreset = "isometric",
  onChangeCameraPreset,
  wallHeightMode = "cutaway",
  onToggleWallHeightMode,
  showRoof = false,
  onToggleRoof,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);

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

  // ---------------------------------------------------------------------------
  // PBR Texture Generators
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // Build Architectural Geometry
  // ---------------------------------------------------------------------------
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

    // PBR Shared Architectural Materials
    const extWallMat = new THREE.MeshStandardMaterial({
      color: isDarkMode ? "#36322E" : "#ECE8E1",
      roughness: 0.85,
      metalness: 0.05,
    });
    const intWallMat = new THREE.MeshStandardMaterial({
      color: isDarkMode ? "#2A2724" : "#F7F5F0",
      roughness: 0.9,
      metalness: 0.02,
    });
    const wallTrimMat = new THREE.MeshStandardMaterial({
      color: isDarkMode ? "#1C1917" : "#2E2A27",
      roughness: 0.4,
      metalness: 0.6,
    });
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: "#BAE6FD",
      transparent: true,
      opacity: 0.4,
      roughness: 0.05,
      transmission: 0.85,
      ior: 1.5,
    });
    const frameMat = new THREE.MeshStandardMaterial({
      color: isDarkMode ? "#1C1917" : "#332F2B",
      roughness: 0.3,
      metalness: 0.8,
    });
    const doorLeafMat = new THREE.MeshStandardMaterial({
      color: isDarkMode ? "#4A3525" : "#785838",
      roughness: 0.6,
    });
    const ceilingMat = new THREE.MeshStandardMaterial({
      color: isDarkMode ? "#22201E" : "#FAF8F5",
      roughness: 0.95,
    });

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

    // 1. Foundation / Floor Slab
    const slabW = layout.plot_width + 1.0;
    const slabL = layout.plot_length + 1.0;
    const slabGeo = new THREE.BoxGeometry(slabW, 0.4, slabL);
    const slabMat = new THREE.MeshStandardMaterial({
      color: isDarkMode ? "#292524" : "#E2DDD5",
      roughness: 0.8,
    });
    const slabMesh = new THREE.Mesh(slabGeo, slabMat);
    slabMesh.position.set(layout.plot_width / 2, -0.2, layout.plot_length / 2);
    slabMesh.receiveShadow = true;
    floorGroup.add(slabMesh);

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
      const midX = (wall.x1 + wall.x2) / 2;
      const midZ = (wall.y1 + wall.y2) / 2;
      const thickness = wall.thickness || 0.45;
      const isExt = wall.is_exterior;

      // Find doors or windows hosted on or intersecting this wall segment
      const hostedDoors = (floor.doors || []).filter((d) => {
        const dmx = (d.x1 + d.x2) / 2;
        const dmy = (d.y1 + d.y2) / 2;
        const distToStart = Math.hypot(dmx - wall.x1, dmy - wall.y1);
        const distToEnd = Math.hypot(dmx - wall.x2, dmy - wall.y2);
        return Math.abs(distToStart + distToEnd - wallLen) < 0.8;
      });

      const hostedWindows = (floor.windows || []).filter((w) => {
        const wmx = (w.x1 + w.x2) / 2;
        const wmy = (w.y1 + w.y2) / 2;
        const distToStart = Math.hypot(wmx - wall.x1, wmy - wall.y1);
        const distToEnd = Math.hypot(wmx - wall.x2, wmy - wall.y2);
        return Math.abs(distToStart + distToEnd - wallLen) < 0.8;
      });

      if (hostedDoors.length === 0 && hostedWindows.length === 0) {
        // Solid continuous wall
        const geo = new THREE.BoxGeometry(wallLen, currentWallHeight, thickness);
        const mesh = new THREE.Mesh(geo, isExt ? extWallMat : intWallMat);
        mesh.position.set(midX, currentWallHeight / 2, midZ);
        mesh.rotation.y = -angle;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        floorGroup.add(mesh);
      } else {
        // Subdivided wall around openings
        // Render base solid portion
        const geo = new THREE.BoxGeometry(wallLen, currentWallHeight, thickness);
        const mesh = new THREE.Mesh(geo, isExt ? extWallMat : intWallMat);
        mesh.position.set(midX, currentWallHeight / 2, midZ);
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
      const parapetGeo = new THREE.BoxGeometry(slabW, parapetHeight, 0.4);
      const parapetMat = extWallMat;

      // Front & Rear Parapets
      const pFront = new THREE.Mesh(parapetGeo, parapetMat);
      pFront.position.set(layout.plot_width / 2, fullWallHeight + parapetHeight / 2, slabL / 2);
      const pRear = pFront.clone();
      pRear.position.z = -slabL / 2;

      floorGroup.add(pFront, pRear);
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
  ]);

  // ---------------------------------------------------------------------------
  // Scene Mount & Animation Loop
  // ---------------------------------------------------------------------------
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
      color: isDarkMode ? "#18181A" : "#F4EFE6",
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
        sunLightRef.current.intensity = 1.6;
        sunLightRef.current.position.set(
          layout.plot_width / 2 + 50,
          18,
          layout.plot_length / 2 - 20
        );
        skyLightRef.current.color.set("#FED7AA");
        skyLightRef.current.groundColor.set("#78350F");
        sceneRef.current.background = new THREE.Color(isDarkMode ? "#181412" : "#F7EFE9");
      } else if (lightingPreset === "night") {
        sunLightRef.current.color.set("#38BDF8");
        sunLightRef.current.intensity = 0.35;
        skyLightRef.current.color.set("#1E293B");
        skyLightRef.current.groundColor.set("#0F172A");
        sceneRef.current.background = new THREE.Color("#0F1218");
      } else if (lightingPreset === "studio") {
        sunLightRef.current.color.set("#FFFFFF");
        sunLightRef.current.intensity = 1.1;
        skyLightRef.current.color.set("#F8FAFC");
        skyLightRef.current.groundColor.set("#E2E8F0");
        sceneRef.current.background = new THREE.Color(isDarkMode ? "#1A1A1D" : "#F8F8FA");
      } else {
        // Daylight
        sunLightRef.current.color.set("#FFFDF7");
        sunLightRef.current.intensity = 1.35;
        sunLightRef.current.position.set(
          layout.plot_width / 2 + 35,
          52,
          layout.plot_length / 2 - 30
        );
        skyLightRef.current.color.set("#FFFFFF");
        skyLightRef.current.groundColor.set("#EBE6DF");
        sceneRef.current.background = new THREE.Color(isDarkMode ? "#121214" : "#FAF8F5");
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
    <div className="relative w-full h-full select-none overflow-hidden bg-[#0A0B0E]">
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
        </div>

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

// =============================================================================
// Procedural Detailed Architectural Furniture Library
// =============================================================================
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
