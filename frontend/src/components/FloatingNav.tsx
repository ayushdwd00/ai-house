"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

export type NavView =
  | "home"
  | "plan"
  | "model"
  | "structure"
  | "estimate"
  | "create"
  | "projects"
  | "edit";

interface FloatingNavProps {
  currentView: NavView;
  onNavigate: (view: NavView) => void;
  isProjectWorkspace?: boolean;
  hasProject?: boolean;
  onOpenProjects?: () => void;
  onOpenVastuAudit?: () => void;
  hasVastuResult?: boolean;
  isPlanEditMode?: boolean;
  onTogglePlanEditMode?: () => void;
  placement?: "fixed" | "flow";
}

// ============================================================
// BLUE FLOATING GLASS NAVBAR (REFERENCE 2)
// ============================================================
export const FloatingNav: React.FC<FloatingNavProps> = ({
  currentView,
  onNavigate,
  isProjectWorkspace = false,
  hasProject = false,
  onOpenProjects,
  onOpenVastuAudit,
  isPlanEditMode = false,
  onTogglePlanEditMode,
  placement = "fixed",
}) => {
  const [isVisible, setIsVisible] = useState(true);
  const [isScrolled, setIsScrolled] = useState(false);
  const [tilt, setTilt] = useState({ rotateX: 0, rotateY: 0 });
  const navRef = useRef<HTMLElement>(null);
  const scrollPositions = useRef(new WeakMap<object, number>());

  // Track scroll position & visibility
  useEffect(() => {
    const handleScroll = (event: Event) => {
      const target = event.target;
      const scrollElement =
        target instanceof HTMLElement &&
        target !== document.body &&
        target !== document.documentElement &&
        target.scrollHeight > target.clientHeight
          ? target
          : null;
      const source: object = scrollElement || window;
      const scrollPosition = scrollElement
        ? scrollElement.scrollTop
        : window.scrollY || document.documentElement.scrollTop;
      const previousPosition = scrollPositions.current.get(source) ?? scrollPosition;

      setIsScrolled(scrollPosition > 24);
      setIsVisible(true);
      scrollPositions.current.set(source, scrollPosition);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    document.addEventListener("scroll", handleScroll, { capture: true, passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      document.removeEventListener("scroll", handleScroll, true);
    };
  }, [placement]);

  // Subtle 3D physical glass tilt (1-2 deg max)
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLElement>) => {
    if (!navRef.current) return;
    const rect = navRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    // Bound tilt to maximum 1.4 degrees
    const rotateY = ((x - centerX) / centerX) * 1.4;
    const rotateX = -((y - centerY) / centerY) * 1.4;
    setTilt({ rotateX, rotateY });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setTilt({ rotateX: 0, rotateY: 0 });
  }, []);

  // Navigation Items
  const projectNavItems: { id: NavView; label: string }[] = [
    { id: "home", label: "HOME" },
    { id: "plan", label: "PLAN" },
    { id: "model", label: "MODEL" },
    { id: "structure", label: "STRUCTURE" },
    { id: "estimate", label: "ESTIMATE" },
  ];

  const homeNavItems: { id: NavView; label: string }[] = [
    { id: "home", label: "HOME" },
    { id: "plan", label: "PLAN" },
    { id: "model", label: "MODEL" },
    { id: "structure", label: "STRUCTURE" },
    { id: "estimate", label: "ESTIMATE" },
    { id: "projects", label: "PROJECTS" },
  ];

  const navItems = isProjectWorkspace ? projectNavItems : homeNavItems;

  const handleNavClick = (id: NavView) => {
    if (id === "projects" && onOpenProjects) {
      onOpenProjects();
    } else {
      onNavigate(id);
    }
  };

  const renderEditModeToggle = () => (
    <button
      type="button"
      onClick={onTogglePlanEditMode}
      aria-label={isPlanEditMode ? "Exit Edit Mode" : "Enter Edit Mode"}
      aria-pressed={isPlanEditMode}
      title={isPlanEditMode ? "Exit Edit Mode" : "Enter Edit Mode"}
      className={`flex shrink-0 items-center justify-center whitespace-nowrap px-2.5 py-1.5 rounded-full transition-all text-[10px] tracking-[0.16em] font-mono ${
        isPlanEditMode
          ? "bg-[rgba(59,130,246,0.18)] text-[#93C5FD] border border-[#3B82F6]/40 shadow-[0_0_16px_rgba(59,130,246,0.25)]"
          : "bg-white/5 hover:bg-white/10 text-[rgba(255,255,255,0.64)] hover:text-[#F5F5F5]"
      }`}
    >
      <span>EDIT MODE</span>
    </button>
  );

  return (
    <header
      className={
        placement === "flow"
          ? `relative z-[100] mx-auto flex w-full justify-center pt-2 pointer-events-none max-w-[calc(100vw-16px)] transition-all duration-300 ease-out ${
              isVisible ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0"
            }`
          : `fixed transition-all duration-300 ease-out ${
              isPlanEditMode ? "top-14 sm:top-16" : "top-4 sm:top-6"
            } left-1/2 -translate-x-1/2 z-[100] pointer-events-none max-w-[calc(100vw-16px)] ${
              isVisible ? "translate-y-0 opacity-100" : "-translate-y-[calc(100%+2rem)] opacity-0"
            }`
      }
      aria-hidden={!isVisible}
      inert={!isVisible}
    >
      <nav
        ref={navRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        aria-label="Atelier Navigation"
        style={{
          transform: `perspective(1000px) rotateX(${tilt.rotateX}deg) rotateY(${tilt.rotateY}deg) scale(${
            isScrolled ? 0.98 : 1
          })`,
          transition: "transform 240ms cubic-bezier(0.23, 1, 0.32, 1), background 240ms ease, box-shadow 240ms ease",
        }}
        className={`${
          !isVisible ? "pointer-events-none" : "pointer-events-auto"
        } relative flex w-max max-w-full items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-full border border-[rgba(96,165,250,0.18)] ${
          isScrolled
            ? "bg-[rgba(8,15,28,0.84)] shadow-[0_24px_70px_rgba(0,0,0,0.5),0_0_35px_rgba(37,99,235,0.18)]"
            : "bg-[rgba(8,15,28,0.70)] shadow-[0_16px_50px_rgba(0,0,0,0.38),0_0_25px_rgba(37,99,235,0.12)]"
        } backdrop-blur-[24px] saturate-[135%] text-[10px] sm:text-[11px] font-mono tracking-[0.2em] text-[rgba(255,255,255,0.64)]`}
      >
        {/* Subtle Atmospheric Top Highlight */}
        <div className="pointer-events-none absolute inset-x-4 top-0 h-[1px] bg-gradient-to-r from-transparent via-[rgba(96,165,250,0.4)] to-transparent" />

        {/* ── Brand emblem ── */}
        <button
          onClick={() => onNavigate("home")}
          className="flex shrink-0 items-center gap-2 pl-1.5 pr-2.5 sm:pl-2.5 sm:pr-3.5 py-1 text-[#F5F5F5] hover:text-[#60A5FA] transition-colors border-r border-white/8 group"
          title="AI House // Atelier Archai"
        >
          <div className="relative flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-[linear-gradient(135deg,#2563EB,#06B6D4)] shadow-[0_0_12px_rgba(6,182,212,0.9)] transition-transform group-hover:scale-125" />
            <div className="absolute w-4 h-4 rounded-full bg-[#06B6D4]/20 animate-ping" />
          </div>
          <span className="font-sans font-semibold tracking-[0.22em] text-[10px] sm:text-[11px] text-[#F5F5F5]">
            AI HOUSE
          </span>
        </button>

        {/* ── Nav items ── */}
        <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
          {navItems.map((item) => {
            const isActive = currentView === item.id;
            const itemButton = (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`relative flex shrink-0 items-center whitespace-nowrap px-2 sm:px-3.5 py-1 sm:py-1.5 rounded-full transition-all duration-200 ${
                  isActive
                    ? "text-[#F5F5F5] font-medium"
                    : "text-[rgba(255,255,255,0.62)] hover:text-[#F5F5F5] hover:-translate-y-[1px]"
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeNavIndicator"
                    className="absolute inset-0 rounded-full border border-[rgba(96,165,250,0.28)] bg-[linear-gradient(135deg,rgba(37,99,235,0.18),rgba(6,182,212,0.12))] shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_0_18px_rgba(37,99,235,0.22)]"
                    transition={{ type: "spring", stiffness: 450, damping: 35 }}
                  />
                )}
                <span className="relative z-10">{item.label}</span>
              </button>
            );
            return (
              <React.Fragment key={item.id}>
                {item.id === "model" && isProjectWorkspace && currentView === "plan" && onTogglePlanEditMode && (
                  renderEditModeToggle()
                )}
                {itemButton}
              </React.Fragment>
            );
          })}
        </div>

        {/* ── Vastu pill (project workspace only) ── */}
        {isProjectWorkspace && onOpenVastuAudit && (
          <button
            onClick={onOpenVastuAudit}
            className="inline-flex items-center gap-1 px-2.5 py-1 sm:py-1.5 rounded-full border border-[#06B6D4]/30 bg-[#06B6D4]/10 text-[#A5F3FC] text-[9px] sm:text-[10px] font-mono transition-all hover:bg-[#06B6D4]/20 hover:-translate-y-[1px] shrink-0 shadow-[0_0_12px_rgba(6,182,212,0.15)]"
            title="View Vastu Compliance Audit"
          >
            <span>VASTU</span>
          </button>
        )}

        {/* ── Create CTA ── */}
        <button
          onClick={() => onNavigate("create")}
          className={`ml-1 sm:ml-2 flex shrink-0 items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-full text-[10px] sm:text-[11px] font-medium tracking-[0.2em] transition-all duration-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_8px_25px_rgba(37,99,235,0.35)] hover:-translate-y-[1px] hover:brightness-110 active:translate-y-0 active:scale-[0.98] ${
            currentView === "create"
              ? "bg-[linear-gradient(135deg,#3B82F6,#06B6D4)] text-white shadow-[0_0_25px_rgba(59,130,246,0.5)]"
              : "bg-[linear-gradient(135deg,#2563EB,#06B6D4)] text-white"
          }`}
        >
          <Sparkles className="w-3 h-3 text-white" />
          <span>CREATE</span>
        </button>
      </nav>
    </header>
  );
};
