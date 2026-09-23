"""
Architectural Dimension Recommender & Feasibility Engine
Analyzes plot dimensions, buildable envelope, setbacks, number of floors,
and functional room program to compute:
1. Plot-aware room dimensions (Compact for tight plots, Standard for moderate, Spacious for large)
2. Feasibility validation & non-technical user feedback
3. Multi-floor distribution strategies
4. Hard user constraints vs Preferred dimensions vs Minimum viability thresholds
"""

import math
from typing import Dict, Any, List, Optional, Literal, Tuple
from pydantic import BaseModel, Field


class RoomSizeSpec(BaseModel):
    id: str
    name: str
    type: str
    quantity: int = 1
    size_mode: Literal["manual", "ai_recommended"] = "ai_recommended"
    length: float = 12.0
    width: float = 10.0
    min_length: float = 9.0
    min_width: float = 8.0
    preferred_length: float = 12.0
    preferred_width: float = 10.0
    is_hard_constraint: bool = False
    floor_number: int = 1
    zone: str = "private"
    rationale: Optional[str] = None


class StrategyOption(BaseModel):
    id: str
    title: str
    description: str
    recommended_floors: int
    feasibility_status: Literal["feasible", "tight", "infeasible"]
    room_allocations: List[Dict[str, Any]]


class DimensionRecommendationRequest(BaseModel):
    plot_width: float = 40.0
    plot_length: float = 50.0
    plot_unit: Literal["ft", "m"] = "ft"
    num_floors: int = 1
    bedrooms: int = 3
    bathrooms: float = 2.0
    attached_bathroom_count: Optional[int] = 1
    parking_cars: int = 1
    road_side: Literal["north", "south", "east", "west"] = "south"
    special_rooms: List[str] = Field(default_factory=list)
    custom_rooms: Optional[List[Dict[str, Any]]] = None
    rooms: Optional[List[Any]] = None


class DimensionRecommendationResponse(BaseModel):
    plot_width_ft: float
    plot_length_ft: float
    plot_area_sqft: float
    buildable_width_ft: float
    buildable_length_ft: float
    buildable_ground_area_sqft: float
    total_requested_ground_area_sqft: float
    ground_coverage_pct: float
    feasibility_status: Literal["comfortable", "tight", "requires_multistage", "infeasible"]
    feasibility_message: str
    recommended_solution: str
    rooms: List[RoomSizeSpec]
    strategies: List[StrategyOption] = Field(default_factory=list)


def compute_adaptive_setbacks(plot_w: float, plot_l: float) -> Tuple[float, float, float, float]:
    """
    Computes setback dimensions (front, rear, left, right) in feet.
    For small plots (<= 800 sq ft e.g. 20x30, 25x30), uses proportional compact setbacks
    so the building envelope remains viable.
    """
    area = plot_w * plot_l
    if area <= 700:  # e.g., 20x30, 20x35
        return (3.0, 2.0, 1.5, 1.5)
    elif area <= 1000:  # e.g., 25x35, 25x40
        return (3.5, 2.5, 2.0, 2.0)
    elif area <= 1600:  # e.g., 30x40, 30x50
        return (4.5, 3.0, 2.5, 2.5)
    elif area <= 2800:  # e.g., 40x50, 40x60
        return (5.0, 4.0, 3.0, 3.0)
    elif area <= 4500:  # e.g., 50x80
        return (8.0, 5.0, 4.0, 4.0)
    else:
        return (10.0, 6.0, 5.0, 5.0)


