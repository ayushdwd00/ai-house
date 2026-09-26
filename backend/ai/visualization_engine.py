"""
Gemini architectural visualization — presentation-only images derived from HouseLayout.

Never writes geometry back into HouseLayout.
"""

from __future__ import annotations

import base64
import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from models import GeneratedVisual, GeneratedVisuals, HouseLayout

GEMINI_IMAGE_MODEL = os.getenv("GEMINI_IMAGE_MODEL", "gemini-3.1-flash-image").strip()
IMAGE_MODEL_FALLBACKS = [
    GEMINI_IMAGE_MODEL,
    "gemini-2.0-flash-preview-image-generation",
    "gemini-2.5-flash-image",
    "gemini-2.0-flash-exp",
]


def compact_architectural_context(layout: HouseLayout) -> Dict[str, Any]:
    rooms: List[Dict[str, Any]] = []
    all_rooms = []
    for fp in layout.floors or []:
        all_rooms.extend(fp.rooms or [])
    if not all_rooms:
        all_rooms = layout.rooms or []

    for r in all_rooms:
        rect = r.rect
        rooms.append({
            "id": r.id,
            "name": r.name,
            "type": r.type,
            "floor": r.floor,
            "zone": r.zone,
            "rect": {
                "x": round(rect.x, 2) if rect else r.x,
                "y": round(rect.y, 2) if rect else r.y,
                "width": round(rect.width, 2) if rect else r.width,
                "length": round(rect.length, 2) if rect else getattr(r, "depth", 0),
            } if rect or r.width else None,
        })

    stairs = []
    for fp in layout.floors or []:
        if fp.staircase:
            stairs.append({"floor": fp.floor_number, "geometry": str(fp.staircase)[:400]})
        for r in fp.rooms or []:
            if r.type == "staircase":
                stairs.append({"id": r.id, "rect": r.rect.model_dump() if r.rect else None})

    parking = None
    if layout.site and layout.site.parking:
        parking = layout.site.parking.model_dump()

    footprint = None
    if layout.site and layout.site.buildable_envelope:
        footprint = layout.site.buildable_envelope.model_dump()

    landscape_summary = None
    if layout.landscape:
        landscape_summary = {
            "style": layout.landscape.style,
            "trees": layout.landscape.trees_count,
            "green_pct": layout.landscape.green_coverage_percentage,
            "element_types": list({e.type for e in (layout.landscape.elements or [])}),
        }

    return {
        "plot": {"width": layout.plot_width, "length": layout.plot_length},
        "floors": layout.num_floors,
        "rooms": rooms,
        "room_count": len(rooms),
        "parking": parking,
        "entrance": layout.entry_point,
        "stairs": stairs,
        "building_footprint": footprint,
        "landscape": landscape_summary,
        "orientation": {
            "facing": layout.facing,
            "road_side": layout.site.road_side if layout.site else layout.orientation,
        },
        "title": layout.title,
        "revision_id": layout.revision_id,
        "version_number": layout.version_number,
    }


def _visualization_prompt(layout: HouseLayout, style: str, view: str, context: Dict[str, Any]) -> str:
    style_map = {
        "architectural": "premium architectural visualization, accurate materials, soft daylight",
        "minimal": "minimal contemporary presentation, restrained palette, clean lines",
        "warm_modern": "warm modern interior-exterior presentation, oak, plaster, soft gold light",
        "luxury": "luxury residential visualization, stone, bronze, refined landscaping",
        "technical_presentation": "technical architectural presentation drawing, precise, annotated feel without changing layout",
    }
    view_map = {
        "top_down": "true top-down plan-view architectural visualization matching the 2D plan organization",
        "isometric": "isometric 3/4 architectural axonometric of the house on its site",
        "presentation": "cinematic architectural presentation camera, 3/4 elevated view",
    }
    style_key = (style or "architectural").lower().replace(" ", "_")
    view_key = (view or "top_down").lower().replace("-", "_").replace(" ", "_")
    room_list = ", ".join(f"{r['name']} ({r['type']})" for r in context.get("rooms", [])[:24])

    return (
        "You are generating a PRESENTATION image of an already-designed house. "
        "The attached 2D architectural plan and JSON context are AUTHORITATIVE. "
        "Improve materials, furniture appearance, landscaping, lighting, shadows, textures, and visual polish. "
        "Do NOT change the underlying architectural design.\n\n"
        "STRICT CONSTRAINTS:\n"
        "- preserve the architectural organization\n"
        "- preserve room count\n"
        "- preserve room relationships\n"
        "- preserve building footprint\n"
        "- preserve entrance\n"
        "- preserve parking\n"
        "- preserve floor count\n"
        "- preserve staircase position\n"
        "- preserve major circulation\n"
        "- preserve site organization\n"
        "- preserve major room placement\n"
        "- do not invent rooms\n"
        "- do not remove rooms\n"
        "- do not randomly move rooms\n"
        "- do not alter the architectural concept\n\n"
        f"Style: {style_map.get(style_key, style_map['architectural'])}\n"
        f"View: {view_map.get(view_key, view_map['top_down'])}\n"
        f"Plot: {layout.plot_width}' × {layout.plot_length}'\n"
        f"Floors: {layout.num_floors}\n"
        f"Rooms: {room_list}\n"
        "Photoreal architectural quality. No watermarks. No extra buildings."
    )


def _decode_plan_image(plan_image_base64: Optional[str]) -> Optional[bytes]:
    if not plan_image_base64:
        return None
    raw = plan_image_base64.strip()
    if "," in raw and raw.startswith("data:"):
        raw = raw.split(",", 1)[1]
    try:
        return base64.b64decode(raw)
    except Exception:
        return None


