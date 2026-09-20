"""
Construction Specification Engine Module
Generates architectural and structural planning recommendations for residential projects:
- Structural System (RCC Frame vs Load-Bearing vs Custom)
- External Wall Thickness (9-inch / 230mm vs 4.5-inch / 115mm vs Custom)
- Internal Wall Thickness (4.5-inch / 115mm vs 9-inch / 230mm vs Custom)
- Vertical Dimensions (Clear ceiling height, wall height, floor-to-floor height, slab thickness)
- Quality Level (Basic, Standard, Premium, Custom)
- Planning Advisor explanations and value-engineering trade-offs.

DISCLAIMER: Preliminary architectural planning only. Not certified structural engineering.
"""

from typing import Dict, Any, Optional, List, Literal
from models import ConstructionSpecification


def recommend_construction_specification(
    plot_width: float = 40.0,
    plot_length: float = 50.0,
    num_floors: int = 1,
    quality_tier: Literal["basic", "standard", "premium", "custom"] = "standard",
    region: str = "India",
    user_override: Optional[Dict[str, Any]] = None
) -> ConstructionSpecification:
    """
    Synthesizes a tailored residential construction specification based on
    plot dimensions, story count, regional masonry conventions, and quality tier.
    """
    user_override = user_override or {}
    built_up_area_approx = plot_width * plot_length * num_floors * 0.70

    # 1. Structural System Selection
    if num_floors > 1 or built_up_area_approx > 1800:
        structural_sys = "rcc_frame"
        sys_reason = f"RCC framed structure recommended for {num_floors}-story residential building with span flexibility and seismic resilience."
    else:
        structural_sys = "rcc_frame" if quality_tier in ["standard", "premium"] else "load_bearing"
        sys_reason = "RCC framed structure recommended for open spatial layout; load-bearing masonry is viable for single-story compact footprint."

    # 2. Wall Thicknesses (Imperial feet: 9 inch = 0.75 ft, 4.5 inch = 0.375 ft)
    # External walls: 9" (230mm) standard for external thermal envelope, moisture barrier, and structural infill.
    ext_wall_in = float(user_override.get("external_wall_thickness_in", 9.0))
    int_wall_in = float(user_override.get("internal_wall_thickness_in", 4.5))
    
    ext_wall_ft = round(ext_wall_in / 12.0, 4)
    int_wall_ft = round(int_wall_in / 12.0, 4)

    # 3. Vertical Heights
    if quality_tier == "premium":
        clear_ceiling_ft = float(user_override.get("clear_ceiling_height_ft", 10.0))
        slab_thick_in = float(user_override.get("slab_thickness_in", 6.0))
        wall_height_ft = float(user_override.get("wall_height_ft", 10.5))
        floor_to_floor_ft = float(user_override.get("floor_to_floor_height_ft", 11.0))
    elif quality_tier == "basic":
        clear_ceiling_ft = float(user_override.get("clear_ceiling_height_ft", 9.0))
        slab_thick_in = float(user_override.get("slab_thickness_in", 5.0))
        wall_height_ft = float(user_override.get("wall_height_ft", 9.5))
        floor_to_floor_ft = float(user_override.get("floor_to_floor_height_ft", 10.0))
    else:  # standard
        clear_ceiling_ft = float(user_override.get("clear_ceiling_height_ft", 9.5))
        slab_thick_in = float(user_override.get("slab_thickness_in", 5.5))
        wall_height_ft = float(user_override.get("wall_height_ft", 10.0))
        floor_to_floor_ft = float(user_override.get("floor_to_floor_height_ft", 10.5))

    slab_thick_ft = round(slab_thick_in / 12.0, 4)

    # 4. Synthesize Assumptions
    assumptions = [
        f"External perimeter walls configured as {ext_wall_in}\" ({round(ext_wall_in*25.4)}mm) masonry for weatherproofing.",
        f"Internal partition walls configured as {int_wall_in}\" ({round(int_wall_in*25.4)}mm) space-saving masonry.",
        f"Floor-to-floor vertical rise of {floor_to_floor_ft}' provides {clear_ceiling_ft}' clear head room after MEP/false ceiling drops.",
        f"Reinforced concrete slab assumed at {slab_thick_in}\" thickness with grade M20/M25 concrete.",
        f"Quality standard tier: {quality_tier.capitalize()} finishes and construction tolerances."
    ]

    return ConstructionSpecification(
        structural_system=user_override.get("structural_system", structural_sys),
        external_wall_thickness_in=ext_wall_in,
        internal_wall_thickness_in=int_wall_in,
        external_wall_thickness_ft=ext_wall_ft,
        internal_wall_thickness_ft=int_wall_ft,
        clear_ceiling_height_ft=clear_ceiling_ft,
        wall_height_ft=wall_height_ft,
        floor_to_floor_height_ft=floor_to_floor_ft,
        slab_thickness_in=slab_thick_in,
        slab_thickness_ft=slab_thick_ft,
        quality_tier=user_override.get("quality_tier", quality_tier),
        recommended_value=f"RCC Frame + 9\"/4.5\" Masonry, {floor_to_floor_ft}ft Floor-to-Floor ({quality_tier.capitalize()})",
        reason=sys_reason,
        assumptions=assumptions,
        confidence=0.92,
        disclaimer="Preliminary planning recommendation — verify with licensed structural engineer before construction."
    )


