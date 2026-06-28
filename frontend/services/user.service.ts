import { api, apiService } from "./api.service";

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

interface PresignedUploadResponse {
  key: string;
  uploadUrl: string;
  fileUrl: string;
  headers: Record<string, string>;
  expiresIn: number;
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
    const fileType = getImageFileType(imageUri);
    const mimeType = getImageMimeType(fileType);
    const filename = `avatar.${fileType}`;

    try {
      const presigned = await this.requestAvatarUploadUrl(filename, mimeType);
      await this.uploadToPresignedUrl(imageUri, mimeType, presigned);

      const response = await api.post("/users/me/avatar/attach", {
        imageKey: presigned.key,
      });
      return response.data;
    } catch (error: any) {
      if (!shouldFallbackToMultipart(error)) {
        throw error;
      }

      return this.uploadAvatarWithMultipart(imageUri, filename, mimeType);
    }
  }

  private async requestAvatarUploadUrl(
    filename: string,
    mimeType: string,
  ): Promise<PresignedUploadResponse> {
    const response = await api.post<PresignedUploadResponse>("/users/me/avatar/upload-url", {
      filename,
      mimeType,
    });

    return response.data;
  }

  private async uploadToPresignedUrl(
    imageUri: string,
    mimeType: string,
    presigned: PresignedUploadResponse,
  ) {
    const imageResponse = await fetch(imageUri);
    const blob = await imageResponse.blob();
    const headers = {
      ...presigned.headers,
      "Content-Type": presigned.headers?.["Content-Type"] || mimeType,
    };

    const uploadResponse = await fetch(presigned.uploadUrl, {
      method: "PUT",
      headers,
      body: blob,
    });

    if (!uploadResponse.ok) {
      const details = await uploadResponse.text().catch(() => "");
      throw new Error(
        `Upload direto do avatar falhou com status ${uploadResponse.status}${details ? `: ${details}` : ""}`,
      );
    }
  }

  private async uploadAvatarWithMultipart(
    imageUri: string,
    filename: string,
    mimeType: string,
  ): Promise<UserProfile> {
    const formData = new FormData();

    // Para web, precisamos converter blob: URL em File
    if (imageUri.startsWith('blob:') || imageUri.startsWith('http')) {
      const response = await fetch(imageUri);
      const blob = await response.blob();
      const file = new File([blob], filename, {
        type: blob.type || mimeType,
      });
      formData.append('avatar', file);
    } else {
      // Para React Native nativo
      formData.append('avatar', {
        uri: imageUri,
        name: filename,
        type: mimeType,
      } as any);
    }

    const response = await api.post("/users/me/avatar", formData);
    return response.data;
  }

  async removeAvatar(): Promise<UserProfile> {
    const response = await api.delete("/users/me/avatar");
    return response.data;
  }
}

function shouldFallbackToMultipart(error: any) {
  const baseUrl = apiService.getCurrentBaseUrl();
  const isLocalApi =
    baseUrl.includes("localhost") ||
    baseUrl.includes("127.0.0.1") ||
    baseUrl.includes("10.0.2.2") ||
    /^http:\/\/192\.168\./.test(baseUrl);

  return isLocalApi || error?.response?.status === 404;
}

function getImageFileType(uri: string) {
  const cleanUri = uri.split("?")[0].split("#")[0];
  const match = cleanUri.match(/\.([a-zA-Z0-9]+)$/);
  const extension = match?.[1]?.toLowerCase();

  if (extension === "jpeg") {
    return "jpg";
  }

  return extension || "jpg";
}

function getImageMimeType(fileType: string) {
  if (fileType === "jpg") {
    return "image/jpeg";
  }

  return `image/${fileType}`;
}

export const userService = new UserService();
