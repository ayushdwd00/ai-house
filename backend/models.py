from typing import List, Dict, Optional, Literal, Tuple, Any, Union
from pydantic import BaseModel, Field
import uuid

# Functional Zones in Residential Architecture
ZoneType = Literal[
    "public",       # Living, foyer, family lounge, dining
    "private",      # Master suite, bedrooms, dressing, en-suites
    "service",      # Kitchen, utility, pantry, laundry, store
    "special",      # Home office/study, pooja, guest room, balcony, courtyard, sit-out
    "circulation",  # Main corridor, private hall, landing, stairwell
    "outdoor",      # Covered patio, deck, verandah
    "parking"       # Carport, garage, driveway
]

RoomType = Literal[
    "living_room",
    "family_lounge",
    "dining",
    "kitchen",
    "utility",
    "pantry",
    "master_bedroom",
    "bedroom",
    "guest_bedroom",
    "bathroom",
    "powder_room",
    "dressing",
    "office",
    "pooja",
    "balcony",
    "patio",
    "hallway",
    "entry_foyer",
    "staircase",
    "parking"
]

PrivacyLevel = Literal["public", "semi_private", "private", "intimate"]
DaylightRequirement = Literal["high", "medium", "low", "none"]
VentilationRequirement = Literal["direct_exterior", "indirect", "mechanical"]

class Point2D(BaseModel):
    x: float
    y: float

class Rect(BaseModel):
    x: float = Field(..., description="Top-left x in feet")
    y: float = Field(..., description="Top-left y in feet")
    width: float = Field(..., description="Width in feet")
    length: float = Field(..., description="Length/height in feet")

    @property
    def area(self) -> float:
        return round(self.width * self.length, 1)

    @property
    def right(self) -> float:
        return round(self.x + self.width, 2)

    @property
    def bottom(self) -> float:
        return round(self.y + self.length, 2)

    @property
    def center(self) -> Point2D:
        return Point2D(x=round(self.x + self.width / 2.0, 2), y=round(self.y + self.length / 2.0, 2))

    @property
    def aspect_ratio(self) -> float:
        longer = max(self.width, self.length)
        shorter = max(0.1, min(self.width, self.length))
        return round(longer / shorter, 2)

class Setbacks(BaseModel):
    front: float = 5.0   # Front setback towards road in feet
    rear: float = 3.0    # Rear setback
    left: float = 3.0    # Left side setback
    right: float = 3.0   # Right side setback

class SetbackProfile(BaseModel):
    country: str = "India"
    state: Optional[str] = None
    city: Optional[str] = None
    authority: Optional[str] = None
    front: float = 5.0
    rear: float = 3.0
    left: float = 3.0
    right: float = 3.0
    source: str = "Preliminary heuristic fallback"
    effective_date: Optional[str] = "2024-01-01"
    confidence: float = 0.8
    is_user_supplied: bool = False
    disclaimer: str = "Preliminary planning assumption — verify with local authority / licensed architect."

class ParkingSpace(BaseModel):
    id: str
    capacity: int = 1  # 1 car, 2 cars, bike
    is_covered: bool = True
    rect: Rect
    vehicle_type: Literal["car", "two_car", "bike_and_car"] = "car"
    access_side: Literal["front", "side", "rear"] = "front"

class Site(BaseModel):
    plot_width: float
    plot_length: float
    total_plot_area: float
    road_side: Literal["north", "south", "east", "west"] = "south"
    frontage_ft: float
    setbacks: Setbacks = Field(default_factory=Setbacks)
    setback_profile: Optional[SetbackProfile] = None
    buildable_envelope: Rect
    parking: Optional[ParkingSpace] = None
    pedestrian_path: Optional[List[Point2D]] = None
    driveway: Optional[Rect] = None
    north_direction: Optional[float] = 0.0

