import { api } from "./api.service";

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateProfileData {
  name?: string;
  password?: string;
}

class UserService {
  async getProfile(): Promise<UserProfile> {
    const response = await api.get("/users/me/profile");
    return response.data;
  }

  async updateProfile(data: UpdateProfileData): Promise<UserProfile> {
    const response = await api.patch("/users/me/profile", data);
    return response.data;
  }
}

export const userService = new UserService();
