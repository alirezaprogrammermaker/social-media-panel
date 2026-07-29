export type Bindings = {
    DB: D1Database;
    AI: Ai;
    SEED_ADMIN_SECRET?: string;
};

export type Variables = {
    user: {
        id: string;
        email: string;
        role: string;
    };
};
