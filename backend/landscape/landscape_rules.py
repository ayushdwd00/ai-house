"""
Landscape Rules Module
Deterministic architectural zoning, buffer parameters, clearance envelopes,
and style configurations for residential landscape planning.
"""

from typing import Dict, Any

# Geometric Buffers & Clearances (in feet)
TREE_BUILDING_BUFFER = 2.6      # Minimum clearance between tree center and building exterior wall
TREE_DOOR_BUFFER = 3.5          # Minimum clearance from exterior door threshold
TREE_PARKING_BUFFER = 2.0       # Minimum clearance from parking stall
TREE_DRIVEWAY_BUFFER = 2.0      # Minimum clearance from driveway edges
TREE_PLOT_MARGIN = 1.5          # Inset from site boundary
TREE_MIN_SPACING = 5.0          # Minimum distance between two tree centers

PATH_WIDTH = 3.5                # Standard pedestrian pathway width in feet
PATH_DOOR_CLEARANCE = 1.0       # Threshold connection tolerance
BOLLARD_LIGHT_INTERVAL = 8.0    # Distance between consecutive pathway lights
BOLLARD_PATH_OFFSET = 1.8       # Offset of pathway lights from path centerline
BOUNDARY_HEDGE_WIDTH = 1.5      # Width of perimeter boundary planting strip
PLANTER_MIN_WIDTH = 2.0         # Planter box minimum dimension

# Style Profiles
STYLE_CONFIGS: Dict[str, Dict[str, Any]] = {
    "modern_minimal": {
        "name": "Modern Minimalist",
        "description": "Clean linear lawns, architectural specimen trees, geometric stone pavers, and warm low-profile bollard lighting.",
        "tree_species": ["Magnolia Grandiflora", "Japanese Maple", "Olive Tree", "Silver Birch"],
        "max_trees": 4,
        "shrub_density": 0.35,
        "hedge_boundary": True,
        "pathway_type": "stepping_stones",
        "planter_style": "geometric_concrete",
        "accent_features": ["planter", "outdoor_light"],
        "color_palette": {"lawn": "#5A7855", "paving": "#D4CEB8", "bark": "#4A3B32"}
    },
    "lush_tropical": {
        "name": "Lush Tropical Garden",
        "description": "Dense layered greenery, flowering shrub borders, water element, and perimeter privacy hedges.",
        "tree_species": ["Plumeria (Frangipani)", "Ficus Microcarpa", "Areca Palm", "Gulmohar"],
        "max_trees": 7,
        "shrub_density": 0.8,
        "hedge_boundary": True,
        "pathway_type": "cobblestone_natural",
        "planter_style": "terracotta_beds",
        "accent_features": ["water_feature", "garden_seating", "planter", "outdoor_light"],
        "color_palette": {"lawn": "#4D6E48", "paving": "#C5BAA8", "bark": "#3E3128"}
    },
    "scandinavian": {
        "name": "Nordic Minimal",
        "description": "Open grass courtyards, structured birch trees, timber decking accents, and clean lighting.",
        "tree_species": ["Silver Birch", "Scots Pine", "Amelanchier"],
        "max_trees": 3,
        "shrub_density": 0.25,
        "hedge_boundary": False,
        "pathway_type": "stepping_stones",
        "planter_style": "timber_planter",
        "accent_features": ["garden_seating", "outdoor_light"],
        "color_palette": {"lawn": "#5E7B58", "paving": "#E0DAD0", "bark": "#554A40"}
    },
    "traditional": {
        "name": "Traditional Courtyard Garden",
        "description": "Formal garden symmetry, fragrant flower beds, garden bench, water basin, and perimeter hedges.",
        "tree_species": ["Neem", "Champa", "Mango Specimen", "Ashoka"],
        "max_trees": 5,
        "shrub_density": 0.6,
        "hedge_boundary": True,
        "pathway_type": "paved_stone",
        "planter_style": "stone_planter",
        "accent_features": ["water_feature", "garden_seating", "pergola", "flower_bed"],
        "color_palette": {"lawn": "#4E7048", "paving": "#D8CFBD", "bark": "#42352B"}
    }
}
