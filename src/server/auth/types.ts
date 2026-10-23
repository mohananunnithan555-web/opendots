export interface UserProfile {
  id: string; // Internal unique ID (or google:<sub>)
  googleSub: string;
  email: string;
  name: string;
  picture?: string;
  createdAt: number;
  lastLoginAt: number;
}

export interface AuthSession {
  userId: string;
  googleSub: string;
  email: string;
  name: string;
  picture?: string;
  iat: number;
  exp: number;
}

export interface AuthResponse {
  ok: boolean;
  token?: string;
  user?: UserProfile;
  error?: string;
}

export interface UserDataExport {
  exportDate: string;
  user: UserProfile;
  stats: {
    conversationsCount: number;
    memoriesCount: number;
    remindersCount: number;
    goalsCount: number;
    spacesCount: number;
    pagesCount: number;
  };
  conversations: unknown[];
  memories: unknown[];
  reminders: unknown[];
  goals: unknown[];
  spaces: unknown[];
  pages: unknown[];
  settings: unknown;
}
