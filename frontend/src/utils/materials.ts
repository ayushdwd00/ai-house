import * as THREE from "three";
import { MaterialDefinition } from "@/types/house";

/**
 * Canonical Indian Residential Construction Material Definitions
 * Data-driven specifications with realistic roughness, metalness, and procedural textures.
 */
export const CANONICAL_MATERIALS: Record<string, MaterialDefinition> = {
  rcc_concrete: {
    id: "rcc_concrete",
    category: "structural",
    name: "RCC Concrete (M25 Grade)",
    base_color: "#C4C8CC",
    roughness: 0.88,
    metalness: 0.05,
    texture: "concrete_texture",
    texture_scale: 2.0,
    usage: "Columns, beams, plinths, floor slabs, and staircases",
  },
  cement_plaster: {
    id: "cement_plaster",
    category: "finish",
    name: "Smooth Cement Plaster",
    base_color: "#EFECE6",
    roughness: 0.82,
    metalness: 0.02,
    texture: "plaster_texture",
    texture_scale: 1.0,
    usage: "Interior wall plaster with smooth emulsion finish",
  },
  exterior_plaster_terracotta: {
    id: "exterior_plaster_terracotta",
    category: "finish",
    name: "Terracotta Accent Plaster",
    base_color: "#D96836",
    roughness: 0.75,
    metalness: 0.02,
    texture: "plaster_texture",
    texture_scale: 1.0,
    usage: "Exterior architectural feature walls and front facade",
  },
  exterior_plaster_sage: {
    id: "exterior_plaster_sage",
    category: "finish",
    name: "Modern Sage Green Plaster",
    base_color: "#C8D3C5",
    roughness: 0.78,
    metalness: 0.02,
    texture: "plaster_texture",
    texture_scale: 1.0,
    usage: "Exterior residential facade body plaster",
  },
  brick_masonry: {
    id: "brick_masonry",
    category: "structural",
    name: "Exposed Wire-Cut Brick Masonry",
    base_color: "#A44A2D",
    roughness: 0.92,
    metalness: 0.0,
    texture: "brick_texture",
    texture_scale: 2.5,
    usage: "Load-bearing exterior walls and feature partitions",
  },
  structural_steel: {
    id: "structural_steel",
    category: "structural",
    name: "Mild Steel (Epoxy Coated)",
    base_color: "#27272A",
    roughness: 0.35,
    metalness: 0.85,
    usage: "Boundary entrance gate, veranda railings, and balcony balustrades",
  },
  vitrified_tile_ivory: {
    id: "vitrified_tile_ivory",
    category: "finish",
    name: "Polished Vitrified Tile (2x2 ft)",
    base_color: "#F6F4EE",
    roughness: 0.18,
    metalness: 0.05,
    texture: "tile_grid_texture",
    texture_scale: 3.0,
    usage: "Living room, dining hall, and bedroom flooring",
  },
  ceramic_tile_bathroom: {
    id: "ceramic_tile_bathroom",
    category: "finish",
    name: "Matte Anti-Skid Ceramic Tile",
    base_color: "#DDD8D0",
    roughness: 0.65,
    metalness: 0.02,
    texture: "ceramic_texture",
    texture_scale: 2.0,
    usage: "Bathroom, toilet, and utility flooring",
  },
  granite_black: {
    id: "granite_black",
    category: "finish",
    name: "Jet Black Granite (Polished)",
    base_color: "#18181B",
    roughness: 0.22,
    metalness: 0.12,
    texture: "granite_speckle",
    texture_scale: 1.5,
    usage: "Kitchen countertop, window sills, and staircase tread nosing",
  },
  marble_white: {
    id: "marble_white",
    category: "finish",
    name: "White Makrana Marble",
    base_color: "#FAF9F5",
    roughness: 0.25,
    metalness: 0.08,
    texture: "marble_vein",
    texture_scale: 2.0,
    usage: "Entrance veranda, pooja room, and foyer",
  },
  teak_wood: {
    id: "teak_wood",
    category: "finish",
    name: "Indian Teak Wood (Varnished)",
    base_color: "#8B5A2B",
    roughness: 0.45,
    metalness: 0.05,
    texture: "wood_grain",
    texture_scale: 2.0,
    usage: "Main entrance door, interior door leaves, and stair handrail",
  },
  aluminum_charcoal: {
    id: "aluminum_charcoal",
    category: "finish",
    name: "Powder-Coated Charcoal Aluminum",
    base_color: "#33353A",
    roughness: 0.4,
    metalness: 0.7,
    usage: "Window frames, sliding door tracks, and structural mullions",
  },
  architectural_glass: {
    id: "architectural_glass",
    category: "finish",
    name: "Reflective Float Glass (6mm)",
    base_color: "#E2F1F8",
    roughness: 0.08,
    metalness: 0.2,
    usage: "Window panes, balcony railings, and shower enclosures",
  },
  concrete_pavers: {
    id: "concrete_pavers",
    category: "site",
    name: "Interlocking Concrete Pavers",
    base_color: "#A1A1AA",
    roughness: 0.85,
    metalness: 0.05,
    texture: "paver_texture",
    texture_scale: 2.0,
    usage: "Driveway and car porch parking area",
  },
  grass_turf: {
    id: "grass_turf",
    category: "site",
    name: "Natural Green Lawn Turf",
    base_color: "#3F8E48",
    roughness: 0.95,
    metalness: 0.0,
    texture: "grass_texture",
    texture_scale: 4.0,
    usage: "Front and rear garden setback landscaping",
  },
  boundary_wall_plaster: {
    id: "boundary_wall_plaster",
    category: "boundary",
    name: "Plastered Masonry Boundary Wall",
    base_color: "#E4DFD5",
    roughness: 0.85,
    metalness: 0.02,
    usage: "Plot perimeter boundary wall with concrete coping",
  },
};

