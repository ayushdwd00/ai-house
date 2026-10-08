import { HouseLayout, FloorPlan, Wall, Room, Door, WindowItem } from "@/types/house";
import { applyWallMovementTopology, createCanonicalWall } from "./cadTopology";
import { parseArchitecturalDimension } from "./cadCoordinates";
import { projectOpeningToWall } from "./cadGeometryHelper";

export interface CadAiCommandResult {
  handledLocally: boolean;
  layout?: HouseLayout;
  message: string;
  success: boolean;
}

/**
 * Deterministic Client-Side Natural Language CAD Command Interpreter
 */
export function executeLocalCadAiCommand(
  layout: HouseLayout,
  activeFloorIndex: number,
  instruction: string,
  selectedEntityId?: string | null
): CadAiCommandResult | null {
  const text = instruction.trim().toLowerCase();
  const floor = layout.floors?.[activeFloorIndex];
  if (!floor) return null;

  // 1. "Make [room] [N] feet wide" or "Make [room] [W] by [L]"
  const makeRoomMatch = text.match(/make\s+(?:the\s+)?([a-z\s]+?)\s+(?:(\d+(?:\.\d+)?)\s*(?:'|ft|feet)?\s*(?:wide|width)|(\d+(?:\.\d+)?)\s*(?:by|x|×)\s*(\d+(?:\.\d+)?))/i);
  if (makeRoomMatch) {
    const roomQuery = makeRoomMatch[1].trim();
    const targetRoom = (floor.rooms || []).find((r) =>
      (r.name && r.name.toLowerCase().includes(roomQuery)) ||
      (r.type && r.type.toLowerCase().includes(roomQuery))
    );

    if (targetRoom && targetRoom.rect) {
      let targetW = targetRoom.rect.width;
      let targetL = targetRoom.rect.length;

      if (makeRoomMatch[2]) {
        targetW = parseFloat(makeRoomMatch[2]);
      } else if (makeRoomMatch[3] && makeRoomMatch[4]) {
        targetW = parseFloat(makeRoomMatch[3]);
        targetL = parseFloat(makeRoomMatch[4]);
      }

      if (targetW >= 4 && targetL >= 4) {
        const deltaW = targetW - targetRoom.rect.width;
        // Find right wall of this room to move
        const rightEdgeX = targetRoom.rect.x + targetRoom.rect.width;
        const allWalls = [...(floor.exterior_walls || []), ...(floor.interior_walls || [])];
        const rightWall = allWalls.find((w) =>
          Math.abs(w.x1 - rightEdgeX) < 0.3 && Math.abs(w.x2 - rightEdgeX) < 0.3
        );

        if (rightWall) {
          const topo = applyWallMovementTopology(floor, rightWall.id, deltaW, 0, layout.plot_width, layout.plot_length);
          if (topo.isValid) {
            const nextFloors = [...layout.floors];
            nextFloors[activeFloorIndex] = topo.updatedFloor;
            return {
              handledLocally: true,
              success: true,
              layout: { ...layout, floors: nextFloors, rooms: nextFloors[0].rooms, walls: nextFloors[0].walls },
              message: `Resized ${targetRoom.name} to ${targetW}'-0" width.`,
            };
          }
        }
      }
    }
  }

  // 2. "Move this wall [N] feet [direction]"
  const moveWallMatch = text.match(/move\s+(?:this\s+)?wall\s+(\d+(?:\.\d+)?)\s*(?:'|ft|feet)?\s*(?:feet\s+)?(outward|inward|left|right|up|down|north|south|east|west)?/i);
  if (moveWallMatch && selectedEntityId) {
    const dist = parseFloat(moveWallMatch[1]) || 1;
    const dir = moveWallMatch[2] || "right";
    let dx = 0;
    let dy = 0;
    if (dir === "left" || dir === "west") dx = -dist;
    else if (dir === "right" || dir === "east" || dir === "outward") dx = dist;
    else if (dir === "up" || dir === "north" || dir === "inward") dy = -dist;
    else if (dir === "down" || dir === "south") dy = dist;

    const allWalls = [...(floor.exterior_walls || []), ...(floor.interior_walls || [])];
    const wall = allWalls.find((w) => w.id === selectedEntityId);
    if (wall) {
      const topo = applyWallMovementTopology(floor, wall.id, dx, dy, layout.plot_width, layout.plot_length);
      if (topo.isValid) {
        const nextFloors = [...layout.floors];
        nextFloors[activeFloorIndex] = topo.updatedFloor;
        return {
          handledLocally: true,
          success: true,
          layout: { ...layout, floors: nextFloors, rooms: nextFloors[0].rooms, walls: nextFloors[0].walls },
          message: `Moved wall by ${dist} ft ${dir}.`,
        };
      }
    }
  }

  // 3. "Add [N] foot window to [orientation/this] wall"
  const addWinMatch = text.match(/add\s+(?:a\s+)?(\d+(?:\.\d+)?)\s*(?:'|ft|foot|feet)?\s*window/i);
  if (addWinMatch) {
    const width = parseFloat(addWinMatch[1]) || 4;
    const allWalls = [...(floor.exterior_walls || []), ...(floor.interior_walls || [])];
    let hostWall: Wall | undefined;

    if (selectedEntityId) {
      hostWall = allWalls.find((w) => w.id === selectedEntityId);
    }
    if (!hostWall) {
      if (text.includes("south")) hostWall = allWalls.find((w) => Math.abs(w.y1 - w.y2) < 0.2 && w.y1 > layout.plot_length / 2);
      else if (text.includes("north")) hostWall = allWalls.find((w) => Math.abs(w.y1 - w.y2) < 0.2 && w.y1 < layout.plot_length / 2);
      else if (text.includes("east")) hostWall = allWalls.find((w) => Math.abs(w.x1 - w.x2) < 0.2 && w.x1 > layout.plot_width / 2);
      else if (text.includes("west")) hostWall = allWalls.find((w) => Math.abs(w.x1 - w.x2) < 0.2 && w.x1 < layout.plot_width / 2);
      else hostWall = allWalls[0];
    }

    if (hostWall) {
      const mid = { x: (hostWall.x1 + hostWall.x2) / 2, y: (hostWall.y1 + hostWall.y2) / 2 };
      const geom = projectOpeningToWall(hostWall, mid, width);
      if (geom) {
        const winId = `win_${crypto.randomUUID()}`;
        const newWin: WindowItem = {
          id: winId,
          wall_id: hostWall.id,
          host_wall_id: hostWall.id,
          floor_id: String(floor.floor_number),
          ...geom,
          height: 4,
          sill_height: 3,
          window_type: "casement",
        };
        const nextFloors = [...layout.floors];
        nextFloors[activeFloorIndex] = {
          ...floor,
          windows: [...(floor.windows || []), newWin],
        };
        return {
          handledLocally: true,
          success: true,
          layout: { ...layout, floors: nextFloors, windows: nextFloors[0].windows },
          message: `Added ${width}'-0" window to wall.`,
        };
      }
    }
  }

  // 4. "Delete window" / "Delete door" / "Delete wall"
  if (text.startsWith("delete") && selectedEntityId) {
    let nextFloors = [...layout.floors];
    const curFloor = nextFloors[activeFloorIndex];

    if (curFloor.windows?.some((w) => w.id === selectedEntityId)) {
      nextFloors[activeFloorIndex] = {
        ...curFloor,
        windows: curFloor.windows.filter((w) => w.id !== selectedEntityId),
      };
      return {
        handledLocally: true,
        success: true,
        layout: { ...layout, floors: nextFloors, windows: nextFloors[0].windows },
        message: "Deleted window.",
      };
    }

    if (curFloor.doors?.some((d) => d.id === selectedEntityId)) {
      nextFloors[activeFloorIndex] = {
        ...curFloor,
        doors: curFloor.doors.filter((d) => d.id !== selectedEntityId),
      };
      return {
        handledLocally: true,
        success: true,
        layout: { ...layout, floors: nextFloors, doors: nextFloors[0].doors },
        message: "Deleted door.",
      };
    }
  }

  // 5. "Flip door swing"
  if (text.includes("flip") && text.includes("swing") && selectedEntityId) {
    const door = (floor.doors || []).find((d) => d.id === selectedEntityId);
    if (door) {
      const nextSwing = door.swing_direction === "outward" ? "inward" : "outward";
      const nextHinge = door.hinge_side === "right" ? "left" : "right";
      const nextFloors = [...layout.floors];
      nextFloors[activeFloorIndex] = {
        ...floor,
        doors: (floor.doors || []).map((d) =>
          d.id === selectedEntityId ? { ...d, swing_direction: nextSwing, hinge_side: nextHinge } : d
        ),
      };
      return {
        handledLocally: true,
        success: true,
        layout: { ...layout, floors: nextFloors, doors: nextFloors[0].doors },
        message: `Flipped door swing to ${nextSwing}.`,
      };
    }
  }

  // Fallback to backend pipeline
  return null;
}
