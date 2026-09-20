# Architecture Audit: AI House Plan Generator

## Executive Summary
This document provides a comprehensive audit of the existing AI House Plan Generator codebase. The objective of this review is to diagnose current architectural limitations—specifically why the layout engine currently generates plans resembling procedural guillotine rectangle-packing rather than authentic residential architecture—and to outline a clean, phased implementation roadmap to evolve the system into a professional architectural workspace.

---

## 1. Current Architecture
The application currently consists of a two-tier decoupled system:
- **Backend**: FastAPI (Python 3.13) serving REST endpoints (`/api/generate`, `/api/intake`, `/api/refine`, `/api/upload-floorplan`, `/api/health`) and a WebSocket (`/ws/refine`). It uses Pydantic for data models, Shapely for geometric union validation, and Groq for natural language requirement parsing and image analysis.
- **Frontend**: Next.js 16.3.5 (App Router, React 19, Tailwind CSS v4, TypeScript) with an interactive 2D SVG canvas floor plan viewer and a 3D WebGL dollhouse viewer powered by Three.js with OrbitControls.

---

## 2. Current Data Flow
1. User enters natural language or selects presets in `LandingHero.tsx` or `IntakeModal.tsx`.
2. Frontend sends `IntakeRequest` to backend `POST /api/generate`.
3. Backend calls `groq_service.py` to extract parameters (`plot_width`, `plot_length`, `num_floors`, `bedrooms`, `bathrooms`, `style`, `special_rooms`).
4. `layout_engine.py` generates a `HouseLayout` object containing rooms, walls, doors, windows, and floor metadata.
5. The `HouseLayout` JSON response is sent back to the Next.js client, stored in React state and `localStorage`, and rendered concurrently in `FloorPlan2D` and `Dollhouse3D`.

---

## 3. Current Layout Generation Flow & Why It Looks Like Rectangle Packing
### How it works now:
- Layout generation is implemented via a recursive binary space-partitioning (BSP / guillotine-cut) tree (`SlicingNode`, `aspect_guarded_split`).
- The entire buildable plot rectangle $[0, 0, W, L]$ is cut in two (Public vs. Private zones), then each sub-rectangle is recursively halved into smaller rectangles until leaves are assigned to rooms.
- While this mathematically guarantees 100% plot coverage with zero gaps by construction:
  1. **Absence of Site and Frontage Logic**: It does not consider road orientation, setbacks, pedestrian pathways, or vehicle driveways.
  2. **Topological Inflexibility**: The room arrangement is dictated by binary cuts rather than an architectural room relationship graph. Rooms are placed wherever the binary guillotine split happened to land.
  3. **No Explicit Circulation Spine**: Corridors and hallways are either absent or treated as incidental leaf rectangles rather than continuous architectural circulation connecting public spaces to private clusters.
  4. **Disconnected Attached Spaces**: Bathrooms are sliced off bedrooms mechanically rather than designed as functional en-suite bathroom-dressing clusters with fixture clearances.
  5. **No Site-First Parking Integration**: Parking is either omitted or treated as an afterthought rather than a driveway-connected architectural carport.
  6. **Single Hardcoded Layout Scheme**: Only one deterministic binary tree is generated per seed without multi-scheme exploration or constraint-driven spatial optimization (CP-SAT).

---

## 4. Current 2D Rendering Flow
- `FloorPlan2D.tsx` renders vector SVG elements based on `room.rect` $[x, y, w, l]$.
- It calculates room fills, dimension labels, furniture placement from `room.furniture`, door swings, window slots, and entrance arrows.
- Features cursor-centered mouse wheel zoom, touch pinch-to-zoom, drag-to-pan, SVG export, PNG rasterization export, and room-hover placement rationale tooltips.
- **Limitation**: While visually clean and responsive, the underlying floor plan layout reflects the rigid rectangular partitioning of the backend.

---

