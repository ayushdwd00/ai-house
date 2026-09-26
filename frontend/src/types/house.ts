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

export interface MaterialDefinition {
  id: string;
  category: "structural" | "finish" | "site" | "boundary" | "roof" | string;
  name: string;
  base_color: string;
  roughness: number;
  metalness: number;
  texture?: string;
  texture_scale?: number;
  usage?: string;
}

export interface FurnitureItem {
  id: string;
  type: string;
  floor_id?: string;
  room_id?: string;
  x: number;
  y: number;
  width: number;
  length: number;
  depth?: number;
  height?: number;
  rotation: number;
  orientation?: "north" | "south" | "east" | "west";
  clearance_requirements?: Record<string, number>;
  clearance?: Record<string, number>;
  metadata?: Record<string, unknown>;
}

export interface Door {
  id: string;
  door_id?: string;
  floor_id?: string;
  wall_id?: string;
  host_wall_id?: string;
  room_id?: string;
  from_room_id?: string;
  connected_room_id?: string;
  to_room_id?: string;
  from_room?: string;
  to_room?: string;
  position_along_wall?: number;
  x?: number;
  y?: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  height?: number;
  hinge_side?: "left" | "right";
  swing_direction?: "inward" | "outward" | "sliding" | "double";
  swing_angle?: number;
  door_type?: "entry" | "interior" | "bathroom" | "balcony_slider" | "garage" | string;
  type?: string;
  swing?: string;
  orientation?: "north" | "south" | "east" | "west";
  outward_direction?: "north" | "south" | "east" | "west" | string;
  direction_label?: string;
  connects_room_ids?: string[];
  clearance_zone?: Rect;
  metadata?: Record<string, unknown>;
}

export interface WindowItem {
  id: string;
  window_id?: string;
  floor_id?: string;
  wall_id?: string;
  host_wall_id?: string;
  room_id?: string;
  position_along_wall?: number;
  x?: number;
  y?: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  height?: number;
  sill_height?: number;
  head_height?: number;
  window_type?: "casement" | "sliding" | "fixed_picture" | "louver_vent" | string;
  type?: string;
  orientation?: "north" | "south" | "east" | "west";
  outward_direction?: "north" | "south" | "east" | "west" | string;
  direction_label?: string;
  metadata?: Record<string, unknown>;
}

export type Window = WindowItem;

export interface Wall {
  id: string;
  wall_id?: string;
  floor_id?: string;
  start?: Point2D;
  end?: Point2D;
  start_x?: number;
  start_y?: number;
  end_x?: number;
  end_y?: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness: number;
  height?: number;
  wall_type?: "masonry" | "partition" | "curtain_glass" | "boundary_fence" | "exterior" | "interior" | string;
  type?: string;
  is_exterior: boolean;
  adjacent_room_ids?: string[];
  room_ids?: string[];
  connected_room_ids?: string[];
  wall_direction?: "horizontal" | "vertical" | string;
  wall_orientation?: "north" | "south" | "east" | "west";
  openings?: string[];
  volume_cuft?: number;
  net_surface_area_sqft?: number;
  metadata?: Record<string, unknown>;
}

export interface Stair {
  id: string;
  stair_id?: string;
  floor_id?: string;
  floor_from: number;
  floor_to: number;
  rect: Rect;
  x?: number;
  y?: number;
  width: number;
  length?: number;
  riser_inches: number;
  tread_inches: number;
  num_steps: number;
  risers?: number;
  treads?: number;
  stair_type: "dog_legged" | "straight_run" | "l_shaped" | "open_well" | string;
  has_landing: boolean;
  landing_position?: Point2D;
  direction?: "up" | "down" | "bidirectional" | string;
  start_floor?: number;
  end_floor?: number;
  metadata?: Record<string, unknown>;
}

export interface Room {
  id: string;
  room_id?: string;
  floor_id?: string;
  name: string;
  type: RoomType;
  zone: ZoneType;
  floor?: number;
  rect: Rect;
  x?: number;
  y?: number;
  width?: number;
  depth?: number;
  area?: number;
  color: string;
  floor_material: "hardwood_oak" | "tile_marble" | "stone_slate" | "terrazzo" | "wool_carpet" | "wood_deck";
  furniture: FurnitureItem[];
  furniture_ids?: string[];
  door_ids?: string[];
  window_ids?: string[];
  adjacency?: string[];
  circulation?: string[];
  parent_room_id?: string;
  attached_room_id?: string;
  min_width?: number;
  min_length?: number;
  preferred_width?: number;
  preferred_length?: number;
  is_hard_constraint?: boolean;
  size_mode?: "manual" | "ai_recommended";
  area_sqft: number;
  orientation?: "north" | "south" | "east" | "west";
  privacy_level?: "public" | "semi_private" | "private" | "intimate";
  daylight_requirement?: "high" | "medium" | "low" | "none";
  ventilation_requirement?: "direct_exterior" | "indirect" | "mechanical";
  dimensions_label?: string;
  rationale?: string;
  metadata?: Record<string, unknown>;
}

