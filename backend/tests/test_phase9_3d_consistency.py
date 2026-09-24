import pytest
from models import IntakeRequest
from architecture.architectural_engine import generate_architectural_house_layout

def test_canonical_3d_geometry_consistency():
    layout = generate_architectural_house_layout(
        plot_width=30,
        plot_length=50,
        num_floors=2,
        bedrooms=3,
        road_side="north"
    )
    
    # 1. Structural columns present for 3D structure layer
    assert layout.structural_planning is not None
    assert len(layout.structural_planning.columns) >= 4
    for col in layout.structural_planning.columns:
        assert col.x >= 0
        assert col.y >= 0
        assert col.width > 0

    # 2. Window openings ready for sill/lintel/chajja rendering
    assert len(layout.windows) > 0
    for win in layout.windows:
        assert win.width > 0
        assert win.x1 is not None and win.y1 is not None
        
    # 3. Multi-floor elevations
    assert len(layout.floors) == 2
    assert layout.floors[0].floor_number == 1
    assert layout.floors[1].floor_number == 2
    
    # 4. Rooms have non-zero dimensions
    for r in layout.rooms:
        if r.rect:
            assert r.rect.width > 0
            assert r.rect.length > 0
