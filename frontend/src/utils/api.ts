import { HouseLayout, IntakeRequest, Rect } from "@/types/house";

/**
 * Resolves the backend API base URL with support for development and production environments.
 */
function resolveApiBaseUrl(): string {
  const envVal = process.env.NEXT_PUBLIC_API_URL || process.env.VITE_API_URL;
  if (envVal && typeof envVal === "string" && envVal.trim() && envVal !== "undefined" && envVal !== "null") {
    return envVal.trim().replace(/\/+$/, "");
  }
  // In browser runtime:
  if (typeof window !== "undefined") {
    const loc = window.location;
    if (loc.hostname === "127.0.0.1") {
      return `${loc.protocol}//127.0.0.1:8000`;
    }
    if (loc.hostname === "localhost") {
      return `${loc.protocol}//localhost:8000`;
    }
  }
  return "http://localhost:8000";
}

export const API_BASE_URL = resolveApiBaseUrl();

export interface ApiErrorContext {
  url?: string;
  status?: number;
  statusText?: string;
  responseBody?: unknown;
  cause?: unknown;
}

export class ArchitecturalApiError extends Error {
  status?: number;
  url?: string;
  responseBody?: unknown;

  constructor(message: string, context?: ApiErrorContext) {
    super(message);
    this.name = "ArchitecturalApiError";
    this.status = context?.status;
    this.url = context?.url;
    this.responseBody = context?.responseBody;
  }
}

/**
 * Normalizes error messages into user-friendly diagnostic notices
 * without leaking raw system stack traces or generic "Failed to fetch".
 * Distinguishes:
 * 1. Backend unreachable (network error, CORS, port mismatch, mixed content)
 * 2. Backend returned HTTP error (400, 422, 500, etc.)
 * 3. Invalid request / validation failure
 * 4. Backend returned malformed response
 */
