"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import gsap from "gsap";
import { Sparkles, Menu, X } from "lucide-react";

export interface PillNavItem {
  id: string;
  label: string;
  href?: string;
  onClick?: () => void;
  isActive?: boolean;
}

export interface PillNavProps {
  logoText?: string;
  items?: PillNavItem[];
  activeHref?: string;
  onOpenProjects?: () => void;
  onCreate?: () => void;
  onNavigateHome?: () => void;
  className?: string;
}

interface NavItemButtonProps {
  item: PillNavItem;
  isActive: boolean;
  onClick: () => void;
}

/**
 * NavItemButton:
 * Individual pill item with Superdesign-inspired rising circular hover animation.
 * The circular background rises from below and expands to fill the pill on hover.
 */
const NavItemButton: React.FC<NavItemButtonProps> = ({ item, isActive, onClick }) => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const circleRef = useRef<HTMLSpanElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const [circleSize, setCircleSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  // Compute bounding diameter to fully cover the pill: D = sqrt(w^2 + h^2) + padding
  const updateCircleSize = useCallback(() => {
    if (!buttonRef.current) return;
    const w = buttonRef.current.offsetWidth;
    const h = buttonRef.current.offsetHeight;
    if (w > 0 && h > 0) {
      const diameter = Math.ceil(Math.hypot(w, h)) + 12;
      setCircleSize({ width: diameter, height: diameter });
    }
  }, []);

  useEffect(() => {
    updateCircleSize();
    window.addEventListener("resize", updateCircleSize);
    return () => window.removeEventListener("resize", updateCircleSize);
  }, [updateCircleSize]);

  // Set initial hidden position for the rising circle (below pill, scaled down)
  useEffect(() => {
    if (circleRef.current) {
      gsap.set(circleRef.current, {
        scale: 0,
        yPercent: 120,
        opacity: 0,
      });
    }
  }, [circleSize]);

  const handleMouseEnter = () => {
    if (!circleRef.current) return;
    // Animate circular background rising from below and expanding to fill the pill
    gsap.killTweensOf([circleRef.current, labelRef.current]);
    gsap.to(circleRef.current, {
      scale: 1,
      yPercent: 0,
      opacity: 1,
      duration: 0.38,
      ease: "power2.out",
    });
    if (labelRef.current && !isActive) {
      gsap.to(labelRef.current, {
        color: "#FFFFFF",
        duration: 0.25,
        ease: "power1.out",
      });
    }
  };

  const handleMouseLeave = () => {
    if (!circleRef.current) return;
    // Animate circular background exiting upwards or shrinking away
    gsap.killTweensOf([circleRef.current, labelRef.current]);
    gsap.to(circleRef.current, {
      scale: 0.2,
      yPercent: -100,
      opacity: 0,
      duration: 0.28,
      ease: "power2.in",
      onComplete: () => {
        if (circleRef.current) {
          gsap.set(circleRef.current, { yPercent: 120, scale: 0, opacity: 0 });
        }
      },
    });
    if (labelRef.current && !isActive) {
      gsap.to(labelRef.current, {
        color: "rgba(255, 255, 255, 0.64)",
        duration: 0.25,
        ease: "power1.in",
      });
    }
  };

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`relative flex items-center justify-center overflow-hidden rounded-full px-3 sm:px-4 py-1.5 sm:py-2 text-[10px] sm:text-[11px] font-mono tracking-[0.2em] transition-all duration-200 select-none cursor-pointer group ${
        isActive
          ? "text-[#F5F5F5] font-semibold bg-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_0_18px_rgba(37,99,235,0.2)]"
          : "text-[rgba(255,255,255,0.64)] hover:text-white"
      }`}
    >
      {/* Signature Superdesign Rising Circular Background */}
      <span
        ref={circleRef}
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-tr from-[rgba(37,99,235,0.28)] to-[rgba(6,182,212,0.32)] border border-[rgba(96,165,250,0.3)] shadow-[0_0_20px_rgba(37,99,235,0.3)]"
        style={{
          width: circleSize.width || 100,
          height: circleSize.height || 100,
        }}
      />

      {/* Nav Label */}
      <span ref={labelRef} className="relative z-10">
        {item.label}
      </span>

      {/* Subtle Active Accent Dot */}
      {isActive && (
        <span
          aria-hidden="true"
          className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#06B6D4] shadow-[0_0_6px_#06B6D4]"
        />
      )}
    </button>
  );
};