class FurnitureItem(BaseModel):
    id: str
    type: str  # e.g., "king_bed", "queen_bed", "wardrobe", "sofa", "dining_table", "kitchen_counter", "sink", "hob", "refrigerator", "basin", "toilet", "shower", "tv_unit"
    room_id: Optional[str] = None
    x: float = 0.0  # center x in feet
    y: float = 0.0  # center y in feet
    width: float = 0.0
    length: float = 0.0
    position: Optional[Point2D] = None
    dimensions: Optional[Point2D] = None
    rotation: float = 0.0  # degrees 0, 90, 180, 270
    clearance_requirements: Optional[Dict[str, float]] = None

    def __init__(self, **data):
        if "position" in data:
            pos = data["position"]
            if isinstance(pos, Point2D):
                data["x"] = pos.x
                data["y"] = pos.y
            elif isinstance(pos, dict):
                data["x"] = float(pos.get("x", 0.0))
                data["y"] = float(pos.get("y", 0.0))
        elif "x" in data and "y" in data and "position" not in data:
            data["position"] = Point2D(x=float(data["x"]), y=float(data["y"]))

        if "dimensions" in data:
            dim = data["dimensions"]
            if isinstance(dim, Point2D):
                data["width"] = dim.x
                data["length"] = dim.y
            elif isinstance(dim, dict):
                data["width"] = float(dim.get("x", 0.0))
                data["length"] = float(dim.get("y", 0.0))
        elif "width" in data and "length" in data and "dimensions" not in data:
            data["dimensions"] = Point2D(x=float(data["width"]), y=float(data["length"]))

        super().__init__(**data)

class Door(BaseModel):
    id: str
    door_id: Optional[str] = None
    host_wall_id: Optional[str] = None
    from_room_id: Optional[str] = None
    to_room_id: Optional[str] = None
    from_room: Optional[str] = None
    to_room: Optional[str] = None
    position: Optional[Point2D] = None
    x1: float = 0.0
    y1: float = 0.0
    x2: float = 0.0
    y2: float = 0.0
    width: float = 3.0
    height: float = 7.0
    hinge_side: Literal["left", "right"] = "left"
    swing_direction: Literal["inward", "outward", "sliding", "double"] = "inward"
    door_type: str = "interior"
    swing: Optional[str] = "inward_left"
    connects_room_ids: List[str] = []
    clearance_zone: Optional[Rect] = None

    def __init__(self, **data):
        if "door_id" in data and "id" not in data:
            data["id"] = data["door_id"]
        elif "id" in data and "door_id" not in data:
            data["door_id"] = data["id"]

        if "from_room" in data and "from_room_id" not in data:
            data["from_room_id"] = data["from_room"]
        elif "from_room_id" in data and "from_room" not in data:
            data["from_room"] = data["from_room_id"]

        if "to_room" in data and "to_room_id" not in data:
            data["to_room_id"] = data["to_room"]
        elif "to_room_id" in data and "to_room" not in data:
            data["to_room"] = data["to_room_id"]

        if "position" in data:
            pos = data["position"]
            px = pos.x if isinstance(pos, Point2D) else float(pos.get("x", 0.0))
            py = pos.y if isinstance(pos, Point2D) else float(pos.get("y", 0.0))
            w = float(data.get("width", 3.0))
            if "x1" not in data:
                data["x1"] = px - w / 2.0
            if "x2" not in data:
                data["x2"] = px + w / 2.0
            if "y1" not in data:
                data["y1"] = py
            if "y2" not in data:
                data["y2"] = py
        super().__init__(**data)

class Window(BaseModel):
    id: str
    window_id: Optional[str] = None
    host_wall_id: Optional[str] = None
    room_id: Optional[str] = None
    position: Optional[Point2D] = None
    x1: float = 0.0
    y1: float = 0.0
    x2: float = 0.0
    y2: float = 0.0
    width: float = 4.0
    height: float = 4.5
    sill_height: float = 2.5
    head_height: float = 7.0
    window_type: str = "casement"
    orientation: Optional[Literal["north", "south", "east", "west"]] = None

    def __init__(self, **data):
        if "window_id" in data and "id" not in data:
            data["id"] = data["window_id"]
        elif "id" in data and "window_id" not in data:
            data["window_id"] = data["id"]

        if "position" in data:
            pos = data["position"]
            px = pos.x if isinstance(pos, Point2D) else float(pos.get("x", 0.0))
            py = pos.y if isinstance(pos, Point2D) else float(pos.get("y", 0.0))
            w = float(data.get("width", 4.0))
            if "x1" not in data:
                data["x1"] = px - w / 2.0
            if "x2" not in data:
                data["x2"] = px + w / 2.0
            if "y1" not in data:
                data["y1"] = py
            if "y2" not in data:
                data["y2"] = py
        super().__init__(**data)

