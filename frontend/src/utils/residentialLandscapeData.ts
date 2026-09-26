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
