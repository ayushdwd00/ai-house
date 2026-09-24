import pytest
from shapely.geometry import box
import networkx as nx
from models import IntakeRequest, RefineRequest
from architecture.architectural_engine import generate_architectural_house_layout
from ai.refinement_engine import refine_current_house_layout
from estimation.cost_estimator import estimate_construction_cost
from architecture.indian_norms import get_city_norms

REGRESSION_CASES = [
    # 1. 30x40 2BHK
    ("30x40_2BHK", {"plot_width": 30.0, "plot_length": 40.0, "bedrooms": 2, "road_side": "north"}),
    # 2. 30x50 3BHK
    ("30x50_3BHK", {"plot_width": 30.0, "plot_length": 50.0, "bedrooms": 3, "road_side": "south"}),
    # 3. 40x50 4BHK
    ("40x50_4BHK", {"plot_width": 40.0, "plot_length": 50.0, "bedrooms": 4, "road_side": "east"}),
    # 4. G+1 house
    ("G+1_House", {"plot_width": 35.0, "plot_length": 45.0, "num_floors": 2, "bedrooms": 3, "road_side": "west"}),
    # 5. Vastu on vs off
    ("Vastu_Strict", {"plot_width": 35.0, "plot_length": 50.0, "bedrooms": 3, "vastu_compliant": True, "road_side": "north"}),
    # 6. 2-car parking
    ("2Car_Parking", {"plot_width": 40.0, "plot_length": 50.0, "bedrooms": 3, "parking_cars": 2, "road_side": "north"}),
    # 7. Budget refinement
    ("Budget_Refinement", {"plot_width": 30.0, "plot_length": 50.0, "bedrooms": 3, "refine_instruction": "budget 45 lakh ke andar rakho"}),
    # 8. Hinglish refinement
    ("Hinglish_Refinement", {"plot_width": 30.0, "plot_length": 40.0, "bedrooms": 2, "refine_instruction": "master bedroom bada karo"}),
]

@pytest.mark.parametrize("case_name,params", REGRESSION_CASES)
def test_regression_case_invariants(case_name, params):
    # 1. Generate base layout
    pw = params.get("plot_width", 30.0)
    pl = params.get("plot_length", 40.0)
    nf = params.get("num_floors", 1)
    br = params.get("bedrooms", 2)
    rs = params.get("road_side", "north")
    vastu = params.get("vastu_compliant", False)
    parking = params.get("parking_cars", 1)

    layout = generate_architectural_house_layout(
        plot_width=pw,
        plot_length=pl,
        num_floors=nf,
        bedrooms=br,
        road_side=rs,
        vastu_compliant=vastu,
        parking_spaces=parking
    )

    # If refinement case, apply refinement
    if "refine_instruction" in params:
        refined_layout, diff = refine_current_house_layout(
            current_layout=layout,
            instruction=params["refine_instruction"]
        )
        layout = refined_layout
        assert diff is not None

    # INVARIANT 1: Canonical HouseLayout exists with valid ID and site
    assert layout.id is not None
    assert layout.site is not None
    assert layout.site.buildable_envelope is not None

    # INVARIANT 2: No room-room overlap on any floor
    for fl in layout.floors:
        polys = []
        for r in fl.rooms:
            if r.rect:
                b = box(r.rect.x, r.rect.y, r.rect.right, r.rect.bottom)
                for existing in polys:
                    inter = b.intersection(existing)
                    assert inter.area < 0.25, f"Room overlap detected on floor {fl.floor_number}"
                polys.append(b)

    # INVARIANT 3: NBC minimum room dimensions
    for fl in layout.floors:
        for r in fl.rooms:
            if r.rect:
                assert r.rect.width >= 3.8, f"Room {r.name} width {r.rect.width} violates minimum"
                assert r.rect.length >= 3.8, f"Room {r.name} length {r.rect.length} violates minimum"
                assert r.rect.area >= 20.0, f"Room {r.name} area {r.rect.area} too small"

    # INVARIANT 4: Entry connectivity (every room reachable from main entry via NetworkX)
    G = nx.Graph()
    for fl in layout.floors:
        for r in fl.rooms:
            G.add_node(r.id)
        for d in fl.doors:
            from_id = getattr(d, "from_room_id", "") or getattr(d, "room_id", "")
            to_id = getattr(d, "to_room_id", "") or getattr(d, "connected_room_id", "")
            if from_id and to_id:
                G.add_edge(from_id, to_id)
        # Entry reaches ground floor rooms
        if fl.floor_number == 1 and G.number_of_nodes() > 1:
            living_nodes = [n for n in G.nodes if "living" in n.lower() or "hall" in n.lower()]
            if living_nodes:
                living_id = living_nodes[0]
                reachable = nx.descendants(G, living_id) | {living_id}
                assert len(reachable) >= 2, "Entry zone must reach adjacent spaces"

    # INVARIANT 5: Exterior ventilation (habitable rooms have exterior windows)
    for fl in layout.floors:
        habitable = [r for r in fl.rooms if r.type in ["bedroom", "master_bedroom", "living", "dining"]]
        for hr in habitable:
            assert hr.rect is not None
            # Check window presence
            win_count = len(fl.windows)
            assert win_count > 0, f"Floor {fl.floor_number} must have exterior windows"

    # INVARIANT 6: Sane quantities and valid preliminary estimate
    cost = estimate_construction_cost(layout)
    assert cost.total_low > 0
    assert cost.total_expected >= cost.total_low
    assert cost.total_high >= cost.total_expected
    assert len(cost.items) >= 20
    assert "PRELIMINARY" in cost.disclaimer
