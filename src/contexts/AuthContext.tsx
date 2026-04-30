import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  role: string;
  personal_organization_id: string | null;
}

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isAdmin: boolean;
  loading: boolean;
  sessionReady: boolean;
  signUp: (email: string, password: string, displayName: string) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

function deriveIsAdmin(user: User | null, profile: Profile | null): boolean {
  if (!user) return false;
  if (profile?.role === 'admin' || profile?.role === 'super_admin') return true;
  const role = user.app_metadata?.role;
  return role === 'admin' || role === 'super_admin';
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionReady, setSessionReady] = useState(false);

  const isAdmin = deriveIsAdmin(user, profile);

  const loadProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('id, email, display_name, avatar_url, role, personal_organization_id')
      .eq('id', userId)
      .maybeSingle();
    setProfile(data as Profile | null);
  }, []);

  useEffect(() => {
    let subscription: { unsubscribe: () => void } | null = null;

    const timeout = setTimeout(() => {
      setSessionReady(true);
      setLoading(false);
    }, 3000);

    try {
      supabase.auth.getSession().then(({ data: { session: s } }) => {
        clearTimeout(timeout);
        setSession(s);
        setUser(s?.user ?? null);
        setSessionReady(true);
        if (s?.user) {
          loadProfile(s.user.id).finally(() => setLoading(false));
        } else {
          setLoading(false);
        }
      }).catch(() => {
        clearTimeout(timeout);
        setSessionReady(true);
        setLoading(false);
      });

      const { data } = supabase.auth.onAuthStateChange((_event, s) => {
        setSession(s);
        setUser(s?.user ?? null);
        if (s?.user) {
          (async () => {
            await loadProfile(s.user.id);
            setLoading(false);
          })();
        } else {
          setProfile(null);
          setLoading(false);
        }
      });
      subscription = data.subscription;
    } catch {
      clearTimeout(timeout);
      setSessionReady(true);
      setLoading(false);
    }

    return () => {
      clearTimeout(timeout);
      subscription?.unsubscribe();
    };
  }, [loadProfile]);

  async function signUp(email: string, password: string, displayName: string) {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    });
    return { error: error?.message ?? null };
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }

  async function signOut() {
    setProfile(null);
    await supabase.auth.signOut();
  }

  async function refreshProfile() {
    if (user) await loadProfile(user.id);
  }

  return (
    <AuthContext.Provider value={{ user, session, profile, isAdmin, loading, sessionReady, signUp, signIn, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
