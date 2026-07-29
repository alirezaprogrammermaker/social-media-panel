import { Model } from './Model';

export interface UserRow {
    id: string;
    email: string;
    password_hash: string;
    role: string;
    created_at?: string;
}

export class User extends Model<UserRow> {
    protected static table = 'users';
}