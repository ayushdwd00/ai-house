import * as THREE from "three";
import { HouseLayout, Point2D, Rect } from "@/types/house";

// ============================================================================
// RESIDENTIAL ARCHITECTURAL LANDSCAPE SYSTEM — DATA MODEL
// ============================================================================

export type LandscapeZoneType =
  | "FRONT_LAWN"
  | "SIDE_LAWN"
  | "REAR_LAWN"
  | "PLANTING_BED"
  | "ENTRY_PATH"
  | "DRIVEWAY"
  | "PARKING"
  | "OUTDOOR_SITTING"
  | "BOUNDARY";

export type LandscapeElementType =
  | "LAWN"
  | "PLANTING_BED"
  | "PATH"
  | "DRIVEWAY"
  | "PARKING"
  | "SHRUB"
  | "FLOWER"
  | "TREE"
  | "LIGHT"
  | "OUTDOOR_FURNITURE"
  | "CURB"
  | "PERGOLA";

export interface PlantingBed {
  id: string;
  name: string;
  rect: Rect;
  elevation: number;
  hasCurb: boolean;
  curbHeight: number;
  plants: PlantItem[];
}

export interface LawnZone {
  id: string;
  name: string;
  rect: Rect;
  elevation: number;
}

export interface PathPoint {
  x: number;
  y: number;
}

export interface PathwaySegment {
  p1: PathPoint;
  p2: PathPoint;
  width: number;
}

export interface PlantItem {
  id: string;
  type: "shrub" | "flower" | "tree";
  assetKey: "bush" | "bushDetailed" | "flowerRed" | "flowerYellow" | "flowerPurple" | "treeSmall";
  x: number;
  z: number;
  scale: number;
  rotationY: number;
}

export interface OutdoorFurnitureItem {
  id: string;
  type: "table" | "chair" | "bench" | "deck";
  x: number;
  z: number;
  width: number;
  length: number;
  rotationY: number;
}

export interface LandscapeBollardLight {
  id: string;
  x: number;
  z: number;
  height: number;
}

export interface ArchitecturalLandscapeModel {
  plotWidth: number;
  plotLength: number;
  buildingEnvelope: Rect;
  parkingRect: Rect;
  drivewayRect: Rect;
  pedestrianPath: PathPoint[];
  entranceDoor: { x: number; z: number };
  lawnZones: LawnZone[];
  plantingBeds: PlantingBed[];
  walkwaySegments: PathwaySegment[];
  trees: PlantItem[];
  shrubs: PlantItem[];
  flowers: PlantItem[];
  outdoorFurniture: OutdoorFurnitureItem[];
  bollardLights: LandscapeBollardLight[];
  boundaryWall: {
    roadSide?: "north" | "south" | "east" | "west";
    rearWall: Rect;
    leftWall: Rect;
    rightWall: Rect;
    frontWallSegments: Rect[];
    vehicleGate: { x: number; y?: number; width: number };
    pedestrianGate: { x: number; y?: number; width: number };
  };
}

export interface LandscapeRenderOptions {
  filterCategory?: "all" | "vegetation" | "paths" | "lighting" | "furniture";
  lightingPreset?: "day" | "sunset" | "night" | "studio";
  isDarkMode?: boolean;
}

// ============================================================================
// ARCHITECTURAL SITE-AWARE LANDSCAPE GENERATOR (SCRATCH PIPELINE)
// ============================================================================