class Wall(BaseModel):
    id: str
    wall_id: Optional[str] = None
    start: Optional[Point2D] = None
    end: Optional[Point2D] = None
    thickness: float = 0.5  # standard architectural wall in feet
    height: float = 9.0     # ceiling height in feet
    wall_type: str = "interior"
    is_exterior: bool = False
    adjacent_room_ids: List[str] = []
    openings: List[str] = []
    x1: float = 0.0
    y1: float = 0.0
    x2: float = 0.0
    y2: float = 0.0
    connected_room_ids: List[str] = []
    volume_cuft: Optional[float] = None
    net_surface_area_sqft: Optional[float] = None

    def __init__(self, **data):
        if "wall_id" in data and "id" not in data:
            data["id"] = data["wall_id"]
        elif "id" in data and "wall_id" not in data:
            data["wall_id"] = data["id"]

        if data.get("wall_type") == "exterior":
            data["is_exterior"] = True
        elif data.get("is_exterior"):
            data["wall_type"] = "exterior"
        # Auto-populate start and end if x1, y1, x2, y2 provided
        if "x1" in data and "y1" in data and "start" not in data:
            data["start"] = Point2D(x=float(data["x1"]), y=float(data["y1"]))
        elif "start" in data and isinstance(data["start"], Point2D):
            data["x1"] = data["start"].x
            data["y1"] = data["start"].y
        elif "start" in data and isinstance(data["start"], dict):
            data["x1"] = float(data["start"].get("x", 0.0))
            data["y1"] = float(data["start"].get("y", 0.0))

        if "x2" in data and "y2" in data and "end" not in data:
            data["end"] = Point2D(x=float(data["x2"]), y=float(data["y2"]))
        elif "end" in data and isinstance(data["end"], Point2D):
            data["x2"] = data["end"].x
            data["y2"] = data["end"].y
        elif "end" in data and isinstance(data["end"], dict):
            data["x2"] = float(data["end"].get("x", 0.0))
            data["y2"] = float(data["end"].get("y", 0.0))

        if "connected_room_ids" in data and "adjacent_room_ids" not in data:
            data["adjacent_room_ids"] = data["connected_room_ids"]
        elif "adjacent_room_ids" in data and "connected_room_ids" not in data:
            data["connected_room_ids"] = data["adjacent_room_ids"]

        super().__init__(**data)

class Stair(BaseModel):
    id: str
    stair_id: Optional[str] = None
    floor_from: int = 1
    floor_to: int = 2
    rect: Rect
    width: float = 3.5      # flight width in feet
    riser_inches: float = 7.0
    tread_inches: float = 10.5
    riser: Optional[float] = None
    tread: Optional[float] = None
    num_steps: int = 16
    stair_type: Literal["dog_legged", "straight_run", "l_shaped", "open_well", "u_shaped"] = "dog_legged"
    has_landing: bool = True
    landing: bool = True
    stringer: bool = True
    handrail: bool = True
    balustrade: bool = True
    landing_position: Optional[Point2D] = None
    direction: Literal["up", "down", "bidirectional"] = "bidirectional"
    head_clearance_ft: float = 7.0
    railing_metadata: Optional[Dict[str, Any]] = None

    def __init__(self, **data):
        if "stair_id" in data and "id" not in data:
            data["id"] = data["stair_id"]
        elif "id" in data and "stair_id" not in data:
            data["stair_id"] = data["id"]
        if "riser" in data and "riser_inches" not in data:
            data["riser_inches"] = float(data["riser"])
        elif "riser_inches" in data and "riser" not in data:
            data["riser"] = float(data["riser_inches"])
        if "tread" in data and "tread_inches" not in data:
            data["tread_inches"] = float(data["tread"])
        elif "tread_inches" in data and "tread" not in data:
            data["tread"] = float(data["tread_inches"])
        super().__init__(**data)

