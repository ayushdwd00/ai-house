import re

file_path = r"c:\Users\ASUS\OneDrive\Desktop\pro1234\frontend\src\components\ArchitecturalPlanRenderer.tsx"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

start_marker = "    // 1. Bed (King, Queen, Single)"
end_marker = "    // Default Fallback\n    return (\n      <g\n        key={item.id}\n        transform={`rotate(${item.rotation || 0}, ${ix}, ${iy})`}\n        onClick={handleFurnitureClick}\n        onMouseDown={handleFurnitureMouseDown}\n        className={`${mode === \"edit\" ? \"cursor-move\" : \"cursor-pointer\"}`}\n      >\n        <rect\n          x={ix - iw / 2}\n          y={iy - il / 2}\n          width={iw}\n          height={il}\n          rx={2}\n          fill={isSelected ? \"#FFFDF9\" : \"#F8FAFC\"}\n          stroke={strokeCol}\n          strokeWidth={strokeW}\n        />\n        {isSelected && mode === \"edit\" && (\n          <circle cx={ix} cy={iy - il / 2 - 8} r={4} fill=\"#C48446\" />\n        )}\n      </g>\n    );"

# Normalize newlines for matching
content_normalized = content.replace("\r\n", "\n")

replacement = """    // Minimal Architectural CAD Furniture Outlines
    const isBed = item.type.includes("bed");
    const isSofa = item.type.includes("sofa") || item.type.includes("couch");
    const isDining = item.type.includes("dining") || item.type.includes("table");
    const isBath = item.type.includes("toilet") || item.type.includes("commode") || item.type.includes("wc");
    const isBasin = item.type.includes("sink") || item.type.includes("basin") || item.type.includes("vanity");
    const isShower = item.type.includes("shower") || item.type.includes("bath");
    const isKitchen = item.type.includes("counter") || item.type.includes("stove") || item.type.includes("kitchen") || item.type.includes("cooktop");
    const isWardrobe = item.type.includes("wardrobe") || item.type.includes("closet");

    return (
      <g
        key={item.id}
        transform={`rotate(${item.rotation || 0}, ${ix}, ${iy})`}
        onClick={handleFurnitureClick}
        onMouseDown={handleFurnitureMouseDown}
        className={`${mode === "edit" ? "cursor-move" : "cursor-pointer"}`}
      >
        {/* Main Boundary Outline */}
        <rect
          x={ix - iw / 2}
          y={iy - il / 2}
          width={iw}
          height={il}
          rx={isSofa || isBasin ? 4 : 2}
          fill={isSelected ? "#FFFBF5" : "#FFFFFF"}
          stroke={strokeCol}
          strokeWidth={strokeW}
        />

        {/* Minimal Bed Outline */}
        {isBed && (
          <>
            <line
              x1={ix - iw / 2}
              y1={iy - il / 2 + Math.max(4, il * 0.14)}
              x2={ix + iw / 2}
              y2={iy - il / 2 + Math.max(4, il * 0.14)}
              stroke={strokeCol}
              strokeWidth={1}
            />
            <rect
              x={ix - iw / 2 + iw * 0.1}
              y={iy - il / 2 + 5}
              width={iw * 0.34}
              height={Math.min(14, il * 0.22)}
              rx={2}
              fill="none"
              stroke="#94A3B8"
              strokeWidth={0.9}
            />
            <rect
              x={ix + iw / 2 - iw * 0.1 - iw * 0.34}
              y={iy - il / 2 + 5}
              width={iw * 0.34}
              height={Math.min(14, il * 0.22)}
              rx={2}
              fill="none"
              stroke="#94A3B8"
              strokeWidth={0.9}
            />
          </>
        )}

        {/* Minimal Sofa Outline */}
        {isSofa && (
          <>
            <line
              x1={ix - iw / 2 + 6}
              y1={iy - il / 2 + Math.max(6, il * 0.25)}
              x2={ix + iw / 2 - 6}
              y2={iy - il / 2 + Math.max(6, il * 0.25)}
              stroke={strokeCol}
              strokeWidth={1}
            />
            <line
              x1={ix - iw / 2 + Math.max(5, iw * 0.12)}
              y1={iy - il / 2}
              x2={ix - iw / 2 + Math.max(5, iw * 0.12)}
              y2={iy + il / 2}
              stroke={strokeCol}
              strokeWidth={0.9}
            />
            <line
              x1={ix + iw / 2 - Math.max(5, iw * 0.12)}
              y1={iy - il / 2}
              x2={ix + iw / 2 - Math.max(5, iw * 0.12)}
              y2={iy + il / 2}
              stroke={strokeCol}
              strokeWidth={0.9}
            />
          </>
        )}

        {/* Minimal Dining Table */}
        {isDining && (
          <rect
            x={ix - iw / 2 + 3}
            y={iy - il / 2 + 3}
            width={Math.max(2, iw - 6)}
            height={Math.max(2, il - 6)}
            fill="none"
            stroke="#CBD5E1"
            strokeWidth={0.7}
            strokeDasharray="2 2"
          />
        )}

        {/* Minimal Toilet */}
        {isBath && (
          <>
            <rect
              x={ix - iw / 2 + 3}
              y={iy - il / 2 + 2}
              width={Math.max(4, iw - 6)}
              height={Math.max(4, il * 0.3)}
              rx={1}
              fill="none"
              stroke={strokeCol}
              strokeWidth={1}
            />
            <ellipse
              cx={ix}
              cy={iy + il * 0.15}
              rx={Math.max(3, iw * 0.32)}
              ry={Math.max(4, il * 0.32)}
              fill="none"
              stroke={strokeCol}
              strokeWidth={1}
            />
          </>
        )}

        {/* Minimal Basin */}
        {isBasin && (
          <circle
            cx={ix}
            cy={iy}
            r={Math.min(iw, il) * 0.28}
            fill="none"
            stroke={strokeCol}
            strokeWidth={1}
          />
        )}

        {/* Minimal Shower */}
        {isShower && (
          <>
            <line
              x1={ix - iw / 2 + 3}
              y1={iy - il / 2 + 3}
              x2={ix + iw / 2 - 3}
              y2={iy + il / 2 - 3}
              stroke="#CBD5E1"
              strokeWidth={0.8}
            />
            <line
              x1={ix + iw / 2 - 3}
              y1={iy - il / 2 + 3}
              x2={ix - iw / 2 + 3}
              y2={iy + il / 2 - 3}
              stroke="#CBD5E1"
              strokeWidth={0.8}
            />
            <circle cx={ix} cy={iy} r={3.5} fill="#FFFFFF" stroke={strokeCol} strokeWidth={1} />
          </>
        )}

        {/* Minimal Kitchen Counter / Cooktop */}
        {isKitchen && (
          <>
            <circle cx={ix - iw * 0.22} cy={iy} r={Math.min(iw, il) * 0.18} fill="none" stroke="#94A3B8" strokeWidth={0.9} />
            <circle cx={ix + iw * 0.22} cy={iy} r={Math.min(iw, il) * 0.18} fill="none" stroke="#94A3B8" strokeWidth={0.9} />
          </>
        )}

        {/* Minimal Wardrobe */}
        {isWardrobe && (
          <>
            <line x1={ix} y1={iy - il / 2} x2={ix} y2={iy + il / 2} stroke={strokeCol} strokeWidth={1} />
            <line x1={ix - 3} y1={iy} x2={ix - 3} y2={iy + 6} stroke={strokeCol} strokeWidth={1.2} />
            <line x1={ix + 3} y1={iy} x2={ix + 3} y2={iy + 6} stroke={strokeCol} strokeWidth={1.2} />
          </>
        )}

        {/* Selected visual indicator */}
        {isSelected && mode === "edit" && (
          <circle cx={ix} cy={iy - il / 2 - 7} r={3.5} fill="#C48446" />
        )}
      </g>
    );"""

start_pos = content_normalized.find(start_marker)
end_pos = content_normalized.find(end_marker)

if start_pos != -1 and end_pos != -1:
    new_content = content_normalized[:start_pos] + replacement + content_normalized[end_pos + len(end_marker):]
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(new_content)
    print("Successfully replaced furniture rendering!")
else:
    print(f"Could not find markers: start_pos={start_pos}, end_pos={end_pos}")
