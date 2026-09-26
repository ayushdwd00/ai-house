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
    city: Optional[str] = None

class MaterialDefinition(BaseModel):
    id: str
    category: str = "structural"  # structural, finish, site, boundary, roof
    name: str
    base_color: str
    roughness: float = 0.5
    metalness: float = 0.0
    texture: Optional[str] = None
    texture_scale: float = 1.0
    usage: Optional[str] = None

class FurnitureItem(BaseModel):
    id: str
    type: str  # e.g., "king_bed", "queen_bed", "wardrobe", "sofa", "dining_table", "kitchen_counter", "sink", "hob", "refrigerator", "basin", "toilet", "shower", "tv_unit"
    floor_id: Optional[str] = None
    room_id: Optional[str] = None
    x: float = 0.0  # center x in feet
    y: float = 0.0  # center y in feet
    width: float = 0.0
    length: float = 0.0
    depth: Optional[float] = None
    height: float = 2.5
    position: Optional[Point2D] = None
    dimensions: Optional[Point2D] = None
    rotation: float = 0.0  # degrees 0, 90, 180, 270
    orientation: Optional[Literal["north", "south", "east", "west"]] = None
    clearance_requirements: Optional[Dict[str, float]] = None
    clearance: Optional[Dict[str, float]] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)

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

        if "depth" in data and "length" not in data:
            data["length"] = float(data["depth"])
        elif "length" in data and "depth" not in data:
            data["depth"] = float(data["length"])

        if "clearance" in data and "clearance_requirements" not in data:
            data["clearance_requirements"] = data["clearance"]
        elif "clearance_requirements" in data and "clearance" not in data:
            data["clearance"] = data["clearance_requirements"]

        super().__init__(**data)

class Door(BaseModel):
    id: str
    door_id: Optional[str] = None
    floor_id: Optional[str] = None
    wall_id: Optional[str] = None
    host_wall_id: Optional[str] = None
    room_id: Optional[str] = None
    from_room_id: Optional[str] = None
    connected_room_id: Optional[str] = None
    to_room_id: Optional[str] = None
    from_room: Optional[str] = None
    to_room: Optional[str] = None
    position_along_wall: float = 0.5
    position: Optional[Point2D] = None
    x: float = 0.0
    y: float = 0.0
    x1: float = 0.0
    y1: float = 0.0
    x2: float = 0.0
    y2: float = 0.0
    width: float = 3.0
    height: float = 7.0
    hinge_side: Literal["left", "right"] = "left"
    swing_direction: Literal["inward", "outward", "sliding", "double"] = "inward"
    swing_angle: float = 90.0
    door_type: str = "interior"
    type: Optional[str] = None
    swing: Optional[str] = "inward_left"
    orientation: Optional[Literal["north", "south", "east", "west"]] = None
    direction_label: Optional[str] = None
    connects_room_ids: List[str] = []
    clearance_zone: Optional[Rect] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)

    def __init__(self, **data):
        if "door_id" in data and "id" not in data:
            data["id"] = data["door_id"]
        elif "id" in data and "door_id" not in data:
            data["door_id"] = data["id"]

        if "wall_id" in data and "host_wall_id" not in data:
            data["host_wall_id"] = data["wall_id"]
        elif "host_wall_id" in data and "wall_id" not in data:
            data["wall_id"] = data["host_wall_id"]

        if "room_id" in data and "from_room_id" not in data:
            data["from_room_id"] = data["room_id"]
        elif "from_room_id" in data and "room_id" not in data:
            data["room_id"] = data["from_room_id"]

        if "from_room" in data and "from_room_id" not in data:
            data["from_room_id"] = data["from_room"]
            data["room_id"] = data["from_room"]
        elif "from_room_id" in data and "from_room" not in data:
            data["from_room"] = data["from_room_id"]

        if "connected_room_id" in data and "to_room_id" not in data:
            data["to_room_id"] = data["connected_room_id"]
        elif "to_room_id" in data and "connected_room_id" not in data:
            data["connected_room_id"] = data["to_room_id"]

        if "to_room" in data and "to_room_id" not in data:
            data["to_room_id"] = data["to_room"]
            data["connected_room_id"] = data["to_room"]
        elif "to_room_id" in data and "to_room" not in data:
            data["to_room"] = data["to_room_id"]

        if "type" in data and "door_type" not in data:
            data["door_type"] = data["type"]
        elif "door_type" in data and "type" not in data:
            data["type"] = data["door_type"]

        if "position" in data:
            pos = data["position"]
            px = pos.x if isinstance(pos, Point2D) else float(pos.get("x", 0.0))
            py = pos.y if isinstance(pos, Point2D) else float(pos.get("y", 0.0))
            data["x"] = px
            data["y"] = py
            w = float(data.get("width", 3.0))
            if "x1" not in data:
                data["x1"] = px - w / 2.0
            if "x2" not in data:
                data["x2"] = px + w / 2.0
            if "y1" not in data:
                data["y1"] = py
            if "y2" not in data:
                data["y2"] = py
        elif "x1" in data and "x2" in data and "y1" in data and "y2" in data:
            data["x"] = round((float(data["x1"]) + float(data["x2"])) / 2.0, 2)
            data["y"] = round((float(data["y1"]) + float(data["y2"])) / 2.0, 2)
            data["position"] = Point2D(x=data["x"], y=data["y"])

        if "direction_label" not in data and data.get("orientation"):
            did = data.get("id", "D01")
            num = did.split("_")[-1] if "_" in did else did
            data["direction_label"] = f"D{num} · {data['orientation'][0].upper()}"

        super().__init__(**data)

