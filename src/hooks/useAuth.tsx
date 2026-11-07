import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AppRole = "admin" | "student";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  role: AppRole | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);
  // Tracks whose role is loaded, so a token refresh doesn't show the loading screen again.
  const loadedUserId = useRef<string | null>(null);

  const fetchRole = async (userId: string) => {
    // A user could briefly have more than one role row; admin wins.
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    if (error) {
      console.error("Failed to load user role:", error);
      setRole(null);
      return;
    }

    const roles = (data ?? []).map((r) => r.role as AppRole);
    setRole(roles.includes("admin") ? "admin" : "student");
  };

  // Keep `loading` true until the role is known; otherwise admin pages redirect away
  // on a refresh before the role arrives.
  const loadUser = (userId: string) => {
    if (loadedUserId.current === userId) return;
    loadedUserId.current = userId;
    setLoading(true);
    fetchRole(userId).finally(() => setLoading(false));
  };

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        if (loadedUserId.current !== session.user.id) setLoading(true);
        // Deferred so Supabase calls don't run inside the auth callback.
        setTimeout(() => loadUser(session.user.id), 0);
      } else {
        loadedUserId.current = null;
        setRole(null);
        setLoading(false);
      }
    });

    void supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) loadUser(session.user.id);
      else setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    return { error: error as Error | null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user, role, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