export function formatApiError(err: unknown, requestUrl?: string): string {
  const errorRecord = err !== null && typeof err === "object"
    ? err as Record<string, unknown>
    : undefined;
  const status = typeof errorRecord?.status === "number" ? errorRecord.status : undefined;
  const errorUrl = typeof errorRecord?.url === "string" ? errorRecord.url : undefined;
  const targetUrl = requestUrl || errorUrl || API_BASE_URL;

  // 1. Connection / Network / Timeout errors
  const isNetworkError =
    err instanceof TypeError &&
    (err.message.toLowerCase().includes("failed to fetch") ||
      err.message.toLowerCase().includes("network error") ||
      err.message.toLowerCase().includes("load failed"));

  const isAbortError =
    errorRecord?.name === "AbortError" ||
    (err instanceof Error && err.message.toLowerCase().includes("aborted"));

  if (isAbortError) {
    return `Architectural synthesis timed out while communicating with ${targetUrl}. The spatial solver may require more time. Please retry.`;
  }

  if (isNetworkError) {
    // Check for mixed content block (HTTPS frontend -> HTTP backend)
    if (typeof window !== "undefined" && window.location.protocol === "https:" && targetUrl.startsWith("http://")) {
      return `Mixed Content Security Block: This application was loaded over HTTPS (${window.location.origin}), but is configured to connect to an insecure HTTP backend (${targetUrl}). Please configure NEXT_PUBLIC_API_URL to use HTTPS.`;
    }

    // Check for production app pointing to localhost
    if (
      typeof window !== "undefined" &&
      window.location.hostname !== "localhost" &&
      window.location.hostname !== "127.0.0.1" &&
      (targetUrl.includes("localhost") || targetUrl.includes("127.0.0.1"))
    ) {
      return `Backend Connection Error: The frontend is deployed at ${window.location.hostname} but attempting to reach ${targetUrl}. Please configure the NEXT_PUBLIC_API_URL environment variable in your production hosting environment (e.g. Vercel) to point to your live FastAPI backend.`;
    }

    return `Unable to connect to the architectural synthesis backend at ${targetUrl}. Please verify the backend server is active and accessible (e.g., run 'python -m uvicorn main:app --port 8000' in the backend directory).`;
  }

  if (err instanceof Error) {
    const msg = err.message;

    // 2. HTTP Status specific handling
    if (status === 422 || msg.includes("HTTP 422") || msg.toLowerCase().includes("unprocessable entity")) {
      if (msg.includes("PLOT_ENVELOPE_INFEASIBLE") || msg.includes("buildable envelope") || msg.includes("Recommendation:")) {
        return msg.replace(/^Generation failed \(HTTP 422\):?\s*/, "");
      }
      return msg.length > 25 && !msg.startsWith("Generation failed")
        ? msg
        : "Some architectural specifications could not be processed. Please review your plot dimensions and requirements.";
    }

    if (status === 404 || msg.includes("HTTP 404")) {
      return `Architectural API endpoint not found (HTTP 404) at ${targetUrl}. Please verify the backend router configuration.`;
    }

    if (status === 400 || msg.includes("HTTP 400")) {
      return `Invalid architectural request (HTTP 400): ${msg.replace(/^Generation failed \(HTTP 400\):?\s*/, "")}`;
    }

    if (status === 500 || msg === "Generation failed (HTTP 500)") {
      return msg.length > 30 && msg !== "Generation failed (HTTP 500)"
        ? `Architectural solver error: ${msg.replace(/^Generation failed \(HTTP 500\):?\s*/, "")}`
        : "The architectural solver encountered an unexpected condition. Please adjust room counts or setbacks and retry.";
    }

    if (status === 502 || status === 503 || status === 504 || msg.includes("504") || msg.toLowerCase().includes("timeout")) {
      return `Architectural synthesis service is temporarily unavailable or timed out (HTTP ${status || "504"}). Please retry in a moment.`;
    }

    // 3. Malformed responses
    if (msg.toLowerCase().includes("malformed") || msg.toLowerCase().includes("not valid json")) {
      return `Backend returned a malformed or non-JSON response from ${targetUrl}. Please check backend logs.`;
    }

    return msg;
  }

  return "An unexpected error occurred while communicating with the architectural engine.";
}

/**
 * Safely executes a fetch with fallback between localhost and 127.0.0.1 for local dev environments.
 */
export async function fetchWithBackendFallback(
  endpointPath: string,
  init?: RequestInit,
  timeoutMs: number = 75000
): Promise<{ res: Response; url: string }> {
  const primaryUrl = `${API_BASE_URL}${endpointPath}`;
  const urlsToTry = [primaryUrl];

  if (primaryUrl.includes("localhost:8000")) {
    urlsToTry.push(primaryUrl.replace("localhost:8000", "127.0.0.1:8000"));
  } else if (primaryUrl.includes("127.0.0.1:8000")) {
    urlsToTry.push(primaryUrl.replace("127.0.0.1:8000", "localhost:8000"));
  }

  let lastError: unknown = null;

  for (let i = 0; i < urlsToTry.length; i++) {
    const targetUrl = urlsToTry[i];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(targetUrl, {
        ...init,
        signal: controller.signal,
      });
      clearTimeout(timer);
      return { res, url: targetUrl };
    } catch (fetchErr) {
      clearTimeout(timer);
      lastError = fetchErr;
      if (i < urlsToTry.length - 1) {
        console.warn(`[API NOTICE] Request to ${targetUrl} failed, trying fallback ${urlsToTry[i + 1]}...`);
        continue;
      }
    }
  }

  throw lastError;
}

export interface GenerationProgress {
  status: "queued" | "processing" | "completed" | "failed";
  stage: "queued" | "understanding" | "planning" | "solving" | "validating" | "rendering" | "completed" | "failed";
}

interface GenerationJobResponse {
  job_id?: string;
  status?: GenerationProgress["status"];
  stage?: GenerationProgress["stage"];
  result?: HouseLayout;
  error?: unknown;
}

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

