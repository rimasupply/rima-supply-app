import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api } from "./api";
import rimaLogo from "./assets/rima-logo.jpg";

export type AuthUser = {
  id: number;
  username: string;
  displayName: string;
  role: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.me({});
        if (!cancelled) setUser(res.user ?? null);
      } catch {
        // AuthError / network failure: treat as signed out.
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = async (username: string, password: string) => {
    try {
      const res = await api.login({ username, password });
      if (res.ok && res.user) {
        setUser(res.user);
        return { ok: true as const };
      }
      return { ok: false as const, error: res.error ?? "Sign in failed." };
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : "Sign in failed.",
      };
    }
  };

  const logout = async () => {
    try {
      await api.logout({});
    } catch {
      // Session may already be gone; still clear local state.
    } finally {
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    const result = await login(username.trim(), password);
    setPending(false);
    if (!result.ok) setError(result.error ?? "Sign in failed.");
  };

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={submit} aria-label="Sign in to RIMA Supply">
        <img src={rimaLogo} alt="RIMA Supply Company" className="login-logo" />
        <p className="login-kicker">STORE APP</p>
        <h1>Sign in</h1>
        <label>
          <span>Username</span>
          <input
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Your username"
          />
        </label>
        <label>
          <span>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password"
          />
        </label>
        {error ? (
          <p className="form-error login-error" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" className="primary-button login-button" disabled={pending || !username.trim() || !password}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="login-screen" aria-label="Loading">
        <div className="auth-spinner" role="status" aria-label="Loading RIMA Supply" />
      </div>
    );
  }
  if (!user) return <LoginPage />;
  return <>{children}</>;
}
