"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { PredictiveArcCanvas } from "@designcodeio/threeui";
import {
  Sparkles,
  ArrowRight,
  Compass,
  Layers,
  Eye,
  CheckCircle2,
  ShieldCheck,
  Upload,
} from "lucide-react";

interface HomePageViewProps {
  scrollRoot: React.RefObject<HTMLDivElement | null>;
  navbar?: React.ReactNode;
  onStartDesign: () => void;
  onOpenPlanMode: () => void;
  onOpenModelMode: () => void;
  onOpenUpload: () => void;
  onSelectPreset: (preset: {
    title: string;
    plot_width: number;
    plot_length: number;
    num_floors: number;
    bedrooms: number;
    bathrooms: number;
    style: string;
  }) => void;
}

export const HomePageView: React.FC<HomePageViewProps> = ({
  scrollRoot,
  navbar,
  onStartDesign,
  onOpenPlanMode,
  onOpenModelMode,
  onOpenUpload,
  onSelectPreset,
}) => {
  const reducedMotion = useReducedMotion();
  const [isCompactViewport, setIsCompactViewport] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const compactViewport = window.matchMedia("(max-width: 767px)");
    const updateViewport = () => setIsCompactViewport(compactViewport.matches);

    updateViewport();
    compactViewport.addEventListener("change", updateViewport);
    return () => compactViewport.removeEventListener("change", updateViewport);
  }, []);

  const { scrollYProgress: heroScrollProgress } = useScroll({
    container: scrollRoot,
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const heroScale = useTransform(heroScrollProgress, [0, 1], [1, isCompactViewport ? 0.985 : 0.97]);
  const heroContentOpacity = useTransform(heroScrollProgress, [0, 0.2, 0.5, 1], [1, 0.78, 0, 0]);
  const heroOverlayOpacity = useTransform(heroScrollProgress, [0, 0.25, 0.7, 1], [0, 0.16, 0.62, 0.88]);

  return (
    <div className="relative isolate w-full min-h-screen bg-[#030303] text-[#F5F5F5] overflow-x-clip selection:bg-[#2563EB]/40 selection:text-white">
      {/* ────────────────────────────────────────────────────────
          LAYER 0: EXACT THREEUI SIGNAL PARTICLES BACKGROUND
          Fixed atmospheric canvas sitting behind all Home UI
          ──────────────────────────────────────────────────────── */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <PredictiveArcCanvas
          variant="signal-particles"
          mode="dark"
          speed={1.0}
          hue={0}
          saturation={1.0}
          brightness={1.0}
        />
        {/* Soft Vignette Overlay to integrate with deep dark space */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(3,3,3,0.3)_45%,rgba(3,3,3,0.85)_100%)]" />
      </div>

      {/* ────────────────────────────────────────────────────────
          LAYER 1: RESTRAINED AMBIENT STUDIO LIGHTING
          ──────────────────────────────────────────────────────── */}
      <div className="pointer-events-none fixed inset-0 z-[1] overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[55vw] h-[55vw] rounded-full bg-[radial-gradient(circle,rgba(37,99,235,0.07)_0%,transparent_70%)] blur-[120px]" />
        <div className="absolute top-[25%] right-[-15%] w-[50vw] h-[50vw] rounded-full bg-[radial-gradient(circle,rgba(139,92,246,0.045)_0%,transparent_70%)] blur-[140px]" />
        <div className="absolute top-[65%] left-[10%] w-[60vw] h-[60vw] rounded-full bg-[radial-gradient(circle,rgba(214,184,120,0.035)_0%,transparent_70%)] blur-[130px]" />
      </div>

      {/* ────────────────────────────────────────────────────────
          LAYER 2: FOREGROUND CONTENT & STORYTELLING
          ──────────────────────────────────────────────────────── */}
      <div className="relative z-10">

        {/* ── 1. CINEMATIC HERO SECTION ── */}
        <div className="relative h-[200svh]">
        <div
          ref={heroRef}
          aria-hidden="true"
          className="absolute top-0 left-0 h-[100svh] w-px pointer-events-none"
        />
        <motion.section
          style={reducedMotion ? undefined : { scale: heroScale }}
          className="sticky top-0 z-0 h-[100svh] min-h-screen w-full overflow-hidden border-b border-white/5"
        >
          <motion.div
            style={reducedMotion ? undefined : { opacity: heroContentOpacity }}
            className="relative z-20 flex min-h-full w-full flex-col justify-between"
          >
            {navbar && (
              <div className="absolute inset-x-0 top-2 sm:top-4 z-30">
                {navbar}
              </div>
            )}

            {/* Top spacer for floating navbar */}
            <div className="w-full h-24 sm:h-28 relative z-20 pointer-events-none" />

            {/* Hero Content */}
            <div className="relative z-20 max-w-5xl mx-auto px-6 md:px-12 text-center flex flex-col items-center my-auto pointer-events-auto">
              {/* Monospace Architectural Badge */}
              <motion.div
                initial={reducedMotion ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reducedMotion ? 0 : 0.7, ease: [0.23, 1, 0.32, 1] }}
                className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-[rgba(8,15,28,0.7)] border border-[rgba(96,165,250,0.22)] text-[10px] sm:text-[11px] font-mono tracking-[0.24em] text-[#93C5FD] mb-6 uppercase shadow-[0_0_25px_rgba(37,99,235,0.18)] backdrop-blur-xl"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#06B6D4] shadow-[0_0_8px_#06B6D4] animate-pulse" />
                <span>COMPUTATIONAL ARCHITECTURAL ATELIER</span>
              </motion.div>

              {/* Editorial Instrument Serif Headline */}
              <motion.h1
                initial={reducedMotion ? false : { opacity: 0, y: 22 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reducedMotion ? 0 : 0.85, delay: reducedMotion ? 0 : 0.1, ease: [0.23, 1, 0.32, 1] }}
                className="text-5xl sm:text-7xl md:text-8xl lg:text-[7.2rem] font-serif font-light tracking-[-0.04em] text-[#F4F1EA] leading-[0.92] mb-7 drop-shadow-[0_10px_35px_rgba(0,0,0,0.7)]"
              >
                YOUR HOME. <br />
                <span className="italic font-normal text-[#DED8F0] drop-shadow-[0_0_36px_rgba(139,92,246,0.16)]">
                  DESIGNED INTELLIGENTLY.
                </span>
              </motion.h1>

              {/* Inter Body Statement */}
              <motion.p
                initial={reducedMotion ? false : { opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reducedMotion ? 0 : 0.8, delay: reducedMotion ? 0 : 0.2, ease: [0.23, 1, 0.32, 1] }}
                className="text-sm sm:text-base md:text-lg text-[rgba(255,255,255,0.64)] font-light max-w-2xl mx-auto mb-10 leading-relaxed drop-shadow-md"
              >
                An avant-garde residential studio synthesizing plot physics, daylight azimuths, and bespoke living
                rituals into verified architectural blueprints and cinematic 3D models.
              </motion.p>

              {/* Unified CTA Actions */}
              <motion.div
                initial={reducedMotion ? false : { opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reducedMotion ? 0 : 0.8, delay: reducedMotion ? 0 : 0.3, ease: [0.23, 1, 0.32, 1] }}
                className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto"
              >
                <button
                  onClick={onStartDesign}
                  className="w-full sm:w-auto px-8 py-4 rounded-full btn-primary-blue font-medium text-xs tracking-[0.2em] uppercase flex items-center justify-center gap-2 group cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>CREATE YOUR HOME</span>
                  <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
                </button>

                <button
                  onClick={onOpenModelMode}
                  className="w-full sm:w-auto px-8 py-4 rounded-full btn-secondary-glass font-medium text-xs tracking-[0.2em] uppercase flex items-center justify-center gap-2 cursor-pointer shadow-[0_0_25px_rgba(139,92,246,0.06)]"
                >
                  <Eye className="w-3.5 h-3.5 text-[#60A5FA]" />
                  <span>EXPLORE 3D MODEL</span>
                </button>
              </motion.div>
            </div>

            {/* Hero Bottom Metadata Row */}
            <div className="relative z-20 w-full px-6 sm:px-10 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-[10px] sm:text-[11px] font-mono text-[rgba(255,255,255,0.38)] border-t border-white/5 bg-[rgba(3,3,3,0.4)] backdrop-blur-md">
              <div className="flex items-center gap-3">
                <span className="w-2 h-2 rounded-full bg-[linear-gradient(135deg,#2563EB,#06B6D4)] shadow-[0_0_8px_#06B6D4] animate-pulse" />
                <span>AI HOUSE // RESIDENTIAL SYNTHESIS CORE</span>
              </div>

              <button
                onClick={onOpenUpload}
                className="flex items-center gap-2 text-[rgba(255,255,255,0.64)] hover:text-[#60A5FA] transition-colors cursor-pointer group"
              >
                <Upload className="w-3.5 h-3.5 text-[#60A5FA] transition-transform group-hover:-translate-y-0.5" />
                <span>HAVE A SKETCH OR PLAN? UPLOAD TO 3D</span>
              </button>
            </div>
          </motion.div>

          <motion.div
            aria-hidden="true"
            style={reducedMotion ? undefined : { opacity: heroOverlayOpacity }}
            className="pointer-events-none absolute inset-0 z-10 bg-[linear-gradient(135deg,rgba(3,3,3,0.78)_0%,rgba(37,99,235,0.42)_55%,rgba(6,182,212,0.28)_100%)]"
          />
        </motion.section>
        </div>

        {/* ── 2. ARCHITECTURAL JOURNEY ── */}
        <section className="relative z-10 -mt-[100svh] w-full bg-[rgba(3,3,3,0.96)] py-20 sm:py-28 px-4 sm:px-8 md:px-16 overflow-hidden">
          {/* Section Header */}
          <motion.div className="max-w-4xl mx-auto text-center mb-16">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[rgba(214,184,120,0.08)] border border-[rgba(214,184,120,0.18)] text-[10px] font-mono tracking-[0.24em] text-[#D6B878] uppercase mb-4">
              ARCHITECTURAL JOURNEY
            </span>
            <h2 className="text-3xl sm:text-5xl md:text-6xl font-serif font-light text-[#F5F5F5] leading-tight">
              From ritual to built structure.
            </h2>
            <p className="text-sm sm:text-base text-[rgba(255,255,255,0.64)] font-light mt-3 max-w-xl mx-auto">
              Explore the architectural intelligence powering every bespoke residence.
            </p>
          </motion.div>

          {/* Sequential Architectural Presentation Deck */}
          <div className="relative max-w-6xl mx-auto space-y-12 sm:space-y-16">

            {/* ══ CARD 1: PHILOSOPHY // 01 ══ */}
            <motion.div
              className="relative w-full rounded-[24px] sm:rounded-[36px] p-6 sm:p-10 md:p-12 bg-[#0B0D10]/95 border border-[rgba(214,184,120,0.18)] shadow-[0_24px_70px_rgba(0,0,0,0.75)] backdrop-blur-[24px] flex flex-col justify-between overflow-hidden transition-all duration-300 hover:border-[rgba(214,184,120,0.35)]"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-6">
                <span className="text-xs font-mono tracking-[0.22em] text-[#D6B878] uppercase font-semibold">
                  PHILOSOPHY // 01
                </span>
                <span className="text-[10px] font-mono text-[rgba(255,255,255,0.38)] tracking-widest">
                  DECK ITEM 1 OF 5
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-14 items-center my-auto">
                <div>
                  <h3 className="text-3xl sm:text-5xl font-serif font-light text-[#F5F5F5] leading-tight mb-5">
                    From idea to architecture.
                  </h3>
                  <p className="text-sm sm:text-base text-[rgba(255,255,255,0.64)] font-light leading-relaxed mb-6">
                    Traditional residential planning begins with static drafts and disconnected spreadsheets.
                    We reverse the workflow: your family’s spatial rituals, daylight requirements, and site constraints
                    synthesize a verified architectural model from the initial brief.
                  </p>
                  <div className="grid grid-cols-2 gap-6 pt-5 border-t border-white/10 text-xs font-mono text-[rgba(255,255,255,0.64)]">
                    <div>
                      <span className="text-2xl font-serif text-[#F5F5F5] block mb-1">Zero Overlaps</span>
                      <span className="text-[11px] leading-relaxed block text-[rgba(255,255,255,0.48)]">
                        CP-SAT mathematical spatial topology guarantees valid geometry.
                      </span>
                    </div>
                    <div>
                      <span className="text-2xl font-serif text-[#F5F5F5] block mb-1">Code Compliant</span>
                      <span className="text-[11px] leading-relaxed block text-[rgba(255,255,255,0.48)]">
                        Automated setback buffers and egress clearances embedded.
                      </span>
                    </div>
                  </div>
                </div>

                <motion.div className="relative aspect-[4/3] rounded-2xl overflow-hidden border border-white/10 bg-[#05070B] shadow-2xl">
                  <img
                    src="https://images.unsplash.com/photo-1600585154340-be6161a56a0c?q=80&w=1200&auto=format&fit=crop"
                    alt="Architectural Craftsmanship"
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover grayscale contrast-125 hover:scale-105 transition-transform duration-700"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0A0E1A] via-transparent to-transparent" />
                  <div className="absolute bottom-5 left-5 right-5 flex items-center justify-between text-xs font-mono text-[#F5F5F5]">
                    <span className="text-[#D6B878]">RESIDENTIAL STUDY // LOT 42</span>
                    <span className="text-[rgba(255,255,255,0.5)]">SCANDINAVIAN MODERN</span>
                  </div>
                </motion.div>
              </div>

              <div className="pt-4 border-t border-white/10 flex items-center justify-between text-[11px] font-mono text-[rgba(255,255,255,0.7)] bg-[#070D1A] px-4 py-2 -mx-4 -mb-4 sm:-mx-8 sm:-mb-8 md:-mx-12 md:-mb-12 rounded-b-[28px] sm:rounded-b-[36px]">
                <span className="text-[#D6B878] font-semibold">01 // PHILOSOPHY</span>
                <span className="text-[rgba(255,255,255,0.45)]">DATUM REF ±0.000M</span>
              </div>
            </motion.div>

            {/* ══ CARD 2: PRECISION // 02 ══ */}
            <motion.div
              className="relative w-full rounded-[24px] sm:rounded-[36px] p-6 sm:p-10 md:p-12 bg-[#0B0D10]/95 border border-[rgba(96,165,250,0.18)] shadow-[0_24px_70px_rgba(0,0,0,0.75)] backdrop-blur-[24px] flex flex-col justify-between overflow-hidden transition-all duration-300 hover:border-[rgba(96,165,250,0.35)]"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-6">
                <span className="text-xs font-mono tracking-[0.22em] text-[#D6B878] uppercase font-semibold">
                  PRECISION // 02
                </span>
                <span className="text-[10px] font-mono text-[rgba(255,255,255,0.38)] tracking-widest">
                  DECK ITEM 2 OF 5
                </span>
              </div>

              <div className="my-auto">
                <div className="max-w-2xl mb-10">
                  <h3 className="text-3xl sm:text-5xl font-serif font-light text-[#F5F5F5] mb-3">
                    Design every detail.
                  </h3>
                  <p className="text-sm sm:text-base text-[rgba(255,255,255,0.64)] font-light leading-relaxed">
                    From solar sill heights that harvest morning radiance to en-suite acoustic buffers and vertical engineering shafts.
                  </p>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-6">
                  <div className="p-4 sm:p-8 rounded-2xl bg-[rgba(18,17,14,0.68)] border border-white/10 hover:border-[rgba(214,184,120,0.38)] transition-colors duration-300">
                    <Compass className="w-6 h-6 text-[#D6B878] mb-5" />
                    <h4 className="text-xl font-serif text-[#F5F5F5] mb-2">Solar Orientation</h4>
                    <p className="text-xs sm:text-sm text-[rgba(255,255,255,0.64)] font-light leading-relaxed">
                      Orient living spaces to daylight while keeping bedrooms naturally shaded.
                    </p>
                  </div>

                  <div className="p-4 sm:p-8 rounded-2xl bg-[rgba(15,13,20,0.68)] border border-white/10 hover:border-[rgba(167,139,250,0.34)] transition-colors duration-300">
                    <Layers className="w-6 h-6 text-[#A78BFA] mb-5" />
                    <h4 className="text-xl font-serif text-[#F5F5F5] mb-2">Acoustic Zoning</h4>
                    <p className="text-xs sm:text-sm text-[rgba(255,255,255,0.64)] font-light leading-relaxed">
                      Buffer quiet bedrooms from kitchens and shared spaces with vestibules.
                    </p>
                  </div>

                  <div className="p-4 sm:p-8 rounded-2xl bg-[rgba(18,17,14,0.68)] border border-white/10 hover:border-[rgba(214,184,120,0.38)] transition-colors duration-300">
                    <ShieldCheck className="w-6 h-6 text-[#D6B878] mb-5" />
                    <h4 className="text-xl font-serif text-[#F5F5F5] mb-2">Structural Integrity</h4>
                    <p className="text-xs sm:text-sm text-[rgba(255,255,255,0.64)] font-light leading-relaxed">
                      Align columns and service shafts across floors for buildable, efficient homes.
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-white/10 flex items-center justify-between text-[11px] font-mono text-[rgba(255,255,255,0.7)] bg-[#070D1A] px-4 py-2 -mx-4 -mb-4 sm:-mx-8 sm:-mb-8 md:-mx-12 md:-mb-12 rounded-b-[28px] sm:rounded-b-[36px]">
                <span className="text-[#38BDF8] font-semibold">02 // PRECISION</span>
                <span className="text-[rgba(255,255,255,0.45)]">SOLAR HARMONY</span>
              </div>
            </motion.div>

            {/* ══ CARD 3: INTELLIGENCE // 03 ══ */}
            <motion.div
              className="relative w-full rounded-[24px] sm:rounded-[36px] p-6 sm:p-10 md:p-12 bg-[#0B0D10]/95 border border-[rgba(167,139,250,0.18)] shadow-[0_24px_70px_rgba(0,0,0,0.75)] backdrop-blur-[24px] flex flex-col justify-between overflow-hidden transition-all duration-300 hover:border-[rgba(167,139,250,0.35)]"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-6">
                <span className="text-xs font-mono tracking-[0.22em] text-[#06B6D4] uppercase font-semibold">
                  INTELLIGENCE // 03
                </span>
                <span className="text-[10px] font-mono text-[rgba(255,255,255,0.38)] tracking-widest">
                  DECK ITEM 3 OF 5
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-14 items-center my-auto">
                <motion.div className="relative aspect-[4/3] rounded-2xl overflow-hidden border border-white/10 bg-[#05070B] shadow-2xl order-2 lg:order-1">
                  <img
                    src="https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?q=80&w=1200&auto=format&fit=crop"
                    alt="Floor plan geometry"
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover contrast-115"
                  />
                  <div className="absolute inset-0 bg-[#030303]/35" />
                  <div className="absolute top-5 left-5 px-3 py-1.5 rounded-full bg-[#101216]/90 border border-[rgba(167,139,250,0.22)] text-[10px] font-mono text-[#A78BFA]">
                    TOPOLOGY SOLVER // SHAPELY + NETWORKX
                  </div>
                </motion.div>

                <div className="order-1 lg:order-2">
                  <h3 className="text-3xl sm:text-5xl font-serif font-light text-[#F5F5F5] leading-tight mb-5">
                    AI-powered architectural planning.
                  </h3>
                  <p className="text-sm sm:text-base text-[rgba(255,255,255,0.64)] font-light leading-relaxed mb-6">
                    Unlike standard generative models that fabricate hallucinatory images, our architectural engine solves authentic structural constraint systems:
                    graph adjacency, corridor clearances, boundary setbacks, and door physics.
                  </p>
                  <ul className="space-y-3.5 text-xs sm:text-sm text-[rgba(255,255,255,0.64)] font-light">
                    <li className="flex items-center gap-3">
                      <CheckCircle2 className="w-4 h-4 text-[#A78BFA] shrink-0" />
                      <span>Deterministic constraint-satisfaction (Google OR-Tools CP-SAT)</span>
                    </li>
                    <li className="flex items-center gap-3">
                      <CheckCircle2 className="w-4 h-4 text-[#A78BFA] shrink-0" />
                      <span>Real-time mathematical room scoring and circulation analysis</span>
                    </li>
                    <li className="flex items-center gap-3">
                      <CheckCircle2 className="w-4 h-4 text-[#A78BFA] shrink-0" />
                      <span>Export-ready 2D blueprint vectors and Three.js 3D meshes</span>
                    </li>
                  </ul>
                </div>
              </div>

              <div className="pt-4 border-t border-white/10 flex items-center justify-between text-[11px] font-mono text-[rgba(255,255,255,0.7)] bg-[#070D1A] px-4 py-2 -mx-4 -mb-4 sm:-mx-8 sm:-mb-8 md:-mx-12 md:-mb-12 rounded-b-[28px] sm:rounded-b-[36px]">
                <span className="text-[#A78BFA] font-semibold">03 // INTELLIGENCE</span>
                <span className="text-[rgba(255,255,255,0.45)]">CP-SAT SOLVER</span>
              </div>
            </motion.div>

            {/* ══ CARD 4: IMMERSION // 04 ══ */}
            <motion.div
              className="relative w-full rounded-[24px] sm:rounded-[36px] p-6 sm:p-10 md:p-12 bg-[#0B0D10]/95 border border-[rgba(120,168,135,0.18)] shadow-[0_24px_70px_rgba(0,0,0,0.75)] backdrop-blur-[24px] flex flex-col justify-between overflow-hidden transition-all duration-300 hover:border-[rgba(120,168,135,0.35)]"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-6">
                <span className="text-xs font-mono tracking-[0.22em] text-[#78A887] uppercase font-semibold">
                  IMMERSION // 04
                </span>
                <span className="text-[10px] font-mono text-[rgba(255,255,255,0.38)] tracking-widest">
                  DECK ITEM 4 OF 5
                </span>
              </div>

              <div className="my-auto flex flex-col items-center text-center">
                <h3 className="text-3xl sm:text-5xl font-serif font-light text-[#F5F5F5] mb-3">
                  Explore your home in 3D.
                </h3>
                <p className="text-sm sm:text-base text-[rgba(255,255,255,0.64)] font-light max-w-xl mb-8">
                  Orbit your residence as an architectural dollhouse, inspect cutaway elevations floor by floor,
                  and study daylight through real shadow calculations.
                </p>

                <motion.div className="w-full max-w-4xl h-72 sm:h-96 rounded-2xl border border-white/10 overflow-hidden relative group bg-[#05070B] shadow-2xl">
                  <img
                    src="https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?q=80&w=1600&auto=format&fit=crop"
                    alt="3D Architectural Dollhouse View"
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                  />
                  <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                    <button
                      onClick={onOpenModelMode}
                      className="px-8 py-3.5 rounded-full btn-primary-blue font-medium text-xs tracking-widest uppercase flex items-center gap-2 cursor-pointer shadow-2xl"
                    >
                      <Eye className="w-4 h-4" />
                      <span>LAUNCH 3D VIEWER</span>
                    </button>
                  </div>
                </motion.div>
              </div>

              <div className="pt-4 border-t border-white/10 flex items-center justify-between text-[11px] font-mono text-[rgba(255,255,255,0.7)] bg-[#070D1A] px-4 py-2 -mx-4 -mb-4 sm:-mx-8 sm:-mb-8 md:-mx-12 md:-mb-12 rounded-b-[28px] sm:rounded-b-[36px]">
                <span className="text-[#78A887] font-semibold">04 // IMMERSION</span>
                <span className="text-[rgba(255,255,255,0.45)]">3D DOLLHOUSE</span>
              </div>
            </motion.div>

            {/* ══ CARD 5: TYPOLOGIES // 05 ══ */}
            <motion.div
              className="relative w-full rounded-[24px] sm:rounded-[36px] p-6 sm:p-10 md:p-12 bg-[#0B0D10]/95 border border-[rgba(214,184,120,0.18)] shadow-[0_24px_70px_rgba(0,0,0,0.75)] backdrop-blur-[24px] flex flex-col justify-between overflow-hidden transition-all duration-300 hover:border-[rgba(214,184,120,0.35)]"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-6">
                <span className="text-xs font-mono tracking-[0.22em] text-[#D6B878] uppercase font-semibold">
                  TYPOLOGIES // 05
                </span>
                <span className="text-[10px] font-mono text-[rgba(255,255,255,0.38)] tracking-widest">
                  DECK ITEM 5 OF 5
                </span>
              </div>

              <div className="my-auto">
                <div className="flex flex-col md:flex-row items-start md:items-end justify-between mb-8 gap-4">
                  <div>
                    <h3 className="text-3xl sm:text-5xl font-serif font-light text-[#F5F5F5] mb-2">
                      Curated architectural typologies.
                    </h3>
                    <p className="text-xs sm:text-sm text-[rgba(255,255,255,0.64)] font-light">
                      Click any typology to load its architectural solver parameters instantly.
                    </p>
                  </div>
                  <button
                    onClick={onStartDesign}
                    className="text-xs font-mono tracking-widest text-[#D6B878] hover:text-[#F4F1EA] transition-colors flex items-center gap-2 group cursor-pointer"
                  >
                    <span>CREATE BESPOKE HOME</span>
                    <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
                  </button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
                  {[
                    {
                      title: "Nordic Courtyard Residence",
                      size: "40' × 60'",
                      area: "2,400 SQ FT",
                      img: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?q=80&w=800&auto=format&fit=crop",
                      intake: {
                        title: "Nordic Courtyard Residence",
                        plot_width: 40,
                        plot_length: 60,
                        num_floors: 2,
                        bedrooms: 3,
                        bathrooms: 2,
                        style: "Modern Scandinavian",
                      },
                    },
                    {
                      title: "Contemporary Glass Pavilion",
                      size: "48' × 54'",
                      area: "1,950 SQ FT",
                      img: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?q=80&w=800&auto=format&fit=crop",
                      intake: {
                        title: "Contemporary Glass Pavilion",
                        plot_width: 48,
                        plot_length: 54,
                        num_floors: 1,
                        bedrooms: 3,
                        bathrooms: 2,
                        style: "Modern Contemporary",
                      },
                    },
                    {
                      title: "The Cedar Cantilever Villa",
                      size: "45' × 65'",
                      area: "3,100 SQ FT",
                      img: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?q=80&w=800&auto=format&fit=crop",
                      intake: {
                        title: "The Cedar Cantilever Villa",
                        plot_width: 45,
                        plot_length: 65,
                        num_floors: 2,
                        bedrooms: 4,
                        bathrooms: 3,
                        style: "Minimalist Modern",
                      },
                    },
                  ].map((p, idx) => (
                    <div
                      key={idx}
                      onClick={() => onSelectPreset(p.intake)}
                      className="group cursor-pointer flex flex-col p-3 rounded-2xl bg-[rgba(15,15,14,0.72)] border border-white/10 hover:border-[rgba(214,184,120,0.4)] hover:bg-[rgba(20,19,16,0.86)] transition-all duration-300 hover:-translate-y-1"
                    >
                      <div className="relative aspect-[4/3] rounded-xl overflow-hidden mb-3 border border-white/8 bg-[#05070B]">
                        <img
                          src={p.img}
                          alt={p.title}
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                          <span className="text-[10px] font-mono tracking-widest text-[#F5F5F5]">
                            LOAD MODEL →
                          </span>
                        </div>
                      </div>
                      <h4 className="text-base font-serif text-[#F4F1EA] mb-1 group-hover:text-[#D6B878] transition-colors">
                        {p.title}
                      </h4>
                      <span className="text-xs font-mono text-[rgba(255,255,255,0.62)]">
                        {p.size} · {p.area}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-white/10 flex items-center justify-between text-[11px] font-mono text-[rgba(255,255,255,0.7)] bg-[#070D1A] px-4 py-2 -mx-4 -mb-4 sm:-mx-8 sm:-mb-8 md:-mx-12 md:-mb-12 rounded-b-[28px] sm:rounded-b-[36px]">
                <span className="text-[#D6B878] font-semibold">05 // TYPOLOGIES</span>
                <span className="text-[rgba(255,255,255,0.45)]">DECK COMPLETE · 5 OF 5</span>
              </div>
            </motion.div>

          </div>
        </section>

        {/* ── 3. FINAL CALL-TO-ACTION SECTION ── */}
        <section className="relative w-full py-36 px-6 md:px-16 border-t border-white/5 bg-transparent text-center overflow-hidden">
          <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_48%_38%,rgba(139,92,246,0.055)_0%,transparent_55%),radial-gradient(ellipse_at_75%_72%,rgba(214,184,120,0.045)_0%,transparent_48%),radial-gradient(ellipse_at_24%_70%,rgba(37,99,235,0.035)_0%,transparent_52%)]" />

          <motion.div className="relative z-10 max-w-3xl mx-auto flex flex-col items-center">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[rgba(214,184,120,0.08)] border border-[rgba(214,184,120,0.18)] text-[10px] font-mono tracking-[0.24em] text-[#D6B878] uppercase mb-5">
              BEGIN CONSULTATION
            </span>

            <motion.h2 className="text-4xl sm:text-6xl md:text-7xl font-serif font-light text-[#F4F1EA] mb-6 tracking-tight leading-tight">
              Ready to design your residence?
            </motion.h2>

            <motion.p className="text-sm sm:text-base text-[rgba(255,255,255,0.64)] font-light max-w-lg mb-10 leading-relaxed">
              Start the step-by-step architectural consultation and experience your future home generated in minutes.
            </motion.p>

            <motion.button
              onClick={onStartDesign}
              className="px-10 py-4.5 rounded-full btn-primary-blue font-medium text-xs tracking-widest uppercase flex items-center gap-2 group cursor-pointer shadow-[0_15px_40px_rgba(37,99,235,0.35)]"
            >
              <Sparkles className="w-4 h-4" />
              <span>CREATE YOUR HOME</span>
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </motion.button>
          </motion.div>
        </section>

      </div>
    </div>
  );
};
