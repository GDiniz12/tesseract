import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../types';
import { storage } from '../services/storage';
import { api, initApiConfig, setApiBaseUrl, getApiBaseUrl, DEFAULT_PROD_URL } from '../services/api';

interface AuthContextData {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  apiUrl: string;
  login: (email: string, pass: string) => Promise<void>;
  registerUser: (email: string, pass: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  updateApiUrl: (url: string) => Promise<void>;
  checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextData>({} as AuthContextData);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [apiUrl, setApiUrlState] = useState<string>(DEFAULT_PROD_URL);

  const checkAuth = async () => {
    try {
      setIsLoading(true);
      await initApiConfig();
      const currentUrl = getApiBaseUrl();
      setApiUrlState(currentUrl);

      const savedToken = await storage.getToken();
      if (!savedToken) {
        setUser(null);
        setToken(null);
        setIsLoading(false);
        return;
      }

      setToken(savedToken);
      const userData = await api<User>('/auth/me');
      setUser(userData);
    } catch (err: any) {
      console.warn('Auth verification failed:', err.message);
      // If unauthorized, clear saved token
      if (err.message?.includes('401') || err.message?.includes('invalid') || err.message?.includes('Token')) {
        await storage.removeToken();
        setToken(null);
        setUser(null);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const login = async (email: string, pass: string) => {
    const data = await api<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: email.trim(), password: pass }),
    });

    if (data.token) {
      await storage.setToken(data.token);
      setToken(data.token);
      setUser(data.user);
    }
  };

  const registerUser = async (email: string, pass: string, name?: string) => {
    const data = await api<{ token: string; user: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: email.trim(),
        password: pass,
        name: name?.trim() || undefined,
      }),
    });

    if (data.token) {
      await storage.setToken(data.token);
      setToken(data.token);
      setUser(data.user);
    }
  };

  const logout = async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } finally {
      await storage.removeToken();
      setToken(null);
      setUser(null);
    }
  };

  const updateApiUrl = async (newUrl: string) => {
    setApiBaseUrl(newUrl);
    await storage.setApiUrl(newUrl);
    setApiUrlState(getApiBaseUrl());
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        apiUrl,
        login,
        registerUser,
        logout,
        updateApiUrl,
        checkAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
