"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, ChevronDown, ChevronUp, Menu, X, Check } from "lucide-react";

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
  placement?: "fixed" | "flow" | "responsive";
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [tilt, setTilt] = useState({ rotateX: 0, rotateY: 0 });
  const [expandedNav, setExpandedNav] = useState<"create" | "projects" | null>(null);
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

  const navItems = isProjectWorkspace
    ? projectNavItems
    : expandedNav
      ? projectNavItems
      : [];

  const handleNavClick = (id: NavView) => {
    setExpandedNav(null);
    if (id === "projects" && onOpenProjects) {
      onOpenProjects();
    } else {
      onNavigate(id);
    }
  };

  const handleProjectsClick = () => {
    setExpandedNav((current) => current === "projects" ? null : "projects");
    onOpenProjects?.();
  };

  const handleCreateClick = () => {
    if (!isProjectWorkspace) {
      setExpandedNav((current) => current === "create" ? null : "create");
    }
    onNavigate("create");
  };

  // Fail-safe: Edit mode must have a clean, isolated application shell without FloatingNav
  if (currentView === "edit" || isPlanEditMode) {
    return null;
  }

  const renderEditModeToggle = () => (
    <button
      type="button"
      onClick={onTogglePlanEditMode}
      aria-label="Enter CAD Edit Mode"
      title="Enter CAD Edit Mode"
      className="flex shrink-0 items-center justify-center whitespace-nowrap px-2.5 py-1.5 rounded-full transition-all text-[10px] tracking-[0.16em] font-mono bg-white/5 hover:bg-white/10 text-[rgba(255,255,255,0.64)] hover:text-[#F5F5F5]"
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
          : placement === "responsive"
          ? `relative z-[100] w-full px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-1 pointer-events-none transition-all duration-300 ease-out lg:fixed lg:top-6 lg:left-1/2 lg:-translate-x-1/2 lg:z-[100] lg:w-max lg:max-w-[calc(100vw-32px)] lg:px-0 lg:pt-0 lg:pb-0 ${
              isVisible ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0"
            }`
          : `fixed top-4 sm:top-6 left-1/2 -translate-x-1/2 z-[100] pointer-events-none max-w-[calc(100vw-16px)] transition-all duration-300 ease-out ${
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
          placement === "responsive"
            ? "w-full justify-between rounded-2xl px-2 py-2 md:mx-auto md:w-max md:justify-center md:rounded-full md:px-3 md:py-2"
            : ""
        } ${
          !isVisible ? "pointer-events-none" : "pointer-events-auto"
        } relative flex max-w-full items-center gap-1 sm:gap-2 border border-[rgba(96,165,250,0.15)] ${
          isScrolled
            ? "bg-[rgba(8,9,11,0.86)] shadow-[0_24px_70px_rgba(0,0,0,0.5),0_0_30px_rgba(37,99,235,0.12),0_0_22px_rgba(139,92,246,0.035)]"
            : "bg-[rgba(8,9,11,0.76)] shadow-[0_16px_50px_rgba(0,0,0,0.38),0_0_24px_rgba(37,99,235,0.08),0_0_18px_rgba(139,92,246,0.03)]"
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

        {/* ── Mobile Compact Navigation Control (<= 768px) ── */}
        <div className="lg:hidden flex items-center gap-1.5 pl-1">
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen((prev) => !prev)}
            aria-expanded={isMobileMenuOpen}
            aria-label="Toggle Navigation Menu"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 hover:bg-white/10 text-[10px] font-mono tracking-widest text-[#F5F5F5] border border-white/10 active:scale-95 transition-all"
          >
            <span className="uppercase text-[#60A5FA] font-semibold">{currentView}</span>
            <ChevronDown className={`w-3 h-3 text-[rgba(255,255,255,0.6)] transition-transform duration-200 ${isMobileMenuOpen ? "rotate-180" : ""}`} />
          </button>

          {isProjectWorkspace && currentView === "plan" && onTogglePlanEditMode && (
            <button
              type="button"
              onClick={onTogglePlanEditMode}
              className="px-2 py-1 rounded-full text-[9px] font-mono tracking-wider transition-all bg-white/5 text-white/60 hover:text-white"
            >
              EDIT
            </button>
          )}
        </div>

        {/* ── Desktop Nav items (screens > 768px) ── */}
        <div id="home-secondary-navigation" className="hidden lg:contents">
          <AnimatePresence initial={false}>
            {navItems.length > 0 && (
              <motion.div
                key={isProjectWorkspace ? "workspace-navigation" : `${expandedNav}-navigation`}
                initial={{ opacity: 0, width: 0, x: -8 }}
                animate={{ opacity: 1, width: "auto", x: 0 }}
                exit={{ opacity: 0, width: 0, x: -8 }}
                transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
                className="flex min-w-0 shrink items-center gap-0.5 sm:gap-1 overflow-hidden border-r border-white/10 pr-1 sm:pr-2"
                role="group"
                aria-label={expandedNav === "projects" ? "Project navigation" : "Create navigation"}
              >
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
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {!isProjectWorkspace && onOpenProjects && (
          <button
            type="button"
            onClick={handleProjectsClick}
            aria-expanded={expandedNav === "projects"}
            aria-controls="home-secondary-navigation"
            className={`hidden lg:flex relative shrink-0 items-center whitespace-nowrap px-2 sm:px-3.5 py-1 sm:py-1.5 rounded-full transition-all duration-200 ${
              expandedNav === "projects"
                ? "text-[#F5F5F5] font-medium"
                : "text-[rgba(255,255,255,0.62)] hover:text-[#F5F5F5] hover:-translate-y-[1px]"
            }`}
          >
            {expandedNav === "projects" && (
              <motion.span
                layoutId="activeNavIndicator"
                className="absolute inset-0 rounded-full border border-[rgba(96,165,250,0.28)] bg-[linear-gradient(135deg,rgba(37,99,235,0.18),rgba(6,182,212,0.12))] shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_0_18px_rgba(37,99,235,0.22)]"
                transition={{ type: "spring", stiffness: 450, damping: 35 }}
              />
            )}
            <span className="relative z-10">PROJECTS</span>
          </button>
        )}

        {/* ── Vastu pill (project workspace only) ── */}
        {isProjectWorkspace && onOpenVastuAudit && (
          <button
            onClick={onOpenVastuAudit}
            className="hidden lg:inline-flex items-center gap-1 px-2.5 py-1 sm:py-1.5 rounded-full border border-[#06B6D4]/30 bg-[#06B6D4]/10 text-[#A5F3FC] text-[9px] sm:text-[10px] font-mono transition-all hover:bg-[#06B6D4]/20 hover:-translate-y-[1px] shrink-0 shadow-[0_0_12px_rgba(6,182,212,0.15)]"
            title="View Vastu Compliance Audit"
          >
            <span>VASTU</span>
          </button>
        )}

        {/* ── Create CTA ── */}
        <button
          onClick={handleCreateClick}
          aria-expanded={!isProjectWorkspace && expandedNav === "create"}
          aria-controls="home-secondary-navigation"
          className={`ml-1 sm:ml-2 hidden lg:flex shrink-0 items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-full text-[10px] sm:text-[11px] font-medium tracking-[0.2em] transition-all duration-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_8px_25px_rgba(37,99,235,0.35)] hover:-translate-y-[1px] hover:brightness-110 active:translate-y-0 active:scale-[0.98] ${
            currentView === "create"
              ? "bg-[linear-gradient(135deg,#3B82F6,#06B6D4)] text-white shadow-[0_0_25px_rgba(59,130,246,0.5)]"
              : "bg-[linear-gradient(135deg,#2563EB,#06B6D4)] text-white"
          }`}
        >
          <Sparkles className="w-3 h-3 text-white" />
          <span>CREATE</span>
        </button>
      </nav>

      {/* ── Mobile Navigation Dropdown Popover (<= 768px) ── */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="lg:hidden pointer-events-auto absolute right-2 top-full mt-1 w-[min(280px,calc(100vw-32px))] rounded-2xl border border-[rgba(96,165,250,0.24)] bg-[rgba(8,12,22,0.96)] backdrop-blur-[24px] shadow-[0_20px_60px_rgba(0,0,0,0.85),0_0_25px_rgba(37,99,235,0.18)] p-2 text-xs font-mono tracking-wider space-y-1"
          >
            {(isProjectWorkspace ? projectNavItems : [{ id: "home" as NavView, label: "HOME" }]).map((item) => {
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    handleNavClick(item.id);
                  }}
                  className={`flex w-full items-center justify-between px-3 py-2 rounded-xl transition-all ${
                    isActive
                      ? "bg-[linear-gradient(135deg,rgba(37,99,235,0.22),rgba(6,182,212,0.14))] text-white border border-[#3B82F6]/30 font-semibold"
                      : "text-white/70 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <span>{item.label}</span>
                  {isActive && <div className="w-1.5 h-1.5 rounded-full bg-[#06B6D4] shadow-[0_0_8px_#06B6D4]" />}
                </button>
              );
            })}

            {!isProjectWorkspace && onOpenProjects && (
              <button
                type="button"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onOpenProjects();
                }}
                className="flex w-full items-center justify-between px-3 py-2 rounded-xl text-white/70 hover:text-white hover:bg-white/5 transition-all"
              >
                <span>PROJECTS</span>
              </button>
            )}

            {isProjectWorkspace && onOpenVastuAudit && (
              <button
                type="button"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onOpenVastuAudit();
                }}
                className="flex w-full items-center justify-between px-3 py-2 rounded-xl text-[#A5F3FC] hover:bg-[#06B6D4]/15 transition-all border border-[#06B6D4]/25"
              >
                <span>VASTU AUDIT</span>
                <span className="text-[10px] text-[#06B6D4]">HARMONY</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setIsMobileMenuOpen(false);
                handleCreateClick();
              }}
              className="flex w-full items-center justify-between px-3 py-2 rounded-xl text-white/70 hover:text-white hover:bg-white/5 transition-all"
            >
              <span>CREATE</span>
              <Sparkles className="h-3.5 w-3.5 text-[#60A5FA]" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};