## 5. Current 3D Rendering Flow
- `Dollhouse3D.tsx` mounts a Three.js `WebGLRenderer` using `PerspectiveCamera` with isometric placement and `OrbitControls`.
- Generates procedural canvas floor textures (`hardwood_oak`, `tile_marble`, `wood_deck`, `wool_carpet`).
- Extrudes walls as individual 3D box meshes with a cutaway height toggle (3.5' vs. 8.5') and lighting presets (Day, Sunset, Night).
- Supports both single-floor isolated and multi-floor stacked visualization.
- **Limitation**: Walls are extruded from 2D segments without true architectural wall thickness junctions, door frames, window openings with sills, slab cutouts for stairs, or site context (driveway, boundary fence, landscape).

---

## 6. Current Refinement Flow
- User inputs plain English edits in `EditBar.tsx` ("Make kitchen bigger", "Make it a 2-story home").
- Backend `refine_layout_with_groq_or_fallback` calculates parameter adjustments.
- **Limitation**: Currently, refinement invokes `generate_house_layout` which regenerates the entire floor plan from scratch using the modified parameters rather than performing localized topological re-optimization on the existing design.

---

## 7. Current Groq Flow
- `groq_service.py` is configured with `GROQ_TEXT_MODEL` (`openai/gpt-oss-120b`) and `GROQ_VISION_MODEL` (`meta-llama/llama-3.2-11b-vision-instruct`).
- Employs a robust model fallback sequence (`openai/gpt-oss-120b` → `qwen/qwen3.6-27b` → `llama-3.3-70b-versatile`) and an intelligent heuristic regex parser when no key is supplied.
- **Strength**: Highly resilient, zero runtime crashes.
- **Weakness**: Groq is currently only used for intake parsing and parameter deltas, not as an architectural critic evaluating spatial candidates.

---

## 8. Existing Strengths to Preserve
1. **Clean Consolidated Full-Stack Foundation**: Next.js App Router + FastAPI with fast startup and zero dependency conflicts.
2. **Resilient AI Routing**: Groq integration with multi-model fallback and heuristic NLP fallback ensures the system is always 100% operational.
3. **Multi-Floor Foundation**: `FloorPlan`, `num_floors`, and staircase alignment logic are already established in the models.
4. **Vector 2D Canvas**: Crisp SVG rendering with pan/zoom and PNG/SVG export.
5. **Interactive Three.js Core**: Smooth isometric camera, procedural floor materials, and touch gestures.
6. **Zero-Gap Geometric Verification**: Shapely-based automated test suite verifying 100% coverage and zero overlaps.

---

## 9. Existing Weaknesses
1. **Layout Engine behaves like rectangular partitioning rather than architectural design**:
   - Rooms lack real adjacency graph reasoning.
   - Circulation is not treated as a continuous primary spine.
   - Parking and setbacks are not site-first inputs.
   - No multi-candidate generation or multi-objective scoring.
2. **Refinement overwrites the design**:
   - Plain-language edits regenerate the whole house rather than localized cluster adjustments.
3. **No Design History / Versioning Model**:
   - Frontend has a lightweight in-memory undo, but backend lacks versioned project storage (`project.json`, `versions/v1.json`).
4. **3D Model lacks architectural elements**:
   - Missing site terrain, driveway, property boundary, roof geometries, stair openings through slabs, and door frames.
5. **UI feels like a viewer rather than an architectural studio**:
   - Center canvas should be the dominant hero (65–75% of screen).
   - Needs left project/design explorer and right AI Architect critic & local property inspector.

---

## 10. Component Evaluation

| Component | Status | Action |
|---|---|---|
| `backend/models.py` | Weak / Partial | **Refactor** into canonical architectural design schema (`Site`, `BuildingEnvelope`, `Circulation`, `Stairs`, `RoomProgram`, `GlobalWallNetwork`, `Metrics`) |
| `backend/layout_engine.py` | Procedural Guillotine | **Replace/Refactor** with architectural topology planner + CP-SAT spatial solver + Shapely validation + Multi-candidate generator |
| `backend/groq_service.py` | Good intake parser | **Extend** to act as Architectural Critic & Natural Language Modifier |
| `backend/test_coverage.py` | Good geometric test | **Extend** with comprehensive architectural validation (circulation connectivity, daylight, privacy, setbacks) |
| `frontend/src/components/FloorPlan2D.tsx` | Good vector canvas | **Preserve & Enhance** with architectural layers (doors, windows, dimensions, circulation paths, site boundary) |
| `frontend/src/components/Dollhouse3D.tsx` | Good Three.js setup | **Preserve & Enhance** with site ground, driveway, stair slab openings, real door/window openings, roof toggle, and synchronized selection |
| `frontend/src/app/page.tsx` | Good prototype layout | **Refactor** into professional CAD/Studio workspace layout with left project sidebar, center canvas (70%), and right AI Architect copilot panel |

