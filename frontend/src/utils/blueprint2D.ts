/**
 * 2D Architectural Blueprint Geometry Helpers
 * Benchmark: Reference 2 (DK Home DesignX) architectural floor plan quality.
 * Provides double-face walls with openings cut out, frame jambs,
 * door leaves with dashed swing arcs, windows with glazing & chajjas,
 * dynamic direction tags, and dimension chains.
 */

import { Wall, Door, Window } from "@/types/house";

export interface WallSegment {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness: number; // in pixels
  isExterior: boolean;
  angleRad: number;
  lengthPx: number;
}

export interface WallOpeningJamb {
  x: number;
  y: number;
  nx: number; // normal x
  ny: number; // normal y
  halfThick: number;
}

export interface DoorBlueprintGeometry {
  id: string;
  label: string;
  hingeX: number;
  hingeY: number;
  latchX: number;
  latchY: number;
  leafEndX: number;
  leafEndY: number;
  arcPath: string;
  badgeX: number;
  badgeY: number;
  jambs: Array<{ x: number; y: number; angle: number }>;
}

export interface WindowBlueprintGeometry {
  id: string;
  label: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  glaze1: { x1: number; y1: number; x2: number; y2: number };
  glaze2: { x1: number; y1: number; x2: number; y2: number };
  chajjaPath: string;
  badgeX: number;
  badgeY: number;
  jambs: Array<{ x: number; y: number; angle: number }>;
}

/**
 * Split wall segments by doors and windows so that walls are physically cut out.
 */
export function computeCutWalls(
  walls: Wall[],
  doors: Door[],
  windows: Window[],
  scale: number,
  isExterior: boolean
): { segments: WallSegment[]; jambs: WallOpeningJamb[] } {
  const segments: WallSegment[] = [];
  const jambs: WallOpeningJamb[] = [];
  const wallThickness = isExterior ? 18 : 10; // Exterior 9" = 18px, Interior 4.5" = 9-10px at scale 24
  const halfThick = wallThickness / 2;

  // Combine all openings
  const openings: Array<{ id: string; x1: number; y1: number; x2: number; y2: number }> = [
    ...doors.map((d) => ({ id: d.id, x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2 })),
    ...windows.map((w) => ({ id: w.id, x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2 })),
  ];

  for (const wall of walls) {
    const wx1 = wall.x1 * scale;
    const wy1 = wall.y1 * scale;
    const wx2 = wall.x2 * scale;
    const wy2 = wall.y2 * scale;

    const dx = wx2 - wx1;
    const dy = wy2 - wy1;
    const wallLen = Math.hypot(dx, dy);

    if (wallLen < 1) continue;

    const ux = dx / wallLen;
    const uy = dy / wallLen;
    const nx = -uy;
    const ny = ux;

    // Find openings that lie on this wall
    const intervals: Array<{ start: number; end: number }> = [];

    for (const op of openings) {
      const opX1 = op.x1 * scale;
      const opY1 = op.y1 * scale;
      const opX2 = op.x2 * scale;
      const opY2 = op.y2 * scale;

      // Distance from opening mid to wall line
      const midX = (opX1 + opX2) / 2;
      const midY = (opY1 + opY2) / 2;
      const cross = Math.abs((midX - wx1) * uy - (midY - wy1) * ux);

      if (cross <= 14) {
        // Opening is on this wall line
        const proj1 = (opX1 - wx1) * ux + (opY1 - wy1) * uy;
        const proj2 = (opX2 - wx1) * ux + (opY2 - wy1) * uy;
        const s = Math.max(0, Math.min(proj1, proj2));
        const e = Math.min(wallLen, Math.max(proj1, proj2));

        if (e - s > 4) {
          intervals.push({ start: s, end: e });
        }
      }
    }

    if (intervals.length === 0) {
      // Wall has no openings, render full solid
      segments.push({
        id: wall.id,
        x1: wx1,
        y1: wy1,
        x2: wx2,
        y2: wy2,
        thickness: wallThickness,
        isExterior,
        angleRad: Math.atan2(dy, dx),
        lengthPx: wallLen,
      });
      continue;
    }

    // Sort and merge intervals
    intervals.sort((a, b) => a.start - b.start);
    const merged: Array<{ start: number; end: number }> = [];
    for (const iv of intervals) {
      if (merged.length === 0) {
        merged.push({ ...iv });
      } else {
        const last = merged[merged.length - 1];
        if (iv.start <= last.end + 2) {
          last.end = Math.max(last.end, iv.end);
        } else {
          merged.push({ ...iv });
        }
      }
    }

    // Create solid segments between openings
    let cur = 0;
    let segIdx = 0;
    for (const op of merged) {
      if (op.start - cur > 4) {
        segments.push({
          id: `${wall.id}_seg_${segIdx++}`,
          x1: wx1 + ux * cur,
          y1: wy1 + uy * cur,
          x2: wx1 + ux * op.start,
          y2: wy1 + uy * op.start,
          thickness: wallThickness,
          isExterior,
          angleRad: Math.atan2(dy, dx),
          lengthPx: op.start - cur,
        });
      }

      // Add jamb returns at opening edges
      jambs.push({
        x: wx1 + ux * op.start,
        y: wy1 + uy * op.start,
        nx,
        ny,
        halfThick,
      });
      jambs.push({
        x: wx1 + ux * op.end,
        y: wy1 + uy * op.end,
        nx,
        ny,
        halfThick,
      });

      cur = Math.max(cur, op.end);
    }

    if (wallLen - cur > 4) {
      segments.push({
        id: `${wall.id}_seg_${segIdx++}`,
        x1: wx1 + ux * cur,
        y1: wy1 + uy * cur,
        x2: wx2,
        y2: wy2,
        thickness: wallThickness,
        isExterior,
        angleRad: Math.atan2(dy, dx),
        lengthPx: wallLen - cur,
      });
    }
  }

  return { segments, jambs };
}

