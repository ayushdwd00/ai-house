"use client";

import React from "react";
import { MEPCategory } from "@/types/house";

export type MEPLayerVisibility = Record<MEPCategory, boolean>;

interface MEPLayerControlsProps {
  value: MEPLayerVisibility;
  onChange: (category: MEPCategory, visible: boolean) => void;
}

const layers: Array<{ category: MEPCategory; label: string; color: string }> = [
  { category: "electrical", label: "Electrical", color: "#FBBF24" },
  { category: "plumbing", label: "Plumbing", color: "#38BDF8" },
  { category: "hvac", label: "HVAC", color: "#C084FC" },
];

export const MEPLayerControls: React.FC<MEPLayerControlsProps> = ({ value, onChange }) => (
  <section
    aria-label="MEP layer controls"
    className="fixed right-3 top-20 z-40 w-44 rounded-xl border border-white/10 bg-[#0F1117]/95 p-2.5 text-[#F5F3EF] shadow-xl backdrop-blur-md"
  >
    <div className="mb-1.5 flex items-center justify-between gap-2">
      <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-[#C48446]">MEP Layers</span>
      <span className="text-[8px] font-mono text-[#858B98]">PRELIMINARY</span>
    </div>
    <div className="space-y-1">
      {layers.map(({ category, label, color }) => (
        <label key={category} className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-[10px] text-[#D6D8DE] hover:bg-white/5">
          <input
            type="checkbox"
            checked={value[category]}
            onChange={(event) => onChange(category, event.target.checked)}
            className="accent-[#C48446]"
          />
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
          {label}
        </label>
      ))}
    </div>
    <p className="mt-1.5 text-[8px] leading-relaxed text-[#858B98]">
      Planning assistance only; not engineering certification.
    </p>
  </section>
);
