import { createContext, useContext, createSignal, createEffect, onMount, ParentComponent } from 'solid-js';
import { AuthService, SessionInfo, User } from '../services/AuthService';

interface AuthContextType {
    session: () => SessionInfo;
    user: () => User | undefined;
    isAuthenticated: () => boolean;
    isLoading: () => boolean;
    login: (returnUrl?: string) => void;
    logout: () => void;
    refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>();

export const AuthProvider: ParentComponent = (props) => {
    const [session, setSession] = createSignal<SessionInfo>({ authenticated: false });
    const [isLoading, setIsLoading] = createSignal(true);

    const refreshSession = async () => {
        setIsLoading(true);
        try {
            const sessionInfo = await AuthService.getSession();
            setSession(sessionInfo);
        } catch (error) {
            console.error('Failed to refresh session:', error);
            setSession({ authenticated: false });
        } finally {
            setIsLoading(false);
        }
    };

    onMount(() => {
        refreshSession();
    });

    const user = () => session().user;
    const isAuthenticated = () => session().authenticated;
    
    const login = (returnUrl?: string) => {
        AuthService.login(returnUrl);
    };

    const logout = () => {
        AuthService.logout();
    };

    return (
        <AuthContext.Provider
            value={{
                session,
                user,
                isAuthenticated,
                isLoading,
                login,
                logout,
                refreshSession,
            }}
        >
            {props.children}
        </AuthContext.Provider>
    );
};

export function useAuth(): AuthContextType {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
