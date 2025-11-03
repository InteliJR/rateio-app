export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserWithPassword extends User {
  password: string;
}

export interface JwtPayload {
  sub: string;
  email: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse extends AuthTokens {
  user: Omit<User, 'updatedAt'>;
}
