"""
Spatial Geometry Solver Module
Uses Google OR-Tools CP-SAT solver coupled with Shapely 2D geometry engine.
Solves room positions, dimensions, non-overlap constraints, attached bathrooms,
circulation access, and topological affinities within the site buildable envelope.
"""

from typing import List, Dict, Tuple, Optional, Any
import math
from ortools.sat.python import cp_model
from shapely.geometry import box, Polygon, LineString

from models import Room, Site, Rect, Point2D
from architecture.topology_engine import ArchitecturalScheme
from architecture.zoning_graph import (
    REQUIRED_ADJACENCY, STRONG_ADJACENCY, PREFERRED_ADJACENCY,
    PREFERRED_SEPARATION, REQUIRED_SEPARATION
)

# Resolution: 2 units per foot (0.5 ft = 6-inch architectural grid)
GRID_SCALE = 2


class SolverCandidate:
    def __init__(self, scheme_id: str, rooms: List[Room], solved_rects: Dict[str, Rect]):
        self.scheme_id = scheme_id
        self.rooms = rooms
        self.solved_rects = solved_rects
        self.is_valid = True
        self.validation_errors: List[str] = []


def solve_spatial_layout(
    rooms: List[Room],
    site: Site,
    scheme: ArchitecturalScheme,
    time_limit_sec: float = 3.0,
    pinned_rooms: Optional[Dict[str, Rect]] = None,
    variant_seed: Optional[int] = None
) -> Optional[SolverCandidate]:
    """
    CP-SAT constraint formulation for residential floor planning.
    Ensures zero room overlaps, respect of minimum and maximum sizes,
    attached bathroom adjacency, optimal room aspect ratios, deterministic
    random seeding, and support for pinned rooms.
    """
    env = site.buildable_envelope
    env_w_int = int(round(env.width * GRID_SCALE))
    env_l_int = int(round(env.length * GRID_SCALE))

    model = cp_model.CpModel()

    x_vars: Dict[str, cp_model.IntVar] = {}
    y_vars: Dict[str, cp_model.IntVar] = {}
    w_vars: Dict[str, cp_model.IntVar] = {}
    l_vars: Dict[str, cp_model.IntVar] = {}
    x_intervals = []
    y_intervals = []

    objective_terms = []

    for r in rooms:
        is_pinned = pinned_rooms and (r.id in pinned_rooms or r.type in pinned_rooms)
        if is_pinned:
            p_rect = pinned_rooms[r.id] if (pinned_rooms and r.id in pinned_rooms) else pinned_rooms[r.type]
            p_w = max(1, int(round(p_rect.width * GRID_SCALE)))
            p_l = max(1, int(round(p_rect.length * GRID_SCALE)))
            p_x = int(round((p_rect.x - env.x) * GRID_SCALE))
            p_y = int(round((p_rect.y - env.y) * GRID_SCALE))
            p_x = max(0, min(max(0, env_w_int - p_w), p_x))
            p_y = max(0, min(max(0, env_l_int - p_l), p_y))

            w = model.NewIntVar(p_w, p_w, f"w_{r.id}")
            l = model.NewIntVar(p_l, p_l, f"l_{r.id}")
            x = model.NewIntVar(p_x, p_x, f"x_{r.id}")
            y = model.NewIntVar(p_y, p_y, f"y_{r.id}")
        else:
            is_hard = getattr(r, "is_hard_constraint", False) or getattr(r, "size_mode", "") == "manual"
            if is_hard:
                # Level 1: HARD USER DIMENSION (strictly locked, never violated)
                pref_w = int(round(r.preferred_width * GRID_SCALE))
                pref_l = int(round(r.preferred_length * GRID_SCALE))
                w = model.NewIntVar(pref_w, pref_w, f"w_{r.id}")
                l = model.NewIntVar(pref_l, pref_l, f"l_{r.id}")
                x = model.NewIntVar(0, max(0, env_w_int - pref_w), f"x_{r.id}")
                y = model.NewIntVar(0, max(0, env_l_int - pref_l), f"y_{r.id}")
                min_w = pref_w
                min_l = pref_l
            else:
                # Level 2 & 3: PREFERRED & MINIMUM DIMENSIONS
                min_w = int(round(r.min_width * GRID_SCALE))
                max_w = int(round(r.max_width * GRID_SCALE))
                min_l = int(round(r.min_length * GRID_SCALE))
                max_l = int(round(r.max_length * GRID_SCALE))
                pref_w = int(round(r.preferred_width * GRID_SCALE))
                pref_l = int(round(r.preferred_length * GRID_SCALE))

                # Clamp max within envelope
                max_w = min(max_w, env_w_int)
                max_l = min(max_l, env_l_int)
                min_w = min(min_w, max_w)
                min_l = min(min_l, max_l)

                # Variables
                w = model.NewIntVar(min_w, max_w, f"w_{r.id}")
                l = model.NewIntVar(min_l, max_l, f"l_{r.id}")
                x = model.NewIntVar(0, max(0, env_w_int - min_w), f"x_{r.id}")
                y = model.NewIntVar(0, max(0, env_l_int - min_l), f"y_{r.id}")

        # Ensure containment within buildable envelope
        x_end = model.NewIntVar(min_w if not is_pinned else p_w, env_w_int, f"x_end_{r.id}")
        y_end = model.NewIntVar(min_l if not is_pinned else p_l, env_l_int, f"y_end_{r.id}")
        model.Add(x_end == x + w)
        model.Add(y_end == y + l)

        # HARD CONSTRAINT: Strict aspect ratio limits ensuring clean rectangular rooms with zero slivers
        if not is_pinned and r.type not in ["hallway", "staircase"]:
            habitable_set = {
                "living_room", "family_lounge", "dining", "kitchen",
                "master_bedroom", "bedroom", "guest_bedroom", "office", "pooja"
            }
            if r.type in habitable_set:
                # Aspect ratio <= 1.35:1 (e.g. 10x13, 12x15) for balanced rectangular rooms
                model.Add(10 * w <= 14 * l)
                model.Add(10 * l <= 14 * w)
                # Ensure minimum 9ft in both dimensions for any primary habitable space
                model.Add(w >= 9 * GRID_SCALE)
                model.Add(l >= 9 * GRID_SCALE)
            else:
                # Secondary spaces (bathroom, utility, foyer, balcony) <= 1.5:1
                model.Add(10 * w <= 15 * l)
                model.Add(10 * l <= 15 * w)
                # Ensure minimum 4.5ft width
                model.Add(w >= int(round(4.5 * GRID_SCALE)))
                model.Add(l >= int(round(4.5 * GRID_SCALE)))

        # 2D Interval variables for global no-overlap constraint
        x_iv = model.NewIntervalVar(x, w, x_end, f"x_iv_{r.id}")
        y_iv = model.NewIntervalVar(y, l, y_end, f"y_iv_{r.id}")

        x_vars[r.id] = x
        y_vars[r.id] = y
        w_vars[r.id] = w
        l_vars[r.id] = l
        x_intervals.append(x_iv)
        y_intervals.append(y_iv)

        if not is_pinned:
            # Strong objective: Proximity to preferred dimensions
            diff_w = model.NewIntVar(0, env_w_int, f"diff_w_{r.id}")
            diff_l = model.NewIntVar(0, env_l_int, f"diff_l_{r.id}")
            model.Add(diff_w >= w - pref_w)
            model.Add(diff_w >= pref_w - w)
            model.Add(diff_l >= l - pref_l)
            model.Add(diff_l >= pref_l - l)
            objective_terms.append(diff_w * 10)
            objective_terms.append(diff_l * 10)

            # Strong objective: Aspect ratio penalty (bias rooms toward clean balanced rectangles)
            if r.type not in ["hallway", "staircase"]:
                diff_aspect = model.NewIntVar(0, env_w_int + env_l_int, f"aspect_{r.id}")
                model.Add(diff_aspect >= w - l)
                model.Add(diff_aspect >= l - w)
                objective_terms.append(diff_aspect * 20)

            # Topological placement hints from scheme
            if r.id in scheme.zone_placements:
                hint = scheme.zone_placements[r.id]
                rel_y = hint.get("rel_y")
                rel_x = hint.get("rel_x")

                road = site.road_side
                if rel_y == "front":
                    dev_y = model.NewIntVar(0, env_l_int, f"dev_front_{r.id}")
                    if road == "south":
                        model.Add(dev_y >= env_l_int - (y + l))
                    else:
                        model.Add(dev_y >= y)
                    objective_terms.append(dev_y * 8)
                elif rel_y == "rear":
                    dev_y = model.NewIntVar(0, env_l_int, f"dev_rear_{r.id}")
                    if road == "south":
                        model.Add(dev_y >= y)
                    else:
                        model.Add(dev_y >= env_l_int - (y + l))
                    objective_terms.append(dev_y * 8)

                if rel_x == "left":
                    dev_x = model.NewIntVar(0, env_w_int, f"dev_left_{r.id}")
                    model.Add(dev_x >= x)
                    objective_terms.append(dev_x * 6)
                elif rel_x == "right":
                    dev_x = model.NewIntVar(0, env_w_int, f"dev_right_{r.id}")
                    model.Add(dev_x >= env_w_int - (x + w))
                    objective_terms.append(dev_x * 6)

    # 1. HARD CONSTRAINT: No Overlap between any two rooms
    model.AddNoOverlap2D(x_intervals, y_intervals)

    # 2. HARD CONSTRAINT: Attached Bathrooms MUST be fully flush against their parent bedroom
    for r in rooms:
        if r.attached_room_id and r.attached_room_id in x_vars:
            parent_id = r.attached_room_id
            bath_id = r.id

            b_left_of_p = model.NewBoolVar(f"{bath_id}_left_{parent_id}")
            b_right_of_p = model.NewBoolVar(f"{bath_id}_right_{parent_id}")
            b_above_p = model.NewBoolVar(f"{bath_id}_above_{parent_id}")
            b_below_p = model.NewBoolVar(f"{bath_id}_below_{parent_id}")

            # Touch wall
            model.Add(x_vars[bath_id] + w_vars[bath_id] == x_vars[parent_id]).OnlyEnforceIf(b_left_of_p)
            model.Add(x_vars[parent_id] + w_vars[parent_id] == x_vars[bath_id]).OnlyEnforceIf(b_right_of_p)
            model.Add(y_vars[bath_id] + l_vars[bath_id] == y_vars[parent_id]).OnlyEnforceIf(b_above_p)
            model.Add(y_vars[parent_id] + l_vars[parent_id] == y_vars[bath_id]).OnlyEnforceIf(b_below_p)

            # Flush containment along shared boundary (no awkward protruding corners)
            model.Add(y_vars[bath_id] >= y_vars[parent_id]).OnlyEnforceIf(b_left_of_p)
            model.Add(y_vars[bath_id] + l_vars[bath_id] <= y_vars[parent_id] + l_vars[parent_id]).OnlyEnforceIf(b_left_of_p)

            model.Add(y_vars[bath_id] >= y_vars[parent_id]).OnlyEnforceIf(b_right_of_p)
            model.Add(y_vars[bath_id] + l_vars[bath_id] <= y_vars[parent_id] + l_vars[parent_id]).OnlyEnforceIf(b_right_of_p)

            model.Add(x_vars[bath_id] >= x_vars[parent_id]).OnlyEnforceIf(b_above_p)
            model.Add(x_vars[bath_id] + w_vars[bath_id] <= x_vars[parent_id] + w_vars[parent_id]).OnlyEnforceIf(b_above_p)

            model.Add(x_vars[bath_id] >= x_vars[parent_id]).OnlyEnforceIf(b_below_p)
            model.Add(x_vars[bath_id] + w_vars[bath_id] <= x_vars[parent_id] + w_vars[parent_id]).OnlyEnforceIf(b_below_p)

            # At least one touch direction must hold
            model.AddBoolOr([b_left_of_p, b_right_of_p, b_above_p, b_below_p])

    # 3. WALL ALIGNMENT OBJECTIVE: Strongly reward collinear walls between neighboring rooms
    # (Eliminates small jogs, notches, and slivers, producing clean rectangular architectural boundaries)
    r_list = [r for r in rooms if r.id in x_vars]
    for i in range(len(r_list)):
        for j in range(i + 1, len(r_list)):
            r1 = r_list[i]
            r2 = r_list[j]
            # Alignment between r1.x and r2.x
            dev_x_align = model.NewIntVar(0, env_w_int, f"align_x_{r1.id}_{r2.id}")
            model.Add(dev_x_align >= x_vars[r1.id] - x_vars[r2.id])
            model.Add(dev_x_align >= x_vars[r2.id] - x_vars[r1.id])
            
            # Indicator for near-alignment (within 2ft / 4 grid units)
            is_near_x = model.NewBoolVar(f"near_x_{r1.id}_{r2.id}")
            model.Add(dev_x_align <= 4).OnlyEnforceIf(is_near_x)
            model.Add(dev_x_align > 4).OnlyEnforceIf(is_near_x.Not())
            # Penalize small misalignments to snap them to identical line
            objective_terms.append(dev_x_align * 12)

            # Alignment between r1.y and r2.y
            dev_y_align = model.NewIntVar(0, env_l_int, f"align_y_{r1.id}_{r2.id}")
            model.Add(dev_y_align >= y_vars[r1.id] - y_vars[r2.id])
            model.Add(dev_y_align >= y_vars[r2.id] - y_vars[r1.id])
            objective_terms.append(dev_y_align * 12)

    # 4. SOFT OBJECTIVES: Adjacency optimization
    room_map = {r.id: r for r in rooms}
    for r in rooms:
        for adj_id in r.required_adjacencies:
            if adj_id in x_vars and r.id < adj_id:
                dist_x = model.NewIntVar(0, env_w_int * 2, f"dist_x_{r.id}_{adj_id}")
                dist_y = model.NewIntVar(0, env_l_int * 2, f"dist_y_{r.id}_{adj_id}")
                c1_x = 2 * x_vars[r.id] + w_vars[r.id]
                c2_x = 2 * x_vars[adj_id] + w_vars[adj_id]
                c1_y = 2 * y_vars[r.id] + l_vars[r.id]
                c2_y = 2 * y_vars[adj_id] + l_vars[adj_id]
                model.Add(dist_x >= c1_x - c2_x)
                model.Add(dist_x >= c2_x - c1_x)
                model.Add(dist_y >= c1_y - c2_y)
                model.Add(dist_y >= c2_y - c1_y)
                objective_terms.append((dist_x + dist_y) * 10)

    # 4. Topological Scheme Priority Adjacencies
    if getattr(scheme, "priority_adjacencies", None):
        for pair in scheme.priority_adjacencies:
            if len(pair) == 2:
                t1, t2 = pair[0], pair[1]
                r1_list = [r for r in rooms if r.type == t1 or r.id == t1]
                r2_list = [r for r in rooms if r.type == t2 or r.id == t2]
                for r1 in r1_list:
                    for r2 in r2_list:
                        if r1.id in x_vars and r2.id in x_vars and r1.id < r2.id:
                            p_dx = model.NewIntVar(0, env_w_int * 2, f"padj_x_{r1.id}_{r2.id}")
                            p_dy = model.NewIntVar(0, env_l_int * 2, f"padj_y_{r1.id}_{r2.id}")
                            c1_x = 2 * x_vars[r1.id] + w_vars[r1.id]
                            c2_x = 2 * x_vars[r2.id] + w_vars[r2.id]
                            c1_y = 2 * y_vars[r1.id] + l_vars[r1.id]
                            c2_y = 2 * y_vars[r2.id] + l_vars[r2.id]
                            model.Add(p_dx >= c1_x - c2_x)
                            model.Add(p_dx >= c2_x - c1_x)
                            model.Add(p_dy >= c1_y - c2_y)
                            model.Add(p_dy >= c2_y - c1_y)
                            objective_terms.append((p_dx + p_dy) * 6)

    # 5. Topological Scheme Priority Acoustic Separations
    if getattr(scheme, "priority_separations", None):
        for pair in scheme.priority_separations:
            if len(pair) == 2:
                t1, t2 = pair[0], pair[1]
                r1_list = [r for r in rooms if r.type == t1 or r.id == t1]
                r2_list = [r for r in rooms if r.type == t2 or r.id == t2]
                for r1 in r1_list:
                    for r2 in r2_list:
                        if r1.id in x_vars and r2.id in x_vars and r1.id < r2.id:
                            # Encourage acoustic separation distance
                            p_dx = model.NewIntVar(0, env_w_int * 2, f"psep_x_{r1.id}_{r2.id}")
                            p_dy = model.NewIntVar(0, env_l_int * 2, f"psep_y_{r1.id}_{r2.id}")
                            c1_x = 2 * x_vars[r1.id] + w_vars[r1.id]
                            c2_x = 2 * x_vars[r2.id] + w_vars[r2.id]
                            c1_y = 2 * y_vars[r1.id] + l_vars[r1.id]
                            c2_y = 2 * y_vars[r2.id] + l_vars[r2.id]
                            model.Add(p_dx >= c1_x - c2_x)
                            model.Add(p_dx >= c2_x - c1_x)
                            model.Add(p_dy >= c1_y - c2_y)
                            model.Add(p_dy >= c2_y - c1_y)
                            # Subtract separation distance up to envelope to reward distance
                            objective_terms.append(-p_dx - p_dy)

    # Minimize total objective terms
    model.Minimize(sum(objective_terms))

    # Solve deterministically
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = float(time_limit_sec)
    solver.parameters.random_seed = int(variant_seed if variant_seed is not None else 42)
    solver.parameters.num_workers = 1
    status = solver.Solve(model)

    if status not in [cp_model.OPTIMAL, cp_model.FEASIBLE]:
        return None

    # Extract solved geometries back to floating feet coordinates
    solved_rects: Dict[str, Rect] = {}
    updated_rooms: List[Room] = []

    for r in rooms:
        sol_x = env.x + (solver.Value(x_vars[r.id]) / GRID_SCALE)
        sol_y = env.y + (solver.Value(y_vars[r.id]) / GRID_SCALE)
        sol_w = solver.Value(w_vars[r.id]) / GRID_SCALE
        sol_l = solver.Value(l_vars[r.id]) / GRID_SCALE

        rect = Rect(
            x=round(sol_x, 2),
            y=round(sol_y, 2),
            width=round(sol_w, 2),
            length=round(sol_l, 2)
        )
        solved_rects[r.id] = rect

        # Create updated room with actual dimensions
        r_updated = r.model_copy()
        r_updated.rect = rect
        r_updated.actual_width = rect.width
        r_updated.area_sqft = rect.area
        updated_rooms.append(r_updated)

    candidate = SolverCandidate(
        scheme_id=scheme.scheme_id,
        rooms=updated_rooms,
        solved_rects=solved_rects
    )

    # Validate using Shapely
    validate_candidate_geometry(candidate, site)
    return candidate


def validate_candidate_geometry(candidate: SolverCandidate, site: Site) -> None:
    """
    Shapely geometric verification:
    - Verifies zero area overlap
    - Verifies total containment in buildable envelope
    """
    env_poly = box(
        site.buildable_envelope.x,
        site.buildable_envelope.y,
        site.buildable_envelope.right,
        site.buildable_envelope.bottom
    )

    room_polys = {
        r.id: box(r.rect.x, r.rect.y, r.rect.right, r.rect.bottom)
        for r in candidate.rooms if r.rect
    }

    # Check containment
    for rid, poly in room_polys.items():
        if not env_poly.buffer(0.01).contains(poly):
            candidate.validation_errors.append(f"Room '{rid}' exceeds buildable envelope boundary.")

    # Check pairwise overlap
    r_keys = list(room_polys.keys())
    for i in range(len(r_keys)):
        for j in range(i + 1, len(r_keys)):
            k1, k2 = r_keys[i], r_keys[j]
            intersection = room_polys[k1].intersection(room_polys[k2])
            if intersection.area > 0.1:  # More than 0.1 sq ft tolerance
                candidate.validation_errors.append(f"Room '{k1}' overlaps with '{k2}' by {intersection.area:.2f} sq ft.")
                candidate.is_valid = False
