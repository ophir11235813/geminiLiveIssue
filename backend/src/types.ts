export type UserStatus = 'pending' | 'approved' | 'revoked';
export type UserRole = 'admin' | 'user';

export interface AuthUser {
  id: string;
  email: string;
  status: UserStatus;
  role: UserRole;
}
