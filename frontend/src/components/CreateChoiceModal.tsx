"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, UploadCloud, ArrowRight, X, Compass } from "lucide-react";

interface CreateChoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectDesignNew: () => void;
  onSelectUploadPlan: () => void;
  onSelectDreamHome?: () => void;
}

export const CreateChoiceModal: React.FC<CreateChoiceModalProps> = ({
  isOpen,
  onClose,
  onSelectDesignNew,
  onSelectUploadPlan,
  onSelectDreamHome,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-xl">
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
          className="relative w-full max-w-xl bg-[rgba(8,14,26,0.96)] border border-[rgba(96,165,250,0.22)] rounded-[32px] p-6 sm:p-8 shadow-[0_30px_90px_rgba(0,0,0,0.8),0_0_50px_rgba(37,99,235,0.15)] overflow-hidden max-h-[90vh] overflow-y-auto backdrop-blur-[24px] text-[#F5F5F5]"
        >
          {/* Subtle Ambient Glow */}
          <div className="pointer-events-none absolute -top-24 -right-24 w-64 h-64 rounded-full bg-[radial-gradient(circle,rgba(37,99,235,0.16)_0%,transparent_70%)] blur-[70px]" />

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-5 right-5 w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-[rgba(255,255,255,0.5)] hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Header */}
          <div className="text-center mb-8">
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-[rgba(37,99,235,0.14)] border border-[rgba(96,165,250,0.25)] text-[10px] font-mono tracking-[0.22em] text-[#93C5FD] uppercase mb-3 font-semibold shadow-[0_0_15px_rgba(37,99,235,0.2)]">
              <Sparkles className="w-3 h-3 text-[#06B6D4]" />
              SYNTHESIS PIPELINE
            </span>
            <h2 className="text-3xl sm:text-4xl font-serif font-light text-[#F5F5F5]">
              How would you like to begin?
            </h2>
            <p className="text-xs sm:text-sm text-[rgba(255,255,255,0.6)] font-light mt-2 max-w-md mx-auto leading-relaxed">
              Select an architectural pipeline to synthesize your bespoke residence.
            </p>
          </div>

          {/* Choices Grid */}
          <div className="grid grid-cols-1 gap-4">
            {/* OPTION 1: DESIGN A NEW HOME */}
            <button
              type="button"
              onClick={onSelectDesignNew}
              className="group relative text-left p-5 sm:p-6 rounded-2xl bg-[rgba(12,20,38,0.7)] hover:bg-[rgba(16,26,48,0.85)] border border-white/8 hover:border-[rgba(96,165,250,0.35)] transition-all duration-300 flex items-start gap-4 shadow-lg hover:shadow-[0_10px_30px_rgba(37,99,235,0.15)] hover:-translate-y-0.5 cursor-pointer"
            >
              <div className="w-12 h-12 rounded-xl bg-[rgba(37,99,235,0.18)] border border-[rgba(96,165,250,0.3)] flex items-center justify-center text-[#60A5FA] shrink-0 group-hover:scale-105 transition-transform">
                <Compass className="w-6 h-6" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono tracking-wider text-[#60A5FA] font-semibold">01</span>
                    <h3 className="text-lg font-serif font-light text-[#F5F5F5] group-hover:text-white transition-colors">
                      DESIGN A NEW HOME
                    </h3>
                  </div>
                  <ArrowRight className="w-4 h-4 text-[rgba(255,255,255,0.4)] group-hover:text-[#60A5FA] group-hover:translate-x-1 transition-all" />
                </div>
                <p className="text-xs text-[rgba(255,255,255,0.6)] font-light leading-relaxed">
                  Interactive step-by-step consultation answering lifestyle rituals, plot geometry, room counts, and orientation to generate an intelligent layout.
                </p>
                <div className="mt-3 flex items-center gap-2 text-[10px] font-mono text-[rgba(255,255,255,0.45)]">
                  <span className="px-2 py-0.5 rounded bg-white/5 border border-white/5">Site Setbacks</span>
                  <span className="px-2 py-0.5 rounded bg-white/5 border border-white/5">Daylight Analysis</span>
                  <span className="px-2 py-0.5 rounded bg-white/5 border border-white/5">Vastu Audit</span>
                </div>
              </div>
            </button>

            {/* OPTION 2: I ALREADY HAVE A FLOOR PLAN */}
            <button
              type="button"
              onClick={onSelectUploadPlan}
              className="group relative text-left p-5 sm:p-6 rounded-2xl bg-[rgba(12,20,38,0.7)] hover:bg-[rgba(16,26,48,0.85)] border border-white/8 hover:border-[rgba(6,182,212,0.35)] transition-all duration-300 flex items-start gap-4 shadow-lg hover:shadow-[0_10px_30px_rgba(6,182,212,0.15)] hover:-translate-y-0.5 cursor-pointer"
            >
              <div className="w-12 h-12 rounded-xl bg-[rgba(6,182,212,0.15)] border border-[rgba(6,182,212,0.3)] flex items-center justify-center text-[#06B6D4] shrink-0 group-hover:scale-105 transition-transform">
                <UploadCloud className="w-6 h-6" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono tracking-wider text-[#06B6D4] font-semibold">02</span>
                    <h3 className="text-lg font-serif font-light text-[#F5F5F5] group-hover:text-white transition-colors">
                      I ALREADY HAVE A FLOOR PLAN
                    </h3>
                  </div>
                  <ArrowRight className="w-4 h-4 text-[rgba(255,255,255,0.4)] group-hover:text-[#06B6D4] group-hover:translate-x-1 transition-all" />
                </div>
                <p className="text-xs text-[rgba(255,255,255,0.6)] font-light leading-relaxed">
                  Upload an existing architectural drawing, blueprint image, or hand sketch. Groq Vision extracts room boundaries and converts it into interactive 2D blueprints and 3D dollhouse.
                </p>
                <div className="mt-3 flex items-center gap-2 text-[10px] font-mono text-[rgba(255,255,255,0.45)]">
                  <span className="px-2 py-0.5 rounded bg-white/5 border border-white/5">PNG / JPG / WebP</span>
                  <span className="px-2 py-0.5 rounded bg-white/5 border border-white/5">Groq Vision AI</span>
                  <span className="px-2 py-0.5 rounded bg-white/5 border border-white/5">Instant 3D</span>
                </div>
              </div>
            </button>

            {/* OPTION 3: DESCRIBE YOUR DREAM HOME */}
            <button
              type="button"
              onClick={onSelectDreamHome}
              className="group relative text-left p-5 sm:p-6 rounded-2xl bg-[rgba(12,20,38,0.7)] hover:bg-[rgba(16,26,48,0.85)] border border-white/8 hover:border-[rgba(139,92,246,0.35)] transition-all duration-300 flex items-start gap-4 shadow-lg hover:shadow-[0_10px_30px_rgba(139,92,246,0.15)] hover:-translate-y-0.5 cursor-pointer"
            >
              <div className="w-12 h-12 rounded-xl bg-[rgba(139,92,246,0.15)] border border-[rgba(139,92,246,0.3)] flex items-center justify-center text-[#8B5CF6] shrink-0 group-hover:scale-105 transition-transform">
                <Sparkles className="w-6 h-6" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono tracking-wider text-[#A78BFA] font-semibold">03</span>
                    <h3 className="text-lg font-serif font-light text-[#F5F5F5] group-hover:text-white transition-colors">
                      DESCRIBE YOUR DREAM HOME
                    </h3>
                  </div>
                  <ArrowRight className="w-4 h-4 text-[rgba(255,255,255,0.4)] group-hover:text-[#A78BFA] group-hover:translate-x-1 transition-all" />
                </div>
                <p className="text-xs text-[rgba(255,255,255,0.6)] font-light leading-relaxed">
                  Tell us what you want to build in natural language. Our AI extracts architectural parameters, plans preliminary structural columns, and synthesizes your home.
                </p>
                <div className="mt-3 flex items-center gap-2 text-[10px] font-mono text-[rgba(255,255,255,0.45)]">
                  <span className="px-2 py-0.5 rounded bg-white/5 border border-white/5 text-[#D8B4FE]">Natural Language Brief</span>
                  <span className="px-2 py-0.5 rounded bg-white/5 border border-white/5">Preliminary Columns</span>
                  <span className="px-2 py-0.5 rounded bg-white/5 border border-white/5">Instant Synthesis</span>
                </div>
              </div>
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