def generate_gemini_visualization(
    layout: HouseLayout,
    style: str = "architectural",
    view: str = "top_down",
    plan_image_base64: Optional[str] = None,
) -> Tuple[Optional[bytes], Optional[str]]:
    """Returns (png_bytes, error_message). Architecture is never modified."""
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key or api_key == "your_gemini_api_key_here":
        return None, "GEMINI_API_KEY not configured"

    context = compact_architectural_context(layout)
    prompt = _visualization_prompt(layout, style, view, context)
    plan_bytes = _decode_plan_image(plan_image_base64)

    import json
    user_text = prompt + "\n\nSTRUCTURED CONTEXT (do not change this layout):\n" + json.dumps(context)[:8000]

    last_error = None
    models_tried = []
    for model in IMAGE_MODEL_FALLBACKS:
        if not model or model in models_tried:
            continue
        models_tried.append(model)
        try:
            png = _call_gemini_image(api_key, model, user_text, plan_bytes)
            if png:
                return png, None
        except Exception as e:
            last_error = str(e)
            continue
    return None, last_error or "Gemini image generation failed"


def _call_gemini_image(api_key: str, model: str, prompt: str, plan_png: Optional[bytes]) -> Optional[bytes]:
    try:
        from google import genai
        from google.genai import types
        client = genai.Client(api_key=api_key)
        parts = [types.Part(text=prompt)]
        if plan_png:
            parts.append(types.Part.from_bytes(data=plan_png, mime_type="image/png"))
        config = types.GenerateContentConfig(
            response_modalities=["IMAGE", "TEXT"],
            temperature=0.2,
        )
        response = client.models.generate_content(
            model=model,
            contents=parts,
            config=config,
        )
        png = _extract_image_bytes_from_sdk(response)
        if png:
            return png
    except Exception:
        pass

    import httpx
    parts: List[Dict[str, Any]] = [{"text": prompt}]
    if plan_png:
        parts.append({
            "inline_data": {
                "mime_type": "image/png",
                "data": base64.b64encode(plan_png).decode("ascii"),
            }
        })
    payload = {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {
            "temperature": 0.2,
            "responseModalities": ["IMAGE", "TEXT"],
        },
    }
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    with httpx.Client(timeout=90.0) as http:
        resp = http.post(url, json=payload)
        resp.raise_for_status()
        data = resp.json()
    return _extract_image_bytes_from_rest(data)


def _extract_image_bytes_from_sdk(response: Any) -> Optional[bytes]:
    try:
        candidates = getattr(response, "candidates", None) or []
        for cand in candidates:
            content = getattr(cand, "content", None)
            parts = getattr(content, "parts", None) or []
            for part in parts:
                inline = getattr(part, "inline_data", None) or getattr(part, "inlineData", None)
                if inline is not None:
                    data = getattr(inline, "data", None)
                    if isinstance(data, bytes):
                        return data
                    if isinstance(data, str):
                        return base64.b64decode(data)
    except Exception:
        return None
    return None


def _extract_image_bytes_from_rest(data: Dict[str, Any]) -> Optional[bytes]:
    for cand in data.get("candidates", []) or []:
        parts = ((cand.get("content") or {}).get("parts") or [])
        for part in parts:
            inline = part.get("inlineData") or part.get("inline_data") or {}
            b64 = inline.get("data")
            if b64:
                return base64.b64decode(b64)
    return None


def persist_visualization(
    layout: HouseLayout,
    png_bytes: bytes,
    style: str,
    view: str,
    projects_dir: Path,
    set_as_cover: bool = False,
) -> HouseLayout:
    pid = layout.project_id or layout.id
    visual_id = f"vis_{uuid.uuid4().hex[:12]}"
    vis_dir = projects_dir / pid / "visuals"
    vis_dir.mkdir(parents=True, exist_ok=True)
    file_path = vis_dir / f"{visual_id}.png"
    file_path.write_bytes(png_bytes)

    created = datetime.now(timezone.utc).isoformat()
    url = f"/api/projects/{pid}/visuals/{visual_id}"
    visual = GeneratedVisual(
        id=visual_id,
        revision_id=layout.revision_id or f"rev_{layout.version_number}",
        style=style,
        view=view,
        url=url,
        mime_type="image/png",
        created_at=created,
        is_cover=set_as_cover,
    )

    gv = layout.generated_visuals or GeneratedVisuals()
    images = list(gv.plan_images or [])
    if set_as_cover:
        for img in images:
            img.is_cover = False
        visual.is_cover = True
        gv.cover_visual_id = visual_id
    images.append(visual)
    gv.plan_images = images[-12:]
    gv.architectural_visualization = url
    gv.active_stale = False
    layout.generated_visuals = gv

    md = dict(layout.metadata or {})
    md["visual_stale"] = False
    md["last_visual_id"] = visual_id
    layout.metadata = md
    return layout


def mark_visuals_stale(layout: HouseLayout, reason: str) -> HouseLayout:
    md = dict(layout.metadata or {})
    md["visual_stale"] = True
    md["derived_cache"] = {
        "invalidated_at": datetime.now(timezone.utc).isoformat(),
        "reason": reason,
        "plan_revision": layout.version_number,
        "scene_revision": layout.version_number,
    }
    md.pop("room_schedule_cache", None)
    md.pop("estimate_cache", None)
    md.pop("scene_cache", None)
    md.pop("plan_image_cache", None)
    layout.metadata = md
    if layout.generated_visuals:
        layout.generated_visuals.active_stale = True
        layout.generated_visuals.architectural_visualization = None
    # Quantities/cost/validation are recomputed by the edit engine; do not restore stale caches
    return layout
