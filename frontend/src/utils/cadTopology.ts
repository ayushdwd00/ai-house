import { Wall, Room, Door, WindowItem, FloorPlan, Point2D } from "@/types/house";
import { distanceWorld } from "./cadCoordinates";

export interface WallMoveTopologyResult {
  updatedFloor: FloorPlan;
  affectedRoomIds: string[];
  warnings?: string[];
  isValid: boolean;
  errorMessage?: string;
}

export interface WallDeleteDependencyCheck {
  canDeleteDirectly: boolean;
  wall: Wall;
  doors: Door[];
  windows: WindowItem[];
  adjacentRooms: Room[];
  summaryMessage: string;
}

/**
 * Clamps furniture items so they stay safely inside room bounds without teleporting.
 */
export function clampFurnitureToRoom(room: Room): Room {
  if (!room.rect || !room.furniture || room.furniture.length === 0) return room;
  const rw = room.rect.width;
  const rl = room.rect.length;
  const rx = room.rect.x;
  const ry = room.rect.y;

  const clampedFurniture = room.furniture.map((item) => {
    const halfW = Math.min(item.width / 2, rw / 2);
    const halfL = Math.min((item.depth || item.length || 2) / 2, rl / 2);
    const safeMinX = rx + halfW;
    const safeMaxX = rx + rw - halfW;
    const safeMinY = ry + halfL;
    const safeMaxY = ry + rl - halfL;

    return {
      ...item,
      x: Math.max(safeMinX, Math.min(safeMaxX, item.x)),
      y: Math.max(safeMinY, Math.min(safeMaxY, item.y)),
    };
  });

  return {
    ...room,
    furniture: clampedFurniture,
  };
}

/**
 * Moves a wall by (deltaX, deltaY) while preserving architectural topology:
 * 1. Translates the target wall.
 * 2. Stretches/contracts connected perpendicular walls.
 * 3. Adjusts boundary rects of adjacent rooms.
 * 4. Translates all attached doors and windows.
 * 5. Re-clamps furniture inside resized rooms.
 */
