import { api } from "./api.service";

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  avatarUrl?: string | null;
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

  async uploadAvatar(imageUri: string): Promise<UserProfile> {
    console.log('[UPLOAD] Starting upload with URI:', imageUri);
    const formData = new FormData();
    
    const uriParts = imageUri.split('.');
    const fileType = uriParts[uriParts.length - 1];
    console.log('[UPLOAD] File type detected:', fileType);
    
    // Para web, precisamos converter blob: URL em File
    if (imageUri.startsWith('blob:') || imageUri.startsWith('http')) {
      console.log('[UPLOAD] Web mode - converting blob to file');
      const response = await fetch(imageUri);
      const blob = await response.blob();
      console.log('[UPLOAD] Blob size:', blob.size, 'type:', blob.type);
      const file = new File([blob], `avatar.${fileType}`, { 
        type: blob.type || `image/${fileType}` 
      });
      console.log('[UPLOAD] File created:', file.name, file.size, file.type);
      formData.append('avatar', file);
    } else {
      // Para React Native nativo
      console.log('[UPLOAD] Mobile mode - using uri format');
      formData.append('avatar', {
        uri: imageUri,
        name: `avatar.${fileType}`,
        type: `image/${fileType}`,
      } as any);
    }

    console.log('[UPLOAD] Sending request to /users/me/avatar');
    const response = await api.post("/users/me/avatar", formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    console.log('[UPLOAD] Success! Response:', response.data);
    return response.data;
  }

  async removeAvatar(): Promise<UserProfile> {
    const response = await api.delete("/users/me/avatar");
    return response.data;
  }
}

export const userService = new UserService();
