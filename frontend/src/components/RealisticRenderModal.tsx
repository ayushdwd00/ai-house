"use client";

import React, { useState, useEffect } from "react";
import { X, Sparkles, Download, RefreshCw, AlertCircle, CheckCircle2, Sliders, Sun, Moon, Info } from "lucide-react";
import { HouseLayout } from "@/types/house";
import { renderRealisticPhoto, checkBlenderStatus } from "@/utils/api";

interface RealisticRenderModalProps {
  isOpen: boolean;
  onClose: () => void;
  layout: HouseLayout;
  currentLighting?: "day" | "sunset" | "night";
  isCutawayMode?: boolean;
}

export const RealisticRenderModal: React.FC<RealisticRenderModalProps> = ({
  isOpen,
  onClose,
  layout,
  currentLighting = "day",
  isCutawayMode = true,
}) => {
  const [renderState, setRenderState] = useState<"idle" | "generating" | "complete" | "error" | "unsupported">("idle");
  const [cutaway, setCutaway] = useState<boolean>(isCutawayMode);
  const [lighting, setLighting] = useState<string>(currentLighting);
  const [resolution, setResolution] = useState<string>("1920x1080");
  const [renderedImage, setRenderedImage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [blenderInfo, setBlenderInfo] = useState<{ available: boolean; message: string; instructions?: string } | null>(null);
  const [progressMsg, setProgressMsg] = useState<string>("Initializing Blender headless environment...");

  // Check Blender status on open
  useEffect(() => {
    if (isOpen) {
      checkBlenderStatus().then((info) => {
        setBlenderInfo(info);
        if (!info.available && renderState === "idle") {
          // Keep idle so user can review info or test render
        }
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleStartRender = async () => {
    setRenderState("generating");
    setErrorMessage(null);
    setProgressMsg("Synthesizing canonical HouseLayout into Blender scene...");

    const progressTimer = setTimeout(() => {
      setProgressMsg("Building architectural walls, slabs, joinery and PBR materials...");
    }, 2500);

    const progressTimer2 = setTimeout(() => {
      setProgressMsg("Computing Cycles raytraced global illumination & denoising...");
    }, 6000);

    try {
      const res = await renderRealisticPhoto({
        layout,
        cutaway,
        resolution,
        samples: 64,
        lighting,
        projectId: layout.id || layout.project_id,
      });

      clearTimeout(progressTimer);
      clearTimeout(progressTimer2);

      if (res.status === "success" && res.image_base64) {
        setRenderedImage(res.image_base64);
        setRenderState("complete");
      } else if (res.status === "blender_not_installed") {
        setRenderState("unsupported");
        setErrorMessage(res.message || "Blender is not installed on the server.");
        setBlenderInfo({
          available: false,
          message: res.message || "Blender was not detected on this system.",
          instructions: res.instructions,
        });
      } else {
        setRenderState("error");
        setErrorMessage(res.message || res.details || "Blender rendering could not be completed.");
      }
    } catch (err: any) {
      clearTimeout(progressTimer);
      clearTimeout(progressTimer2);
      setRenderState("error");
      setErrorMessage(err.message || "Failed to start Blender rendering.");
    }
  };

  const handleDownload = () => {
    if (!renderedImage) return;
    const a = document.createElement("a");
    a.href = renderedImage;
    a.download = `AI_House_Realistic_${layout.title?.replace(/\s+/g, "_") || "Design"}_${cutaway ? "Cutaway" : "Exterior"}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md transition-all">
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col bg-[#12141A] border border-white/10 rounded-2xl shadow-2xl overflow-hidden text-[#F5F3EF]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#161922]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-[#C48446]/20 border border-[#C48446]/30 text-[#C48446]">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white tracking-wide">
                Photorealistic Architectural Rendering
              </h2>
              <p className="text-xs text-[#9E9C98]">
                Blender Cycles raytraced engine using canonical HouseLayout
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-[#9E9C98] hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* STATE 1: IDLE / CONFIGURATION */}
          {renderState === "idle" && (
            <div className="space-y-6">
              {blenderInfo && !blenderInfo.available && (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs flex items-start gap-3">
                  <Info className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold block mb-0.5">Blender Environment Status:</span>
                    {blenderInfo.message}
                    {blenderInfo.instructions && (
                      <p className="mt-1 text-amber-200/80">{blenderInfo.instructions}</p>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Mode Selection */}
                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-3">
                  <label className="text-xs font-mono uppercase tracking-wider text-[#9E9C98] block">
                    Architectural Presentation
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setCutaway(true)}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        cutaway
                          ? "bg-[#C48446]/20 border-[#C48446] text-white"
                          : "border-white/10 text-[#9E9C98] hover:border-white/20"
                      }`}
                    >
                      <span className="text-xs font-bold block mb-1">Dollhouse Cutaway</span>
                      <span className="text-[11px] text-[#9E9C98] block">
                        Reveals multi-story interior rooms, slabs & staircase
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCutaway(false)}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        !cutaway
                          ? "bg-[#C48446]/20 border-[#C48446] text-white"
                          : "border-white/10 text-[#9E9C98] hover:border-white/20"
                      }`}
                    >
                      <span className="text-xs font-bold block mb-1">Complete Exterior</span>
                      <span className="text-[11px] text-[#9E9C98] block">
                        Full facade massing, roof parapet & entrance steps
                      </span>
                    </button>
                  </div>
                </div>

                {/* Lighting Atmosphere */}
                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-3">
                  <label className="text-xs font-mono uppercase tracking-wider text-[#9E9C98] block">
                    Lighting & Atmosphere
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: "day", label: "Daylight", icon: Sun },
                      { id: "sunset", label: "Golden Dusk", icon: Sparkles },
                      { id: "night", label: "Night Glow", icon: Moon },
                    ].map((item) => {
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setLighting(item.id)}
                          className={`p-2.5 rounded-lg border flex flex-col items-center gap-1.5 transition-all ${
                            lighting === item.id
                              ? "bg-[#C48446]/20 border-[#C48446] text-white"
                              : "border-white/10 text-[#9E9C98] hover:border-white/20"
                          }`}
                        >
                          <Icon className="w-4 h-4 text-[#C48446]" />
                          <span className="text-xs font-medium">{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Technical Specifications */}
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-2 text-xs text-[#9E9C98]">
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span>Target Layout</span>
                  <span className="text-white font-medium">{layout.title || "Current Residence"}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span>Floors & Program</span>
                  <span className="text-white font-medium">{layout.floors?.length || layout.num_floors || 1} Levels, {layout.rooms?.length || 0} Rooms</span>
                </div>
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span>Render Engine</span>
                  <span className="text-[#C48446] font-medium">Cycles PBR Path Tracing (Denoised)</span>
                </div>
                <div className="flex justify-between py-1">
                  <span>Resolution</span>
                  <div className="flex gap-2">
                    {["1280x720", "1920x1080", "2560x1440"].map((res) => (
                      <button
                        key={res}
                        type="button"
                        onClick={() => setResolution(res)}
                        className={`px-2 py-0.5 rounded text-[11px] ${
                          resolution === res
                            ? "bg-[#C48446] text-black font-semibold"
                            : "bg-white/10 text-[#9E9C98] hover:text-white"
                        }`}
                      >
                        {res.split("x")[1]}p
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STATE 2: GENERATING */}
          {renderState === "generating" && (
            <div className="py-16 flex flex-col items-center justify-center text-center space-y-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-full border-2 border-[#C48446]/20 border-t-[#C48446] animate-spin" />
                <Sparkles className="w-6 h-6 text-[#C48446] absolute inset-0 m-auto animate-pulse" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-white">Rendering Realistic Architectural Photo</h3>
                <p className="text-xs text-[#9E9C98] max-w-md mx-auto">{progressMsg}</p>
              </div>
              <div className="text-[11px] font-mono text-[#C48446]/80 bg-[#C48446]/10 px-3 py-1 rounded-full border border-[#C48446]/20">
                Mode: {cutaway ? "Cutaway Dollhouse" : "Full Exterior"} • {resolution}
              </div>
            </div>
          )}

          {/* STATE 3: COMPLETE (IMAGE PREVIEW) */}
          {renderState === "complete" && renderedImage && (
            <div className="space-y-4">
              <div className="relative rounded-xl overflow-hidden border border-white/15 bg-black/40 flex items-center justify-center group shadow-2xl">
                <img
                  src={renderedImage}
                  alt="Blender Realistic Architectural Render"
                  className="w-full max-h-[58vh] object-contain rounded-xl"
                />
                <div className="absolute top-3 left-3 bg-[#12141A]/90 backdrop-blur-md px-3 py-1 rounded-full border border-white/10 text-[11px] font-mono text-[#9E9C98]">
                  Cycles Raytraced • {resolution}
                </div>
              </div>
            </div>
          )}

          {/* STATE 4: BLENDER NOT INSTALLED OR ERROR */}
          {(renderState === "error" || renderState === "unsupported") && (
            <div className="p-6 rounded-xl bg-red-500/10 border border-red-500/20 text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center mx-auto text-red-400">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-white">
                  {renderState === "unsupported" ? "Blender Not Installed" : "Rendering Notice"}
                </h3>
                <p className="text-xs text-red-200/80 max-w-lg mx-auto">
                  {errorMessage || "The backend was unable to execute the Blender rendering command."}
                </p>
                {blenderInfo?.instructions && (
                  <p className="text-xs text-[#9E9C98] max-w-lg mx-auto mt-2 p-3 bg-white/5 rounded-lg border border-white/5 text-left">
                    {blenderInfo.instructions}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setRenderState("idle")}
                className="px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-medium text-white transition-colors"
              >
                Back to Settings
              </button>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/10 bg-[#161922]">
          <div className="text-xs text-[#9E9C98]">
            {renderState === "complete" ? "Render complete" : "Realtime Three.js viewer remains active in background"}
          </div>
          <div className="flex items-center gap-3">
            {renderState === "complete" && (
              <>
                <button
                  type="button"
                  onClick={() => setRenderState("idle")}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-medium text-white transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Render Again
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-[#C48446] hover:bg-[#B37438] text-xs font-semibold text-[#0A0B0E] transition-all shadow-lg"
                >
                  <Download className="w-4 h-4" />
                  Download Render
                </button>
              </>
            )}

            {renderState === "idle" && (
              <button
                type="button"
                onClick={handleStartRender}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#C48446] hover:bg-[#B37438] text-xs font-semibold text-[#0A0B0E] transition-all shadow-lg hover:shadow-orange-500/20"
              >
                <Sparkles className="w-4 h-4" />
                Generate Realistic Photo
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
