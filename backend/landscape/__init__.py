"""
Landscape Architecture Package
Deterministic site-responsive landscape planning and spatial rule sets.
"""

from .landscape_rules import (
    TREE_BUILDING_BUFFER,
    TREE_DOOR_BUFFER,
    TREE_PARKING_BUFFER,
    TREE_DRIVEWAY_BUFFER,
    TREE_PLOT_MARGIN,
    TREE_MIN_SPACING,
    PATH_WIDTH,
    BOLLARD_LIGHT_INTERVAL,
    BOUNDARY_HEDGE_WIDTH,
    STYLE_CONFIGS
)
from .landscape_engine import generate_landscape_plan, refine_landscape_layout

__all__ = [
    "generate_landscape_plan",
    "refine_landscape_layout",
    "TREE_BUILDING_BUFFER",
    "TREE_DOOR_BUFFER",
    "TREE_PARKING_BUFFER",
    "TREE_DRIVEWAY_BUFFER",
    "TREE_PLOT_MARGIN",
    "TREE_MIN_SPACING",
    "PATH_WIDTH",
    "BOLLARD_LIGHT_INTERVAL",
    "BOUNDARY_HEDGE_WIDTH",
    "STYLE_CONFIGS"
]
