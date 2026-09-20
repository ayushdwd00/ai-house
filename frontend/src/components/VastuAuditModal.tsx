"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Compass, CheckCircle2, AlertCircle, AlertTriangle, ShieldCheck, Sparkles } from "lucide-react";
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
  const warnings = vastuResult?.warnings ?? [];
  const recommendations = vastuResult?.recommendations ?? [];
  const occupancy = vastuResult?.zone_occupancy ?? {};

  // Color tone based on score
  const scoreColor =
    score >= 85 ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" :
    score >= 70 ? "text-[#C48446] border-[#C48446]/30 bg-[#C48446]/10" :
    "text-amber-400 border-amber-500/30 bg-amber-500/10";

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-[#0A0B0E]/85 backdrop-blur-xl">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ duration: 0.24, ease: "easeOut" }}
          className="relative w-full max-w-2xl max-h-[85vh] bg-[#12141A] border border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between bg-[#0A0B0E]/50">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#C48446]/10 border border-[#C48446]/30 flex items-center justify-center text-[#C48446]">
                <Compass className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-serif font-light text-[#F5F3EF]">
                  Vastu Shastra Compliance Audit
                </h3>
                <span className="text-[11px] font-mono tracking-widest text-[#9E9C98]">
                  {vastuResult?.orientation_interpreted || "Directional Energy Harmony"}
                </span>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 text-[#9E9C98] hover:text-[#F5F3EF] hover:bg-white/5 rounded-full transition-colors"
              title="Close Audit"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Scrollable Content */}
          <div className="p-6 overflow-y-auto space-y-6 text-left">
            {/* Score & Badge Banner */}
            <div className="p-4 rounded-2xl bg-[#0A0B0E] border border-white/10 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-mono tracking-widest text-[#9E9C98] uppercase block mb-1">
                  VASTU HARMONY RATING
                </span>
                <p className="text-xs text-[#9E9C98] max-w-xs">
                  Evaluation across 9 sacred directional zones (Ishanya, Agneya, Nairrutya, Vayavya, Brahma).
                </p>
              </div>

              <div className={`px-4 py-2 rounded-xl border flex items-center gap-2 ${scoreColor}`}>
                <Sparkles className="w-4 h-4" />
                <span className="text-xl font-serif font-bold tracking-tight">{score}%</span>
              </div>
            </div>

            {/* Zone Matrix Summary */}
            {Object.keys(occupancy).length > 0 && (
              <div>
                <span className="text-[10px] font-mono tracking-widest text-[#C48446] uppercase block mb-3">
                  DIRECTIONAL ZONE ALLOCATION
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {Object.entries(occupancy).map(([zone, roomNames]) => (
                    <div
                      key={zone}
                      className="p-3 rounded-xl bg-[#0A0B0E] border border-white/5 text-xs"
                    >
                      <span className="font-mono text-[#C48446] font-medium block text-[11px] mb-1">
                        {zone}
                      </span>
                      <p className="text-[#9E9C98] text-[11px] truncate">
                        {roomNames.join(", ")}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Individual Rule Results */}
            <div>
              <span className="text-[10px] font-mono tracking-widest text-[#C48446] uppercase block mb-3">
                ROOM-BY-ROOM VASTU AUDIT
              </span>

              <div className="space-y-2.5">
                {rules.map((rule) => {
                  const isPass = rule.status === "satisfied";
                  const isPartial = rule.status === "partially_satisfied";

                  return (
                    <div
                      key={rule.rule_id}
                      className="p-3.5 rounded-xl bg-[#0A0B0E] border border-white/5 flex items-start gap-3"
                    >
                      <div className="mt-0.5 shrink-0">
                        {isPass ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        ) : isPartial ? (
                          <AlertTriangle className="w-4 h-4 text-[#C48446]" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-red-400" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-xs font-medium text-[#F5F3EF]">
                            {rule.room_name}
                          </span>
                          <span className="text-[10px] font-mono text-[#9E9C98]">
                            Actual: <span className="text-[#F5F3EF]">{rule.actual_zone}</span> (Expected: {rule.expected_zone})
                          </span>
                        </div>

                        <p className="text-[11px] text-[#9E9C98] leading-relaxed">
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
              <div className="p-4 rounded-2xl bg-[#0A0B0E] border border-white/10">
                <span className="text-[10px] font-mono tracking-widest text-[#C48446] uppercase block mb-2">
                  ARCHITECTURAL RECOMMENDATIONS
                </span>
                <ul className="space-y-1.5 text-xs text-[#9E9C98]">
                  {recommendations.map((rec, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-[#C48446]">•</span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-white/5 bg-[#0A0B0E]/40 flex items-center justify-end">
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-full bg-[#F5F3EF] text-[#0A0B0E] hover:bg-[#E8E4DC] text-xs font-mono font-medium tracking-wider transition-all"
            >
              CLOSE AUDIT
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