class Window(BaseModel):
    id: str
    window_id: Optional[str] = None
    floor_id: Optional[str] = None
    wall_id: Optional[str] = None
    host_wall_id: Optional[str] = None
    room_id: Optional[str] = None
    position_along_wall: float = 0.5
    position: Optional[Point2D] = None
    x: float = 0.0
    y: float = 0.0
    x1: float = 0.0
    y1: float = 0.0
    x2: float = 0.0
    y2: float = 0.0
    width: float = 4.0
    height: float = 4.5
    sill_height: float = 2.5
    head_height: float = 7.0
    window_type: str = "casement"
    type: Optional[str] = None
    orientation: Optional[Literal["north", "south", "east", "west"]] = None
    outward_direction: Optional[Literal["north", "south", "east", "west"]] = None
    direction_label: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)

    def __init__(self, **data):
        if "window_id" in data and "id" not in data:
            data["id"] = data["window_id"]
        elif "id" in data and "window_id" not in data:
            data["window_id"] = data["id"]

        if "wall_id" in data and "host_wall_id" not in data:
            data["host_wall_id"] = data["wall_id"]
        elif "host_wall_id" in data and "wall_id" not in data:
            data["wall_id"] = data["host_wall_id"]

        if "type" in data and "window_type" not in data:
            data["window_type"] = data["type"]
        elif "window_type" in data and "type" not in data:
            data["type"] = data["window_type"]

        if "orientation" in data and "outward_direction" not in data:
            data["outward_direction"] = data["orientation"]
        elif "outward_direction" in data and "orientation" not in data:
            data["orientation"] = data["outward_direction"]

        if "position" in data:
            pos = data["position"]
            px = pos.x if isinstance(pos, Point2D) else float(pos.get("x", 0.0))
            py = pos.y if isinstance(pos, Point2D) else float(pos.get("y", 0.0))
            data["x"] = px
            data["y"] = py
            w = float(data.get("width", 4.0))
            if "x1" not in data:
                data["x1"] = px - w / 2.0
            if "x2" not in data:
                data["x2"] = px + w / 2.0
            if "y1" not in data:
                data["y1"] = py
            if "y2" not in data:
                data["y2"] = py
        elif "x1" in data and "x2" in data and "y1" in data and "y2" in data:
            data["x"] = round((float(data["x1"]) + float(data["x2"])) / 2.0, 2)
            data["y"] = round((float(data["y1"]) + float(data["y2"])) / 2.0, 2)
            data["position"] = Point2D(x=data["x"], y=data["y"])

        if "direction_label" not in data and data.get("orientation"):
            wid = data.get("id", "W01")
            num = wid.split("_")[-1] if "_" in wid else wid
            data["direction_label"] = f"W{num} · {data['orientation'][0].upper()}"

        super().__init__(**data)