async function responseError(res: Response, label: string): Promise<string> {
  try {
    const data = await res.json();
    const detail = data?.detail ?? data?.message ?? data;
    if (typeof detail === "string") return detail;
    if (detail && typeof detail === "object") {
      return String(detail.message ?? detail.designer_rationale ?? JSON.stringify(detail));
    }
  } catch {
    const text = await res.text().catch(() => "");
    if (text) return `${label} (HTTP ${res.status}): ${text.slice(0, 300)}`;
  }
  return `${label} (HTTP ${res.status})`;
}

async function generateLayoutJob(
  endpoint: string,
  request: unknown,
  onProgress?: (progress: GenerationProgress) => void
): Promise<HouseLayout> {
  const targetUrl = `${API_BASE_URL}${endpoint}`;
  try {
    const key = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const { res } = await fetchWithBackendFallback(`${endpoint}?async_job=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify(request),
    }, 30000);

    if (!res.ok) {
      throw new ArchitecturalApiError(
        await responseError(res, "Generation failed"),
        { url: targetUrl, status: res.status }
      );
    }

    const initial = await res.json() as GenerationJobResponse | HouseLayout;
    if (res.status !== 202) {
      return initial as HouseLayout;
    }

    const jobId = (initial as GenerationJobResponse).job_id;
    if (!jobId) {
      throw new ArchitecturalApiError("Backend returned a generation response without a job ID.", { url: targetUrl });
    }
    onProgress?.({ status: "queued", stage: "queued" });

    while (true) {
      await wait(1000);
      const { res: jobRes } = await fetchWithBackendFallback(
        `/api/jobs/${encodeURIComponent(jobId)}`,
        { method: "GET" },
        15000
      );
      if (!jobRes.ok) {
        throw new ArchitecturalApiError(
          await responseError(jobRes, "Could not read generation status"),
          { url: `${API_BASE_URL}/api/jobs/${encodeURIComponent(jobId)}`, status: jobRes.status }
        );
      }

      const job = await jobRes.json() as GenerationJobResponse;
      const status = job.status ?? "processing";
      const stage = job.stage ?? "queued";
      onProgress?.({ status, stage });

      if (status === "completed") {
        if (!job.result) {
          throw new ArchitecturalApiError("Generation completed without a project layout.", { url: targetUrl });
        }
        return job.result;
      }
      if (status === "failed") {
        const detail = job.error && typeof job.error === "object"
          ? (job.error as { message?: string; designer_rationale?: string }).message
            ?? (job.error as { designer_rationale?: string }).designer_rationale
            ?? JSON.stringify(job.error)
          : String(job.error ?? "Architectural generation failed.");
        throw new ArchitecturalApiError(detail, { url: targetUrl });
      }
    }
  } catch (err) {
    console.error("[API ERROR] generation job failed:", { url: targetUrl, error: err });
    throw new Error(formatApiError(err, targetUrl));
  }
}

/**
 * Generate a new architectural house layout from intake specifications.
 */
export async function generateHouseLayout(
  req: IntakeRequest,
  onProgress?: (progress: GenerationProgress) => void
): Promise<HouseLayout> {
  return generateLayoutJob("/api/generate", req, onProgress);
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

export interface ServerProjectSummary {
  id: string;
  title: string;
  updatedAt: string;
  areaSqft?: number;
  bedrooms?: number;
  floors?: number;
}

export async function fetchProjectSummaries(): Promise<ServerProjectSummary[]> {
  const { res } = await fetchWithBackendFallback("/api/projects?limit=100", { method: "GET" }, 15000);
  if (!res.ok) {
    throw new Error(await responseError(res, "Could not load projects"));
  }
  const data = await res.json() as { projects?: ServerProjectSummary[] };
  if (!Array.isArray(data.projects)) {
    throw new Error("Backend returned an invalid project list.");
  }
  return data.projects;
}

/**
 * Persist a project layout to the backend server.
 */
export async function saveProjectToServer(layout: HouseLayout): Promise<HouseLayout | null> {
  const url = `${API_BASE_URL}/api/projects`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(layout),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn(`[API NOTICE] Could not save project ${layout.id} to server:`, err);
    return null;
  }
}

/**
 * Permanently delete a project from backend server storage.
 */
export async function deleteProjectApi(projectId: string): Promise<void> {
  const url = `${API_BASE_URL}/api/projects/${encodeURIComponent(projectId)}`;
  try {
    const { res } = await fetchWithBackendFallback(`/api/projects/${encodeURIComponent(projectId)}`, { method: "DELETE" });
    if (!res.ok) {
      throw new Error(await responseError(res, "Project deletion failed"));
    }
  } catch (err) {
    console.error(`[API ERROR] Could not delete project ${projectId} on server:`, err);
    throw new Error(formatApiError(err, url));
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
  brief: import("@/types/house").DreamHomeStructuredRequirements,
  onProgress?: (progress: GenerationProgress) => void
): Promise<HouseLayout> {
  return generateLayoutJob("/api/dream-home/generate", brief, onProgress);
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


// ============================================================
// PROJECT EDIT API — Full cascade with revision tracking
// ============================================================

export interface EditStage {
  stage: string;
  status: "ok" | "warning" | "failed" | "skipped";
  label: string;
  warnings?: string[];
  error?: string;
}

export interface ProjectEditRequest {
  edit_instruction: string;
  current_layout?: HouseLayout;
  target_room_id?: string;
  target_entity_id?: string;
}

export interface ProjectEditResult {
  status: "ok" | "rejected";
  project_id: string;
  layout?: HouseLayout;
  diff?: Record<string, unknown>;
  stages: EditStage[];
  revision_id?: string;
  version_number?: number;
  reason?: string;
}

export interface ProjectEditIntentPreview {
  instruction: string;
  intent: Record<string, unknown>;
}

export async function previewProjectEditIntent(
  projectId: string,
  req: ProjectEditRequest
): Promise<ProjectEditIntentPreview> {
  const url = `${API_BASE_URL}/api/projects/${encodeURIComponent(projectId)}/edit-intent`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || data.message || `Edit intent failed (HTTP ${res.status})`);
    }
    return data as ProjectEditIntentPreview;
  } catch (err) {
    throw new Error(formatApiError(err));
  }
}

/**
 * Applies a natural-language edit to the canonical HouseLayout.
 * Returns new HouseLayout revision + cascade stage updates.
 * On invalid edit, returns old layout with rejection reason.
 */
export async function applyProjectEdit(
  projectId: string,
  req: ProjectEditRequest
): Promise<ProjectEditResult> {
  const url = `${API_BASE_URL}/api/projects/${encodeURIComponent(projectId)}/edit`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    // 422 = rejected but with data — parse it
    if (!res.ok && res.status !== 422) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || errData.message || errData.reason || `Edit failed (HTTP ${res.status})`);
    }

    return await res.json();
  } catch (err) {
    throw new Error(formatApiError(err));
  }
}

export async function generateMepPlan(layout: HouseLayout): Promise<HouseLayout> {
  const url = `${API_BASE_URL}/api/mep/plan`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(layout),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || data.message || `MEP planning failed (HTTP ${res.status})`);
    }
    return data as HouseLayout;
  } catch (err) {
    throw new Error(formatApiError(err));
  }
}

export interface DesignScheme {
  id: string;
  name: string;
  concept: string;
  characteristics: string[];
  validation_status: "valid" | "invalid";
  validation_message?: string;
  layout: HouseLayout;
}

export interface DesignSchemesResult {
  schemes: DesignScheme[];
  requested_variants: number;
  generated_variants: number;
  generation_warning?: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHouseLayout(value: unknown): value is HouseLayout {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.title === "string"
    && typeof value.plot_width === "number"
    && typeof value.plot_length === "number"
    && Array.isArray(value.rooms)
    && Array.isArray(value.floors)
    && isRecord(value.stats);
}

export async function generateDesignSchemes(
  layout: HouseLayout,
  vastuEnabled: boolean
): Promise<DesignSchemesResult> {
  const endpoint = `/api/design-schemes?count=4&vastu_enabled=${vastuEnabled}`;
  let targetUrl = `${API_BASE_URL}${endpoint}`;
  try {
    const { res, url } = await fetchWithBackendFallback(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(layout),
    }, 90000);
    targetUrl = url;

    const data: unknown = await res.json();
    if (!res.ok) {
      const detail = isRecord(data) ? data.detail || data.message : undefined;
      const structuredError = isRecord(detail)
        ? detail
        : isRecord(data) && (typeof data.code === "string" || Array.isArray(data.reasons))
          ? data
          : undefined;
      const detailMessage = structuredError
        ? [
            typeof structuredError.message === "string" ? structuredError.message : undefined,
            ...(Array.isArray(structuredError.reasons)
              ? structuredError.reasons.filter((item): item is string => typeof item === "string")
              : []),
          ].filter(Boolean).join("\n")
        : typeof detail === "string" ? detail : undefined;
      throw new ArchitecturalApiError(
        detailMessage || `Scheme generation failed (HTTP ${res.status})`,
        { url: targetUrl, status: res.status }
      );
    }
    const rawSchemes = Array.isArray(data)
      ? data
      : isRecord(data) && Array.isArray(data.schemes)
        ? data.schemes
        : [];
    const schemes = rawSchemes.filter(isRecord).map((entry): DesignScheme => {
      if (!isHouseLayout(entry.layout)) {
        throw new Error("The architectural engine returned a scheme without a canonical HouseLayout.");
      }
      const rawCharacteristics = entry.characteristics;
      const characteristics = Array.isArray(rawCharacteristics)
        ? rawCharacteristics.filter((item): item is string => typeof item === "string")
        : isRecord(rawCharacteristics)
          ? [
              ...(Array.isArray(rawCharacteristics.tags)
                ? rawCharacteristics.tags.filter((item): item is string => typeof item === "string")
                : []),
              ...(Array.isArray(rawCharacteristics.feature_summary)
                ? rawCharacteristics.feature_summary.filter((item): item is string => typeof item === "string")
                : []),
            ]
          : [];
      const validation = entry.validation_status;
      const validationStatus = typeof validation === "string"
        ? validation.toLowerCase() === "valid" ? "valid" : "invalid"
        : isRecord(validation) && validation.is_valid === true ? "valid" : "invalid";
      const messages = isRecord(validation)
        ? [
            ...(Array.isArray(validation.hard_failures) ? validation.hard_failures : []),
            ...(Array.isArray(validation.errors) ? validation.errors : []),
          ].filter((item): item is string => typeof item === "string")
        : [];
      return {
        id: typeof entry.id === "string" ? entry.id : "",
        name: typeof entry.name === "string" ? entry.name : "",
        concept: typeof entry.concept === "string" ? entry.concept : "",
        characteristics,
        validation_status: validationStatus,
        validation_message: messages.join("; ") || undefined,
        layout: entry.layout,
      };
    });
    const validSchemes = schemes.filter((scheme) => scheme.validation_status === "valid" && scheme.layout);
    if (validSchemes.length === 0) {
      throw new Error(
        isRecord(data) && typeof data.generation_warning === "string"
          ? data.generation_warning
          : "The architectural engine returned no valid design schemes."
      );
    }
    return {
      schemes: validSchemes,
      requested_variants: isRecord(data) && typeof data.requested_variants === "number"
        ? data.requested_variants
        : 4,
      generated_variants: isRecord(data) && typeof data.generated_variants === "number"
        ? data.generated_variants
        : validSchemes.length,
      generation_warning: isRecord(data) && typeof data.generation_warning === "string"
        ? data.generation_warning
        : null,
    };
  } catch (err) {
    throw new Error(formatApiError(err, targetUrl));
  }
}
