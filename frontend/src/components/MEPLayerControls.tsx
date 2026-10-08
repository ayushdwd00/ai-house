"use client";

import React, { useState } from "react";
import { MEPCategory } from "@/types/house";
import { Layers, X } from "lucide-react";

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

export const MEPLayerControls: React.FC<MEPLayerControlsProps> = ({ value, onChange }) => {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const activeCount = Object.values(value).filter(Boolean).length;

  return (
    <>
      {/* ── Desktop Fixed Card (screens >= 1024px) ── */}
      <section
        aria-label="MEP layer controls"
        className="hidden lg:block fixed right-4 top-20 z-40 w-44 rounded-xl border border-white/10 bg-[#0F1117]/95 p-2.5 text-[#F5F3EF] shadow-xl backdrop-blur-md"
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

      {/* ── Compact Trigger Button (phones and tablets) ── */}
      <div className="relative z-30 lg:hidden">
        <button
          type="button"
          onClick={() => setIsMobileOpen(true)}
          aria-label="Open MEP layer controls"
          className="flex min-h-10 items-center gap-1.5 rounded-full border border-white/10 bg-[#0F1117]/95 px-3 py-2 text-[10px] font-mono text-[#F5F3EF] shadow-xl backdrop-blur-md transition-all active:scale-95"
        >
          <Layers className="w-3.5 h-3.5 text-[#C48446]" />
          <span>MEP</span>
          {activeCount > 0 && (
            <span className="w-4 h-4 rounded-full bg-[#C48446] text-[#0A0B0E] font-bold text-[9px] flex items-center justify-center">
              {activeCount}
            </span>
          )}
        </button>
      </div>

      {/* ── Compact Bottom Sheet Popover (phones and tablets) ── */}
      {isMobileOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="MEP Layers"
          className="lg:hidden fixed inset-0 z-[50] flex items-end justify-center bg-black/60 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm"
          onClick={() => setIsMobileOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-[rgba(96,165,250,0.25)] bg-[#0F1117]/98 p-4 text-[#F5F3EF] shadow-2xl backdrop-blur-2xl space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#C48446]" />
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#F5F5F5]">
                  MEP LAYERS
                </span>
                <span className="text-[9px] font-mono text-[#858B98]">PRELIMINARY</span>
              </div>
              <button
                type="button"
                onClick={() => setIsMobileOpen(false)}
                className="p-1 rounded-lg hover:bg-white/10 text-white/60 hover:text-white"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 py-1">
              {layers.map(({ category, label, color }) => (
                <label
                  key={category}
                  className="flex cursor-pointer items-center justify-between rounded-xl px-3 py-2 bg-white/5 border border-white/5 hover:border-white/10 text-xs text-[#D6D8DE]"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                    <span className="font-medium text-white">{label}</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={value[category]}
                    onChange={(event) => onChange(category, event.target.checked)}
                    className="w-4 h-4 accent-[#C48446] rounded"
                  />
                </label>
              ))}
            </div>

            <p className="text-[9px] leading-relaxed text-[#858B98] pt-1">
              Planning assistance only; not engineering certification.
            </p>
          </div>
        </div>
      )}
    </>
  );
};
