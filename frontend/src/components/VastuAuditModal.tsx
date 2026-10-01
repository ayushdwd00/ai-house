"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Compass, CheckCircle2, AlertCircle, AlertTriangle, Sparkles } from "lucide-react";
import { VastuResult } from "@/types/house";

interface VastuAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  vastuResult?: VastuResult;
}

export const VastuAuditModal: React.FC<VastuAuditModalProps> = ({
  isOpen,
  onClose,
  vastuResult,
}) => {
  if (!isOpen) return null;

  const score = vastuResult?.overall_score ?? 85;
  const rules = vastuResult?.rule_results ?? [];
  const recommendations = vastuResult?.recommendations ?? [];
  const occupancy = vastuResult?.zone_occupancy ?? {};

  // Color tone based on score
  const scoreColor =
    score >= 85 ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10 shadow-[0_0_20px_rgba(16,185,129,0.15)]" :
    score >= 70 ? "text-[#38BDF8] border-[#38BDF8]/30 bg-[#38BDF8]/10 shadow-[0_0_20px_rgba(56,189,248,0.15)]" :
    "text-amber-400 border-amber-500/30 bg-amber-500/10 shadow-[0_0_20px_rgba(245,158,11,0.15)]";

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-xl">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
          className="relative w-full max-w-2xl max-h-[90dvh] sm:max-h-[85vh] bg-[rgba(8,14,26,0.96)] border border-[rgba(96,165,250,0.22)] rounded-[24px] sm:rounded-[28px] shadow-[0_30px_90px_rgba(0,0,0,0.8),0_0_50px_rgba(37,99,235,0.15)] backdrop-blur-[24px] flex flex-col overflow-hidden text-[#F5F5F5]"
        >
          {/* Subtle Ambient Glow */}
          <div className="pointer-events-none absolute -top-20 -right-20 w-56 h-56 rounded-full bg-[radial-gradient(circle,rgba(6,182,212,0.15)_0%,transparent_70%)] blur-[60px]" />

          {/* Header */}
          <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-white/10 flex items-center justify-between bg-[rgba(12,20,38,0.5)]">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[rgba(37,99,235,0.18)] border border-[rgba(96,165,250,0.3)] flex items-center justify-center text-[#60A5FA] shrink-0">
                <Compass className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-serif font-light text-[#F5F5F5]">
                  Vastu Shastra Compliance Audit
                </h3>
                <span className="text-[11px] font-mono tracking-widest text-[#93C5FD]">
                  {vastuResult?.orientation_interpreted || "Directional Energy Harmony"}
                </span>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 text-[rgba(255,255,255,0.5)] hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer shrink-0"
              title="Close Audit"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Scrollable Content */}
          <div className="p-4 sm:p-6 overflow-y-auto space-y-6 text-left">
            {/* Score & Badge Banner */}
            <div className="p-4 rounded-2xl bg-[rgba(6,10,20,0.65)] border border-white/8 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-[10px] font-mono tracking-[0.2em] text-[#60A5FA] uppercase block mb-1">
                  VASTU HARMONY RATING
                </span>
                <p className="text-xs text-[rgba(255,255,255,0.6)] max-w-xs leading-relaxed">
                  Evaluation across 9 cardinal and intercardinal energy zones (Ishanya, Agneya, Nairrutya, Vayavya, Brahma).
                </p>
              </div>

              <div className={`self-start sm:self-auto px-4 py-2 rounded-xl border flex items-center gap-2 ${scoreColor}`}>
                <Sparkles className="w-4 h-4" />
                <span className="text-2xl font-serif font-light tracking-tight">{score}%</span>
              </div>
            </div>

            {/* Zone Matrix Summary */}
            {Object.keys(occupancy).length > 0 && (
              <div>
                <span className="text-[10px] font-mono tracking-[0.2em] text-[#38BDF8] uppercase block mb-3">
                  DIRECTIONAL ZONE ALLOCATION
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {Object.entries(occupancy).map(([zone, roomNames]) => (
                    <div
                      key={zone}
                      className="p-3 rounded-xl bg-[rgba(10,16,30,0.65)] border border-white/6 text-xs"
                    >
                      <span className="font-mono text-[#93C5FD] font-semibold block text-[11px] mb-1">
                        {zone}
                      </span>
                      <p className="text-[rgba(255,255,255,0.6)] text-[11px] truncate">
                        {roomNames.join(", ")}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Individual Rule Results */}
            <div>
              <span className="text-[10px] font-mono tracking-[0.2em] text-[#38BDF8] uppercase block mb-3">
                ROOM-BY-ROOM VASTU AUDIT
              </span>

              <div className="space-y-2.5">
                {rules.map((rule) => {
                  const isPass = rule.status === "satisfied";
                  const isPartial = rule.status === "partially_satisfied";

                  return (
                    <div
                      key={rule.rule_id}
                      className="p-3.5 rounded-xl bg-[rgba(10,16,30,0.65)] border border-white/6 flex items-start gap-3"
                    >
                      <div className="mt-0.5 shrink-0">
                        {isPass ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        ) : isPartial ? (
                          <AlertTriangle className="w-4 h-4 text-amber-400" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-rose-400" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-xs font-serif text-[#F5F5F5]">
                            {rule.room_name}
                          </span>
                          <span className="text-[10px] font-mono text-[rgba(255,255,255,0.5)]">
                            Actual: <span className="text-[#93C5FD] font-medium">{rule.actual_zone}</span> (Target: {rule.expected_zone})
                          </span>
                        </div>

                        <p className="text-[11px] text-[rgba(255,255,255,0.6)] leading-relaxed font-light">
                          {rule.explanation}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Recommendations */}
            {recommendations.length > 0 && (
              <div className="p-4.5 rounded-2xl bg-[rgba(6,10,20,0.65)] border border-white/8">
                <span className="text-[10px] font-mono tracking-[0.2em] text-[#60A5FA] uppercase block mb-2 font-semibold">
                  ARCHITECTURAL HARMONIZATION RECOMMENDATIONS
                </span>
                <ul className="space-y-1.5 text-xs text-[rgba(255,255,255,0.64)] font-light">
                  {recommendations.map((rec, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-[#06B6D4]">•</span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-white/8 bg-[rgba(6,10,20,0.5)] flex items-center justify-end">
            <button
              onClick={onClose}
              className="px-6 py-2 rounded-full btn-secondary-glass text-xs font-mono tracking-widest transition-all cursor-pointer"
            >
              CLOSE AUDIT
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
