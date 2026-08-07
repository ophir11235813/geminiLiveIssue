import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api, getToken, setToken, clearToken } from '../api/client';

export interface User {
  id: string;
  email: string;
  status: 'pending' | 'approved' | 'revoked';
  role: 'admin' | 'user';
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // No stored token means we're definitely logged out — skip the network
    // round trip (and the pointless 401) and just settle immediately.
    if (!getToken()) {
      setLoading(false);
      return;
    }
    api
      .get('/auth/me')
      .then((data) => setUser(data.user))
      .catch(() => {
        clearToken();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const data = await api.post('/auth/login', { email, password });
    setToken(data.token);
    setUser(data.user);
  }

  async function signup(email: string, password: string) {
    const data = await api.post('/auth/signup', { email, password });
    setToken(data.token);
    setUser(data.user);
  }

  async function logout() {
    try {
      await api.post('/auth/logout');
    } finally {
      clearToken();
      setUser(null);
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
