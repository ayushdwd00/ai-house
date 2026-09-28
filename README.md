# 🏠 AI House

### AI-Powered Residential House Plan Generator

AI House is an AI-powered platform that transforms user requirements and plot constraints into intelligent **2D floor plans, 3D house models, landscaping concepts, and preliminary construction estimates**.

It combines **LLM-based architectural reasoning, OR-Tools constraint optimization, Shapely geometry, and 3D visualization** to create structured and editable residential designs.

---

## ✨ Features

- 🧠 AI-powered architectural reasoning
- 📐 Intelligent 2D floor-plan generation
- 🏡 3D architectural visualization
- 🌳 AI-assisted landscaping
- 🚗 Parking and site planning
- 🪑 Furniture-aware room planning
- 🚪 Automatic doors and windows
- 🪜 Staircase planning
- 🧭 Optional Vastu considerations
- ✏️ Natural-language design editing
- 💰 Preliminary construction estimation
- 🔍 Architectural and geometric validation

---

## 🧠 How It Works

```text
User Requirements
       ↓
AI Architect
       ↓
Design Intent
       ↓
Site Planning & Zoning
       ↓
OR-Tools Spatial Optimization
       ↓
Shapely Geometry Validation
       ↓
Doors / Windows / Furniture
       ↓
Landscape Planning
       ↓
AI Architectural Critic
       ↓
Final Architectural Model
       ↓
   ┌───┴───┐
   ↓       ↓
  PLAN    MODEL
   ↓       ↓
  2D      3D
```

The LLM handles architectural reasoning and design intent, while deterministic systems handle geometry, constraints, and validation.

---

## 🏗️ Core Architecture

AI House uses a canonical architectural model as the single source of truth:

```text
HouseLayout
├── Site
├── Floors
├── Zones
├── Rooms
├── Circulation
├── Walls
├── Doors
├── Windows
├── Staircases
├── Furniture
├── Parking
└── Landscape
```

Both the 2D plan and 3D model are generated from the same architectural model, keeping the design synchronized.

---

## ✏️ Natural Language Editing

Users can modify their designs using simple commands:

- "Kitchen thodi badi karo"
- "Master bedroom ko garden ke paas shift karo"
- "Living room aur dining ko open kar do"
- "2 car parking add karo"
- "Master bedroom mein attached bathroom add karo"

The system converts these requests into structured edits and locally re-optimizes the affected geometry.

---

## 📐 Architectural Validation

Generated designs are checked for:

- Plot boundaries
- Setbacks
- Buildable area
- Room dimensions
- Room proportions
- Adjacency
- Circulation
- Furniture clearance
- Door accessibility
- Window requirements
- Parking
- Staircase connectivity
- Landscape conflicts

---

## 🛠️ Tech Stack

**AI**
- DeepSeek / Groq
- LLM-based architectural reasoning
- Structured JSON outputs
- AI architectural critique

**Backend**
- Python
- FastAPI
- Pydantic
- OR-Tools
- Shapely

**Frontend**
- React
- JavaScript / TypeScript
- Modern UI

**Deployment**
- Vercel — Frontend
- Render — Backend

---

## 📁 Project Structure

```text
ai-house/
├── backend/
│   ├── ai/
│   ├── architecture_engine/
│   ├── landscape_engine/
│   ├── models/
│   ├── render/
│   ├── estimation/
│   ├── refinement/
│   └── main.py
│
├── frontend/
│   ├── app/
│   ├── components/
│   ├── lib/
│   ├── types/
│   └── public/
│
├── docs/
├── .gitignore
└── README.md
```

---

## 🚀 Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/ai-house.git
cd ai-house
```

### 2. Backend Setup

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate

# macOS / Linux
source
