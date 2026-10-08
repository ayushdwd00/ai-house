import { Point2D } from "@/types/house";

/**
 * Architectural CAD Coordinate Utilities
 * Standardizes Screen <-> World (feet) transformations,
 * distances, angles, and architectural imperial dimension formatting.
 */

export const CAD_SCALE = 24; // 1 architectural foot = 24 SVG pixels

/**
 * Converts screen client coordinates to CAD World coordinates (in feet).
 */
export function screenToWorld(
  clientX: number,
  clientY: number,
  svgElement: SVGSVGElement | null,
  scale: number = CAD_SCALE
): Point2D | null {
  if (!svgElement) return null;
  const ctm = svgElement.getScreenCTM();
  if (!ctm) return null;

  const pt = svgElement.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const transformed = pt.matrixTransform(ctm.inverse());

  return {
    x: transformed.x / scale,
    y: transformed.y / scale,
  };
}

/**
 * Converts CAD World coordinates (in feet) to SVG sheet pixels.
 */
export function worldToSvg(worldPoint: Point2D, scale: number = CAD_SCALE): Point2D {
  return {
    x: worldPoint.x * scale,
    y: worldPoint.y * scale,
  };
}

/**
 * Calculates Euclidean distance between two points in World feet.
 */
export function distanceWorld(p1: Point2D, p2: Point2D): number {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

/**
 * Calculates angle in degrees from p1 to p2 (0 = East, 90 = South in SVG coords).
 */
export function angleWorld(p1: Point2D, p2: Point2D): number {
  const rad = Math.atan2(p2.y - p1.y, p2.x - p1.x);
  let deg = (rad * 180) / Math.PI;
  if (deg < 0) deg += 360;
  return deg;
}

/**
 * Formats a decimal feet value into architectural notation: e.g. 14'-6"
 */
export function feetToArchitectural(feet: number): string {
  if (isNaN(feet)) return "0'-0\"";
  const absFeet = Math.abs(feet);
  const totalInches = Math.round(absFeet * 12);
  const ft = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  const sign = feet < 0 ? "-" : "";
  return `${sign}${ft}'-${inches}"`;
}

/**
 * Parses architectural notation or numeric values into decimal feet.
 * Examples:
 *   "14'-6\"" -> 14.5
 *   "14' 6"   -> 14.5
 *   "14.5"    -> 14.5
 *   "14ft"    -> 14.0
 *   "36in"    -> 3.0
 */
export function parseArchitecturalDimension(input: string): number | null {
  if (!input) return null;
  const trimmed = input.trim().toLowerCase();

  // Pure number case (e.g. "14.5")
  const asFloat = parseFloat(trimmed);
  if (!isNaN(asFloat) && !trimmed.includes("'") && !trimmed.includes('"') && !trimmed.includes("ft") && !trimmed.includes("in")) {
    return asFloat > 0 ? asFloat : null;
  }

  // Inches only: e.g. "36in" or "36\""
  const inchesOnlyMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*(?:"|in|inch|inches)$/);
  if (inchesOnlyMatch) {
    const val = parseFloat(inchesOnlyMatch[1]) / 12;
    return val > 0 ? val : null;
  }

  // Feet + inches: e.g. 14'-6", 14' 6", 14ft 6in, 14'
  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*(?:'|ft|feet)?(?:\s*[-–]?\s*(\d+(?:\.\d+)?)\s*(?:"|in|inch|inches)?)?$/);
  if (match) {
    const ft = parseFloat(match[1]) || 0;
    const inches = match[2] ? parseFloat(match[2]) : 0;
    const total = ft + inches / 12;
    return total > 0 ? total : null;
  }

  return null;
}
