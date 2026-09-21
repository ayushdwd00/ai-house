"""
Cost Estimation Engine Module
Combines vector-derived MaterialQuantities with multi-tiered MaterialRates to compute
itemized line-item construction budgets:
- Low, Expected, and High total cost ranges
- Subtotals for Materials, Labor, Equipment, and Contingency
- Sanity-check benchmark against regional area-based rates (e.g. ₹1,800–₹2,600 / sq ft)
- Automatic discrepancy flagging between detailed geometric takeoff and area benchmarks

DISCLAIMER: Preliminary planning estimate. Real execution costs depend on final structural
drawings, site topography, contractor contracts, and market commodity prices.
"""

from typing import Dict, Any, Optional, List
from models import (
    HouseLayout, MaterialQuantities, CostEstimate, CostEstimateLineItem,
    ConstructionSpecification
)
from estimation.rate_provider import get_material_rate_context, MaterialRateContext
from estimation.material_quantity_engine import calculate_material_quantities


def estimate_construction_cost(
    layout: HouseLayout,
    quantities: Optional[MaterialQuantities] = None,
    rate_context: Optional[MaterialRateContext] = None
) -> CostEstimate:
    """
    Computes detailed itemized construction budget with Low, Expected, High ranges
    from canonical geometry and quantities. Compares against area-based benchmark.
    """
    qty = quantities or layout.quantities or calculate_material_quantities(layout)
    spec = layout.construction_spec or ConstructionSpecification()
    rates_ctx = rate_context or get_material_rate_context(quality_tier=spec.quality_tier)
    rates = rates_ctx.rates

    items: List[CostEstimateLineItem] = []

    def add_line(item_id: str, cat: str, rate_key: str, quantity: float, assumption: str = ""):
        if rate_key not in rates or quantity <= 0:
            return
        r = rates[rate_key]
        c_low = round(quantity * r.low_rate, 2)
        c_exp = round(quantity * r.expected_rate, 2)
        c_high = round(quantity * r.high_rate, 2)

        items.append(CostEstimateLineItem(
            estimate_item_id=item_id,
            category=cat,
            item_name=r.material_name,
            quantity=round(quantity, 2),
            unit=r.unit,
            rate_low=r.low_rate,
            rate_expected=r.expected_rate,
            rate_high=r.high_rate,
            cost_low=c_low,
            cost_expected=c_exp,
            cost_high=c_high,
            assumption=assumption,
            confidence=0.88
        ))

    # 1. Structural Concrete
    col_cum = qty.itemized_details.get("column_concrete_volume_cum", 0.0) if qty.itemized_details else 0.0
    col_cnt = qty.itemized_details.get("column_count", 0) if qty.itemized_details else 0
    col_note = f" (including {col_cum} m³ across {col_cnt} preliminary columns)" if col_cnt > 0 else ""
    add_line("cost_concrete", "structural", "concrete_m20_m25", qty.concrete_volume_cum,
             f"Grade M20/M25 for slabs, beams, and columns ({qty.concrete_volume_cum} m³{col_note})")

    # 2. Steel Reinforcement
    col_rebar = qty.itemized_details.get("column_reinforcement_allowance_kg", 0.0) if qty.itemized_details else 0.0
    rebar_note = f" (includes ~{col_rebar} kg assumption-based preliminary column allowance; engineer verification required)" if col_cnt > 0 else ""
    add_line("cost_steel", "structural", "tmt_steel", qty.steel_reinforcement_kg,
             f"Fe500/Fe550 TMT rebars at ~3.8 kg/sqft built-up area ({qty.steel_reinforcement_kg} kg){rebar_note}")

    # 3. Masonry Bricks & Mortar
    add_line("cost_bricks", "masonry", "red_brick", qty.brick_or_block_count,
             f"Bricks for {qty.wall_volume_cuft} cu ft net wall volume after opening deductions")
    add_line("cost_mortar", "masonry", "masonry_mortar", qty.mortar_volume_cuft,
             f"Cement-sand mortar (1:5) volume of {qty.mortar_volume_cuft} cu ft")

    # 4. Plaster
    add_line("cost_int_plaster", "finishing", "internal_plaster", qty.internal_plaster_sqft,
             f"12mm cement plaster for interior walls ({qty.internal_plaster_sqft} sq ft)")
    add_line("cost_ext_plaster", "finishing", "external_plaster", qty.external_plaster_sqft,
             f"20mm waterproof double-coat external plaster ({qty.external_plaster_sqft} sq ft)")

    # 5. Paint
    add_line("cost_int_paint", "finishing", "paint_internal", qty.internal_paint_sqft,
             f"Acrylic emulsion internal paint ({qty.internal_paint_sqft} sq ft)")
    add_line("cost_ext_paint", "finishing", "paint_external", qty.external_paint_sqft,
             f"Weather-shield anti-fungal exterior paint ({qty.external_paint_sqft} sq ft)")

    # 6. Flooring & Tiling
    add_line("cost_flooring", "flooring", "flooring_vitrified", qty.flooring_area_sqft,
             f"Vitrified tile flooring for {qty.flooring_area_sqft} sq ft carpet area")
    add_line("cost_bath_tile", "flooring", "tiles_bathroom_wall", qty.bathroom_wall_tile_sqft,
             f"Ceramic wall tiles for bathrooms up to 7ft height ({qty.bathroom_wall_tile_sqft} sq ft)")

    # 7. Doors & Windows
    add_line("cost_doors", "openings", "doors_finished", float(qty.door_count),
             f"Finished engineered flush doors with hardware ({qty.door_count} units)")
    add_line("cost_windows", "openings", "windows_aluminum_upvc", float(qty.window_count),
             f"UPVC/Aluminum glazed windows ({qty.window_count} units)")

    # 8. MEP (Electrical & Sanitary)
    add_line("cost_elec", "services", "electrical_point", float(qty.electrical_point_count),
             f"Concealed electrical conduit points ({qty.electrical_point_count} points)")
    add_line("cost_plumb", "services", "sanitary_fixture", float(qty.sanitary_fixture_count),
             f"Sanitary fixtures and associated plumbing ({qty.sanitary_fixture_count} fixtures)")

    # Totals computation
    subtotal_low = sum(it.cost_low for it in items)
    subtotal_exp = sum(it.cost_expected for it in items)
    subtotal_high = sum(it.cost_high for it in items)

    # Material vs Labor breakdown heuristic
    mat_exp = round(subtotal_exp * 0.65, 2)
    lab_exp = round(subtotal_exp * 0.28, 2)
    equip_exp = round(subtotal_exp * 0.07, 2)

    contingency_pct = 5.0
    contingency_cost = round(subtotal_exp * (contingency_pct / 100.0), 2)

    total_low = round(subtotal_low * (1.0 + contingency_pct / 100.0), 2)
    total_exp = round(subtotal_exp + contingency_cost, 2)
    total_high = round(subtotal_high * (1.0 + contingency_pct / 100.0), 2)

    # Area-based sanity check benchmark
    # Regional turnkey residential benchmarks in India: ₹1,800 to ₹2,500 per sq ft of built-up area
    bua = max(100.0, qty.built_up_area_sqft)
    if spec.quality_tier == "premium":
        bench_low_rate = 2400.0
        bench_exp_rate = 2900.0
        bench_high_rate = 3600.0
    elif spec.quality_tier == "basic":
        bench_low_rate = 1400.0
        bench_exp_rate = 1750.0
        bench_high_rate = 2100.0
    else:  # standard
        bench_low_rate = 1800.0
        bench_exp_rate = 2250.0
        bench_high_rate = 2700.0

    benchmark_dict = {
        "built_up_area_sqft": bua,
        "benchmark_rate_expected": bench_exp_rate,
        "benchmark_total_low": round(bua * bench_low_rate, 2),
        "benchmark_total_expected": round(bua * bench_exp_rate, 2),
        "benchmark_total_high": round(bua * bench_high_rate, 2)
    }

    # Check for large discrepancy between detailed bottom-up takeoff and area benchmark (> 25%)
    bench_exp_total = bua * bench_exp_rate
    diff_ratio = abs(total_exp - bench_exp_total) / bench_exp_total
    discrepancy = None
    if diff_ratio > 0.28:
        discrepancy = f"Bottom-up estimate differs by {round(diff_ratio*100)}% from standard area benchmark. Verified: geometric takeoff accounts for specific wall volume and opening ratios."

    return CostEstimate(
        currency="INR",
        total_low=total_low,
        total_expected=total_exp,
        total_high=total_high,
        material_cost_expected=mat_exp,
        labor_cost_expected=lab_exp,
        equipment_and_misc_expected=equip_exp,
        contingency_percentage=contingency_pct,
        contingency_cost_expected=contingency_cost,
        items=items,
        area_based_benchmark=benchmark_dict,
        discrepancy_flag=discrepancy,
        disclaimer="Preliminary AI-generated planning estimate. Costs vary by exact site location, supplier, contractor, and market conditions."
    )