export interface EditRoomResult {
  layout: HouseLayout;
  status: "accepted" | "autocorrected" | "rejected";
  reason?: string | null;
  adjusted_rect: Rect;
  affected_rooms?: string[];
  success?: boolean;
  message?: string;
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

export interface StructuralColumn {
  column_id: string;
  column_type: "corner" | "wall_intersection" | "perimeter" | "stair_support" | "span_support" | "parking_boundary" | "preliminary_column_candidate";
  x: number;
  y: number;
  width: number;
  depth: number;
  floors?: number[];
  floor_ids?: number[];
  supporting_relationship?: string;
  confidence: "PRELIMINARY";
  assumptions?: string[];
}

export interface StructuralBeam {
  beam_id: string;
  start_column_id?: string;
  end_column_id?: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  depth: number;
  beam_type: "plinth_beam" | "floor_beam" | "tie_beam" | "roof_beam" | string;
  span_ft: number;
  floors: number[];
}

export interface StructuralGrid {
  rows: number;
  columns: number;
  x_grid_lines: number[];
  y_grid_lines: number[];
}

export interface StructuralValidationReport {
  unsupported_spans?: Array<{ span_type?: string; from_column?: string; to_column?: string; span_ft?: number; recommendation?: string }>;
  unusually_large_spans?: Array<{ span_type?: string; from_column?: string; to_column?: string; span_ft?: number; recommendation?: string }>;
  columns_conflicting_doors?: string[];
  columns_conflicting_stairs?: string[];
  columns_conflicting_parking?: string[];
  column_alignment_issues?: string[];
  is_acceptable_preliminary?: boolean;
  summary?: string;
}

export interface StructuralPlanning {
  structural_system?: string;
  columns?: StructuralColumn[];
  column_count?: number;
  beams?: StructuralBeam[];
  beam_count?: number;
  grid?: StructuralGrid;
  assumptions?: string[];
  validation_report?: StructuralValidationReport;
  column_grid_suggestions?: Array<{ column_id?: string; x?: number; y?: number; dimensions_in?: string; type?: string; floors?: number[] }>;
  structural_zones?: Array<{ zone_name?: string; bounds?: Rect; recommendation?: string }>;
  load_bearing_wall_candidates?: string[];
  stair_core_location?: { x: number; y: number; width: number; length: number } | null;
  slab_assumptions?: Record<string, unknown>;
  disclaimer?: string;
}

export type LandscapeElementType =
  | "lawn"
  | "tree"
  | "shrub"
  | "flower_bed"
  | "planter"
  | "pathway"
  | "driveway"
  | "garden_seating"
  | "outdoor_light"
  | "water_feature"
  | "pergola"
  | "courtyard"
  | "hedge"
  | "boundary_greenery";

export type LandscapeZoneType =
  | "front_garden"
  | "rear_garden"
  | "side_garden"
  | "courtyard"
  | "entrance_pathway"
  | "driveway"
  | "parking_landscape"
  | "boundary_planting"
  | "other";

export interface LandscapeElement {
  element_id: string;
  type: LandscapeElementType;
  x: number;
  y: number;
  width?: number;
  length?: number;
  radius?: number;
  height?: number;
  species?: string;
  zone?: LandscapeZoneType;
  properties?: Record<string, unknown>;
  points?: Point2D[];
}

export interface LandscapeZone {
  zone_id: string;
  name: string;
  zone_type: LandscapeZoneType;
  rect?: Rect;
  area_sqft: number;
  description?: string;
}

export interface LandscapePlan {
  plan_id: string;
  zones: LandscapeZone[];
  elements: LandscapeElement[];
  paths: LandscapeElement[];
  driveway?: LandscapeElement;
  outdoor_features: LandscapeElement[];
  total_green_area_sqft: number;
  green_coverage_percentage: number;
  trees_count: number;
  lights_count: number;
  water_features_count: number;
  style: string;
  summary?: string;
}

export interface LandscapePreferences {
  style?: string;
  front_garden?: boolean;
  rear_garden?: boolean;
  pathway_type?: string;
  entrance_pathway?: boolean;
  outdoor_lighting?: boolean;
  tree_density?: "low" | "medium" | "dense";
  greenery_level?: "low" | "medium" | "high" | "dense";
  boundary_hedges?: boolean;
  boundary_planting?: boolean;
  trees?: number;
  courtyard?: boolean;
  water_feature?: boolean;
  lawn_priority?: boolean;
  outdoor_seating?: boolean;
  notes?: string;
}

export interface HouseLayout {
  id: string;
  project_id?: string;
  version_number?: number;
  revision_id?: string;
  parent_revision_id?: string;
  title: string;
  designer_rationale: string;
  plot_width: number;
  plot_length: number;
  num_floors: number;
  site?: Site;
  facing?: string;
  orientation?: string;
  total_area_sqft?: number;
  stats: HouseStats;
  floors: FloorPlan[];
  scores?: ArchitecturalScores;
  validation?: ArchitecturalValidation;
  vastu_result?: VastuResult;
  critic_notes?: string[];
  metadata?: Record<string, unknown>;
  structural_planning?: StructuralPlanning;
  structural_system?: string;
  landscape?: LandscapePlan;
  construction_spec?: Record<string, unknown>;
  quantities?: Record<string, unknown>;
  cost_estimate?: Record<string, unknown>;
  materials?: MaterialDefinition[];
  rooms: Room[];
  walls?: Wall[];
  exterior_walls: Wall[];
  interior_walls: Wall[];
  doors: Door[];
  windows: WindowItem[];
  entry_point: { x: number; y: number; direction: number };
}

export interface DreamHomeStructuredRequirements {
  plot: { length: number | null; width: number | null; unit: string };
  floors: number;
  bedrooms: number;
  bathrooms: number;
  attached_bathrooms?: number | null;
  kitchen: boolean;
  living_room: boolean;
  dining_room: boolean;
  parking: { required: boolean; cars: number };
  staircase: { required: boolean; future_floor: boolean };
  preferences: string[];
  style: string;
  natural_light_priority: boolean;
  open_kitchen: boolean;
  special_requirements: string[];
  missing_critical_fields: string[];
  clarification_prompt?: string | null;
  designer_intent?: string;
}

export interface RoomAllocationItem {
  id?: string;
  room_id?: string;
  name: string;
  type: string;
  floor_id: string;
  floor_number: number;
  zone?: ZoneType | string;
  required?: boolean;
  min_area?: number;
  preferred_area?: number;
  max_area?: number;
  privacy?: string;
  daylight?: string;
  ventilation?: string;
  size_mode?: "manual" | "ai_recommended";
  length?: number;
  width?: number;
  min_length?: number;
  min_width?: number;
  preferred_length?: number;
  preferred_width?: number;
  is_hard_constraint?: boolean;
  quantity?: number;
  rationale?: string;
}

export interface PlotDimensionsInput {
  length: number;
  width: number;
  unit: "ft" | "m";
}

export interface StrategyOption {
  id: string;
  title: string;
  description: string;
  recommended_floors: number;
  feasibility_status: "feasible" | "tight" | "infeasible";
  room_allocations: Array<{
    room_id: string;
    name: string;
    type: string;
    floor_number: number;
    length: number;
    width: number;
  }>;
}

export interface DimensionRecommendationResponse {
  plot_width_ft: number;
  plot_length_ft: number;
  plot_area_sqft: number;
  buildable_width_ft: number;
  buildable_length_ft: number;
  buildable_ground_area_sqft: number;
  total_requested_ground_area_sqft: number;
  ground_coverage_pct: number;
  feasibility_status: "comfortable" | "tight" | "requires_multistage" | "infeasible";
  feasibility_message: string;
  recommended_solution: string;
  rooms: RoomAllocationItem[];
  strategies: StrategyOption[];
}

export interface IntakeRequest {
  user_prompt?: string;
  plot_width?: number;
  plot_length?: number;
  plot?: PlotDimensionsInput;
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
  room_allocations?: RoomAllocationItem[];
  room_requirements?: RoomAllocationItem[];
}

export interface DimensionRecommendationRequest {
  plot_width: number;
  plot_length: number;
  plot_unit?: string;
  num_floors?: number;
  bedrooms?: number;
  bathrooms?: number;
  attached_baths?: string;
  attached_bathroom_count?: number;
  parking_cars?: number;
  road_side?: string;
  special_rooms?: string[];
  rooms?: RoomAllocationItem[];
}

export interface RefineRequest {
  current_layout: HouseLayout;
  edit_instruction: string;
  target_room_id?: string;
  preserve_unaffected_rooms?: boolean;
}
