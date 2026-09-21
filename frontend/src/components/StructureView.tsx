"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  HouseLayout,
  FloorPlan,
  StructuralColumn,
  StructuralBeam,
  Room,
  Wall,
  Door,
  WindowItem,
} from "@/types/house";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Download,
  Info,
  Layers,
  Box,
  Compass,
  CheckCircle2,
  AlertTriangle,
  FileCheck,
  Eye,
  EyeOff,
  Columns,
  Grid as GridIcon,
  Ruler,
  Building,
} from "lucide-react";

interface StructureViewProps {
  layout: HouseLayout;
  activeFloorIndex: number;
  onSelectFloor?: (index: number) => void;
}

export const StructureView: React.FC<StructureViewProps> = ({
  layout,
  activeFloorIndex,
  onSelectFloor,
}) => {
  // Mode: 2D Technical Drafting vs 3D Technical Structure
  const [viewMode, setViewMode] = useState<"2d" | "3d">("2d");

  // Multi-floor mode: active floor or "all"
  const [isAllFloors, setIsAllFloors] = useState(false);

  // Visibility Toggles (Rule 15)
  const [showArchitecture, setShowArchitecture] = useState(true);
  const [showStructure, setShowStructure] = useState(true);
  const [showColumns, setShowColumns] = useState(true);
  const [showBeams, setShowBeams] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [showDimensions, setShowDimensions] = useState(true);

  // Selected Column for Inspection (Rule 11)
  const [selectedColumnId, setSelectedColumnId] = useState<string | null>(null);

  // 2D Canvas Pan & Zoom
  const [zoom, setZoom] = useState(1.0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // 3D Canvas Mount Ref
  const mountRef = useRef<HTMLDivElement>(null);

  // Coordinate scaling: 1 foot = 24 SVG pixels
  const SCALE = 24;
  const svgWidth = layout.plot_width * SCALE;
  const svgHeight = layout.plot_length * SCALE;
  const padding = 90;

  // Active Floor & Rooms
  const totalFloors = Math.max(1, layout.floors?.length || layout.num_floors || 1);
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

  // Structural planning data
  const structuralPlanning = layout.structural_planning;
  const columns: StructuralColumn[] = useMemo(() => {
    return structuralPlanning?.columns || [];
  }, [structuralPlanning]);

  const beams: StructuralBeam[] = useMemo(() => {
    return structuralPlanning?.beams || [];
  }, [structuralPlanning]);

  const grid = structuralPlanning?.grid;
  const validationReport = structuralPlanning?.validation_report;

  // Selected Column Details
  const selectedColumn = useMemo(() => {
    return columns.find((c) => c.column_id === selectedColumnId) || null;
  }, [columns, selectedColumnId]);

  // Max Span Calculation
  const maxSpanFt = useMemo(() => {
    if (!beams.length) return 14.5;
    return Math.max(...beams.map((b) => b.span_ft));
  }, [beams]);

  // 2D Pan & Zoom Handlers
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left - rect.width / 2;
    const mouseY = e.clientY - rect.top - rect.height / 2;

    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    setZoom((prevZoom) => {
      const nextZoom = Math.min(3.5, Math.max(0.4, prevZoom * factor));
      setPan((prevPan) => ({
        x: mouseX - (mouseX - prevPan.x) * (nextZoom / prevZoom),
        y: mouseY - (mouseY - prevPan.y) * (nextZoom / prevZoom),
      }));
      return nextZoom;
    });
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    }
  };

  const handleMouseUp = () => setIsPanning(false);

  const handleResetView = () => {
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
  };

  // Export 2D Technical Drawing (PNG)
  const handleExportDrawing = () => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
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
      if (!ctx) return;
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);

      // Title block stamp
      ctx.fillStyle = "#0F172A";
      ctx.font = "bold 20px monospace";
      ctx.fillText("ATELIER ARCHAI // PRELIMINARY STRUCTURAL DRAWING", 40, 45);

      const link = document.createElement("a");
      link.download = `${(layout.title || "residence").toLowerCase().replace(/\s+/g, "_")}_structure_plan.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    };
    img.src = url;
  };

  // 3D Simplified Technical Visualization (Rule 14)
  useEffect(() => {
    if (viewMode !== "3d") return;
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0F1117");

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.5, 1000);
    camera.position.set(layout.plot_width * 0.9, 45, layout.plot_length * 0.9);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(layout.plot_width / 2, 8, layout.plot_length / 2);

    // Neutral Technical Lighting
    const ambient = new THREE.AmbientLight(0xFFFFFF, 0.75);
    scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xFFFFFF, 0.85);
    dirLight.position.set(50, 70, 40);
    scene.add(dirLight);

    // Technical Ground Grid
    const gridHelper = new THREE.GridHelper(
      Math.max(layout.plot_width, layout.plot_length) * 1.5,
      30,
      0x475569,
      0x1E293B
    );
    gridHelper.position.set(layout.plot_width / 2, 0, layout.plot_length / 2);
    scene.add(gridHelper);

    // Neutral Technical Materials
    const columnMat = new THREE.MeshStandardMaterial({
      color: 0x3B82F6,
      roughness: 0.4,
      metalness: 0.1,
    });
    const selectedColumnMat = new THREE.MeshStandardMaterial({
      color: 0xF59E0B,
      roughness: 0.2,
      metalness: 0.2,
    });
    const beamMat = new THREE.MeshStandardMaterial({
      color: 0x0284C7,
      roughness: 0.4,
      metalness: 0.1,
    });
    const slabMat = new THREE.MeshStandardMaterial({
      color: 0x64748B,
      roughness: 0.8,
      transparent: true,
      opacity: 0.35,
    });
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.9,
      transparent: true,
      opacity: 0.4,
    });
    const stairMat = new THREE.MeshStandardMaterial({
      color: 0x94A3B8,
      roughness: 0.6,
    });

    const floorHeight = 10.0; // 10 ft story height

    // Render Floors & Slabs
    const numRenderFloors = isAllFloors ? totalFloors : 1;
    const startFloorIdx = isAllFloors ? 0 : activeFloorIndex;

    for (let f = 0; f < numRenderFloors; f++) {
      const flNum = startFloorIdx + f;
      const flPlan = layout.floors && layout.floors[flNum] ? layout.floors[flNum] : currentFloor;
      const yBase = f * floorHeight;

      // Slab plate
      const flRooms = flPlan.rooms || [];
      flRooms.forEach((r) => {
        if (!r.rect) return;
        const slabGeo = new THREE.BoxGeometry(r.rect.width, 0.4, r.rect.length);
        const slabMesh = new THREE.Mesh(slabGeo, slabMat);
        slabMesh.position.set(
          r.rect.x + r.rect.width / 2,
          yBase + 0.2,
          r.rect.y + r.rect.length / 2
        );
        scene.add(slabMesh);

        // Staircase blocks
        if (r.type === "staircase") {
          const numSteps = 12;
          for (let s = 0; s < numSteps; s++) {
            const stepH = (floorHeight / numSteps);
            const stepL = (r.rect.length / numSteps);
            const stepGeo = new THREE.BoxGeometry(r.rect.width * 0.9, stepH * (s + 1), stepL);
            const stepMesh = new THREE.Mesh(stepGeo, stairMat);
            stepMesh.position.set(
              r.rect.x + r.rect.width / 2,
              yBase + (stepH * (s + 1)) / 2,
              r.rect.y + s * stepL + stepL / 2
            );
            scene.add(stepMesh);
          }
        }
      });

      // Simplified Technical Walls
      if (showArchitecture) {
        const walls = flPlan.walls || [...(flPlan.exterior_walls || []), ...(flPlan.interior_walls || [])];
        walls.forEach((w) => {
          const x1 = w.start ? w.start.x : w.x1;
          const y1 = w.start ? w.start.y : w.y1;
          const x2 = w.end ? w.end.x : w.x2;
          const y2 = w.end ? w.end.y : w.y2;
          const len = Math.hypot(x2 - x1, y2 - y1);
          if (len < 0.2) return;
          const angle = Math.atan2(y2 - y1, x2 - x1);
          const wallGeo = new THREE.BoxGeometry(len, 8.5, 0.6);
          const wallMesh = new THREE.Mesh(wallGeo, wallMat);
          wallMesh.position.set((x1 + x2) / 2, yBase + 4.25, (y1 + y2) / 2);
          wallMesh.rotation.y = -angle;
          scene.add(wallMesh);
        });
      }
    }

    // Render 3D Columns
    if (showColumns && showStructure) {
      const colH = numRenderFloors * floorHeight;
      columns.forEach((col) => {
        const isSelected = selectedColumnId === col.column_id;
        const cw = col.width || 0.75;
        const cd = col.depth || 0.75;
        const colGeo = new THREE.BoxGeometry(cw, colH, cd);
        const colMesh = new THREE.Mesh(colGeo, isSelected ? selectedColumnMat : columnMat);
        colMesh.position.set(col.x, colH / 2, col.y);
        colMesh.castShadow = true;
        scene.add(colMesh);
      });
    }

    // Render 3D Beams
    if (showBeams && showStructure) {
      for (let f = 0; f < numRenderFloors; f++) {
        const yBeam = (f + 1) * floorHeight - 0.6;
        beams.forEach((beam) => {
          const dx = beam.x2 - beam.x1;
          const dy = beam.y2 - beam.y1;
          const len = Math.hypot(dx, dy);
          if (len < 0.2) return;
          const angle = Math.atan2(dy, dx);
          const beamGeo = new THREE.BoxGeometry(len, 1.2, 0.75);
          const beamMesh = new THREE.Mesh(beamGeo, beamMat);
          beamMesh.position.set((beam.x1 + beam.x2) / 2, yBeam, (beam.y1 + beam.y2) / 2);
          beamMesh.rotation.y = -angle;
          scene.add(beamMesh);
        });
      }
    }

    let reqId: number;
    const animate = () => {
      reqId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(reqId);
      window.removeEventListener("resize", handleResize);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [
    viewMode,
    isAllFloors,
    activeFloorIndex,
    totalFloors,
    layout,
    currentFloor,
    columns,
    beams,
    showArchitecture,
    showStructure,
    showColumns,
    showBeams,
    selectedColumnId,
  ]);

  return (
    <div className="relative w-full h-full flex flex-col md:flex-row overflow-hidden bg-[#F8FAFC] text-[#0F172A] select-none">
      {/* 1. TOP DRAFTING CONTROLS TOOLBAR */}
      <div className="absolute top-4 left-4 right-4 z-30 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        {/* Left: View Mode Toggle & Floor Selector */}
        <div className="pointer-events-auto flex items-center gap-1.5 p-1.5 rounded-2xl bg-white/95 backdrop-blur-md border border-slate-200 shadow-lg shadow-slate-900/5 text-xs font-mono">
          {/* 2D / 3D Switch */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-xl">
            <button
              onClick={() => setViewMode("2d")}
              className={`px-3 py-1 rounded-lg text-[11px] font-semibold tracking-wider transition-all ${
                viewMode === "2d"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              2D PLAN
            </button>
            <button
              onClick={() => setViewMode("3d")}
              className={`px-3 py-1 rounded-lg text-[11px] font-semibold tracking-wider transition-all ${
                viewMode === "3d"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              3D STRUCTURE
            </button>
          </div>

          <div className="h-4 w-px bg-slate-200" />

          {/* Floor Switcher */}
          {totalFloors > 1 && (
            <div className="flex items-center gap-1">
              {Array.from({ length: totalFloors }).map((_, idx) => (
                <button
                  key={`floor-btn-${idx}`}
                  onClick={() => {
                    setIsAllFloors(false);
                    if (onSelectFloor) onSelectFloor(idx);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[10.5px] font-medium transition-colors ${
                    !isAllFloors && activeFloorIndex === idx
                      ? "bg-blue-600 text-white font-semibold"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {idx === 0 ? "GROUND" : `LVL ${idx + 1}`}
                </button>
              ))}

              <button
                onClick={() => setIsAllFloors(true)}
                className={`px-2.5 py-1 rounded-lg text-[10.5px] font-medium transition-colors ${
                  isAllFloors
                    ? "bg-blue-600 text-white font-semibold"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
                title="View column alignment across all floors"
              >
                ALL FLOORS
              </button>
            </div>
          )}
        </div>

        {/* Right: Structural Visibility Controls (Rule 15) */}
        <div className="pointer-events-auto flex items-center gap-1 p-1.5 rounded-2xl bg-white/95 backdrop-blur-md border border-slate-200 shadow-lg shadow-slate-900/5 text-[10.5px] font-mono">
          <button
            onClick={() => setShowArchitecture((v) => !v)}
            className={`px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 ${
              showArchitecture
                ? "bg-slate-900 text-white font-medium"
                : "text-slate-400 hover:text-slate-700 bg-slate-50"
            }`}
            title="Toggle Rooms, Walls & Openings"
          >
            <Building className="w-3 h-3" />
            <span>ARCH</span>
          </button>

          <button
            onClick={() => setShowStructure((v) => !v)}
            className={`px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 ${
              showStructure
                ? "bg-blue-600 text-white font-medium"
                : "text-slate-400 hover:text-slate-700 bg-slate-50"
            }`}
            title="Toggle Structural System"
          >
            <Columns className="w-3 h-3" />
            <span>STRUCT</span>
          </button>

          <button
            onClick={() => setShowColumns((v) => !v)}
            className={`px-2 py-1 rounded-lg transition-colors ${
              showColumns ? "text-blue-700 bg-blue-50 font-semibold" : "text-slate-400"
            }`}
            title="Toggle Pillars / Columns"
          >
            COLS
          </button>

          <button
            onClick={() => setShowBeams((v) => !v)}
            className={`px-2 py-1 rounded-lg transition-colors ${
              showBeams ? "text-sky-700 bg-sky-50 font-semibold" : "text-slate-400"
            }`}
            title="Toggle Preliminary Beams"
          >
            BEAMS
          </button>

          <button
            onClick={() => setShowGrid((v) => !v)}
            className={`px-2 py-1 rounded-lg transition-colors ${
              showGrid ? "text-rose-700 bg-rose-50 font-semibold" : "text-slate-400"
            }`}
            title="Toggle Structural Grid"
          >
            GRID
          </button>

          <button
            onClick={() => setShowDimensions((v) => !v)}
            className={`px-2 py-1 rounded-lg transition-colors ${
              showDimensions ? "text-slate-900 bg-slate-100 font-semibold" : "text-slate-400"
            }`}
            title="Toggle Dimensions"
          >
            DIMS
          </button>

          <div className="h-4 w-px bg-slate-200 mx-0.5" />

          {/* Export PNG */}
          <button
            onClick={handleExportDrawing}
            className="p-1 rounded-lg text-slate-600 hover:text-blue-600 hover:bg-blue-50 transition-colors"
            title="Export High-Res Structural Drawing"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. MAIN CANVAS VIEWPORT (2D DRAFTING OR 3D STRUCTURE) */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        className="flex-1 relative w-full h-full overflow-hidden cursor-crosshair select-none"
      >
        {viewMode === "3d" ? (
          <div ref={mountRef} className="w-full h-full" />
        ) : (
          <svg
            ref={svgRef}
            className="w-full h-full absolute inset-0 select-none pointer-events-auto"
            viewBox={`${-padding} ${-padding} ${svgWidth + padding * 2} ${svgHeight + padding * 2}`}
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "center center",
              transition: isPanning ? "none" : "transform 0.08s ease-out",
            }}
          >
            <defs>
              {/* Engineering Fine Grid Pattern */}
              <pattern id="struct-grid-fine" width={SCALE} height={SCALE} patternUnits="userSpaceOnUse">
                <path d={`M ${SCALE} 0 L 0 0 0 ${SCALE}`} fill="none" stroke="#F1F5F9" strokeWidth="0.5" />
              </pattern>
              <pattern id="struct-grid-major" width={SCALE * 5} height={SCALE * 5} patternUnits="userSpaceOnUse">
                <path d={`M ${SCALE * 5} 0 L 0 0 0 ${SCALE * 5}`} fill="none" stroke="#E2E8F0" strokeWidth="0.8" />
              </pattern>

              {/* Column Diagonal Cross Hatch Pattern */}
              <pattern id="column-hatch" width="4" height="4" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
                <line x1="0" y1="0" x2="0" y2="4" stroke="#FFFFFF" strokeWidth="0.8" />
              </pattern>
            </defs>

            {/* Architectural Drawing Canvas Paper */}
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
            <rect x={0} y={0} width={svgWidth} height={svgHeight} fill="url(#struct-grid-fine)" />
            <rect x={0} y={0} width={svgWidth} height={svgHeight} fill="url(#struct-grid-major)" />

            {/* Plot Boundary */}
            <rect
              x={0}
              y={0}
              width={svgWidth}
              height={svgHeight}
              fill="none"
              stroke="#64748B"
              strokeWidth={1.5}
              strokeDasharray="6 3"
            />
            <text x={10} y={-14} fill="#64748B" className="font-mono text-[9px] tracking-widest uppercase font-semibold">
              PLOT BOUNDARY: {layout.plot_width}&apos; × {layout.plot_length}&apos; (
              {(layout.plot_width * layout.plot_length).toLocaleString()} SQ FT)
            </text>

            {/* Setbacks & Buildable Envelope */}
            {layout.site?.buildable_envelope && (
              <rect
                x={layout.site.buildable_envelope.x * SCALE}
                y={layout.site.buildable_envelope.y * SCALE}
                width={layout.site.buildable_envelope.width * SCALE}
                height={layout.site.buildable_envelope.length * SCALE}
                fill="none"
                stroke="#94A3B8"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
            )}

            {/* ARCHITECTURAL CONTEXT (ROOMS, WALLS, DOORS, STAIRS, PARKING) */}
            {showArchitecture && (
              <g id="architectural-context-layer">
                {/* 1. Parking Envelope */}
                {layout.site?.parking && (
                  <g>
                    <rect
                      x={layout.site.parking.rect.x * SCALE}
                      y={layout.site.parking.rect.y * SCALE}
                      width={layout.site.parking.rect.width * SCALE}
                      height={layout.site.parking.rect.length * SCALE}
                      fill="#F8FAFC"
                      stroke="#CBD5E1"
                      strokeWidth={1.2}
                      strokeDasharray="4 2"
                    />
                    <text
                      x={(layout.site.parking.rect.x + layout.site.parking.rect.width / 2) * SCALE}
                      y={(layout.site.parking.rect.y + layout.site.parking.rect.length / 2 + 3) * SCALE}
                      textAnchor="middle"
                      fill="#94A3B8"
                      className="font-mono text-[8px] tracking-wider uppercase font-semibold pointer-events-none"
                    >
                      VEHICULAR PARKING BAY
                    </text>
                  </g>
                )}

                {/* 2. Room Fills and Room Labels */}
                {(isAllFloors ? layout.floors?.flatMap((f) => f.rooms) || [] : currentFloor.rooms || []).map(
                  (r: Room, idx: number) => {
                    if (!r.rect) return null;
                    const rx = r.rect.x * SCALE;
                    const ry = r.rect.y * SCALE;
                    const rw = r.rect.width * SCALE;
                    const rl = r.rect.length * SCALE;

                    return (
                      <g key={`struct-room-${r.id || idx}`}>
                        <rect
                          x={rx}
                          y={ry}
                          width={rw}
                          height={rl}
                          fill="#F8FAFC"
                          fillOpacity={0.6}
                          stroke="#E2E8F0"
                          strokeWidth={0.8}
                        />

                        {/* Room Label */}
                        <text
                          x={rx + rw / 2}
                          y={ry + rl / 2 - 2}
                          textAnchor="middle"
                          fill="#475569"
                          className="font-sans text-[9px] font-semibold tracking-wide uppercase pointer-events-none select-none"
                        >
                          {r.name}
                        </text>
                        <text
                          x={rx + rw / 2}
                          y={ry + rl / 2 + 10}
                          textAnchor="middle"
                          fill="#94A3B8"
                          className="font-mono text-[7.5px] pointer-events-none select-none"
                        >
                          {r.rect.width}&apos; × {r.rect.length}&apos;
                        </text>

                        {/* Staircase Step Treads */}
                        {r.type === "staircase" && (
                          <g pointerEvents="none">
                            {Array.from({ length: 8 }).map((_, stepIdx) => {
                              const stepY = ry + (rl / 9) * (stepIdx + 1);
                              return (
                                <line
                                  key={`stair-line-${stepIdx}`}
                                  x1={rx + 4}
                                  y1={stepY}
                                  x2={rx + rw - 4}
                                  y2={stepY}
                                  stroke="#CBD5E1"
                                  strokeWidth={1}
                                />
                              );
                            })}
                          </g>
                        )}
                      </g>
                    );
                  }
                )}

                {/* 3. Walls (Dark Charcoal, Architectural Appearance) */}
                {(isAllFloors
                  ? layout.floors?.flatMap((f) => f.walls || [...(f.exterior_walls || []), ...(f.interior_walls || [])]) || []
                  : currentFloor.walls || [...(currentFloor.exterior_walls || []), ...(currentFloor.interior_walls || [])]
                ).map((w: Wall, idx: number) => {
                  const x1 = (w.start ? w.start.x : w.x1) * SCALE;
                  const y1 = (w.start ? w.start.y : w.y1) * SCALE;
                  const x2 = (w.end ? w.end.x : w.x2) * SCALE;
                  const y2 = (w.end ? w.end.y : w.y2) * SCALE;
                  const isExt = Boolean(w.is_exterior) || (w.wall_type as unknown as string) === "exterior";

                  return (
                    <line
                      key={`wall-${w.id || idx}`}
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke="#1E293B"
                      strokeWidth={isExt ? 6 : 3.5}
                      strokeLinecap="square"
                    />
                  );
                })}

                {/* 4. Doors (Architectural Swing Arcs) */}
                {(isAllFloors ? layout.floors?.flatMap((f) => f.doors) || [] : currentFloor.doors || []).map(
                  (d: Door, idx: number) => {
                    const dx1 = d.x1 * SCALE;
                    const dy1 = d.y1 * SCALE;
                    const dx2 = d.x2 * SCALE;
                    const dy2 = d.y2 * SCALE;
                    const dw = d.width * SCALE;

                    return (
                      <g key={`door-${d.id || idx}`} pointerEvents="none">
                        <line x1={dx1} y1={dy1} x2={dx2} y2={dy2} stroke="#FFFFFF" strokeWidth={5} />
                        <line x1={dx1} y1={dy1} x2={dx2} y2={dy2} stroke="#64748B" strokeWidth={1.5} />
                        {/* Door leaf & swing radius */}
                        <circle
                          cx={dx1}
                          cy={dy1}
                          r={dw}
                          fill="none"
                          stroke="#94A3B8"
                          strokeWidth={0.8}
                          strokeDasharray="2 2"
                        />
                      </g>
                    );
                  }
                )}

                {/* 5. Windows (Architectural Glazing Symbol) */}
                {(isAllFloors ? layout.floors?.flatMap((f) => f.windows) || [] : currentFloor.windows || []).map(
                  (win: WindowItem, idx: number) => {
                    const wx1 = win.x1 * SCALE;
                    const wy1 = win.y1 * SCALE;
                    const wx2 = win.x2 * SCALE;
                    const wy2 = win.y2 * SCALE;

                    return (
                      <g key={`win-${win.id || idx}`} pointerEvents="none">
                        <line x1={wx1} y1={wy1} x2={wx2} y2={wy2} stroke="#FFFFFF" strokeWidth={5} />
                        <line x1={wx1} y1={wy1} x2={wx2} y2={wy2} stroke="#38BDF8" strokeWidth={2} />
                      </g>
                    );
                  }
                )}
              </g>
            )}

            {/* STRUCTURAL GRID (THIN / SUBTLE RED DASHED ORTHOGONAL LINES) */}
            {showGrid && grid && (
              <g id="structural-grid-layer" pointerEvents="none" opacity={0.75}>
                {/* Vertical Grid Lines (Letters A, B, C...) */}
                {(grid.x_grid_lines || []).map((gx, idx) => (
                  <g key={`s-grid-x-${idx}`}>
                    <line
                      x1={gx * SCALE}
                      y1={-18}
                      x2={gx * SCALE}
                      y2={svgHeight + 18}
                      stroke="#EF4444"
                      strokeWidth={0.8}
                      strokeDasharray="4 4"
                    />
                    <circle cx={gx * SCALE} cy={-22} r={7} fill="#FFFFFF" stroke="#EF4444" strokeWidth={1} />
                    <text
                      x={gx * SCALE}
                      y={-19}
                      textAnchor="middle"
                      fill="#DC2626"
                      className="font-mono text-[7.5px] font-bold"
                    >
                      {String.fromCharCode(65 + (idx % 26))}
                    </text>
                  </g>
                ))}

                {/* Horizontal Grid Lines (Numbers 1, 2, 3...) */}
                {(grid.y_grid_lines || []).map((gy, idx) => (
                  <g key={`s-grid-y-${idx}`}>
                    <line
                      x1={-18}
                      y1={gy * SCALE}
                      x2={svgWidth + 18}
                      y2={gy * SCALE}
                      stroke="#EF4444"
                      strokeWidth={0.8}
                      strokeDasharray="4 4"
                    />
                    <circle cx={-22} cy={gy * SCALE} r={7} fill="#FFFFFF" stroke="#EF4444" strokeWidth={1} />
                    <text
                      x={-22}
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

            {/* PRELIMINARY BEAMS (CLEAR STRUCTURAL LINE DISTINCT FROM WALLS) */}
            {showStructure && showBeams && (
              <g id="preliminary-beams-layer">
                {beams.map((beam) => {
                  const bx1 = beam.x1 * SCALE;
                  const by1 = beam.y1 * SCALE;
                  const bx2 = beam.x2 * SCALE;
                  const by2 = beam.y2 * SCALE;

                  return (
                    <g key={beam.beam_id}>
                      {/* Cyan/Blue Preliminary Structural Beam Line */}
                      <line
                        x1={bx1}
                        y1={by1}
                        x2={bx2}
                        y2={by2}
                        stroke="#0284C7"
                        strokeWidth={2.4}
                        strokeDasharray={beam.beam_type === "tie_beam" ? "5 3" : undefined}
                      />
                      {/* Beam Span Tag */}
                      <rect
                        x={(bx1 + bx2) / 2 - 14}
                        y={(by1 + by2) / 2 - 5}
                        width={28}
                        height={10}
                        rx={2}
                        fill="#FFFFFF"
                        stroke="#0284C7"
                        strokeWidth={0.6}
                      />
                      <text
                        x={(bx1 + bx2) / 2}
                        y={(by1 + by2) / 2 + 2.5}
                        textAnchor="middle"
                        fill="#0369A1"
                        className="font-mono text-[6.5px] font-semibold select-none pointer-events-none"
                      >
                        {beam.span_ft}&apos;
                      </text>
                    </g>
                  );
                })}

                {/* Preliminary Beam Layout Watermark Label */}
                <text
                  x={svgWidth - 10}
                  y={svgHeight + 18}
                  textAnchor="end"
                  fill="#0284C7"
                  className="font-mono text-[8px] font-bold uppercase tracking-widest select-none pointer-events-none"
                >
                  PRELIMINARY BEAM LAYOUT
                </text>
              </g>
            )}

            {/* COLUMNS / PILLARS (DISTINCT ARCHITECTURAL SYMBOLS & IDS) */}
            {showStructure && showColumns && (
              <g id="structural-columns-layer">
                {columns.map((col) => {
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
                      {/* Selection Glow Indicator */}
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
                        />
                      )}

                      {/* Structural Column Body: Dark charcoal with inner cross-hatch */}
                      <rect
                        x={cx - cw / 2}
                        y={cy - cd / 2}
                        width={cw}
                        height={cd}
                        fill={isSelected ? "#2563EB" : "#0F172A"}
                        stroke={isSelected ? "#1D4ED8" : "#0F172A"}
                        strokeWidth={1.5}
                      />
                      {/* Internal Diagonal Cross Lines */}
                      <line
                        x1={cx - cw / 2}
                        y1={cy - cd / 2}
                        x2={cx + cw / 2}
                        y2={cy + cd / 2}
                        stroke={isSelected ? "#FFFFFF" : "#94A3B8"}
                        strokeWidth={0.8}
                      />
                      <line
                        x1={cx + cw / 2}
                        y1={cy - cd / 2}
                        x2={cx - cw / 2}
                        y2={cy + cd / 2}
                        stroke={isSelected ? "#FFFFFF" : "#94A3B8"}
                        strokeWidth={0.8}
                      />

                      {/* Column ID Badge Pill */}
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

            {/* DIMENSIONS (DARK GRAY ARCHITECTURAL DIMENSION LINES) */}
            {showDimensions && (
              <g id="structural-dimensions-layer" pointerEvents="none">
                {/* Horizontal Top Overall Dimension */}
                <line x1={0} y1={-35} x2={svgWidth} y2={-35} stroke="#475569" strokeWidth={1} />
                <line x1={0} y1={-40} x2={0} y2={-30} stroke="#475569" strokeWidth={1} />
                <line x1={svgWidth} y1={-40} x2={svgWidth} y2={-30} stroke="#475569" strokeWidth={1} />
                <text
                  x={svgWidth / 2}
                  y={-40}
                  textAnchor="middle"
                  fill="#334155"
                  className="font-mono text-[9px] font-semibold"
                >
                  {layout.plot_width}&apos; - 0&quot;
                </text>

                {/* Vertical Left Overall Dimension */}
                <line x1={-35} y1={0} x2={-35} y2={svgHeight} stroke="#475569" strokeWidth={1} />
                <line x1={-40} y1={0} x2={-30} y2={0} stroke="#475569" strokeWidth={1} />
                <line x1={-40} y1={svgHeight} x2={-30} y2={svgHeight} stroke="#475569" strokeWidth={1} />
                <text
                  x={-42}
                  y={svgHeight / 2}
                  textAnchor="middle"
                  fill="#334155"
                  transform={`rotate(-90, -42, ${svgHeight / 2})`}
                  className="font-mono text-[9px] font-semibold"
                >
                  {layout.plot_length}&apos; - 0&quot;
                </text>
              </g>
            )}
          </svg>
        )}

        {/* Bottom Zoom & Reset Canvas Controls */}
        <div className="absolute bottom-4 left-4 z-20 flex items-center gap-1 p-1 bg-white/95 backdrop-blur-md rounded-xl border border-slate-200 shadow-md">
          <button
            onClick={() => setZoom((z) => Math.min(3.5, z * 1.2))}
            className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(0.4, z * 0.83))}
            className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={handleResetView}
            className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            title="Reset View"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <div className="px-2 text-[10px] font-mono text-slate-500">{Math.round(zoom * 100)}%</div>
        </div>
      </div>

      {/* 3. STRUCTURE INFORMATION & COLUMN INSPECTION PANEL (Rules 10, 11, 19) */}
      <aside className="w-full md:w-80 lg:w-96 bg-white border-t md:border-t-0 md:border-l border-slate-200 p-4 sm:p-5 flex flex-col justify-between overflow-y-auto max-h-[45vh] md:max-h-full shadow-lg z-20">
        <div className="space-y-4">
          {/* Panel Header */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <span className="text-[10px] font-mono text-blue-600 font-semibold tracking-widest uppercase">
                TECHNICAL ARCHITECTURE
              </span>
              <h2 className="text-sm font-semibold tracking-wide text-slate-900">STRUCTURAL OVERVIEW</h2>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-[10.5px] font-mono font-medium">
              <Columns className="w-3 h-3" />
              <span>{columns.length} COLS</span>
            </div>
          </div>

          {/* Key Engineering Metric Grid (Rule 10) */}
          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-[10px] text-slate-500 uppercase block">Structural System</span>
              <span className="font-semibold text-slate-900">{layout.structural_system || "RCC Frame"}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-[10px] text-slate-500 uppercase block">Stories / Floors</span>
              <span className="font-semibold text-slate-900">
                {totalFloors === 1 ? "G (Single Story)" : `G+${totalFloors - 1}`}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-[10px] text-slate-500 uppercase block">Column Size</span>
              <span className="font-semibold text-slate-900">
                {totalFloors > 1 ? "300 × 450 mm" : "230 × 300 mm"}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-[10px] text-slate-500 uppercase block">Wall Thickness</span>
              <span className="font-semibold text-slate-900">230 mm (9&quot;)</span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-[10px] text-slate-500 uppercase block">Floor-to-Floor</span>
              <span className="font-semibold text-slate-900">3.0 m (10.0 ft)</span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-[10px] text-slate-500 uppercase block">Max Prelim Span</span>
              <span className="font-semibold text-slate-900">{maxSpanFt.toFixed(1)} ft</span>
            </div>
          </div>

          {/* Selected Column Detail Inspector (Rule 11) */}
          {selectedColumn ? (
            <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] font-bold text-blue-900 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                  COLUMN {selectedColumn.column_id}
                </span>
                <span className="text-[9.5px] font-mono px-2 py-0.5 rounded-full bg-blue-200 text-blue-900 font-semibold">
                  PRELIMINARY
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-[11px] text-slate-700 font-mono">
                <div>
                  <span className="text-slate-500 text-[10px]">Approximate Size:</span>
                  <div className="font-semibold text-slate-900">
                    {totalFloors > 1 ? "300 × 450 mm (9×12 in)" : "230 × 300 mm (9×9 in)"}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px]">Floors Served:</span>
                  <div className="font-semibold text-slate-900">
                    {(selectedColumn.floors?.length ?? 0) > 1 ? "Ground + Upper" : "Ground Floor"}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px]">Position (X / Y):</span>
                  <div className="font-semibold text-slate-900">
                    {selectedColumn.x.toFixed(1)}&apos; / {selectedColumn.y.toFixed(1)}&apos;
                  </div>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px]">Vertical Alignment:</span>
                  <div className="font-semibold text-emerald-700 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Continuous
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-[11px] text-slate-500 flex items-center gap-2 font-mono">
              <Info className="w-4 h-4 text-slate-400 shrink-0" />
              <span>Click any column (C01, C02...) to inspect geometric size and load path.</span>
            </div>
          )}

          {/* Validation Checks & Alignment Flags (Rules 9 & 13) */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider font-semibold">
              STRUCTURAL CLEARANCES & ALIGNMENT
            </span>
            <div className="space-y-1 text-[11px] font-mono">
              {(validationReport?.column_alignment_issues || []).map((issue, i) => (
                <div
                  key={`align-issue-${i}`}
                  className="flex items-start gap-1.5 p-2 rounded-lg bg-slate-50 border border-slate-100 text-slate-700"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span className="leading-snug">{issue}</span>
                </div>
              ))}

              {(validationReport?.columns_conflicting_parking || []).map((pConflict, i) => (
                <div
                  key={`park-conf-${i}`}
                  className="flex items-start gap-1.5 p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-900"
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <span className="leading-snug">{pConflict}</span>
                </div>
              ))}

              {(validationReport?.unusually_large_spans || []).map((spanNote, i) => (
                <div
                  key={`span-note-${i}`}
                  className="flex items-start gap-1.5 p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-900"
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <span className="leading-snug">
                    Span {spanNote.from_column} → {spanNote.to_column} ({spanNote.span_ft}ft): Intermediate beam suggested.
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Engineering Assumptions (Rule 10) */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider font-semibold">
              ASSUMPTIONS
            </span>
            <ul className="text-[10.5px] font-mono text-slate-600 space-y-1 list-disc list-inside">
              <li>Preliminary modular structural grid</li>
              <li>Conceptual column placement based on floor walls</li>
              <li>Assumed RCC framing structural system</li>
              <li>Final structural design pending engineering verification</li>
            </ul>
          </div>
        </div>

        {/* STRUCTURAL DISCLAIMER (Rule 19) */}
        <div className="mt-4 pt-3 border-t border-slate-100">
          <p className="text-[9px] font-mono text-slate-400 leading-relaxed">
            Preliminary structural planning only. Final column sizes, beam sizes, reinforcement, foundations and
            structural safety must be designed and verified by a qualified structural engineer.
          </p>
        </div>
      </aside>
    </div>
  );
};
