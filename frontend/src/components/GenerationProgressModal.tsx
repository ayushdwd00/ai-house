"use client";

import React, { useEffect, useState } from "react";
import { Check, Compass, Layers, Ruler, Box, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

interface GenerationProgressModalProps {
  isOpen: boolean;
}

const STAGES = [
  { label: "Understanding requirements", desc: "Analyzing plot orientation, road frontage & setbacks", icon: Compass },
  { label: "Planning spaces", desc: "Formulating daylight, privacy zones & functional adjacencies", icon: Layers },
  { label: "Generating layout", desc: "Computing zero room overlaps with deterministic search", icon: Ruler },
  { label: "Validating architecture", desc: "Deriving load-bearing walls, doors, windows & structure", icon: Box },
  { label: "Preparing floor plan", desc: "Rendering professional 2D blueprints & opening sheets", icon: Sparkles },
];

export const GenerationProgressModal: React.FC<GenerationProgressModalProps> = ({
  isOpen,
}) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  useEffect(() => {
    if (!isOpen) return;

    const interval = setInterval(() => {
      setCurrentStepIndex((prev) => (prev < STAGES.length - 1 ? prev + 1 : prev));
    }, 1100);

    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-[#0A0B0E]">
      {/* Subtle Background Architectural Grid Motion */}
      <div 
        className="absolute inset-0 opacity-15 pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(#C48446 1px, transparent 1px), radial-gradient(white 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          backgroundPosition: "0 0, 14px 14px",
        }}
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        transition={{ duration: 0.28, ease: "easeOut" }}
        className="relative w-full max-w-lg bg-[#12141A] border border-white/10 rounded-3xl p-8 sm:p-10 shadow-2xl text-center flex flex-col items-center overflow-hidden z-10"
      >
        {/* Dynamic Architectural Wireframe Skeleton Box */}
        <div className="relative w-full h-24 mb-6 rounded-2xl bg-[#0A0B0E] border border-white/10 p-3 overflow-hidden flex items-center justify-center">
          {/* Wireframe Room Skeletal Blocks */}
          <div className="w-full h-full grid grid-cols-3 grid-rows-2 gap-2 relative z-10">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0.3 }}
                animate={{
                  opacity: [0.3, 0.8, 0.3],
                  borderColor: i <= currentStepIndex ? "rgba(196, 132, 70, 0.8)" : "rgba(255, 255, 255, 0.08)",
                }}
                transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.15 }}
                className="rounded-lg border border-dashed bg-white/[0.02] flex items-center justify-center text-[9px] font-mono text-[#9E9C98]"
              >
                {i === 0 && "FOYER"}
                {i === 1 && "LIVING"}
                {i === 2 && "KITCHEN"}
                {i === 3 && "PRIMARY"}
                {i === 4 && "EN-SUITE"}
                {i === 5 && "BEDROOM 2"}
              </motion.div>
            ))}
          </div>
        </div>

        <span className="text-[10px] font-mono tracking-widest text-[#C48446] uppercase mb-1">
          ATELIER ARCHITECTURAL SYNTHESIS
        </span>
        <h3 className="text-xl sm:text-2xl font-serif font-light text-[#F5F3EF] tracking-tight mb-2">
          DESIGNING YOUR HOME
        </h3>
        <p className="text-xs text-[#9E9C98] font-light mb-6 max-w-sm">
          Synthesizing site-specific setbacks, functional zoning, watertight wall networks, and deterministic spatial layout.
        </p>

        {/* Progress Stages */}
        <div className="w-full space-y-2 text-left">
          {STAGES.map((stage, idx) => {
            const isCompleted = idx < currentStepIndex;
            const isCurrent = idx === currentStepIndex;
            const StageIcon = stage.icon;

            return (
              <div
                key={stage.label}
                className={`flex items-center gap-3 p-2.5 rounded-xl transition-all duration-200 ${
                  isCurrent
                    ? "bg-[#C48446]/10 border border-[#C48446]/30 text-[#F5F3EF]"
                    : isCompleted
                    ? "text-[#F5F3EF]"
                    : "text-[#6B6964] opacity-50"
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs shrink-0 transition-all ${
                    isCompleted
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                      : isCurrent
                      ? "bg-[#C48446] text-[#0A0B0E] font-bold shadow-md shadow-[#C48446]/30"
                      : "bg-white/5 text-[#9E9C98]"
                  }`}
                >
                  {isCompleted ? <Check className="w-3.5 h-3.5" /> : <StageIcon className="w-3.5 h-3.5" />}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium font-sans truncate">{stage.label}</div>
                  <div className="text-[10px] text-[#9E9C98] truncate font-mono">{stage.desc}</div>
                </div>

                {isCurrent && (
                  <div className="w-2 h-2 rounded-full bg-[#C48446] animate-ping shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
};
