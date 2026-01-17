export interface UserProfile {
    id: string;
    email: string;
    name: string;
    avatarUrl?: string | null;
    role: 'ADMIN' | 'USER';
    isActive: boolean;
    createdAt: string;
}