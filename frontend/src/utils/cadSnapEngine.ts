import { Point2D, Wall, Room } from "@/types/house";
import { distanceWorld } from "./cadCoordinates";

export type SnapType =
  | "endpoint"
  | "midpoint"
  | "intersection"
  | "orthogonal"
  | "wall_centerline"
  | "room_corner"
  | "grid";

export interface SnapTarget {
  point: Point2D;
  type: SnapType;
  label?: string;
  sourceEntityId?: string;
  guide?: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    orientation: "h" | "v" | "align";
  };
}

export interface SnapResult {
  point: Point2D;
  snapped: boolean;
  type?: SnapType;
  label?: string;
  guide?: SnapTarget["guide"];
}

export interface SnapEngineOptions {
  snapRadiusFeet?: number; // Distance in feet to trigger snap (default 0.75 ft)
  gridStepFeet?: number;   // Grid step in feet (default 0.5 ft)
  enableGrid?: boolean;
  enableEndpoints?: boolean;
  enableMidpoints?: boolean;
  enableIntersections?: boolean;
  enableOrthogonal?: boolean;
  enableWallCenterline?: boolean;
  enableRoomCorners?: boolean;
  referencePoint?: Point2D; // For orthogonal snapping (relative to start point)
  excludedWallId?: string;
  excludedEndpoint?: Point2D;
}

/**
 * High-performance Parametric CAD Snap Engine
 */
export class CadSnapEngine {
  /**
   * Evaluates candidate snap targets and returns the best snap point.
   */
  public static snap(
    rawPoint: Point2D,
    walls: Wall[],
    rooms: Room[],
    options: SnapEngineOptions = {}
  ): SnapResult {
    const {
      snapRadiusFeet = 0.75,
      gridStepFeet = 0.5,
      enableGrid = true,
      enableEndpoints = true,
      enableMidpoints = true,
      enableIntersections = true,
      enableOrthogonal = true,
      enableRoomCorners = true,
      referencePoint,
      excludedWallId,
      excludedEndpoint,
    } = options;

    let bestCandidate: SnapTarget | null = null;
    let minDistance = snapRadiusFeet;

    // 1. Orthogonal Snapping (relative to drawing reference point)
    if (enableOrthogonal && referencePoint) {
      const dx = Math.abs(rawPoint.x - referencePoint.x);
      const dy = Math.abs(rawPoint.y - referencePoint.y);

      // Snap to horizontal line (y = referencePoint.y)
      if (dy <= snapRadiusFeet) {
        const candidate: SnapTarget = {
          point: { x: rawPoint.x, y: referencePoint.y },
          type: "orthogonal",
          label: "Horizontal (0°)",
          guide: {
            x1: Math.min(referencePoint.x, rawPoint.x) - 5,
            y1: referencePoint.y,
            x2: Math.max(referencePoint.x, rawPoint.x) + 5,
            y2: referencePoint.y,
            orientation: "h",
          },
        };
        const dist = dy;
        if (dist < minDistance) {
          minDistance = dist;
          bestCandidate = candidate;
        }
      }

      // Snap to vertical line (x = referencePoint.x)
      if (dx <= snapRadiusFeet) {
        const candidate: SnapTarget = {
          point: { x: referencePoint.x, y: rawPoint.y },
          type: "orthogonal",
          label: "Vertical (90°)",
          guide: {
            x1: referencePoint.x,
            y1: Math.min(referencePoint.y, rawPoint.y) - 5,
            x2: referencePoint.x,
            y2: Math.max(referencePoint.y, rawPoint.y) + 5,
            orientation: "v",
          },
        };
        const dist = dx;
        if (dist < minDistance) {
          minDistance = dist;
          bestCandidate = candidate;
        }
      }
    }

    // 2. Wall Endpoints & Midpoints
    for (const wall of walls) {
      if (wall.id === excludedWallId) continue;

      const p1: Point2D = { x: wall.x1, y: wall.y1 };
      const p2: Point2D = { x: wall.x2, y: wall.y2 };

      if (enableEndpoints) {
        // Start endpoint
        if (!excludedEndpoint || distanceWorld(p1, excludedEndpoint) > 0.1) {
          const d1 = distanceWorld(rawPoint, p1);
          if (d1 < minDistance) {
            minDistance = d1;
            bestCandidate = {
              point: p1,
              type: "endpoint",
              label: "Endpoint",
              sourceEntityId: wall.id,
            };
          }
        }

        // End endpoint
        if (!excludedEndpoint || distanceWorld(p2, excludedEndpoint) > 0.1) {
          const d2 = distanceWorld(rawPoint, p2);
          if (d2 < minDistance) {
            minDistance = d2;
            bestCandidate = {
              point: p2,
              type: "endpoint",
              label: "Endpoint",
              sourceEntityId: wall.id,
            };
          }
        }
      }

      if (enableMidpoints) {
        const mid: Point2D = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        const dMid = distanceWorld(rawPoint, mid);
        if (dMid < minDistance) {
          minDistance = dMid;
          bestCandidate = {
            point: mid,
            type: "midpoint",
            label: "Midpoint",
            sourceEntityId: wall.id,
          };
        }
      }
    }

    // 3. Room Corner Snapping
    if (enableRoomCorners) {
      for (const room of rooms) {
        if (!room.rect) continue;
        const corners: Point2D[] = [
          { x: room.rect.x, y: room.rect.y },
          { x: room.rect.x + room.rect.width, y: room.rect.y },
          { x: room.rect.x, y: room.rect.y + room.rect.length },
          { x: room.rect.x + room.rect.width, y: room.rect.y + room.rect.length },
        ];
        for (const corner of corners) {
          const d = distanceWorld(rawPoint, corner);
          if (d < minDistance) {
            minDistance = d;
            bestCandidate = {
              point: corner,
              type: "room_corner",
              label: "Room Corner",
              sourceEntityId: room.id,
            };
          }
        }
      }
    }

    // 4. Wall Intersections
    if (enableIntersections && walls.length > 1) {
      for (let i = 0; i < walls.length; i++) {
        if (walls[i].id === excludedWallId) continue;
        for (let j = i + 1; j < walls.length; j++) {
          if (walls[j].id === excludedWallId) continue;
          const inter = getSegmentIntersection(
            { x: walls[i].x1, y: walls[i].y1 },
            { x: walls[i].x2, y: walls[i].y2 },
            { x: walls[j].x1, y: walls[j].y1 },
            { x: walls[j].x2, y: walls[j].y2 }
          );
          if (inter) {
            const d = distanceWorld(rawPoint, inter);
            if (d < minDistance) {
              minDistance = d;
              bestCandidate = {
                point: inter,
                type: "intersection",
                label: "Intersection",
              };
            }
          }
        }
      }
    }

    // If an object snap matched within tolerance, return it!
    if (bestCandidate) {
      return {
        point: bestCandidate.point,
        snapped: true,
        type: bestCandidate.type,
        label: bestCandidate.label,
        guide: bestCandidate.guide,
      };
    }

    // 5. Grid Snapping fallback
    if (enableGrid && gridStepFeet > 0) {
      const snappedGrid: Point2D = {
        x: Math.round(rawPoint.x / gridStepFeet) * gridStepFeet,
        y: Math.round(rawPoint.y / gridStepFeet) * gridStepFeet,
      };
      return {
        point: snappedGrid,
        snapped: true,
        type: "grid",
        label: "Grid",
      };
    }

    return {
      point: rawPoint,
      snapped: false,
    };
  }

