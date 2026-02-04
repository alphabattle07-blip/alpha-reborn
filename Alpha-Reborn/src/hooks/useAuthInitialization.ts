import { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { initializeAuthState, RootState, AppDispatch } from '../store';
import storageService from '../services/local/storageService';

export const useAuthInitialization = () => {
  const dispatch = useDispatch<AppDispatch>();
  const [isInitializing, setIsInitializing] = useState(true);
  const [hasError, setHasError] = useState(false);
  
  const token = useSelector((state: RootState) => state.auth?.token);
  const authInitialized = useSelector((state: RootState) => state.auth?.initialized);

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        console.log('[useAuthInitialization] Starting auth initialization...');
        
        // First, try to get token directly from storage
        const storedToken = await storageService.getToken();
        console.log('[useAuthInitialization] Token from storage:', storedToken);
        
        if (storedToken) {
          // Dispatch login action with the stored token
          dispatch({ type: 'auth/login', payload: storedToken });
          console.log('[useAuthInitialization] Auth state updated with stored token');
        } else {
          console.log('[useAuthInitialization] No token found in storage');
        }
        
        // Also run the store initialization for consistency
        await initializeAuthState();
        
        setIsInitializing(false);
      } catch (error) {
        console.error('[useAuthInitialization] Error during initialization:', error);
        setHasError(true);
        setIsInitializing(false);
      }
    };

    initializeAuth();
  }, [dispatch]);

  return {
    isInitializing,
    hasError,
    token,
    authInitialized,
    isAuthenticated: !!token,
  };
};