class Wall(BaseModel):
    id: str
    wall_id: Optional[str] = None
    floor_id: Optional[str] = None
    start: Optional[Point2D] = None
    end: Optional[Point2D] = None
    start_x: float = 0.0
    start_y: float = 0.0
    end_x: float = 0.0
    end_y: float = 0.0
    thickness: float = 0.5  # standard architectural wall in feet
    height: float = 9.0     # ceiling height in feet
    wall_type: str = "interior"
    type: Optional[str] = None
    is_exterior: bool = False
    adjacent_room_ids: List[str] = []
    room_ids: List[str] = []
    wall_direction: Optional[str] = None  # "horizontal", "vertical"
    wall_orientation: Optional[Literal["north", "south", "east", "west"]] = None
    openings: List[str] = []
    x1: float = 0.0
    y1: float = 0.0
    x2: float = 0.0
    y2: float = 0.0
    connected_room_ids: List[str] = []
    volume_cuft: Optional[float] = None
    net_surface_area_sqft: Optional[float] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)

    def __init__(self, **data):
        if "wall_id" in data and "id" not in data:
            data["id"] = data["wall_id"]
        elif "id" in data and "wall_id" not in data:
            data["wall_id"] = data["id"]

        if data.get("wall_type") == "exterior":
            data["is_exterior"] = True
        elif data.get("is_exterior"):
            data["wall_type"] = "exterior"

        if "type" in data and "wall_type" not in data:
            data["wall_type"] = data["type"]
        elif "wall_type" in data and "type" not in data:
            data["type"] = data["wall_type"]

        # Harmonize room_ids with adjacent_room_ids
        if "room_ids" in data and "adjacent_room_ids" not in data:
            data["adjacent_room_ids"] = list(data["room_ids"])
        elif "adjacent_room_ids" in data and "room_ids" not in data:
            data["room_ids"] = list(data["adjacent_room_ids"])

        # Auto-populate start and end if x1, y1, x2, y2 provided
        if "start_x" in data and "x1" not in data:
            data["x1"] = float(data["start_x"])
        if "start_y" in data and "y1" not in data:
            data["y1"] = float(data["start_y"])
        if "end_x" in data and "x2" not in data:
            data["x2"] = float(data["end_x"])
        if "end_y" in data and "y2" not in data:
            data["y2"] = float(data["end_y"])

        if "x1" in data and "y1" in data:
            data["start_x"] = float(data["x1"])
            data["start_y"] = float(data["y1"])
            if "start" not in data:
                data["start"] = Point2D(x=float(data["x1"]), y=float(data["y1"]))
        elif "start" in data and isinstance(data["start"], Point2D):
            data["x1"] = data["start"].x
            data["y1"] = data["start"].y
            data["start_x"] = data["start"].x
            data["start_y"] = data["start"].y

        if "x2" in data and "y2" in data:
            data["end_x"] = float(data["x2"])
            data["end_y"] = float(data["y2"])
            if "end" not in data:
                data["end"] = Point2D(x=float(data["x2"]), y=float(data["y2"]))
        elif "end" in data and isinstance(data["end"], Point2D):
            data["x2"] = data["end"].x
            data["y2"] = data["end"].y
            data["end_x"] = data["end"].x
            data["end_y"] = data["end"].y

        if not data.get("wall_direction") and "x1" in data and "x2" in data and "y1" in data and "y2" in data:
            dx = abs(float(data["x2"]) - float(data["x1"]))
            dy = abs(float(data["y2"]) - float(data["y1"]))
            data["wall_direction"] = "horizontal" if dx >= dy else "vertical"
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
    floor_id: Optional[str] = None
    floor_from: int = 1
    floor_to: int = 2
    rect: Rect
    x: float = 0.0
    y: float = 0.0
    width: float = 3.5      # flight width in feet
    length: float = 8.0     # stair run length in feet
    riser_inches: float = 7.0
    tread_inches: float = 10.5
    riser: Optional[float] = None
    tread: Optional[float] = None
    num_steps: int = 16
    risers: int = 16
    treads: int = 15
    stair_type: Literal["dog_legged", "straight_run", "l_shaped", "open_well", "u_shaped"] = "dog_legged"
    has_landing: bool = True
    landing: bool = True
    stringer: bool = True
    handrail: bool = True
    balustrade: bool = True
    landing_position: Optional[Point2D] = None
    direction: Literal["up", "down", "bidirectional"] = "bidirectional"
    head_clearance_ft: float = 7.0
    start_floor: int = 1
    end_floor: int = 2
    railing_metadata: Optional[Dict[str, Any]] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)

    def __init__(self, **data):
        if "stair_id" in data and "id" not in data:
            data["id"] = data["stair_id"]
        elif "id" in data and "stair_id" not in data:
            data["stair_id"] = data["id"]
        if "rect" in data and isinstance(data["rect"], Rect):
            data["x"] = data["rect"].x
            data["y"] = data["rect"].y
            data["length"] = data["rect"].length
            if "width" not in data:
                data["width"] = data["rect"].width
        elif "x" in data and "y" in data and "width" in data and "length" in data and "rect" not in data:
            data["rect"] = Rect(x=float(data["x"]), y=float(data["y"]), width=float(data["width"]), length=float(data["length"]))
        if "riser" in data and "riser_inches" not in data:
            data["riser_inches"] = float(data["riser"])
        elif "riser_inches" in data and "riser" not in data:
            data["riser"] = float(data["riser_inches"])
        if "tread" in data and "tread_inches" not in data:
            data["tread_inches"] = float(data["tread"])
        elif "tread_inches" in data and "tread" not in data:
            data["tread"] = float(data["tread_inches"])
        if "num_steps" in data and "risers" not in data:
            data["risers"] = int(data["num_steps"])
            data["treads"] = max(1, int(data["num_steps"]) - 1)
        elif "risers" in data and "num_steps" not in data:
            data["num_steps"] = int(data["risers"])
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
    zone: ZoneType = "public"
    floor: int = 1
    rect: Optional[Rect] = None
    x: float = 0.0
    y: float = 0.0
    width: float = 0.0
    depth: float = 0.0
    area: float = 0.0
    orientation: Optional[Literal["north", "south", "east", "west"]] = None
    color: str = "#F8F4EE"
    floor_material: Literal["hardwood_oak", "tile_marble", "stone_slate", "terrazzo", "wool_carpet", "wood_deck"] = "hardwood_oak"
    furniture: List[FurnitureItem] = []
    furniture_ids: List[str] = []
    door_ids: List[str] = []
    window_ids: List[str] = []
    adjacency: List[str] = []
    circulation: List[str] = []
    
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
    is_hard_constraint: bool = False
    size_mode: Optional[Literal["manual", "ai_recommended"]] = "ai_recommended"
    
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
    metadata: Dict[str, Any] = Field(default_factory=dict)

    def __init__(self, **data):
        if "room_id" in data and "id" not in data:
            data["id"] = data["room_id"]
        elif "id" in data and "room_id" not in data:
            data["room_id"] = data["id"]
        if "floor_id" not in data:
            data["floor_id"] = f"floor_{data.get('floor', 1)}"
        if not data.get("zone"):
            r_type = data.get("type", "")
            if "bed" in r_type:
                data["zone"] = "private"
            elif "bath" in r_type or "kitchen" in r_type or "utility" in r_type:
                data["zone"] = "service"
            elif "hall" in r_type or "stair" in r_type or "foyer" in r_type:
                data["zone"] = "circulation"
            else:
                data["zone"] = "public"

        # Harmonize rect with x, y, width, depth
        if "rect" in data and data["rect"]:
            r = data["rect"]
            rx = r.x if isinstance(r, Rect) else float(r.get("x", 0.0))
            ry = r.y if isinstance(r, Rect) else float(r.get("y", 0.0))
            rw = r.width if isinstance(r, Rect) else float(r.get("width", 0.0))
            rl = r.length if isinstance(r, Rect) else float(r.get("length", 0.0))
            data["x"] = rx
            data["y"] = ry
            data["width"] = rw
            data["depth"] = rl
            data["area"] = round(rw * rl, 1)
        elif "x" in data and "y" in data and "width" in data and "depth" in data:
            rw = float(data["width"])
            rl = float(data["depth"])
            data["rect"] = Rect(x=float(data["x"]), y=float(data["y"]), width=rw, length=rl)
            data["area"] = round(rw * rl, 1)

        super().__init__(**data)
        if self.rect:
            self.x = self.rect.x
            self.y = self.rect.y
            self.width = self.rect.width
            self.depth = self.rect.length
            self.actual_width = self.rect.width
            self.actual_length = self.rect.length
            self.area_sqft = self.rect.area
            self.area = self.rect.area
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
    quality_tier: Literal["basic", "economy", "standard", "premium", "luxury", "custom"] = "standard"
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
    excavation_volume_cuft: float = 0.0
    excavation_volume_cum: float = 0.0
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

    @property
    def structural_columns_count(self) -> int:
        return self.itemized_details.get("column_count", 0)

    @property
    def column_concrete_volume_cuft(self) -> float:
        return self.itemized_details.get("column_concrete_volume_cuft", 0.0)

    @property
    def column_concrete_volume_cum(self) -> float:
        return self.itemized_details.get("column_concrete_volume_cum", 0.0)

    @property
    def column_reinforcement_allowance_kg(self) -> float:
        return self.itemized_details.get("column_reinforcement_allowance_kg", 0.0)

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
    disclaimer: str = "PRELIMINARY CONSTRUCTION ESTIMATE. Not a contractor quote. Real costs depend on soil, structural engineering, and market conditions."
    exclusions: List[str] = Field(default_factory=list)
    rate_source_summary: Optional[str] = None
    quality_tier: Optional[str] = None
    city: Optional[str] = None

    @property
    def total_cost_expected(self) -> float:
        return self.total_expected

