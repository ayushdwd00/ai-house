"use client";

import React, { useMemo } from "react";

export type GradualBlurPosition = "top" | "bottom" | "left" | "right";
export type GradualBlurCurve = "linear" | "ease-in" | "ease-out" | "ease-in-out" | "exponential";

export interface GradualBlurProps {
  /**
   * Edge where the gradual blur is positioned.
   * Default: "top"
   */
  position?: GradualBlurPosition;
  /**
   * Maximum blur radius in pixels.
   * Default: 16
   */
  strength?: number;
  /**
   * Height of the blur region (for top/bottom).
   * Default: "140px"
   */
  height?: string | number;
  /**
   * Width of the blur region (for left/right).
   * Default: "140px"
   */
  width?: string | number;
  /**
   * Number of discrete blur layers. 4 to 6 gives optimal smoothness with great mobile performance.
   * Default: 5
   */
  layerCount?: number;
  /**
   * Interpolation curve for blur radius & mask falloff.
   * Default: "ease-out"
   */
  curve?: GradualBlurCurve;
  /**
   * Overall opacity of the effect (0 to 1).
   * Default: 1
   */
  opacity?: number;
  /**
   * Optional background tint to blend the blur seamlessly into the page background.
   * Default: undefined
   */
  color?: string;
  /**
   * Whether to scale down height/blur slightly on compact mobile viewports for performance.
   * Default: true
   */
  responsive?: boolean;
  /**
   * Additional Tailwind / CSS classes.
   */
  className?: string;
  /**
   * Optional custom inline styles.
   */
  style?: React.CSSProperties;
  /**
   * Z-index of the gradual blur container.
   * Default: 20
   */
  zIndex?: number;
}

function evaluateCurve(t: number, curve: GradualBlurCurve): number {
  const clamped = Math.max(0, Math.min(1, t));
  switch (curve) {
    case "linear":
      return clamped;
    case "ease-in":
      return clamped * clamped;
    case "ease-in-out":
      return clamped < 0.5 ? 2 * clamped * clamped : 1 - Math.pow(-2 * clamped + 2, 2) / 2;
    case "exponential":
      return Math.pow(clamped, 2.4);
    case "ease-out":
    default:
      return 1 - Math.pow(1 - clamped, 2);
  }
}

/**
 * GradualBlur
 *
 * A high-performance, progressive multi-layer edge blur component.
 * Uses native CSS backdrop-filter and gradient masking to create smooth,
 * cinematic transitions between scrolling content and viewport boundaries.
 */
export const GradualBlur: React.FC<GradualBlurProps> = ({
  position = "top",
  strength = 16,
  height = "140px",
  width = "140px",
  layerCount = 5,
  curve = "ease-out",
  opacity = 1,
  color,
  responsive = true,
  className = "",
  style,
  zIndex = 20,
}) => {
  const isVertical = position === "top" || position === "bottom";
  const sizeStyle: React.CSSProperties = isVertical
    ? {
        height: typeof height === "number" ? `${height}px` : height,
        width: "100%",
        left: 0,
        right: 0,
        ...(position === "top" ? { top: 0 } : { bottom: 0 }),
      }
    : {
        width: typeof width === "number" ? `${width}px` : width,
        height: "100%",
        top: 0,
        bottom: 0,
        ...(position === "left" ? { left: 0 } : { right: 0 }),
      };

  const gradientDirection = useMemo(() => {
    switch (position) {
      case "top":
        return "to bottom";
      case "bottom":
        return "to top";
      case "left":
        return "to right";
      case "right":
        return "to left";
    }
  }, [position]);

  // Compute layers with progressive blur & masks
  const layers = useMemo(() => {
    const safeLayers = Math.max(2, Math.min(8, layerCount));
    const result = [];

    for (let i = 0; i < safeLayers; i++) {
      const step = (i + 1) / safeLayers;
      const factor = evaluateCurve(step, curve);
      const blurRadius = Math.max(0.5, Math.round(strength * factor * 10) / 10);

      // Mask stops: earlier layers (low blur) extend further out,
      // later layers (strongest blur) stay closer to the edge.
      const startPercent = Math.max(0, Math.round((i / safeLayers) * 20));
      const midPercent = Math.round(100 - (factor * 50));
      const endPercent = 100;

      const maskGradient = `linear-gradient(${gradientDirection}, rgba(0,0,0,1) ${startPercent}%, rgba(0,0,0,${(1 - factor * 0.4).toFixed(2)}) ${midPercent}%, rgba(0,0,0,0) ${endPercent}%)`;

      result.push({
        id: i,
        blur: blurRadius,
        mask: maskGradient,
      });
    }

    return result;
  }, [layerCount, strength, curve, gradientDirection]);

  return (
    <div
      aria-hidden="true"
      data-gradual-blur={position}
      style={{
        ...sizeStyle,
        opacity,
        zIndex,
        pointerEvents: "none",
        ...style,
      }}
      className={`pointer-events-none absolute select-none overflow-hidden ${
        responsive ? "max-sm:max-h-[90px]" : ""
      } ${className}`}
    >
      {/* Multi-layer progressive backdrop blur */}
      {layers.map((layer) => (
        <div
          key={layer.id}
          style={{
            backdropFilter: `blur(${layer.blur}px)`,
            WebkitBackdropFilter: `blur(${layer.blur}px)`,
            maskImage: layer.mask,
            WebkitMaskImage: layer.mask,
          }}
          className="pointer-events-none absolute inset-0 will-change-[backdrop-filter]"
        />
      ))}

      {/* Optional progressive color tint overlay for deep edge fade */}
      {color && (
        <div
          style={{
            background: `linear-gradient(${gradientDirection}, ${color} 0%, transparent 100%)`,
          }}
          className="pointer-events-none absolute inset-0 opacity-80"
        />
      )}
    </div>
  );
};

export default GradualBlur;
