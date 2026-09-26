"use client";

import React, { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Sparkles,
  Download,
  RefreshCw,
  Loader2,
  ImageIcon,
  Check,
  AlertTriangle,
  BookMarked,
} from "lucide-react";
import { HouseLayout } from "@/types/house";
import {
  generateProjectVisualization,
  getVisualImageUrl,
  GeneratedVisual,
} from "@/utils/api";

// ============================================================
// STYLE & VIEW OPTIONS
// ============================================================
const STYLES = [
  { id: "architectural", label: "Architectural" },
  { id: "minimal", label: "Minimal" },
  { id: "warm_modern", label: "Warm Modern" },
  { id: "luxury", label: "Luxury" },
  { id: "technical_presentation", label: "Technical" },
] as const;

const VIEWS = [
  { id: "top_down", label: "Top-down" },
  { id: "isometric", label: "Isometric" },
  { id: "presentation", label: "Presentation" },
] as const;

type StyleId = (typeof STYLES)[number]["id"];
type ViewId = (typeof VIEWS)[number]["id"];

// ============================================================
// PROPS
// ============================================================
interface ImageVisualizationPanelProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  layout: HouseLayout;
  /** Optional base64-encoded PNG of the current 2D plan for context */
  planImageBase64?: string;
  /** Called when image is set as project cover */
  onSetAsCover?: (visual: GeneratedVisual) => void;
}

