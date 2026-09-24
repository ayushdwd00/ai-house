import pytest
from models import ConstructionSpecification, Site
from architecture.architectural_engine import generate_architectural_house_layout
from estimation.cost_estimator import estimate_construction_cost

def test_itemized_boq_generation():
    layout = generate_architectural_house_layout(plot_width=30, plot_length=40, bedrooms=2, road_side="north")
    est = estimate_construction_cost(layout)
    
    assert est.total_low > 0
    assert est.total_expected > est.total_low
    assert est.total_high > est.total_expected
    
    # Check comprehensive BOQ items
    assert len(est.items) >= 20
    categories = {it.category for it in est.items}
    assert "substructure" in categories
    assert "structural" in categories
    assert "finishes" in categories
    assert "mep" in categories
    assert "commercial" in categories
    
    # Exclusions & disclaimer
    assert len(est.exclusions) >= 3
    assert "PRELIMINARY" in est.disclaimer

def test_quality_tiers_progression():
    layout = generate_architectural_house_layout(plot_width=30, plot_length=40, bedrooms=2, road_side="north")
    
    layout.construction_spec = ConstructionSpecification(quality_tier="economy")
    cost_eco = estimate_construction_cost(layout).total_expected
    
    layout.construction_spec = ConstructionSpecification(quality_tier="standard")
    cost_std = estimate_construction_cost(layout).total_expected
    
    layout.construction_spec = ConstructionSpecification(quality_tier="premium")
    cost_prem = estimate_construction_cost(layout).total_expected
    
    layout.construction_spec = ConstructionSpecification(quality_tier="luxury")
    cost_lux = estimate_construction_cost(layout).total_expected
    
    assert cost_eco < cost_std < cost_prem < cost_lux

def test_city_index_variation():
    layout_base = generate_architectural_house_layout(plot_width=30, plot_length=40, bedrooms=2, road_side="north")
    cost_base = estimate_construction_cost(layout_base).total_expected
    
    layout_mumbai = generate_architectural_house_layout(plot_width=30, plot_length=40, bedrooms=2, road_side="north")
    if layout_mumbai.site:
        layout_mumbai.site.city = "mumbai"
    cost_mumbai = estimate_construction_cost(layout_mumbai).total_expected
    
    # Mumbai has 1.22 index vs baseline 1.00
    assert cost_mumbai > cost_base

def test_plinth_area_benchmark_check():
    layout = generate_architectural_house_layout(plot_width=30, plot_length=40, bedrooms=2, road_side="north")
    est = estimate_construction_cost(layout)
    
    bench = est.area_based_benchmark
    assert "built_up_area_sqft" in bench
    assert "benchmark_total_expected" in bench
    assert bench["benchmark_total_expected"] > 0
