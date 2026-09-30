"use client";

import React, { useState, useRef, useEffect } from "react";
import { Sparkles, ArrowRight, Loader2, MessageSquare, X, ChevronDown, ChevronUp } from "lucide-react";

// ============================================================
// QUICK EDIT SUGGESTIONS
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

interface FloatingAICommandBarProps {
  onApplyInstruction: (instruction: string) => Promise<void>;
  isLoading: boolean;
  context: "plan" | "model";
  selectedRoomName?: string;
  selectedRoomId?: string | null;
}

// ============================================================
// AI ARCHITECTURAL INSTRUMENT
// ============================================================
export const FloatingAICommandBar: React.FC<FloatingAICommandBarProps> = ({
  onApplyInstruction,
  isLoading,
  context,
  selectedRoomName,
  selectedRoomId,
}) => {
  const [instruction, setInstruction] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
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
    : "Describe an architectural refinement…";

  const positionClass =
    context === "model"
      ? "bottom-[max(1.5rem,env(safe-area-inset-bottom))] max-[640px]:bottom-[max(4rem,calc(env(safe-area-inset-bottom)+2.5rem))] left-[max(1rem,env(safe-area-inset-left))]"
      : "top-[max(5.5rem,calc(env(safe-area-inset-top)+4.8rem))] left-[max(1rem,env(safe-area-inset-left))]";

  return (
    <div
      className={`fixed ${positionClass} z-40 w-[min(21rem,calc(100vw-2rem))] max-h-[calc(100dvh-9rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] pointer-events-auto`}
    >
      {!isExpanded ? (
        <button
          type="button"
          onClick={() => setIsExpanded(true)}
          aria-label="Open AI Architect"
          aria-expanded={false}
          className="flex items-center gap-2.5 rounded-full border border-[rgba(96,165,250,0.22)] bg-[rgba(8,14,26,0.92)] px-4 py-2.5 text-[#93C5FD] shadow-[0_16px_40px_rgba(0,0,0,0.5),0_0_20px_rgba(6,182,212,0.18)] backdrop-blur-2xl transition-all hover:bg-[rgba(12,20,38,0.96)] hover:border-[rgba(96,165,250,0.4)] hover:-translate-y-0.5"
        >
          <div className="w-2 h-2 rounded-full bg-[linear-gradient(135deg,#3B82F6,#06B6D4)] shadow-[0_0_8px_#06B6D4] animate-pulse" />
          <span className="text-[10px] font-mono font-semibold uppercase tracking-[0.2em] text-[#F5F5F5]">
            AI Architect
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-[#93C5FD]" />
        </button>
      ) : (
        <div
          className={`max-h-full overflow-y-auto bg-[rgba(8,14,26,0.94)] backdrop-blur-2xl rounded-2xl shadow-[0_25px_60px_rgba(0,0,0,0.6),0_0_30px_rgba(37,99,235,0.15)] transition-all duration-200 ${
            isFocused
              ? "border border-[rgba(96,165,250,0.4)] ring-1 ring-[rgba(96,165,250,0.2)]"
              : "border border-[rgba(96,165,250,0.18)]"
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 px-3.5 py-2.5 bg-[rgba(12,20,38,0.5)]">
            <div className="flex items-center gap-2 text-[#93C5FD]">
              <Sparkles className="h-3.5 w-3.5 text-[#38BDF8]" />
              <span className="text-[10px] font-mono font-medium uppercase tracking-[0.2em] text-[#F5F5F5]">
                AI Architectural Instrument
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              aria-label="Collapse AI Architect"
              aria-expanded={true}
              className="rounded-md p-1 text-[rgba(255,255,255,0.5)] transition-colors hover:bg-white/10 hover:text-white"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
          </div>

          {/* Suggestion Chips */}
          <div className="flex flex-wrap items-center gap-1.5 px-3 pt-3 pb-2">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => handleSuggestion(s)}
                className="px-2.5 py-1 rounded-full bg-white/5 hover:bg-[rgba(59,130,246,0.15)] border border-white/8 hover:border-[rgba(96,165,250,0.3)] text-[rgba(255,255,255,0.64)] hover:text-[#FFFFFF] text-[10px] font-mono transition-all whitespace-nowrap max-w-full truncate"
              >
                {s}
              </button>
            ))}
          </div>

          {/* Input Form */}
          <form onSubmit={handleSubmit} className="flex items-center gap-2 px-3 pb-3 pt-1">
            <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-black/40 border border-white/8 focus-within:border-[rgba(96,165,250,0.4)] transition-colors">
              <MessageSquare className="w-3.5 h-3.5 text-[rgba(96,165,250,0.6)] shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                disabled={isLoading}
                placeholder={placeholder}
                className="w-full bg-transparent text-[11px] text-[#F5F5F5] placeholder-[rgba(255,255,255,0.3)] font-mono focus:outline-none"
                autoComplete="off"
                spellCheck={false}
              />
              {instruction && (
                <button
                  type="button"
                  onClick={() => setInstruction("")}
                  className="w-4 h-4 rounded-full bg-white/10 flex items-center justify-center text-[rgba(255,255,255,0.5)] hover:text-white shrink-0"
                  aria-label="Clear"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={!instruction.trim() || isLoading}
              className="px-3.5 py-2 rounded-xl btn-primary-blue disabled:opacity-30 disabled:cursor-not-allowed text-white text-[10px] font-mono font-semibold uppercase tracking-wider flex items-center gap-1.5 transition-all active:scale-95 shrink-0"
            >
              {isLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ArrowRight className="w-3.5 h-3.5" />
              )}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
