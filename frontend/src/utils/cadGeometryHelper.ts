import { Wall, Door, WindowItem, Point2D } from "@/types/house";

/**
 * CAD Geometry Helpers for wall-opening projections and validation
 */

export function projectOpeningToWall(
  wall: Wall,
  point: { x: number; y: number },
  width: number
): { x1: number; y1: number; x2: number; y2: number; width: number } | null {
  const dx = wall.x2 - wall.x1;
  const dy = wall.y2 - wall.y1;
  const length = Math.hypot(dx, dy);
  const fittedWidth = Math.min(width, length - 0.4);
  if (length < 1 || fittedWidth < 1) return null;

  const ux = dx / length;
  const uy = dy / length;

  const projection = Math.max(
    fittedWidth / 2 + 0.25,
    Math.min(
      length - fittedWidth / 2 - 0.25,
      ((point.x - wall.x1) * dx + (point.y - wall.y1) * dy) / length
    )
  );

  const cx = wall.x1 + ux * projection;
  const cy = wall.y1 + uy * projection;

  return {
    x1: cx - (ux * fittedWidth) / 2,
    y1: cy - (uy * fittedWidth) / 2,
    x2: cx + (ux * fittedWidth) / 2,
    y2: cy + (uy * fittedWidth) / 2,
    width: fittedWidth,
  };
}

export function openingOverlaps(
  candidate: Door | WindowItem,
  openings: Array<Door | WindowItem>,
  wall: Wall
): boolean {
  const dx = wall.x2 - wall.x1;
  const dy = wall.y2 - wall.y1;
  const length = Math.hypot(dx, dy);
  if (length === 0) return true;

  const interval = (opening: Door | WindowItem) => {
    const start = ((opening.x1 - wall.x1) * dx + (opening.y1 - wall.y1) * dy) / length;
    const end = ((opening.x2 - wall.x1) * dx + (opening.y2 - wall.y1) * dy) / length;
    return { start: Math.min(start, end), end: Math.max(start, end) };
  };

  const candidateInterval = interval(candidate);
  return openings.some((opening) => {
    if (
      opening.id === candidate.id ||
      (opening.host_wall_id || opening.wall_id) !== wall.id
    ) {
      return false;
    }
    const other = interval(opening);
    return Math.min(candidateInterval.end, other.end) - Math.max(candidateInterval.start, other.start) > 0.05;
  });
}
