// Streamlined Authentication Context
// Implements unified login flow with consistent user state management

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { apiClient } from '../services/apiClient';
import { handleApiError } from '../utils/errorHandler';
import type { User, LoginCredentials, Session } from '../types/entities';

interface AuthContextType {
  user: User | null;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  isLoading: boolean;
  isAuthenticated: boolean;
  checkSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check for existing session on mount
  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('sessionToken');
      if (!token) {
        setIsLoading(false);
        return;
      }

      const response = await apiClient.get<{ user: User }>('/api/auth/me');
      setUser(response.data.user);
    } catch (error) {
      // Session invalid or expired
      localStorage.removeItem('sessionToken');
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (credentials: LoginCredentials) => {
    setIsLoading(true);
    try {
      const response = await apiClient.post<{ user: User; session: Session }>('/api/auth/login', credentials);
      setUser(response.data.user);
      
      // Store session info
      localStorage.setItem('sessionToken', response.data.session.token);
      
      // Show success message based on auth method
      const welcomeMessage = credentials.method === 'site_password' 
        ? `Welcome, ${response.data.user.username}! You are browsing anonymously.`
        : `Welcome back, ${response.data.user.username}!`;
      
      // Note: Toast notifications will be handled by the components using this context
      console.log(welcomeMessage);
    } catch (error) {
      const message = handleApiError(error);
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      await apiClient.post('/api/auth/logout');
    } catch (error) {
      console.warn('Logout request failed:', error);
    } finally {
      setUser(null);
      localStorage.removeItem('sessionToken');
      // Note: Success message will be handled by the component
    }
  };

  const value: AuthContextType = {
    user,
    login,
    logout,
    isLoading,
    isAuthenticated: !!user,
    checkSession
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Custom hook to use auth context
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Helper hook for protected routes
export const useRequireAuth = (): User => {
  const { user, isLoading } = useAuth();
  
  if (isLoading) {
    throw new Promise(() => {}); // Suspend component until auth check completes
  }
  
  if (!user) {
    throw new Error('Authentication required');
  }
  
  return user;
};

// Helper hook for admin-only features
export const useRequireAdmin = (): User => {
  const user = useRequireAuth();
  
  if (!user.isAdmin) {
    throw new Error('Admin access required');
  }
  
  return user;
};