class BuildingServices(BaseModel):
    plumbing_stacks: List[Dict[str, Any]] = Field(default_factory=list)
    electrical_shafts: List[Dict[str, Any]] = Field(default_factory=list)
    vertical_cores: List[Dict[str, Any]] = Field(default_factory=list)
    drainage_points: List[Dict[str, Any]] = Field(default_factory=list)
    service_zones: List[Dict[str, Any]] = Field(default_factory=list)
    stacking_efficiency_score: float = 85.0
    notes: Optional[str] = None

class StructuralColumn(BaseModel):
    column_id: str = Field(..., description="Stable column identifier, e.g. C01, C02")
    column_type: Literal[
        "corner", "wall_intersection", "perimeter", "stair_support",
        "span_support", "parking_boundary", "preliminary_column_candidate"
    ] = "corner"
    x: float = Field(..., description="X coordinate in feet")
    y: float = Field(..., description="Y coordinate in feet")
    width: float = Field(default=0.75, description="Column width in feet (0.75 ft = 9 in)")
    depth: float = Field(default=0.75, description="Column depth in feet (0.75 ft = 9 in)")
    floors: List[int] = Field(default_factory=lambda: [1], description="Floor numbers this column serves")
    floor_ids: List[int] = Field(default_factory=lambda: [1], description="Alias for floors")
    supporting_relationship: str = Field(default="ground_to_roof", description="Structural load path relationship")
    confidence: Literal["PRELIMINARY"] = "PRELIMINARY"
    assumptions: List[str] = Field(default_factory=list)

    def __init__(self, **data):
        if "floors" in data and "floor_ids" not in data:
            data["floor_ids"] = list(data["floors"])
        elif "floor_ids" in data and "floors" not in data:
            data["floors"] = list(data["floor_ids"])
        super().__init__(**data)

