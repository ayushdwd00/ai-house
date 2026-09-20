"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Sparkles,
  Check,
  X,
  Compass,
  Layers,
  Car,
  Home,
  ChevronRight,
  Edit3,
} from "lucide-react";
import * as THREE from "three";
import { IntakeRequest } from "@/types/house";

interface ArchitecturalConsultationProps {
  onClose: () => void;
  onSubmit: (req: IntakeRequest) => void;
  initialPlotWidth?: number;
  initialPlotLength?: number;
}

// Architectural background Three.js scene
const SubtleAtmosphere3D: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth || window.innerWidth;
    const height = mount.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2("#0A0B0E", 0.015);

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(16, 12, 20);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    // Architectural Wireframe / Volumetric Studio Massing
    const group = new THREE.Group();
    scene.add(group);

    // Ground grid
    const grid = new THREE.GridHelper(50, 50, 0x333742, 0x181a22);
    grid.position.y = -0.01;
    group.add(grid);

    // Sculptural massing volumes
    const boxMat = new THREE.MeshBasicMaterial({
      color: 0x1f232d,
      wireframe: true,
      transparent: true,
      opacity: 0.35,
    });
    const solidMat = new THREE.MeshBasicMaterial({
      color: 0x111318,
      transparent: true,
      opacity: 0.6,
    });

    const v1 = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 12), solidMat);
    const v1Wire = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 12), boxMat);
    v1.position.set(0, 2, 0);
    v1Wire.position.set(0, 2, 0);
    group.add(v1);
    group.add(v1Wire);

    const v2 = new THREE.Mesh(new THREE.BoxGeometry(6, 3.5, 7), solidMat);
    const v2Wire = new THREE.Mesh(new THREE.BoxGeometry(6, 3.5, 7), boxMat);
    v2.position.set(3, 5.5, -1);
    v2Wire.position.set(3, 5.5, -1);
    group.add(v2);
    group.add(v2Wire);

    let frameId: number;
    let time = 0;
    const animate = () => {
      time += 0.003;
      group.rotation.y = Math.sin(time * 0.4) * 0.15;
      camera.position.x = 16 + Math.cos(time * 0.3) * 2;
      camera.position.z = 20 + Math.sin(time * 0.3) * 2;
      camera.lookAt(0, 2, 0);
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };
    animate();

    const handleResize = () => {
      if (!mount) return;
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", handleResize);
      if (mount && renderer.domElement) {
        mount.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  return <div ref={mountRef} className="absolute inset-0 pointer-events-none opacity-40 z-0" />;
};

export const ArchitecturalConsultation: React.FC<ArchitecturalConsultationProps> = ({
  onClose,
  onSubmit,
  initialPlotWidth = 40,
  initialPlotLength = 50,
}) => {
  // State for all 11 questions
  const [plotWidth, setPlotWidth] = useState<number>(initialPlotWidth);
  const [plotLength, setPlotLength] = useState<number>(initialPlotLength);

  const [families, setFamilies] = useState<"1" | "2" | "3+">("1");
  const [kids, setKids] = useState<"0" | "1" | "2" | "3+">("2");
  const [bedrooms, setBedrooms] = useState<number>(3);
  const [attachedBaths, setAttachedBaths] = useState<"None" | "1" | "2" | "3" | "All">("2");
  const [separateKidsBedrooms, setSeparateKidsBedrooms] = useState<"Yes" | "No" | "Let AI decide">("Yes");
  const [floors, setFloors] = useState<"Ground" | "Ground + 1" | "Ground + 2" | "3+">("Ground + 1");
  const [orientation, setOrientation] = useState<"North" | "South" | "East" | "West" | "Doesn't matter">("South");
  const [parking, setParking] = useState<"No parking" | "1 car" | "2 cars">("1 car");
  const [style, setStyle] = useState<"Modern" | "Minimal" | "Traditional" | "Luxury" | "Let AI decide">("Modern");
  const [additionalSpaces, setAdditionalSpaces] = useState<string[]>([
    "Kitchen",
    "Dining",
    "Study",
    "Balcony",
  ]);

  // Current step state (1 to 11, and 12 = Brief Summary)
  const [step, setStep] = useState<number>(1);
  const [jumpBackFromSummary, setJumpBackFromSummary] = useState(false);

  // Smart conditional questions:
  // If kids === "0", question 6 ("Separate bedrooms for kids?") is skipped.
  const questionsList = useMemo(() => {
    const list: { id: number; title: string; subtitle: string }[] = [
      { id: 1, title: "Plot Dimensions", subtitle: "Define the site boundary for optimal setbacks and light orientation." },
      { id: 2, title: "Families", subtitle: "How many families or generations will reside here?" },
      { id: 3, title: "Children", subtitle: "How many kids will live in the home?" },
      { id: 4, title: "Bedrooms", subtitle: "Total number of private sleeping suites required." },
      { id: 5, title: "En-suite Bathrooms", subtitle: "How many bedrooms require dedicated attached bathrooms?" },
    ];

    if (kids !== "0") {
      list.push({
        id: 6,
        title: "Children's Quarters",
        subtitle: "Do the children require separate bedrooms or shared suites?",
      });
    }

    list.push(
      { id: 7, title: "Levels & Verticality", subtitle: "How many floors will the residence span?" },
      { id: 8, title: "Solar & Road Orientation", subtitle: "Which cardinal direction is the primary frontage facing?" },
      { id: 9, title: "Vehicular Parking", subtitle: "On-site vehicular capacity requirements." },
      { id: 10, title: "Architectural Language", subtitle: "Preferred materiality, geometry, and stylistic tone." },
      { id: 11, title: "Spatial Program", subtitle: "Select additional specialized living and utility spaces." }
    );

    return list;
  }, [kids]);

  const totalSteps = questionsList.length;
  const currentStepIndex = questionsList.findIndex((q) => q.id === step);
  const progressRatio = (currentStepIndex + 1) / (totalSteps + 1);

  // Navigation handlers
  const handleNext = () => {
    if (jumpBackFromSummary) {
      setStep(12);
      setJumpBackFromSummary(false);
      return;
    }

    const currentIndex = questionsList.findIndex((q) => q.id === step);
    if (currentIndex >= 0 && currentIndex < questionsList.length - 1) {
      setStep(questionsList[currentIndex + 1].id);
    } else {
      setStep(12); // Go to summary
    }
  };

  const handleBack = () => {
    if (step === 12) {
      setStep(questionsList[questionsList.length - 1].id);
      return;
    }

    const currentIndex = questionsList.findIndex((q) => q.id === step);
    if (currentIndex > 0) {
      setStep(questionsList[currentIndex - 1].id);
    } else {
      onClose();
    }
  };

  const jumpToStep = (targetStep: number) => {
    setJumpBackFromSummary(true);
    setStep(targetStep);
  };

  const toggleAdditionalSpace = (space: string) => {
    setAdditionalSpaces((prev) =>
      prev.includes(space) ? prev.filter((s) => s !== space) : [...prev, space]
    );
  };

  // Convert collected brief into canonical IntakeRequest
  const handleFinalGenerate = () => {
    let numFloorsValue = 1;
    if (floors === "Ground + 1") numFloorsValue = 2;
    else if (floors === "Ground + 2") numFloorsValue = 3;
    else if (floors === "3+") numFloorsValue = 4;

    let attachedCount = 1;
    if (attachedBaths === "None") attachedCount = 0;
    else if (attachedBaths === "All") attachedCount = bedrooms;
    else attachedCount = Math.min(bedrooms, parseInt(attachedBaths, 10) || 1);

    const totalBaths = Math.max(attachedCount + 1, 2);

    let roadSide: "north" | "south" | "east" | "west" = "south";
    if (orientation !== "Doesn't matter") {
      roadSide = orientation.toLowerCase() as "north" | "south" | "east" | "west";
    }

    let cars = 0;
    if (parking === "1 car") cars = 1;
    else if (parking === "2 cars") cars = 2;

    const intake: IntakeRequest = {
      plot_width: plotWidth,
      plot_length: plotLength,
      num_floors: numFloorsValue,
      bedrooms: bedrooms,
      bathrooms: totalBaths,
      attached_bathroom_count: attachedCount,
      road_side: roadSide,
      parking_cars: cars,
      style: style === "Let AI decide" ? "Modern Minimalist" : style,
      special_rooms: additionalSpaces,
      open_concept: true,
      vastu_compliant: orientation === "North" || orientation === "East",
    };

    onSubmit(intake);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0A0B0E] text-[#F5F3EF] overflow-hidden select-none">
      {/* 3D Atmospheric Background */}
      <SubtleAtmosphere3D />

      {/* Top Header Bar */}
      <div className="relative z-10 w-full px-8 py-6 flex items-center justify-between border-b border-white/5 bg-[#0A0B0E]/60 backdrop-blur-sm">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 text-xs font-mono tracking-widest text-[#9E9C98] hover:text-[#F5F3EF] transition-colors group"
        >
          <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-1" />
          <span>{step === 1 ? "RETURN TO STUDIO" : "PREVIOUS QUESTION"}</span>
        </button>

        {/* Step Indicator */}
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-mono tracking-widest text-[#9E9C98]">
            {step === 12
              ? "YOUR HOME BRIEF"
              : `CONSULTATION // STEP ${String(currentStepIndex + 1).padStart(2, "0")} OF ${String(
                  totalSteps
                ).padStart(2, "0")}`}
          </span>
        </div>

        <button
          onClick={onClose}
          className="p-2 text-[#9E9C98] hover:text-[#F5F3EF] transition-colors rounded-full hover:bg-white/5"
          title="Exit Consultation"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Hairline Progress Bar */}
      <div className="relative z-10 w-full h-[2px] bg-white/5">
        <motion.div
          className="h-full bg-[#C48446]"
          initial={{ width: 0 }}
          animate={{ width: `${progressRatio * 100}%` }}
          transition={{ duration: 0.35, ease: "easeInOut" }}
        />
      </div>

      {/* Main Consultation Canvas */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 md:px-12 py-8 max-w-4xl mx-auto w-full">
        <AnimatePresence mode="wait">
          {/* QUESTION 1: PLOT SIZE */}
          {step === 1 && (
            <motion.div
              key="step-1"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.28 }}
              className="w-full flex flex-col items-center text-center"
            >
              <span className="text-xs font-mono tracking-widest text-[#C48446] uppercase mb-2">
                01 — SITE BOUNDARY
              </span>
              <h2 className="text-3xl md:text-4xl font-serif font-light tracking-tight text-[#F5F3EF] mb-3">
                What is the size of your plot?
              </h2>
              <p className="text-sm text-[#9E9C98] max-w-md mb-8">
                Exact measurements ensure code-compliant setbacks, natural cross-ventilation, and maximum living envelope.
              </p>

              {/* Visual Plot Ratio Card */}
              <div className="w-full max-w-lg p-6 rounded-2xl bg-[#12141A]/90 border border-white/10 mb-8 backdrop-blur-md">
                <div className="flex items-center justify-between text-xs font-mono text-[#9E9C98] mb-4">
                  <span>TOTAL PLOT AREA</span>
                  <span className="text-[#C48446] font-semibold text-sm">
                    {(plotWidth * plotLength).toLocaleString()} SQ FT
                  </span>
                </div>

                {/* Dimension Inputs */}
                <div className="grid grid-cols-2 gap-6 mb-6">
                  <div className="flex flex-col text-left">
                    <label className="text-[11px] font-mono text-[#9E9C98] mb-1.5">
                      PLOT WIDTH (FEET)
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={25}
                        max={80}
                        value={plotWidth}
                        onChange={(e) => setPlotWidth(Number(e.target.value))}
                        className="flex-1 accent-[#C48446] cursor-pointer"
                      />
                      <span className="font-mono text-lg font-light text-[#F5F3EF] w-12 text-right">
                        {plotWidth}&apos;
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col text-left">
                    <label className="text-[11px] font-mono text-[#9E9C98] mb-1.5">
                      PLOT LENGTH (FEET)
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={30}
                        max={100}
                        value={plotLength}
                        onChange={(e) => setPlotLength(Number(e.target.value))}
                        className="flex-1 accent-[#C48446] cursor-pointer"
                      />
                      <span className="font-mono text-lg font-light text-[#F5F3EF] w-12 text-right">
                        {plotLength}&apos;
                      </span>
                    </div>
                  </div>
                </div>

                {/* Architectural Plot Footprint Preview */}
                <div className="h-28 w-full rounded-xl bg-[#0A0B0E] border border-white/5 flex items-center justify-center p-4">
                  <div
                    style={{
                      width: `${Math.min(180, (plotWidth / 80) * 180)}px`,
                      height: `${Math.min(80, (plotLength / 100) * 80)}px`,
                    }}
                    className="border-2 border-dashed border-[#C48446]/60 bg-[#C48446]/10 rounded flex items-center justify-center transition-all duration-200"
                  >
                    <span className="text-[10px] font-mono text-[#C48446]">
                      {plotWidth}&apos; × {plotLength}&apos;
                    </span>
                  </div>
                </div>
              </div>

              <button
                onClick={handleNext}
                className="px-8 py-3.5 rounded-full bg-[#F5F3EF] text-[#0A0B0E] hover:bg-[#E8E4DC] font-medium text-xs tracking-widest transition-all duration-200 shadow-xl shadow-white/5 flex items-center gap-2 group"
              >
                <span>CONTINUE</span>
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
              </button>
            </motion.div>
          )}

          {/* QUESTION 2: FAMILIES */}
          {step === 2 && (
            <motion.div
              key="step-2"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.28 }}
              className="w-full flex flex-col items-center text-center"
            >
              <span className="text-xs font-mono tracking-widest text-[#C48446] uppercase mb-2">
                02 — HOUSEHOLD CONFIGURATION
              </span>
              <h2 className="text-3xl md:text-4xl font-serif font-light tracking-tight text-[#F5F3EF] mb-3">
                How many families will live here?
              </h2>
              <p className="text-sm text-[#9E9C98] max-w-md mb-10">
                Determines multi-generational zoning, privacy separation, and shared social areas.
              </p>

              <div className="grid grid-cols-3 gap-5 w-full max-w-xl mb-10">
                {(["1", "2", "3+"] as const).map((count) => {
                  const isSelected = families === count;
                  return (
                    <button
                      key={count}
                      onClick={() => {
                        setFamilies(count);
                        if (count === "2" && bedrooms < 4) setBedrooms(4);
                        if (count === "3+" && bedrooms < 5) setBedrooms(5);
                      }}
                      className={`relative p-8 rounded-2xl border text-center transition-all duration-200 flex flex-col items-center justify-center gap-3 ${
                        isSelected
                          ? "bg-[#1A1D24] border-[#C48446] text-[#F5F3EF] shadow-xl shadow-[#C48446]/10 scale-105"
                          : "bg-[#12141A]/80 border-white/10 text-[#9E9C98] hover:border-white/20 hover:text-[#F5F3EF]"
                      }`}
                    >
                      <span className="text-4xl font-serif font-light">{count}</span>
                      <span className="text-xs font-mono tracking-wider uppercase">
                        {count === "1" ? "Single Family" : count === "2" ? "Two Families" : "Multi-Generational"}
                      </span>
                    </button>
                  );
                })}
              </div>

              <button
                onClick={handleNext}
                className="px-8 py-3.5 rounded-full bg-[#F5F3EF] text-[#0A0B0E] hover:bg-[#E8E4DC] font-medium text-xs tracking-widest transition-all duration-200 flex items-center gap-2 group"
              >
                <span>CONTINUE</span>
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
              </button>
            </motion.div>
          )}

          {/* QUESTION 3: KIDS */}
          {step === 3 && (
            <motion.div
              key="step-3"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.28 }}
              className="w-full flex flex-col items-center text-center"
            >
              <span className="text-xs font-mono tracking-widest text-[#C48446] uppercase mb-2">
                03 — RESIDENTS
              </span>
              <h2 className="text-3xl md:text-4xl font-serif font-light tracking-tight text-[#F5F3EF] mb-3">
                How many kids?
              </h2>
              <p className="text-sm text-[#9E9C98] max-w-md mb-10">
                Helps allocate dedicated play areas, study corners, and adjacent family lounges.
              </p>

              <div className="grid grid-cols-4 gap-4 w-full max-w-xl mb-10">
                {(["0", "1", "2", "3+"] as const).map((count) => {
                  const isSelected = kids === count;
                  return (
                    <button
                      key={count}
                      onClick={() => setKids(count)}
                      className={`p-7 rounded-2xl border text-center transition-all duration-200 flex flex-col items-center justify-center gap-2 ${
                        isSelected
                          ? "bg-[#1A1D24] border-[#C48446] text-[#F5F3EF] shadow-xl shadow-[#C48446]/10 scale-105"
                          : "bg-[#12141A]/80 border-white/10 text-[#9E9C98] hover:border-white/20 hover:text-[#F5F3EF]"
                      }`}
                    >
                      <span className="text-3xl font-serif font-light">{count}</span>
                      <span className="text-[11px] font-mono tracking-wider uppercase">
                        {count === "0" ? "None" : count === "1" ? "One Child" : `${count} Children`}
                      </span>
                    </button>
                  );
                })}
              </div>

              <button
                onClick={handleNext}
                className="px-8 py-3.5 rounded-full bg-[#F5F3EF] text-[#0A0B0E] hover:bg-[#E8E4DC] font-medium text-xs tracking-widest transition-all duration-200 flex items-center gap-2 group"
              >
                <span>CONTINUE</span>
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
              </button>
            </motion.div>
          )}

          {/* QUESTION 4: BEDROOMS */}
          {step === 4 && (
            <motion.div
              key="step-4"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.28 }}
              className="w-full flex flex-col items-center text-center"
            >
              <span className="text-xs font-mono tracking-widest text-[#C48446] uppercase mb-2">
                04 — SLEEPING SPACES
              </span>
              <h2 className="text-3xl md:text-4xl font-serif font-light tracking-tight text-[#F5F3EF] mb-3">
                How many bedrooms?
              </h2>
              <p className="text-sm text-[#9E9C98] max-w-md mb-10">
                Select the total number of private suites for the primary suite, guests, and family members.
              </p>

              <div className="grid grid-cols-5 gap-3 w-full max-w-xl mb-10">
                {([1, 2, 3, 4, 5] as const).map((num) => {
                  const isSelected = bedrooms === num;
                  return (
                    <button
                      key={num}
                      onClick={() => setBedrooms(num)}
                      className={`p-6 rounded-2xl border text-center transition-all duration-200 flex flex-col items-center justify-center gap-1.5 ${
                        isSelected
                          ? "bg-[#1A1D24] border-[#C48446] text-[#F5F3EF] shadow-xl shadow-[#C48446]/10 scale-105"
                          : "bg-[#12141A]/80 border-white/10 text-[#9E9C98] hover:border-white/20 hover:text-[#F5F3EF]"
                      }`}
                    >
                      <span className="text-3xl font-serif font-light">{num === 5 ? "5+" : num}</span>
                      <span className="text-[10px] font-mono tracking-wider uppercase">
                        {num === 1 ? "1 Bed" : `${num} Beds`}
                      </span>
                    </button>
                  );
                })}
              </div>

              <button
                onClick={handleNext}
                className="px-8 py-3.5 rounded-full bg-[#F5F3EF] text-[#0A0B0E] hover:bg-[#E8E4DC] font-medium text-xs tracking-widest transition-all duration-200 flex items-center gap-2 group"
              >
                <span>CONTINUE</span>
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
              </button>
            </motion.div>
          )}

          {/* QUESTION 5: ATTACHED BATHROOMS */}
          {step === 5 && (
            <motion.div
              key="step-5"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.28 }}
              className="w-full flex flex-col items-center text-center"
            >
              <span className="text-xs font-mono tracking-widest text-[#C48446] uppercase mb-2">
                05 — EN-SUITE PRIVACY
              </span>
              <h2 className="text-3xl md:text-4xl font-serif font-light tracking-tight text-[#F5F3EF] mb-3">
                How many bedrooms need attached bathrooms?
              </h2>
              <p className="text-sm text-[#9E9C98] max-w-md mb-10">
                Attached en-suites will be directly connected with private internal acoustic buffer doors.
              </p>

              <div className="grid grid-cols-5 gap-3 w-full max-w-2xl mb-10">
                {(["None", "1", "2", "3", "All"] as const).map((opt) => {
                  const isSelected = attachedBaths === opt;
                  return (
                    <button
                      key={opt}
                      onClick={() => setAttachedBaths(opt)}
                      className={`p-6 rounded-2xl border text-center transition-all duration-200 flex flex-col items-center justify-center gap-2 ${
                        isSelected
                          ? "bg-[#1A1D24] border-[#C48446] text-[#F5F3EF] shadow-xl shadow-[#C48446]/10 scale-105"
                          : "bg-[#12141A]/80 border-white/10 text-[#9E9C98] hover:border-white/20 hover:text-[#F5F3EF]"
                      }`}
                    >
                      <span className="text-2xl font-serif font-light">{opt}</span>
                      <span className="text-[10px] font-mono tracking-wider uppercase">
                        {opt === "None" ? "Common Only" : opt === "All" ? "Every Room" : `${opt} En-suite`}
                      </span>
                    </button>
                  );
                })}
              </div>

              <button
                onClick={handleNext}
                className="px-8 py-3.5 rounded-full bg-[#F5F3EF] text-[#0A0B0E] hover:bg-[#E8E4DC] font-medium text-xs tracking-widest transition-all duration-200 flex items-center gap-2 group"
              >
                <span>CONTINUE</span>
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
              </button>
            </motion.div>
          )}

          {/* QUESTION 6: SEPARATE BEDROOMS FOR KIDS (CONDITIONAL) */}
          {step === 6 && kids !== "0" && (
            <motion.div
              key="step-6"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.28 }}
              className="w-full flex flex-col items-center text-center"
            >
              <span className="text-xs font-mono tracking-widest text-[#C48446] uppercase mb-2">
                06 — CHILDREN&apos;S ZONING
              </span>
              <h2 className="text-3xl md:text-4xl font-serif font-light tracking-tight text-[#F5F3EF] mb-3">
                Separate bedrooms for kids?
              </h2>
              <p className="text-sm text-[#9E9C98] max-w-md mb-10">
                Choose whether each child receives an independent private bedroom or a shared twin suite.
              </p>

              <div className="grid grid-cols-3 gap-5 w-full max-w-xl mb-10">
                {(["Yes", "No", "Let AI decide"] as const).map((choice) => {
                  const isSelected = separateKidsBedrooms === choice;
                  return (
                    <button
                      key={choice}
                      onClick={() => setSeparateKidsBedrooms(choice)}
                      className={`p-7 rounded-2xl border text-center transition-all duration-200 flex flex-col items-center justify-center gap-2 ${
                        isSelected
                          ? "bg-[#1A1D24] border-[#C48446] text-[#F5F3EF] shadow-xl shadow-[#C48446]/10 scale-105"
                          : "bg-[#12141A]/80 border-white/10 text-[#9E9C98] hover:border-white/20 hover:text-[#F5F3EF]"
                      }`}
                    >
                      <span className="text-2xl font-serif font-light">{choice}</span>
                      <span className="text-[10px] font-mono tracking-wider uppercase">
                        {choice === "Yes" ? "Individual Rooms" : choice === "No" ? "Shared Bedroom" : "Optimal Solver"}
                      </span>
                    </button>
                  );
                })}
              </div>

              <button
                onClick={handleNext}
                className="px-8 py-3.5 rounded-full bg-[#F5F3EF] text-[#0A0B0E] hover:bg-[#E8E4DC] font-medium text-xs tracking-widest transition-all duration-200 flex items-center gap-2 group"
              >
                <span>CONTINUE</span>
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
              </button>
            </motion.div>
          )}

          {/* QUESTION 7: NUMBER OF FLOORS */}
          {step === 7 && (
            <motion.div
              key="step-7"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.28 }}
              className="w-full flex flex-col items-center text-center"
            >
              <span className="text-xs font-mono tracking-widest text-[#C48446] uppercase mb-2">
                07 — VERTICAL STRUCTURE
              </span>
              <h2 className="text-3xl md:text-4xl font-serif font-light tracking-tight text-[#F5F3EF] mb-3">
                Number of floors?
              </h2>
              <p className="text-sm text-[#9E9C98] max-w-md mb-10">
                Single-story bungalows offer seamless garden access; multi-level residences maximize footprint efficiency.
              </p>

              <div className="grid grid-cols-4 gap-4 w-full max-w-2xl mb-10">
                {(["Ground", "Ground + 1", "Ground + 2", "3+"] as const).map((level) => {
                  const isSelected = floors === level;
                  return (
                    <button
                      key={level}
                      onClick={() => setFloors(level)}
                      className={`p-6 rounded-2xl border text-center transition-all duration-200 flex flex-col items-center justify-center gap-2 ${
                        isSelected
                          ? "bg-[#1A1D24] border-[#C48446] text-[#F5F3EF] shadow-xl shadow-[#C48446]/10 scale-105"
                          : "bg-[#12141A]/80 border-white/10 text-[#9E9C98] hover:border-white/20 hover:text-[#F5F3EF]"
                      }`}
                    >
                      <Layers className={`w-5 h-5 ${isSelected ? "text-[#C48446]" : "text-[#9E9C98]"}`} />
                      <span className="text-xl font-serif font-light">{level}</span>
                      <span className="text-[10px] font-mono tracking-wider uppercase">
                        {level === "Ground" ? "1 Level" : level === "Ground + 1" ? "2 Levels" : level === "Ground + 2" ? "3 Levels" : "4+ Levels"}
                      </span>
                    </button>
                  );
                })}
              </div>

              <button
                onClick={handleNext}
                className="px-8 py-3.5 rounded-full bg-[#F5F3EF] text-[#0A0B0E] hover:bg-[#E8E4DC] font-medium text-xs tracking-widest transition-all duration-200 flex items-center gap-2 group"
              >
                <span>CONTINUE</span>
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
              </button>
            </motion.div>
          )}

          {/* QUESTION 8: HOUSE FACING */}
          {step === 8 && (
            <motion.div
              key="step-8"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.28 }}
              className="w-full flex flex-col items-center text-center"
            >
              <span className="text-xs font-mono tracking-widest text-[#C48446] uppercase mb-2">
                08 — ORIENTATION & ROAD
              </span>
              <h2 className="text-3xl md:text-4xl font-serif font-light tracking-tight text-[#F5F3EF] mb-3">
                Which direction is the house facing?
              </h2>
              <p className="text-sm text-[#9E9C98] max-w-md mb-10">
                Informs foyer placement, daylight optimization in living areas, and Vastu solar balance.
              </p>

              <div className="grid grid-cols-5 gap-3 w-full max-w-2xl mb-10">
                {(["North", "South", "East", "West", "Doesn't matter"] as const).map((dir) => {
                  const isSelected = orientation === dir;
                  return (
                    <button
                      key={dir}
                      onClick={() => setOrientation(dir)}
                      className={`p-6 rounded-2xl border text-center transition-all duration-200 flex flex-col items-center justify-center gap-2 ${
                        isSelected
                          ? "bg-[#1A1D24] border-[#C48446] text-[#F5F3EF] shadow-xl shadow-[#C48446]/10 scale-105"
                          : "bg-[#12141A]/80 border-white/10 text-[#9E9C98] hover:border-white/20 hover:text-[#F5F3EF]"
                      }`}
                    >
                      <Compass className={`w-5 h-5 ${isSelected ? "text-[#C48446]" : "text-[#9E9C98]"}`} />
                      <span className="text-lg font-serif font-light">{dir}</span>
                      <span className="text-[10px] font-mono tracking-wider uppercase">
                        {dir === "Doesn't matter" ? "Any" : `${dir} Entry`}
                      </span>
                    </button>
                  );
                })}
              </div>

              <button
                onClick={handleNext}
                className="px-8 py-3.5 rounded-full bg-[#F5F3EF] text-[#0A0B0E] hover:bg-[#E8E4DC] font-medium text-xs tracking-widest transition-all duration-200 flex items-center gap-2 group"
              >
                <span>CONTINUE</span>
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
              </button>
            </motion.div>
          )}

          {/* QUESTION 9: PARKING */}
          {step === 9 && (
            <motion.div
              key="step-9"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.28 }}
              className="w-full flex flex-col items-center text-center"
            >
              <span className="text-xs font-mono tracking-widest text-[#C48446] uppercase mb-2">
                09 — VEHICULAR ACCESS
              </span>
              <h2 className="text-3xl md:text-4xl font-serif font-light tracking-tight text-[#F5F3EF] mb-3">
                Parking
              </h2>
              <p className="text-sm text-[#9E9C98] max-w-md mb-10">
                Integrated car porches provide direct covered access to the entry foyer while preserving driveway turning radius.
              </p>

              <div className="grid grid-cols-3 gap-5 w-full max-w-xl mb-10">
                {(["No parking", "1 car", "2 cars"] as const).map((opt) => {
                  const isSelected = parking === opt;
                  return (
                    <button
                      key={opt}
                      onClick={() => setParking(opt)}
                      className={`p-8 rounded-2xl border text-center transition-all duration-200 flex flex-col items-center justify-center gap-3 ${
                        isSelected
                          ? "bg-[#1A1D24] border-[#C48446] text-[#F5F3EF] shadow-xl shadow-[#C48446]/10 scale-105"
                          : "bg-[#12141A]/80 border-white/10 text-[#9E9C98] hover:border-white/20 hover:text-[#F5F3EF]"
                      }`}
                    >
                      <Car className={`w-6 h-6 ${isSelected ? "text-[#C48446]" : "text-[#9E9C98]"}`} />
                      <span className="text-2xl font-serif font-light">{opt}</span>
                      <span className="text-[10px] font-mono tracking-wider uppercase">
                        {opt === "No parking" ? "Pedestrian Only" : opt === "1 car" ? "Single Garage" : "Double Carport"}
                      </span>
                    </button>
                  );
                })}
              </div>

              <button
                onClick={handleNext}
                className="px-8 py-3.5 rounded-full bg-[#F5F3EF] text-[#0A0B0E] hover:bg-[#E8E4DC] font-medium text-xs tracking-widest transition-all duration-200 flex items-center gap-2 group"
              >
                <span>CONTINUE</span>
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
              </button>
            </motion.div>
          )}

          {/* QUESTION 10: ARCHITECTURAL STYLE */}
          {step === 10 && (
            <motion.div
              key="step-10"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.28 }}
              className="w-full flex flex-col items-center text-center"
            >
              <span className="text-xs font-mono tracking-widest text-[#C48446] uppercase mb-2">
                10 — DESIGN LANGUAGE
              </span>
              <h2 className="text-3xl md:text-4xl font-serif font-light tracking-tight text-[#F5F3EF] mb-3">
                Preferred architectural style
              </h2>
              <p className="text-sm text-[#9E9C98] max-w-md mb-10">
                Dictates interior finishes, facade textures, glazing expanses, and volumetric proportions.
              </p>

              <div className="grid grid-cols-5 gap-3 w-full max-w-2xl mb-10">
                {(["Modern", "Minimal", "Traditional", "Luxury", "Let AI decide"] as const).map((st) => {
                  const isSelected = style === st;
                  return (
                    <button
                      key={st}
                      onClick={() => setStyle(st)}
                      className={`p-6 rounded-2xl border text-center transition-all duration-200 flex flex-col items-center justify-center gap-2 ${
                        isSelected
                          ? "bg-[#1A1D24] border-[#C48446] text-[#F5F3EF] shadow-xl shadow-[#C48446]/10 scale-105"
                          : "bg-[#12141A]/80 border-white/10 text-[#9E9C98] hover:border-white/20 hover:text-[#F5F3EF]"
                      }`}
                    >
                      <Home className={`w-5 h-5 ${isSelected ? "text-[#C48446]" : "text-[#9E9C98]"}`} />
                      <span className="text-lg font-serif font-light">{st}</span>
                      <span className="text-[10px] font-mono tracking-wider uppercase">
                        {st === "Let AI decide" ? "Contextual" : st}
                      </span>
                    </button>
                  );
                })}
              </div>

              <button
                onClick={handleNext}
                className="px-8 py-3.5 rounded-full bg-[#F5F3EF] text-[#0A0B0E] hover:bg-[#E8E4DC] font-medium text-xs tracking-widest transition-all duration-200 flex items-center gap-2 group"
              >
                <span>CONTINUE</span>
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
              </button>
            </motion.div>
          )}

          {/* QUESTION 11: ADDITIONAL SPACES (MULTI-SELECT) */}
          {step === 11 && (
            <motion.div
              key="step-11"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.28 }}
              className="w-full flex flex-col items-center text-center"
            >
              <span className="text-xs font-mono tracking-widest text-[#C48446] uppercase mb-2">
                11 — SPECIALIZED PROGRAM
              </span>
              <h2 className="text-3xl md:text-4xl font-serif font-light tracking-tight text-[#F5F3EF] mb-3">
                Additional spaces
              </h2>
              <p className="text-sm text-[#9E9C98] max-w-md mb-8">
                Select custom rooms to be synthesized into the floor plan (multi-select).
              </p>

              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3.5 w-full max-w-xl mb-10">
                {[
                  "Kitchen",
                  "Dining",
                  "Pooja room",
                  "Study",
                  "Garden",
                  "Balcony",
                  "Home Theater",
                  "Other",
                ].map((space) => {
                  const isSelected = additionalSpaces.includes(space);
                  return (
                    <button
                      key={space}
                      onClick={() => toggleAdditionalSpace(space)}
                      className={`p-4 rounded-xl border text-center transition-all duration-200 flex items-center justify-between gap-2 ${
                        isSelected
                          ? "bg-[#1A1D24] border-[#C48446] text-[#F5F3EF]"
                          : "bg-[#12141A]/70 border-white/10 text-[#9E9C98] hover:border-white/20"
                      }`}
                    >
                      <span className="text-xs font-medium tracking-wide">{space}</span>
                      <div
                        className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                          isSelected
                            ? "border-[#C48446] bg-[#C48446] text-[#0A0B0E]"
                            : "border-white/20"
                        }`}
                      >
                        {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                      </div>
                    </button>
                  );
                })}
              </div>

              <button
                onClick={handleNext}
                className="px-8 py-3.5 rounded-full bg-[#F5F3EF] text-[#0A0B0E] hover:bg-[#E8E4DC] font-medium text-xs tracking-widest transition-all duration-200 flex items-center gap-2 group"
              >
                <span>REVIEW BRIEF</span>
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
              </button>
            </motion.div>
          )}

          {/* FINAL STEP 12: YOUR HOME BRIEF */}
          {step === 12 && (
            <motion.div
              key="step-12"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.28 }}
              className="w-full max-w-2xl flex flex-col items-center text-center"
            >
              <span className="text-xs font-mono tracking-widest text-[#C48446] uppercase mb-2">
                FINAL BRIEF // ATELIER CONSULTATION
              </span>
              <h2 className="text-3xl md:text-4xl font-serif font-light tracking-tight text-[#F5F3EF] mb-3">
                YOUR HOME BRIEF
              </h2>
              <p className="text-sm text-[#9E9C98] max-w-md mb-8">
                Your bespoke architectural specifications. Tap any item to revise before generation.
              </p>

              {/* Brief Specification Grid */}
              <div className="w-full rounded-2xl bg-[#12141A]/90 border border-white/10 p-6 backdrop-blur-md mb-8 text-left divide-y divide-white/5">
                <div className="flex items-center justify-between py-3">
                  <div>
                    <span className="text-[10px] font-mono tracking-widest text-[#9E9C98] block">01. PLOT BOUNDARY</span>
                    <span className="text-sm font-medium text-[#F5F3EF]">{plotWidth}&apos; × {plotLength}&apos; ({plotWidth * plotLength} SQ FT)</span>
                  </div>
                  <button onClick={() => jumpToStep(1)} className="text-[#C48446] text-xs font-mono flex items-center gap-1 hover:underline">
                    <span>EDIT</span> <Edit3 className="w-3 h-3" />
                  </button>
                </div>

                <div className="flex items-center justify-between py-3">
                  <div>
                    <span className="text-[10px] font-mono tracking-widest text-[#9E9C98] block">02. HOUSEHOLD & KIDS</span>
                    <span className="text-sm font-medium text-[#F5F3EF]">
                      {families} {families === "1" ? "Family" : "Families"} · {kids} {kids === "1" ? "Child" : "Kids"}
                    </span>
                  </div>
                  <button onClick={() => jumpToStep(2)} className="text-[#C48446] text-xs font-mono flex items-center gap-1 hover:underline">
                    <span>EDIT</span> <Edit3 className="w-3 h-3" />
                  </button>
                </div>

                <div className="flex items-center justify-between py-3">
                  <div>
                    <span className="text-[10px] font-mono tracking-widest text-[#9E9C98] block">03. BEDROOM PROGRAM</span>
                    <span className="text-sm font-medium text-[#F5F3EF]">
                      {bedrooms} Bedrooms ({attachedBaths === "All" ? "All Attached Baths" : `${attachedBaths} Attached`})
                    </span>
                  </div>
                  <button onClick={() => jumpToStep(4)} className="text-[#C48446] text-xs font-mono flex items-center gap-1 hover:underline">
                    <span>EDIT</span> <Edit3 className="w-3 h-3" />
                  </button>
                </div>

                <div className="flex items-center justify-between py-3">
                  <div>
                    <span className="text-[10px] font-mono tracking-widest text-[#9E9C98] block">04. ELEVATION & ROAD</span>
                    <span className="text-sm font-medium text-[#F5F3EF]">
                      {floors} · {orientation} Facing · {parking}
                    </span>
                  </div>
                  <button onClick={() => jumpToStep(7)} className="text-[#C48446] text-xs font-mono flex items-center gap-1 hover:underline">
                    <span>EDIT</span> <Edit3 className="w-3 h-3" />
                  </button>
                </div>

                <div className="flex items-center justify-between py-3">
                  <div>
                    <span className="text-[10px] font-mono tracking-widest text-[#9E9C98] block">05. STYLE & SPACES</span>
                    <span className="text-sm font-medium text-[#F5F3EF]">
                      {style} · {additionalSpaces.join(", ")}
                    </span>
                  </div>
                  <button onClick={() => jumpToStep(10)} className="text-[#C48446] text-xs font-mono flex items-center gap-1 hover:underline">
                    <span>EDIT</span> <Edit3 className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Master CTA: GENERATE MY HOME */}
              <button
                onClick={handleFinalGenerate}
                className="w-full py-4 rounded-full bg-[#C48446] text-[#0A0B0E] hover:bg-[#D49354] font-medium text-xs tracking-widest transition-all duration-300 shadow-2xl shadow-[#C48446]/30 flex items-center justify-center gap-2 group uppercase"
              >
                <Sparkles className="w-4 h-4" />
                <span>GENERATE MY HOME</span>
                <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer Details */}
      <div className="relative z-10 w-full px-8 py-4 flex items-center justify-between text-[11px] font-mono text-[#6B6964] border-t border-white/5">
        <span>ARCHITECTURAL INTELLIGENCE CORE // CP-SAT + SHAPELY</span>
        <span>ATELIER ARCHAI v2.0</span>
      </div>
    </div>
  );
};
