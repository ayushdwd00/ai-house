/**
 * AI HOUSE - Supabase Client & Authentication Integration
 *
 * Provides typed, zero-dependency authentication and session management
 * compatible with Supabase Auth GoTrue REST API.
 * When NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are provided,
 * auth requests seamlessly communicate with Supabase.
 * In local dev without credentials, gracefully falls back to unauthenticated mode.
 */

export interface SupabaseUser {
  id: string;
  email?: string;
  role?: string;
  created_at?: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
}

export interface SupabaseSession {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  user: SupabaseUser;
}

const STORAGE_KEY_TOKEN = "atelier_archai_auth_token";
const STORAGE_KEY_USER = "atelier_archai_auth_user";

export function getSupabaseConfig(): { url: string; anonKey: string; isConfigured: boolean } {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  const isConfigured = Boolean(url && anonKey && !url.includes("your-project.supabase.co"));
  return { url, anonKey, isConfigured };
}

/**
 * Returns current access token from localStorage (if any).
 */
export function getStoredAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(STORAGE_KEY_TOKEN);
  } catch {
    return null;
  }
}

/**
 * Returns current authenticated user profile from localStorage (if any).
 */
export function getStoredAuthUser(): SupabaseUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_USER);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Saves authenticated session tokens to local storage.
 */
export function setStoredSession(session: SupabaseSession | null): void {
  if (typeof window === "undefined") return;
  try {
    if (session?.access_token) {
      localStorage.setItem(STORAGE_KEY_TOKEN, session.access_token);
      localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(session.user));
    } else {
      localStorage.removeItem(STORAGE_KEY_TOKEN);
      localStorage.removeItem(STORAGE_KEY_USER);
    }
  } catch (err) {
    console.error("[Auth] Failed to update stored session", err);
  }
}

/**
 * Generates authorization headers to attach to backend API requests.
 * If authenticated, returns { Authorization: "Bearer <token>" }.
 * Otherwise, returns empty object.
 */
export function getAuthHeaders(): Record<string, string> {
  const token = getStoredAuthToken();
  if (token && token.trim()) {
    return { Authorization: `Bearer ${token.trim()}` };
  }
  return {};
}

/**
 * Supabase Auth API Client
 */
export const supabaseAuth = {
  isConfigured(): boolean {
    return getSupabaseConfig().isConfigured;
  },

  async signUp(email: string, password: string):Promise<{ user: SupabaseUser | null; session: SupabaseSession | null; error?: string }> {
    const { url, anonKey, isConfigured } = getSupabaseConfig();
    if (!isConfigured) {
      return { user: null, session: null, error: "Supabase credentials are not configured in environment." };
    }

    try {
      const res = await fetch(`${url}/auth/v1/signup`, {
        method: "POST",
        headers: {
          "apikey": anonKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { user: null, session: null, error: data.error_description || data.msg || data.message || "Sign up failed" };
      }

      if (data.access_token && data.user) {
        const session: SupabaseSession = {
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_in: data.expires_in,
          user: data.user,
        };
        setStoredSession(session);
        return { user: data.user, session };
      }

      return { user: data.user || data, session: null };
    } catch (err: unknown) {
      return { user: null, session: null, error: (err as Error)?.message || "Network error during sign up" };
    }
  },

  async signInWithPassword(email: string, password: string): Promise<{ user: SupabaseUser | null; session: SupabaseSession | null; error?: string }> {
    const { url, anonKey, isConfigured } = getSupabaseConfig();
    if (!isConfigured) {
      return { user: null, session: null, error: "Supabase credentials are not configured in environment." };
    }

    try {
      const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: {
          "apikey": anonKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { user: null, session: null, error: data.error_description || data.msg || data.message || "Invalid credentials" };
      }

      const session: SupabaseSession = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in,
        user: data.user,
      };
      setStoredSession(session);
      return { user: data.user, session };
    } catch (err: unknown) {
      return { user: null, session: null, error: (err as Error)?.message || "Network error during sign in" };
    }
  },

  async signOut(): Promise<void> {
    const { url, anonKey, isConfigured } = getSupabaseConfig();
    const token = getStoredAuthToken();
    setStoredSession(null);

    if (isConfigured && token) {
      try {
        await fetch(`${url}/auth/v1/logout`, {
          method: "POST",
          headers: {
            "apikey": anonKey,
            "Authorization": `Bearer ${token}`,
          },
        });
      } catch {
        // Local token cleared regardless of remote network status
      }
    }
  },
};
