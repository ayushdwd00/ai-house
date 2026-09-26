"use client";

import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import {
  HouseLayout,
  FloorPlan,
  Room,
  FurnitureItem,
  Wall,
} from "@/types/house";
import {
  Engine,
  Scene,
  ArcRotateCamera,
  Vector3,
  Color3,
  Color4,
  HemisphericLight,
  DirectionalLight,
  PointLight,
  ShadowGenerator,
  MeshBuilder,
  PBRMaterial,
  StandardMaterial,
  TransformNode,
  AbstractMesh,
  Mesh,
  HDRCubeTexture,
  Ray,
  PointerEventTypes,
  PointerInfo,
  Animation,
  EasingFunction,
  CubicEase,
  Matrix,
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import {
  Camera,
  Compass,
  Layers,
  Sparkles,
  Sun,
  Moon,
  ChevronDown,
  Maximize2,
  Minimize2,
  Plus,
  Minus,
  Check,
  Scissors,
  Home,
  Info,
} from "lucide-react";
import {
  generateArchitecturalLandscape,
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
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Authoritative Architectural Elevation Constants
  const plinthHeight = 0.8;   // Finished plinth at y = 0.8 ft
  const floorHeight = 10.0;   // Height from floor to floor (10 ft)
  const fullWallHeight = 9.5; // Clear wall height (9.5 ft)
  const cutawayWallHeight = 3.5; // Selective cutaway wall height (exposes interior)
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

  // Realistic Render Modal State
  const [isRenderModalOpen, setIsRenderModalOpen] = useState(false);
  const [isEditingRoom, setIsEditingRoom] = useState(false);

  // Babylon.js Core Refs
  const engineRef = useRef<Engine | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const cameraRef = useRef<ArcRotateCamera | null>(null);
  const sunLightRef = useRef<DirectionalLight | null>(null);
  const skyLightRef = useRef<HemisphericLight | null>(null);
  const shadowGenRef = useRef<ShadowGenerator | null>(null);
  const houseRootRef = useRef<TransformNode | null>(null);
  const interiorLightsRef = useRef<PointLight[]>([]);

  // Asset Caches (AssetContainers for GLB instancing)
  const loadedModelsRef = useRef<Record<string, any>>({});
  const [assetsReady, setAssetsReady] = useState(false);

  // --------------------------------------------------------------------------
  // 1. BABYLON PBR MATERIAL PALETTE (Curated Architectural Finish Palette)
  // --------------------------------------------------------------------------
  const getOrCreatePBRMaterial = useCallback((name: string, scene: Scene, config: {
    albedoHex: string;
    roughness?: number;
    metallic?: number;
    alpha?: number;
    emissiveHex?: string;
  }): PBRMaterial => {
    let mat = scene.getMaterialByName(name) as PBRMaterial;
    if (!mat) {
      mat = new PBRMaterial(name, scene);
      mat.albedoColor = Color3.FromHexString(config.albedoHex);
      mat.roughness = config.roughness ?? 0.85;
      mat.metallic = config.metallic ?? 0.0;
      if (config.alpha !== undefined && config.alpha < 1.0) {
        mat.alpha = config.alpha;
        mat.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
      }
      if (config.emissiveHex) {
        mat.emissiveColor = Color3.FromHexString(config.emissiveHex);
      }
      mat.maxSimultaneousLights = 4;
    }
    return mat;
  }, []);

  // --------------------------------------------------------------------------
  // 2. INITIALIZE BABYLON.JS ENGINE & ARCHITECTURAL 3/4 CAMERA
  // --------------------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Create high-performance Babylon engine
    const engine = new Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
      adaptToDeviceRatio: true,
      powerPreference: "high-performance",
    });
    engineRef.current = engine;

    const scene = new Scene(engine);
    scene.clearColor = isDarkMode ? new Color4(0.06, 0.07, 0.09, 1.0) : new Color4(0.91, 0.93, 0.94, 1.0);
    sceneRef.current = scene;

    // ACES Tone Mapping & Color Management (Prevents overexposure & blown-out whites)
    scene.imageProcessingConfiguration.toneMappingEnabled = true;
    scene.imageProcessingConfiguration.toneMappingType = 1; // ACES Filmic Tone Mapping
    scene.imageProcessingConfiguration.exposure = 0.88;
    scene.imageProcessingConfiguration.contrast = 1.08;

    // House diagonal & framing
    const diag = Math.hypot(pw, pl);
    const target = new Vector3(cx, plinthHeight + 3.8, cz);

    // Initial 3/4 Perspective Camera matching Reference Image
    // Elevated top-down 3/4 view: beta ~ 58° (1.02 rad), alpha ~ 45° (0.785 rad)
    let initialAlpha = Math.PI * 0.25;
    if (resolvedFacing === "west") initialAlpha = Math.PI * 0.75;
    else if (resolvedFacing === "north") initialAlpha = Math.PI * 1.25;
    else if (resolvedFacing === "east") initialAlpha = Math.PI * 1.75;

    const camera = new ArcRotateCamera(
      "archDollhouseCamera",
      initialAlpha,
      Math.PI * 0.32, // ~58 deg elevation angle
      diag * 1.65,    // frames house filling 75-80% of viewport
      target,
      scene
    );
    camera.attachControl(canvas, true);
    camera.wheelPrecision = 18;
    camera.minZ = 0.5;
    camera.maxZ = 1200;
    camera.lowerBetaLimit = 0.08;
    camera.upperBetaLimit = Math.PI / 2 - 0.04; // Don't dip below horizon
    camera.lowerRadiusLimit = 12;
    camera.upperRadiusLimit = 280;
    camera.inertia = 0.82;
    cameraRef.current = camera;

    // ------------------------------------------------------------------------
    // LIGHTING: Natural Daylight with Soft Architectural Contact Shadows
    // ------------------------------------------------------------------------
    const sunLight = new DirectionalLight(
      "sunLight",
      new Vector3(-0.6, -0.9, -0.6).normalize(),
      scene
    );
    sunLight.position = new Vector3(cx + diag * 0.7, diag * 1.2, cz + diag * 0.7);
    sunLight.diffuse = Color3.FromHexString("#FFFAED");
    sunLight.intensity = 1.35;
    sunLightRef.current = sunLight;

    const skyLight = new HemisphericLight(
      "skyLight",
      new Vector3(0, 1, 0),
      scene
    );
    skyLight.diffuse = Color3.FromHexString("#E2EAF4");
    skyLight.groundColor = Color3.FromHexString("#475569");
    skyLight.intensity = 0.42;
    skyLightRef.current = skyLight;

    // Shadow Generator
    const shadowGen = new ShadowGenerator(2048, sunLight);
    shadowGen.useBlurExponentialShadowMap = true;
    shadowGen.blurKernel = 32;
    shadowGen.darkness = 0.32;
    shadowGen.bias = 0.0004;
    shadowGenRef.current = shadowGen;

    // HDRI Ambient Environment
    try {
      const hdrTexture = new HDRCubeTexture(
        "/environments/sky_architectural.hdr",
        scene,
        256,
        false,
        true,
        false,
        true
      );
      scene.environmentTexture = hdrTexture;
      scene.environmentIntensity = 0.35;
    } catch (e) {
      console.warn("[Notice] Fallback ambient environment will be used:", e);
    }

    // Root node for house architecture
    const houseRoot = new TransformNode("houseRoot", scene);
    houseRootRef.current = houseRoot;

    // Preload GLB Furniture & Nature assets
    const modelsToLoad = [
      { id: "sofa", path: "/models/furniture/sofa.glb" },
      { id: "bed", path: "/models/furniture/bed.glb" },
      { id: "dining_table", path: "/models/furniture/dining_table.glb" },
      { id: "dining_chair", path: "/models/furniture/dining_chair.glb" },
      { id: "kitchen_counter", path: "/models/furniture/kitchen_counter.glb" },
      { id: "coffee_table", path: "/models/furniture/coffee_table.glb" },
      { id: "nightstand", path: "/models/furniture/nightstand.glb" },
      { id: "tv_unit", path: "/models/furniture/tv_unit.glb" },
      { id: "wardrobe", path: "/models/furniture/wardrobe.glb" },
      { id: "toilet", path: "/models/furniture/toilet.glb" },
      { id: "basin", path: "/models/furniture/basin.glb" },
      { id: "shower", path: "/models/furniture/shower.glb" },
      { id: "outdoor_table", path: "/models/furniture/outdoor_table.glb" },
      { id: "outdoor_chair", path: "/models/furniture/outdoor_chair.glb" },
      { id: "planter", path: "/models/furniture/planter.glb" },
      { id: "tree_small", path: "/models/tree_small.glb" },
      { id: "bush", path: "/models/bush.glb" },
    ];

    let loadedCount = 0;
    modelsToLoad.forEach((item) => {
      SceneLoader.LoadAssetContainer("", item.path, scene, (container) => {
        loadedModelsRef.current[item.id] = container;
        loadedCount++;
        if (loadedCount >= modelsToLoad.length - 2) {
          setAssetsReady(true);
        }
      }, null, () => {
        loadedCount++;
        if (loadedCount >= modelsToLoad.length - 2) {
          setAssetsReady(true);
        }
      });
    });

    // Raycast Interaction for selecting rooms
    scene.onPointerObservable.add((pointerInfo: PointerInfo) => {
      if (pointerInfo.type === PointerEventTypes.POINTERDOWN && pointerInfo.pickInfo?.hit) {
        const pickedMesh = pointerInfo.pickInfo.pickedMesh;
        if (pickedMesh && pickedMesh.metadata?.roomId) {
          onSelectRoom(pickedMesh.metadata.roomId);
        }
      }
    });

    // Render Loop
    engine.runRenderLoop(() => {
      scene.render();
    });

    // Resize Handling
    const handleResize = () => {
      engine.resize();
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      engine.dispose();
    };
  }, [cx, cz, pw, pl, isDarkMode, resolvedFacing, plinthHeight]);

  // --------------------------------------------------------------------------
  // 3. LIGHTING PRESETS DYNAMIC UPDATE (Day / Dusk / Night)
  // --------------------------------------------------------------------------
  useEffect(() => {
    const sun = sunLightRef.current;
    const sky = skyLightRef.current;
    const scene = sceneRef.current;
    if (!sun || !sky || !scene) return;

    const diag = Math.hypot(pw, pl);

    if (effectiveLightingPreset === "day") {
      sun.diffuse = Color3.FromHexString("#FFFAED");
      sun.intensity = 1.35;
      sun.direction = new Vector3(-0.6, -0.9, -0.6).normalize();
      sun.position = new Vector3(cx + diag * 0.7, diag * 1.2, cz + diag * 0.7);

      sky.diffuse = Color3.FromHexString("#E2EAF4");
      sky.groundColor = Color3.FromHexString("#475569");
      sky.intensity = 0.42;

      scene.environmentIntensity = 0.35;
      scene.clearColor = isDarkMode ? new Color4(0.06, 0.07, 0.09, 1.0) : new Color4(0.91, 0.93, 0.94, 1.0);
      scene.imageProcessingConfiguration.exposure = 0.88;

      interiorLightsRef.current.forEach((l) => (l.intensity = 0.0));
    } else if (effectiveLightingPreset === "sunset") {
      sun.diffuse = Color3.FromHexString("#F59E0B");
      sun.intensity = 1.05;
      sun.direction = new Vector3(0.8, -0.4, -0.4).normalize();
      sun.position = new Vector3(cx - diag * 0.9, diag * 0.5, cz + diag * 0.5);

      sky.diffuse = Color3.FromHexString("#FB923C");
      sky.groundColor = Color3.FromHexString("#1E1B4B");
      sky.intensity = 0.35;

      scene.environmentIntensity = 0.28;
      scene.clearColor = isDarkMode ? new Color4(0.05, 0.06, 0.08, 1.0) : new Color4(0.82, 0.85, 0.88, 1.0);
      scene.imageProcessingConfiguration.exposure = 0.92;

      interiorLightsRef.current.forEach((l) => (l.intensity = 0.45));
    } else if (effectiveLightingPreset === "night") {
      sun.diffuse = Color3.FromHexString("#93C5FD");
      sun.intensity = 0.28;
      sun.direction = new Vector3(-0.5, -0.8, 0.5).normalize();
      sun.position = new Vector3(cx + diag * 0.6, diag * 0.9, cz - diag * 0.6);

      sky.diffuse = Color3.FromHexString("#1E293B");
      sky.groundColor = Color3.FromHexString("#090A0F");
      sky.intensity = 0.16;

      scene.environmentIntensity = 0.15;
      scene.clearColor = new Color4(0.03, 0.04, 0.06, 1.0);
      scene.imageProcessingConfiguration.exposure = 0.98;

      interiorLightsRef.current.forEach((l) => (l.intensity = 0.85));
    }
  }, [effectiveLightingPreset, cx, cz, pw, pl, isDarkMode]);

  // --------------------------------------------------------------------------
  // 4. ARCHITECTURAL SCENE REBUILD (Pure HouseLayout Single Source of Truth)
  // --------------------------------------------------------------------------
  const rebuildScene = useCallback(() => {
    const scene = sceneRef.current;
    const houseRoot = houseRootRef.current;
    const shadowGen = shadowGenRef.current;
    if (!scene || !houseRoot) return;

    // Clean up existing house meshes & interior lights
    houseRoot.getChildren().forEach((child) => child.dispose());
    interiorLightsRef.current.forEach((l) => l.dispose());
    interiorLightsRef.current = [];

    // Materials Palette
    const extPlaster = getOrCreatePBRMaterial("extPlaster", scene, { albedoHex: isDarkMode ? "#33353A" : "#ECE8E1", roughness: 0.88 });
    const intPlaster = getOrCreatePBRMaterial("intPlaster", scene, { albedoHex: isDarkMode ? "#27292D" : "#F2EFE9", roughness: 0.90 });
    const accentStone = getOrCreatePBRMaterial("accentStone", scene, { albedoHex: isDarkMode ? "#1C2028" : "#2E3440", roughness: 0.70 });
    const woodFloor = getOrCreatePBRMaterial("woodFloor", scene, { albedoHex: isDarkMode ? "#3A291C" : "#A87948", roughness: 0.42 });
    const marbleFloor = getOrCreatePBRMaterial("marbleFloor", scene, { albedoHex: isDarkMode ? "#22252A" : "#E8E6E1", roughness: 0.25 });
    const slabMat = getOrCreatePBRMaterial("slabMat", scene, { albedoHex: isDarkMode ? "#2D3036" : "#D6D4CF", roughness: 0.82 });
    const glassMat = getOrCreatePBRMaterial("glassMat", scene, { albedoHex: "#9AC4E8", roughness: 0.05, alpha: 0.28 });
    const frameMat = getOrCreatePBRMaterial("frameMat", scene, { albedoHex: "#1C1E24", roughness: 0.45, metallic: 0.6 });
    const grassMat = getOrCreatePBRMaterial("grassMat", scene, { albedoHex: isDarkMode ? "#1B2A15" : "#4A7C32", roughness: 0.92 });
    const roadMat = getOrCreatePBRMaterial("roadMat", scene, { albedoHex: isDarkMode ? "#181A1F" : "#2A2D34", roughness: 0.85 });
    const paverMat = getOrCreatePBRMaterial("paverMat", scene, { albedoHex: isDarkMode ? "#2A2825" : "#CFCAC2", roughness: 0.78 });
    const curbMat = getOrCreatePBRMaterial("curbMat", scene, { albedoHex: isDarkMode ? "#2B2D33" : "#525660", roughness: 0.80 });
    const boundaryMat = getOrCreatePBRMaterial("boundaryMat", scene, { albedoHex: isDarkMode ? "#2C2E34" : "#E2DFD8", roughness: 0.85 });
    const gateMat = getOrCreatePBRMaterial("gateMat", scene, { albedoHex: "#1F232B", roughness: 0.40, metallic: 0.8 });
    const carportMat = getOrCreatePBRMaterial("carportMat", scene, { albedoHex: "#272A30", roughness: 0.75 });
    const soilMat = getOrCreatePBRMaterial("soilMat", scene, { albedoHex: isDarkMode ? "#1C1510" : "#33251A", roughness: 0.95 });
    const terraceMat = getOrCreatePBRMaterial("terraceMat", scene, { albedoHex: "#BEB9B0", roughness: 0.70 });

    // Calculate house bounding footprint
    const allRooms: Room[] = [];
    if (layout.floors && layout.floors.length > 0) {
      layout.floors.forEach((fl) => allRooms.push(...(fl.rooms || [])));
    } else {
      allRooms.push(...(layout.rooms || []));
    }

    const minX = Math.min(...allRooms.map((r) => r.rect?.x ?? 5), 5);
    const maxX = Math.max(...allRooms.map((r) => (r.rect?.x ?? 0) + (r.rect?.width ?? 10)), 35);
    const minZ = Math.min(...allRooms.map((r) => r.rect?.y ?? 5), 5);
    const maxZ = Math.max(...allRooms.map((r) => (r.rect?.y ?? 0) + (r.rect?.length ?? 10)), 45);

    const plinthW = maxX - minX + 2.4;
    const plinthL = maxZ - minZ + 2.4;
    const plinthX = (minX + maxX) / 2;
    const plinthZ = (minZ + maxZ) / 2;

    // 1. PLINTH & FOUNDATION SLAB
    const plinthMesh = MeshBuilder.CreateBox("plinthSlab", {
      width: plinthW,
      depth: plinthL,
      height: plinthHeight,
    }, scene);
    plinthMesh.position = new Vector3(plinthX, plinthHeight / 2, plinthZ);
    plinthMesh.material = slabMat;
    plinthMesh.parent = houseRoot;
    plinthMesh.receiveShadows = true;
    if (shadowGen) shadowGen.addShadowCaster(plinthMesh);

    // 2. LANDSCAPE & SITE INTEGRATION
    if (effectiveShowLandscape) {
      const siteGround = MeshBuilder.CreateBox("siteGround", {
        width: pw * 2.2,
        depth: pl * 2.2,
        height: 0.2,
      }, scene);
      siteGround.position = new Vector3(cx, -0.1, cz);
      siteGround.material = grassMat;
      siteGround.parent = houseRoot;
      siteGround.receiveShadows = true;

      // Public Road
      const roadW = pw * 2.4;
      const roadD = 14.0;
      let roadX = cx;
      let roadZ = cz + pl / 2 + roadD / 2;
      if (resolvedFacing === "north") roadZ = cz - pl / 2 - roadD / 2;
      else if (resolvedFacing === "east") { roadX = cx + pw / 2 + roadD / 2; roadZ = cz; }
      else if (resolvedFacing === "west") { roadX = cx - pw / 2 - roadD / 2; roadZ = cz; }

      const roadMesh = MeshBuilder.CreateBox("publicRoad", { width: roadW, depth: roadD, height: 0.15 }, scene);
      roadMesh.position = new Vector3(roadX, 0.05, roadZ);
      roadMesh.material = roadMat;
      roadMesh.parent = houseRoot;
      roadMesh.receiveShadows = true;

      // Entrance Walkway & Driveway Pavers
      const drivewayMesh = MeshBuilder.CreateBox("drivewayPaver", {
        width: plinthW * 0.9,
        depth: Math.abs(cz + pl / 2 - plinthZ) * 0.95,
        height: 0.18,
      }, scene);
      drivewayMesh.position = new Vector3(plinthX, 0.09, (cz + pl / 2 + plinthZ + plinthL / 2) / 2);
      drivewayMesh.material = paverMat;
      drivewayMesh.parent = houseRoot;
      drivewayMesh.receiveShadows = true;

      // Modern Pergola (Reference Architectural Feature)
      const pergolaW = 12.0;
      const pergolaL = 14.0;
      const pergolaH = 9.0;
      const pergX = plinthX - plinthW / 2 + 5.0;
      const pergZ = plinthZ + plinthL / 2 - 2.0;

      // Columns
      const colMat = frameMat;
      const colGeo = { width: 0.4, depth: 0.4, height: pergolaH };
      [-pergolaW / 2, pergolaW / 2].forEach((px) => {
        [-pergolaL / 2, pergolaL / 2].forEach((pz) => {
          const col = MeshBuilder.CreateBox("pergolaCol", colGeo, scene);
          col.position = new Vector3(pergX + px, plinthHeight + pergolaH / 2, pergZ + pz);
          col.material = colMat;
          col.parent = houseRoot;
          if (shadowGen) shadowGen.addShadowCaster(col);
        });
      });

      // Pergola Slats
      for (let s = -pergolaL / 2; s <= pergolaL / 2; s += 2.0) {
        const slat = MeshBuilder.CreateBox("pergolaSlat", { width: pergolaW + 1.0, depth: 0.2, height: 0.4 }, scene);
        slat.position = new Vector3(pergX, plinthHeight + pergolaH, pergZ + s);
        slat.material = colMat;
        slat.parent = houseRoot;
        if (shadowGen) shadowGen.addShadowCaster(slat);
      }
    }

    // 3. MULTI-FLOOR & ROOMS GEOMETRY CONSTRUCTION
    const numFloors = Math.max(1, layout.floors?.length || layout.num_floors || 1);

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
        const slabMesh = MeshBuilder.CreateBox(`slab_level_${fIdx}`, {
          width: plinthW,
          depth: plinthL,
          height: slabThickness,
        }, scene);
        slabMesh.position = new Vector3(plinthX, floorBaseY - slabThickness / 2, plinthZ);
        slabMesh.material = slabMat;
        slabMesh.parent = houseRoot;
        slabMesh.receiveShadows = true;
        if (shadowGen) shadowGen.addShadowCaster(slabMesh);
      }

      // 3A. ROOM FLOORS & INTERIOR DETAILS
      (floorPlan.rooms || []).forEach((room, rIdx) => {
        if (!room.rect) return;
        const rw = room.rect.width;
        const rl = room.rect.length;
        const rx = room.rect.x + rw / 2;
        const rz = room.rect.y + rl / 2;

        const rtype = (room.type || "").toLowerCase();
        const isWetArea = rtype.includes("bath") || rtype.includes("toilet") || rtype.includes("kitchen") || rtype.includes("wash");

        // Architectural Floor Slab (Wood vs Tile)
        const roomFloorMesh = MeshBuilder.CreateBox(`floor_${fIdx}_room_${rIdx}`, {
          width: rw - 0.15,
          depth: rl - 0.15,
          height: 0.08,
        }, scene);
        roomFloorMesh.position = new Vector3(rx, floorBaseY + 0.04, rz);
        roomFloorMesh.material = isWetArea ? marbleFloor : woodFloor;
        roomFloorMesh.parent = houseRoot;
        roomFloorMesh.receiveShadows = true;
        roomFloorMesh.metadata = { roomId: room.id };

        // Warm Interior Ceiling Downlight (For Sunset & Night, up to 2 key areas)
        if (interiorLightsRef.current.length < 2 && (rtype.includes("living") || rtype.includes("bed") || rIdx === 0)) {
          const roomLight = new PointLight(`downlight_${fIdx}_${rIdx}`, new Vector3(rx, floorBaseY + 7.8, rz), scene);
          roomLight.diffuse = Color3.FromHexString("#FFEED1");
          roomLight.range = 28.0;
          roomLight.intensity = effectiveLightingPreset === "day" ? 0.0 : (effectiveLightingPreset === "night" ? 0.85 : 0.45);
          interiorLightsRef.current.push(roomLight);
        }

        // 3B. GLB FURNITURE PLACEMENT
        if (showFurnitureState && room.furniture) {
          room.furniture.forEach((fItem) => {
            const fType = (fItem.type || "").toLowerCase();
            let modelKey = "sofa";
            if (fType.includes("bed")) modelKey = "bed";
            else if (fType.includes("dining") && fType.includes("table")) modelKey = "dining_table";
            else if (fType.includes("dining") && fType.includes("chair")) modelKey = "dining_chair";
            else if (fType.includes("counter")) modelKey = "kitchen_counter";
            else if (fType.includes("coffee")) modelKey = "coffee_table";
            else if (fType.includes("night") || fType.includes("stand")) modelKey = "nightstand";
            else if (fType.includes("tv")) modelKey = "tv_unit";
            else if (fType.includes("wardrobe")) modelKey = "wardrobe";
            else if (fType.includes("toilet") || fType.includes("wc")) modelKey = "toilet";
            else if (fType.includes("basin") || fType.includes("sink")) modelKey = "basin";
            else if (fType.includes("shower")) modelKey = "shower";
            else if (fType.includes("table")) modelKey = "outdoor_table";
            else if (fType.includes("chair")) modelKey = "outdoor_chair";
            else if (fType.includes("planter") || fType.includes("pot")) modelKey = "planter";

            const container = loadedModelsRef.current[modelKey];
            if (container) {
              const entries = container.instantiateModelsToScene(
                (name: string) => `furn_${fItem.id}_${name}`,
                false
              );
              if (entries.rootNodes[0]) {
                const fNode = entries.rootNodes[0] as TransformNode;
                fNode.position = new Vector3(fItem.x, floorBaseY + 0.08, fItem.y);
                fNode.rotation.y = ((fItem.rotation || 0) * Math.PI) / 180;
                fNode.parent = houseRoot;

                // Shadows for instantiated furniture meshes
                entries.rootNodes.forEach((node: any) => {
                  node.getChildMeshes?.().forEach((m: AbstractMesh) => {
                    m.receiveShadows = true;
                    if (shadowGen) shadowGen.addShadowCaster(m);
                  });
                });
              }
            } else {
              // Procedural proxy if GLB is loading or unavailable
              const pW = fItem.width || 3.0;
              const pL = fItem.length || 3.0;
              const pH = 2.0;
              const proxyBox = MeshBuilder.CreateBox(`proxy_${fItem.id}`, { width: pW, depth: pL, height: pH }, scene);
              proxyBox.position = new Vector3(fItem.x, floorBaseY + pH / 2, fItem.y);
              proxyBox.material = accentStone;
              proxyBox.parent = houseRoot;
              proxyBox.receiveShadows = true;
              if (shadowGen) shadowGen.addShadowCaster(proxyBox);
            }
          });
        }
      });

      // 3C. ARCHITECTURAL WALLS (DOLLHOUSE CUTAWAY VS COMPLETE EXTERIOR)
      const extWalls = floorPlan.exterior_walls || [];
      const intWalls = floorPlan.interior_walls || [];
      const allWalls: { wall: Wall; isExterior: boolean }[] = [
        ...extWalls.map((w) => ({ wall: w, isExterior: true })),
        ...intWalls.map((w) => ({ wall: w, isExterior: false })),
      ];

      allWalls.forEach((item, wIdx) => {
        const { wall, isExterior } = item;
        if (!wall.start || !wall.end) return;
        const sx = wall.start.x;
        const sz = wall.start.y;
        const ex = wall.end.x;
        const ez = wall.end.y;

        const dx = ex - sx;
        const dz = ez - sz;
        const len = Math.hypot(dx, dz);
        if (len < 0.2) return;

        const angle = Math.atan2(dz, dx);
        const mx = (sx + ex) / 2;
        const mz = (sz + ez) / 2;

        const thick = wall.thickness || (isExterior ? 0.75 : 0.45);

        // Reference Cutaway Logic:
        // Top floor exterior walls are lowered to 3.5 ft to reveal rooms/furniture
        // Interior partitions remain clear at 7.5 ft
        let curWallH = fullWallHeight;
        if (isCutawayMode && fIdx === numFloors - 1) {
          curWallH = isExterior ? cutawayWallHeight : 7.2;
        }

        const wallMesh = MeshBuilder.CreateBox(`wall_${fIdx}_${wIdx}`, {
          width: len,
          depth: thick,
          height: curWallH,
        }, scene);
        wallMesh.position = new Vector3(mx, floorBaseY + curWallH / 2, mz);
        wallMesh.rotation.y = -angle;
        wallMesh.material = isExterior ? extPlaster : intPlaster;
        wallMesh.parent = houseRoot;
        wallMesh.receiveShadows = true;
        if (shadowGen) shadowGen.addShadowCaster(wallMesh);
      });

      // 3D. ARCHITECTURAL STAIRCASE
      const stairRooms = (floorPlan.rooms || []).filter(
        (r) => r.type === "staircase" || r.name.toLowerCase().includes("stair")
      );
      stairRooms.forEach((sr, sIdx) => {
        if (!sr.rect) return;
        const sw = sr.rect.width;
        const sl = sr.rect.length;
        const sx = sr.rect.x;
        const sz = sr.rect.y;

        const numSteps = 16;
        const stepH = floorHeight / numSteps;
        const stepL = sl / (numSteps / 2);

        for (let i = 0; i < numSteps / 2; i++) {
          const stepMesh = MeshBuilder.CreateBox(`stair_${fIdx}_${sIdx}_${i}`, {
            width: sw / 2 - 0.2,
            depth: stepL,
            height: stepH * (i + 1),
          }, scene);
          stepMesh.position = new Vector3(
            sx + sw / 4,
            floorBaseY + (stepH * (i + 1)) / 2,
            sz + i * stepL + stepL / 2
          );
          stepMesh.material = woodFloor;
          stepMesh.parent = houseRoot;
          stepMesh.receiveShadows = true;
          if (shadowGen) shadowGen.addShadowCaster(stepMesh);
        }
      });
    });

    // 4. RCC ROOF SLAB & PARAPET WALLS (When Complete Exterior Mode is active)
    const topFloorBaseY = plinthHeight + (numFloors - 1) * floorHeight;
    const roofBaseY = topFloorBaseY + fullWallHeight;
    const roofW = plinthW + 1.2;
    const roofL = plinthL + 1.2;

    if (effectiveShowRoof && !isCutawayMode) {
      const roofMesh = MeshBuilder.CreateBox("roofSlab", {
        width: roofW,
        depth: roofL,
        height: slabThickness,
      }, scene);
      roofMesh.position = new Vector3(plinthX, roofBaseY + slabThickness / 2, plinthZ);
      roofMesh.material = slabMat;
      roofMesh.parent = houseRoot;
      roofMesh.receiveShadows = true;
      if (shadowGen) shadowGen.addShadowCaster(roofMesh);

      // Parapet Walls
      const parapetH = 2.4;
      const parapetThick = 0.5;
      const pFront = MeshBuilder.CreateBox("parapetFront", { width: roofW, depth: parapetThick, height: parapetH }, scene);
      pFront.position = new Vector3(plinthX, roofBaseY + slabThickness + parapetH / 2, plinthZ + roofL / 2 - parapetThick / 2);
      pFront.material = extPlaster;
      pFront.parent = houseRoot;

      const pBack = MeshBuilder.CreateBox("parapetBack", { width: roofW, depth: parapetThick, height: parapetH }, scene);
      pBack.position = new Vector3(plinthX, roofBaseY + slabThickness + parapetH / 2, plinthZ - roofL / 2 + parapetThick / 2);
      pBack.material = extPlaster;
      pBack.parent = houseRoot;
    }
  }, [
    layout,
    isCutawayMode,
    effectiveShowRoof,
    effectiveShowLandscape,
    showFurnitureState,
    effectiveLightingPreset,
    isDarkMode,
    resolvedFacing,
    plinthHeight,
    floorHeight,
    fullWallHeight,
    cutawayWallHeight,
    slabThickness,
    pw,
    pl,
    cx,
    cz,
    getOrCreatePBRMaterial,
  ]);

  // Trigger rebuild when layout, mode, or assets change
  useEffect(() => {
    rebuildScene();
  }, [rebuildScene, assetsReady]);

  // --------------------------------------------------------------------------
  // 5. CAMERA PRESETS CONTROLS
  // --------------------------------------------------------------------------
  const handleCameraPreset = (preset: CameraPresetType) => {
    setCameraView(preset);
    setIsCameraMenuOpen(false);
    const camera = cameraRef.current;
    if (!camera) return;

    const diag = Math.hypot(pw, pl);
    const centerTarget = new Vector3(cx, plinthHeight + 3.8, cz);

    if (preset === "cutaway") {
      setIsCutawayMode(true);
      animateCamera(camera, Math.PI * 0.25, Math.PI * 0.32, diag * 1.65, centerTarget);
    } else if (preset === "exterior") {
      setIsCutawayMode(false);
      animateCamera(camera, Math.PI * 0.25, Math.PI * 0.36, diag * 1.85, centerTarget);
    } else if (preset === "iso") {
      animateCamera(camera, Math.PI * 0.25, Math.PI * 0.35, diag * 1.7, centerTarget);
    } else if (preset === "top") {
      animateCamera(camera, 0, 0.01, diag * 1.9, centerTarget);
    } else if (preset === "front") {
      let fAlpha = Math.PI * 0.5;
      if (resolvedFacing === "north") fAlpha = Math.PI * 1.5;
      else if (resolvedFacing === "east") fAlpha = 0;
      else if (resolvedFacing === "west") fAlpha = Math.PI;
      animateCamera(camera, fAlpha, Math.PI * 0.42, diag * 1.75, centerTarget);
    } else if (preset === "entrance") {
      animateCamera(camera, Math.PI * 0.5, Math.PI * 0.45, diag * 1.1, new Vector3(cx, plinthHeight + 3.0, cz + pl / 2));
    } else if (preset === "living" || preset === "kitchen" || preset === "bedroom") {
      const matchRoom = (layout.rooms || []).find((r) =>
        (r.type || "").toLowerCase().includes(preset) || (r.name || "").toLowerCase().includes(preset)
      );
      if (matchRoom && matchRoom.rect) {
        const rx = matchRoom.rect.x + matchRoom.rect.width / 2;
        const rz = matchRoom.rect.y + matchRoom.rect.length / 2;
        setIsCutawayMode(true);
        animateCamera(camera, Math.PI * 0.3, Math.PI * 0.35, 28, new Vector3(rx, plinthHeight + 3.5, rz));
      }
    } else if (preset === "garden") {
      animateCamera(camera, Math.PI * 0.8, Math.PI * 0.42, diag * 1.6, new Vector3(cx, plinthHeight + 1.0, cz));
    }
  };

  const animateCamera = (
    camera: ArcRotateCamera,
    targetAlpha: number,
    targetBeta: number,
    targetRadius: number,
    targetTarget: Vector3
  ) => {
    Animation.CreateAndStartAnimation("camAlpha", camera, "alpha", 30, 15, camera.alpha, targetAlpha, 0);
    Animation.CreateAndStartAnimation("camBeta", camera, "beta", 30, 15, camera.beta, targetBeta, 0);
    Animation.CreateAndStartAnimation("camRadius", camera, "radius", 30, 15, camera.radius, targetRadius, 0);
    Animation.CreateAndStartAnimation("camTarget", camera, "target", 30, 15, camera.target, targetTarget, 0);
  };

  // --------------------------------------------------------------------------
  // 6. 3D ROOM DIMENSION EDITING (Updates HouseLayout Single Source of Truth)
  // --------------------------------------------------------------------------
  const selectedRoom = useMemo(() => {
    if (!selectedRoomId) return null;
    return (layout.rooms || []).find((r) => r.id === selectedRoomId);
  }, [layout.rooms, selectedRoomId]);

  const handleAdjustRoomDimension = async (dimension: "width" | "length", delta: number) => {
    if (!selectedRoom || !onUpdateLayout || isEditingRoom) return;
    setIsEditingRoom(true);
    try {
      const currentVal = dimension === "width" ? selectedRoom.rect.width : selectedRoom.rect.length;
      const newVal = Math.max(6, currentVal + delta);
      const res = await editRoomLayoutFull(layout, selectedRoom.id, {
        x: selectedRoom.rect.x,
        y: selectedRoom.rect.y,
        width: dimension === "width" ? newVal : selectedRoom.rect.width,
        length: dimension === "length" ? newVal : selectedRoom.rect.length,
      });
      if (res && res.layout) {
        onUpdateLayout(res.layout);
      }
    } catch (err) {
      console.error("[3D EDIT ERROR] Failed to adjust room dimension:", err);
    } finally {
      setIsEditingRoom(false);
    }
  };

  return (
    <div className="relative w-full h-full select-none overflow-hidden bg-[#0E1015]">
      {/* BABYLON WEBGPU / WEBGL CANVAS */}
      <canvas ref={canvasRef} className="w-full h-full block outline-none touch-none" />

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
            <Home className="w-3.5 h-3.5" />
            FULL EXTERIOR
          </button>

          <div className="h-4 w-[1px] bg-white/10 mx-1" />

          {/* Camera Presets Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsCameraMenuOpen((prev) => !prev)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full hover:text-white transition-colors"
            >
              <Camera className="w-3.5 h-3.5 text-[#C48446]" />
              <span className="capitalize">{cameraView} View</span>
              <ChevronDown className="w-3 h-3 opacity-60" />
            </button>

            {isCameraMenuOpen && (
              <div className="absolute top-full left-0 mt-2 w-40 bg-[#12141A] border border-white/10 rounded-xl shadow-2xl overflow-hidden py-1 z-30">
                {[
                  { id: "cutaway", label: "Dollhouse 3/4" },
                  { id: "exterior", label: "Full Exterior" },
                  { id: "iso", label: "Isometric" },
                  { id: "top", label: "Top-Down Plan" },
                  { id: "front", label: "Front Facade" },
                  { id: "entrance", label: "Main Entrance" },
                  { id: "living", label: "Living Room" },
                  { id: "kitchen", label: "Kitchen Area" },
                  { id: "bedroom", label: "Master Suite" },
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
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="font-mono text-xs w-6 text-center">{Math.round(selectedRoom.rect.width)}&apos;</span>
            <button
              type="button"
              disabled={isEditingRoom}
              onClick={() => handleAdjustRoomDimension("width", 1)}
              className="p-1 rounded-md bg-white/10 hover:bg-white/20 disabled:opacity-40 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Length/Depth adjustment */}
          <div className="flex items-center gap-1.5 ml-2 border-l border-white/10 pl-3">
            <span className="text-[11px] font-mono text-[#9E9C98]">Depth:</span>
            <button
              type="button"
              disabled={isEditingRoom}
              onClick={() => handleAdjustRoomDimension("length", -1)}
              className="p-1 rounded-md bg-white/10 hover:bg-white/20 disabled:opacity-40 transition-colors"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="font-mono text-xs w-6 text-center">{Math.round(selectedRoom.rect.length)}&apos;</span>
            <button
              type="button"
              disabled={isEditingRoom}
              onClick={() => handleAdjustRoomDimension("length", 1)}
              className="p-1 rounded-md bg-white/10 hover:bg-white/20 disabled:opacity-40 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
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
