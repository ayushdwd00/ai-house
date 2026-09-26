"use client";

import React, { useState, useEffect } from "react";
import { HouseLayout } from "@/types/house";
import { X, Sparkles, Download, RefreshCw, Sun, Moon, Info, Eye } from "lucide-react";
import { renderRealisticPhoto, checkBlenderStatus } from "@/utils/api";

interface RealisticRenderModalProps {
  isOpen: boolean;
  onClose: () => void;
  layout: HouseLayout;
  currentLighting?: string;
  isCutawayMode?: boolean;
}

export const RealisticRenderModal: React.FC<RealisticRenderModalProps> = ({
  isOpen,
  onClose,
  layout,
  currentLighting = "day",
  isCutawayMode = true,
}) => {
  const [cutaway, setCutaway] = useState<boolean>(isCutawayMode);
  const [renderState, setRenderState] = useState<"idle" | "generating" | "complete" | "error" | "unsupported">("idle");
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
          instructions: res.instructions
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
    a.download = `Architectural_Render_${cutaway ? "Cutaway" : "Exterior"}_${lighting}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl bg-[#12141A] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[#C48446]/20 border border-[#C48446]/40 text-[#C48446]">
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
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-[#9E9C98] hover:text-white hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6">
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
                      <span className="text-[11px] opacity-70 block">
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
                      <span className="text-[11px] opacity-70 block">
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
                    <button
                      type="button"
                      onClick={() => setLighting("day")}
                      className={`p-3 rounded-lg border flex flex-col items-center justify-center gap-1.5 transition-all ${
                        lighting === "day"
                          ? "bg-[#C48446]/20 border-[#C48446] text-white"
                          : "border-white/10 text-[#9E9C98] hover:border-white/20"
                      }`}
                    >
                      <Sun className="w-4 h-4 text-amber-300" />
                      <span className="text-xs font-medium">Daylight</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setLighting("sunset")}
                      className={`p-3 rounded-lg border flex flex-col items-center justify-center gap-1.5 transition-all ${
                        lighting === "sunset"
                          ? "bg-[#C48446]/20 border-[#C48446] text-white"
                          : "border-white/10 text-[#9E9C98] hover:border-white/20"
                      }`}
                    >
                      <Sparkles className="w-4 h-4 text-orange-400" />
                      <span className="text-xs font-medium">Golden Dusk</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setLighting("night")}
                      className={`p-3 rounded-lg border flex flex-col items-center justify-center gap-1.5 transition-all ${
                        lighting === "night"
                          ? "bg-[#C48446]/20 border-[#C48446] text-white"
                          : "border-white/10 text-[#9E9C98] hover:border-white/20"
                      }`}
                    >
                      <Moon className="w-4 h-4 text-indigo-300" />
                      <span className="text-xs font-medium">Night Glow</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Technical Specifications */}
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-white/5 text-[#9E9C98]">
                  <span>Target Layout</span>
                  <span className="font-semibold text-white">
                    {(layout as any).name || `${(layout as any).bhk || 3} BHK Residence`}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-white/5 text-[#9E9C98]">
                  <span>Floors & Program</span>
                  <span className="text-white">
                    {layout.floors?.length || layout.num_floors || 1} Levels, {layout.rooms?.length || 0} Rooms
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-white/5 text-[#9E9C98]">
                  <span>Render Engine</span>
                  <span className="text-[#C48446] font-mono">Cycles PBR Path Tracing (Denoised)</span>
                </div>
                <div className="flex justify-between items-center py-1 text-[#9E9C98]">
                  <span>Resolution</span>
                  <div className="flex gap-1.5">
                    {["1280x720", "1920x1080", "2560x1440"].map((res) => (
                      <button
                        key={res}
                        type="button"
                        onClick={() => setResolution(res)}
                        className={`px-2 py-0.5 rounded text-[11px] font-mono ${
                          resolution === res
                            ? "bg-[#C48446] text-[#0A0B0E] font-bold"
                            : "bg-white/5 hover:bg-white/10 text-[#9E9C98]"
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

          {renderState === "generating" && (
            <div className="py-16 flex flex-col items-center justify-center text-center space-y-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-full border-2 border-[#C48446]/20 border-t-[#C48446] animate-spin" />
                <Sparkles className="w-6 h-6 text-[#C48446] absolute inset-0 m-auto animate-pulse" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-white">Rendering Realistic Architectural Photo</h3>
                <p className="text-xs text-[#9E9C98] font-mono animate-pulse">{progressMsg}</p>
              </div>
            </div>
          )}

          {renderState === "complete" && renderedImage && (
            <div className="space-y-4">
              <div className="relative rounded-xl overflow-hidden border border-white/10 bg-black/40 flex items-center justify-center max-h-[500px]">
                <img
                  src={renderedImage}
                  alt="Blender Realistic Architectural Render"
                  className="w-full h-auto max-h-[500px] object-contain"
                />
              </div>
            </div>
          )}

          {(renderState === "error" || renderState === "unsupported") && (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-4 max-w-md mx-auto">
              <div className="p-3 rounded-full bg-rose-500/20 text-rose-400">
                <Info className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-white">
                  {renderState === "unsupported" ? "Blender Not Installed" : "Rendering Notice"}
                </h3>
                <p className="text-xs text-[#9E9C98]">
                  {errorMessage || "The backend was unable to execute the Blender rendering command."}
                </p>
                {blenderInfo?.instructions && (
                  <p className="mt-2 text-xs text-amber-200/80 bg-white/5 p-3 rounded-lg text-left">
                    {blenderInfo.instructions}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setRenderState("idle")}
                className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors"
              >
                Back to Settings
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/10 bg-white/[0.02]">
          <span className="text-[11px] text-[#9E9C98]">
            {renderState === "complete" ? "Render complete" : "Realtime viewer remains active in background"}
          </span>
          <div className="flex items-center gap-2">
            {renderState === "complete" && (
              <>
                <button
                  type="button"
                  onClick={() => setRenderState("idle")}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white text-xs font-medium transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Render Again
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#C48446] hover:bg-[#B37438] text-[#0A0B0E] text-xs font-semibold shadow-lg transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download Render
                </button>
              </>
            )}
            {renderState === "idle" && (
              <button
                type="button"
                onClick={handleStartRender}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#C48446] hover:bg-[#B37438] text-[#0A0B0E] font-semibold text-xs shadow-lg transition-all"
              >
                <Sparkles className="w-4 h-4 fill-current" />
                Generate Realistic Photo
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