def get_base_room_proportions(room_type: str, plot_tier: Literal["compact", "standard", "spacious"] = "standard") -> Tuple[float, float, float, float]:
    """
    Returns (min_w, min_l, pref_w, pref_l) in feet for a given room type and plot size tier.
    Covers all 15 supported room types:
    Living Room, Drawing Room, Dining Room, Master Bedroom, Bedroom, Kitchen,
    Bathroom, Pooja Room, Study, Utility, Store, Dressing Room, Balcony, Garage, Custom Room.
    """
    c_type = room_type.lower()

    if "master" in c_type or "primary" in c_type:
        if plot_tier == "compact":
            return (9.5, 10.5, 10.5, 12.0)
        elif plot_tier == "spacious":
            return (13.0, 15.0, 14.0, 17.0)
        return (11.5, 13.0, 12.0, 14.5)

    if "bed" in c_type or "guest" in c_type:
        if plot_tier == "compact":
            return (8.5, 9.5, 9.5, 10.5)
        elif plot_tier == "spacious":
            return (11.5, 13.0, 12.5, 14.5)
        return (10.0, 11.0, 11.0, 12.5)

    if "drawing" in c_type:
        if plot_tier == "compact":
            return (10.0, 11.5, 11.0, 12.5)
        elif plot_tier == "spacious":
            return (14.0, 17.0, 15.0, 19.0)
        return (12.0, 14.0, 13.0, 15.5)

    if "living" in c_type or "hall" in c_type or "lounge" in c_type:
        if plot_tier == "compact":
            return (10.0, 11.5, 11.0, 12.5)
        elif plot_tier == "spacious":
            return (15.0, 18.0, 16.0, 20.0)
        return (13.0, 15.0, 14.0, 16.5)

    if "dining" in c_type:
        if plot_tier == "compact":
            return (7.5, 8.5, 8.0, 9.0)
        elif plot_tier == "spacious":
            return (11.0, 13.0, 12.0, 14.0)
        return (9.5, 10.5, 10.5, 12.0)

    if "kitchen" in c_type:
        if plot_tier == "compact":
            return (6.5, 7.5, 7.0, 8.0)
        elif plot_tier == "spacious":
            return (10.0, 12.0, 11.0, 14.0)
        return (8.5, 10.0, 9.5, 11.5)

    if "bath" in c_type or "toilet" in c_type or "powder" in c_type:
        if plot_tier == "compact":
            return (3.8, 5.5, 4.0, 6.0)
        elif plot_tier == "spacious":
            return (5.5, 8.0, 6.0, 9.5)
        return (4.5, 6.5, 5.0, 7.5)

    if "pooja" in c_type or "mandir" in c_type or "puja" in c_type:
        if plot_tier == "compact":
            return (3.5, 4.5, 4.0, 5.0)
        elif plot_tier == "spacious":
            return (5.0, 6.5, 6.0, 7.5)
        return (4.5, 5.0, 5.0, 6.0)

    if "office" in c_type or "study" in c_type:
        if plot_tier == "compact":
            return (7.5, 8.5, 8.5, 9.5)
        elif plot_tier == "spacious":
            return (10.0, 12.0, 11.5, 13.5)
        return (8.5, 9.5, 9.5, 11.0)

    if "balcony" in c_type or "patio" in c_type or "terrace" in c_type:
        if plot_tier == "compact":
            return (3.5, 6.0, 4.0, 7.5)
        elif plot_tier == "spacious":
            return (6.0, 10.0, 7.0, 14.0)
        return (4.5, 8.0, 5.5, 10.0)

    if "store" in c_type:
        if plot_tier == "compact":
            return (3.5, 4.5, 4.0, 5.0)
        elif plot_tier == "spacious":
            return (5.0, 7.0, 6.0, 8.0)
        return (4.5, 5.5, 5.0, 6.5)

    if "utility" in c_type or "laundry" in c_type:
        if plot_tier == "compact":
            return (4.0, 5.0, 4.5, 6.0)
        elif plot_tier == "spacious":
            return (6.0, 7.5, 7.0, 9.0)
        return (4.5, 6.0, 5.5, 7.0)

    if "dressing" in c_type or "closet" in c_type:
        if plot_tier == "compact":
            return (4.0, 5.0, 4.5, 6.0)
        elif plot_tier == "spacious":
            return (6.0, 8.0, 7.0, 10.0)
        return (5.0, 6.5, 5.5, 7.5)

    if "garage" in c_type:
        if plot_tier == "compact":
            return (9.5, 15.0, 10.0, 16.0)
        elif plot_tier == "spacious":
            return (12.0, 20.0, 14.0, 22.0)
        return (10.5, 17.0, 11.5, 18.5)

    # Default generic / Custom Room
    if plot_tier == "compact":
        return (7.0, 8.5, 8.5, 9.5)
    elif plot_tier == "spacious":
        return (10.5, 12.5, 12.0, 14.0)
    return (8.5, 10.0, 10.0, 11.5)