def explain_construction_spec(spec: ConstructionSpecification) -> Dict[str, Any]:
    """
    Returns AI Construction Advisor explanations for the active specification:
    - Rationale for wall thicknesses and heights
    - Major cost drivers and trade-offs
    - Value-engineering options
    """
    trade_offs = []
    if spec.external_wall_thickness_in >= 9.0:
        trade_offs.append({
            "aspect": "Thermal & Sound Insulation",
            "impact": "High acoustic isolation and superior thermal comfort.",
            "cost_implication": "Standard baseline masonry consumption."
        })
    else:
        trade_offs.append({
            "aspect": "Usable Carpet Area",
            "impact": "Slimmer exterior walls increase interior carpet area by ~2-3%.",
            "cost_implication": "Requires additional external weatherproofing / damp-proof plaster."
        })

    if spec.floor_to_floor_height_ft > 10.5:
        trade_offs.append({
            "aspect": "Ceiling Volume & Luxury",
            "impact": f"Spacious {spec.clear_ceiling_height_ft}ft clear ceiling allows recessed HVAC and false ceiling designs.",
            "cost_implication": "Increases vertical masonry, plaster, and painting quantities by ~5-8%."
        })
    else:
        trade_offs.append({
            "aspect": "Vertical Efficiency",
            "impact": "Optimal staircase run (fewer steps) and energy-efficient climate control volume.",
            "cost_implication": "Cost-effective baseline."
        })

    return {
        "summary": spec.recommended_value or "Standard Residential Specification",
        "structural_rationale": spec.reason or "Reinforced concrete framed structure with masonry infill.",
        "wall_thickness_rationale": f"Exterior {spec.external_wall_thickness_in}\" walls buffer heat and moisture; interior {spec.internal_wall_thickness_in}\" maximize usable carpet area.",
        "vertical_dimension_rationale": f"{spec.floor_to_floor_height_ft}ft floor-to-floor ensures comfortable {spec.clear_ceiling_height_ft}ft clear height while keeping staircase footprint compact.",
        "cost_drivers": [
            "Structural concrete and steel reinforcement (RCC frame)",
            "External envelope brickwork volume and double-coat external plaster",
            "Flooring and tiling surface areas",
            "Interior sanitary fixture and plumbing stacking"
        ],
        "value_engineering_options": [
            "Use fly-ash AAC blocks instead of traditional red clay bricks for 15% weight reduction and faster masonry.",
            "Maintain 9.5ft clear ceiling to reduce vertical wall surface area and plaster cost by ~6%.",
            "Consolidate wet areas (baths and kitchen) over a vertical service stack to minimize piping runs."
        ],
        "trade_offs": trade_offs,
        "disclaimer": "Preliminary architectural planning only. Final structural drawings must be verified by a qualified structural engineer."
    }
