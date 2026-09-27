"use client";

import React from "react";
import { DesignScheme } from "@/utils/api";

interface DesignSchemeSelectionModalProps {
  schemes: DesignScheme[];
  onSelect: (scheme: DesignScheme) => void;
  onBack: () => void;
}

function roomColor(type: string): string {
  const value = type.toLowerCase();
  if (value.includes("bed")) return "#E9D8C8";
  if (value.includes("bath")) return "#B9DCE8";
  if (value.includes("kitchen")) return "#E8E0B7";
  if (value.includes("stair")) return "#D8D5E8";
  return "#C9DCCB";
}

export const DesignSchemeSelectionModal: React.FC<DesignSchemeSelectionModalProps> = ({
  schemes,
  onSelect,
  onBack,
}) => (
  <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#08090D]/90 p-4 backdrop-blur-md">
    <section
      role="dialog"
      aria-modal="true"
      aria-labelledby="scheme-selection-title"
      className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-2xl border border-white/10 bg-[#111319] p-5 text-[#F5F3EF] shadow-2xl sm:p-7"
    >
      <header className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="mb-1 text-[10px] font-mono uppercase tracking-[0.22em] text-[#C48446]">Architectural concepts</p>
          <h2 id="scheme-selection-title" className="text-xl font-medium">Choose a design direction</h2>
          <p className="mt-1 text-xs text-[#9599A5]">Each option preserves the same brief and solver constraints. No scheme is preselected.</p>
        </div>
        <button type="button" onClick={onBack} className="shrink-0 rounded-lg border border-white/10 px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-[#A4A7B0] hover:text-white">
          Back
        </button>
      </header>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {schemes.map((scheme) => {
          const floor = scheme.layout.floors?.[0];
          const rooms = floor?.rooms || scheme.layout.rooms || [];
          const roomCount = scheme.layout.floors?.reduce((total, item) => total + item.rooms.length, 0) || rooms.length;
          const walls = floor?.walls || scheme.layout.walls || [];
          return (
            <article key={scheme.id} className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-white/10 bg-[#17191F]">
              <div className="border-b border-white/8 bg-[#ECEEF2] p-2">
                <svg
                  viewBox={`0 0 ${scheme.layout.plot_width} ${scheme.layout.plot_length}`}
                  preserveAspectRatio="xMidYMid meet"
                  className="h-36 w-full"
                  role="img"
                  aria-label={`${scheme.name} 2D floor plan preview`}
                >
                  <rect width={scheme.layout.plot_width} height={scheme.layout.plot_length} fill="#F8FAFC" />
                  {rooms.filter((room) => room.rect).map((room) => (
                    <g key={room.id}>
                      <rect
                        x={room.rect.x}
                        y={room.rect.y}
                        width={room.rect.width}
                        height={room.rect.length}
                        fill={roomColor(room.type)}
                        stroke="#475569"
                        strokeWidth={Math.max(scheme.layout.plot_width / 240, 0.08)}
                      />
                      {room.rect.width > scheme.layout.plot_width * 0.12 && room.rect.length > scheme.layout.plot_length * 0.08 && (
                        <text
                          x={room.rect.x + room.rect.width / 2}
                          y={room.rect.y + room.rect.length / 2}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill="#334155"
                          fontSize={Math.max(Math.min(scheme.layout.plot_width, scheme.layout.plot_length) / 38, 0.32)}
                        >
                          {room.name}
                        </text>
                      )}
                    </g>
                  ))}
                  {walls.map((wall) => (
                    <line
                      key={wall.id}
                      x1={wall.x1}
                      y1={wall.y1}
                      x2={wall.x2}
                      y2={wall.y2}
                      stroke={wall.is_exterior ? "#1E293B" : "#64748B"}
                      strokeWidth={Math.max(wall.thickness || 0.25, 0.12)}
                    />
                  ))}
                </svg>
              </div>
              <div className="flex flex-1 flex-col p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold">{scheme.name}</h3>
                    <p className="mt-1 text-[10px] leading-relaxed text-[#A0A5B5]">{scheme.concept}</p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[8px] font-mono uppercase tracking-wider ${
                    scheme.validation_status === "valid"
                      ? "border-emerald-400/25 text-emerald-300"
                      : "border-amber-400/25 text-amber-300"
                  }`}>
                    {scheme.validation_status}
                  </span>
                </div>
                <div className="mt-2 text-[9px] font-mono text-[#858B98]">
                  {roomCount} rooms · {Math.round(scheme.layout.stats?.total_area_sqft || 0).toLocaleString()} sq ft
                </div>
                <ul className="mt-2 flex-1 space-y-1">
                  {scheme.characteristics.slice(0, 4).map((item) => (
                    <li key={item} className="text-[9px] leading-relaxed text-[#B6BAC5]">· {item}</li>
                  ))}
                </ul>
                <button
                  type="button"
                  disabled={scheme.validation_status !== "valid"}
                  onClick={() => onSelect(scheme)}
                  className="mt-3 rounded-lg bg-[#C48446] px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-[#111319] transition hover:bg-[#D49456] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Use this scheme
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  </div>
);