class StructuralGrid(BaseModel):
    rows: int = 1
    columns: int = 1
    x_grid_lines: List[float] = Field(default_factory=list)
    y_grid_lines: List[float] = Field(default_factory=list)

class StructuralValidationReport(BaseModel):
    unsupported_spans: List[Dict[str, Any]] = Field(default_factory=list)
    unusually_large_spans: List[Dict[str, Any]] = Field(default_factory=list)
    columns_conflicting_doors: List[str] = Field(default_factory=list)
    columns_conflicting_stairs: List[str] = Field(default_factory=list)
    columns_conflicting_parking: List[str] = Field(default_factory=list)
    column_alignment_issues: List[str] = Field(default_factory=list)
    is_acceptable_preliminary: bool = True
    summary: str = "Preliminary structural checks completed successfully."

class StructuralBeam(BaseModel):
    beam_id: str = Field(..., description="Stable beam identifier, e.g. B01, B02")
    start_column_id: Optional[str] = None
    end_column_id: Optional[str] = None
    x1: float = Field(..., description="Start X coordinate in feet")
    y1: float = Field(..., description="Start Y coordinate in feet")
    x2: float = Field(..., description="End X coordinate in feet")
    y2: float = Field(..., description="End Y coordinate in feet")
    width: float = Field(default=0.75, description="Beam width in feet (0.75 ft = 9 in)")
    depth: float = Field(default=1.25, description="Beam depth in feet (1.25 ft = 15 in)")
    beam_type: Literal["plinth_beam", "floor_beam", "tie_beam", "roof_beam"] = "floor_beam"
    span_ft: float = Field(..., description="Span length in feet")
    floors: List[int] = Field(default_factory=lambda: [1], description="Floors where this beam is present")

class StructuralPlanning(BaseModel):
    structural_system: str = "RCC_FRAME"
    columns: List[StructuralColumn] = Field(default_factory=list)
    column_count: int = 0
    beams: List[StructuralBeam] = Field(default_factory=list)
    beam_count: int = 0
    grid: Optional[StructuralGrid] = None
    assumptions: List[str] = Field(default_factory=list)
    validation_report: Optional[StructuralValidationReport] = None
    column_grid_suggestions: List[Dict[str, Any]] = Field(default_factory=list)
    structural_zones: List[Dict[str, Any]] = Field(default_factory=list)
    load_bearing_wall_candidates: List[str] = Field(default_factory=list)
    stair_core_location: Optional[Dict[str, float]] = None
    slab_assumptions: Dict[str, Any] = Field(default_factory=dict)
    disclaimer: str = (
        "Preliminary structural planning — final column size, spacing, "
        "reinforcement and foundation design require structural-engineer verification."
    )

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
LandscapeElementType = Literal[
    "lawn", "tree", "shrub", "flower_bed", "planter",
    "pathway", "driveway", "garden_seating", "outdoor_light",
    "water_feature", "pergola", "courtyard", "hedge", "boundary_greenery"
]