export function generateArchitecturalLandscape(layout: HouseLayout): ArchitecturalLandscapeModel {
  const pw = Math.max(24, Number(layout.plot_width) || Number(layout.site?.plot_width) || 40.0);
  const pl = Math.max(24, Number(layout.plot_length) || Number(layout.site?.plot_length) || 50.0);
  const cx = pw / 2;
  const cz = pl / 2;

  // 1. EXTRACT CANONICAL BUILDING FOOTPRINT
  const rooms = layout.floors?.[0]?.rooms || layout.rooms || [];
  let minBx = Infinity;
  let maxBx = -Infinity;
  let minBz = Infinity;
  let maxBz = -Infinity;

  rooms.forEach((r) => {
    if (r.rect) {
      minBx = Math.min(minBx, r.rect.x);
      maxBx = Math.max(maxBx, r.rect.x + r.rect.width);
      minBz = Math.min(minBz, r.rect.y);
      maxBz = Math.max(maxBz, r.rect.y + r.rect.length);
    }
  });

  const hasRooms = isFinite(minBx) && minBx < maxBx;
  if (!hasRooms) {
    minBx = pw * 0.15;
    maxBx = pw * 0.85;
    minBz = pl * 0.15;
    maxBz = pl * 0.75;
  }

  const buildingEnv: Rect = {
    x: minBx,
    y: minBz,
    width: maxBx - minBx,
    length: maxBz - minBz,
  };

  // 2. ENTRANCE ACCESS & MAIN DOOR
  const doors = layout.floors?.[0]?.doors || layout.doors || [];
  const mainDoor =
    doors.find((d) => d.door_type === "entrance" || d.type === "entrance" || d.door_type === "entry") ||
    doors[0];
  const doorX = mainDoor ? (mainDoor.x1 + mainDoor.x2) / 2 : cx;
  const doorZ = mainDoor ? (mainDoor.y1 + mainDoor.y2) / 2 : maxBz;

  const rawSide = String(layout.site?.road_side || layout.facing || "south").toLowerCase();
  const roadSide: "north" | "south" | "east" | "west" =
    rawSide.includes("west") ? "west" :
    rawSide.includes("east") ? "east" :
    rawSide.includes("north") ? "north" : "south";

  // 3. PARKING & DRIVEWAY
  const rawPkg = layout.site?.parking?.rect;
  let pkgRect: Rect;
  if (rawPkg) {
    pkgRect = {
      x: rawPkg.x,
      y: rawPkg.y,
      width: Math.max(9.0, rawPkg.width || 10.0),
      length: Math.max(9.0, rawPkg.length || 16.0),
    };
  } else {
    // Put parking on road frontage
    if (roadSide === "south") {
      const pkgOnLeft = doorX > cx;
      pkgRect = {
        x: pkgOnLeft ? 2.8 : pw - 12.8,
        y: Math.max(minBz + 10, pl - 18.0),
        width: 10.0,
        length: 16.0,
      };
    } else if (roadSide === "north") {
      const pkgOnLeft = doorX > cx;
      pkgRect = {
        x: pkgOnLeft ? 2.8 : pw - 12.8,
        y: 2.0,
        width: 10.0,
        length: 16.0,
      };
    } else if (roadSide === "west") {
      const pkgOnTop = doorZ > cz;
      pkgRect = {
        x: 2.0,
        y: pkgOnTop ? 2.8 : pl - 12.8,
        width: 16.0,
        length: 10.0,
      };
    } else { // east
      const pkgOnTop = doorZ > cz;
      pkgRect = {
        x: Math.max(minBx + 10, pw - 18.0),
        y: pkgOnTop ? 2.8 : pl - 12.8,
        width: 16.0,
        length: 10.0,
      };
    }
  }

  let drivewayRect: Rect;
  if (layout.site?.driveway) {
    drivewayRect = layout.site.driveway;
  } else {
    if (roadSide === "south") {
      const drvX = pkgRect.x + pkgRect.width / 2;
      const drvW = pkgRect.width + 1.2;
      const drvStartY = pkgRect.y + pkgRect.length;
      const drvLen = Math.max(1.0, pl - 0.5 - drvStartY);
      drivewayRect = { x: drvX - drvW / 2, y: drvStartY, width: drvW, length: drvLen };
    } else if (roadSide === "north") {
      const drvX = pkgRect.x + pkgRect.width / 2;
      const drvW = pkgRect.width + 1.2;
      drivewayRect = { x: drvX - drvW / 2, y: 0.5, width: drvW, length: Math.max(1.0, pkgRect.y - 0.5) };
    } else if (roadSide === "west") {
      const drvY = pkgRect.y + pkgRect.length / 2;
      const drvH = pkgRect.length + 1.2;
      drivewayRect = { x: 0.5, y: drvY - drvH / 2, width: Math.max(1.0, pkgRect.x - 0.5), length: drvH };
    } else { // east
      const drvY = pkgRect.y + pkgRect.length / 2;
      const drvH = pkgRect.length + 1.2;
      const drvStartX = pkgRect.x + pkgRect.width;
      drivewayRect = { x: drvStartX, y: drvY - drvH / 2, width: Math.max(1.0, pw - 0.5 - drvStartX), length: drvH };
    }
  }

  // 4. PEDESTRIAN WALKWAY PATH
  let rawPoints: PathPoint[] = [];
  if (layout.site?.pedestrian_path && layout.site.pedestrian_path.length > 0) {
    rawPoints = layout.site.pedestrian_path.map((p) => ({ x: p.x, y: p.y }));
  }

  const pedestrianPath: PathPoint[] = [];
  if (rawPoints.length >= 2) {
    pedestrianPath.push(...rawPoints);
    const last = pedestrianPath[pedestrianPath.length - 1];
    if (Math.hypot(last.x - doorX, last.y - doorZ) > 1.5) {
      pedestrianPath.push({ x: doorX, y: doorZ });
    }
  } else {
    if (roadSide === "south") {
      const walkStartX = Math.min(pw - 4.5, Math.max(4.5, pkgRect.x > cx ? 6.5 : pw - 6.5));
      pedestrianPath.push(
        { x: walkStartX, y: pl - 0.5 },
        { x: walkStartX, y: (pl + doorZ) / 2 + 1.0 },
        { x: doorX, y: (pl + doorZ) / 2 + 1.0 },
        { x: doorX, y: doorZ + 2.0 }
      );
    } else if (roadSide === "north") {
      const walkStartX = Math.min(pw - 4.5, Math.max(4.5, pkgRect.x > cx ? 6.5 : pw - 6.5));
      pedestrianPath.push(
        { x: walkStartX, y: 0.5 },
        { x: walkStartX, y: doorZ / 2 },
        { x: doorX, y: doorZ / 2 },
        { x: doorX, y: doorZ - 2.0 }
      );
    } else if (roadSide === "west") {
      const walkStartZ = Math.min(pl - 4.5, Math.max(4.5, pkgRect.y > cz ? 6.5 : pl - 6.5));
      pedestrianPath.push(
        { x: 0.5, y: walkStartZ },
        { x: (minBx) / 2, y: walkStartZ },
        { x: (minBx) / 2, y: doorZ },
        { x: doorX - 2.0, y: doorZ }
      );
    } else { // east
      const walkStartZ = Math.min(pl - 4.5, Math.max(4.5, pkgRect.y > cz ? 6.5 : pl - 6.5));
      pedestrianPath.push(
        { x: pw - 0.5, y: walkStartZ },
        { x: (pw + maxBx) / 2, y: walkStartZ },
        { x: (pw + maxBx) / 2, y: doorZ },
        { x: doorX + 2.0, y: doorZ }
      );
    }
  }

  const walkwaySegments: PathwaySegment[] = [];
  for (let i = 0; i < pedestrianPath.length - 1; i++) {
    walkwaySegments.push({
      p1: pedestrianPath[i],
      p2: pedestrianPath[i + 1],
      width: 3.6,
    });
  }

  // 5. BOUNDARY WALL & GATE INTERVALS
  const bwThick = 0.55;
  const bwH = 4.2;
  const frontWallSegments: Rect[] = [];
  let vehGate: { x: number; y?: number; width: number };
  let pedGate: { x: number; y?: number; width: number };

  if (roadSide === "south" || roadSide === "north") {
    const drvCenterX = drivewayRect.x + drivewayRect.width / 2;
    const walkStart = pedestrianPath[0] || { x: cx + 2, y: roadSide === "south" ? pl : 0 };
    const gateY = roadSide === "south" ? pl - bwThick / 2 : bwThick / 2;
    vehGate = { x: drvCenterX, y: gateY, width: drivewayRect.width + 1.0 };
    pedGate = { x: Math.min(pw - 3.5, Math.max(3.5, walkStart.x)), y: gateY, width: 4.0 };

    const intervals = [
      { start: vehGate.x - vehGate.width / 2, end: vehGate.x + vehGate.width / 2 },
      { start: pedGate.x - pedGate.width / 2, end: pedGate.x + pedGate.width / 2 },
    ].sort((a, b) => a.start - b.start);

    const mergedIntervals: Array<{ start: number; end: number }> = [];
    intervals.forEach((iv) => {
      if (mergedIntervals.length > 0 && iv.start <= mergedIntervals[mergedIntervals.length - 1].end + 0.6) {
        mergedIntervals[mergedIntervals.length - 1].end = Math.max(mergedIntervals[mergedIntervals.length - 1].end, iv.end);
      } else {
        mergedIntervals.push({ ...iv });
      }
    });

    let curX = 0;
    const wallY = roadSide === "south" ? pl - bwThick : 0;
    mergedIntervals.forEach((mIv) => {
      const segW = Math.max(0, mIv.start - curX);
      if (segW > 0.5) {
        frontWallSegments.push({ x: curX, y: wallY, width: segW, length: bwThick });
      }
      curX = mIv.end;
    });
    if (pw - curX > 0.5) {
      frontWallSegments.push({ x: curX, y: wallY, width: pw - curX, length: bwThick });
    }
  } else {
    // roadSide === "west" || roadSide === "east"
    const drvCenterY = drivewayRect.y + drivewayRect.length / 2;
    const walkStart = pedestrianPath[0] || { x: roadSide === "west" ? 0 : pw, y: cz + 2 };
    const gateX = roadSide === "west" ? bwThick / 2 : pw - bwThick / 2;
    vehGate = { x: gateX, y: drvCenterY, width: drivewayRect.length + 1.0 };
    pedGate = { x: gateX, y: Math.min(pl - 3.5, Math.max(3.5, walkStart.y)), width: 4.0 };

    const intervals = [
      { start: (vehGate.y || cz) - vehGate.width / 2, end: (vehGate.y || cz) + vehGate.width / 2 },
      { start: (pedGate.y || cz) - pedGate.width / 2, end: (pedGate.y || cz) + pedGate.width / 2 },
    ].sort((a, b) => a.start - b.start);

    const mergedIntervals: Array<{ start: number; end: number }> = [];
    intervals.forEach((iv) => {
      if (mergedIntervals.length > 0 && iv.start <= mergedIntervals[mergedIntervals.length - 1].end + 0.6) {
        mergedIntervals[mergedIntervals.length - 1].end = Math.max(mergedIntervals[mergedIntervals.length - 1].end, iv.end);
      } else {
        mergedIntervals.push({ ...iv });
      }
    });

    let curY = 0;
    const wallX = roadSide === "west" ? 0 : pw - bwThick;
    mergedIntervals.forEach((mIv) => {
      const segL = Math.max(0, mIv.start - curY);
      if (segL > 0.5) {
        frontWallSegments.push({ x: wallX, y: curY, width: bwThick, length: segL });
      }
      curY = mIv.end;
    });
    if (pl - curY > 0.5) {
      frontWallSegments.push({ x: wallX, y: curY, width: bwThick, length: pl - curY });
    }
  }

  // 6. COLLISION MASK FOR ALL HARDSCAPE / ARCHITECTURAL OBJECTS
  const isPointCollidingHardscape = (x: number, z: number, clearance: number = 0.8): boolean => {
    if (x - clearance < 0.6 || x + clearance > pw - 0.6) return true;
    if (z - clearance < 0.6 || z + clearance > pl - 0.6) return true;

    // Building envelope
    if (
      x + clearance > buildingEnv.x - 0.6 &&
      x - clearance < buildingEnv.x + buildingEnv.width + 0.6 &&
      z + clearance > buildingEnv.y - 0.6 &&
      z - clearance < buildingEnv.y + buildingEnv.length + 0.6
    ) {
      return true;
    }

    // Individual room check (strictly guarantee no room is touched)
    for (const r of rooms) {
      if (r.rect) {
        if (
          x + clearance > r.rect.x - 0.6 &&
          x - clearance < r.rect.x + r.rect.width + 0.6 &&
          z + clearance > r.rect.y - 0.6 &&
          z - clearance < r.rect.y + r.rect.length + 0.6
        ) {
          return true;
        }
      }
    }

    // Parking area
    if (
      x + clearance > pkgRect.x - 0.4 &&
      x - clearance < pkgRect.x + pkgRect.width + 0.4 &&
      z + clearance > pkgRect.y - 0.4 &&
      z - clearance < pkgRect.y + pkgRect.length + 0.4
    ) {
      return true;
    }

    // Driveway
    if (
      x + clearance > drivewayRect.x - 0.4 &&
      x - clearance < drivewayRect.x + drivewayRect.width + 0.4 &&
      z + clearance > drivewayRect.y - 0.4 &&
      z - clearance < drivewayRect.y + drivewayRect.length + 0.4
    ) {
      return true;
    }

    // Walkway segments
    for (const seg of walkwaySegments) {
      const dx = seg.p2.x - seg.p1.x;
      const dz = seg.p2.y - seg.p1.y;
      const lenSq = dx * dx + dz * dz;
      if (lenSq < 0.01) continue;
      const t = Math.max(0, Math.min(1, ((x - seg.p1.x) * dx + (z - seg.p1.y) * dz) / lenSq));
      const px = seg.p1.x + t * dx;
      const pz = seg.p1.y + t * dz;
      if (Math.hypot(x - px, z - pz) < seg.width / 2 + clearance + 0.3) {
        return true;
      }
    }

    // Main entrance porch area
    if (Math.hypot(x - doorX, z - (doorZ + 1.8)) < 3.2) {
      return true;
    }

    return false;
  };

  // 7. LAWN ZONES (PROPER GEOMETRIC TURF SURFACES, NOT ONE GIANT RECTANGLE)
  const lawnZones: LawnZone[] = [];

  // A. Front Lawn: Setback between building front and front boundary
  const frontLawnZ1 = maxBz + 1.0;
  const frontLawnZ2 = pl - 1.2;
  if (frontLawnZ2 - frontLawnZ1 > 3.0) {
    if (pkgRect.x > cx) {
      // Parking on right, front lawn on left
      const flX1 = 1.6;
      const flX2 = Math.min(pkgRect.x - 1.5, doorX - 2.5);
      if (flX2 - flX1 > 4.0) {
        lawnZones.push({
          id: "lawn_front_main",
          name: "Front Lawn",
          rect: { x: flX1, y: frontLawnZ1, width: flX2 - flX1, length: frontLawnZ2 - frontLawnZ1 },
          elevation: 0.015,
        });
      }
    } else {
      // Parking on left, front lawn on right
      const flX1 = Math.max(pkgRect.x + pkgRect.width + 1.5, doorX + 2.5);
      const flX2 = pw - 1.6;
      if (flX2 - flX1 > 4.0) {
        lawnZones.push({
          id: "lawn_front_main",
          name: "Front Lawn",
          rect: { x: flX1, y: frontLawnZ1, width: flX2 - flX1, length: frontLawnZ2 - frontLawnZ1 },
          elevation: 0.015,
        });
      }
    }
  }

  // B. Rear Lawn / Garden (North Setback)
  const rearLawnZ1 = 1.4;
  const rearLawnZ2 = minBz - 1.0;
  if (rearLawnZ2 - rearLawnZ1 > 3.5) {
    lawnZones.push({
      id: "lawn_rear",
      name: "Private Rear Garden",
      rect: { x: 1.8, y: rearLawnZ1, width: pw - 3.6, length: rearLawnZ2 - rearLawnZ1 },
      elevation: 0.015,
    });
  }

  // C. Side Lawns
  // Right side lawn
  if (pw - maxBx > 5.5) {
    lawnZones.push({
      id: "lawn_side_east",
      name: "East Side Garden",
      rect: { x: maxBx + 1.2, y: minBz, width: pw - maxBx - 2.6, length: maxBz - minBz },
      elevation: 0.015,
    });
  }
  // Left side lawn (if clear of parking)
  if (minBx > 5.5 && pkgRect.y > maxBz) {
    lawnZones.push({
      id: "lawn_side_west",
      name: "West Side Garden",
      rect: { x: 1.4, y: minBz, width: minBx - 2.6, length: maxBz - minBz },
      elevation: 0.015,
    });
  }

  // 8. STRUCTURED ARCHITECTURAL PLANTING BEDS (CRITICAL USER REQUIREMENT)
  const plantingBeds: PlantingBed[] = [];

  // A. Front Façade Foundation Planting Bed (Stone-curbed bed with dark mulch)
  const frontBedW = Math.max(4.0, (buildingEnv.width - 6.0) / 2);
  const frontBedZ = maxBz + 0.4;
  if (pkgRect.x > cx) {
    // Bed on left of door
    plantingBeds.push({
      id: "bed_facade_left",
      name: "Front Façade Garden Bed",
      rect: { x: Math.max(1.5, minBx), y: frontBedZ, width: frontBedW, length: 2.4 },
      elevation: 0.035,
      hasCurb: true,
      curbHeight: 0.08,
      plants: [],
    });
  } else {
    // Bed on right of door
    plantingBeds.push({
      id: "bed_facade_right",
      name: "Front Façade Garden Bed",
      rect: { x: Math.min(pw - 5.5, maxBx - frontBedW), y: frontBedZ, width: frontBedW, length: 2.4 },
      elevation: 0.035,
      hasCurb: true,
      curbHeight: 0.08,
      plants: [],
    });
  }

  // B. Walkway Flanking Planting Bed (Bordering the pedestrian path approach)
  for (let i = 0; i < pedestrianPath.length - 1; i++) {
    const p1 = pedestrianPath[i];
    const p2 = pedestrianPath[i + 1];
    const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    if (segLen > 4.5) {
      const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      const perp = angle + Math.PI / 2;
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      const bedOffsetX = Math.cos(perp) * 2.8;
      const bedOffsetY = Math.sin(perp) * 2.8;

      const bedPos = { x: midX + bedOffsetX, z: midY + bedOffsetY };
      if (!isPointCollidingHardscape(bedPos.x, bedPos.z, 1.2)) {
        plantingBeds.push({
          id: `bed_walkway_${i}`,
          name: "Walkway Border Bed",
          rect: { x: bedPos.x - 1.2, y: bedPos.z - segLen / 2 + 0.5, width: 2.4, length: segLen - 1.0 },
          elevation: 0.03,
          hasCurb: true,
          curbHeight: 0.06,
          plants: [],
        });
      }
    }
  }

  // C. Rear Boundary Planting Strip (Along rear wall)
  plantingBeds.push({
    id: "bed_rear_boundary",
    name: "Rear Perimeter Planting Strip",
    rect: { x: 2.2, y: bwThick + 0.3, width: pw - 4.4, length: 2.2 },
    elevation: 0.03,
    hasCurb: true,
    curbHeight: 0.06,
    plants: [],
  });

  // D. Side Boundary Planting Strip (Right boundary wall)
  plantingBeds.push({
    id: "bed_east_boundary",
    name: "East Boundary Shrub Bed",
    rect: { x: pw - bwThick - 2.5, y: minBz + 2.0, width: 2.2, length: Math.max(8.0, pl - minBz - 12.0) },
    elevation: 0.03,
    hasCurb: true,
    curbHeight: 0.06,
    plants: [],
  });

  // 9. SITE-AWARE POPULATION OF SHRUBS, FLOWERS & PLANTS
  const shrubs: PlantItem[] = [];
  const flowers: PlantItem[] = [];
  const trees: PlantItem[] = [];

  let plantCounter = 1;

  // Populate inside planting beds
  plantingBeds.forEach((bed) => {
    const numItems = Math.max(2, Math.floor((bed.rect.width * bed.rect.length) / 8.5));
    const isHorizontal = bed.rect.width > bed.rect.length;

    for (let pi = 0; pi < numItems; pi++) {
      const u = (pi + 0.5) / numItems;
      const px = isHorizontal ? bed.rect.x + u * bed.rect.width : bed.rect.x + bed.rect.width / 2;
      const pz = isHorizontal ? bed.rect.y + bed.rect.length / 2 : bed.rect.y + u * bed.rect.length;

      // Deterministic pseudo-random variation
      const seed = Math.sin(px * 13.7 + pz * 19.3);
      const isFlower = pi % 2 === 1;

      if (isFlower) {
        const flowerAsset =
          pi % 3 === 0 ? "flowerRed" : pi % 3 === 1 ? "flowerYellow" : "flowerPurple";
        const flowerItem: PlantItem = {
          id: `flower_${plantCounter++}`,
          type: "flower",
          assetKey: flowerAsset,
          x: px + (seed * 0.4),
          z: pz + (Math.cos(seed * 7.1) * 0.4),
          scale: 0.85 + Math.abs(seed) * 0.3,
          rotationY: seed * Math.PI,
        };
        flowers.push(flowerItem);
        bed.plants.push(flowerItem);
      } else {
        const shrubAsset = pi % 2 === 0 ? "bushDetailed" : "bush";
        const shrubItem: PlantItem = {
          id: `shrub_${plantCounter++}`,
          type: "shrub",
          assetKey: shrubAsset,
          x: px,
          z: pz,
          scale: 0.9 + Math.abs(seed) * 0.3,
          rotationY: seed * Math.PI * 2,
        };
        shrubs.push(shrubItem);
        bed.plants.push(shrubItem);
      }
    }
  });

  // Entrance Porch Accent Shrubs
  const porchShrubL = { x: doorX - 2.8, z: doorZ + 2.0 };
  const porchShrubR = { x: doorX + 2.8, z: doorZ + 2.0 };
  if (!isPointCollidingHardscape(porchShrubL.x, porchShrubL.z, 0.8)) {
    shrubs.push({
      id: `shrub_porch_L`,
      type: "shrub",
      assetKey: "bushDetailed",
      x: porchShrubL.x,
      z: porchShrubL.z,
      scale: 1.15,
      rotationY: 0.4,
    });
    flowers.push({
      id: `flower_porch_L`,
      type: "flower",
      assetKey: "flowerRed",
      x: porchShrubL.x - 0.8,
      z: porchShrubL.z + 0.4,
      scale: 0.95,
      rotationY: 1.2,
    });
  }
  if (!isPointCollidingHardscape(porchShrubR.x, porchShrubR.z, 0.8)) {
    shrubs.push({
      id: `shrub_porch_R`,
      type: "shrub",
      assetKey: "bushDetailed",
      x: porchShrubR.x,
      z: porchShrubR.z,
      scale: 1.15,
      rotationY: -0.4,
    });
    flowers.push({
      id: `flower_porch_R`,
      type: "flower",
      assetKey: "flowerYellow",
      x: porchShrubR.x + 0.8,
      z: porchShrubR.z + 0.4,
      scale: 0.95,
      rotationY: -1.2,
    });
  }

  // 10. ORNAMENTAL TREES (2–4 CANOPY TREES WITH STRICT BUILDING CLEARANCE)
  const treeCandidates: Array<{ x: number; z: number; scale: number }> = [];

  // Rear garden candidates (if setback exists)
  if (minBz > 5.0) {
    const rearZ = Math.max(3.2, minBz / 2);
    treeCandidates.push(
      { x: 5.2, z: rearZ, scale: 1.5 },
      { x: pw - 5.2, z: rearZ, scale: 1.5 }
    );
    if (pw > 45) {
      treeCandidates.push({ x: cx, z: rearZ, scale: 1.4 });
    }
  }

  // Front garden candidates (if front setback exists)
  if (pl - maxBz > 5.5) {
    const frontZ = Math.min(pl - 5.5, maxBz + (pl - maxBz) / 2);
    const lawnSideX = pkgRect.x > cx ? 5.8 : pw - 5.8;
    treeCandidates.push(
      { x: lawnSideX, z: frontZ, scale: 1.55 },
      { x: lawnSideX > cx ? lawnSideX + 6.0 : lawnSideX - 6.0, z: Math.min(pl - 5.0, frontZ + 2.0), scale: 1.35 }
    );
  }

  // Side garden candidates
  if (pw - maxBx > 6.0) {
    treeCandidates.push({ x: pw - 4.5, z: cz, scale: 1.35 });
  }
  if (minBx > 6.0 && (pkgRect.y > cz || pkgRect.x > cx)) {
    treeCandidates.push({ x: 4.5, z: cz, scale: 1.35 });
  }

  // Fallback fixed points
  if (treeCandidates.length === 0) {
    treeCandidates.push(
      { x: 5.2, z: bwThick + 3.2, scale: 1.5 },
      { x: pw - 5.2, z: bwThick + 3.2, scale: 1.5 },
      { x: pkgRect.x > cx ? 6.0 : pw - 6.0, z: pl - 6.0, scale: 1.5 }
    );
  }

  let treeCounter = 1;
  treeCandidates.forEach((cand) => {
    // Trees need generous clearance >= 2.5ft from buildings, parking, driveways, walkways
    if (!isPointCollidingHardscape(cand.x, cand.z, 2.5)) {
      const tooClose = trees.some((t) => Math.hypot(t.x - cand.x, t.z - cand.z) < 7.5);
      if (!tooClose) {
        trees.push({
          id: `tree_${treeCounter++}`,
          type: "tree",
          assetKey: "treeSmall",
          x: cand.x,
          z: cand.z,
          scale: cand.scale,
          rotationY: Math.sin(cand.x * 3.1) * Math.PI,
        });
      }
    }
  });

  // 11. OUTDOOR SITTING AREA (PATIO DECK + TABLE + CHAIRS IN REAR GARDEN)
  const outdoorFurniture: OutdoorFurnitureItem[] = [];
  const rearGardenDepth = minBz - (bwThick + 0.5);
  if (rearGardenDepth >= 7.0 && pw >= 30.0) {
    // Sizable rear yard exists -> place an elegant stone terrace deck with seating
    const patioX = cx + (pw * 0.15);
    const patioZ = bwThick + rearGardenDepth / 2;

    if (!isPointCollidingHardscape(patioX, patioZ, 3.2)) {
      outdoorFurniture.push({
        id: "deck_patio_01",
        type: "deck",
        x: patioX,
        z: patioZ,
        width: 7.0,
        length: 7.0,
        rotationY: 0,
      });
      outdoorFurniture.push({
        id: "patio_table_01",
        type: "table",
        x: patioX,
        z: patioZ,
        width: 2.2,
        length: 3.2,
        rotationY: 0,
      });
      outdoorFurniture.push({
        id: "patio_chair_01",
        type: "chair",
        x: patioX - 1.8,
        z: patioZ,
        width: 1.4,
        length: 1.4,
        rotationY: Math.PI / 2,
      });
      outdoorFurniture.push({
        id: "patio_chair_02",
        type: "chair",
        x: patioX + 1.8,
        z: patioZ,
        width: 1.4,
        length: 1.4,
        rotationY: -Math.PI / 2,
      });
    }
  }

  // 12. ARCHITECTURAL BOLLARD LIGHTS (ALONG WALKWAY & ENTRANCE)
  const bollardLights: LandscapeBollardLight[] = [];
  let lightCounter = 1;

  for (let i = 0; i < pedestrianPath.length - 1; i++) {
    const p1 = pedestrianPath[i];
    const p2 = pedestrianPath[i + 1];
    const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const perp = angle + Math.PI / 2;

    const count = Math.max(1, Math.floor(segLen / 6.0));
    for (let c = 1; c <= count; c++) {
      const t = c / (count + 1);
      const bx = p1.x + (p2.x - p1.x) * t + Math.cos(perp) * 2.2;
      const bz = p1.y + (p2.y - p1.y) * t + Math.sin(perp) * 2.2;

      bollardLights.push({
        id: `bollard_${lightCounter++}`,
        x: bx,
        z: bz,
        height: 1.8,
      });
    }
  }

  return {
    plotWidth: pw,
    plotLength: pl,
    buildingEnvelope: buildingEnv,
    parkingRect: pkgRect,
    drivewayRect,
    pedestrianPath,
    entranceDoor: { x: doorX, z: doorZ },
    lawnZones,
    plantingBeds,
    walkwaySegments,
    trees,
    shrubs,
    flowers,
    outdoorFurniture,
    bollardLights,
    boundaryWall: {
      rearWall: { x: 0, y: 0, width: pw, length: bwThick },
      leftWall: { x: 0, y: 0, width: bwThick, length: pl },
      rightWall: { x: pw - bwThick, y: 0, width: bwThick, length: pl },
      frontWallSegments,
      vehicleGate: vehGate,
      pedestrianGate: pedGate,
    },
  };
}

