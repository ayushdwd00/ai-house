"""
Site Planner Module
Architectural site analysis, setbacks, frontage, buildable envelope calculation,
and vehicle/pedestrian access planning.
"""

from typing import Literal, Optional, Tuple, List, Union
from models import Site, Setbacks, SetbackProfile, ParkingSpace, Rect, Point2D


def compute_setback_profile(
    plot_width: float,
    plot_length: float,
    road_side: str,
    country: str = "India",
    state: Optional[str] = None,
    city: Optional[str] = None,
    custom_setbacks: Optional[Union[Setbacks, SetbackProfile]] = None
) -> SetbackProfile:
    """
    Computes residential architectural setbacks as a SetbackProfile.
    Supports user overrides, jurisdiction profiles, and preliminary heuristic fallbacks.
    Never claims legal compliance: disclaims as preliminary planning assumption.
    """
    if custom_setbacks:
        if isinstance(custom_setbacks, SetbackProfile):
            return custom_setbacks
        return SetbackProfile(
            country=country,
            state=state,
            city=city,
            front=custom_setbacks.front,
            rear=custom_setbacks.rear,
            left=custom_setbacks.left,
            right=custom_setbacks.right,
            source="User-supplied custom setbacks",
            confidence=1.0,
            is_user_supplied=True,
            disclaimer="User-specified setbacks — verify local municipal building bylaws before execution."
        )

    area = plot_width * plot_length
    if area <= 700:  # e.g., 20x30, 20x35
        front, rear, left, right = 3.0, 2.0, 1.5, 1.5
    elif area <= 1000:  # e.g., 25x35, 25x40
        front, rear, left, right = 3.5, 2.5, 2.0, 2.0
    elif area <= 1400:  # e.g., 30x40, 25x50
        front, rear, left, right = 4.0, 3.0, 2.5, 2.5
    elif area <= 2600:  # e.g., 40x50, 40x60
        front, rear, left, right = 5.0, 4.0, 3.0, 3.0
    elif area <= 4500:  # e.g., 50x80
        front, rear, left, right = 8.0, 5.0, 4.0, 4.0
    else:
        front, rear, left, right = 10.0, 6.0, 5.0, 5.0

    return SetbackProfile(
        country=country,
        state=state,
        city=city,
        front=front,
        rear=rear,
        left=left,
        right=right,
        source="Preliminary heuristic planning fallback",
        confidence=0.82,
        is_user_supplied=False,
        disclaimer="Preliminary planning assumption — verify with local municipal development authority or licensed architect."
    )


def compute_setbacks(plot_width: float, plot_length: float, road_side: str) -> Setbacks:
    """Backwards-compatible Setbacks generator."""
    prof = compute_setback_profile(plot_width, plot_length, road_side)
    return Setbacks(front=prof.front, rear=prof.rear, left=prof.left, right=prof.right)