export function applyWallMovementTopology(
  floor: FloorPlan,
  wallId: string,
  deltaX: number,
  deltaY: number,
  plotWidth: number = 50,
  plotLength: number = 70
): WallMoveTopologyResult {
  const allWalls: Wall[] = [...(floor.exterior_walls || []), ...(floor.interior_walls || [])];
  const targetWall = allWalls.find((w) => w.id === wallId);

  if (!targetWall) {
    return {
      updatedFloor: floor,
      affectedRoomIds: [],
      isValid: false,
      errorMessage: "Wall not found.",
    };
  }

  const isHorizontal = Math.abs(targetWall.y1 - targetWall.y2) < 0.2;
  const isVertical = Math.abs(targetWall.x1 - targetWall.x2) < 0.2;

  // Enforce pure orthogonal displacement for CAD walls
  const effectiveDx = isHorizontal ? 0 : deltaX;
  const effectiveDy = isVertical ? 0 : deltaY;

  if (Math.abs(effectiveDx) < 0.001 && Math.abs(effectiveDy) < 0.001) {
    return {
      updatedFloor: floor,
      affectedRoomIds: [],
      isValid: true,
    };
  }

  // Pre-calculate target endpoints
  const newWallX1 = targetWall.x1 + effectiveDx;
  const newWallY1 = targetWall.y1 + effectiveDy;
  const newWallX2 = targetWall.x2 + effectiveDx;
  const newWallY2 = targetWall.y2 + effectiveDy;

  // Boundary check against plot
  if (
    Math.min(newWallX1, newWallX2) < 0 ||
    Math.min(newWallY1, newWallY2) < 0 ||
    Math.max(newWallX1, newWallX2) > plotWidth ||
    Math.max(newWallY1, newWallY2) > plotLength
  ) {
    return {
      updatedFloor: floor,
      affectedRoomIds: [],
      isValid: false,
      errorMessage: "Wall cannot be moved beyond the plot boundary.",
    };
  }

  const affectedRoomIds: string[] = [];
  const vertexTol = 0.35; // Tolerance for endpoint connection

  // 1. Update walls: translate target wall and stretch connected perpendicular walls
  const updateWallEntity = (w: Wall): Wall => {
    if (w.id === wallId) {
      return {
        ...w,
        x1: newWallX1,
        y1: newWallY1,
        x2: newWallX2,
        y2: newWallY2,
        start: { x: newWallX1, y: newWallY1 },
        end: { x: newWallX2, y: newWallY2 },
      };
    }

    // Check if this other wall connects to targetWall at its endpoints
    let modified = false;
    let wx1 = w.x1;
    let wy1 = w.y1;
    let wx2 = w.x2;
    let wy2 = w.y2;

    const connectsToStart =
      Math.hypot(w.x1 - targetWall.x1, w.y1 - targetWall.y1) < vertexTol ||
      Math.hypot(w.x2 - targetWall.x1, w.y2 - targetWall.y1) < vertexTol;

    const connectsToEnd =
      Math.hypot(w.x1 - targetWall.x2, w.y1 - targetWall.y2) < vertexTol ||
      Math.hypot(w.x2 - targetWall.x2, w.y2 - targetWall.y2) < vertexTol;

    if (isHorizontal) {
      // Target wall is horizontal, moving in Y (effectiveDy)
      // Perpendicular walls are vertical and their touching Y endpoint should move
      if (Math.abs(w.y1 - targetWall.y1) < vertexTol && (connectsToStart || connectsToEnd || (w.x1 >= Math.min(targetWall.x1, targetWall.x2) - vertexTol && w.x1 <= Math.max(targetWall.x1, targetWall.x2) + vertexTol))) {
        wy1 += effectiveDy;
        modified = true;
      }
      if (Math.abs(w.y2 - targetWall.y1) < vertexTol && (connectsToStart || connectsToEnd || (w.x2 >= Math.min(targetWall.x1, targetWall.x2) - vertexTol && w.x2 <= Math.max(targetWall.x1, targetWall.x2) + vertexTol))) {
        wy2 += effectiveDy;
        modified = true;
      }
    } else {
      // Target wall is vertical, moving in X (effectiveDx)
      // Perpendicular walls are horizontal and their touching X endpoint should move
      if (Math.abs(w.x1 - targetWall.x1) < vertexTol && (connectsToStart || connectsToEnd || (w.y1 >= Math.min(targetWall.y1, targetWall.y2) - vertexTol && w.y1 <= Math.max(targetWall.y1, targetWall.y2) + vertexTol))) {
        wx1 += effectiveDx;
        modified = true;
      }
      if (Math.abs(w.x2 - targetWall.x1) < vertexTol && (connectsToStart || connectsToEnd || (w.y2 >= Math.min(targetWall.y1, targetWall.y2) - vertexTol && w.y2 <= Math.max(targetWall.y1, targetWall.y2) + vertexTol))) {
        wx2 += effectiveDx;
        modified = true;
      }
    }

    if (modified) {
      return {
        ...w,
        x1: wx1,
        y1: wy1,
        x2: wx2,
        y2: wy2,
        start: { x: wx1, y: wy1 },
        end: { x: wx2, y: wy2 },
      };
    }
    return w;
  };

  const nextExtWalls = (floor.exterior_walls || []).map(updateWallEntity);
  const nextIntWalls = (floor.interior_walls || []).map(updateWallEntity);

  // 2. Adjust Rooms bounded by this wall
  const nextRooms: Room[] = (floor.rooms || []).map((rm) => {
    if (!rm.rect) return rm;

    let rx = rm.rect.x;
    let ry = rm.rect.y;
    let rw = rm.rect.width;
    let rl = rm.rect.length;
    let changed = false;

    const wallMinX = Math.min(targetWall.x1, targetWall.x2);
    const wallMaxX = Math.max(targetWall.x1, targetWall.x2);
    const wallMinY = Math.min(targetWall.y1, targetWall.y2);
    const wallMaxY = Math.max(targetWall.y1, targetWall.y2);

    if (isHorizontal) {
      const wallY = targetWall.y1;
      // Overlaps along X span
      const overlapsX = Math.max(rx, wallMinX) < Math.min(rx + rw, wallMaxX) + 0.2;

      if (overlapsX) {
        // Wall is the bottom edge of this room
        if (Math.abs((ry + rl) - wallY) < vertexTol) {
          rl = rl + effectiveDy;
          changed = true;
        }
        // Wall is the top edge of this room
        else if (Math.abs(ry - wallY) < vertexTol) {
          ry = ry + effectiveDy;
          rl = rl - effectiveDy;
          changed = true;
        }
      }
    } else {
      const wallX = targetWall.x1;
      // Overlaps along Y span
      const overlapsY = Math.max(ry, wallMinY) < Math.min(ry + rl, wallMaxY) + 0.2;

      if (overlapsY) {
        // Wall is the right edge of this room
        if (Math.abs((rx + rw) - wallX) < vertexTol) {
          rw = rw + effectiveDx;
          changed = true;
        }
        // Wall is the left edge of this room
        else if (Math.abs(rx - wallX) < vertexTol) {
          rx = rx + effectiveDx;
          rw = rw - effectiveDx;
          changed = true;
        }
      }
    }

    if (changed) {
      affectedRoomIds.push(rm.id);
      const updatedRoom: Room = {
        ...rm,
        rect: {
          x: Math.round(rx * 4) / 4,
          y: Math.round(ry * 4) / 4,
          width: Math.round(rw * 4) / 4,
          length: Math.round(rl * 4) / 4,
        },
        area_sqft: Math.round(rw * rl),
      };
      return clampFurnitureToRoom(updatedRoom);
    }
    return rm;
  });

  // Validate room dimensions (minimum 3.5ft)
  for (const r of nextRooms) {
    if (r.rect && (r.rect.width < 3.5 || r.rect.length < 3.5)) {
      return {
        updatedFloor: floor,
        affectedRoomIds,
        isValid: false,
        errorMessage: `Moving this wall makes ${r.name || "a room"} smaller than the minimum architectural size (3.5 ft).`,
      };
    }
  }

  // 3. Translate attached Doors and Windows
  const nextDoors = (floor.doors || []).map((d) => {
    const isAttached = d.host_wall_id === wallId || d.wall_id === wallId;
    if (isAttached) {
      return {
        ...d,
        x1: d.x1 + effectiveDx,
        y1: d.y1 + effectiveDy,
        x2: d.x2 + effectiveDx,
        y2: d.y2 + effectiveDy,
        x: d.x !== undefined ? d.x + effectiveDx : undefined,
        y: d.y !== undefined ? d.y + effectiveDy : undefined,
      };
    }
    return d;
  });

  const nextWindows = (floor.windows || []).map((w) => {
    const isAttached = w.host_wall_id === wallId || w.wall_id === wallId;
    if (isAttached) {
      return {
        ...w,
        x1: w.x1 + effectiveDx,
        y1: w.y1 + effectiveDy,
        x2: w.x2 + effectiveDx,
        y2: w.y2 + effectiveDy,
        x: w.x !== undefined ? w.x + effectiveDx : undefined,
        y: w.y !== undefined ? w.y + effectiveDy : undefined,
      };
    }
    return w;
  });

  const updatedFloor: FloorPlan = {
    ...floor,
    exterior_walls: nextExtWalls,
    interior_walls: nextIntWalls,
    walls: [...nextExtWalls, ...nextIntWalls],
    rooms: nextRooms,
    doors: nextDoors,
    windows: nextWindows,
  };

  return {
    updatedFloor,
    affectedRoomIds,
    isValid: true,
  };
}

