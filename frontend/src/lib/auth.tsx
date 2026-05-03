import type { PropsWithChildren } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { hasSupabaseConfig, supabase } from "@/lib/supabaseClient";

const SELECTED_TENANT_KEY = "cv-intelligence.selected-tenant-id";

export type TenantMembership = {
  id: string;
  slug: string;
  name: string;
  iconUrl: string | null;
  role: string;
  status: string;
};

type AuthContextValue = {
  enabled: boolean;
  loading: boolean;
  session: Session | null;
  userEmail: string | null;
  memberships: TenantMembership[];
  adminMemberships: TenantMembership[];
  isAdmin: boolean;
  currentTenant: TenantMembership | null;
  authError: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  bootstrapTenant: (name: string, slug?: string) => Promise<void>;
  selectTenant: (tenantId: string) => void;
  refreshTenantState: () => Promise<void>;
};

type MembershipRow = {
  tenant_id: string;
  role: string;
  status: string;
};

type TenantRow = {
  id: string;
  slug: string;
  name: string;
  icon_url: string | null;
};

type PlatformAdminRow = {
  user_id: string;
};

type AuthContextPayload = {
  memberships?: TenantMembership[];
  is_platform_admin?: boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/g, "")
    .replace(/-+$/g, "")
    .slice(0, 48);
}

function readStoredTenantId() {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(SELECTED_TENANT_KEY);
}

function storeTenantId(tenantId: string | null) {
  if (typeof window === "undefined") {
    return;
  }

  if (!tenantId) {
    window.localStorage.removeItem(SELECTED_TENANT_KEY);
    return;
  }

  window.localStorage.setItem(SELECTED_TENANT_KEY, tenantId);
}

function resolveCurrentTenant(memberships: TenantMembership[]) {
  const storedTenantId = readStoredTenantId();
  const storedMembership = memberships.find((membership) => membership.id === storedTenantId);
  return storedMembership ?? memberships[0] ?? null;
}

function dedupeTenantMemberships(memberships: TenantMembership[]) {
  const membershipByTenantId = new Map<string, TenantMembership>();

  for (const membership of memberships) {
    const current = membershipByTenantId.get(membership.id);
    if (!current || current.role === "platform-admin") {
      membershipByTenantId.set(membership.id, membership);
    }
  }

  return Array.from(membershipByTenantId.values());
}

async function invokePlatform<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  if (!supabase) {
    throw new Error("Missing Supabase browser client configuration.");
  }
  const { data, error } = await supabase.functions.invoke("platform", {
    body: { action, ...body },
  });
  if (error) {
    const response = typeof error === "object" && error !== null && "context" in error ? (error as { context?: Response }).context : null;
    if (response instanceof Response) {
      const payload = await response.clone().json().catch(() => null) as { details?: string; error?: string } | null;
      throw new Error(payload?.details || payload?.error || response.statusText);
    }
    throw error;
  }
  return data as T;
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [loading, setLoading] = useState(hasSupabaseConfig);
  const [session, setSession] = useState<Session | null>(null);
  const [memberships, setMemberships] = useState<TenantMembership[]>([]);
  const [currentTenant, setCurrentTenant] = useState<TenantMembership | null>(null);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const refreshTenantState = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      setSession(null);
      setMemberships([]);
      setCurrentTenant(null);
      setIsPlatformAdmin(false);
      return;
    }

    const {
      data: { session: nextSession },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      setAuthError(sessionError.message);
      setLoading(false);
      return;
    }

    setSession(nextSession);

    if (!nextSession) {
      setMemberships([]);
      setCurrentTenant(null);
      setIsPlatformAdmin(false);
      setAuthError(null);
      storeTenantId(null);
      setLoading(false);
      return;
    }

    const authContext = await invokePlatform<AuthContextPayload>("auth_context").catch((error) => {
      setAuthError(error instanceof Error ? error.message : "Unable to load tenant access.");
      return null;
    });
    if (!authContext) {
      setLoading(false);
      return;
    }

    const nextIsPlatformAdmin = Boolean(authContext.is_platform_admin);
    setIsPlatformAdmin(nextIsPlatformAdmin);
    const merged = dedupeTenantMemberships(authContext.memberships ?? [])
      .sort((left, right) => left.name.localeCompare(right.name));

    if (!merged.length && !nextIsPlatformAdmin) {
      setMemberships([]);
      setCurrentTenant(null);
      setAuthError(null);
      storeTenantId(null);
      setLoading(false);
      return;
    }

    const nextTenant = resolveCurrentTenant(merged);
    setMemberships(merged);
    setCurrentTenant(nextTenant);
    setAuthError(null);
    storeTenantId(nextTenant?.id ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let active = true;
    void refreshTenantState();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) {
        return;
      }

      setSession(nextSession);
      setLoading(true);
      void refreshTenantState();
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [refreshTenantState]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) {
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      throw error;
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    if (!supabase) {
      return null;
    }

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });

    if (error) {
      throw error;
    }

    if (!data.session) {
      return "Account created. Confirm the email if your auth configuration requires verification.";
    }

    return "Account created. You are signed in and can finish tenant setup.";
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) {
      return;
    }

    const { error } = await supabase.auth.signOut();
    if (error) {
      throw error;
    }

    setMemberships([]);
    setCurrentTenant(null);
    storeTenantId(null);
  }, []);

  const bootstrapTenant = useCallback(
    async (name: string, slug?: string) => {
      if (!supabase) {
        return;
      }

      const normalizedName = name.trim();
      const normalizedSlug = slugify(slug?.trim() || normalizedName);

      if (!normalizedName) {
        throw new Error("Tenant name is required.");
      }

      await invokePlatform("bootstrap_tenant", {
        name: normalizedName,
        slug: normalizedSlug,
      });

      await refreshTenantState();
    },
    [refreshTenantState],
  );

  const selectTenant = useCallback(
    (tenantId: string) => {
      const nextTenant = memberships.find((membership) => membership.id === tenantId) ?? null;
      setCurrentTenant(nextTenant);
      storeTenantId(nextTenant?.id ?? null);
    },
    [memberships],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      enabled: hasSupabaseConfig,
      loading,
      session,
      userEmail: session?.user.email ?? null,
      memberships,
      adminMemberships: isPlatformAdmin ? memberships : [],
      isAdmin: isPlatformAdmin,
      currentTenant,
      authError,
      signIn,
      signUp,
      signOut,
      bootstrapTenant,
      selectTenant,
      refreshTenantState,
    }),
    [authError, bootstrapTenant, currentTenant, isPlatformAdmin, loading, memberships, refreshTenantState, selectTenant, session, signIn, signOut, signUp],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
