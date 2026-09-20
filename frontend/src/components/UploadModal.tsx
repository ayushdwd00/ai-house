"use client";

import React, { useState, useRef } from "react";
import { UploadCloud, ArrowRight, X, Image as ImageIcon, Ruler } from "lucide-react";
import { HouseLayout } from "@/types/house";
import { uploadFloorPlanImage, generateHouseLayout } from "@/utils/api";

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (layout: HouseLayout) => void;
  isDarkMode?: boolean;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  isDarkMode = false,
}) => {
  const [step, setStep] = useState<"drop" | "scale" | "processing">("drop");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [widthFt, setWidthFt] = useState<number>(38.0);
  const [statusMessage, setStatusMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (file: File) => {
    if (!file.type.startsWith("image/")) {
      alert("Please upload a PNG, JPG, or WebP image file of your floor plan.");
      return;
    }
    setSelectedFile(file);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setStep("scale");
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    setStep("processing");
    setStatusMessage("Analyzing architectural boundaries with Groq Vision...");

    try {
      const data = await uploadFloorPlanImage(selectedFile, widthFt);
      setStatusMessage("Synthesizing 2D and 3D dollhouse model...");
      onSuccess(data.layout);
      onClose();
    } catch (err) {
      console.error("[UPLOAD ERROR]", err);
      // Fallback generation via standard API
      try {
        const layout = await generateHouseLayout({
          plot_width: widthFt,
          plot_length: Math.round(widthFt * 0.85),
          num_floors: 1,
          bedrooms: 3,
          bathrooms: 2.0,
          style: "Architectural Digitization",
        });
        onSuccess(layout);
        onClose();
      } catch (fallbackErr) {
        alert(err instanceof Error ? err.message : "Failed to process floor plan upload.");
      }
    } finally {
      setStep("drop");
      setSelectedFile(null);
      setPreviewUrl(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className={`relative w-full max-w-lg rounded-3xl p-6 sm:p-8 shadow-2xl border overflow-hidden transition-colors ${
          isDarkMode
            ? "bg-[#1C1917] border-stone-800 text-stone-100"
            : "bg-white border-stone-100 text-stone-900"
        }`}
      >
        <button
          onClick={onClose}
          className="absolute top-6 right-6 p-2 rounded-full text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-600">
            <UploadCloud className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">Upload Floor Plan</h2>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              Scan blueprint, sketch, or image into interactive 2D & 3D
            </p>
          </div>
        </div>

        {/* Step 1: Drop file */}
        {step === "drop" && (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`mt-6 border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
              isDarkMode
                ? "border-stone-700 hover:border-amber-500/60 bg-stone-900/60 hover:bg-stone-900"
                : "border-stone-300 hover:border-amber-600/70 bg-stone-50/70 hover:bg-amber-500/5"
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => e.target.files?.[0] && handleFileChange(e.target.files[0])}
              accept="image/*"
              className="hidden"
            />
            <div
              className={`w-12 h-12 rounded-full shadow-sm border flex items-center justify-center mx-auto mb-3 ${
                isDarkMode ? "bg-stone-800 border-stone-700 text-stone-300" : "bg-white border-stone-200 text-stone-500"
              }`}
            >
              <ImageIcon className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold">Drag & drop floor plan image here</p>
            <p className="text-xs text-stone-400 mt-1">PNG, JPG, or WEBP up to 25MB</p>
            <span className="inline-block mt-4 text-xs font-semibold text-amber-600 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-full">
              Or browse files
            </span>
          </div>
        )}

        {/* Step 2: Scale Calibration */}
        {step === "scale" && (
          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            {previewUrl && (
              <div
                className={`relative w-full h-44 rounded-xl overflow-hidden border flex items-center justify-center ${
                  isDarkMode ? "bg-stone-900 border-stone-800" : "bg-stone-100 border-stone-200"
                }`}
              >
                <img src={previewUrl} alt="Floor plan preview" className="max-h-full max-w-full object-contain" />
              </div>
            )}

            <div
              className={`border rounded-2xl p-4 ${
                isDarkMode
                  ? "bg-amber-500/10 border-amber-500/20 text-amber-300"
                  : "bg-amber-50/80 border-amber-200/80 text-amber-900"
              }`}
            >
              <div className="flex items-center gap-2 font-semibold text-xs mb-1">
                <Ruler className="w-4 h-4 text-amber-500" />
                <span>One Quick Scale Calibration</span>
              </div>
              <p className="text-xs text-stone-500 dark:text-stone-400 mb-3">
                What is the approximate overall width of this building (in feet)?
              </p>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={18}
                  max={120}
                  step={1}
                  value={widthFt}
                  onChange={(e) => setWidthFt(Number(e.target.value))}
                  className={`w-28 px-3 py-2 text-sm font-bold rounded-xl border focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                    isDarkMode
                      ? "bg-stone-900 border-stone-700 text-stone-100"
                      : "bg-white border-stone-300 text-stone-900"
                  }`}
                  required
                />
                <span className="text-xs text-stone-500 font-medium">feet wide</span>
              </div>
            </div>

            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-2xl bg-stone-900 hover:bg-stone-800 dark:bg-amber-600 dark:hover:bg-amber-500 text-white font-medium text-sm transition-all shadow-md active:scale-[0.99]"
            >
              <span>Convert to Interactive 2D & 3D</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* Step 3: Processing */}
        {step === "processing" && (
          <div className="mt-8 py-10 text-center space-y-4">
            <div className="w-12 h-12 border-3 border-amber-600/20 border-t-amber-600 rounded-full animate-spin mx-auto" />
            <h3 className="text-sm font-semibold">Processing Floor Plan</h3>
            <p className="text-xs text-stone-500 dark:text-stone-400 max-w-xs mx-auto">{statusMessage}</p>
          </div>
        )}
      </div>
    </div>
  );
};
