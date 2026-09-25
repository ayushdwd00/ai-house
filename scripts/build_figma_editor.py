import os
import re

file_path = r"c:\Users\ASUS\OneDrive\Desktop\pro1234\frontend\src\components\ArchitecturalPlanRenderer.tsx"

with open(file_path, "r", encoding="utf-8") as f:
    code = f.read()

# Normalize line endings
code = code.replace("\r\n", "\n")

# 1. Make sure showDimensions, isLeftPanelOpen, isRightPanelOpen are defined
# Let's inspect where activeTool is defined
tool_state_marker = 'const [activeTool, setActiveTool] = useState<"select" | "room" | "wall" | "door" | "window" | "furniture" | "dimension">("select");'
new_tool_state = '''const [activeTool, setActiveTool] = useState<"select" | "room" | "wall" | "door" | "window" | "furniture" | "dimension">("select");
  const [showDimensions, setShowDimensions] = useState(true);
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);

  // Sync exact dimension inputs when selectedRoom changes
  useEffect(() => {
    if (selectedRoom && selectedRoom.rect) {
      setExactWidthInput(feetToArchitectural(selectedRoom.rect.width));
      setExactLengthInput(feetToArchitectural(selectedRoom.rect.length));
    }
  }, [selectedRoom?.id, selectedRoom?.rect?.width, selectedRoom?.rect?.length]);'''

if tool_state_marker in code and "const [showDimensions, setShowDimensions]" not in code:
    code = code.replace(tool_state_marker, new_tool_state)
    print("Added showDimensions and selection sync useEffect!")

# Let's find the start of the return statement
ret_marker = "  return (\n    <div className=\"relative w-full h-full flex flex-col select-none overflow-hidden bg-[#ECEEF2]\">"
ret_idx = code.find(ret_marker)
if ret_idx == -1:
    # Try finding without exact indentation
    m = re.search(r"return\s*\(\s*<div className=\"relative w-full h-full flex flex-col select-none overflow-hidden bg-\[#ECEEF2\]\">", code)
    if m:
        ret_idx = m.start()
        ret_marker = m.group(0)

print(f"Found return statement at index: {ret_idx}")

# Let's extract the SVG element
svg_start_idx = code.find("<svg\n            ref={svgRef}\n            id=\"architectural-svg\"")
if svg_start_idx == -1:
    svg_start_idx = code.find("<svg\n            ref={svgRef}")
if svg_start_idx == -1:
    m_svg = re.search(r"<svg\s+ref=\{svgRef\}", code)
    if m_svg:
        svg_start_idx = m_svg.start()

svg_end_idx = code.find("</svg>")
if svg_end_idx != -1:
    svg_end_idx += len("</svg>")

print(f"Found SVG element from {svg_start_idx} to {svg_end_idx}")
svg_jsx = code[svg_start_idx:svg_end_idx]

