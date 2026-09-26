"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Loader2, AlertTriangle, X, Minus } from "lucide-react";
import { EditStage } from "@/utils/api";

// ============================================================
// STAGE META
// ============================================================
const STAGE_META: Record<
  string,
  { label: string; shortLabel: string; order: number }
> = {
  understanding_change: { label: "Understanding change", shortLabel: "Understanding", order: 0 },
  updating_architecture: { label: "Updating architecture", shortLabel: "Architecture", order: 1 },
  validating_layout: { label: "Validating layout", shortLabel: "Validation", order: 2 },
  updating_2d_plan: { label: "Updating 2D plan", shortLabel: "2D Plan", order: 3 },
  updating_3d_model: { label: "Updating 3D model", shortLabel: "3D Model", order: 4 },
  updating_visualization: { label: "Updating visualization", shortLabel: "Visualization", order: 5 },
};

const DEFAULT_STAGES = [
  "understanding_change",
  "updating_architecture",
  "validating_layout",
  "updating_2d_plan",
  "updating_3d_model",
  "updating_visualization",
] as const;

// ============================================================
// PROPS
// ============================================================
interface EditProgressPanelProps {
  isOpen: boolean;
  /** When undefined/empty, shows animated pending stages */
  completedStages?: EditStage[];
  /** Set to true when all stages are done */
  isDone?: boolean;
  /** Rejection reason (when edit failed) */
  rejectionReason?: string | null;
  /** The original instruction shown as context */
  instruction?: string;
  onClose?: () => void;
  onDismiss?: () => void;
}

// ============================================================
// COMPONENT
// ============================================================
export const EditProgressPanel: React.FC<EditProgressPanelProps> = ({
  isOpen,
  completedStages = [],
  isDone = false,
  rejectionReason,
  instruction,
  onClose,
  onDismiss,
}) => {
  const [visibleIndex, setVisibleIndex] = useState(0);
  const isRejected = Boolean(rejectionReason);

  // Animate pending stages one-by-one when not yet complete
  useEffect(() => {
    if (!isOpen || isDone || isRejected) return;
    if (completedStages.length > 0) {
      setVisibleIndex(completedStages.length);
      return;
    }
    // Fake progressive animation while waiting
    setVisibleIndex(0);
    const interval = setInterval(() => {
      setVisibleIndex((prev) => {
        if (prev >= DEFAULT_STAGES.length - 1) {
          clearInterval(interval);
          return prev;
        }
        return prev + 1;
      });
    }, 900);
    return () => clearInterval(interval);
  }, [isOpen, isDone, isRejected, completedStages.length]);

  if (!isOpen) return null;

  const resolvedStages = completedStages.length > 0 ? completedStages : null;

  const getStageStatus = (stageId: string, idx: number): "pending" | "active" | "ok" | "warning" | "failed" | "skipped" => {
    if (isRejected) {
      if (idx === 0 && resolvedStages) {
        const s = resolvedStages.find((r) => r.stage === stageId);
        return s?.status || "ok";
      }
      return idx > 0 ? "failed" : "ok";
    }
    if (resolvedStages) {
      const s = resolvedStages.find((r) => r.stage === stageId);
      if (s) return s.status;
      return "pending";
    }
    if (isDone) return "ok";
    if (idx < visibleIndex) return "ok";
    if (idx === visibleIndex) return "active";
    return "pending";
  };

  return (
    <AnimatePresence>
      <motion.div
        key="edit-progress"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[60] w-full max-w-sm px-4 pointer-events-none"
      >
        <div className="pointer-events-auto bg-[#0F1117]/95 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-2xl shadow-black/60">
          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1 min-w-0">
              {instruction && (
                <p className="text-[10px] text-[#6E6C68] font-mono truncate mb-0.5">
                  "{instruction.slice(0, 60)}{instruction.length > 60 ? "…" : ""}"
                </p>
              )}
              <p
                className={`text-xs font-mono font-medium ${
                  isRejected
                    ? "text-amber-400"
                    : isDone
                    ? "text-[#C48446]"
                    : "text-[#DCD8D0]"
                }`}
              >
                {isRejected
                  ? "CHANGE NOT APPLIED"
                  : isDone
                  ? "DESIGN UPDATED"
                  : "Updating design…"}
              </p>
            </div>
            {(isDone || isRejected) && (onClose || onDismiss) && (
              <button
                onClick={onClose || onDismiss}
                className="w-5 h-5 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-[#9E9C98] hover:text-white transition-colors ml-3 shrink-0"
                aria-label="Dismiss"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            )}
          </div>

          {/* Rejection reason */}
          {isRejected && rejectionReason && (
            <div className="mb-3 px-3 py-2 rounded-xl bg-amber-500/8 border border-amber-500/20">
              <p className="text-[11px] text-amber-300/90 leading-relaxed">
                {rejectionReason}
              </p>
            </div>
          )}

          {/* Stage list */}
          <div className="space-y-1.5">
            {DEFAULT_STAGES.map((stageId, idx) => {
              const meta = STAGE_META[stageId];
              const status = getStageStatus(stageId, idx);
              const resolvedLabel =
                resolvedStages?.find((r) => r.stage === stageId)?.label || meta.label;

              return (
                <div key={stageId} className="flex items-center gap-2.5">
                  {/* Icon */}
                  <div
                    className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 transition-all ${
                      status === "ok"
                        ? "bg-[#C48446]/20 text-[#C48446]"
                        : status === "active"
                        ? "bg-white/10 text-white"
                        : status === "warning"
                        ? "bg-amber-500/15 text-amber-400"
                        : status === "failed"
                        ? "bg-red-500/10 text-red-400"
                        : status === "skipped"
                        ? "bg-white/5 text-[#4E4C49]"
                        : "bg-white/3 text-[#4E4C49]"
                    }`}
                  >
                    {status === "ok" && <Check className="w-2.5 h-2.5" />}
                    {status === "active" && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                    {status === "warning" && <AlertTriangle className="w-2.5 h-2.5" />}
                    {status === "failed" && <X className="w-2.5 h-2.5" />}
                    {status === "skipped" && <Minus className="w-2.5 h-2.5" />}
                    {status === "pending" && (
                      <div className="w-1.5 h-1.5 rounded-full bg-[#3A3935]" />
                    )}
                  </div>

                  {/* Label */}
                  <span
                    className={`text-[11px] font-mono transition-colors ${
                      status === "ok"
                        ? "text-[#DCD8D0]"
                        : status === "active"
                        ? "text-[#F5F3EF]"
                        : status === "warning"
                        ? "text-amber-300/80"
                        : status === "failed" || status === "skipped"
                        ? "text-[#4E4C49]"
                        : "text-[#4E4C49]"
                    }`}
                  >
                    {resolvedLabel}
                  </span>

                  {/* Connector line below (except last) */}
                  {idx < DEFAULT_STAGES.length - 1 && (
                    <div className="hidden" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Visualization note on done */}
          {isDone && (() => {
            const visStage = resolvedStages?.find((s) => s.stage === "updating_visualization");
            if (visStage?.status === "failed" && visStage.error) {
              return (
                <p className="mt-3 text-[10px] text-[#6E6C68] font-mono leading-relaxed border-t border-white/5 pt-2.5">
                  {visStage.error}
                </p>
              );
            }
            return null;
          })()}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