  /**
   * Projects a world point directly onto the nearest wall centerline within range.
   */
  public static projectToNearestWall(
    point: Point2D,
    walls: Wall[],
    maxDistanceFeet: number = 1.0
  ): { wall: Wall; projectedPoint: Point2D; distance: number; t: number } | null {
    let nearestWall: Wall | null = null;
    let minDistance = maxDistanceFeet;
    let bestProj: Point2D = point;
    let bestT = 0;

    for (const wall of walls) {
      const dx = wall.x2 - wall.x1;
      const dy = wall.y2 - wall.y1;
      const lenSq = dx * dx + dy * dy;
      if (lenSq < 0.01) continue;

      const t = Math.max(0, Math.min(1, ((point.x - wall.x1) * dx + (point.y - wall.y1) * dy) / lenSq));
      const proj: Point2D = {
        x: wall.x1 + t * dx,
        y: wall.y1 + t * dy,
      };
      const dist = distanceWorld(point, proj);

      if (dist < minDistance) {
        minDistance = dist;
        nearestWall = wall;
        bestProj = proj;
        bestT = t;
      }
    }

    if (nearestWall) {
      return {
        wall: nearestWall,
        projectedPoint: bestProj,
        distance: minDistance,
        t: bestT,
      };
    }
    return null;
  }
}

/**
 * Math helper to calculate intersection point between two line segments.
 */
function getSegmentIntersection(
  p1: Point2D,
  p2: Point2D,
  p3: Point2D,
  p4: Point2D
): Point2D | null {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (Math.abs(d) < 1e-6) return null; // Parallel or colinear

  const u = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  const v = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;

  if (u >= -0.05 && u <= 1.05 && v >= -0.05 && v <= 1.05) {
    return {
      x: p1.x + u * (p2.x - p1.x),
      y: p1.y + u * (p2.y - p1.y),
    };
  }
  return null;
}
