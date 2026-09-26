"use client";

import React, { useState, useRef, useEffect } from "react";
import { Sparkles, ArrowRight, Loader2, MessageSquare, X } from "lucide-react";

// ============================================================
// QUICK EDIT SUGGESTIONS
// Context-aware chips shown when nothing is selected and
// when a specific room is selected.
// ============================================================
const GLOBAL_SUGGESTIONS = [
  "Make the master bedroom bigger",
  "Move the kitchen closer to dining",
  "Add a balcony to the master suite",
  "Move the entrance",
  "Increase parking to 2 cars",
  "Add an attached bathroom to bedroom 2",
];

function getRoomSuggestions(roomName: string): string[] {
  const lower = roomName.toLowerCase();
  if (lower.includes("master") || lower.includes("primary")) {
    return [
      `Expand ${roomName} width`,
      `Add attached bathroom to ${roomName}`,
      `Move ${roomName} to rear`,
    ];
  }
  if (lower.includes("kitchen")) {
    return [
      `Move ${roomName} closer to dining`,
      `Expand ${roomName}`,
      `Open ${roomName} to living area`,
    ];
  }
  if (lower.includes("living") || lower.includes("hall")) {
    return [`Enlarge ${roomName}`, `Move ${roomName} to front`, `Open ${roomName} to dining`];
  }
  if (lower.includes("bed")) {
    return [
      `Expand ${roomName}`,
      `Add attached bathroom to ${roomName}`,
      `Move ${roomName} to corner`,
    ];
  }
  if (lower.includes("bath") || lower.includes("toilet")) {
    return [`Resize ${roomName}`, `Move ${roomName} near bedroom`];
  }
  return [
    `Expand ${roomName}`,
    `Move ${roomName}`,
    `Resize ${roomName}`,
  ];
}

// ============================================================
// PROPS
// ============================================================
interface FloatingAICommandBarProps {
  onApplyInstruction: (instruction: string) => Promise<void>;
  isLoading: boolean;
  selectedRoomName?: string;
  /** Show contextual toolbar for selected room */
  selectedRoomId?: string | null;
}

// ============================================================
// COMPONENT
// ============================================================
export const FloatingAICommandBar: React.FC<FloatingAICommandBarProps> = ({
  onApplyInstruction,
  isLoading,
  selectedRoomName,
  selectedRoomId,
}) => {
  const [instruction, setInstruction] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions =
    selectedRoomName
      ? getRoomSuggestions(selectedRoomName)
      : GLOBAL_SUGGESTIONS.slice(0, 4);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = instruction.trim();
    if (!text || isLoading) return;
    setInstruction("");
    inputRef.current?.blur();
    await onApplyInstruction(text);
  };

  const handleSuggestion = (s: string) => {
    setInstruction(s);
    inputRef.current?.focus();
  };

  // Clear instruction on room deselect
  useEffect(() => {
    if (!selectedRoomId) setInstruction("");
  }, [selectedRoomId]);

  const placeholder = selectedRoomName
    ? `Edit ${selectedRoomName}… (e.g. "Make it bigger")`
    : "What would you like to change?";

  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 w-full max-w-lg px-3 pointer-events-auto">
      <div
        className={`bg-[#0F1117]/92 backdrop-blur-xl rounded-2xl shadow-2xl shadow-black/50 transition-all duration-200 ${
          isFocused
            ? "border border-[#C48446]/30 ring-1 ring-[#C48446]/10"
            : "border border-white/8"
        }`}
      >
        {/* ── Suggestion chips ── */}
        <div className="flex items-center gap-1.5 px-3 pt-2.5 pb-1.5 overflow-x-auto scrollbar-hide">
          <div className="shrink-0 flex items-center gap-1 text-[#C48446] mr-0.5">
            <Sparkles className="w-2.5 h-2.5" />
            <span className="text-[9px] font-mono uppercase tracking-widest">AI</span>
          </div>
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => handleSuggestion(s)}
              className="shrink-0 px-2.5 py-1 rounded-full bg-white/5 hover:bg-white/10 text-[#9E9C98] hover:text-[#F5F3EF] text-[10px] font-mono transition-colors whitespace-nowrap max-w-[220px] truncate"
            >
              {s}
            </button>
          ))}
        </div>

        {/* ── Input row ── */}
        <form onSubmit={handleSubmit} className="flex items-center gap-2 px-3 pb-2.5">
          <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-black/30 border border-white/5 focus-within:border-white/15 transition-colors">
            <MessageSquare className="w-3 h-3 text-[#6B6964] shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              disabled={isLoading}
              placeholder={placeholder}
              className="w-full bg-transparent text-[11px] text-[#F5F3EF] placeholder-[#4E4C49] font-mono focus:outline-none"
              autoComplete="off"
              spellCheck={false}
            />
            {instruction && (
              <button
                type="button"
                onClick={() => setInstruction("")}
                className="w-4 h-4 rounded-full bg-white/10 flex items-center justify-center text-[#6B6964] hover:text-[#9E9C98] shrink-0"
                aria-label="Clear"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            )}
          </div>

          <button
            type="submit"
            disabled={!instruction.trim() || isLoading}
            className="px-3.5 py-2 rounded-xl bg-[#C48446] hover:bg-[#D49354] disabled:opacity-30 disabled:cursor-not-allowed text-[#0A0B0E] text-[10px] font-mono font-semibold uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-md shadow-[#C48446]/20 active:scale-95 shrink-0"
          >
            {isLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ArrowRight className="w-3.5 h-3.5" />
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