def plan_site(
    plot_width: float,
    plot_length: float,
    road_side: Literal["north", "south", "east", "west"] = "south",
    parking_spaces: int = 1,
    custom_setbacks: Optional[Union[Setbacks, SetbackProfile]] = None
) -> Site:
    """
    Calculates the complete site geometry including buildable envelope,
    dedicated parking bay, driveway, and pedestrian entry path.
    """
    profile = compute_setback_profile(plot_width, plot_length, road_side, custom_setbacks=custom_setbacks)
    setbacks = Setbacks(front=profile.front, rear=profile.rear, left=profile.left, right=profile.right)
    
    # Calculate buildable envelope according to road orientation
    # Coordinates: x in [0, plot_width] (west to east), y in [0, plot_length] (north to south)
    if road_side == "south":
        env_x = setbacks.left
        env_y = setbacks.rear
        env_w = max(10.0, plot_width - setbacks.left - setbacks.right)
        env_l = max(10.0, plot_length - setbacks.rear - setbacks.front)
    elif road_side == "north":
        env_x = setbacks.left
        env_y = setbacks.front
        env_w = max(10.0, plot_width - setbacks.left - setbacks.right)
        env_l = max(10.0, plot_length - setbacks.front - setbacks.rear)
    elif road_side == "east":
        env_x = setbacks.rear
        env_y = setbacks.left
        env_w = max(10.0, plot_width - setbacks.rear - setbacks.front)
        env_l = max(10.0, plot_length - setbacks.left - setbacks.right)
    else:  # west
        env_x = setbacks.front
        env_y = setbacks.left
        env_w = max(10.0, plot_width - setbacks.front - setbacks.rear)
        env_l = max(10.0, plot_length - setbacks.left - setbacks.right)

    buildable_envelope = Rect(
        x=round(env_x, 2),
        y=round(env_y, 2),
        width=round(env_w, 2),
        length=round(env_l, 2)
    )

    # Calculate Parking footprint if required
    parking_space: Optional[ParkingSpace] = None
    driveway: Optional[Rect] = None
    pedestrian_path: Optional[List[Point2D]] = None

    if parking_spaces > 0:
        # Standard parking bay: single car (10ft x 16ft), two cars (18ft x 16ft)
        p_width = 18.0 if parking_spaces >= 2 else 10.0
        p_length = 16.0

        # Position parking on the road side corner to preserve garden and house frontage
        if road_side == "south":
            # Place in bottom-left or bottom-right corner
            p_x = setbacks.left
            p_y = max(0.0, plot_length - p_length - 1.0)
            driveway = Rect(x=p_x, y=p_y + p_length, width=p_width, length=1.0)
            ped_start = Point2D(x=p_x + p_width + 3.0, y=plot_length)
            ped_mid = Point2D(x=p_x + p_width + 3.0, y=env_y + env_l)
            ped_end = Point2D(x=p_x + p_width + 4.0, y=env_y + env_l - 2.0)
        elif road_side == "north":
            p_x = setbacks.left
            p_y = 1.0
            driveway = Rect(x=p_x, y=0.0, width=p_width, length=1.0)
            ped_start = Point2D(x=p_x + p_width + 3.0, y=0.0)
            ped_mid = Point2D(x=p_x + p_width + 3.0, y=env_y)
            ped_end = Point2D(x=p_x + p_width + 4.0, y=env_y + 2.0)
        elif road_side == "east":
            # East frontage (x = plot_width)
            p_width, p_length = 16.0, (18.0 if parking_spaces >= 2 else 10.0)
            p_x = max(0.0, plot_width - p_width - 1.0)
            p_y = setbacks.left
            driveway = Rect(x=p_x + p_width, y=p_y, width=1.0, length=p_length)
            ped_start = Point2D(x=plot_width, y=p_y + p_length + 3.0)
            ped_mid = Point2D(x=env_x + env_w, y=p_y + p_length + 3.0)
            ped_end = Point2D(x=env_x + env_w - 2.0, y=p_y + p_length + 4.0)
        else:  # west
            p_width, p_length = 16.0, (18.0 if parking_spaces >= 2 else 10.0)
            p_x = 1.0
            p_y = setbacks.left
            driveway = Rect(x=0.0, y=p_y, width=1.0, length=p_length)
            ped_start = Point2D(x=0.0, y=p_y + p_length + 3.0)
            ped_mid = Point2D(x=env_x, y=p_y + p_length + 3.0)
            ped_end = Point2D(x=env_x + 2.0, y=p_y + p_length + 4.0)

        parking_space = ParkingSpace(
            id="parking_01",
            capacity=parking_spaces,
            is_covered=True,
            rect=Rect(x=round(p_x, 2), y=round(p_y, 2), width=round(p_width, 2), length=round(p_length, 2)),
            vehicle_type="two_car" if parking_spaces >= 2 else "car",
            access_side="front"
        )
        pedestrian_path = [ped_start, ped_mid, ped_end]

    frontage_dimension = plot_width if road_side in ["north", "south"] else plot_length

    return Site(
        plot_width=plot_width,
        plot_length=plot_length,
        total_plot_area=round(plot_width * plot_length, 1),
        road_side=road_side,
        frontage_ft=frontage_dimension,
        setbacks=setbacks,
        setback_profile=profile,
        buildable_envelope=buildable_envelope,
        parking=parking_space,
        pedestrian_path=pedestrian_path,
        driveway=driveway
    )