// ============================================================================
// THREE.JS RESIDENTIAL LANDSCAPE RENDERER (SHARED MESHES & PBR MATERIALS)
// ============================================================================

export function buildArchitecturalLandscapeScene(
  model: ArchitecturalLandscapeModel,
  materials: Record<string, THREE.Material>,
  loadedModels: Record<string, THREE.Group>,
  options: LandscapeRenderOptions = {}
): THREE.Group {
  const root = new THREE.Group();
  root.name = "ArchitecturalLandscapeRoot";

  const { filterCategory = "all", lightingPreset = "day" } = options;
  const isDusk = lightingPreset === "sunset" || lightingPreset === "night";

  const showVegetation = filterCategory === "all" || filterCategory === "vegetation";
  const showPaths = filterCategory === "all" || filterCategory === "paths";
  const showLights = filterCategory === "all" || filterCategory === "lighting";
  const showFurniture = filterCategory === "all" || filterCategory === "furniture";

  const pw = model.plotWidth;
  const pl = model.plotLength;
  const cx = pw / 2;
  const cz = pl / 2;

  // 1. AMBIENT EXTENDED GROUND (Avoids empty void around plot)
  const ambientGeo = new THREE.BoxGeometry(pw + 80, 0.2, pl + 80);
  const ambientMat = new THREE.MeshStandardMaterial({
    color: options.isDarkMode ? "#171A15" : "#3B522A",
    roughness: 0.95,
  });
  const ambientMesh = new THREE.Mesh(ambientGeo, ambientMat);
  ambientMesh.position.set(cx, -0.16, cz);
  ambientMesh.receiveShadow = true;
  root.add(ambientMesh);

  // Base Earth Bed
  const earthGeo = new THREE.BoxGeometry(pw, 0.16, pl);
  const earthMat = new THREE.MeshStandardMaterial({
    color: "#2C2018",
    roughness: 0.95,
  });
  const earthMesh = new THREE.Mesh(earthGeo, earthMat);
  earthMesh.position.set(cx, -0.06, cz);
  earthMesh.receiveShadow = true;
  root.add(earthMesh);

  // 2. DISCRETE LAWN ZONES (Structured turf sections with real grass texture)
  if (showVegetation) {
    const lawnGroup = new THREE.Group();
    lawnGroup.name = "LawnZones";

    model.lawnZones.forEach((lz) => {
      const lawnGeo = new THREE.BoxGeometry(lz.rect.width, 0.04, lz.rect.length);
      const lawnMesh = new THREE.Mesh(lawnGeo, materials.grassMat);
      lawnMesh.position.set(
        lz.rect.x + lz.rect.width / 2,
        lz.elevation,
        lz.rect.y + lz.rect.length / 2
      );
      lawnMesh.receiveShadow = true;
      lawnGroup.add(lawnMesh);
    });
    root.add(lawnGroup);
  }

  // 3. PARKING BAY & ARCHITECTURAL CARPORT PERGOLA
  if (showPaths) {
    const pkgGroup = new THREE.Group();
    pkgGroup.name = "ParkingAndCarport";
    const pr = model.parkingRect;

    // Paver Pad
    const padMesh = new THREE.Mesh(
      new THREE.BoxGeometry(pr.width, 0.04, pr.length),
      materials.paverMat
    );
    padMesh.position.set(pr.x + pr.width / 2, 0.02, pr.y + pr.length / 2);
    padMesh.receiveShadow = true;
    pkgGroup.add(padMesh);

    // Stall Demarcation Lines
    const lineMat = new THREE.MeshBasicMaterial({ color: "#F8FAFC" });
    const lineL = new THREE.Mesh(new THREE.PlaneGeometry(0.14, pr.length * 0.9), lineMat);
    lineL.rotation.x = -Math.PI / 2;
    lineL.position.set(pr.x + 0.35, 0.042, pr.y + pr.length / 2);
    const lineR = lineL.clone();
    lineR.position.x = pr.x + pr.width - 0.35;
    pkgGroup.add(lineL, lineR);

    // Modern Minimalist Pergola Carport (Steel posts + horizontal shade louvers)
    const postH = 8.5;
    const postGeo = new THREE.BoxGeometry(0.35, postH, 0.35);
    const postMat = materials.carportMat;
    const corners = [
      { x: pr.x + 0.3, z: pr.y + 0.3 },
      { x: pr.x + pr.width - 0.3, z: pr.y + 0.3 },
      { x: pr.x + 0.3, z: pr.y + pr.length - 0.3 },
      { x: pr.x + pr.width - 0.3, z: pr.y + pr.length - 0.3 },
    ];
    corners.forEach((c) => {
      const p = new THREE.Mesh(postGeo, postMat);
      p.position.set(c.x, postH / 2, c.z);
      p.castShadow = true;
      pkgGroup.add(p);
    });

    const numLouvers = 10;
    const louverW = pr.width + 0.8;
    const louverL = pr.length + 0.8;
    for (let li = 0; li < numLouvers; li++) {
      const lz = pr.y - 0.4 + (li * louverL) / (numLouvers - 1);
      const louver = new THREE.Mesh(new THREE.BoxGeometry(louverW, 0.18, 0.35), postMat);
      louver.position.set(pr.x + pr.width / 2, postH, lz);
      louver.castShadow = true;
      pkgGroup.add(louver);
    }
    root.add(pkgGroup);

    // 4. DRIVEWAY (Connecting Road Gate to Parking Pad)
    const dr = model.drivewayRect;
    const drvMesh = new THREE.Mesh(new THREE.PlaneGeometry(dr.width, dr.length), materials.paverMat);
    drvMesh.rotation.x = -Math.PI / 2;
    drvMesh.position.set(dr.x + dr.width / 2, 0.018, dr.y + dr.length / 2);
    drvMesh.receiveShadow = true;
    root.add(drvMesh);

    // Driveway Stone Curbs
    const roadSide = model.boundaryWall.roadSide || "south";
    if (roadSide === "west" || roadSide === "east") {
      const drvCurbGeo = new THREE.BoxGeometry(dr.width, 0.06, 0.2);
      const curbT = new THREE.Mesh(drvCurbGeo, materials.curbMat);
      curbT.position.set(dr.x + dr.width / 2, 0.03, dr.y - 0.1);
      const curbB = new THREE.Mesh(drvCurbGeo, materials.curbMat);
      curbB.position.set(dr.x + dr.width / 2, 0.03, dr.y + dr.length + 0.1);
      root.add(curbT, curbB);
    } else {
      const drvCurbGeo = new THREE.BoxGeometry(0.2, 0.06, dr.length);
      const curbL = new THREE.Mesh(drvCurbGeo, materials.curbMat);
      curbL.position.set(dr.x - 0.1, 0.03, dr.y + dr.length / 2);
      const curbR = new THREE.Mesh(drvCurbGeo, materials.curbMat);
      curbR.position.set(dr.x + dr.width + 0.1, 0.03, dr.y + dr.length / 2);
      root.add(curbL, curbR);
    }

    // 5. PEDESTRIAN WALKWAY (Paved with Pavers + Curbs + Junction Caps)
    const walkwayGroup = new THREE.Group();
    walkwayGroup.name = "PedestrianWalkway";

    model.walkwaySegments.forEach((seg) => {
      const dx = seg.p2.x - seg.p1.x;
      const dz = seg.p2.y - seg.p1.y;
      const segLen = Math.hypot(dx, dz);
      if (segLen < 0.2) return;

      const midX = (seg.p1.x + seg.p2.x) / 2;
      const midZ = (seg.p1.y + seg.p2.y) / 2;
      const angle = Math.atan2(dz, dx);

      const pathMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(seg.width, segLen),
        materials.paverMat
      );
      pathMesh.rotation.x = -Math.PI / 2;
      pathMesh.rotation.z = -(angle - Math.PI / 2);
      pathMesh.position.set(midX, 0.02, midZ);
      pathMesh.receiveShadow = true;
      walkwayGroup.add(pathMesh);

      // Stone curbs along walkway edges
      const curbGeo = new THREE.BoxGeometry(0.22, 0.08, segLen);
      const cL = new THREE.Mesh(curbGeo, materials.curbMat);
      const cR = new THREE.Mesh(curbGeo, materials.curbMat);
      const perp = angle + Math.PI / 2;
      const offX = Math.cos(perp) * (seg.width / 2 + 0.11);
      const offZ = Math.sin(perp) * (seg.width / 2 + 0.11);

      cL.position.set(midX + offX, 0.04, midZ + offZ);
      cL.rotation.y = -angle + Math.PI / 2;
      cR.position.set(midX - offX, 0.04, midZ - offZ);
      cR.rotation.y = -angle + Math.PI / 2;
      cL.castShadow = true;
      cR.castShadow = true;
      walkwayGroup.add(cL, cR);

      // Junction Cap
      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(seg.width / 2, seg.width / 2, 0.02, 16),
        materials.paverMat
      );
      cap.position.set(seg.p1.x, 0.02, seg.p1.y);
      cap.receiveShadow = true;
      walkwayGroup.add(cap);
    });
    root.add(walkwayGroup);
  }

  // 6. ARCHITECTURAL BOUNDARY WALL WITH GATES & COPING
  const boundaryGroup = new THREE.Group();
  boundaryGroup.name = "BoundaryWallAndGates";
  const bw = model.boundaryWall;
  const bwH = 4.2;
  const bwThick = 0.55;
  const roadSide = bw.roadSide || "south";

  const addCopedWall = (w: number, h: number, d: number, px: number, py: number, pz: number) => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials.boundaryMat);
    wall.position.set(px, py, pz);
    wall.castShadow = true;
    wall.receiveShadow = true;
    boundaryGroup.add(wall);

    const coping = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.1, 0.15, d + 0.1),
      materials.copingMat
    );
    coping.position.set(px, py + h / 2 + 0.075, pz);
    boundaryGroup.add(coping);
  };

  if (roadSide === "south") {
    // Rear Wall (North)
    addCopedWall(pw, bwH, bwThick, cx, bwH / 2, bwThick / 2);
    // Left Wall (West)
    addCopedWall(bwThick, bwH, pl, bwThick / 2, bwH / 2, cz);
    // Right Wall (East)
    addCopedWall(bwThick, bwH, pl, pw - bwThick / 2, bwH / 2, cz);
    // Front Wall Segments (South Road)
    bw.frontWallSegments.forEach((seg) => {
      addCopedWall(seg.width, bwH, bwThick, seg.x + seg.width / 2, bwH / 2, pl - bwThick / 2);
    });
  } else if (roadSide === "north") {
    // Rear Wall (South)
    addCopedWall(pw, bwH, bwThick, cx, bwH / 2, pl - bwThick / 2);
    // Left Wall (West)
    addCopedWall(bwThick, bwH, pl, bwThick / 2, bwH / 2, cz);
    // Right Wall (East)
    addCopedWall(bwThick, bwH, pl, pw - bwThick / 2, bwH / 2, cz);
    // Front Wall Segments (North Road)
    bw.frontWallSegments.forEach((seg) => {
      addCopedWall(seg.width, bwH, bwThick, seg.x + seg.width / 2, bwH / 2, bwThick / 2);
    });
  } else if (roadSide === "west") {
    // Rear Wall (East)
    addCopedWall(bwThick, bwH, pl, pw - bwThick / 2, bwH / 2, cz);
    // Top Wall (North)
    addCopedWall(pw, bwH, bwThick, cx, bwH / 2, bwThick / 2);
    // Bottom Wall (South)
    addCopedWall(pw, bwH, bwThick, cx, bwH / 2, pl - bwThick / 2);
    // Front Wall Segments (West Road)
    bw.frontWallSegments.forEach((seg) => {
      addCopedWall(bwThick, bwH, seg.length, bwThick / 2, bwH / 2, seg.y + seg.length / 2);
    });
  } else {
    // roadSide === "east"
    // Rear Wall (West)
    addCopedWall(bwThick, bwH, pl, bwThick / 2, bwH / 2, cz);
    // Top Wall (North)
    addCopedWall(pw, bwH, bwThick, cx, bwH / 2, bwThick / 2);
    // Bottom Wall (South)
    addCopedWall(pw, bwH, bwThick, cx, bwH / 2, pl - bwThick / 2);
    // Front Wall Segments (East Road)
    bw.frontWallSegments.forEach((seg) => {
      addCopedWall(bwThick, bwH, seg.length, pw - bwThick / 2, bwH / 2, seg.y + seg.length / 2);
    });
  }

  // Modern Steel Vehicle Gate (Posts & Slats)
  const vg = bw.vehicleGate;
  const vGateGroup = new THREE.Group();
  if (roadSide === "west" || roadSide === "east") {
    const gateX = roadSide === "west" ? bwThick / 2 : pw - bwThick / 2;
    vGateGroup.position.set(gateX, 0, vg.y || cz);
    vGateGroup.rotation.y = Math.PI / 2;
  } else {
    const gateZ = roadSide === "north" ? bwThick / 2 : pl - bwThick / 2;
    vGateGroup.position.set(vg.x, 0, gateZ);
  }

  const vPostGeo = new THREE.BoxGeometry(0.9, bwH + 0.4, 0.9);
  const vPostL = new THREE.Mesh(vPostGeo, materials.boundaryMat);
  vPostL.position.set(-vg.width / 2, (bwH + 0.4) / 2, 0);
  const vPostR = vPostL.clone();
  vPostR.position.x = vg.width / 2;
  vGateGroup.add(vPostL, vPostR);

  const vSlatCount = 12;
  for (let si = 0; si < vSlatCount; si++) {
    const sx = -vg.width / 2 + 0.8 + (si * (vg.width - 1.6)) / (vSlatCount - 1);
    const slat = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, bwH * 0.85, 0.08),
      materials.gateMat
    );
    slat.position.set(sx, (bwH * 0.85) / 2, 0);
    vGateGroup.add(slat);
  }
  const vBar = new THREE.Mesh(new THREE.BoxGeometry(vg.width - 1.0, 0.14, 0.1), materials.gateMat);
  vBar.position.set(0, bwH * 0.72, 0);
  vGateGroup.add(vBar);
  boundaryGroup.add(vGateGroup);

  // Pedestrian Gate (if separated)
  const pg = bw.pedestrianGate;
  const isPedSeparated = (roadSide === "west" || roadSide === "east")
    ? Math.abs((pg.y || cz) - (vg.y || cz)) > (vg.width + pg.width) / 2 + 0.5
    : Math.abs(pg.x - vg.x) > (vg.width + pg.width) / 2 + 0.8;

  if (isPedSeparated) {
    const pGateGroup = new THREE.Group();
    if (roadSide === "west" || roadSide === "east") {
      const gateX = roadSide === "west" ? bwThick / 2 : pw - bwThick / 2;
      pGateGroup.position.set(gateX, 0, pg.y || cz);
      pGateGroup.rotation.y = Math.PI / 2;
    } else {
      const gateZ = roadSide === "north" ? bwThick / 2 : pl - bwThick / 2;
      pGateGroup.position.set(pg.x, 0, gateZ);
    }

    const pPostGeo = new THREE.BoxGeometry(0.7, bwH + 0.2, 0.7);
    const pPostL = new THREE.Mesh(pPostGeo, materials.boundaryMat);
    pPostL.position.set(-pg.width / 2, (bwH + 0.2) / 2, 0);
    const pPostR = pPostL.clone();
    pPostR.position.x = pg.width / 2;
    pGateGroup.add(pPostL, pPostR);

    const pSlatCount = 6;
    for (let si = 0; si < pSlatCount; si++) {
      const sx = -pg.width / 2 + 0.6 + (si * (pg.width - 1.2)) / (pSlatCount - 1);
      const slat = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, bwH * 0.82, 0.08),
        materials.gateMat
      );
      slat.position.set(sx, (bwH * 0.82) / 2, 0);
      pGateGroup.add(slat);
    }
    boundaryGroup.add(pGateGroup);
  }
  root.add(boundaryGroup);

  // 7. STRUCTURED PLANTING BEDS (DARK MULCH + RAISED CURBS)
  if (showVegetation) {
    const bedsGroup = new THREE.Group();
    bedsGroup.name = "PlantingBeds";

    model.plantingBeds.forEach((bed) => {
      // Dark Soil Mulch Base
      const soilMesh = new THREE.Mesh(
        new THREE.BoxGeometry(bed.rect.width, 0.05, bed.rect.length),
        materials.soilMat
      );
      soilMesh.position.set(
        bed.rect.x + bed.rect.width / 2,
        bed.elevation,
        bed.rect.y + bed.rect.length / 2
      );
      soilMesh.receiveShadow = true;
      bedsGroup.add(soilMesh);

      // Stone Perimeter Curb around planting bed
      if (bed.hasCurb) {
        const curbThick = 0.15;
        const cH = bed.curbHeight;
        const cMat = materials.curbMat;

        // Front curb
        const cF = new THREE.Mesh(new THREE.BoxGeometry(bed.rect.width, cH, curbThick), cMat);
        cF.position.set(
          bed.rect.x + bed.rect.width / 2,
          cH / 2,
          bed.rect.y + bed.rect.length - curbThick / 2
        );
        // Rear curb
        const cB = new THREE.Mesh(new THREE.BoxGeometry(bed.rect.width, cH, curbThick), cMat);
        cB.position.set(
          bed.rect.x + bed.rect.width / 2,
          cH / 2,
          bed.rect.y + curbThick / 2
        );
        // Left curb
        const cL = new THREE.Mesh(new THREE.BoxGeometry(curbThick, cH, bed.rect.length), cMat);
        cL.position.set(
          bed.rect.x + curbThick / 2,
          cH / 2,
          bed.rect.y + bed.rect.length / 2
        );
        // Right curb
        const cR = new THREE.Mesh(new THREE.BoxGeometry(curbThick, cH, bed.rect.length), cMat);
        cR.position.set(
          bed.rect.x + bed.rect.width - curbThick / 2,
          cH / 2,
          bed.rect.y + bed.rect.length / 2
        );
        cF.castShadow = true;
        cB.castShadow = true;
        cL.castShadow = true;
        cR.castShadow = true;
        bedsGroup.add(cF, cB, cL, cR);
      }
    });
    root.add(bedsGroup);
  }

  // 8. VEGETATION: INSTANCED / SHARED SHRUBS, FLOWERS & CANOPY TREES
  if (showVegetation) {
    const plantsGroup = new THREE.Group();
    plantsGroup.name = "Vegetation";

    const renderPlantItem = (item: PlantItem) => {
      const modelMesh = loadedModels[item.assetKey];
      if (modelMesh) {
        const clone = modelMesh.clone(true);
        clone.scale.setScalar(item.scale);
        clone.position.set(item.x, 0, item.z);
        clone.rotation.y = item.rotationY;
        plantsGroup.add(clone);
      } else {
        // High-Quality Procedural Architectural Fallback
        if (item.type === "tree") {
          const treeGroup = new THREE.Group();
          treeGroup.position.set(item.x, 0, item.z);
          treeGroup.rotation.y = item.rotationY;

          // Realistic Trunk
          const trunkMat = new THREE.MeshStandardMaterial({ color: "#4A321E", roughness: 0.85 });
          const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.22 * item.scale, 0.36 * item.scale, 3.4 * item.scale, 8),
            trunkMat
          );
          trunk.position.y = 1.7 * item.scale;
          trunk.castShadow = true;
          treeGroup.add(trunk);

          // Multi-Layer Canopy
          const foliageMat = new THREE.MeshStandardMaterial({ color: "#2E7D32", roughness: 0.82 });
          const f1 = new THREE.Mesh(new THREE.DodecahedronGeometry(1.6 * item.scale, 1), foliageMat);
          f1.position.y = 3.6 * item.scale;
          f1.castShadow = true;
          const f2 = new THREE.Mesh(new THREE.DodecahedronGeometry(1.2 * item.scale, 1), foliageMat);
          f2.position.set(0.4 * item.scale, 4.4 * item.scale, -0.2 * item.scale);
          f2.castShadow = true;
          treeGroup.add(f1, f2);
          plantsGroup.add(treeGroup);
        } else {
          const isFlower = item.type === "flower";
          const radius = isFlower ? 0.35 * item.scale : 0.85 * item.scale;
          const colorHex =
            item.assetKey === "flowerRed"
              ? "#E11D48"
              : item.assetKey === "flowerYellow"
              ? "#F59E0B"
              : item.assetKey === "flowerPurple"
              ? "#8B5CF6"
              : "#2E7D32";

          const fallback = new THREE.Mesh(
            new THREE.SphereGeometry(radius, 8, 8),
            new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.8 })
          );
          fallback.position.set(item.x, radius * 0.9, item.z);
          fallback.castShadow = true;
          plantsGroup.add(fallback);
        }
      }
    };

    // Render shrubs, flowers, and trees
    model.shrubs.forEach(renderPlantItem);
    model.flowers.forEach(renderPlantItem);
    model.trees.forEach(renderPlantItem);

    root.add(plantsGroup);
  }

  // 9. OUTDOOR SITTING AREA (PATIO DECK + TABLE + CHAIRS)
  if (showFurniture && model.outdoorFurniture.length > 0) {
    const furnGroup = new THREE.Group();
    furnGroup.name = "OutdoorFurniture";

    const woodMat = new THREE.MeshStandardMaterial({
      color: "#5C3A21",
      roughness: 0.65,
    });
    const stoneDeckMat = new THREE.MeshStandardMaterial({
      color: "#D4D4D8",
      roughness: 0.7,
    });
    const steelMat = new THREE.MeshStandardMaterial({
      color: "#18181B",
      roughness: 0.4,
      metalness: 0.8,
    });

    model.outdoorFurniture.forEach((f) => {
      if (f.type === "deck") {
        const deck = new THREE.Mesh(new THREE.BoxGeometry(f.width, 0.05, f.length), stoneDeckMat);
        deck.position.set(f.x, 0.025, f.z);
        deck.receiveShadow = true;
        furnGroup.add(deck);
      } else if (f.type === "table") {
        const tableGroup = new THREE.Group();
        tableGroup.position.set(f.x, 0, f.z);
        tableGroup.rotation.y = f.rotationY;

        // Table top
        const top = new THREE.Mesh(new THREE.BoxGeometry(f.width, 0.1, f.length), woodMat);
        top.position.y = 1.4;
        top.castShadow = true;
        tableGroup.add(top);

        // 4 Legs
        const legGeo = new THREE.BoxGeometry(0.12, 1.4, 0.12);
        const lx = f.width / 2 - 0.2;
        const lz = f.length / 2 - 0.2;
        [
          [-lx, -lz],
          [lx, -lz],
          [-lx, lz],
          [lx, lz],
        ].forEach(([px, pz]) => {
          const leg = new THREE.Mesh(legGeo, steelMat);
          leg.position.set(px, 0.7, pz);
          leg.castShadow = true;
          tableGroup.add(leg);
        });
        furnGroup.add(tableGroup);
      } else if (f.type === "chair") {
        const chairGroup = new THREE.Group();
        chairGroup.position.set(f.x, 0, f.z);
        chairGroup.rotation.y = f.rotationY;

        // Seat
        const seat = new THREE.Mesh(new THREE.BoxGeometry(f.width, 0.08, f.length), woodMat);
        seat.position.y = 0.9;
        seat.castShadow = true;
        // Backrest
        const back = new THREE.Mesh(new THREE.BoxGeometry(f.width, 0.9, 0.08), woodMat);
        back.position.set(0, 1.35, -f.length / 2 + 0.04);
        back.castShadow = true;
        // Legs
        const legGeo = new THREE.BoxGeometry(0.08, 0.9, 0.08);
        const lx = f.width / 2 - 0.12;
        const lz = f.length / 2 - 0.12;
        [
          [-lx, -lz],
          [lx, -lz],
          [-lx, lz],
          [lx, lz],
        ].forEach(([px, pz]) => {
          const leg = new THREE.Mesh(legGeo, steelMat);
          leg.position.set(px, 0.45, pz);
          leg.castShadow = true;
          chairGroup.add(leg);
        });
        chairGroup.add(seat, back);
        furnGroup.add(chairGroup);
      }
    });
    root.add(furnGroup);
  }

  // 10. ARCHITECTURAL BOLLARD LIGHTS (ILLUMINATED AT DUSK/NIGHT)
  if (showLights) {
    const lightsGroup = new THREE.Group();
    lightsGroup.name = "LandscapeLighting";

    const bollardBodyMat = new THREE.MeshStandardMaterial({
      color: "#1E2024",
      roughness: 0.35,
      metalness: 0.85,
    });
    const bollardGlassMat = new THREE.MeshStandardMaterial({
      color: isDusk ? "#FED7AA" : "#FFFFFF",
      emissive: isDusk ? new THREE.Color("#FF8E4D") : new THREE.Color(0x000000),
      emissiveIntensity: isDusk ? 1.8 : 0.0,
      roughness: 0.1,
    });

    model.bollardLights.forEach((bl) => {
      const bGroup = new THREE.Group();
      bGroup.position.set(bl.x, 0, bl.z);

      // Post body
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.14, bl.height, 8),
        bollardBodyMat
      );
      post.position.y = bl.height / 2;
      post.castShadow = true;
      bGroup.add(post);

      // Glass cap
      const glass = new THREE.Mesh(
        new THREE.CylinderGeometry(0.13, 0.13, 0.22, 8),
        bollardGlassMat
      );
      glass.position.y = bl.height - 0.1;
      bGroup.add(glass);

      // Subtle warm point light at dusk
      if (isDusk) {
        const pLight = new THREE.PointLight(0xffb070, 0.65, 8.0, 1.8);
        pLight.position.y = bl.height;
        pLight.castShadow = false;
        bGroup.add(pLight);
      }

      lightsGroup.add(bGroup);
    });
    root.add(lightsGroup);
  }

  return root;
}