/**
 * Checks dependencies before deleting a wall to prevent silent model corruption.
 */
export function checkWallDeleteDependencies(
  floor: FloorPlan,
  wallId: string
): WallDeleteDependencyCheck | null {
  const allWalls = [...(floor.exterior_walls || []), ...(floor.interior_walls || [])];
  const targetWall = allWalls.find((w) => w.id === wallId);
  if (!targetWall) return null;

  const doors = (floor.doors || []).filter(
    (d) => d.host_wall_id === wallId || d.wall_id === wallId
  );
  const windows = (floor.windows || []).filter(
    (w) => w.host_wall_id === wallId || w.wall_id === wallId
  );

  const adjacentRooms: Room[] = [];
  const tol = 0.35;
  const isH = Math.abs(targetWall.y1 - targetWall.y2) < 0.2;

  (floor.rooms || []).forEach((rm) => {
    if (!rm.rect) return;
    if (isH) {
      const touchesY = Math.abs(rm.rect.y - targetWall.y1) < tol || Math.abs((rm.rect.y + rm.rect.length) - targetWall.y1) < tol;
      const overlapsX = Math.max(rm.rect.x, Math.min(targetWall.x1, targetWall.x2)) < Math.min(rm.rect.x + rm.rect.width, Math.max(targetWall.x1, targetWall.x2));
      if (touchesY && overlapsX) adjacentRooms.push(rm);
    } else {
      const touchesX = Math.abs(rm.rect.x - targetWall.x1) < tol || Math.abs((rm.rect.x + rm.rect.width) - targetWall.x1) < tol;
      const overlapsY = Math.max(rm.rect.y, Math.min(targetWall.y1, targetWall.y2)) < Math.min(rm.rect.y + rm.rect.length, Math.max(targetWall.y1, targetWall.y2));
      if (touchesX && overlapsY) adjacentRooms.push(rm);
    }
  });

  const parts: string[] = [];
  if (doors.length > 0) parts.push(`${doors.length} door${doors.length > 1 ? "s" : ""}`);
  if (windows.length > 0) parts.push(`${windows.length} window${windows.length > 1 ? "s" : ""}`);
  if (adjacentRooms.length > 1) {
    const roomNames = adjacentRooms.map((r) => r.name || "Room").join(" and ");
    parts.push(`separates ${roomNames}`);
  }

  const canDeleteDirectly = doors.length === 0 && windows.length === 0 && adjacentRooms.length <= 1;
  const summaryMessage = parts.length > 0
    ? `This wall contains ${parts.join(" and ")}.`
    : "This wall has no attached openings.";

  return {
    canDeleteDirectly,
    wall: targetWall,
    doors,
    windows,
    adjacentRooms,
    summaryMessage,
  };
}

/**
 * Creates a new canonical Wall entity.
 */
export function createCanonicalWall(
  start: Point2D,
  end: Point2D,
  thickness: number = 0.375,
  isExterior: boolean = false,
  height: number = 9.5
): Wall {
  const wallId = `wall_${crypto.randomUUID()}`;
  const length = distanceWorld(start, end);
  const isHorizontal = Math.abs(start.y - end.y) < 0.2;

  return {
    id: wallId,
    wall_id: wallId,
    x1: Math.round(start.x * 4) / 4,
    y1: Math.round(start.y * 4) / 4,
    x2: Math.round(end.x * 4) / 4,
    y2: Math.round(end.y * 4) / 4,
    start: { x: start.x, y: start.y },
    end: { x: end.x, y: end.y },
    thickness,
    height,
    wall_type: isExterior ? "exterior" : "partition",
    is_exterior: isExterior,
    wall_direction: isHorizontal ? "horizontal" : "vertical",
    adjacent_room_ids: [],
    room_ids: [],
    connected_room_ids: [],
    openings: [],
    volume_cuft: Math.round(length * height * thickness * 10) / 10,
    net_surface_area_sqft: Math.round(length * height * 10) / 10,
  };
}
