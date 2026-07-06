export interface User {
    id: string;
    username: string;
    email: string;
}

export interface SessionInfo {
    authenticated: boolean;
    user?: User;
}

const API_BASE = '/api';

export class AuthService {
    static async getSession(): Promise<SessionInfo> {
        try {
            const response = await fetch(`${API_BASE}/auth/session`, {
                credentials: 'include',
            });
            if (!response.ok) {
                return { authenticated: false };
            }
            return response.json();
        } catch (error) {
            console.error('Failed to fetch session:', error);
            return { authenticated: false };
        }
    }

    static login(returnUrl?: string): void {
        const url = returnUrl ? `${API_BASE}/auth/login?returnUrl=${encodeURIComponent(returnUrl)}` : `${API_BASE}/auth/login`;
        window.location.href = url;
    }

    static logout(): void {
        window.location.href = `${API_BASE}/auth/logout`;
    }
}