# Build the complete refactored return statement
editor_and_view_jsx = """  // Selected Entity helper
  const selectedEntity = selectedRoom || selectedFurniture || selectedDoor || selectedWindow || selectedWall;

  // Render SVG Drawing Sheet
  const renderSvgSheet = () => (
""" + "    " + svg_jsx + """
  );

  // -------------------------------------------------------------
  // 1. FIGMA-STYLE PROFESSIONAL EDITOR (when mode === 'edit')
  // -------------------------------------------------------------
  if (mode === "edit") {
    return (
      <div className="relative w-full h-full flex flex-col select-none overflow-hidden bg-[#0F1014] text-[#F3F4F6] font-sans">
        {/* TOP DOCKED HEADER & TOOLBAR */}
        <header className="h-12 border-b border-[#23252B] bg-[#16171B] flex items-center justify-between px-3 z-40 shrink-0">
          {/* Left: Exit/Back to Plan & Project Title */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={handleExit}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-mono text-[#E2E8F0] hover:text-white border border-white/5 transition-all"
              title="Exit to Plan Overview"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-[#C48446]" />
              <span className="font-semibold">EXIT</span>
            </button>
            <div className="h-4 w-px bg-white/10" />
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-white/90 truncate max-w-[200px]">
                {layout.title || "Architectural Floor Plan"}
              </span>
              <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-[#E69F58] font-mono text-[9px] uppercase font-bold tracking-wider border border-amber-500/30">
                EDITOR
              </span>
            </div>
          </div>

          {/* Center: Minimal Icon-Based Toolbar */}
          <div className="flex items-center gap-1 bg-[#202227] p-1 rounded-xl border border-white/5 shadow-inner">
            <button
              type="button"
              onClick={() => setActiveTool("select")}
              className={`p-1.5 rounded-lg transition-all ${
                activeTool === "select"
                  ? "bg-[#C48446] text-[#0A0B0E] shadow"
                  : "text-[#94A3B8] hover:text-white hover:bg-white/5"
              }`}
              title="Select & Move (V)"
            >
              <MousePointer className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setActiveTool("room")}
              className={`p-1.5 rounded-lg transition-all ${
                activeTool === "room"
                  ? "bg-[#C48446] text-[#0A0B0E] shadow"
                  : "text-[#94A3B8] hover:text-white hover:bg-white/5"
              }`}
              title="Room Tool (R)"
            >
              <Square className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setActiveTool("wall")}
              className={`p-1.5 rounded-lg transition-all ${
                activeTool === "wall"
                  ? "bg-[#C48446] text-[#0A0B0E] shadow"
                  : "text-[#94A3B8] hover:text-white hover:bg-white/5"
              }`}
              title="Wall Tool (W)"
            >
              <PenTool className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setActiveTool("door")}
              className={`p-1.5 rounded-lg transition-all ${
                activeTool === "door"
                  ? "bg-[#C48446] text-[#0A0B0E] shadow"
                  : "text-[#94A3B8] hover:text-white hover:bg-white/5"
              }`}
              title="Door Tool (D)"
            >
              <DoorClosed className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setActiveTool("window")}
              className={`p-1.5 rounded-lg transition-all ${
                activeTool === "window"
                  ? "bg-[#C48446] text-[#0A0B0E] shadow"
                  : "text-[#94A3B8] hover:text-white hover:bg-white/5"
              }`}
              title="Window Tool (O)"
            >
              <AppWindow className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setActiveTool("furniture")}
              className={`p-1.5 rounded-lg transition-all ${
                activeTool === "furniture"
                  ? "bg-[#C48446] text-[#0A0B0E] shadow"
                  : "text-[#94A3B8] hover:text-white hover:bg-white/5"
              }`}
              title="Furniture Tool (F)"
            >
              <Armchair className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setShowDimensions((prev) => !prev)}
              className={`p-1.5 rounded-lg transition-all ${
                showDimensions
                  ? "text-[#C48446] bg-[#C48446]/10"
                  : "text-[#94A3B8] hover:text-white hover:bg-white/5"
              }`}
              title="Toggle Dimensions (M)"
            >
              <Ruler className="w-4 h-4" />
            </button>
            <div className="h-4 w-px bg-white/10 mx-1" />
            {/* Integrated AI Architect accent button */}
            <button
              type="button"
              onClick={() => setIsAiOpen((prev) => !prev)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-mono font-semibold transition-all ${
                isAiOpen
                  ? "bg-[#C48446] text-[#0A0B0E] shadow"
                  : "bg-[#C48446]/15 hover:bg-[#C48446]/25 text-[#E69F58] border border-[#C48446]/30"
              }`}
              title="AI Architectural Assistant"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>✦ AI ARCHITECT</span>
            </button>
          </div>

          {/* Right: Undo / Redo / Done / Export */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={undo}
              disabled={!canUndo}
              className="p-2 rounded-lg hover:bg-white/5 text-[#94A3B8] hover:text-white disabled:opacity-30 transition-colors"
              title="Undo (Ctrl+Z)"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              className="p-2 rounded-lg hover:bg-white/5 text-[#94A3B8] hover:text-white disabled:opacity-30 transition-colors"
              title="Redo (Ctrl+Y)"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
            <div className="h-4 w-px bg-white/10 mx-1" />
            <button
              onClick={handleExportPNG}
              disabled={isExporting}
              className="p-2 rounded-lg hover:bg-white/5 text-[#94A3B8] hover:text-white disabled:opacity-40 transition-colors"
              title="Export Architectural Drawing (PNG)"
            >
              {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={handleDone}
              disabled={isSaving}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#C48446] hover:bg-[#D49456] text-[#0A0B0E] font-bold text-xs font-mono tracking-wider shadow transition-all"
              title="Save & Return to Plan"
            >
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
              <span>DONE</span>
            </button>
          </div>
        </header>

        {/* WORKBENCH BODY: Left Panel + Dominant Canvas + Right Inspector Panel */}
        <div className="flex-1 flex overflow-hidden relative">
          {/* LEFT PANEL: LAYERS / STRUCTURE */}
          <aside className="w-64 bg-[#16171B] border-r border-[#23252B] flex flex-col z-20 shrink-0">
            {/* Floor switcher */}
            <div className="p-3 border-b border-[#23252B]">
              <div className="text-[10px] font-mono uppercase font-bold tracking-wider text-[#94A3B8] mb-2 flex items-center justify-between">
                <span>FLOORS</span>
                <span className="text-white/40">{layout.floors?.length || 1} Levels</span>
              </div>
              <div className="flex gap-1 p-0.5 rounded-lg bg-[#202227] border border-white/5">
                {(layout.floors || [{ floor_number: 1, floor_name: "Ground Floor" }]).map((fl, idx) => (
                  <button
                    key={fl.floor_number}
                    onClick={() => onSelectFloor?.(idx)}
                    className={`flex-1 py-1 rounded text-[11px] font-mono font-medium transition-all ${
                      activeFloorIndex === idx
                        ? "bg-[#C48446] text-[#0A0B0E] shadow"
                        : "text-[#94A3B8] hover:text-white"
                    }`}
                  >
                    {fl.floor_name ? fl.floor_name.replace(" Floor", "") : `L${fl.floor_number}`}
                  </button>
                ))}
              </div>
            </div>

            {/* Structure / Layers List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              <div className="px-2 py-1 text-[10px] font-mono uppercase font-bold tracking-wider text-[#94A3B8] flex items-center justify-between">
                <span>ROOMS ({(currentFloor.rooms || []).length})</span>
                <span className="text-[9px] text-white/40">SELECT</span>
              </div>

              {(currentFloor.rooms || []).map((room) => {
                const isSelected = selectedRoomId === room.id;
                return (
                  <div
                    key={room.id}
                    onClick={() => handleSelectRoom(isSelected ? null : room.id)}
                    className={`group flex items-center justify-between px-2.5 py-2 rounded-lg cursor-pointer transition-all ${
                      isSelected
                        ? "bg-[#C48446]/20 border-l-2 border-[#C48446] text-white"
                        : "hover:bg-white/5 text-[#CBD5E1]"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={isSelected ? "text-[#C48446]" : "text-[#94A3B8]"}>
                        {getRoomIcon(room.type)}
                      </span>
                      <div className="truncate">
                        <div className="text-xs font-medium truncate">{room.name}</div>
                        <div className="text-[10px] font-mono text-[#94A3B8]">
                          {feetToArchitectural(room.rect.width)} × {feetToArchitectural(room.rect.length)}
                        </div>
                      </div>
                    </div>
                    <span className="shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-[#94A3B8]">
                      {room.area_sqft || Math.round(room.rect.width * room.rect.length)} sf
                    </span>
                  </div>
                );
              })}

              {/* Structural Entities count */}
              <div className="pt-3 mt-3 border-t border-[#23252B] px-2 space-y-1.5 text-[11px] font-mono text-[#94A3B8]">
                <div className="flex justify-between">
                  <span>Walls:</span>
                  <span className="text-white/70">{(currentFloor.walls || layout.walls || []).length}</span>
                </div>
                <div className="flex justify-between">
                  <span>Doors:</span>
                  <span className="text-white/70">{(currentFloor.doors || layout.doors || []).length}</span>
                </div>
                <div className="flex justify-between">
                  <span>Windows:</span>
                  <span className="text-white/70">{(currentFloor.windows || layout.windows || []).length}</span>
                </div>
              </div>
            </div>
          </aside>

          {/* CENTER HERO CANVAS */}
          <main
            ref={containerRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onDoubleClick={handleResetView}
            className={`flex-1 h-full relative overflow-hidden bg-[#0D0E11] flex items-center justify-center ${
              isPanning ? "cursor-grabbing" : isPanMode ? "cursor-grab" : "cursor-default"
            }`}
          >
            {/* SVG Canvas with Pan & Zoom */}
            <div
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: "center center",
                transition: isPanning || draggingRoom || draggingFurniture || resizingRoom ? "none" : "transform 0.12s cubic-bezier(0.16, 1, 0.3, 1)",
              }}
              className="flex items-center justify-center"
            >
              {renderSvgSheet()}
            </div>

            {/* INVALID OPERATION WARNING BANNER */}
            {invalidMoveNotice && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 rounded-full bg-red-950/90 text-red-200 border border-red-500/40 shadow-2xl text-xs font-mono animate-in fade-in slide-in-from-top-2 duration-200">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{invalidMoveNotice}</span>
              </div>
            )}

            {/* EDIT NOTICE / CONSTRAINT WARNING BANNER */}
            {editNotice && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-full bg-[#12141A]/95 border border-[#C48446]/60 shadow-2xl text-xs font-mono text-[#F5F3EF] flex items-center gap-2.5 animate-in fade-in slide-in-from-top-1 duration-200">
                <Info className="w-4 h-4 text-[#C48446] shrink-0" />
                <span>{editNotice}</span>
                <button
                  onClick={() => setEditNotice(null)}
                  className="ml-2 text-[#9E9C98] hover:text-white p-0.5 rounded-full hover:bg-white/10"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* AI ARCHITECT POPOVER CARD */}
            {isAiOpen && (
              <div className="absolute top-4 left-4 z-40 w-80 p-4 rounded-2xl bg-[#16171B]/95 backdrop-blur-md border border-[#C48446]/30 shadow-2xl text-[#F5F3EF] animate-in fade-in slide-in-from-left-2 duration-200">
                <div className="flex items-center justify-between pb-2 border-b border-white/10">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#C48446]" />
                    <span className="font-mono text-xs font-semibold uppercase tracking-wider text-[#E69F58]">
                      AI Architectural Assistant
                    </span>
                  </div>
                  <button
                    onClick={() => setIsAiOpen(false)}
                    className="p-1 rounded-full hover:bg-white/10 text-[#9E9C98] hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Quick Prompts */}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {[
                    "Enlarge living room by 2ft",
                    "Optimize bedroom circulation",
                    "Add a walk-in wardrobe",
                    "Align dining with kitchen",
                  ].map((chip) => (
                    <button
                      key={chip}
                      onClick={() => handleAiAction(chip)}
                      disabled={isAiProcessing}
                      className="px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 text-[10px] font-mono text-[#9E9C98] hover:text-[#F5F3EF] border border-white/5 transition-all text-left"
                    >
                      {chip}
                    </button>
                  ))}
                </div>

                {/* Notice */}
                {aiNotice && (
                  <div className="mt-2.5 p-2 rounded-lg bg-[#C48446]/10 border border-[#C48446]/20 text-[11px] font-mono text-[#C48446] leading-relaxed">
                    {aiNotice}
                  </div>
                )}

                {/* Custom Input */}
                <div className="mt-3 flex items-center gap-2">
                  <input
                    type="text"
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleAiAction(aiPrompt);
                      }
                    }}
                    placeholder="Request architectural change..."
                    disabled={isAiProcessing}
                    className="flex-1 px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-xs font-mono text-[#F5F3EF] placeholder-[#9E9C98] focus:outline-none focus:border-[#C48446]"
                  />
                  <button
                    onClick={() => handleAiAction(aiPrompt)}
                    disabled={isAiProcessing || !aiPrompt.trim()}
                    className="p-2 rounded-lg bg-[#C48446] hover:bg-[#D49456] text-[#0A0B0E] disabled:opacity-30 transition-colors"
                  >
                    {isAiProcessing ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                {/* Gemini QA Review Button */}
                <div className="mt-3 pt-2.5 border-t border-white/10">
                  <button
                    onClick={handleRunGeminiQa}
                    disabled={isQaReviewing || isAiProcessing}
                    className="w-full py-1.5 px-3 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 hover:text-sky-300 border border-sky-500/30 text-[11px] font-mono font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                  >
                    {isQaReviewing ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Reviewing Floor Plan...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                        <span>RUN VISUAL QA REVIEW</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* BOTTOM-RIGHT FLOATING ZOOM/PAN CONTROLS */}
            <div className="absolute bottom-4 right-4 z-30 flex items-center gap-1 p-1 rounded-xl bg-[#16171B]/95 backdrop-blur-md border border-white/10 shadow-2xl text-xs font-mono text-[#94A3B8]">
              <button
                onClick={() => setZoom((z) => Math.max(0.4, z * 0.85))}
                className="p-1.5 rounded-lg hover:bg-white/5 hover:text-white"
                title="Zoom Out (-)"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="px-2 text-[11px] font-bold text-white select-none">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => setZoom((z) => Math.min(3.5, z * 1.15))}
                className="p-1.5 rounded-lg hover:bg-white/5 hover:text-white"
                title="Zoom In (+)"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <div className="h-4 w-px bg-white/10 mx-0.5" />
              <button
                onClick={handleResetView}
                className="px-2 py-1 rounded-lg hover:bg-white/5 hover:text-white text-[10px]"
                title="Fit to Screen"
              >
                FIT
              </button>
              <button
                onClick={() => setIsPanMode((prev) => !prev)}
                className={`p-1.5 rounded-lg ${isPanMode ? "bg-[#C48446] text-[#0A0B0E]" : "hover:bg-white/5 hover:text-white"}`}
                title="Pan Tool (Hand)"
              >
                <Hand className="w-3.5 h-3.5" />
              </button>
            </div>
          </main>

          {/* RIGHT PANEL: PROPERTIES / INSPECTOR */}
          <aside className="w-72 bg-[#16171B] border-l border-[#23252B] flex flex-col z-20 shrink-0 overflow-y-auto">
            {/* Inspector Header */}
            <div className="p-3 border-b border-[#23252B] flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase font-bold tracking-wider text-[#94A3B8]">
                PROPERTIES
              </span>
              {selectedEntity && (
                <button
                  onClick={() => {
                    handleSelectRoom(null);
                    handleSelectFurniture(null);
                    setSelectedWallId(null);
                    setSelectedDoorId(null);
                    setSelectedWindowId(null);
                  }}
                  className="p-1 rounded hover:bg-white/10 text-[#94A3B8] hover:text-white"
                  title="Deselect"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="p-4 space-y-4">
              {selectedRoom ? (
                <>
                  {/* Room Name & Type */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-mono uppercase text-[#94A3B8] block">Room Name</label>
                    <input
                      type="text"
                      value={selectedRoom.name}
                      onChange={(e) => {
                        const newName = e.target.value;
                        setLayout((prev) => {
                          const nextFloors = prev.floors ? [...prev.floors] : [];
                          if (nextFloors[activeFloorIndex]) {
                            nextFloors[activeFloorIndex] = {
                              ...nextFloors[activeFloorIndex],
                              rooms: nextFloors[activeFloorIndex].rooms.map((r) =>
                                r.id === selectedRoom.id ? { ...r, name: newName } : r
                              ),
                            };
                            return { ...prev, floors: nextFloors };
                          }
                          return prev;
                        });
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-[#202227] border border-white/10 text-xs font-sans text-white focus:outline-none focus:border-[#C48446]"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono uppercase text-[#94A3B8] block">Room Type</label>
                    <select
                      value={selectedRoom.type}
                      onChange={(e) => {
                        const newType = e.target.value as any;
                        setLayout((prev) => {
                          const nextFloors = prev.floors ? [...prev.floors] : [];
                          if (nextFloors[activeFloorIndex]) {
                            nextFloors[activeFloorIndex] = {
                              ...nextFloors[activeFloorIndex],
                              rooms: nextFloors[activeFloorIndex].rooms.map((r) =>
                                r.id === selectedRoom.id ? { ...r, type: newType } : r
                              ),
                            };
                            return { ...prev, floors: nextFloors };
                          }
                          return prev;
                        });
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-[#202227] border border-white/10 text-xs font-mono text-[#CBD5E1] focus:outline-none focus:border-[#C48446]"
                    >
                      <option value="living_room">Living Room</option>
                      <option value="master_bedroom">Master Bedroom / Primary Suite</option>
                      <option value="bedroom">Bedroom</option>
                      <option value="guest_bedroom">Guest Bedroom</option>
                      <option value="dining">Dining Room</option>
                      <option value="kitchen">Kitchen</option>
                      <option value="bathroom">Bathroom</option>
                      <option value="powder_room">Powder Room</option>
                      <option value="entry_foyer">Entry Foyer</option>
                      <option value="hallway">Circulation / Hallway</option>
                      <option value="office">Home Office / Study</option>
                      <option value="pooja">Pooja Room</option>
                      <option value="balcony">Balcony / Terrace</option>
                      <option value="utility">Utility / Laundry</option>
                    </select>
                  </div>

                  {/* Dimensions */}
                  <div className="space-y-2 pt-2 border-t border-[#23252B]">
                    <label className="text-[10px] font-mono uppercase text-[#94A3B8] block">Dimensions</label>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-[9px] font-mono text-[#94A3B8] block mb-1">Width</span>
                        <input
                          type="text"
                          value={exactWidthInput}
                          onChange={(e) => setExactWidthInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleApplyExactDimensions();
                          }}
                          className="w-full px-2 py-1.5 rounded-lg bg-[#202227] border border-white/10 text-xs font-mono text-white text-center focus:outline-none focus:border-[#C48446]"
                          placeholder="12'-0&quot;"
                        />
                      </div>
                      <div>
                        <span className="text-[9px] font-mono text-[#94A3B8] block mb-1">Depth / Length</span>
                        <input
                          type="text"
                          value={exactLengthInput}
                          onChange={(e) => setExactLengthInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleApplyExactDimensions();
                          }}
                          className="w-full px-2 py-1.5 rounded-lg bg-[#202227] border border-white/10 text-xs font-mono text-white text-center focus:outline-none focus:border-[#C48446]"
                          placeholder="14'-0&quot;"
                        />
                      </div>
                    </div>

                    {/* Live Area Pill */}
                    <div className="p-2 rounded-lg bg-white/5 border border-white/5 flex items-center justify-between text-xs font-mono">
                      <span className="text-[#94A3B8]">Floor Area:</span>
                      <span className="text-[#C48446] font-bold">
                        {selectedRoom.area_sqft || Math.round(selectedRoom.rect.width * selectedRoom.rect.length)} SQ FT
                      </span>
                    </div>

                    {/* Apply Dimensions Button */}
                    <button
                      type="button"
                      onClick={handleApplyExactDimensions}
                      disabled={isApplyingExact}
                      className="w-full py-2 rounded-lg bg-[#C48446] hover:bg-[#D49456] text-[#0A0B0E] font-bold text-xs font-mono flex items-center justify-center gap-1.5 transition-all shadow"
                    >
                      {isApplyingExact ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
                      <span>APPLY DIMENSIONS</span>
                    </button>
                  </div>

                  {/* Quick Adjustments */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-mono uppercase text-[#94A3B8] block">Step Adjustments</span>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        onClick={() => handleStepResizeRoom("width", 1)}
                        className="py-1.5 rounded bg-white/5 hover:bg-white/10 text-[11px] font-mono text-[#CBD5E1] border border-white/5"
                      >
                        +1&apos; Width
                      </button>
                      <button
                        onClick={() => handleStepResizeRoom("width", -1)}
                        className="py-1.5 rounded bg-white/5 hover:bg-white/10 text-[11px] font-mono text-[#CBD5E1] border border-white/5"
                      >
                        -1&apos; Width
                      </button>
                      <button
                        onClick={() => handleStepResizeRoom("length", 1)}
                        className="py-1.5 rounded bg-white/5 hover:bg-white/10 text-[11px] font-mono text-[#CBD5E1] border border-white/5"
                      >
                        +1&apos; Depth
                      </button>
                      <button
                        onClick={() => handleStepResizeRoom("length", -1)}
                        className="py-1.5 rounded bg-white/5 hover:bg-white/10 text-[11px] font-mono text-[#CBD5E1] border border-white/5"
                      >
                        -1&apos; Depth
                      </button>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-2 border-t border-[#23252B] space-y-2">
                    <button
                      type="button"
                      onClick={() => {
                        setAiPrompt(`Optimize layout and furniture of ${selectedRoom.name}`);
                        setIsAiOpen(true);
                      }}
                      className="w-full py-2 rounded-lg bg-[#C48446]/10 hover:bg-[#C48446]/20 border border-[#C48446]/30 text-[#E69F58] text-xs font-mono flex items-center justify-center gap-1.5"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>✦ Ask AI to Optimize</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDeleteSelected}
                      className="w-full py-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 text-xs font-mono flex items-center justify-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Room</span>
                    </button>
                  </div>
                </>
              ) : selectedWall ? (
                /* Wall Properties */
                <div className="space-y-3">
                  <div>
                    <div className="text-xs font-bold text-white uppercase">
                      WALL ({selectedWall.is_exterior ? "EXTERIOR" : "INTERIOR PARTITION"})
                    </div>
                    <div className="text-[10px] font-mono text-[#94A3B8] mt-0.5">
                      Thickness: {Math.round(selectedWall.thickness * 12)}&quot;
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleToggleWallThickness}
                    className="w-full py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-mono text-white"
                  >
                    TOGGLE THICKNESS (4.5&quot; / 9&quot;)
                  </button>

                  <div className="text-[10px] text-[#64748B] leading-relaxed">
                    Drag the wall line to move it, or drag its endpoints to stretch/shorten.
                  </div>
                </div>
              ) : selectedDoor ? (
                /* Door Properties */
                <div className="space-y-3">
                  <div>
                    <div className="text-xs font-bold text-white uppercase">
                      DOOR {selectedDoor.id}
                    </div>
                    <div className="text-[10px] font-mono text-[#94A3B8] mt-0.5">
                      Width: {selectedDoor.width || 3.0}&apos;-0&quot; · Swing: {selectedDoor.swing_direction || "inward"}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleFlipDoorSwing}
                    className="w-full py-2 rounded-lg bg-[#C48446]/10 hover:bg-[#C48446]/20 border border-[#C48446]/30 text-[#E69F58] text-xs font-mono flex items-center justify-center gap-1.5"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    <span>FLIP SWING DIRECTION</span>
                  </button>
                </div>
              ) : selectedWindow ? (
                /* Window Properties */
                <div className="space-y-3">
                  <div>
                    <div className="text-xs font-bold text-white uppercase">
                      WINDOW {selectedWindow.id}
                    </div>
                    <div className="text-[10px] font-mono text-[#94A3B8] mt-0.5">
                      Width: {selectedWindow.width || 4.0}&apos;-0&quot;
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleResizeWindowWidth(1)}
                      className="py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-mono text-white"
                    >
                      +1&apos; Width
                    </button>
                    <button
                      type="button"
                      onClick={() => handleResizeWindowWidth(-1)}
                      className="py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-mono text-white"
                    >
                      -1&apos; Width
                    </button>
                  </div>
                </div>
              ) : selectedFurniture ? (
                /* Furniture Properties */
                <div className="space-y-3">
                  <div>
                    <div className="text-xs font-bold text-white uppercase">
                      {selectedFurniture.type.replace(/_/g, " ")}
                    </div>
                    <div className="text-[10px] font-mono text-[#94A3B8] mt-0.5">
                      {selectedFurniture.width}&apos; × {selectedFurniture.depth || selectedFurniture.length}&apos;
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleRotateFurniture}
                    className="w-full py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-mono text-white flex items-center justify-center gap-1.5"
                  >
                    <RotateCw className="w-3.5 h-3.5 text-[#C48446]" />
                    <span>ROTATE 90°</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDeleteSelected}
                    className="w-full py-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 text-xs font-mono flex items-center justify-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Item</span>
                  </button>
                </div>
              ) : (
                /* Default Plan Overview */
                <div className="space-y-3 text-xs font-mono">
                  <div className="p-3 rounded-xl bg-white/5 border border-white/5 space-y-2">
                    <div className="text-[10px] uppercase font-bold text-[#C48446]">PLAN OVERVIEW</div>
                    <div className="flex justify-between text-[#94A3B8]">
                      <span>Plot Size:</span>
                      <span className="text-white font-medium">{layout.plot_width}&apos; × {layout.plot_length}&apos;</span>
                    </div>
                    <div className="flex justify-between text-[#94A3B8]">
                      <span>Built-Up Area:</span>
                      <span className="text-white font-medium">{layout.total_area_sqft || 949} SQ FT</span>
                    </div>
                    <div className="flex justify-between text-[#94A3B8]">
                      <span>Road Frontage:</span>
                      <span className="text-white font-medium">{layout.site?.road_side?.toUpperCase() || "SOUTH"}</span>
                    </div>
                    <div className="flex justify-between text-[#94A3B8]">
                      <span>Rooms on Floor:</span>
                      <span className="text-white font-medium">{(currentFloor.rooms || []).length}</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-[#64748B] leading-relaxed">
                    Select any room, wall, door, or furniture on the canvas or from the Layers panel to inspect and customize properties.
                  </p>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // 2. PRESENTATION VIEW MODE (when mode === 'view')
  // -------------------------------------------------------------
  return (
    <div className="relative w-full h-full flex flex-col select-none overflow-hidden bg-[#ECEEF2]">
      {/* Presentation Top Bar */}
      <div className="absolute top-4 sm:top-5 left-4 sm:left-6 right-4 sm:right-6 z-30 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            onClick={() => router.push(`/project/${layout.id}/plan`)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#12141A]/90 hover:bg-[#1A1D24] text-[#F5F3EF] border border-white/10 text-xs font-mono tracking-wider shadow-lg transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-[#C48446]" />
            <span>PLAN</span>
          </button>

          {/* Floor Level Switcher */}
          {layout.floors && layout.floors.length > 1 && onSelectFloor && (
            <div className="flex items-center p-0.5 rounded-full bg-[#12141A]/90 border border-white/10 shadow-lg text-[10px] font-mono text-[#9E9C98]">
              {layout.floors.map((fl, idx) => (
                <button
                  key={fl.floor_number}
                  onClick={() => onSelectFloor(idx)}
                  className={`px-2.5 py-1 rounded-full transition-all ${
                    activeFloorIndex === idx
                      ? "bg-[#C48446] text-[#0A0B0E] font-medium shadow-sm"
                      : "hover:text-[#F5F3EF]"
                  }`}
                >
                  {fl.floor_name ? fl.floor_name.replace(" Floor", "").toUpperCase() : idx === 0 ? "GROUND" : idx === 1 ? "FIRST" : `L${fl.floor_number}`}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Export PNG */}
        <div className="pointer-events-auto">
          <button
            onClick={handleExportPNG}
            disabled={isExporting}
            className="p-2 rounded-full bg-[#12141A]/90 hover:bg-[#1A1D24] text-[#9E9C98] hover:text-[#F5F3EF] border border-white/10 shadow-lg transition-all disabled:opacity-50"
            title="Export Architectural Drawing (PNG)"
          >
            {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Main Drafting SVG Canvas */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleResetView}
        className={`w-full h-full flex items-center justify-center p-4 ${
          isPanning ? "cursor-grabbing" : isPanMode ? "cursor-grab" : "cursor-default"
        }`}
      >
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "center center",
            transition: isPanning || draggingRoom || draggingFurniture || resizingRoom ? "none" : "transform 0.12s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
          className="flex items-center justify-center"
        >
          {renderSvgSheet()}
        </div>
      </div>

      {/* Minimal Bottom Zoom Controls */}
      <div className="absolute bottom-4 sm:bottom-6 right-4 sm:right-6 z-30 flex items-center p-1 rounded-full bg-[#12141A]/90 backdrop-blur-md border border-white/10 shadow-2xl text-[11px] font-mono text-[#9E9C98]">
        <button
          onClick={() => setZoom((z) => Math.min(3.5, z * 1.15))}
          className="p-1.5 rounded-full hover:bg-white/5 text-[#9E9C98] hover:text-[#F5F3EF] transition-colors"
          title="Zoom In (+)"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => setZoom((z) => Math.max(0.4, z * 0.85))}
          className="p-1.5 rounded-full hover:bg-white/5 text-[#9E9C98] hover:text-[#F5F3EF] transition-colors"
          title="Zoom Out (-)"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <span className="px-2 select-none text-[10px] text-[#F5F3EF] font-bold">
          {Math.round(zoom * 100)}%
        </span>
        <div className="h-4 w-px bg-white/10 mx-1" />
        <button
          onClick={handleResetView}
          className="p-1.5 rounded-full hover:bg-white/5 text-[#9E9C98] hover:text-[#F5F3EF] transition-colors"
          title="Fit to Sheet"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => setIsPanMode(!isPanMode)}
          className={`p-1.5 rounded-full transition-colors ${
            isPanMode
              ? "bg-[#C48446] text-black"
              : "hover:bg-white/5 text-[#9E9C98] hover:text-[#F5F3EF]"
          }`}
          title={isPanMode ? "Exit Pan Mode" : "Pan Mode"}
        >
          <Hand className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
"""

# Replace from ret_idx to end of file (before closing `};`)
end_component_idx = code.rfind("};")
if end_component_idx != -1:
    new_code = code[:ret_idx] + editor_and_view_jsx + "\n};\n"
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(new_code)
    print("Successfully replaced edit & view modes with Figma-style studio!")
else:
    print("Could not find end of component `};`")