export const PillNav: React.FC<PillNavProps> = ({
  logoText = "AI HOUSE",
  items,
  activeHref,
  onOpenProjects,
  onCreate,
  onNavigateHome,
  className = "",
}) => {
  const router = useRouter();
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Animation Refs
  const navContainerRef = useRef<HTMLElement>(null);
  const logoRef = useRef<HTMLButtonElement>(null);
  const logoOrbRef = useRef<HTMLDivElement>(null);
  const itemsContainerRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLButtonElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  // Resolved active path
  const currentPath = activeHref || pathname || "/";

  // Default items if none passed: HOME & PROJECTS
  const navItems: PillNavItem[] = items || [
    {
      id: "home",
      label: "HOME",
      href: "/",
      onClick: onNavigateHome || (() => router.push("/")),
      isActive: currentPath === "/",
    },
    {
      id: "projects",
      label: "PROJECTS",
      href: "/projects",
      onClick: onOpenProjects || (() => router.push("/projects")),
      isActive: currentPath === "/projects",
    },
  ];

  // GSAP Entrance Animation on initial mount (respects reduced motion)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) return;

    const ctx = gsap.context(() => {
      // Container subtle float-in
      if (navContainerRef.current) {
        gsap.fromTo(
          navContainerRef.current,
          { opacity: 0, y: -12, scale: 0.98 },
          { opacity: 1, y: 0, scale: 1, duration: 0.55, ease: "power3.out" }
        );
      }

      // Logo entrance
      if (logoRef.current) {
        gsap.fromTo(
          logoRef.current,
          { opacity: 0, x: -8 },
          { opacity: 1, x: 0, duration: 0.45, delay: 0.1, ease: "power2.out" }
        );
      }

      // Nav items stagger
      if (itemsContainerRef.current) {
        gsap.fromTo(
          itemsContainerRef.current.children,
          { opacity: 0, y: -6 },
          { opacity: 1, y: 0, duration: 0.4, stagger: 0.08, delay: 0.15, ease: "power2.out" }
        );
      }

      // CTA button pop-in
      if (ctaRef.current) {
        gsap.fromTo(
          ctaRef.current,
          { opacity: 0, scale: 0.9 },
          { opacity: 1, scale: 1, duration: 0.45, delay: 0.25, ease: "back.out(1.6)" }
        );
      }
    });

    return () => ctx.revert();
  }, []);

  // Subtle Logo Rotation Interaction on Hover
  const handleLogoMouseEnter = () => {
    if (!logoOrbRef.current) return;
    gsap.to(logoOrbRef.current, {
      rotation: 24,
      scale: 1.2,
      duration: 0.32,
      ease: "back.out(2)",
    });
  };

  const handleLogoMouseLeave = () => {
    if (!logoOrbRef.current) return;
    gsap.to(logoOrbRef.current, {
      rotation: 0,
      scale: 1,
      duration: 0.28,
      ease: "power2.out",
    });
  };

  // Mobile Menu GSAP transition
  useEffect(() => {
    if (!mobileMenuRef.current) return;
    if (isMobileMenuOpen) {
      gsap.fromTo(
        mobileMenuRef.current,
        { opacity: 0, y: -8, scale: 0.96 },
        { opacity: 1, y: 0, scale: 1, duration: 0.22, ease: "power2.out" }
      );
    }
  }, [isMobileMenuOpen]);

  const handleCloseMobileMenu = useCallback(() => {
    if (!mobileMenuRef.current) {
      setIsMobileMenuOpen(false);
      return;
    }
    gsap.to(mobileMenuRef.current, {
      opacity: 0,
      y: -8,
      scale: 0.96,
      duration: 0.18,
      ease: "power2.in",
      onComplete: () => setIsMobileMenuOpen(false),
    });
  }, []);

  const handleHomeClick = () => {
    if (onNavigateHome) {
      onNavigateHome();
    } else {
      router.push("/");
    }
    handleCloseMobileMenu();
  };

  const handleCreateClick = () => {
    if (onCreate) {
      onCreate();
    } else {
      router.push("/create");
    }
    handleCloseMobileMenu();
  };

  return (
    <header className={`relative z-40 mx-auto flex w-full justify-center px-4 pointer-events-none select-none ${className}`}>
      {/* ── Main Pill Navigation Surface ── */}
      <nav
        ref={navContainerRef}
        aria-label="Main Navigation"
        className="pointer-events-auto relative flex items-center justify-between gap-2 sm:gap-4 rounded-full border border-[rgba(96,165,250,0.18)] bg-[rgba(8,11,18,0.78)] px-2.5 sm:px-3 py-1.5 sm:py-2 backdrop-blur-[24px] saturate-[140%] shadow-[0_16px_50px_rgba(0,0,0,0.45),0_0_24px_rgba(37,99,235,0.12),0_0_18px_rgba(6,182,212,0.06)]"
      >
        {/* Subtle Atmospheric Top Specular Highlight */}
        <div className="pointer-events-none absolute inset-x-6 top-0 h-[1px] bg-gradient-to-r from-transparent via-[rgba(96,165,250,0.45)] to-transparent" />

        {/* ── LEFT: AI HOUSE Brand Emblem ── */}
        <button
          ref={logoRef}
          type="button"
          onClick={handleHomeClick}
          onMouseEnter={handleLogoMouseEnter}
          onMouseLeave={handleLogoMouseLeave}
          className="flex shrink-0 items-center gap-2.5 pl-2 pr-3 sm:pl-3 sm:pr-4 py-1 text-[#F5F5F5] hover:text-[#60A5FA] transition-colors border-r border-white/10 group cursor-pointer"
          title="AI House // Atelier Archai"
          aria-label="AI House Home"
        >
          {/* Glowing dot with hover rotation */}
          <div ref={logoOrbRef} className="relative flex items-center justify-center">
            <div className="w-2.5 h-2.5 rounded-full bg-[linear-gradient(135deg,#2563EB,#06B6D4)] shadow-[0_0_12px_rgba(6,182,212,0.9)]" />
            <div className="absolute w-4 h-4 rounded-full bg-[#06B6D4]/20 animate-ping" />
          </div>
          <span className="font-sans font-semibold tracking-[0.22em] text-[10px] sm:text-[11px] text-[#F5F5F5]">
            {logoText}
          </span>
        </button>

        {/* ── CENTER: Desktop Navigation Items (HOME, PROJECTS) ── */}
        <div ref={itemsContainerRef} className="hidden md:flex items-center gap-1 sm:gap-1.5">
          {navItems.map((item) => (
            <NavItemButton
              key={item.id}
              item={item}
              isActive={Boolean(item.isActive)}
              onClick={() => {
                if (item.onClick) {
                  item.onClick();
                } else if (item.href) {
                  router.push(item.href);
                }
              }}
            />
          ))}
        </div>

        {/* ── RIGHT: Desktop CREATE CTA ── */}
        <div className="hidden md:flex items-center pl-1">
          <button
            ref={ctaRef}
            type="button"
            onClick={handleCreateClick}
            className="group relative flex shrink-0 items-center gap-1.5 px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-full text-[10px] sm:text-[11px] font-mono font-medium tracking-[0.2em] text-white bg-[linear-gradient(135deg,#2563EB,#06B6D4)] shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_8px_25px_rgba(37,99,235,0.35)] transition-all duration-300 hover:scale-[1.03] hover:brightness-110 active:scale-[0.98] cursor-pointer"
            title="Create Bespoke Architectural Blueprint"
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-200 transition-transform group-hover:rotate-12" />
            <span>CREATE</span>
          </button>
        </div>

        {/* ── MOBILE: Menu Trigger Button (<= 768px) ── */}
        <div className="flex md:hidden items-center gap-2 pl-1">
          <button
            type="button"
            onClick={() => {
              if (isMobileMenuOpen) {
                handleCloseMobileMenu();
              } else {
                setIsMobileMenuOpen(true);
              }
            }}
            aria-label="Toggle Navigation Menu"
            aria-expanded={isMobileMenuOpen}
            className="flex items-center justify-center w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-white border border-white/10 active:scale-95 transition-all cursor-pointer"
          >
            {isMobileMenuOpen ? <X className="w-3.5 h-3.5 text-white/90" /> : <Menu className="w-3.5 h-3.5 text-white/90" />}
          </button>
        </div>
      </nav>

      {/* ── MOBILE MENU PANEL ── */}
      {isMobileMenuOpen && (
        <div
          ref={mobileMenuRef}
          className="pointer-events-auto absolute top-full mt-2 w-[min(280px,calc(100vw-32px))] rounded-2xl border border-[rgba(96,165,250,0.22)] bg-[rgba(8,12,22,0.96)] backdrop-blur-[24px] shadow-[0_20px_60px_rgba(0,0,0,0.85),0_0_25px_rgba(37,99,235,0.18)] p-2 text-xs font-mono tracking-wider space-y-1.5 md:hidden"
        >
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (item.onClick) {
                  item.onClick();
                } else if (item.href) {
                  router.push(item.href);
                }
                handleCloseMobileMenu();
              }}
              className={`flex w-full items-center justify-between px-3 py-2 rounded-xl transition-all ${
                item.isActive
                  ? "bg-white/10 text-white font-medium border-l-2 border-[#06B6D4]"
                  : "text-white/70 hover:text-white hover:bg-white/5"
              }`}
            >
              <span>{item.label}</span>
              {item.isActive && <span className="w-1.5 h-1.5 rounded-full bg-[#06B6D4] shadow-[0_0_6px_#06B6D4]" />}
            </button>
          ))}

          {/* Mobile CREATE CTA */}
          <button
            type="button"
            onClick={handleCreateClick}
            className="flex w-full items-center justify-between px-3 py-2 rounded-xl text-white font-semibold bg-[linear-gradient(135deg,#2563EB,#06B6D4)] shadow-[0_0_16px_rgba(37,99,235,0.35)] transition-all hover:brightness-110 active:scale-95 cursor-pointer mt-1"
          >
            <span>✦ CREATE</span>
            <Sparkles className="w-3.5 h-3.5 text-cyan-100" />
          </button>
        </div>
      )}
    </header>
  );
};
