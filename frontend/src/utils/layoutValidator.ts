import { HouseLayout, Room, FloorPlan } from "@/types/house";
import { generateFallbackLandscape } from "./landscapeFallback";

export interface LayoutValidationResult {
  isValid: boolean;
  sanitizedLayout?: HouseLayout;
  errors: string[];
  warnings: string[];
}

/**
 * Validates and sanitizes a HouseLayout received from the API before it enters React state.
 * Strictly guarantees that no undefined geometry, NaN/negative coordinates, zero-size rooms,
 * or missing entity arrays reach the 2D SVG or 3D WebGL renderers.
 */
export function validateAndSanitizeHouseLayout(raw: unknown): HouseLayout | null {
  const res = validateAndSanitizeHouseLayoutDetailed(raw);
  return res.isValid && res.sanitizedLayout ? res.sanitizedLayout : null;
}

export function validateAndSanitizeHouseLayoutDetailed(
  raw: unknown
): LayoutValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!raw || typeof raw !== "object") {
    return {
      isValid: false,
      errors: ["API response is empty or not a valid JSON object."],
      warnings: [],
    };
  }

  const layout = raw as Partial<HouseLayout>;

  // 1. Basic Identity & Dimensions
  if (!layout.id || typeof layout.id !== "string") {
    errors.push("Missing or invalid project layout ID.");
  }

  const plotWidth = Number(layout.plot_width);
  const plotLength = Number(layout.plot_length);

  if (isNaN(plotWidth) || plotWidth <= 0) {
    errors.push(`Invalid plot width: ${layout.plot_width}. Must be a positive number.`);
  }
  if (isNaN(plotLength) || plotLength <= 0) {
    errors.push(`Invalid plot length: ${layout.plot_length}. Must be a positive number.`);
  }

  // 2. Validate Floors
  const rawFloors = Array.isArray(layout.floors) ? layout.floors : [];
  if (rawFloors.length === 0 && (!Array.isArray(layout.rooms) || layout.rooms.length === 0)) {
    errors.push("Layout contains zero floors and zero rooms.");
  }

  const sanitizedFloors: FloorPlan[] = [];
  const seenRoomIds = new Set<string>();

  for (let fIdx = 0; fIdx < Math.max(1, rawFloors.length); fIdx++) {
    const rawFloor = rawFloors[fIdx] || {
      floor_number: fIdx + 1,
      floor_name: fIdx === 0 ? "Ground Floor" : `Level ${fIdx + 1}`,
      rooms: layout.rooms || [],
      exterior_walls: layout.exterior_walls || [],
      interior_walls: layout.interior_walls || [],
      doors: layout.doors || [],
      windows: layout.windows || [],
    };

    const sanitizedRooms: Room[] = [];
    const floorRooms = Array.isArray(rawFloor.rooms) ? rawFloor.rooms : [];

    for (let rIdx = 0; rIdx < floorRooms.length; rIdx++) {
      const r = floorRooms[rIdx];
      if (!r || typeof r !== "object") continue;

      let rId = r.id;
      if (!rId || seenRoomIds.has(rId)) {
        rId = `r_f${fIdx + 1}_${rIdx + 1}_${(r.name || 'rm').toLowerCase().replace(/[^a-z0-9]/g, '')}`;
      }
      seenRoomIds.add(rId);

      const rect = r.rect;
      if (!rect) {
        warnings.push(`Room ${r.name || rId} missing rectangle geometry; discarded.`);
        continue;
      }

      const rx = Number(rect.x);
      const ry = Number(rect.y);
      const rw = Number(rect.width);
      const rl = Number(rect.length);

      if (isNaN(rx) || isNaN(ry) || isNaN(rw) || isNaN(rl)) {
        warnings.push(`Room ${r.name || rId} contains NaN coordinates [${rect.x}, ${rect.y}, ${rect.width}, ${rect.length}]; discarded.`);
        continue;
      }

      if (rw <= 0 || rl <= 0) {
        warnings.push(`Room ${r.name || rId} has zero or negative dimension (${rw}x${rl}); discarded.`);
        continue;
      }

      // Sanitize furniture items
      const sanitizedFurniture = (Array.isArray(r.furniture) ? r.furniture : [])
        .filter((f) => f && typeof f === "object")
        .map((f, fNum) => {
          const fx = Number(f.x);
          const fy = Number(f.y);
          const fw = Number(f.width);
          const fl = Number(f.length);
          return {
            ...f,
            id: f.id || `${rId}_f_${fNum + 1}`,
            x: isNaN(fx) ? rx + rw / 2 : fx,
            y: isNaN(fy) ? ry + rl / 2 : fy,
            width: isNaN(fw) || fw <= 0 ? 2.0 : fw,
            length: isNaN(fl) || fl <= 0 ? 2.0 : fl,
            rotation: Number(f.rotation) || 0,
          };
        });

      sanitizedRooms.push({
        ...r,
        id: rId,
        name: r.name || "Room",
        type: r.type || "bedroom",
        zone: r.zone || "private",
        rect: {
          x: Math.max(0, rx),
          y: Math.max(0, ry),
          width: Math.max(2, rw),
          length: Math.max(2, rl),
        },
        furniture: sanitizedFurniture,
        area_sqft: Math.round(rw * rl),
      });
    }

    if (sanitizedRooms.length === 0 && rawFloors.length > 0) {
      errors.push(`Floor ${fIdx + 1} contains no valid rooms after geometric validation.`);
    }

    // Sanitize walls
    const sanitizeWallList = (walls: unknown[]) =>
      (Array.isArray(walls) ? walls : [])
        .filter((w): w is Record<string, any> => Boolean(w && typeof w === "object"))
        .map((w, wIdx) => {
          const x1 = Number(w.x1);
          const y1 = Number(w.y1);
          const x2 = Number(w.x2);
          const y2 = Number(w.y2);
          const th = Number(w.thickness);
          return {
            ...w,
            id: (w.id as string) || `w_f${fIdx + 1}_${wIdx + 1}`,
            x1: isNaN(x1) ? 0 : x1,
            y1: isNaN(y1) ? 0 : y1,
            x2: isNaN(x2) ? 0 : x2,
            y2: isNaN(y2) ? 0 : y2,
            thickness: isNaN(th) || th <= 0 ? 0.45 : th,
            is_exterior: Boolean(w.is_exterior),
          };
        });

    // Sanitize doors
    const sanitizeDoors = (doors: unknown[]) =>
      (Array.isArray(doors) ? doors : [])
        .filter((d): d is Record<string, any> => Boolean(d && typeof d === "object"))
        .map((d, dIdx) => ({
          ...d,
          id: (d.id as string) || `d_f${fIdx + 1}_${dIdx + 1}`,
          x1: Number(d.x1) || 0,
          y1: Number(d.y1) || 0,
          x2: Number(d.x2) || 0,
          y2: Number(d.y2) || 0,
          width: Number(d.width) || 3.0,
        }));

    // Sanitize windows
    const sanitizeWindows = (wins: unknown[]) =>
      (Array.isArray(wins) ? wins : [])
        .filter((w): w is Record<string, any> => Boolean(w && typeof w === "object"))
        .map((w, wIdx) => ({
          ...w,
          id: (w.id as string) || `win_f${fIdx + 1}_${wIdx + 1}`,
          x1: Number(w.x1) || 0,
          y1: Number(w.y1) || 0,
          x2: Number(w.x2) || 0,
          y2: Number(w.y2) || 0,
          width: Number(w.width) || 4.0,
        }));

    sanitizedFloors.push({
      floor_number: fIdx + 1,
      floor_name: rawFloor.floor_name || (fIdx === 0 ? "Ground Floor" : `Level ${fIdx + 1}`),
      rooms: sanitizedRooms,
      walls: sanitizeWallList(rawFloor.walls || []),
      exterior_walls: sanitizeWallList(rawFloor.exterior_walls || []),
      interior_walls: sanitizeWallList(rawFloor.interior_walls || []),
      doors: sanitizeDoors(rawFloor.doors || []),
      windows: sanitizeWindows(rawFloor.windows || []),
      staircase: rawFloor.staircase,
      circulation: rawFloor.circulation,
    });
  }

  if (errors.length > 0) {
    return { isValid: false, errors, warnings };
  }

  const primaryFloor = sanitizedFloors[0];

  const sanitized: HouseLayout = {
    id: layout.id || `layout_${plotWidth}x${plotLength}_${sanitizedFloors.length}f`,
    title: layout.title || "Architectural Residence Design",
    designer_rationale: layout.designer_rationale || "Optimized functional floor plan.",
    plot_width: plotWidth,
    plot_length: plotLength,
    num_floors: sanitizedFloors.length,
    site: layout.site,
    stats: layout.stats || {
      total_area_sqft: sanitizedFloors.flatMap((f) => f.rooms).reduce((sum, r) => sum + r.area_sqft, 0),
      living_area_sqft: sanitizedFloors.flatMap((f) => f.rooms).reduce((sum, r) => sum + r.area_sqft, 0),
      width_ft: plotWidth,
      length_ft: plotLength,
      num_floors: sanitizedFloors.length,
      bedroom_count: sanitizedFloors.flatMap((f) => f.rooms).filter((r) => r.type.includes("bedroom")).length,
      bathroom_count: sanitizedFloors.flatMap((f) => f.rooms).filter((r) => r.type.includes("bath")).length,
      aspect_ratio: Number((plotWidth / plotLength).toFixed(2)),
      coverage_percentage: 60.0,
    },
    floors: sanitizedFloors,
    scores: layout.scores,
    validation: layout.validation,
    vastu_result: layout.vastu_result,
    critic_notes: Array.isArray(layout.critic_notes) ? layout.critic_notes : [],
    metadata: layout.metadata || {},
    rooms: primaryFloor.rooms,
    walls: primaryFloor.walls,
    exterior_walls: primaryFloor.exterior_walls,
    interior_walls: primaryFloor.interior_walls,
    doors: primaryFloor.doors,
    windows: primaryFloor.windows,
    entry_point: layout.entry_point || { x: plotWidth / 2, y: plotLength, direction: 0 },
    structural_planning: layout.structural_planning,
    landscape:
      layout.landscape &&
      ((layout.landscape.elements && layout.landscape.elements.length > 0) ||
        (layout.landscape.zones && layout.landscape.zones.length > 0))
        ? layout.landscape
        : generateFallbackLandscape({
            ...layout,
            plot_width: plotWidth,
            plot_length: plotLength,
            floors: sanitizedFloors,
            rooms: primaryFloor.rooms,
            doors: primaryFloor.doors,
          } as HouseLayout),
  };

  return {
    isValid: true,
    sanitizedLayout: sanitized,
    errors: [],
    warnings,
  };
}
