import { useCallback } from 'react';
import { useAppActions, useAppSelectors } from '../store/hooks';

export const useAuth = () => {
  const { auth } = useAppSelectors();
  const { auth: authActions } = useAppActions();

  const login = useCallback(async (email: string, password: string) => {
    try {
      await authActions.signIn({ email, password });
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  }, [authActions.signIn]);

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    try {
      await authActions.signUp({ name, email, password });
    } catch (error) {
      console.error('Sign up failed:', error);
      throw error;
    }
  }, [authActions.signUp]);

  const logout = useCallback(async () => {
    try {
      await authActions.logout();
    } catch (error) {
      console.error('Logout failed:', error);
      throw error;
    }
  }, [authActions.logout]);

  const clearError = useCallback(() => {
    authActions.clearError();
  }, [authActions.clearError]);

  return {
    token: auth.token,
    isAuthenticated: auth.isAuthenticated,
    loading: auth.authLoading,
    error: auth.authError,
    login,
    signUp,
    logout,
    clearError,
  };
};