class StairGeometry(BaseModel):
    id: str
    stair_id: Optional[str] = None
    floor_from: int = 1
    floor_to: int = 2
    rect: Rect
    width_ft: float = 3.5
    riser_in: float = 7.0
    tread_in: float = 10.5
    num_risers: int = 16
    landing_depth_ft: float = 3.5
    stair_type: Literal["dog_legged", "straight_run", "l_shaped", "u_shaped", "open_well"] = "dog_legged"
    handrail_height_in: float = 36.0
    balustrade_spacing_in: float = 4.0
    headroom_clearance_ft: float = 7.0
    has_landing: bool = True

    def __init__(self, **data):
        if "stair_id" in data and "id" not in data:
            data["id"] = data["stair_id"]
        elif "id" in data and "stair_id" not in data:
            data["stair_id"] = data["id"]
        super().__init__(**data)

class Room(BaseModel):
    id: str
    room_id: Optional[str] = None
    floor_id: Optional[str] = None
    name: str
    type: RoomType
    zone: ZoneType
    floor: int = 1
    rect: Optional[Rect] = None
    color: str = "#F8F4EE"
    floor_material: Literal["hardwood_oak", "tile_marble", "stone_slate", "terrazzo", "wool_carpet", "wood_deck"] = "hardwood_oak"
    furniture: List[FurnitureItem] = []
    
    # Architectural Constraints and Rules
    parent_room_id: Optional[str] = None
    attached_room_id: Optional[str] = None  # e.g., Attached Bath linked to Master Bed
    min_width: float = 8.0
    min_length: float = 8.0
    preferred_width: float = 12.0
    preferred_length: float = 14.0
    max_width: Optional[float] = None
    max_length: Optional[float] = None
    actual_width: float = 0.0
    actual_length: float = 0.0
    area_sqft: float = 0.0
    
    # Spatial Requirements
    privacy_level: PrivacyLevel = "public"
    daylight_requirement: DaylightRequirement = "medium"
    ventilation_requirement: VentilationRequirement = "direct_exterior"
    exterior_wall_requirement: bool = False
    required_adjacencies: List[str] = []
    preferred_adjacencies: List[str] = []
    forbidden_adjacencies: List[str] = []
    
    # Metadata & Presentation
    dimensions_label: Optional[str] = None
    rationale: Optional[str] = None

    def __init__(self, **data):
        if "room_id" in data and "id" not in data:
            data["id"] = data["room_id"]
        elif "id" in data and "room_id" not in data:
            data["room_id"] = data["id"]
        if "floor_id" not in data:
            data["floor_id"] = f"floor_{data.get('floor', 1)}"
        super().__init__(**data)
        if self.rect:
            self.actual_width = self.rect.width
            self.actual_length = self.rect.length
            self.area_sqft = self.rect.area
            if not self.dimensions_label:
                self.dimensions_label = f"{round(self.rect.width, 1)}' × {round(self.rect.length, 1)}'"

class CirculationNetwork(BaseModel):
    corridor_rects: List[Rect] = []
    total_circulation_area: float = 0.0
    circulation_efficiency_ratio: float = 0.12  # circulation area / total area (ideal: 10-15%)
    main_spine_axis: Literal["longitudinal", "transverse", "central_hub"] = "central_hub"

class FloorPlan(BaseModel):
    floor_id: Optional[str] = None
    floor_number: int = 1
    floor_name: str = "Ground Floor"
    elevation_ft: float = 0.0
    floor_to_floor_height_ft: float = 10.5
    clear_ceiling_height_ft: float = 9.5
    wall_height_ft: float = 10.0
    slab_thickness_ft: float = 0.5
    rooms: List[Room] = []
    walls: List[Wall] = []
    exterior_walls: List[Wall] = []
    interior_walls: List[Wall] = []
    doors: List[Door] = []
    windows: List[Window] = []
    staircase: Optional[Union[Stair, Rect, StairGeometry]] = None
    circulation: Optional[CirculationNetwork] = None
    floor_slab_area: float = 0.0

    def __init__(self, **data):
        if "floor_id" not in data:
            data["floor_id"] = f"floor_{data.get('floor_number', 1)}"
        if "walls" in data and "exterior_walls" not in data:
            data["exterior_walls"] = [w for w in data["walls"] if w.wall_type == "exterior" or w.is_exterior]
            data["interior_walls"] = [w for w in data["walls"] if w.wall_type != "exterior" and not w.is_exterior]
        elif "exterior_walls" in data and "interior_walls" in data and "walls" not in data:
            data["walls"] = list(data["exterior_walls"]) + list(data["interior_walls"])
        super().__init__(**data)