// ============================================================
// COMPONENT
// ============================================================
export const ImageVisualizationPanel: React.FC<ImageVisualizationPanelProps> = ({
  isOpen,
  onClose,
  projectId,
  layout,
  planImageBase64,
  onSetAsCover,
}) => {
  const [style, setStyle] = useState<StyleId>("architectural");
  const [view, setView] = useState<ViewId>("top_down");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedVisual, setGeneratedVisual] = useState<GeneratedVisual | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [setCoverSuccess, setSetCoverSuccess] = useState(false);
  const abortRef = useRef(false);

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    setError(null);
    setGeneratedVisual(null);
    setImageDataUrl(null);
    abortRef.current = false;

    try {
      const result = await generateProjectVisualization(projectId, {
        layout,
        style,
        view,
        plan_image_base64: planImageBase64,
        set_as_cover: false,
      });

      if (abortRef.current) return;

      if (result.status === "visualization_failed") {
        setError(result.message || "Visualization generation failed. You can retry.");
        return;
      }

      if (result.visual && result.visual.url) {
        setGeneratedVisual(result.visual);
        // Load full image URL
        const fullUrl = getVisualImageUrl(result.visual.url);
        setImageDataUrl(fullUrl);
      } else {
        setError("No image returned from visualization service.");
      }
    } catch (err) {
      if (!abortRef.current) {
        setError(err instanceof Error ? err.message : "Visualization failed.");
      }
    } finally {
      if (!abortRef.current) setIsGenerating(false);
    }
  }, [projectId, layout, style, view, planImageBase64]);

  const handleDownload = useCallback(() => {
    if (!imageDataUrl || !generatedVisual) return;
    const link = document.createElement("a");
    link.href = imageDataUrl;
    link.download = `${layout.title || "house"}-${style}-${view}.png`
      .replace(/\s+/g, "-")
      .toLowerCase();
    link.click();
  }, [imageDataUrl, generatedVisual, layout.title, style, view]);

  const handleSetAsCover = useCallback(async () => {
    if (!generatedVisual || !projectId) return;
    try {
      await generateProjectVisualization(projectId, {
        layout,
        style,
        view,
        plan_image_base64: planImageBase64,
        set_as_cover: true,
      });
      setSetCoverSuccess(true);
      onSetAsCover?.(generatedVisual);
      setTimeout(() => setSetCoverSuccess(false), 2500);
    } catch (_) {}
  }, [generatedVisual, projectId, layout, style, view, planImageBase64, onSetAsCover]);

  const handleClose = () => {
    abortRef.current = true;
    setIsGenerating(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="image-panel"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-black/70 backdrop-blur-md"
        onClick={(e) => {
          if (e.target === e.currentTarget) handleClose();
        }}
      >
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full sm:max-w-xl bg-[#0F1117] border border-white/10 rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* ── Header ── */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-white/8 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-[#C48446]/15 border border-[#C48446]/25 flex items-center justify-center">
                <ImageIcon className="w-3.5 h-3.5 text-[#C48446]" />
              </div>
              <div>
                <h3 className="text-sm font-serif font-medium text-[#F5F3EF] leading-tight">
                  Architectural Image
                </h3>
                <p className="text-[10px] text-[#6E6C68] font-mono">
                  Presentation visualization · Derived from your design
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-[#9E9C98] hover:text-white transition-colors"
              aria-label="Close"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* ── Scrollable Body ── */}
          <div className="flex-1 overflow-y-auto">
            {/* Options */}
            <div className="px-5 py-4 space-y-4 border-b border-white/6">
              {/* Style */}
              <div>
                <p className="text-[10px] font-mono text-[#6E6C68] uppercase tracking-widest mb-2">
                  Style
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {STYLES.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setStyle(s.id)}
                      className={`px-3 py-1.5 rounded-full text-[11px] font-mono transition-all ${
                        style === s.id
                          ? "bg-[#C48446] text-[#0A0B0E] font-semibold"
                          : "bg-white/5 hover:bg-white/10 text-[#B0ADA8]"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* View */}
              <div>
                <p className="text-[10px] font-mono text-[#6E6C68] uppercase tracking-widest mb-2">
                  View
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {VIEWS.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => setView(v.id)}
                      className={`px-3 py-1.5 rounded-full text-[11px] font-mono transition-all ${
                        view === v.id
                          ? "bg-white/15 text-[#F5F3EF] border border-white/20"
                          : "bg-white/5 hover:bg-white/10 text-[#B0ADA8]"
                      }`}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Preview Area */}
            <div className="px-5 py-4">
              <div
                className={`relative w-full rounded-2xl overflow-hidden border ${
                  imageDataUrl
                    ? "border-white/10"
                    : "border-white/5 border-dashed"
                } bg-[#0A0B0E]`}
                style={{ aspectRatio: "4/3" }}
              >
                {/* Loading state */}
                {isGenerating && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                    <div className="relative">
                      <Loader2 className="w-8 h-8 text-[#C48446] animate-spin" />
                      <div className="absolute inset-0 rounded-full bg-[#C48446]/10 animate-ping" />
                    </div>
                    <div className="text-center space-y-1">
                      <p className="text-[11px] font-mono text-[#9E9C98]">
                        Generating visualization…
                      </p>
                      <p className="text-[10px] text-[#6B6964] font-mono">
                        This may take up to 30 seconds
                      </p>
                    </div>
                  </div>
                )}

                {/* Image */}
                {imageDataUrl && !isGenerating && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imageDataUrl}
                    alt="Architectural visualization"
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                )}

                {/* Empty state */}
                {!imageDataUrl && !isGenerating && !error && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6">
                    <div className="w-12 h-12 rounded-2xl bg-white/3 border border-white/8 flex items-center justify-center">
                      <ImageIcon className="w-6 h-6 text-[#6B6964]" />
                    </div>
                    <div className="text-center space-y-1">
                      <p className="text-xs font-serif text-[#9E9C98]">
                        Generate an architectural visualization
                      </p>
                      <p className="text-[10px] text-[#6B6964] font-mono max-w-xs leading-relaxed">
                        Powered by Gemini. Your design stays unchanged.
                      </p>
                    </div>
                  </div>
                )}

                {/* Error state */}
                {error && !isGenerating && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6">
                    <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                      <AlertTriangle className="w-5 h-5 text-amber-400" />
                    </div>
                    <div className="text-center space-y-1">
                      <p className="text-xs text-[#DCD8D0] font-serif">Visualization failed</p>
                      <p className="text-[10px] text-[#9E9C98] font-mono max-w-xs leading-relaxed">
                        {error}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Note */}
              <p className="mt-2.5 text-[9px] text-[#4E4C49] font-mono text-center leading-relaxed">
                Image is a presentation derivative of your design. Geometry is never changed.
              </p>
            </div>
          </div>

          {/* ── Footer Actions ── */}
          <div className="px-5 pb-5 pt-3 border-t border-white/8 flex items-center justify-between gap-3 shrink-0">
            {/* Secondary: Download / Cover */}
            <div className="flex items-center gap-2">
              {generatedVisual && imageDataUrl && (
                <>
                  <button
                    onClick={handleDownload}
                    title="Download image"
                    className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-[#9E9C98] hover:text-[#F5F3EF] transition-colors border border-white/8"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  {onSetAsCover && (
                    <button
                      onClick={handleSetAsCover}
                      title="Set as project cover"
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-mono transition-all border ${
                        setCoverSuccess
                          ? "bg-green-500/15 border-green-500/30 text-green-400"
                          : "bg-white/5 hover:bg-white/10 border-white/8 text-[#9E9C98] hover:text-[#F5F3EF]"
                      }`}
                    >
                      {setCoverSuccess ? (
                        <Check className="w-3 h-3" />
                      ) : (
                        <BookMarked className="w-3 h-3" />
                      )}
                      <span>{setCoverSuccess ? "Set!" : "Cover"}</span>
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Primary: Generate / Regenerate */}
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#C48446] hover:bg-[#D49354] disabled:opacity-40 disabled:cursor-not-allowed text-[#0A0B0E] text-xs font-mono font-semibold uppercase tracking-wider transition-all shadow-lg shadow-[#C48446]/20 active:scale-95"
            >
              {isGenerating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : generatedVisual ? (
                <RefreshCw className="w-3.5 h-3.5" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              <span>{isGenerating ? "Generating…" : generatedVisual ? "Regenerate" : "Generate"}</span>
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