def analyze_and_recommend_dimensions(req: DimensionRecommendationRequest) -> DimensionRecommendationResponse:
    """
    Core deterministic architectural intelligence:
    Evaluates site constraints, buildable envelope, small plot dynamics,
    and program requirements to generate optimal room sizes, feasibility assessment,
    and multi-floor strategies.
    """
    # 1. Convert to canonical feet
    if req.plot_unit == "m":
        plot_w = round(req.plot_width * 3.28084, 1)
        plot_l = round(req.plot_length * 3.28084, 1)
    else:
        plot_w = round(req.plot_width, 1)
        plot_l = round(req.plot_length, 1)

    plot_w = max(15.0, min(200.0, plot_w))
    plot_l = max(20.0, min(250.0, plot_l))
    plot_area = round(plot_w * plot_l, 1)

    # 2. Buildable envelope after setbacks
    sb_front, sb_rear, sb_left, sb_right = compute_adaptive_setbacks(plot_w, plot_l)
    buildable_w = max(10.0, round(plot_w - sb_left - sb_right, 1))
    buildable_l = max(12.0, round(plot_l - sb_front - sb_rear, 1))
    buildable_ground_area = round(buildable_w * buildable_l, 1)

    # Determine plot tier
    if plot_area <= 850 or buildable_ground_area <= 500:
        plot_tier: Literal["compact", "standard", "spacious"] = "compact"
    elif plot_area >= 2200 and buildable_ground_area >= 1400:
        plot_tier = "spacious"
    else:
        plot_tier = "standard"

    num_floors = max(1, req.num_floors)
    parking_cars = max(0, req.parking_cars)

    # Deduct parking footprint on ground if parking is requested
    # A single car parking is 10x16 = 160 sq ft; 2 cars is 18x16 = 288 sq ft
    # On small plots, parking occupies significant ground setback/envelope
    parking_area = 0.0
    if parking_cars == 1:
        parking_area = 160.0
    elif parking_cars >= 2:
        parking_area = 288.0

    # Vertical circulation allowance (staircase) if multiple floors
    staircase_area = (55.0 if plot_tier == "compact" else 80.0) if num_floors > 1 else 0.0

    # Build room program candidates
    raw_rooms: List[Dict[str, Any]] = []

    if req.rooms and len(req.rooms) > 0:
        for idx, item in enumerate(req.rooms):
            r = item.model_dump() if hasattr(item, "model_dump") else (item.dict() if hasattr(item, "dict") else (dict(item) if isinstance(item, dict) else vars(item)))
            qty = max(1, int(r.get("quantity", 1) or 1))
            for q_i in range(qty):
                suffix = f"_{q_i+1}" if qty > 1 else ""
                base_id = r.get("id") or r.get("room_id") or f"room_{idx+1}"
                raw_rooms.append({
                    "id": f"{base_id}{suffix}" if q_i > 0 else base_id,
                    "name": f"{r.get('name', 'Room')}{f' {q_i+1}' if qty > 1 else ''}",
                    "type": r.get("type", "bedroom"),
                    "zone": r.get("zone", "private"),
                    "preferred_floor": r.get("floor_number") or r.get("floor") or 1,
                    "size_mode": r.get("size_mode", "ai_recommended"),
                    "is_hard_constraint": r.get("is_hard_constraint", False) or r.get("size_mode") == "manual",
                    "length": r.get("length"),
                    "width": r.get("width"),
                    "min_length": r.get("min_length"),
                    "min_width": r.get("min_width"),
                    "preferred_length": r.get("preferred_length"),
                    "preferred_width": r.get("preferred_width"),
                })
    else:
        # Social living core
        raw_rooms.append({
            "id": "living_room",
            "name": "Living Room",
            "type": "living_room",
            "zone": "public",
            "preferred_floor": 1,
        })
        raw_rooms.append({
            "id": "kitchen",
            "name": "Kitchen",
            "type": "kitchen",
            "zone": "service",
            "preferred_floor": 1,
        })
        raw_rooms.append({
            "id": "dining",
            "name": "Dining Room",
            "type": "dining",
            "zone": "public",
            "preferred_floor": 1,
        })

        # Master Bedroom
        raw_rooms.append({
            "id": "master_bedroom",
            "name": "Master Suite",
            "type": "master_bedroom",
            "zone": "private",
            "preferred_floor": 1 if num_floors == 1 else 2,
        })

        # Additional Bedrooms
        bedroom_count = max(1, req.bedrooms)
        for b_idx in range(2, bedroom_count + 1):
            f_num = 1 if num_floors == 1 else (3 if num_floors >= 3 and b_idx >= 3 else 2)
            raw_rooms.append({
                "id": f"bedroom_{b_idx}",
                "name": f"Bedroom {b_idx}",
                "type": "bedroom",
                "zone": "private",
                "preferred_floor": f_num,
            })

        # Bathrooms
        att_count = req.attached_bathroom_count if req.attached_bathroom_count is not None else 1
        att_count = max(0, min(bedroom_count, att_count))
        for a_idx in range(1, att_count + 1):
            b_floor = 1 if num_floors == 1 else 2
            raw_rooms.append({
                "id": f"attached_bath_{a_idx}",
                "name": "Master En-suite" if a_idx == 1 else f"Attached Bath {a_idx}",
                "type": "bathroom",
                "zone": "private",
                "preferred_floor": b_floor,
            })

        # Common bath / powder room
        raw_rooms.append({
            "id": "common_bathroom",
            "name": "Common Bathroom",
            "type": "bathroom",
            "zone": "service",
            "preferred_floor": 1,
        })

        # Specialized rooms
        for sp in req.special_rooms:
            sp_lower = sp.lower()
            if "drawing" in sp_lower:
                raw_rooms.append({
                    "id": "drawing",
                    "name": "Drawing Room",
                    "type": "drawing",
                    "zone": "public",
                    "preferred_floor": 1,
                })
            elif "pooja" in sp_lower:
                raw_rooms.append({
                    "id": "pooja",
                    "name": "Pooja Room",
                    "type": "pooja",
                    "zone": "special",
                    "preferred_floor": 1,
                })
            elif "study" in sp_lower or "office" in sp_lower:
                raw_rooms.append({
                    "id": "study",
                    "name": "Study / Office",
                    "type": "office",
                    "zone": "private",
                    "preferred_floor": 1 if num_floors == 1 else 2,
                })
            elif "balcony" in sp_lower:
                raw_rooms.append({
                    "id": "balcony",
                    "name": "Balcony",
                    "type": "balcony",
                    "zone": "special",
                    "preferred_floor": min(2, num_floors),
                })
            elif "store" in sp_lower:
                raw_rooms.append({
                    "id": "store",
                    "name": "Store Room",
                    "type": "store",
                    "zone": "service",
                    "preferred_floor": 1,
                })
            elif "dressing" in sp_lower:
                raw_rooms.append({
                    "id": "dressing",
                    "name": "Dressing Room",
                    "type": "dressing",
                    "zone": "private",
                    "preferred_floor": 1 if num_floors == 1 else 2,
                })
            elif "garage" in sp_lower:
                raw_rooms.append({
                    "id": "garage",
                    "name": "Garage",
                    "type": "garage",
                    "zone": "service",
                    "preferred_floor": 1,
                })
            elif "utility" in sp_lower:
                raw_rooms.append({
                    "id": "utility",
                    "name": "Utility / Wash",
                    "type": "utility",
                    "zone": "service",
                    "preferred_floor": 1,
                })

        # Incorporate custom rooms from request if any
        if req.custom_rooms:
            for cr in req.custom_rooms:
                c_name = cr.get("name", "Custom Room")
                c_type = cr.get("type", "bedroom")
                c_id = cr.get("id", f"custom_{len(raw_rooms)+1}")
                if not any(r["id"] == c_id for r in raw_rooms):
                    raw_rooms.append({
                        "id": c_id,
                        "name": c_name,
                        "type": c_type,
                        "zone": cr.get("zone", "private"),
                        "preferred_floor": cr.get("floor_number", 1),
                    })

    # 3. Compute sizes for each room
    room_specs: List[RoomSizeSpec] = []
    total_ground_carpet = 0.0

    for r_data in raw_rooms:
        r_type = r_data["type"]
        base_min_w, base_min_l, base_pref_w, base_pref_l = get_base_room_proportions(r_type, plot_tier)
        f_num = min(r_data.get("preferred_floor", 1), num_floors)

        is_hard = r_data.get("is_hard_constraint", False) or r_data.get("size_mode") == "manual"
        size_mode: Literal["manual", "ai_recommended"] = "manual" if is_hard else "ai_recommended"

        if is_hard and r_data.get("length") and r_data.get("width"):
            actual_l = float(r_data["length"])
            actual_w = float(r_data["width"])
            pref_l = actual_l
            pref_w = actual_w
            min_l = min(actual_l, base_min_l)
            min_w = min(actual_w, base_min_w)
            rationale = f"HARD USER DIMENSION: Explicitly set to {actual_w} × {actual_l} ft."
        else:
            pref_l = float(r_data.get("preferred_length") or base_pref_l)
            pref_w = float(r_data.get("preferred_width") or base_pref_w)
            min_l = float(r_data.get("min_length") or base_min_l)
            min_w = float(r_data.get("min_width") or base_min_w)
            if plot_tier == "compact":
                rationale = f"Optimized compact footprint to fit within {plot_w}×{plot_l} ft plot envelope."
            elif plot_tier == "spacious":
                rationale = f"Spacious proportions taking full advantage of generous {plot_w}×{plot_l} ft plot."
            else:
                rationale = f"Standard ergonomic residential dimensions for comfortable living."

        room_specs.append(RoomSizeSpec(
            id=r_data["id"],
            name=r_data["name"],
            type=r_type,
            quantity=1,
            size_mode=size_mode,
            length=pref_l,
            width=pref_w,
            min_length=min_l,
            min_width=min_w,
            preferred_length=pref_l,
            preferred_width=pref_w,
            is_hard_constraint=is_hard,
            floor_number=f_num,
            zone=r_data.get("zone", "private"),
            rationale=rationale
        ))

        if f_num == 1:
            total_ground_carpet += (pref_w * pref_l)

    # 4. Feasibility Analysis
    circ_mult = 1.14 if plot_tier == "compact" else 1.22
    total_requested_ground_area = round((total_ground_carpet * circ_mult) + staircase_area + parking_area, 1)
    ground_coverage_pct = round((total_requested_ground_area / max(1.0, buildable_ground_area)) * 100, 1)

    bedroom_count = sum(1 for r in room_specs if "bed" in r.type.lower())

    # Evaluate feasibility status
    feasibility_status: Literal["comfortable", "tight", "requires_multistage", "infeasible"] = "comfortable"
    feasibility_message = ""
    recommended_solution = ""

    if ground_coverage_pct <= 85.0:
        feasibility_status = "comfortable"
        feasibility_message = "✓ Requirements fit within available buildable area."
        recommended_solution = f"Your requirements fit comfortably within this plot ({ground_coverage_pct}% ground coverage). Balanced layout with ample daylight and circulation."
    elif ground_coverage_pct <= 105.0:
        feasibility_status = "tight"
        if num_floors == 1:
            feasibility_message = "⚠ Requirements are tight for this plot."
            recommended_solution = f"Your {plot_w} × {plot_l} ft plot is tight for the requested program ({ground_coverage_pct}% buildable coverage). AI recommends moving bedrooms to an upper floor."
        else:
            feasibility_message = "⚠ Requirements are tight for this plot."
            recommended_solution = f"Ground floor coverage is tight ({ground_coverage_pct}%). Efficient compact corridors applied."
    else:
        # Over 105% of buildable ground envelope
        if num_floors == 1:
            feasibility_status = "requires_multistage"
            bedrooms_to_move = max(1, bedroom_count - 1) if bedroom_count > 1 else 1
            feasibility_message = "⚠ Requirements are tight for this plot."
            recommended_solution = f"Your {plot_w} × {plot_l} ft plot is tight for the requested program. AI recommends moving {bedrooms_to_move} bedrooms to the first floor."
        else:
            # Multi-floor check
            ground_rooms = [r for r in room_specs if r.floor_number == 1]
            upper_rooms = [r for r in room_specs if r.floor_number > 1]
            if len(ground_rooms) > len(upper_rooms) + 2:
                feasibility_status = "tight"
                feasibility_message = "⚠ Requirements are tight for this plot."
                recommended_solution = f"Too many rooms on Ground Floor ({ground_coverage_pct}% coverage). AI recommends relocating bedrooms to upper floors."
            else:
                feasibility_status = "infeasible"
                feasibility_message = "⚠ Requested dimensions cannot fit with the current plot and room program."
                recommended_solution = f"Requested dimensions exceed buildable envelope on {plot_w}×{plot_l} ft plot ({ground_coverage_pct}% coverage). Reduce manual room sizes or room count."

    # 5. Generate 2-3 Viable Strategies
    strategies: List[StrategyOption] = []

    # Strategy 1: Compact Balanced Layout
    strat1_allocs: List[Dict[str, Any]] = []
    for r in room_specs:
        strat1_allocs.append({
            "room_id": r.id,
            "name": r.name,
            "type": r.type,
            "floor_number": r.floor_number,
            "length": r.length,
            "width": r.width,
        })
    strategies.append(StrategyOption(
        id="strat_balanced",
        title="Balanced Residential Flow",
        description="Standard architectural zoning: public living and kitchen on ground, private sleeping suites zoned for privacy.",
        recommended_floors=num_floors,
        feasibility_status="feasible" if ground_coverage_pct <= 100 else "tight",
        room_allocations=strat1_allocs,
    ))

    # Strategy 2: Multi-floor Vertical Stacking (if num_floors > 1 or needed)
    if num_floors > 1 or feasibility_status in ["tight", "requires_multistage"]:
        strat2_allocs: List[Dict[str, Any]] = []
        for r in room_specs:
            f_num = 1
            if "bed" in r.type or "office" in r.type or "balcony" in r.type:
                f_num = 2
            if "attached" in r.id:
                f_num = 2
            strat2_allocs.append({
                "room_id": r.id,
                "name": r.name,
                "type": r.type,
                "floor_number": f_num,
                "length": r.length,
                "width": r.width,
            })
        strategies.append(StrategyOption(
            id="strat_vertical",
            title="Max Living Down, Private Suites Up",
            description="All private quarters moved to the first floor, creating an expansive open living, dining, and garden zone downstairs.",
            recommended_floors=max(2, num_floors),
            feasibility_status="feasible",
            room_allocations=strat2_allocs,
        ))

    # Strategy 3: Compact Space-Saver
    strat3_allocs: List[Dict[str, Any]] = []
    for r in room_specs:
        strat3_allocs.append({
            "room_id": r.id,
            "name": r.name,
            "type": r.type,
            "floor_number": r.floor_number,
            "length": r.min_length,
            "width": r.min_width,
        })
    strategies.append(StrategyOption(
        id="strat_compact",
        title="Compact Space-Saver",
        description="Streamlined dimensions maximizing setback gardens and reducing structural footprint.",
        recommended_floors=num_floors,
        feasibility_status="feasible",
        room_allocations=strat3_allocs,
    ))

    return DimensionRecommendationResponse(
        plot_width_ft=plot_w,
        plot_length_ft=plot_l,
        plot_area_sqft=plot_area,
        buildable_width_ft=buildable_w,
        buildable_length_ft=buildable_l,
        buildable_ground_area_sqft=buildable_ground_area,
        total_requested_ground_area_sqft=total_requested_ground_area,
        ground_coverage_pct=ground_coverage_pct,
        feasibility_status=feasibility_status,
        feasibility_message=feasibility_message,
        recommended_solution=recommended_solution,
        rooms=room_specs,
        strategies=strategies
    )
