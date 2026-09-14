import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  api,
  userSchema,
  messageSchema,
  ApiError,
  errorMessage,
  type User,
} from "../../lib/api";

type AuthState = {
  user: User | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clear: () => void;
};
const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const clear = useCallback(() => setUser(null), []);
  useEffect(() => {
    // Remove obsolete tokens when upgrading from the legacy UI.
    localStorage.removeItem("access_token");
    localStorage.removeItem("token_type");
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    api("/auth/me", userSchema, { signal: controller.signal })
      .then(setUser)
      .catch((error) => {
        if (
          !controller.signal.aborted &&
          !(error instanceof ApiError && error.status === 401)
        )
          setError(errorMessage(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    window.addEventListener("session-expired", clear);
    return () => {
      controller.abort();
      window.removeEventListener("session-expired", clear);
    };
  }, [clear, revision]);
  async function login(username: string, password: string) {
    setUser(
      await api("/auth/login", userSchema, {
        method: "POST",
        body: JSON.stringify({ username, password }),
      }),
    );
  }
  async function logout() {
    try {
      await api("/auth/logout", messageSchema, { method: "POST" });
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) throw error;
    }
    clear();
  }
  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        retry: () => setRevision((v) => v + 1),
        login,
        logout,
        clear,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("AuthProvider is required");
  return auth;
}