/**
 * Compute architectural door geometry (leaf, circular swing arc, frame jambs, direction label)
 */
export function computeDoorGeometry(
  door: Door,
  index: number,
  scale: number
): DoorBlueprintGeometry {
  const x1 = door.x1 * scale;
  const y1 = door.y1 * scale;
  const x2 = door.x2 * scale;
  const y2 = door.y2 * scale;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const doorWidth = Math.max(20, Math.hypot(dx, dy));

  // Unit vectors along wall opening and normal
  const ux = dx / (doorWidth || 1);
  const uy = dy / (doorWidth || 1);

  // Normal vector pointing into the room / swing side
  let nx = -uy;
  let ny = ux;

  // If outward_direction is specified or swing is inverted
  if (door.outward_direction === "N" || door.outward_direction === "W") {
    // orient normal consistently
  }

  // Hinge is at (x1, y1), latch at (x2, y2)
  const hx = x1;
  const hy = y1;
  const lx = x2;
  const ly = y2;

  // Open door leaf rotates 90 degrees perpendicular to opening
  // leafEnd = hinge + normal * doorWidth
  const leafEndX = hx + nx * doorWidth;
  const leafEndY = hy + ny * doorWidth;

  // Arc path from leaf end to latch
  // SVG arc: A rx ry x-axis-rotation large-arc-flag sweep-flag x y
  const arcPath = `M ${leafEndX} ${leafEndY} A ${doorWidth} ${doorWidth} 0 0 0 ${lx} ${ly}`;

  // Direction label
  const cardinal = door.direction_label || (door.outward_direction ? `${door.id} · ${door.outward_direction}` : `${door.id || `D0${index + 1}`}`);

  // Label position: placed slightly offset along normal from mid-opening
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const badgeX = midX + nx * 18;
  const badgeY = midY + ny * 18;

  const jambs = [
    { x: x1, y: y1, angle: Math.atan2(dy, dx) },
    { x: x2, y: y2, angle: Math.atan2(dy, dx) },
  ];

  return {
    id: door.id || `door_${index}`,
    label: cardinal,
    hingeX: hx,
    hingeY: hy,
    latchX: lx,
    latchY: ly,
    leafEndX,
    leafEndY,
    arcPath,
    badgeX,
    badgeY,
    jambs,
  };
}

/**
 * Compute architectural window geometry (frame, double glazing lines, chajja projection, direction label)
 */
