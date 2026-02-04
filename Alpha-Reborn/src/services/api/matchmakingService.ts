import axios from 'axios';
import { API_BASE_URL } from '../../config/api';
import * as SecureStore from 'expo-secure-store';

export interface MatchmakingResponse {
    success: boolean;
    matched: boolean;
    game?: any;
    message: string;
    queuePosition?: number;
    inQueue?: boolean;
}

class MatchmakingService {
    private api = axios.create({
        baseURL: `${API_BASE_URL}/api/matchmaking`,
        headers: {
            'Content-Type': 'application/json',
        },
    });

    constructor() {
        // Add auth token to requests
        this.api.interceptors.request.use(async (config) => {
            try {
                const token = await SecureStore.getItemAsync('token');
                if (token) {
                    config.headers.Authorization = `Bearer ${token}`;
                }
            } catch (error) {
                console.error('Error fetching token for matchmaking service:', error);
            }
            return config;
        });
    }

    async startMatchmaking(gameType: string): Promise<MatchmakingResponse> {
        console.log('[MatchmakingService] Starting matchmaking for:', gameType);
        try {
            // Check if token exists before making request
            const token = await SecureStore.getItemAsync('token');
            if (!token) {
                throw new Error('Not authenticated. Please log in again.');
            }

            const response = await this.api.post('/start', { gameType });
            console.log('[MatchmakingService] Matchmaking response:', response.data);
            return response.data;
        } catch (error: any) {
            console.error('[MatchmakingService] Failed to start matchmaking:', error.response?.data || error.message);

            // Handle authentication errors specifically
            if (error.response?.status === 401 || error.response?.status === 403) {
                // Token is invalid or expired, clear it
                await SecureStore.deleteItemAsync('token');
                throw new Error('Session expired. Please log in again.');
            }

            throw error;
        }
    }

    async cancelMatchmaking(): Promise<{ success: boolean; message: string }> {
        try {
            const response = await this.api.post('/cancel');
            return response.data;
        } catch (error: any) {
            console.error('[MatchmakingService] Failed to cancel matchmaking:', error.response?.data || error.message);
            throw error;
        }
    }

    async checkMatchmakingStatus(gameType: string): Promise<MatchmakingResponse> {
        try {
            const response = await this.api.get('/status', {
                params: { gameType }
            });
            return response.data;
        } catch (error: any) {
            console.error('[MatchmakingService] Failed to check status:', error.response?.data || error.message);
            throw error;
        }
    }
}

export const matchmakingService = new MatchmakingService();
