"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { createClient } from "@/integrations/supabase/client";

export type AppRole =
  | "admin"
  | "hr"
  | "exec"
  | "gm"
  | "gm_ea"
  | "director"
  | "group_manager";

export const ALL_ROLES: AppRole[] = [
  "admin",
  "gm",
  "gm_ea",
  "director",
  "group_manager",
  "hr",
  "exec",
];

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Administrator",
  gm: "General Manager",
  gm_ea: "GM Executive Assistant",
  director: "Director",
  group_manager: "Group Manager",
  hr: "HR Account Manager",
  exec: "Executive",
};

// Roles allowed to access submission content (admin is intentionally excluded).
export const CONTENT_ROLES: AppRole[] = [
  "hr",
  "exec",
  "gm",
  "gm_ea",
  "director",
  "group_manager",
];

export function isAdminOnly(roles: AppRole[]) {
  return roles.length > 0 && roles.every((r) => r === "admin");
}

interface AuthState {
  session: Session | null;
  user: User | null;
  roles: AppRole[];
  loading: boolean;
  signOut: () => Promise<void>;
  refreshRoles: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchRoles(userId: string): Promise<AppRole[]> {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      if (error) {
        console.error("Failed to fetch roles", error);
        return [];
      }
      return (data ?? []).map((r) => r.role as AppRole);
    }

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession?.user) {
        setTimeout(() => {
          fetchRoles(newSession.user.id).then(setRoles);
        }, 0);
      } else {
        setRoles([]);
      }
    });

    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session?.user) {
        setRoles(await fetchRoles(data.session.user.id));
      }
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  const value: AuthState = {
    session,
    user: session?.user ?? null,
    roles,
    loading,
    signOut: async () => {
      await supabase.auth.signOut();
    },
    refreshRoles: async () => {
      if (session?.user) {
        const { data } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", session.user.id);
        setRoles((data ?? []).map((r) => r.role as AppRole));
      }
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export function hasAnyRole(roles: AppRole[], allowed: AppRole[]) {
  return roles.some((r) => allowed.includes(r));
}