class ArchitecturalScores(BaseModel):
    overall_score: float = 85.0
    room_program_score: float = 90.0
    size_conformance_score: float = 88.0
    adjacency_score: float = 85.0
    privacy_score: float = 88.0
    circulation_score: float = 82.0
    furniture_fit_score: float = 90.0
    parking_access_score: float = 85.0
    daylight_score: float = 84.0
    ventilation_score: float = 86.0
    space_efficiency_score: float = 88.0
    vastu_score: Optional[float] = 80.0
    vastu_result: Optional[Dict[str, Any]] = None
    score_breakdown: Dict[str, str] = Field(default_factory=dict)

class ValidationIssue(BaseModel):
    severity: Literal["error", "warning", "info"] = "warning"
    category: str = "general"
    room_id: Optional[str] = None
    entity_id: Optional[str] = None
    message: str
    suggestion: Optional[str] = None

class ArchitecturalValidation(BaseModel):
    is_valid: bool = True
    passed_checks: List[str] = Field(default_factory=list)
    hard_failures: List[str] = Field(default_factory=list)
    errors: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    recommendations: List[str] = Field(default_factory=list)
    issues: List[ValidationIssue] = Field(default_factory=list)

    def __init__(self, **data):
        if "errors" in data and "hard_failures" not in data:
            data["hard_failures"] = data["errors"]
        elif "hard_failures" in data and "errors" not in data:
            data["errors"] = data["hard_failures"]
        super().__init__(**data)

class HouseStats(BaseModel):
    total_area_sqft: float
    living_area_sqft: float
    width_ft: float
    length_ft: float
    num_floors: int = 1
    bedroom_count: int
    bathroom_count: float
    aspect_ratio: float
    coverage_percentage: float = 100.0
    circulation_area_sqft: float = 0.0

class ConstructionSpecification(BaseModel):
    structural_system: Literal["rcc_frame", "load_bearing", "custom"] = "rcc_frame"
    external_wall_thickness_in: float = 9.0
    internal_wall_thickness_in: float = 4.5
    external_wall_thickness_ft: float = 0.75
    internal_wall_thickness_ft: float = 0.375
    clear_ceiling_height_ft: float = 9.5
    wall_height_ft: float = 10.0
    floor_to_floor_height_ft: float = 10.5
    slab_thickness_in: float = 6.0
    slab_thickness_ft: float = 0.5
    quality_tier: Literal["basic", "standard", "premium", "custom"] = "standard"
    recommended_value: Optional[str] = None
    reason: Optional[str] = None
    assumptions: List[str] = Field(default_factory=list)
    confidence: float = 0.9
    disclaimer: str = "Preliminary planning recommendation — not structural certification."

    def __init__(self, **data):
        if "external_wall_thickness_in" in data and "external_wall_thickness_ft" not in data:
            data["external_wall_thickness_ft"] = round(float(data["external_wall_thickness_in"]) / 12.0, 4)
        elif "external_wall_thickness_ft" in data and "external_wall_thickness_in" not in data:
            data["external_wall_thickness_in"] = round(float(data["external_wall_thickness_ft"]) * 12.0, 2)

        if "internal_wall_thickness_in" in data and "internal_wall_thickness_ft" not in data:
            data["internal_wall_thickness_ft"] = round(float(data["internal_wall_thickness_in"]) / 12.0, 4)
        elif "internal_wall_thickness_ft" in data and "internal_wall_thickness_in" not in data:
            data["internal_wall_thickness_in"] = round(float(data["internal_wall_thickness_ft"]) * 12.0, 2)

        if "slab_thickness_in" in data and "slab_thickness_ft" not in data:
            data["slab_thickness_ft"] = round(float(data["slab_thickness_in"]) / 12.0, 4)
        elif "slab_thickness_ft" in data and "slab_thickness_in" not in data:
            data["slab_thickness_in"] = round(float(data["slab_thickness_ft"]) * 12.0, 2)

        super().__init__(**data)

