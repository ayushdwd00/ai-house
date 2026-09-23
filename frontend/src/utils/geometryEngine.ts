import { Room, Wall, Door, WindowItem, Rect, Point2D, Site, FurnitureItem } from "@/types/house";

/**
 * Deterministic Client-Side Architectural Geometry Engine
 * Implements deduplicated shared walls, wall openings, room bounds clamping,
 * and North-referenced architectural door & window orientation.
 */

export function deriveDirectionLabel(x1: number, y1: number, x2: number, y2: number, northDeg: number = 0): "N" | "S" | "E" | "W" {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;

  // Normal vector facing outwards (assuming counter-clockwise or outward convention)
  let nx = -dy;
  let ny = dx;
  const len = Math.hypot(nx, ny) || 1;
  nx /= len;
  ny /= len;

  // Rotate by northDeg if supplied
  const rad = (northDeg * Math.PI) / 180;
  const rx = nx * Math.cos(rad) - ny * Math.sin(rad);
  const ry = nx * Math.sin(rad) + ny * Math.cos(rad);

  if (Math.abs(rx) > Math.abs(ry)) {
    return rx > 0 ? "E" : "W";
  } else {
    return ry > 0 ? "S" : "N"; // In SVG Y is downwards (South)
  }
}

/**
 * Constructs a unified, deduplicated global wall network from room rectangles.
 * Shared interior walls exist exactly once.
 */
export function generateCanonicalWallNetwork(
  rooms: Room[],
  site?: Site,
  wallHeight: number = 9.5
): { walls: Wall[]; exteriorWalls: Wall[]; interiorWalls: Wall[] } {
  const walls: Wall[] = [];
  let wallCounter = 1;

  const extThickness = 0.75;  // 9 inches standard exterior masonry
  const intThickness = 0.375; // 4.5 inches standard interior partition

  const hLines: Record<number, Array<{ start: number; end: number; roomId: string }>> = {};
  const vLines: Record<number, Array<{ start: number; end: number; roomId: string }>> = {};

  const snap = (v: number) => Math.round(v * 4) / 4; // 0.25' grid snap

  rooms.forEach((r) => {
    if (!r.rect) return;
    const rx = snap(r.rect.x);
    const ry = snap(r.rect.y);
    const rw = snap(r.rect.width);
    const rl = snap(r.rect.length);
    const rx2 = rx + rw;
    const ry2 = ry + rl;

    // Top & bottom horizontal edges
    (hLines[ry] = hLines[ry] || []).push({ start: rx, end: rx2, roomId: r.id });
    (hLines[ry2] = hLines[ry2] || []).push({ start: rx, end: rx2, roomId: r.id });

    // Left & right vertical edges
    (vLines[rx] = vLines[rx] || []).push({ start: ry, end: ry2, roomId: r.id });
    (vLines[rx2] = vLines[rx2] || []).push({ start: ry, end: ry2, roomId: r.id });
  });

  const resolveLineSegments = (
    lineVal: number,
    rawSegs: Array<{ start: number; end: number; roomId: string }>,
    isHorizontal: boolean
  ) => {
    const pts = new Set<number>();
    rawSegs.forEach((s) => {
      pts.add(s.start);
      pts.add(s.end);
    });
    const sortedPts = Array.from(pts).sort((a, b) => a - b);

    for (let i = 0; i < sortedPts.length - 1; i++) {
      const p1 = sortedPts[i];
      const p2 = sortedPts[i + 1];
      if (p2 - p1 < 0.2) continue; // Ignore sub-inch slivers

      const mid = (p1 + p2) / 2;
      const touchingRooms = new Set<string>();
      rawSegs.forEach((s) => {
        if (s.start <= mid && mid <= s.end) {
          touchingRooms.add(s.roomId);
        }
      });

      if (touchingRooms.size === 0) continue;

      const rIds = Array.from(touchingRooms);
      const isInterior = rIds.length >= 2;
      const thickness = isInterior ? intThickness : extThickness;
      const wType = isInterior ? "interior" : "exterior";

      const x1 = isHorizontal ? p1 : lineVal;
      const y1 = isHorizontal ? lineVal : p1;
      const x2 = isHorizontal ? p2 : lineVal;
      const y2 = isHorizontal ? lineVal : p2;

      const wId = `w_${wallCounter.toString().padStart(3, "0")}`;
      wallCounter++;

      const wLen = p2 - p1;
      walls.push({
        id: wId,
        wall_id: wId,
        x1,
        y1,
        x2,
        y2,
        start: { x: x1, y: y1 },
        end: { x: x2, y: y2 },
        thickness,
        height: wallHeight,
        wall_type: wType,
        is_exterior: !isInterior,
        adjacent_room_ids: rIds,
        room_ids: rIds,
        connected_room_ids: rIds,
        wall_direction: isHorizontal ? "horizontal" : "vertical",
        volume_cuft: Math.round(wLen * wallHeight * thickness * 10) / 10,
        net_surface_area_sqft: Math.round(wLen * wallHeight * 10) / 10,
      });
    }
  };

  Object.entries(hLines).forEach(([yStr, segs]) => {
    resolveLineSegments(Number(yStr), segs, true);
  });

  Object.entries(vLines).forEach(([xStr, segs]) => {
    resolveLineSegments(Number(xStr), segs, false);
  });

  const exteriorWalls = walls.filter((w) => w.is_exterior);
  const interiorWalls = walls.filter((w) => !w.is_exterior);

  return { walls, exteriorWalls, interiorWalls };
}

