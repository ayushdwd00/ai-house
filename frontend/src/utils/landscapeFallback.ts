import {
  HouseLayout,
  LandscapePlan,
  LandscapeElement,
  LandscapeZone,
  Point2D,
  Rect,
} from "@/types/house";

/**
 * Generates a deterministic, site-aware landscape plan when no backend landscape
 * data exists or when landscape elements are empty.
 * Strictly respects plot boundary, building footprint, setbacks, entrance, and parking.
 */
export function generateFallbackLandscape(layout: HouseLayout): LandscapePlan {
  const plotW = Math.max(20, layout.plot_width || 40);
  const plotL = Math.max(20, layout.plot_length || 50);

  const site = layout.site;
  const roadSide = (site?.road_side || "south").toLowerCase();
  const sbFront = Math.max(3.0, Number(site?.setbacks?.front) || 5.0);
  const sbRear = Math.max(2.5, Number(site?.setbacks?.rear) || 4.0);
  const sbLeft = Math.max(2.0, Number(site?.setbacks?.left) || 3.0);
  const sbRight = Math.max(2.0, Number(site?.setbacks?.right) || 3.0);

  // 1. Calculate Ground Floor Building Footprint Bounding Box
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

  if (!isFinite(minBx) || minBx >= maxBx) {
    // Fallback to setbacks envelope
    minBx = sbLeft;
    maxBx = plotW - sbRight;
    minBz = roadSide === "north" ? sbFront : sbRear;
    maxBz = roadSide === "north" ? plotL - sbRear : plotL - sbFront;
  }

  // 2. Identify Entrance Door / Access Point
  const doors = layout.floors?.[0]?.doors || layout.doors || [];
  let entryPt: Point2D = { x: Math.round((minBx + maxBx) / 2), y: roadSide === "south" ? maxBz : minBz };

  if (layout.entry_point && typeof layout.entry_point.x === "number") {
    entryPt = { x: layout.entry_point.x, y: layout.entry_point.y };
  } else {
    for (const d of doors) {
      if (d.door_type === "entry") {
        entryPt = { x: (d.x1 + d.x2) / 2, y: (d.y1 + d.y2) / 2 };
        break;
      }
    }
  }

  // 3. Parking & Driveway Geometry
  let parkingRect: Rect | null = null;
  if (site?.parking?.rect) {
    parkingRect = site.parking.rect;
  }

  const elements: LandscapeElement[] = [];
  const paths: LandscapeElement[] = [];
  const zones: LandscapeZone[] = [];

  // Determine Driveway Placement
  let drivewayElem: LandscapeElement | null = null;
  let dwX = sbLeft + 5.0;
  let dwW = 10.0;
  let dwL = sbFront + 2.0;
  let dwY = roadSide === "south" ? plotL - dwL / 2 : dwL / 2;

  if (parkingRect) {
    dwW = Math.max(8.0, parkingRect.width);
    dwL = Math.max(12.0, parkingRect.length);
    dwX = parkingRect.x + parkingRect.width / 2;
    dwY = parkingRect.y + parkingRect.length / 2;
  } else {
    // Standard driveway bay placed on one side of road frontage
    const isLeft = entryPt.x > plotW / 2;
    dwX = isLeft ? sbLeft + dwW / 2 : plotW - sbRight - dwW / 2;
  }

  drivewayElem = {
    element_id: "DW_FALLBACK_01",
    type: "driveway",
    x: Math.round(dwX * 10) / 10,
    y: Math.round(dwY * 10) / 10,
    width: Math.round(dwW * 10) / 10,
    length: Math.round(dwL * 10) / 10,
    zone: "driveway",
    properties: { surface: "paved_concrete", texture: "brushed" },
  };

  // 4. Entrance Pathway (Stepping Stones)
  const pathPoints: Point2D[] = [];
  const roadY = roadSide === "south" ? plotL : 0;
  const pathStartX = Math.max(sbLeft + 2, Math.min(plotW - sbRight - 2, entryPt.x + (entryPt.x < plotW / 2 ? 3 : -3)));
  const gatePt: Point2D = { x: Math.round(pathStartX), y: roadY };
  const midY = roadSide === "south" ? Math.min(plotL - 1.5, entryPt.y + 2) : Math.max(1.5, entryPt.y - 2);
  const midPt: Point2D = { x: Math.round(entryPt.x), y: Math.round(midY * 10) / 10 };
  const doorPt: Point2D = { x: Math.round(entryPt.x), y: Math.round(entryPt.y) };

  pathPoints.push(gatePt, midPt, doorPt);

  paths.push({
    element_id: "PATH_FALLBACK_01",
    type: "pathway",
    x: Math.round(midPt.x * 10) / 10,
    y: Math.round(midPt.y * 10) / 10,
    width: 3.5,
    zone: "entrance_pathway",
    points: pathPoints,
    properties: { style: "stepping_stones", paver_material: "limestone" },
  });

  // 5. Front Garden Lawn
  const fgW = Math.max(6.0, plotW - sbLeft - sbRight - (dwW + 2));
  const fgL = Math.max(3.0, sbFront - 0.8);
  const fgX = dwX < plotW / 2 ? dwX + dwW / 2 + fgW / 2 + 1.0 : sbLeft + fgW / 2;
  const fgY = roadSide === "south" ? plotL - sbFront / 2 : sbFront / 2;

  elements.push({
    element_id: "LAWN_FRONT_FALLBACK",
    type: "lawn",
    x: Math.round(Math.min(plotW - sbRight - fgW / 2, Math.max(sbLeft + fgW / 2, fgX)) * 10) / 10,
    y: Math.round(fgY * 10) / 10,
    width: Math.round(fgW * 10) / 10,
    length: Math.round(fgL * 10) / 10,
    zone: "front_garden",
    properties: { grass_type: "bermuda", density: "manicured" },
  });

  // 6. Rear Garden Lawn
  const rgW = Math.max(8.0, plotW - sbLeft - sbRight - 2.0);
  const rgL = Math.max(3.0, sbRear - 0.8);
  const rgX = plotW / 2;
  const rgY = roadSide === "south" ? sbRear / 2 : plotL - sbRear / 2;

  elements.push({
    element_id: "LAWN_REAR_FALLBACK",
    type: "lawn",
    x: Math.round(rgX * 10) / 10,
    y: Math.round(rgY * 10) / 10,
    width: Math.round(rgW * 10) / 10,
    length: Math.round(rgL * 10) / 10,
    zone: "rear_garden",
    properties: { grass_type: "zoysia", density: "soft" },
  });

  // 7. Planters Flanking Entrance
  const pOff = roadSide === "south" ? 1.4 : -1.4;
  elements.push(
    {
      element_id: "PLANTER_ENTRY_L",
      type: "planter",
      x: Math.round((entryPt.x - 3.2) * 10) / 10,
      y: Math.round((entryPt.y + pOff) * 10) / 10,
      width: 2.2,
      length: 1.4,
      zone: "entrance_pathway",
      properties: { plant: "boxwood_topiary" },
    },
    {
      element_id: "PLANTER_ENTRY_R",
      type: "planter",
      x: Math.round((entryPt.x + 3.2) * 10) / 10,
      y: Math.round((entryPt.y + pOff) * 10) / 10,
      width: 2.2,
      length: 1.4,
      zone: "entrance_pathway",
      properties: { plant: "boxwood_topiary" },
    }
  );

  // 8. Boundary Greenery & Privacy Hedges
  elements.push(
    {
      element_id: "HEDGE_LEFT",
      type: "hedge",
      x: Math.round((sbLeft / 2) * 10) / 10,
      y: Math.round((plotL / 2) * 10) / 10,
      width: 1.6,
      length: Math.round((plotL - 4) * 10) / 10,
      zone: "boundary_planting",
      properties: { height: 4.2 },
    },
    {
      element_id: "HEDGE_RIGHT",
      type: "hedge",
      x: Math.round((plotW - sbRight / 2) * 10) / 10,
      y: Math.round((plotL / 2) * 10) / 10,
      width: 1.6,
      length: Math.round((plotL - 4) * 10) / 10,
      zone: "boundary_planting",
      properties: { height: 4.2 },
    },
    {
      element_id: "HEDGE_REAR",
      type: "hedge",
      x: Math.round((plotW / 2) * 10) / 10,
      y: Math.round((roadSide === "south" ? 1.0 : plotL - 1.0) * 10) / 10,
      width: Math.round((plotW - 4) * 10) / 10,
      length: 1.6,
      zone: "boundary_planting",
      properties: { height: 4.8 },
    }
  );

  // 9. Deterministic Trees (3 to 4 trees positioned in open setbacks)
  const rearTreeY = roadSide === "south" ? Math.max(1.8, sbRear / 2) : plotL - Math.max(1.8, sbRear / 2);
  const frontTreeY = roadSide === "south" ? plotL - Math.max(2.0, sbFront / 2) : Math.max(2.0, sbFront / 2);

  // Rear Left Tree
  elements.push({
    element_id: "TREE_REAR_L",
    type: "tree",
    x: Math.round((sbLeft + 3.0) * 10) / 10,
    y: Math.round(rearTreeY * 10) / 10,
    radius: 3.5,
    zone: "rear_garden",
    properties: { species: "Jacaranda", foliage_type: "conical" },
  });

  // Rear Right Tree
  elements.push({
    element_id: "TREE_REAR_R",
    type: "tree",
    x: Math.round((plotW - sbRight - 3.0) * 10) / 10,
    y: Math.round(rearTreeY * 10) / 10,
    radius: 3.8,
    zone: "rear_garden",
    properties: { species: "Magnolia", foliage_type: "round" },
  });

  // Front Accent Tree (placed clear of driveway and path)
  const frontTreeX = dwX < plotW / 2 ? plotW - sbRight - 3.2 : sbLeft + 3.2;
  elements.push({
    element_id: "TREE_FRONT_ACCENT",
    type: "tree",
    x: Math.round(frontTreeX * 10) / 10,
    y: Math.round(frontTreeY * 10) / 10,
    radius: 3.2,
    zone: "front_garden",
    properties: { species: "Silver Birch", foliage_type: "round" },
  });

  // 10. Garden Lighting Bollards (along pathway and garden entrance)
  elements.push(
    {
      element_id: "LIGHT_01",
      type: "outdoor_light",
      x: Math.round((entryPt.x - 2.8) * 10) / 10,
      y: Math.round((midPt.y) * 10) / 10,
      zone: "entrance_pathway",
    },
    {
      element_id: "LIGHT_02",
      type: "outdoor_light",
      x: Math.round((entryPt.x + 2.8) * 10) / 10,
      y: Math.round((midPt.y) * 10) / 10,
      zone: "entrance_pathway",
    },
    {
      element_id: "LIGHT_03",
      type: "outdoor_light",
      x: Math.round(frontTreeX * 10) / 10,
      y: Math.round((frontTreeY + (roadSide === "south" ? -2.5 : 2.5)) * 10) / 10,
      zone: "front_garden",
    }
  );

  // 11. Water Feature (Reflecting Pool in Rear Garden if adequate setback)
  if (sbRear >= 4.0 && rgW >= 12.0) {
    elements.push({
      element_id: "WATER_FEATURE_01",
      type: "water_feature",
      x: Math.round((plotW / 2) * 10) / 10,
      y: Math.round(rearTreeY * 10) / 10,
      radius: 2.8,
      zone: "rear_garden",
      properties: { style: "reflecting_pool", finish: "dark_granite" },
    });
  }

  // 12. Zones
  zones.push(
    {
      zone_id: "ZONE_FRONT_GARDEN",
      name: "Front Garden & Approach",
      zone_type: "front_garden",
      rect: {
        x: 0,
        y: roadSide === "south" ? plotL - sbFront : 0,
        width: plotW,
        length: sbFront,
      },
      area_sqft: Math.round(plotW * sbFront),
    },
    {
      zone_id: "ZONE_REAR_GARDEN",
      name: "Rear Private Garden",
      zone_type: "rear_garden",
      rect: {
        x: 0,
        y: roadSide === "south" ? 0 : plotL - sbRear,
        width: plotW,
        length: sbRear,
      },
      area_sqft: Math.round(plotW * sbRear),
    }
  );

  return {
    plan_id: "PLAN_FALLBACK_DEFAULT",
    zones,
    elements,
    paths,
    driveway: drivewayElem || undefined,
    outdoor_features: [],
    total_green_area_sqft: Math.round(fgW * fgL + rgW * rgL),
    green_coverage_percentage: Math.round(((fgW * fgL + rgW * rgL) / (plotW * plotL)) * 100),
    trees_count: elements.filter((e) => e.type === "tree").length,
    lights_count: elements.filter((e) => e.type === "outdoor_light").length,
    water_features_count: elements.filter((e) => e.type === "water_feature").length,
    style: "modern_minimal",
    summary: "Balanced site landscape with lawn setbacks, trees, entry pathway, and driveway.",
  };
}