class MaterialQuantities(BaseModel):
    plot_area_sqft: float = 0.0
    built_up_area_sqft: float = 0.0
    carpet_area_sqft: float = 0.0
    usable_area_sqft: float = 0.0
    open_area_sqft: float = 0.0
    parking_area_sqft: float = 0.0
    external_wall_length_ft: float = 0.0
    internal_wall_length_ft: float = 0.0
    total_wall_area_sqft: float = 0.0
    wall_volume_cuft: float = 0.0
    openings_deduction_sqft: float = 0.0
    brick_or_block_count: int = 0
    mortar_volume_cuft: float = 0.0
    slab_area_sqft: float = 0.0
    slab_volume_cuft: float = 0.0
    concrete_volume_cuft: float = 0.0
    concrete_volume_cum: float = 0.0
    steel_reinforcement_kg: float = 0.0
    internal_plaster_sqft: float = 0.0
    external_plaster_sqft: float = 0.0
    ceiling_plaster_sqft: float = 0.0
    internal_paint_sqft: float = 0.0
    external_paint_sqft: float = 0.0
    flooring_area_sqft: float = 0.0
    bathroom_wall_tile_sqft: float = 0.0
    bathroom_floor_tile_sqft: float = 0.0
    kitchen_backsplash_sqft: float = 0.0
    door_count: int = 0
    window_count: int = 0
    sanitary_fixture_count: int = 0
    electrical_point_count: int = 0
    boundary_wall_length_ft: float = 0.0
    itemized_details: Dict[str, Any] = Field(default_factory=dict)
    confidence: float = 0.88
    disclaimer: str = "Preliminary quantity estimate derived from architectural geometry. Actual site consumption may vary."

class MaterialRate(BaseModel):
    material_id: str
    material_name: str
    category: str
    unit: str
    low_rate: float
    expected_rate: float
    high_rate: float
    currency: str = "INR"
    country: str = "India"
    state: Optional[str] = None
    city: Optional[str] = None
    source: str = "Regional Benchmark 2024"
    effective_date: str = "2024-01-01"

class MaterialRateContext(BaseModel):
    country: str = "India"
    state: Optional[str] = None
    city: Optional[str] = None
    quality_tier: str = "standard"
    rates: Dict[str, MaterialRate] = Field(default_factory=dict)

class CostEstimateLineItem(BaseModel):
    estimate_item_id: str
    category: str
    item_name: str
    quantity: float
    unit: str
    rate_low: float
    rate_expected: float
    rate_high: float
    cost_low: float
    cost_expected: float
    cost_high: float
    assumption: str = ""
    confidence: float = 0.85

class CostEstimate(BaseModel):
    currency: str = "INR"
    total_low: float = 0.0
    total_expected: float = 0.0
    total_high: float = 0.0
    material_cost_expected: float = 0.0
    labor_cost_expected: float = 0.0
    equipment_and_misc_expected: float = 0.0
    contingency_percentage: float = 5.0
    contingency_cost_expected: float = 0.0
    items: List[CostEstimateLineItem] = Field(default_factory=list)
    area_based_benchmark: Dict[str, float] = Field(default_factory=dict)
    discrepancy_flag: Optional[str] = None
    disclaimer: str = "Preliminary AI-generated planning estimate. Costs vary by exact site location, supplier, contractor, and market conditions."

class BuildingServices(BaseModel):
    plumbing_stacks: List[Dict[str, Any]] = Field(default_factory=list)
    electrical_shafts: List[Dict[str, Any]] = Field(default_factory=list)
    vertical_cores: List[Dict[str, Any]] = Field(default_factory=list)
    drainage_points: List[Dict[str, Any]] = Field(default_factory=list)
    service_zones: List[Dict[str, Any]] = Field(default_factory=list)
    stacking_efficiency_score: float = 85.0
    notes: Optional[str] = None

