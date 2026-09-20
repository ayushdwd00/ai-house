"""
Material Rate Provider Module
Maintains residential construction unit rates with Low, Expected, and High ranges
across materials, labor, finishes, and equipment:
- Bricks / Blocks
- Structural Ready-Mix / Site Concrete
- TMT Rebar Reinforcement Steel
- Internal & External Plastering
- Premium / Standard Paint
- Vitrified / Marble Flooring
- Wall & Floor Tiles
- Flush / Teakwood Doors & Aluminum/UPVC Windows
- Electrical & Sanitary Installations

DISCLAIMER: Benchmark planning unit rates. Real-world costs vary by exact local supplier,
transportation, contractor negotiation, and seasonal commodity shifts.
"""

from typing import Dict, Any, Optional
from models import MaterialRate, MaterialRateContext


DEFAULT_RATES: Dict[str, Dict[str, Any]] = {
    "red_brick": {
        "material_name": "Modular Red Clay Bricks / AAC Blocks",
        "category": "masonry",
        "unit": "brick",
        "low_rate": 8.0,
        "expected_rate": 10.5,
        "high_rate": 13.0,
        "source": "Regional Construction Index 2024"
    },
    "masonry_mortar": {
        "material_name": "Cement-Sand Mortar (1:5)",
        "category": "masonry",
        "unit": "cu ft",
        "low_rate": 65.0,
        "expected_rate": 80.0,
        "high_rate": 95.0,
        "source": "Standard CPWD/State Schedule of Rates"
    },
    "concrete_m20_m25": {
        "material_name": "Reinforced Concrete M20/M25 (Cement + Aggregate + Sand)",
        "category": "concrete",
        "unit": "cu m",
        "low_rate": 5200.0,
        "expected_rate": 5800.0,
        "high_rate": 6500.0,
        "source": "Regional Ready-Mix / Site Concrete Benchmark"
    },
    "tmt_steel": {
        "material_name": "Fe500/Fe550 TMT Rebar Reinforcement",
        "category": "steel",
        "unit": "kg",
        "low_rate": 68.0,
        "expected_rate": 78.0,
        "high_rate": 88.0,
        "source": "Steel Rolling Mill Monthly Index"
    },
    "internal_plaster": {
        "material_name": "Internal Cement Plaster (12mm) including Labor",
        "category": "finishing",
        "unit": "sq ft",
        "low_rate": 26.0,
        "expected_rate": 32.0,
        "high_rate": 40.0,
        "source": "Finishing Contractor Benchmark"
    },
    "external_plaster": {
        "material_name": "External Weatherproof Double-Coat Plaster (20mm) with Labor",
        "category": "finishing",
        "unit": "sq ft",
        "low_rate": 35.0,
        "expected_rate": 45.0,
        "high_rate": 58.0,
        "source": "Finishing Contractor Benchmark"
    },
    "paint_internal": {
        "material_name": "Internal Acrylic Emulsion Paint (Primer + 2 Coats)",
        "category": "finishing",
        "unit": "sq ft",
        "low_rate": 20.0,
        "expected_rate": 28.0,
        "high_rate": 38.0,
        "source": "Paint Applicator Index"
    },
    "paint_external": {
        "material_name": "External Weather-Shield Anti-Fungal Exterior Paint",
        "category": "finishing",
        "unit": "sq ft",
        "low_rate": 25.0,
        "expected_rate": 35.0,
        "high_rate": 48.0,
        "source": "Paint Applicator Index"
    },
    "flooring_vitrified": {
        "material_name": "Vitrified Tile Flooring (600x600 / 800x800) with Adhesive/Labor",
        "category": "flooring",
        "unit": "sq ft",
        "low_rate": 85.0,
        "expected_rate": 115.0,
        "high_rate": 160.0,
        "source": "Ceramic & Vitrified Tile Index"
    },
    "tiles_bathroom_wall": {
        "material_name": "Glazed Ceramic Wall Tiles (Dado up to 7ft) with Labor",
        "category": "flooring",
        "unit": "sq ft",
        "low_rate": 65.0,
        "expected_rate": 90.0,
        "high_rate": 130.0,
        "source": "Ceramic Tile Index"
    },
    "doors_finished": {
        "material_name": "Engineered Flush Door with Timber Frame & Hardware",
        "category": "miscellaneous",
        "unit": "door",
        "low_rate": 6500.0,
        "expected_rate": 8500.0,
        "high_rate": 12500.0,
        "source": "Joinery Manufacturer Benchmark"
    },
    "windows_aluminum_upvc": {
        "material_name": "UPVC / Anodized Aluminum 2-Track Glazed Window with Glass",
        "category": "miscellaneous",
        "unit": "window",
        "low_rate": 4500.0,
        "expected_rate": 6500.0,
        "high_rate": 9500.0,
        "source": "Fenestration Benchmark"
    },
    "electrical_point": {
        "material_name": "Concealed Conduit Wiring Point with Modular Switch & Box",
        "category": "electrical",
        "unit": "point",
        "low_rate": 750.0,
        "expected_rate": 950.0,
        "high_rate": 1250.0,
        "source": "Electrical Contractor Standard"
    },
    "sanitary_fixture": {
        "material_name": "Sanitary Ware Fixture (EWC / Basin / Shower Mixer) with Fittings",
        "category": "plumbing",
        "unit": "fixture",
        "low_rate": 4500.0,
        "expected_rate": 7000.0,
        "high_rate": 11500.0,
        "source": "Plumbing Trade Index"
    }
}


def get_material_rate_context(
    country: str = "India",
    state: Optional[str] = None,
    city: Optional[str] = None,
    quality_tier: str = "standard"
) -> MaterialRateContext:
    """
    Returns configured MaterialRate objects with low, expected, and high rates
    scaled by quality tier and regional factor.
    """
    multiplier = 1.0
    if quality_tier == "premium":
        multiplier = 1.30
    elif quality_tier == "basic":
        multiplier = 0.85

    rate_dict: Dict[str, MaterialRate] = {}
    for mat_id, data in DEFAULT_RATES.items():
        low = round(data["low_rate"] * multiplier, 2)
        exp = round(data["expected_rate"] * multiplier, 2)
        high = round(data["high_rate"] * multiplier, 2)

        rate_dict[mat_id] = MaterialRate(
            material_id=mat_id,
            material_name=data["material_name"],
            category=data["category"],
            unit=data["unit"],
            low_rate=low,
            expected_rate=exp,
            high_rate=high,
            currency="INR",
            country=country,
            state=state,
            city=city,
            source=data.get("source", "Configurable Fallback Assumptions"),
            effective_date="2024-01-01"
        )

    return MaterialRateContext(
        country=country,
        state=state,
        city=city,
        quality_tier=quality_tier,
        rates=rate_dict
    )