LandscapeZoneType = Literal[
    "front_garden", "rear_garden", "side_garden", "courtyard",
    "entrance_pathway", "driveway", "parking_landscape", "boundary_planting", "other"
]

class LandscapeElement(BaseModel):
    element_id: str = Field(..., description="Unique stable ID, e.g. TREE_01, PATH_01, LAWN_FRONT")
    type: LandscapeElementType
    x: float = Field(..., description="Center X coordinate in feet")
    y: float = Field(..., description="Center Y coordinate in feet")
    width: Optional[float] = None
    length: Optional[float] = None
    radius: Optional[float] = None
    height: Optional[float] = None
    species: Optional[str] = None
    zone: Optional[LandscapeZoneType] = None
    properties: Dict[str, Any] = Field(default_factory=dict)
    points: Optional[List[Point2D]] = None

class LandscapeZone(BaseModel):
    zone_id: str
    name: str
    zone_type: LandscapeZoneType = "front_garden"
    rect: Optional[Rect] = None
    area_sqft: float = 0.0
    description: Optional[str] = None

class LandscapePlan(BaseModel):
    plan_id: str = "LANDSCAPE_01"
    zones: List[LandscapeZone] = Field(default_factory=list)
    elements: List[LandscapeElement] = Field(default_factory=list)
    paths: List[LandscapeElement] = Field(default_factory=list)
    driveway: Optional[LandscapeElement] = None
    outdoor_features: List[LandscapeElement] = Field(default_factory=list)
    total_green_area_sqft: float = 0.0
    green_coverage_percentage: float = 0.0
    trees_count: int = 0
    lights_count: int = 0
    water_features_count: int = 0
    style: str = "modern_minimal"
    summary: Optional[str] = None

class LandscapePreferences(BaseModel):
    style: Optional[str] = "modern_minimal"
    front_garden: bool = True
    rear_garden: bool = True
    pathway_type: str = "stepping_stones"
    entrance_pathway: bool = True
    outdoor_lighting: bool = True
    tree_density: Literal["low", "medium", "dense"] = "medium"
    greenery_level: Literal["low", "medium", "high", "dense"] = "medium"
    boundary_hedges: bool = True
    boundary_planting: bool = True
    trees: Optional[int] = None
    courtyard: bool = False
    water_feature: bool = False
    lawn_priority: bool = True
    outdoor_seating: bool = True
    notes: Optional[str] = None

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
    structural_system: Optional[str] = "RCC_FRAME"
    landscape: Optional[LandscapePlan] = None
    floorplan_source: Optional[FloorPlanSource] = None
    materials: List[MaterialDefinition] = Field(default_factory=list)
    facing: Optional[str] = "south"
    orientation: Optional[str] = "south"
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
        if "facing" not in data or not data["facing"]:
            site_obj = data.get("site")
            if site_obj and hasattr(site_obj, "road_side") and site_obj.road_side:
                data["facing"] = str(site_obj.road_side).upper()
            elif isinstance(site_obj, dict) and site_obj.get("road_side"):
                data["facing"] = str(site_obj["road_side"]).upper()
            else:
                data["facing"] = str(data.get("orientation", "south")).upper()
        if "orientation" not in data or not data["orientation"]:
            data["orientation"] = str(data.get("facing", "south")).lower()
        if "project_id" not in data and "id" in data:
            data["project_id"] = data["id"]
        elif "id" not in data and "project_id" in data:
            data["id"] = data["project_id"]

        if "title" not in data:
            data["title"] = "Architectural Residence Plan"
        if "designer_rationale" not in data:
            data["designer_rationale"] = "Synthesized by AI architectural engine."
        if "stats" not in data:
            pw = float(data.get("plot_width", 40.0))
            pl = float(data.get("plot_length", 50.0))
            rooms = data.get("rooms", [])
            bed_count = len([r for r in rooms if "bed" in (getattr(r, "type", "") or "")])
            data["stats"] = HouseStats(
                total_area_sqft=round(pw * pl, 1),
                living_area_sqft=round(pw * pl * 0.7, 1),
                width_ft=pw,
                length_ft=pl,
                num_floors=int(data.get("num_floors", 1)),
                bedroom_count=max(1, bed_count),
                bathroom_count=1.0,
                aspect_ratio=round(max(pw, pl) / max(0.1, min(pw, pl)), 2),
            )

        if "walls" in data and "exterior_walls" not in data:
            data["exterior_walls"] = [w for w in data["walls"] if w.wall_type == "exterior" or w.is_exterior]
            data["interior_walls"] = [w for w in data["walls"] if w.wall_type != "exterior" and not w.is_exterior]
        elif "exterior_walls" in data and "interior_walls" in data and "walls" not in data:
            data["walls"] = list(data["exterior_walls"]) + list(data["interior_walls"])
        super().__init__(**data)