class StructuralPlanning(BaseModel):
    structural_system: str = "RCC Frame"
    column_grid_suggestions: List[Dict[str, Any]] = Field(default_factory=list)
    structural_zones: List[Dict[str, Any]] = Field(default_factory=list)
    load_bearing_wall_candidates: List[str] = Field(default_factory=list)
    stair_core_location: Optional[Dict[str, float]] = None
    slab_assumptions: Dict[str, Any] = Field(default_factory=dict)
    disclaimer: str = "Preliminary architectural planning only. Final structural design must be verified by a qualified structural engineer."

class FloorPlanSource(BaseModel):
    source_type: Literal["ai_generated", "image_upload", "camera_capture", "cad_import"] = "ai_generated"
    original_filename: Optional[str] = None
    mime_type: Optional[str] = None
    file_size_bytes: Optional[int] = None
    image_width_px: Optional[int] = None
    image_height_px: Optional[int] = None
    scale_x: Optional[float] = None
    scale_y: Optional[float] = None
    scale_unit: str = "feet_per_pixel"
    calibration_source: Optional[str] = None
    calibration_confidence: float = 1.0
    detected_room_count: Optional[int] = None
    detected_entities: Dict[str, Any] = Field(default_factory=dict)
    verification_status: Literal["unverified", "verified", "corrected"] = "unverified"
    warnings: List[str] = Field(default_factory=list)

class ReconstructionVerificationState(BaseModel):
    detected_geometry: Dict[str, Any] = Field(default_factory=dict)
    confidence: float = 0.85
    uncertain_entities: List[Dict[str, Any]] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    suggested_corrections: List[str] = Field(default_factory=list)
    scale_calibrated: bool = False

class HouseLayout(BaseModel):
    id: str
    project_id: Optional[str] = None
    version_number: int = 1
    title: str
    designer_rationale: str
    plot_width: float
    plot_length: float
    num_floors: int = 1
    site: Optional[Site] = None
    stats: HouseStats
    floors: List[FloorPlan] = []
    scores: Optional[ArchitecturalScores] = None
    validation: Optional[ArchitecturalValidation] = None
    critic_notes: Optional[List[str]] = Field(default_factory=list)
    vastu_result: Optional[Dict[str, Any]] = None
    construction_spec: Optional[ConstructionSpecification] = None
    quantities: Optional[MaterialQuantities] = None
    cost_estimate: Optional[CostEstimate] = None
    building_services: Optional[BuildingServices] = None
    structural_planning: Optional[StructuralPlanning] = None
    floorplan_source: Optional[FloorPlanSource] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)

    # Backwards compatibility flat properties for single-floor or legacy consumer code
    rooms: List[Room] = []
    walls: List[Wall] = []
    exterior_walls: List[Wall] = []
    interior_walls: List[Wall] = []
    doors: List[Door] = []
    windows: List[Window] = []
    entry_point: Dict[str, float] = {"x": 0.0, "y": 0.0, "direction": 0.0}

    def __init__(self, **data):
        if "project_id" not in data and "id" in data:
            data["project_id"] = data["id"]
        elif "id" not in data and "project_id" in data:
            data["id"] = data["project_id"]

        if "walls" in data and "exterior_walls" not in data:
            data["exterior_walls"] = [w for w in data["walls"] if w.wall_type == "exterior" or w.is_exterior]
            data["interior_walls"] = [w for w in data["walls"] if w.wall_type != "exterior" and not w.is_exterior]
        elif "exterior_walls" in data and "interior_walls" in data and "walls" not in data:
            data["walls"] = list(data["exterior_walls"]) + list(data["interior_walls"])
        super().__init__(**data)