// Texture cache to prevent recreating textures on every render
const textureCache = new Map<string, THREE.CanvasTexture>();

/**
 * Creates procedural high-quality canvas textures for residential materials
 */
export function getProceduralTexture(type: string): THREE.CanvasTexture {
  if (textureCache.has(type)) {
    return textureCache.get(type)!;
  }

  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    const fallback = new THREE.CanvasTexture(canvas);
    textureCache.set(type, fallback);
    return fallback;
  }

  if (type === "tile_grid_texture") {
    // 2x2 ft polished tile grid with subtle grout
    ctx.fillStyle = "#F6F4EE";
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = "#DDD8D0";
    ctx.lineWidth = 2;
    for (let i = 0; i <= 512; i += 128) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 512);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(512, i);
      ctx.stroke();
    }
  } else if (type === "paver_texture") {
    // Interlocking paver blocks
    ctx.fillStyle = "#A8A59F";
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = "#87847E";
    ctx.lineWidth = 2.5;
    for (let y = 0; y <= 512; y += 64) {
      const offset = (y / 64) % 2 === 0 ? 0 : 64;
      for (let x = offset; x <= 512; x += 128) {
        ctx.strokeRect(x, y, 128, 64);
      }
    }
  } else if (type === "grass_texture") {
    // Lawn grass with subtle shade variation
    ctx.fillStyle = "#3F8E48";
    ctx.fillRect(0, 0, 512, 512);
    ctx.fillStyle = "#367B3E";
    for (let i = 0; i < 2000; i++) {
      const rx = Math.random() * 512;
      const ry = Math.random() * 512;
      ctx.fillRect(rx, ry, 2, 4);
    }
  } else if (type === "concrete_texture") {
    // Concrete aggregate texture
    ctx.fillStyle = "#C4C8CC";
    ctx.fillRect(0, 0, 512, 512);
    ctx.fillStyle = "#B2B6BA";
    for (let i = 0; i < 1500; i++) {
      const rx = Math.random() * 512;
      const ry = Math.random() * 512;
      ctx.fillRect(rx, ry, 1.5, 1.5);
    }
  } else if (type === "brick_texture") {
    // Staggered brick masonry
    ctx.fillStyle = "#A44A2D";
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = "#D1C7BD"; // mortar joints
    ctx.lineWidth = 3;
    for (let y = 0; y <= 512; y += 48) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(512, y);
      ctx.stroke();
      const offset = (y / 48) % 2 === 0 ? 0 : 48;
      for (let x = offset; x <= 512; x += 96) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + 48);
        ctx.stroke();
      }
    }
  } else {
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, 512, 512);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  textureCache.set(type, tex);
  return tex;
}

// Three.js Material cache
const threeMaterialCache = new Map<string, THREE.Material>();

/**
 * Resolves a Three.js MeshStandardMaterial for a given MaterialDefinition ID
 */
export function getThreeMaterial(materialId: string, overrides?: Partial<THREE.MeshStandardMaterialParameters>): THREE.MeshStandardMaterial {
  const cacheKey = materialId + (overrides ? JSON.stringify(overrides) : "");
  if (threeMaterialCache.has(cacheKey)) {
    return threeMaterialCache.get(cacheKey) as THREE.MeshStandardMaterial;
  }

  const def = CANONICAL_MATERIALS[materialId] || CANONICAL_MATERIALS.cement_plaster;
  const params: THREE.MeshStandardMaterialParameters = {
    color: new THREE.Color(def.base_color),
    roughness: def.roughness,
    metalness: def.metalness,
    ...overrides,
  };

  if (def.texture) {
    params.map = getProceduralTexture(def.texture);
  }

  if (materialId === "architectural_glass") {
    params.transparent = true;
    params.opacity = 0.55;
    params.roughness = 0.05;
    params.metalness = 0.1;
  }

  const mat = new THREE.MeshStandardMaterial(params);
  threeMaterialCache.set(cacheKey, mat);
  return mat;
}
