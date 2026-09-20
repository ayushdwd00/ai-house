"""
Geometry Normalizer Module
Geometric vector rectification, orthogonalization, coordinate transforms,
scale calibration, and closed boundary polygon synthesis for architectural floor plans.
"""

from typing import List, Dict, Tuple, Optional, Any
import math
from models import Point2D, Rect


def calibrate_scale(
    pixel_distance: float,
    real_world_distance_ft: float,
    unit: str = "ft"
) -> Dict[str, Any]:
    """
    Computes scale transform factors from a known reference distance
    (e.g., a measured 12-ft wall spanning 240 pixels in the image).
    """
    if pixel_distance <= 0.0 or real_world_distance_ft <= 0.0:
        raise ValueError("Calibration distances must be strictly positive non-zero numbers.")

    ft_per_pixel = real_world_distance_ft / pixel_distance
    return {
        "scale_x": round(ft_per_pixel, 6),
        "scale_y": round(ft_per_pixel, 6),
        "scale_unit": "feet_per_pixel",
        "reference_px": pixel_distance,
        "reference_real_ft": real_world_distance_ft,
        "calibration_confidence": 0.95
    }


def orthogonalize_segment(
    p1: Point2D,
    p2: Point2D,
    tolerance_deg: float = 12.0
) -> Tuple[Point2D, Point2D]:
    """
    Snaps nearly horizontal or vertical segments to strict 0° or 90° orthogonal angles.
    """
    dx = p2.x - p1.x
    dy = p2.y - p1.y
    length = math.hypot(dx, dy)
    if length < 0.1:
        return p1, p2

    angle_deg = math.degrees(math.atan2(dy, dx)) % 360.0

    # Near 0 or 180 (Horizontal)
    if abs(angle_deg - 0) <= tolerance_deg or abs(angle_deg - 360) <= tolerance_deg or abs(angle_deg - 180) <= tolerance_deg:
        avg_y = round((p1.y + p2.y) / 2.0, 2)
        return Point2D(x=round(p1.x, 2), y=avg_y), Point2D(x=round(p2.x, 2), y=avg_y)

    # Near 90 or 270 (Vertical)
    if abs(angle_deg - 90) <= tolerance_deg or abs(angle_deg - 270) <= tolerance_deg:
        avg_x = round((p1.x + p2.x) / 2.0, 2)
        return Point2D(x=avg_x, y=round(p1.y, 2)), Point2D(x=avg_x, y=round(p2.y, 2))

    return Point2D(x=round(p1.x, 2), y=round(p1.y, 2)), Point2D(x=round(p2.x, 2), y=round(p2.y, 2))


def synthesize_room_rect(
    min_x: float,
    min_y: float,
    max_x: float,
    max_y: float,
    scale_ft_per_px: float = 0.05
) -> Rect:
    """
    Transforms pixel bounding coordinates into real-world feet dimensions.
    """
    real_x = round(min_x * scale_ft_per_px, 1)
    real_y = round(min_y * scale_ft_per_px, 1)
    real_w = max(4.0, round((max_x - min_x) * scale_ft_per_px, 1))
    real_l = max(4.0, round((max_y - min_y) * scale_ft_per_px, 1))

    return Rect(x=real_x, y=real_y, width=real_w, length=real_l)
