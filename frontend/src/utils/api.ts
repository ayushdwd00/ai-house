import { HouseLayout, IntakeRequest, Room, Rect } from "@/types/house";

export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
).replace(/\/+$/, "");

/**
 * Normalizes error messages into user-friendly diagnostic notices
 * without leaking raw system stack traces or generic "Failed to fetch".
 */
export function formatApiError(err: unknown): string {
  if (err instanceof TypeError && err.message.toLowerCase().includes("failed to fetch")) {
    return "Unable to connect to the architectural synthesis backend. Please verify the backend server is active and accessible.";
  }
  if (err instanceof Error) {
    if (err.message.includes("422") || err.message.toLowerCase().includes("unprocessable")) {
      return "Some architectural specifications could not be processed. Please review your plot dimensions and requirements.";
    }
    if (err.message.includes("504") || err.message.toLowerCase().includes("timeout")) {
      return "Architectural synthesis timed out. The spatial solver or critic took longer than expected. Please try again.";
    }
    if (err.message.includes("500")) {
      return "The architectural solver encountered an unexpected constraint condition. Please adjust room counts or setbacks and retry.";
    }
    return err.message;
  }
  return "An unexpected error occurred while communicating with the architectural engine.";
}

/**
 * Generate a new architectural house layout from intake specifications.
 */
export async function generateHouseLayout(req: IntakeRequest): Promise<HouseLayout> {
  const url = `${API_BASE_URL}/api/generate`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });

    if (!res.ok) {
      let detail = `Generation failed (HTTP ${res.status})`;
      try {
        const errJson = await res.json();
        if (errJson.detail) {
          detail = typeof errJson.detail === "string" ? errJson.detail : JSON.stringify(errJson.detail);
        }
      } catch (_) {}
      throw new Error(detail);
    }

    return await res.json();
  } catch (err) {
    console.error("[API ERROR] generateHouseLayout failed:", { url, req, error: err });
    throw new Error(formatApiError(err));
  }
}

/**
 * Upload an architectural floor plan image for digitization into 3D.
 */
export async function uploadFloorPlanImage(
  file: File,
  calibrationWidth: number = 38.0
): Promise<{ layout: HouseLayout; vision_analysis?: Record<string, unknown> }> {
  const url = `${API_BASE_URL}/api/upload-floorplan`;
  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("calibration_width", String(calibrationWidth));

    const res = await fetch(url, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      let detail = `Upload processing failed (HTTP ${res.status})`;
      try {
        const errJson = await res.json();
        if (errJson.detail) detail = String(errJson.detail);
      } catch (_) {}
      throw new Error(detail);
    }

    return await res.json();
  } catch (err) {
    console.error("[API ERROR] uploadFloorPlanImage failed:", { url, error: err });
    throw new Error(formatApiError(err));
  }
}

/**
 * Fetch a saved project by ID from the backend.
 */
export async function fetchProjectById(projectId: string): Promise<HouseLayout | null> {
  const url = `${API_BASE_URL}/api/projects/${encodeURIComponent(projectId)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn(`[API NOTICE] Could not fetch project ${projectId}:`, err);
    return null;
  }
}

/**
 * Apply AI natural language instruction to refine an existing design.
 */
export async function refineHouseLayout(
  layout: HouseLayout,
  instruction: string,
  targetRoomId?: string | null
): Promise<HouseLayout> {
  const url = `${API_BASE_URL}/api/refine`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        current_layout: layout,
        edit_instruction: instruction,
        target_room_id: targetRoomId || null,
      }),
    });

    if (!res.ok) throw new Error(`Refinement failed with HTTP status ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error("[API ERROR] refineHouseLayout failed:", { url, error: err });
    throw new Error(formatApiError(err));
  }
}

/**
 * Validate and regenerate wall network after room manipulation.
 */
export async function editRoomLayout(
  currentLayout: HouseLayout,
  roomId: string,
  proposedRect: Rect
): Promise<HouseLayout | null> {
  const url = `${API_BASE_URL}/api/edit-room`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        current_layout: currentLayout,
        room_id: roomId,
        proposed_rect: proposedRect,
      }),
    });

    if (res.ok) {
      const result = await res.json();
      return result.layout || null;
    }
    return null;
  } catch (err) {
    console.error("[API ERROR] editRoomLayout failed:", { url, error: err });
    return null;
  }
}

/**
 * Interprets a natural language 'Describe Your Dream Home' prompt into a structured brief.
 */
export async function interpretDreamHomePrompt(
  prompt: string,
  context?: Record<string, unknown>
): Promise<{
  brief: import("@/types/house").DreamHomeStructuredRequirements;
  ready_to_generate: boolean;
  missing_critical_fields: string[];
  clarification_prompt?: string | null;
}> {
  const url = `${API_BASE_URL}/api/dream-home/interpret`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, context }),
    });

    if (!res.ok) {
      throw new Error(`Failed to interpret dream home prompt (HTTP ${res.status})`);
    }
    return await res.json();
  } catch (err) {
    console.error("[API ERROR] interpretDreamHomePrompt failed:", { url, error: err });
    throw new Error(formatApiError(err));
  }
}

/**
 * Generates a full HouseLayout from confirmed DreamHomeStructuredRequirements.
 */
export async function generateDreamHomeLayout(
  brief: import("@/types/house").DreamHomeStructuredRequirements
): Promise<HouseLayout> {
  const url = `${API_BASE_URL}/api/dream-home/generate`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(brief),
    });

    if (!res.ok) {
      let detail = `Dream home generation failed (HTTP ${res.status})`;
      try {
        const errJson = await res.json();
        if (errJson.detail) detail = String(errJson.detail);
      } catch (_) {}
      throw new Error(detail);
    }
    return await res.json();
  } catch (err) {
    console.error("[API ERROR] generateDreamHomeLayout failed:", { url, error: err });
    throw new Error(formatApiError(err));
  }
}

