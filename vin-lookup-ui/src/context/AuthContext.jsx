import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { login as apiLogin, signup as apiSignup, getMe, setAuthToken } from '../api';

const AUTH_TOKEN_KEY = 'auth_token';
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadSession = useCallback(async () => {
    const stored = localStorage.getItem(AUTH_TOKEN_KEY);
    if (stored) setAuthToken(stored);
    try {
      const data = await getMe();
      if (data && data.id && data.email && data.role) {
        setUser({ id: data.id, email: data.email, role: data.role });
      } else {
        setUser(null);
        setAuthToken(null);
        localStorage.removeItem(AUTH_TOKEN_KEY);
      }
    } catch {
      setUser(null);
      setAuthToken(null);
      localStorage.removeItem(AUTH_TOKEN_KEY);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const login = useCallback(async (credentials) => {
    const data = await apiLogin(credentials);
    if (data && data.token && data.user) {
      setAuthToken(data.token);
      localStorage.setItem(AUTH_TOKEN_KEY, data.token);
      setUser({ id: data.user.id, email: data.user.email, role: data.user.role });
      return data.user;
    }
    return null;
  }, []);

  const signup = useCallback(async (credentials) => {
    const data = await apiSignup(credentials);
    if (data && data.token && data.user) {
      setAuthToken(data.token);
      localStorage.setItem(AUTH_TOKEN_KEY, data.token);
      setUser({ id: data.user.id, email: data.user.email, role: data.user.role });
      return data.user;
    }
    return null;
  }, []);

  const logout = useCallback(() => {
    setAuthToken(null);
    localStorage.removeItem(AUTH_TOKEN_KEY);
    setUser(null);
  }, []);

  const value = { user, loading, login, signup, logout };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