export function computeWindowGeometry(
  win: Window,
  index: number,
  scale: number
): WindowBlueprintGeometry {
  const x1 = win.x1 * scale;
  const y1 = win.y1 * scale;
  const x2 = win.x2 * scale;
  const y2 = win.y2 * scale;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const winWidth = Math.max(20, Math.hypot(dx, dy));

  const ux = dx / (winWidth || 1);
  const uy = dy / (winWidth || 1);

  // Exterior normal vector (pointing out from building envelope)
  let nx = -uy;
  let ny = ux;

  // Invert normal if facing South or East depending on outward direction
  if (win.outward_direction === "S" && ny < 0) {
    nx = -nx;
    ny = -ny;
  } else if (win.outward_direction === "N" && ny > 0) {
    nx = -nx;
    ny = -ny;
  } else if (win.outward_direction === "E" && nx < 0) {
    nx = -nx;
    ny = -ny;
  } else if (win.outward_direction === "W" && nx > 0) {
    nx = -nx;
    ny = -ny;
  }

  // Glazing offset: 2 parallel lines 2.5px apart centered on wall axis
  const gOff = 2.0;
  const glaze1 = {
    x1: x1 + nx * gOff,
    y1: y1 + ny * gOff,
    x2: x2 + nx * gOff,
    y2: y2 + ny * gOff,
  };
  const glaze2 = {
    x1: x1 - nx * gOff,
    y1: y1 - ny * gOff,
    x2: x2 - nx * gOff,
    y2: y2 - ny * gOff,
  };

  // Chajja (sunshade projection): 1.5 ft (36px) cantilever overhang with 6" (12px) side extensions
  const chajjaDepth = 1.5 * scale;
  const chajjaExt = 0.5 * scale;
  const c1x = x1 - ux * chajjaExt + nx * chajjaDepth;
  const c1y = y1 - uy * chajjaExt + ny * chajjaDepth;
  const c2x = x2 + ux * chajjaExt + nx * chajjaDepth;
  const c2y = y2 + uy * chajjaExt + ny * chajjaDepth;
  const cWall1x = x1 - ux * chajjaExt;
  const cWall1y = y1 - uy * chajjaExt;
  const cWall2x = x2 + ux * chajjaExt;
  const cWall2y = y2 + uy * chajjaExt;

  const chajjaPath = `M ${cWall1x} ${cWall1y} L ${c1x} ${c1y} L ${c2x} ${c2y} L ${cWall2x} ${cWall2y}`;

  // Label badge
  const label = win.direction_label || (win.outward_direction ? `${win.id} · ${win.outward_direction}` : `${win.id || `W0${index + 1}`}`);

  // Label position outside the window beyond chajja
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const badgeX = midX + nx * (chajjaDepth + 14);
  const badgeY = midY + ny * (chajjaDepth + 14);

  const jambs = [
    { x: x1, y: y1, angle: Math.atan2(dy, dx) },
    { x: x2, y: y2, angle: Math.atan2(dy, dx) },
  ];

  return {
    id: win.id || `window_${index}`,
    label,
    x1,
    y1,
    x2,
    y2,
    glaze1,
    glaze2,
    chajjaPath,
    badgeX,
    badgeY,
    jambs,
  };
}

/**
 * Plot dimension chain generator
 */
export function generateDimensionChains(
  plotWidth: number,
  plotLength: number,
  scale: number
) {
  const wPx = plotWidth * scale;
  const hPx = plotLength * scale;
  const tickSize = 6;
  const topOffset = -42;
  const leftOffset = -42;

  return {
    top: {
      x1: 0,
      y1: topOffset,
      x2: wPx,
      y2: topOffset,
      text: `${plotWidth}'-0" [${(plotWidth * 0.3048).toFixed(2)}m]`,
      textX: wPx / 2,
      textY: topOffset - 6,
      ext1: { x1: 0, y1: 0, x2: 0, y2: topOffset - 4 },
      ext2: { x1: wPx, y1: 0, x2: wPx, y2: topOffset - 4 },
      tick1: { x1: -tickSize, y1: topOffset + tickSize, x2: tickSize, y2: topOffset - tickSize },
      tick2: { x1: wPx - tickSize, y1: topOffset + tickSize, x2: wPx + tickSize, y2: topOffset - tickSize },
    },
    left: {
      x1: leftOffset,
      y1: 0,
      x2: leftOffset,
      y2: hPx,
      text: `${plotLength}'-0" [${(plotLength * 0.3048).toFixed(2)}m]`,
      textX: leftOffset - 8,
      textY: hPx / 2,
      ext1: { x1: 0, y1: 0, x2: leftOffset - 4, y2: 0 },
      ext2: { x1: 0, y1: hPx, x2: leftOffset - 4, y2: hPx },
      tick1: { x1: leftOffset - tickSize, y1: tickSize, x2: leftOffset + tickSize, y2: -tickSize },
      tick2: { x1: leftOffset - tickSize, y1: hPx + tickSize, x2: leftOffset + tickSize, y2: hPx - tickSize },
    },
  };
}
