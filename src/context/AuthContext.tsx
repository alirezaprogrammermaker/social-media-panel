import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type User = { id: string; email: string; role: string } | null;

type AuthContextType = {
    user: User;
    loading: boolean;
    login: (email: string, password: string) => Promise<void>;
    signup: (email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

async function api(path: string, body?: object) {
    const res = await fetch(`/api${path}`, {
        method: body ? 'POST' : 'GET',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'خطایی رخ داد');
    return data;
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User>(null);
    const [loading, setLoading] = useState(true);

    async function refresh() {
        try {
            setUser(await api('/dashboard/me'));
        } catch {
            setUser(null);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        refresh();
    }, []);

    const value: AuthContextType = {
        user,
        loading,
        login: async (email, password) => {
            await api('/auth/login', { email, password });
            await refresh();
        },
        signup: async (email, password) => {
            await api('/auth/signup', { email, password });
            await refresh();
        },
        logout: async () => {
            await api('/auth/logout', {});
            setUser(null);
        },
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth باید داخل AuthProvider استفاده شود');
    return ctx;
}