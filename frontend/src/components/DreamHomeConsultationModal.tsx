"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  ArrowRight,
  X,
  Compass,
  Check,
  Building,
  Car,
  Layers,
  Sun,
  Shield,
  Loader2,
  AlertCircle,
  HelpCircle
} from "lucide-react";
import { DreamHomeStructuredRequirements, HouseLayout } from "@/types/house";
import { interpretDreamHomePrompt, generateDreamHomeLayout } from "@/utils/api";
import { validateAndSanitizeHouseLayout } from "@/utils/layoutValidator";

interface DreamHomeConsultationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (layout: HouseLayout) => void;
}

const EXAMPLE_PROMPTS = [
  "I want a modern 3 bedroom home on a 30x50 ft plot with parking for two cars, an open kitchen, large living room, one attached bedroom and a staircase for the future first floor",
  "Design a contemporary 2BHK on a 25x40 plot with lots of natural light, big living room, and a small home office",
  "Create a G+1 family home with 4 bedrooms, 3 bathrooms, two-car parking, and covered patio facing east",
  "Design a minimalist 3-bedroom single-story home on a 40x60 plot with open kitchen, central courtyard, and pooja room"
];

export const DreamHomeConsultationModal: React.FC<DreamHomeConsultationModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [prompt, setPrompt] = useState("");
  const [isInterpreting, setIsInterpreting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Structured brief state
  const [brief, setBrief] = useState<DreamHomeStructuredRequirements | null>(null);
  const [clarificationAnswer, setClarificationAnswer] = useState("");

  if (!isOpen) return null;

  const handleInterpret = async (textToParse: string, existingContext?: Record<string, unknown>) => {
    if (!textToParse.trim()) return;
    setIsInterpreting(true);
    setErrorMessage(null);

    try {
      const res = await interpretDreamHomePrompt(textToParse, existingContext);
      setBrief(res.brief);
    } catch (err) {
      console.error("[DREAM HOME INTERPRET ERROR]", err);
      setErrorMessage(err instanceof Error ? err.message : "Failed to interpret your description. Please try again.");
    } finally {
      setIsInterpreting(false);
    }
  };

  const handleResolveClarification = () => {
    if (!clarificationAnswer.trim() || !brief) return;
    const combinedPrompt = `${prompt}. Plot size: ${clarificationAnswer}`;
    setPrompt(combinedPrompt);
    handleInterpret(combinedPrompt, brief as unknown as Record<string, unknown>);
    setClarificationAnswer("");
  };

  const handleGenerateHome = async () => {
    if (!brief) return;
    setIsGenerating(true);
    setErrorMessage(null);

    try {
      const rawLayout = await generateDreamHomeLayout(brief);
      const sanitized = validateAndSanitizeHouseLayout(rawLayout) || rawLayout;
      onSuccess(sanitized);
    } catch (err) {
      console.error("[DREAM HOME GENERATE ERROR]", err);
      setErrorMessage(err instanceof Error ? err.message : "Architectural solver encountered an error during synthesis.");
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-md overflow-y-auto">
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 15 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-2xl bg-[#12141A] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl overflow-hidden my-auto"
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-5 right-5 w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-[#9E9C98] hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Header */}
          <div className="mb-6">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-[10px] font-mono tracking-widest text-purple-400 uppercase mb-3 font-semibold">
              <Sparkles className="w-3 h-3" />
              ARCHITECTURAL AI CONSULTATION
            </span>
            <h2 className="text-2xl sm:text-3xl font-serif font-light text-[#F5F3EF]">
              Describe Your Dream Home
            </h2>
            <p className="text-xs sm:text-sm text-[#9E9C98] font-light mt-1.5 leading-relaxed">
              Tell us what you want to build. Our AI architectural consultant will translate your vision into a structured design brief and preliminary structural column plan.
            </p>
          </div>

          {/* Error notice */}
          {errorMessage && (
            <div className="mb-4 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-2.5 text-xs text-red-400 font-mono">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Step 1: Input Description Area (When Brief is NOT yet confirmed) */}
          {!brief && (
            <div className="space-y-4">
              <div className="relative">
                <textarea
                  rows={4}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder='e.g., "I want a modern 3 bedroom home on a 30x50 ft plot with parking for two cars, an open kitchen, large living room, one attached bedroom and a staircase for the future first floor..."'
                  className="w-full rounded-2xl bg-[#0A0B0E] border border-white/10 hover:border-[#C48446]/40 focus:border-[#C48446] p-4 text-sm text-[#F5F3EF] placeholder-[#6B6964] outline-none transition-all resize-none font-light leading-relaxed shadow-inner"
                />
              </div>

              {/* Example Suggestions Chips */}
              <div>
                <span className="text-[10px] font-mono text-[#8A8883] uppercase tracking-wider block mb-2">
                  Inspiration Prompts
                </span>
                <div className="space-y-2">
                  {EXAMPLE_PROMPTS.map((ex, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setPrompt(ex);
                        handleInterpret(ex);
                      }}
                      className="w-full text-left p-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/5 hover:border-white/10 text-xs text-[#9E9C98] hover:text-[#F5F3EF] transition-all flex items-center justify-between group"
                    >
                      <span className="line-clamp-1 italic font-light">&ldquo;{ex}&rdquo;</span>
                      <ArrowRight className="w-3.5 h-3.5 text-[#C48446] shrink-0 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all ml-2" />
                    </button>
                  ))}
                </div>
              </div>

              {/* Action Button */}
              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => handleInterpret(prompt)}
                  disabled={isInterpreting || !prompt.trim()}
                  className="flex items-center gap-2 px-6 py-3 rounded-full bg-[#C48446] hover:bg-[#D49354] disabled:opacity-50 text-[#0A0B0E] font-semibold text-xs font-mono tracking-wider transition-all shadow-xl shadow-[#C48446]/20"
                >
                  {isInterpreting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>ANALYZING REQUIREMENTS...</span>
                    </>
                  ) : (
                    <>
                      <span>SYNTHESIZE HOME BRIEF</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Clarification Needed (e.g. Missing Plot Size) */}
          {brief && brief.missing_critical_fields?.length > 0 && (
            <div className="space-y-4 p-5 rounded-2xl bg-amber-500/10 border border-amber-500/30">
              <div className="flex items-start gap-3">
                <HelpCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-medium text-amber-200">
                    Just one quick question
                  </h4>
                  <p className="text-xs text-amber-300/80 font-light mt-0.5">
                    {brief.clarification_prompt || "What is your plot size? (e.g. 30×50 ft)"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="text"
                  value={clarificationAnswer}
                  onChange={(e) => setClarificationAnswer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleResolveClarification();
                  }}
                  placeholder="e.g. 30x50"
                  className="flex-1 px-4 py-2 rounded-xl bg-[#0A0B0E] border border-amber-500/30 text-sm text-[#F5F3EF] outline-none font-mono"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleResolveClarification}
                  disabled={!clarificationAnswer.trim()}
                  className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-[#0A0B0E] font-semibold text-xs font-mono tracking-wider"
                >
                  CONTINUE
                </button>
              </div>
            </div>
          )}

          {/* Step 3: YOUR HOME BRIEF (Structured Confirmation Screen) */}
          {brief && brief.missing_critical_fields?.length === 0 && (
            <div className="space-y-5">
              <div className="p-5 rounded-2xl bg-[#0A0B0E]/80 border border-white/10">
                <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
                  <div className="flex items-center gap-2">
                    <Compass className="w-4 h-4 text-[#C48446]" />
                    <span className="text-xs font-mono font-bold tracking-widest text-[#C48446] uppercase">
                      YOUR HOME BRIEF
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setBrief(null)}
                    className="text-[11px] font-mono text-[#8A8883] hover:text-[#F5F3EF] transition-colors"
                  >
                    Edit Prompt
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5 text-xs font-mono">
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
                    <span className="text-[10px] text-[#8A8883] block">SITE ENVELOPE</span>
                    <span className="text-sm font-medium text-[#F5F3EF]">
                      {brief.plot?.width || 40} × {brief.plot?.length || 50} {brief.plot?.unit || "ft"}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
                    <span className="text-[10px] text-[#8A8883] block">STORIES</span>
                    <span className="text-sm font-medium text-[#F5F3EF]">
                      {brief.floors === 1 ? "Ground Floor" : brief.floors === 2 ? "G+1 (2 Floors)" : `${brief.floors} Floors`}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
                    <span className="text-[10px] text-[#8A8883] block">BEDROOMS</span>
                    <span className="text-sm font-medium text-[#F5F3EF]">
                      {brief.bedrooms} Bedrooms
                      {brief.attached_bathrooms ? ` (${brief.attached_bathrooms} En-suite)` : ""}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
                    <span className="text-[10px] text-[#8A8883] block">BATHROOMS</span>
                    <span className="text-sm font-medium text-[#F5F3EF]">
                      {brief.bathrooms} Bathrooms
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
                    <span className="text-[10px] text-[#8A8883] block">PARKING</span>
                    <span className="text-sm font-medium text-[#F5F3EF]">
                      {brief.parking?.required ? `${brief.parking.cars || 1} Car Space` : "None"}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
                    <span className="text-[10px] text-[#8A8883] block">STYLE</span>
                    <span className="text-sm font-medium text-[#F5F3EF] capitalize">
                      {brief.style}
                    </span>
                  </div>
                </div>

                {/* Priorities & Highlights */}
                {brief.preferences?.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-white/5">
                    <span className="text-[10px] font-mono text-[#8A8883] block mb-2 uppercase">
                      Extracted Architectural Priorities:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {brief.preferences.map((p, idx) => (
                        <span
                          key={idx}
                          className="px-2.5 py-1 rounded-full bg-white/5 border border-white/5 text-[11px] text-[#DCD8D0] flex items-center gap-1.5"
                        >
                          <Check className="w-3 h-3 text-[#C48446]" />
                          <span>{p}</span>
                        </span>
                      ))}
                      {brief.staircase?.future_floor && (
                        <span className="px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-[11px] text-blue-300 flex items-center gap-1.5">
                          <Building className="w-3 h-3 text-blue-400" />
                          <span>Staircase for future 1st floor</span>
                        </span>
                      )}
                      {brief.open_kitchen && (
                        <span className="px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300 flex items-center gap-1.5">
                          <Sun className="w-3 h-3 text-amber-400" />
                          <span>Open Kitchen Flow</span>
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Engineering Disclaimer */}
              <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 flex items-start gap-2.5 text-[10px] text-[#8A8883] font-light leading-relaxed">
                <Shield className="w-3.5 h-3.5 text-[#C48446] shrink-0 mt-0.5" />
                <span>
                  Preliminary structural planning — deterministic RCC column locations and beam grids will be synthesized automatically. Final sizing and rebar require structural-engineer verification.
                </span>
              </div>

              {/* Generate Button */}
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setBrief(null)}
                  className="text-xs font-mono text-[#9E9C98] hover:text-[#F5F3EF] transition-colors"
                >
                  Back to Prompt
                </button>

                <button
                  type="button"
                  onClick={handleGenerateHome}
                  disabled={isGenerating}
                  className="flex items-center gap-2 px-7 py-3 rounded-full bg-[#C48446] hover:bg-[#D49354] disabled:opacity-50 text-[#0A0B0E] font-bold text-xs font-mono tracking-wider transition-all shadow-xl shadow-[#C48446]/25"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>SYNTHESIZING HOUSE & COLUMNS...</span>
                    </>
                  ) : (
                    <>
                      <span>GENERATE HOME</span>
                      <ArrowRight className="w-4 h-4 stroke-[3]" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
