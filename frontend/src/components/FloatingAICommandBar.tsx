"use client";

import React, { useState } from "react";
import { Sparkles, ArrowRight, Loader2, Compass } from "lucide-react";

interface FloatingAICommandBarProps {
  onApplyInstruction: (instruction: string) => Promise<void>;
  isLoading: boolean;
  selectedRoomName?: string;
}

export const FloatingAICommandBar: React.FC<FloatingAICommandBarProps> = ({
  onApplyInstruction,
  isLoading,
  selectedRoomName,
}) => {
  const [instruction, setInstruction] = useState("");

  const suggestions = selectedRoomName
    ? [
        `Expand ${selectedRoomName} footprint`,
        `Add exterior windows to ${selectedRoomName}`,
        `Orient ${selectedRoomName} toward garden`,
      ]
    : [
        "Enlarge living pavilion and kitchen",
        "Add balcony terrace to master suite",
        "Maximize cross-ventilation openings",
        "Optimize central circulation corridor",
      ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!instruction.trim() || isLoading) return;
    const text = instruction;
    setInstruction("");
    await onApplyInstruction(text);
  };

  const handleChipClick = (suggestion: string) => {
    setInstruction(suggestion);
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-full max-w-xl px-4 pointer-events-auto">
      <div className="bg-[#12141A]/90 backdrop-blur-xl border border-white/10 rounded-2xl p-2.5 shadow-2xl shadow-black/50">
        {/* Architectural Refinement Suggestion Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 px-1 text-[11px] font-mono text-[#9E9C98]">
          <span className="shrink-0 flex items-center gap-1 text-[#C48446] font-mono text-[10px] uppercase tracking-wider pl-1">
            <Sparkles className="w-3 h-3" />
            REFINE:
          </span>
          {suggestions.map((sug) => (
            <button
              key={sug}
              type="button"
              onClick={() => handleChipClick(sug)}
              className="shrink-0 px-2.5 py-1 rounded-full bg-white/5 hover:bg-white/10 hover:text-[#F5F3EF] transition-colors truncate max-w-[210px] text-[10px]"
            >
              {sug}
            </button>
          ))}
        </div>

        {/* Studio Command Input Form */}
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#0A0B0E]/60 border border-white/5 focus-within:border-[#C48446]/40 transition-colors">
            <Compass className="w-3.5 h-3.5 text-[#9E9C98] shrink-0" />
            <input
              type="text"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              disabled={isLoading}
              placeholder={
                selectedRoomName
                  ? `Refine ${selectedRoomName}... (e.g. "expand width by 4ft")`
                  : "Command AI Architect (e.g. 'Make kitchen larger', 'Add courtyard')"
              }
              className="w-full bg-transparent text-xs text-[#F5F3EF] placeholder-[#6B6964] font-mono focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={!instruction.trim() || isLoading}
            className="px-4 py-2 rounded-xl bg-[#C48446] text-[#0A0B0E] hover:bg-[#D49354] disabled:opacity-30 disabled:hover:bg-[#C48446] text-xs font-mono tracking-wider font-semibold flex items-center gap-1.5 transition-all shadow-lg shadow-[#C48446]/20 active:scale-95 shrink-0"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                <span className="text-[10px] uppercase">SOLVING</span>
              </>
            ) : (
              <>
                <span className="text-[10px] uppercase">EXECUTE</span>
                <ArrowRight className="w-3 h-3" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
