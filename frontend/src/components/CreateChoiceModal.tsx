"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, UploadCloud, ArrowRight, X, Compass, Layers } from "lucide-react";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md">
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-xl bg-[#12141A] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-5 right-5 w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-[#9E9C98] hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Header */}
          <div className="text-center mb-8">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#C48446]/10 border border-[#C48446]/20 text-[10px] font-mono tracking-widest text-[#C48446] uppercase mb-3">
              <Sparkles className="w-3 h-3" />
              CREATE WORKSPACE
            </span>
            <h2 className="text-2xl sm:text-3xl font-serif font-light text-[#F5F3EF]">
              How would you like to begin?
            </h2>
            <p className="text-xs sm:text-sm text-[#9E9C98] font-light mt-2 max-w-md mx-auto leading-relaxed">
              Select an architectural pipeline to synthesize your bespoke residence.
            </p>
          </div>

          {/* Choices Grid */}
          <div className="grid grid-cols-1 gap-4">
            {/* OPTION 1: DESIGN A NEW HOME */}
            <button
              type="button"
              onClick={onSelectDesignNew}
              className="group relative text-left p-5 sm:p-6 rounded-2xl bg-[#171A22]/70 hover:bg-[#1C202B] border border-white/10 hover:border-[#C48446]/40 transition-all duration-300 flex items-start gap-4 shadow-lg hover:shadow-xl"
            >
              <div className="w-12 h-12 rounded-xl bg-[#C48446]/15 border border-[#C48446]/30 flex items-center justify-center text-[#C48446] shrink-0 group-hover:scale-105 transition-transform">
                <Compass className="w-6 h-6" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono tracking-wider text-[#C48446] font-semibold">01</span>
                    <h3 className="text-base sm:text-lg font-serif font-medium text-[#F5F3EF] group-hover:text-white transition-colors">
                      DESIGN A NEW HOME
                    </h3>
                  </div>
                  <ArrowRight className="w-4 h-4 text-[#9E9C98] group-hover:text-[#C48446] group-hover:translate-x-1 transition-all" />
                </div>
                <p className="text-xs text-[#9E9C98] font-light leading-relaxed">
                  Interactive step-by-step consultation answering lifestyle rituals, plot geometry, room counts, and orientation to generate an intelligent layout.
                </p>
                <div className="mt-3 flex items-center gap-2 text-[10px] font-mono text-[#8A8883]">
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
              className="group relative text-left p-5 sm:p-6 rounded-2xl bg-[#171A22]/70 hover:bg-[#1C202B] border border-white/10 hover:border-[#C48446]/40 transition-all duration-300 flex items-start gap-4 shadow-lg hover:shadow-xl"
            >
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0 group-hover:scale-105 transition-transform">
                <UploadCloud className="w-6 h-6" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono tracking-wider text-blue-400 font-semibold">02</span>
                    <h3 className="text-base sm:text-lg font-serif font-medium text-[#F5F3EF] group-hover:text-white transition-colors">
                      I ALREADY HAVE A FLOOR PLAN
                    </h3>
                  </div>
                  <ArrowRight className="w-4 h-4 text-[#9E9C98] group-hover:text-blue-400 group-hover:translate-x-1 transition-all" />
                </div>
                <p className="text-xs text-[#9E9C98] font-light leading-relaxed">
                  Upload an existing architectural drawing, blueprint image, or hand sketch. Groq Vision extracts room boundaries and converts it into interactive 2D blueprints and 3D dollhouse.
                </p>
                <div className="mt-3 flex items-center gap-2 text-[10px] font-mono text-[#8A8883]">
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
              className="group relative text-left p-5 sm:p-6 rounded-2xl bg-[#171A22]/70 hover:bg-[#1C202B] border border-white/10 hover:border-[#C48446]/40 transition-all duration-300 flex items-start gap-4 shadow-lg hover:shadow-xl"
            >
              <div className="w-12 h-12 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0 group-hover:scale-105 transition-transform">
                <Sparkles className="w-6 h-6" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono tracking-wider text-purple-400 font-semibold">03</span>
                    <h3 className="text-base sm:text-lg font-serif font-medium text-[#F5F3EF] group-hover:text-white transition-colors">
                      DESCRIBE YOUR DREAM HOME
                    </h3>
                  </div>
                  <ArrowRight className="w-4 h-4 text-[#9E9C98] group-hover:text-purple-400 group-hover:translate-x-1 transition-all" />
                </div>
                <p className="text-xs text-[#9E9C98] font-light leading-relaxed">
                  Tell us what you want to build in natural language. Our AI extracts architectural parameters, plans preliminary structural columns, and synthesizes your home.
                </p>
                <div className="mt-3 flex items-center gap-2 text-[10px] font-mono text-[#8A8883]">
                  <span className="px-2 py-0.5 rounded bg-white/5 border border-white/5 text-purple-300">Natural Language AI</span>
                  <span className="px-2 py-0.5 rounded bg-white/5 border border-white/5">Preliminary Columns</span>
                  <span className="px-2 py-0.5 rounded bg-white/5 border border-white/5">Instant Brief</span>
                </div>
              </div>
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
