export type ZoneType =
  | "public"
  | "private"
  | "service"
  | "special"
  | "circulation"
  | "outdoor"
  | "parking";

export type RoomType =
  | "living_room"
  | "family_lounge"
  | "dining"
  | "kitchen"
  | "utility"
  | "pantry"
  | "master_bedroom"
  | "bedroom"
  | "guest_bedroom"
  | "bathroom"
  | "powder_room"
  | "dressing"
  | "office"
  | "pooja"
  | "balcony"
  | "patio"
  | "hallway"
  | "entry_foyer"
  | "staircase"
  | "parking";

export interface Point2D {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  length: number;
}

export interface Setbacks {
  front: number;
  rear: number;
  left: number;
  right: number;
}

export interface ParkingSpace {
  id: string;
  capacity: number;
  is_covered: boolean;
  rect: Rect;
  vehicle_type: "car" | "two_car" | "bike_and_car";
  access_side: "front" | "side" | "rear";
}

export interface Site {
  plot_width: number;
  plot_length: number;
  total_plot_area: number;
  road_side: "north" | "south" | "east" | "west";
  frontage_ft: number;
  setbacks: Setbacks;
  buildable_envelope: Rect;
  parking?: ParkingSpace;
  pedestrian_path?: Point2D[];
  driveway?: Rect;
  north_direction?: number;
}

export interface FurnitureItem {
  id: string;
  type: string;
  room_id?: string;
  x: number;
  y: number;
  width: number;
  length: number;
  rotation: number;
  clearance_requirements?: Record<string, number>;
}

export interface Door {
  id: string;
  host_wall_id?: string;
  from_room_id?: string;
  to_room_id?: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  height?: number;
  hinge_side?: "left" | "right";
  swing_direction?: "inward" | "outward" | "sliding" | "double";
  door_type?: "entry" | "interior" | "bathroom" | "balcony_slider" | "garage";
  swing?: string;
  connects_room_ids?: string[];
}

export interface WindowItem {
  id: string;
  host_wall_id?: string;
  room_id?: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  height?: number;
  sill_height?: number;
  window_type?: "casement" | "sliding" | "fixed_picture" | "louver_vent";
}

export interface Wall {
  id: string;
  start?: Point2D;
  end?: Point2D;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness: number;
  height?: number;
  wall_type?: "masonry" | "partition" | "curtain_glass" | "boundary_fence";
  is_exterior: boolean;
  adjacent_room_ids?: string[];
  connected_room_ids?: string[];
}

export interface Stair {
  id: string;
  floor_from: number;
  floor_to: number;
  rect: Rect;
  width: number;
  riser_inches: number;
  tread_inches: number;
  num_steps: number;
  stair_type: "dog_legged" | "straight_run" | "l_shaped" | "open_well";
  has_landing: boolean;
  landing_position?: Point2D;
}

export interface Room {
  id: string;
  name: string;
  type: RoomType;
  zone: ZoneType;
  floor?: number;
  rect: Rect;
  color: string;
  floor_material: "hardwood_oak" | "tile_marble" | "stone_slate" | "terrazzo" | "wool_carpet" | "wood_deck";
  furniture: FurnitureItem[];
  parent_room_id?: string;
  attached_room_id?: string;
  min_width?: number;
  min_length?: number;
  preferred_width?: number;
  preferred_length?: number;
  area_sqft: number;
  privacy_level?: "public" | "semi_private" | "private" | "intimate";
  daylight_requirement?: "high" | "medium" | "low" | "none";
  ventilation_requirement?: "direct_exterior" | "indirect" | "mechanical";
  dimensions_label?: string;
  rationale?: string;
}

export interface CirculationNetwork {
  corridor_rects: Rect[];
  total_circulation_area: number;
  circulation_efficiency_ratio: number;
  main_spine_axis: "longitudinal" | "transverse" | "central_hub";
}

export interface FloorPlan {
  floor_number: number;
  floor_name: string;
  rooms: Room[];
  walls?: Wall[];
  exterior_walls: Wall[];
  interior_walls: Wall[];
  doors: Door[];
  windows: WindowItem[];
  staircase?: Stair | Rect;
  circulation?: CirculationNetwork;
  floor_slab_area?: number;
}

export interface VastuRuleEvaluation {
  rule_id: string;
  room_id: string;
  room_name: string;
  category: string;
  severity: "mandatory" | "preferred" | "neutral" | "avoid";
  expected_zone: string;
  actual_zone: string;
  status: "satisfied" | "partially_satisfied" | "violated";
  explanation: string;
  score_contribution: number;
}

export interface VastuResult {
  overall_score: number;
  orientation_interpreted: string;
  rule_results: VastuRuleEvaluation[];
  satisfied_rules: string[];
  violated_rules: string[];
  warnings: string[];
  recommendations: string[];
  zone_occupancy: Record<string, string[]>;
}

export interface ArchitecturalScores {
  overall_score: number;
  room_program_score: number;
  size_conformance_score: number;
  adjacency_score: number;
  privacy_score: number;
  circulation_score: number;
  furniture_fit_score: number;
  parking_access_score: number;
  daylight_score: number;
  ventilation_score: number;
  space_efficiency_score: number;
  vastu_score?: number;
  vastu_result?: VastuResult;
  score_breakdown?: Record<string, string>;
}

export interface ArchitecturalValidation {
  is_valid: boolean;
  passed_checks: string[];
  hard_failures: string[];
  warnings: string[];
  recommendations: string[];
}

export interface HouseStats {
  total_area_sqft: number;
  living_area_sqft: number;
  width_ft: number;
  length_ft: number;
  num_floors: number;
  bedroom_count: number;
  bathroom_count: number;
  aspect_ratio: number;
  coverage_percentage: number;
  circulation_area_sqft?: number;
}

export interface HouseLayout {
  id: string;
  title: string;
  designer_rationale: string;
  plot_width: number;
  plot_length: number;
  num_floors: number;
  site?: Site;
  stats: HouseStats;
  floors: FloorPlan[];
  scores?: ArchitecturalScores;
  validation?: ArchitecturalValidation;
  vastu_result?: VastuResult;
  critic_notes?: string[];
  metadata?: Record<string, unknown>;
  rooms: Room[];
  walls?: Wall[];
  exterior_walls: Wall[];
  interior_walls: Wall[];
  doors: Door[];
  windows: WindowItem[];
  entry_point: { x: number; y: number; direction: number };
}

export interface IntakeRequest {
  user_prompt?: string;
  plot_width?: number;
  plot_length?: number;
  num_floors?: number;
  bedrooms?: number;
  bathrooms?: number;
  attached_bathroom_count?: number;
  road_side?: "north" | "south" | "east" | "west";
  north_direction?: number;
  parking_cars?: number;
  style?: string;
  special_rooms?: string[];
  open_concept?: boolean;
  vastu_compliant?: boolean;
}

export interface RefineRequest {
  current_layout: HouseLayout;
  edit_instruction: string;
  target_room_id?: string;
  preserve_unaffected_rooms?: boolean;
}
