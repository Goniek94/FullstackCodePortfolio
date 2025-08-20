import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  setAuthData, 
  clearAuthData, 
  getUserData, 
  isAuthenticated as checkAuth,
  isAuthenticatedSync,
  refreshUserData
} from '../services/api/config';
import AuthService from '../services/api/authApi';

// Create Auth Context
const AuthContext = createContext();

// AuthProvider Component - wraps entire app
export const AuthProvider = ({ children }) => {
  // State management
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Initialize auth state on app start
  useEffect(() => {
    initializeAuth();
  }, []);

  // Initialize authentication state
  const initializeAuth = async () => {
    try {
      // Najpierw sprawdź synchronicznie czy mamy dane w localStorage
      const localUserData = getUserData();
      
      if (localUserData) {
        // Ustaw tymczasowo dane z localStorage
        setUser(localUserData);
        setIsAuthenticated(true);
      }
      
      // Następnie sprawdź przez API czy sesja jest nadal ważna
      const authenticated = await checkAuth();
      
      if (authenticated) {
        // Sesja jest ważna - odśwież dane użytkownika
        const freshUserData = await refreshUserData();
        if (freshUserData) {
          setUser(freshUserData);
          setIsAuthenticated(true);
        }
      } else {
        // Sesja nieważna - wyczyść stan
        clearAuthData();
        setUser(null);
        setIsAuthenticated(false);
      }
    } catch (error) {
      console.error('Error initializing auth:', error);
      clearAuthData();
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  // Login function - handles API call and state update
  const login = async (email, password) => {
    try {
      setError(null);
      setIsLoading(true);
      
      // Użyj AuthService zamiast fetch - wszystko przez apiClient z axios
      const data = await AuthService.login(email, password);

      // Update state
      setUser(data.user);
      setIsAuthenticated(true);

      console.log('User logged in successfully:', data.user.email);
      return data;
    } catch (error) {
      console.error('Login error:', error);
      setError(error.message || 'Failed to login');
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Register function
  const register = async (userData) => {
    try {
      setError(null);
      setIsLoading(true);
      
      // Użyj AuthService zamiast fetch - wszystko przez apiClient z axios
      const data = await AuthService.register(userData);

      // Po rejestracji użytkownik może być automatycznie zalogowany
      if (data.user) {
        setUser(data.user);
        setIsAuthenticated(true);
      }

      console.log('User registered successfully:', data.user?.email);
      return data;
    } catch (error) {
      console.error('Registration error:', error);
      setError(error.message || 'Failed to register');
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Logout function
  const logout = async () => {
    try {
      setIsLoading(true);
      
      // Użyj AuthService zamiast fetch - wszystko przez apiClient z axios
      await AuthService.logout();
      
      // Reset state
      setUser(null);
      setIsAuthenticated(false);
      setError(null);

      console.log('User logged out successfully');
      
      // Don't redirect to login page - stay on current page or go to home
      // The user should be able to browse the site without being forced to login
      
    } catch (error) {
      console.error('Logout error:', error);
      // Wyloguj lokalnie nawet jeśli wystąpił błąd
      clearAuthData();
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  // Update user data (for profile updates)
  const updateUser = (updatedUserData) => {
    try {
      const newUserData = { ...user, ...updatedUserData };
      
      // Zapisz zaktualizowane dane (bez tokenów)
      setAuthData(newUserData);
      setUser(newUserData);
      
      console.log('User data updated:', newUserData);
    } catch (error) {
      console.error('Error updating user:', error);
      setError('Failed to update user data');
    }
  };

  // Refresh user data from server
  const refreshUser = async () => {
    try {
      const userData = await refreshUserData();
      if (userData) {
        setUser(userData);
        return userData;
      }
      return null;
    } catch (error) {
      console.error('Error refreshing user data:', error);
      return null;
    }
  };

  // Check if user has specific role
  const hasRole = (requiredRole) => {
    if (!user || !user.role) return false;
    
    // Handle array of roles
    if (Array.isArray(requiredRole)) {
      return requiredRole.includes(user.role);
    }
    
    return user.role === requiredRole;
  };

  // Check if user is admin
  const isAdmin = () => {
    return hasRole('admin');
  };

  // Check if user is moderator or admin
  const isModerator = () => {
    return hasRole(['admin', 'moderator']);
  };

  // Get user's full name
  const getUserDisplayName = () => {
    if (!user) return '';
    return user.firstName && user.lastName 
      ? `${user.firstName} ${user.lastName}`
      : user.name || user.email || 'User';
  };

  // Context value
  const value = {
    // State
    user,
    isAuthenticated,
    isLoading,
    error,
    
    // Actions
    login,
    register,
    logout,
    updateUser,
    refreshUser,
    
    // Utilities
    hasRole,
    isAdmin,
    isModerator,
    getUserDisplayName,
    
    // Clear error
    clearError: () => setError(null)
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// Custom hook to use Auth Context
export const useAuth = () => {
  const context = useContext(AuthContext);
  
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  
  return context;
};

// HOC for components that require authentication
export const withAuth = (Component) => {
  return function AuthenticatedComponent(props) {
    const { isAuthenticated, isLoading } = useAuth();
    
    if (isLoading) {
      return <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>;
    }
    
    if (!isAuthenticated) {
      return <div className="text-center p-8">
        <p className="text-gray-600">You need to be logged in to access this page.</p>
      </div>;
    }
    
    return <Component {...props} />;
  };
};

export default AuthContext;