/**
 * Re-associates existing doors and windows with newly generated walls,
 * ensuring doors contain valid hinge, swing, and directional codes.
 */
export function synchronizeOpeningsWithWalls(
  doors: Door[],
  windows: WindowItem[],
  walls: Wall[],
  northDeg: number = 0
): { doors: Door[]; windows: WindowItem[] } {
  const updatedDoors = doors.map((d, idx) => {
    const dmx = (d.x1 + d.x2) / 2;
    const dmz = (d.y1 + d.y2) / 2;

    // Find closest wall
    let hostWall: Wall | undefined;
    let minDist = Infinity;

    for (const w of walls) {
      const dist = pointToSegmentDistance(dmx, dmz, w.x1, w.y1, w.x2, w.y2);
      if (dist < minDist) {
        minDist = dist;
        hostWall = w;
      }
    }

    const dirCode = deriveDirectionLabel(d.x1, d.y1, d.x2, d.y2, northDeg);
    const doorNumber = `D${(idx + 1).toString().padStart(2, "0")}`;
    const orientation: "north" | "south" | "east" | "west" =
      dirCode === "N" ? "north" : dirCode === "S" ? "south" : dirCode === "E" ? "east" : "west";

    return {
      ...d,
      wall_id: hostWall?.id || d.wall_id,
      host_wall_id: hostWall?.id || d.wall_id,
      direction_label: `${doorNumber} · ${dirCode}`,
      orientation,
    };
  });

  const updatedWindows: WindowItem[] = windows.map((w, idx) => {
    const wmx = (w.x1 + w.x2) / 2;
    const wmz = (w.y1 + w.y2) / 2;

    let hostWall: Wall | undefined;
    let minDist = Infinity;

    for (const wall of walls) {
      const dist = pointToSegmentDistance(wmx, wmz, wall.x1, wall.y1, wall.x2, wall.y2);
      if (dist < minDist) {
        minDist = dist;
        hostWall = wall;
      }
    }

    const dirCode = deriveDirectionLabel(w.x1, w.y1, w.x2, w.y2, northDeg);
    const winNumber = `W${(idx + 1).toString().padStart(2, "0")}`;
    const orientation: "north" | "south" | "east" | "west" =
      dirCode === "N" ? "north" : dirCode === "S" ? "south" : dirCode === "E" ? "east" : "west";

    return {
      ...w,
      wall_id: hostWall?.id || w.wall_id,
      host_wall_id: hostWall?.id || w.wall_id,
      direction_label: `${winNumber} · ${dirCode}`,
      orientation,
    };
  });

  return { doors: updatedDoors, windows: updatedWindows };
}

function pointToSegmentDistance(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);

  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(px - projX, py - projY);
}
