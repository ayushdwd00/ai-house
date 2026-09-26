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
    if (err.message === "Generation failed (HTTP 422)" || err.message.toLowerCase() === "unprocessable entity") {
      return "Some architectural specifications could not be processed. Please review your plot dimensions and requirements.";
    }
    if (err.message.includes("504") || err.message.toLowerCase().includes("timeout")) {
      return "Architectural synthesis timed out. The spatial solver took longer than expected. Please try again.";
    }
    if (err.message === "Generation failed (HTTP 500)") {
      return "The architectural solver encountered an unexpected condition. Please adjust room counts or setbacks and retry.";
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
          if (typeof errJson.detail === "string") {
            detail = errJson.detail;
          } else if (typeof errJson.detail === "object") {
            const d = errJson.detail;
            detail = d.message || d.designer_rationale || JSON.stringify(d);
            if (d.recommendation) {
              detail += `\n\nRecommendation: ${d.recommendation}`;
            }
          }
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
  proposedRect: Rect,
  pushAdjacent: boolean = true
): Promise<HouseLayout | null> {
  const result = await editRoomLayoutFull(currentLayout, roomId, proposedRect, pushAdjacent);
  return result?.layout || null;
}

export async function editRoomLayoutFull(
  currentLayout: HouseLayout,
  roomId: string,
  proposedRect: Rect,
  pushAdjacent: boolean = true
): Promise<import("@/types/house").EditRoomResult | null> {
  const url = `${API_BASE_URL}/api/edit-room`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        current_layout: currentLayout,
        room_id: roomId,
        proposed_rect: proposedRect,
        push_adjacent: pushAdjacent,
      }),
    });

    if (res.ok) {
      const result = await res.json();
      return result;
    }
    return null;
  } catch (err) {
    console.error("[API ERROR] editRoomLayout failed:", { url, error: err });
    return null;
  }
}

/**
 * Request AI-recommended room dimensions and feasibility analysis.
 */
export async function recommendDimensions(
  req: import("@/types/house").DimensionRecommendationRequest
): Promise<import("@/types/house").DimensionRecommendationResponse | null> {
  const url = `${API_BASE_URL}/api/recommend-dimensions`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });

    if (res.ok) {
      return await res.json();
    }
    return null;
  } catch (err) {
    console.error("[API ERROR] recommendDimensions failed:", { url, error: err });
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

/**
 * Conduct Gemini multimodal architectural QA review on a floor plan layout.
 */
export async function reviewLayoutWithGemini(
  layout: HouseLayout,
  vastuEnabled: boolean = false
): Promise<{
  score?: number;
  critique?: string;
  issues?: Array<{ category: string; description: string; severity: "low" | "medium" | "high"; recommendation?: string }>;
  strengths?: string[];
  vastu_compliance?: Record<string, unknown>;
} | null> {
  const url = `${API_BASE_URL}/api/architectural-review`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        layout,
        vastu_compliant: vastuEnabled,
      }),
    });

    if (res.ok) {
      return await res.json();
    }
    return null;
  } catch (err) {
    console.warn("[API NOTICE] reviewLayoutWithGemini failed:", err);
    return null;
  }
}

/**
 * Check whether Blender Cycles rendering is available on backend.
 */
export async function checkBlenderStatus(): Promise<{
  available: boolean;
  path?: string | null;
  message: string;
  instructions?: string;
}> {
  const url = `${API_BASE_URL}/api/render-realistic/status`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      return { available: false, message: "Could not query Blender status." };
    }
    return await res.json();
  } catch (err) {
    return { available: false, message: "Backend render status service unreachable." };
  }
}

/**
 * Request photorealistic Cycles render from canonical HouseLayout.
 */
export async function renderRealisticPhoto(options: {
  layout: HouseLayout;
  cutaway?: boolean;
  resolution?: string;
  samples?: number;
  lighting?: string;
  projectId?: string;
}): Promise<{
  status: "success" | "blender_not_installed" | "error" | "timeout";
  available?: boolean;
  image_base64?: string;
  message?: string;
  instructions?: string;
  details?: string;
  resolution?: string;
  samples?: number;
}> {
  const url = `${API_BASE_URL}/api/render-realistic`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        layout: options.layout,
        cutaway: options.cutaway ?? true,
        resolution: options.resolution ?? "1920x1080",
        samples: options.samples ?? 64,
        lighting: options.lighting ?? "day",
        project_id: options.projectId,
      }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => null);
      throw new Error(errData?.detail || `Render failed with HTTP ${res.status}`);
    }
    return await res.json();
  } catch (err: any) {
    console.error("[API ERROR] renderRealisticPhoto failed:", err);
    return {
      status: "error",
      message: err.message || "Failed to trigger realistic photo rendering.",
    };
  }
}