class RoomAllocationItem(BaseModel):
    id: Optional[str] = None
    room_id: Optional[str] = None
    name: str
    type: str
    floor_id: str = "floor_1"
    floor_number: int = 1
    zone: Optional[str] = "private"
    required: bool = True
    min_area: Optional[float] = None
    preferred_area: Optional[float] = None
    max_area: Optional[float] = None
    privacy: Optional[str] = None
    daylight: Optional[str] = None
    ventilation: Optional[str] = None
    size_mode: Optional[Literal["manual", "ai_recommended"]] = "ai_recommended"
    length: Optional[float] = None
    width: Optional[float] = None
    min_length: Optional[float] = None
    min_width: Optional[float] = None
    preferred_length: Optional[float] = None
    preferred_width: Optional[float] = None
    is_hard_constraint: Optional[bool] = False
    quantity: Optional[int] = 1

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
    landscape_preferences: Optional[LandscapePreferences] = None
    room_allocations: Optional[List[RoomAllocationItem]] = None
    llm_source: Optional[str] = Field(default="llm", description="Source tracking: 'llm', 'retry', or 'deterministic_fallback'")
    metadata: Dict[str, Any] = Field(default_factory=dict)

class IntakeRequest(BaseModel):
    user_prompt: Optional[str] = None
    plot_width: Optional[float] = 42.0
    plot_length: Optional[float] = 36.0
    plot: Optional[Dict[str, Any]] = None
    num_floors: Optional[int] = 1
    bedrooms: Optional[int] = 3
    bathrooms: Optional[float] = 2.0
    attached_bathroom_count: Optional[int] = None
    road_side: Optional[Literal["north", "south", "east", "west"]] = None
    facing: Optional[str] = None
    orientation: Optional[str] = None
    north_direction: Optional[float] = None
    parking_cars: Optional[int] = 1
    style: Optional[str] = "Modern Scandinavian"
    special_rooms: Optional[List[str]] = Field(default_factory=list)
    open_concept: Optional[bool] = True
    vastu_compliant: Optional[bool] = False
    landscape_preferences: Optional[LandscapePreferences] = None
    room_allocations: Optional[List[RoomAllocationItem]] = None
    room_requirements: Optional[List[RoomAllocationItem]] = None

    def __init__(self, **data):
        facing_val = data.get("facing") or data.get("orientation")
        road_val = data.get("road_side")
        if facing_val:
            f_str = str(facing_val).strip().lower()
            for d in ["west", "east", "north", "south"]:
                if d in f_str:
                    data["facing"] = d
                    data["orientation"] = d
                    if not road_val or road_val == "south" or "facing" in data:
                        data["road_side"] = d
                    break
        elif road_val:
            r_str = str(road_val).strip().lower()
            for d in ["west", "east", "north", "south"]:
                if d in r_str:
                    data["road_side"] = d
                    data["facing"] = d
                    data["orientation"] = d
                    break
        if "road_side" not in data or not data["road_side"]:
            data["road_side"] = "south"
        if "facing" not in data or not data["facing"]:
            data["facing"] = data["road_side"]
        if "orientation" not in data or not data["orientation"]:
            data["orientation"] = data["road_side"]
        super().__init__(**data)

    def to_architectural_requirements(self) -> ArchitecturalRequirements:
        special = list(self.special_rooms or [])
        has_office = any("office" in s.lower() or "study" in s.lower() for s in special)
        has_patio = any("patio" in s.lower() or "balcony" in s.lower() or "terrace" in s.lower() for s in special)
        has_courtyard = any("courtyard" in s.lower() for s in special)

        pw = float(self.plot_width or 40.0)
        pl = float(self.plot_length or 50.0)
        if self.plot:
            w_raw = self.plot.get("width")
            l_raw = self.plot.get("length")
            unit = self.plot.get("unit", "ft")
            mult = 3.28084 if unit == "m" else 1.0
            if w_raw:
                pw = round(float(w_raw) * mult, 1)
            if l_raw:
                pl = round(float(l_raw) * mult, 1)

        allocs = self.room_requirements or self.room_allocations

        resolved_road = "south"
        for candidate in [self.facing, self.orientation, self.road_side]:
            if candidate:
                c_str = str(candidate).strip().lower()
                if "west" in c_str:
                    resolved_road = "west"
                    break
                elif "east" in c_str:
                    resolved_road = "east"
                    break
                elif "north" in c_str:
                    resolved_road = "north"
                    break
                elif "south" in c_str:
                    resolved_road = "south"
                    break

        return ArchitecturalRequirements(
            plot_width=pw,
            plot_length=pl,
            road_side=resolved_road,
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
            user_prompt=self.user_prompt or "",
            landscape_preferences=self.landscape_preferences,
            room_allocations=allocs
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
    push_adjacent: bool = True

class EditRoomResponse(BaseModel):
    layout: HouseLayout
    status: Literal["accepted", "autocorrected", "rejected"]
    reason: Optional[str] = None
    adjusted_rect: Rect
    affected_rooms: List[str] = Field(default_factory=list)

    @property
    def success(self) -> bool:
        return self.status in ["accepted", "autocorrected"]

    @property
    def message(self) -> str:
        return self.reason or ""

class DreamHomeStructuredRequirements(BaseModel):
    plot: Dict[str, Any] = Field(
        default_factory=lambda: {"length": None, "width": None, "unit": "ft"},
        description="Plot dimensions: length, width, unit"
    )
    floors: int = Field(default=1, description="Number of floors")
    bedrooms: int = Field(default=3, description="Number of bedrooms")
    bathrooms: float = Field(default=2.0, description="Number of bathrooms")
    attached_bathrooms: Optional[int] = Field(default=None, description="Number of attached en-suite bathrooms")
    kitchen: bool = Field(default=True, description="Whether kitchen is required")
    living_room: bool = Field(default=True, description="Whether living room is required")
    dining_room: bool = Field(default=True, description="Whether dining room is required")
    parking: Dict[str, Any] = Field(
        default_factory=lambda: {"required": True, "cars": 1},
        description="Parking requirements"
    )
    staircase: Dict[str, Any] = Field(
        default_factory=lambda: {"required": False, "future_floor": False},
        description="Staircase requirements including future expansion"
    )
    preferences: List[str] = Field(default_factory=list, description="Architectural preferences")
    style: str = Field(default="modern", description="Architectural style")
    natural_light_priority: bool = Field(default=True, description="Daylight priority")
    open_kitchen: bool = Field(default=True, description="Open kitchen concept")
    special_requirements: List[str] = Field(default_factory=list, description="Specialized spaces or lifestyle requests")
    missing_critical_fields: List[str] = Field(default_factory=list, description="Critical fields missing from user prompt")
    clarification_prompt: Optional[str] = Field(default=None, description="Short targeted question for missing critical information")
    designer_intent: str = Field(default="", description="High-level architectural vision statement")
    landscape_preferences: Optional[LandscapePreferences] = None

    def to_intake_request(self) -> IntakeRequest:
        p_w = self.plot.get("width")
        p_l = self.plot.get("length")
        # default to 40x50 if still unset
        width_val = float(p_w) if p_w is not None else 40.0
        length_val = float(p_l) if p_l is not None else 50.0

        parking_cars = int(self.parking.get("cars", 1)) if self.parking.get("required", True) else 0

        special = list(self.special_requirements or [])
        if self.staircase.get("required") and "Staircase" not in special:
            special.append("Staircase")

        return IntakeRequest(
            plot_width=width_val,
            plot_length=length_val,
            num_floors=self.floors,
            bedrooms=self.bedrooms,
            bathrooms=self.bathrooms,
            attached_bathroom_count=self.attached_bathrooms,
            parking_cars=parking_cars,
            style=self.style or "Modern Scandinavian",
            special_rooms=special,
            open_concept=self.open_kitchen,
            landscape_preferences=self.landscape_preferences,
            user_prompt=f"Dream Home: {self.bedrooms} bed, {self.bathrooms} bath, {self.style} style"
        )

class GenerationFailureResponse(BaseModel):
    status: Literal["failed"] = "failed"
    stage: str
    error_code: str
    message: str
    diagnostics: Dict[str, Any] = Field(default_factory=dict)