---

## 11. Dependencies Audit
- **Already available & verified**:
  - Python: `fastapi`, `uvicorn`, `pydantic`, `groq`, `shapely`, `ortools`, `networkx`, `numpy`, `scipy`, `python-dotenv`, `websockets`, `python-multipart`.
  - Node.js: `next`, `react`, `react-dom`, `three`, `@types/three`, `lucide-react`, `tailwindcss`, `canvas-confetti`.
- **New dependencies needed**: None. All required computational geometry, graph theory, constraint programming, and 3D visualization libraries are already installed and functional.

---

## 12. Phased Implementation Plan

- [ ] **Phase 1: Canonical Architectural Design Model**
  - Define unified `CanonicalDesign` in `models.py` and `house.ts`: `Site` (setbacks, road frontage, driveway, pedestrian gate), `BuildingEnvelope`, `Rooms` (hard/soft constraints, required/forbidden adjacencies, privacy level, daylight), `Circulation` (continuous hallway paths), `GlobalWallNetwork` (shared wall entities), `Doors`, `Windows`, `Staircase`, `Scores`, and `Validation`.

- [ ] **Phase 2: Architectural Design Engine (Site, Zoning, Graph, Topology & CP-SAT)**
  - Implement Site-first planner (`site_planner.py`): calculates setbacks, driveway, parking, and buildable envelope.
  - Implement Room Relationship Graph with `networkx` (`zoning_graph.py`): builds public/private/service zones and weighted adjacency graphs.
  - Implement Architectural Topology Schemes: generate 3–5 distinct structural strategies (e.g. Central Circulation, Side Circulation, Courtyard, Linear).
  - Implement Geometry Solver with OR-Tools CP-SAT & Shapely (`spatial_solver.py`): solves exact room rectangles enforcing hard bounds, adjacency, setbacks, and furniture clearances.
  - Implement Global Wall Network (`wall_network.py`): extracts shared wall entities, places doors based on circulation, and positions windows on exterior perimeter according to daylight requirements.
  - Implement Multi-Objective Evaluator (`architectural_scorer.py`): computes real geometry-based scores (circulation efficiency, privacy, daylight, furniture fit).
  - Implement Groq Architectural Critic: evaluates candidates on architectural merits and outputs structured critique.

- [ ] **Phase 3: Localized Refinement System**
  - Implement targeted delta re-optimization: when the user modifies a room, identify the local cluster and adjust adjacent rooms without regenerating the entire house.

- [ ] **Phase 4: Project Storage & Version History**
  - Store canonical design states in `projects/{id}/project.json` and `versions/v{n}.json` with full undo/redo and version restoration.

- [ ] **Phase 5: Professional 2D Architectural Plan**
  - Enhance 2D SVG presentation with architectural title block, property boundary, parking footprint, continuous circulation hatching, and layer toggles.

- [ ] **Phase 6: Professional 3D Architectural Engine**
  - Enhance Three.js viewer with site ground, driveway, exterior property boundary, stair well openings through slabs, door frames, and roof toggle.

- [ ] **Phase 7: Synchronized 2D / 3D Selection**
  - Bi-directional selection sync: selecting a room, door, or wall in 2D instantly focuses and highlights it in 3D, and vice versa.

- [ ] **Phase 8: Studio UI/UX Redesign**
  - Professional architectural workspace layout: Left Project & Design tree, Center Canvas (65–75%), and Right AI Architect Copilot panel with real score gauges and modification preview.

- [ ] **Phase 9: Comprehensive Test Suite & Visual Verification**
  - Verify all 17 test scenarios outlined in specification; execute real browser tests and capture artifacts.
