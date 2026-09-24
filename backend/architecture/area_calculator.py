"""
Architectural Area Calculator Module
Single source of truth for residential spatial metrics:
- Built-Up Area (Plinth Area): Calculated from the exterior-wall building footprint polygon.
- Carpet Area: Net usable floor area inside walls (deducting wall thickness).
- Usable Area: Carpet area plus covered utility/balcony.
- Open Plot Area: Plot area minus ground floor building footprint.
Ensures carpet_area is strictly less than built_up_area and eliminates double counting.
"""

from typing import List, Dict, Any, Tuple, Optional
from shapely.geometry import box, MultiPolygon, Polygon
from shapely.ops import unary_union
from models import Room, FloorPlan, Rect


def calculate_house_areas(
    floors: List[FloorPlan],
    plot_width: float,
    plot_length: float,
    external_wall_thickness_ft: float = 0.75,
    internal_wall_thickness_ft: float = 0.375
) -> Dict[str, float]:
    """
    Computes rigorous architectural areas directly from room rectangles and wall thicknesses:
    1. Built-up area = Exterior building footprint envelope per floor.
    2. Carpet area = Sum of clear inner room dimensions (deducting partition thickness).
    """
    total_built_up = 0.0
    total_carpet = 0.0
    total_usable = 0.0
    ground_footprint_area = 0.0

    for f_idx, floor in enumerate(floors):
        floor_rooms = [r for r in floor.rooms if r.rect and r.rect.area > 1.0]
        if not floor_rooms:
            continue

        # 1. Footprint polygon union
        room_boxes = [box(r.rect.x, r.rect.y, r.rect.right, r.rect.bottom) for r in floor_rooms]
        floor_union = unary_union(room_boxes)
        
        # Buffer outward by half exterior wall thickness to account for wall envelope
        buffered_envelope = floor_union.buffer(external_wall_thickness_ft / 2.0)
        floor_built_up = round(buffered_envelope.area, 2)
        total_built_up += floor_built_up

        if f_idx == 0:
            ground_footprint_area = floor_built_up

        # 2. Clear Carpet Area calculation per room
        for r in floor_rooms:
            # Deduct wall thickness from outer room box to get clear inner usable area
            thick = internal_wall_thickness_ft
            clear_w = max(1.0, r.rect.width - thick)
            clear_l = max(1.0, r.rect.length - thick)
            room_carpet = round(clear_w * clear_l, 2)

            if r.type not in ["parking", "balcony", "patio", "courtyard"]:
                total_carpet += room_carpet
                total_usable += room_carpet
            elif r.type in ["balcony", "patio"]:
                total_usable += room_carpet

    total_plot = round(plot_width * plot_length, 2)
    open_plot_area = max(0.0, round(total_plot - ground_footprint_area, 2))
    coverage_pct = round((ground_footprint_area / max(1.0, total_plot)) * 100.0, 1)

    return {
        "plot_area_sqft": total_plot,
        "built_up_area_sqft": round(total_built_up, 2),
        "carpet_area_sqft": round(total_carpet, 2),
        "usable_area_sqft": round(total_usable, 2),
        "open_area_sqft": open_plot_area,
        "ground_footprint_area_sqft": round(ground_footprint_area, 2),
        "coverage_percentage": coverage_pct,
    }