class ArchitecturalRequirements(BaseModel):
    plot_width: float = Field(default=40.0, description="Plot frontage width in feet")
    plot_length: float = Field(default=50.0, description="Plot depth length in feet")
    road_side: Literal["north", "south", "east", "west"] = Field(default="south", description="Facing direction of access road")
    north_direction: Optional[float] = Field(default=None, description="Compass angle of North in degrees (0 = top, 90 = right, etc.)")
    num_floors: int = Field(default=1, description="Number of stories (1-3)")
    bedrooms: int = Field(default=3, description="Number of bedrooms")
    bathrooms: float = Field(default=2.0, description="Number of bathrooms")
    attached_bathroom_count: Optional[int] = Field(default=None, description="Number of bedrooms that must have an en-suite attached bathroom")
    parking_spaces: int = Field(default=1, description="Vehicular parking spaces (0-2)")
    style: str = Field(default="Modern Scandinavian", description="Architectural design language")
    special_rooms: List[str] = Field(default_factory=list, description="Specialized rooms like Home Office or Pooja")
    open_concept: bool = Field(default=True, description="Open plan living/dining/kitchen flow")
    vastu_compliant: bool = Field(default=False, description="Vastu Shastra directional alignment")
    entrance_preference: Optional[str] = None
    kitchen_preference: Optional[str] = None
    living_preference: Optional[str] = None
    dining_preference: Optional[str] = None
    office_requirement: bool = False
    patio_balcony_requirement: bool = False
    courtyard_requirement: bool = False
    room_preferences: Dict[str, Any] = Field(default_factory=dict)
    architectural_priorities: List[str] = Field(default_factory=list)
    accessibility_requirements: List[str] = Field(default_factory=list)
    privacy_priority: Literal["maximum_isolation", "balanced", "integrated"] = Field(default="balanced")
    designer_intent: str = Field(default="", description="High-level architectural vision statement")
    notes: Optional[str] = None
    user_prompt: str = Field(default="", description="Original user prompt")

class IntakeRequest(BaseModel):
    user_prompt: Optional[str] = None
    plot_width: Optional[float] = 42.0
    plot_length: Optional[float] = 36.0
    num_floors: Optional[int] = 1
    bedrooms: Optional[int] = 3
    bathrooms: Optional[float] = 2.0
    attached_bathroom_count: Optional[int] = None
    road_side: Optional[Literal["north", "south", "east", "west"]] = "south"
    north_direction: Optional[float] = None
    parking_cars: Optional[int] = 1
    style: Optional[str] = "Modern Scandinavian"
    special_rooms: Optional[List[str]] = Field(default_factory=list)
    open_concept: Optional[bool] = True
    vastu_compliant: Optional[bool] = False

    def to_architectural_requirements(self) -> ArchitecturalRequirements:
        special = list(self.special_rooms or [])
        has_office = any("office" in s.lower() or "study" in s.lower() for s in special)
        has_patio = any("patio" in s.lower() or "balcony" in s.lower() or "terrace" in s.lower() for s in special)
        has_courtyard = any("courtyard" in s.lower() for s in special)

        return ArchitecturalRequirements(
            plot_width=float(self.plot_width or 40.0),
            plot_length=float(self.plot_length or 50.0),
            road_side=self.road_side or "south",
            north_direction=self.north_direction,
            num_floors=int(self.num_floors or 1),
            bedrooms=int(self.bedrooms or 3),
            bathrooms=float(self.bathrooms or 2.0),
            attached_bathroom_count=self.attached_bathroom_count,
            parking_spaces=int(self.parking_cars if self.parking_cars is not None else 1),
            style=self.style or "Modern Scandinavian",
            special_rooms=special,
            open_concept=self.open_concept if self.open_concept is not None else True,
            vastu_compliant=self.vastu_compliant if self.vastu_compliant is not None else False,
            office_requirement=has_office,
            patio_balcony_requirement=has_patio,
            courtyard_requirement=has_courtyard,
            user_prompt=self.user_prompt or ""
        )

class RefineRequest(BaseModel):
    current_layout: HouseLayout
    edit_instruction: str
    target_room_id: Optional[str] = None
    preserve_unaffected_rooms: bool = True

class EditRoomRequest(BaseModel):
    current_layout: HouseLayout
    room_id: str
    proposed_rect: Rect

class EditRoomResponse(BaseModel):
    layout: HouseLayout
    status: Literal["accepted", "autocorrected", "rejected"]
    reason: Optional[str] = None
    adjusted_rect: Rect
