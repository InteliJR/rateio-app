// mobile/services/bill.service.ts

import { logger } from "../lib/logger";
import { apiService } from "./api.service";
import { storageService } from "./storage.service";
import { MeasurementUnit } from "../lib/measurementUnits";

export interface BillItem {
  id: string;
  name: string;
  quantity: number;
  measurementUnit: MeasurementUnit;
  unitPrice: number;
  totalPrice: number;
}

export interface UploadBillResponse {
  id: string;
  userId: string;
  imageUrl: string;
  imageKey: string;
  status: "PENDING_OCR" | "OCR_FAILED" | "REVIEWING" | "DIVIDING" | "COMPLETED";
  ocrRawText?: string;
  totalAmount?: number;
  establishmentName?: string;
  items?: BillItem[];
  createdAt: string;
  updatedAt: string;
  message?: string;
}

export interface UploadBillError {
  message: string;
  statusCode?: number;
  errors?: string[];
}

interface PresignedUploadResponse {
  key: string;
  uploadUrl: string;
  fileUrl: string;
  headers: Record<string, string>;
  expiresIn: number;
}

export interface CreateBillSetupConfig {
  participantCount: number;
  billName?: string;
  serviceFeePercentage?: number;
  coverChargeValue?: number;
  /** @deprecated Mantido para compatibilidade - sempre tratado como 'per_person' */
  coverChargeType?: "total" | "per_person";
  participantNames?: string[];
}

export interface BillFilters {
  status?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
}

export interface UpdateBillPayload {
  status?:
    | "PENDING_OCR"
    | "OCR_FAILED"
    | "REVIEWING"
    | "DIVIDING"
    | "COMPLETED";
  establishmentName?: string;
  totalAmount?: number;
  items?: any[];
}

export interface BillSummaryResponse {
  bill: {
    id: string;
    status: string;
    establishmentName: string;
    imageUrl: string;
    createdAt: string;
    updatedAt: string;
  };
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    measurementUnit: MeasurementUnit;
    unitPrice: number;
    totalPrice: number;
  }>;
  participants: Array<{
    id: string;
    name: string;
    subtotal: number;
    fees: number;
    total: number;
    items: Array<{
      id: string;
      name: string;
      quantity: number;
      measurementUnit: MeasurementUnit;
      unitPrice: number;
      totalPrice: number;
      shareAmount: number;
    }>;
    feeDetails: Array<{
      id: string;
      type: string;
      description: string | null;
      originalValue: number;
      participantShare: number;
    }>;
  }>;
  summary: {
    subtotal: number;
    totalFees: number;
    total: number;
  };
}

class BillService {
  private getImageMetadata(imageUri: string) {
    const uriParts = imageUri.split("/");
    const filename = uriParts[uriParts.length - 1] || `bill-${Date.now()}.jpg`;
    const lowerFilename = filename.toLowerCase();

    let mimeType = "image/jpeg";
    if (lowerFilename.endsWith(".png")) {
      mimeType = "image/png";
    } else if (lowerFilename.endsWith(".webp")) {
      mimeType = "image/webp";
    } else if (lowerFilename.endsWith(".gif")) {
      mimeType = "image/gif";
    }

    return { filename, mimeType };
  }

  private async requestUploadUrl(
    filename: string,
    mimeType: string,
  ): Promise<PresignedUploadResponse> {
    const api = apiService.getApi();
    const response = await api.post<PresignedUploadResponse>(
      "/bills/upload-url",
      {
        filename,
        mimeType,
      },
    );

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
        `Upload direto para S3 falhou com status ${uploadResponse.status}${details ? `: ${details}` : ""}`,
      );
    }
  }

  private shouldFallbackToMultipart(error: any) {
    const baseUrl = apiService.getCurrentBaseUrl();
    const isLocalApi =
      baseUrl.includes("localhost") ||
      baseUrl.includes("127.0.0.1") ||
      baseUrl.includes("10.0.2.2") ||
      /^http:\/\/192\.168\./.test(baseUrl);

    return isLocalApi || error?.response?.status === 404;
  }

  private buildImageFormData(
    imageUri: string,
    filename: string,
    mimeType: string,
    establishmentName?: string,
  ): FormData {
    const formData = new FormData();

    formData.append("image", {
      uri: imageUri,
      name: filename,
      type: mimeType,
    } as any);

    if (establishmentName && establishmentName.trim().length > 0) {
      formData.append("establishmentName", establishmentName.trim());
    }

    return formData;
  }

  private async uploadWithFetchRetry<T>(
    endpoint: string,
    makeFormData: () => FormData,
    timeoutMs: number = 60000,
    maxRetries: number = 3,
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const token = await storageService.getItem("accessToken");
      const baseUrl = apiService.getCurrentBaseUrl();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(`${baseUrl}${endpoint}`, {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: makeFormData(),
          signal: controller.signal,
        });

        const rawBody = await response.text();
        let parsedBody: any = undefined;

        if (rawBody) {
          try {
            parsedBody = JSON.parse(rawBody);
          } catch {
            parsedBody = rawBody;
          }
        }

        if (!response.ok) {
          const error: any = new Error(
            parsedBody?.message ||
              `Upload falhou com status ${response.status}`,
          );
          error.response = {
            status: response.status,
            data: parsedBody,
          };

          if (response.status === 401 && attempt < maxRetries) {
            const refreshedToken = await apiService.refreshAccessToken();
            if (refreshedToken) {
              logger.warn(
                "[BillService] Token expirado no upload. Token renovado, repetindo requisicao...",
              );
              continue;
            }
          }

          const isRetryableHttp =
            response.status === 429 || response.status >= 500;
          if (isRetryableHttp && attempt < maxRetries) {
            const waitTime = 1000 * Math.pow(2, attempt);
            logger.warn(
              `[BillService] Upload HTTP ${response.status}. Retry em ${waitTime}ms... (${attempt + 1}/${maxRetries})`,
            );
            await new Promise((resolve) => setTimeout(resolve, waitTime));
            continue;
          }

          throw error;
        }

        return parsedBody as T;
      } catch (error: any) {
        lastError = error;
        const isAbortError = error?.name === "AbortError";
        const isNetworkError = !error?.response;

        if ((isAbortError || isNetworkError) && attempt < maxRetries) {
          const switchedBaseUrl =
            await apiService.recoverBaseUrlOnNetworkError(endpoint);
          if (switchedBaseUrl) {
            logger.warn(
              "[BillService] Host da API recuperado. Repetindo upload com nova baseURL...",
            );
            continue;
          }

          const waitTime = 1000 * Math.pow(2, attempt);
          logger.warn(
            `[BillService] Upload network/timeout error. Retry em ${waitTime}ms... (${attempt + 1}/${maxRetries})`,
          );
          await new Promise((resolve) => setTimeout(resolve, waitTime));
          continue;
        }

        throw error;
      } finally {
        clearTimeout(timeoutId);
      }
    }

    throw lastError;
  }

  async uploadBill(
    imageUri: string,
    establishmentName?: string,
  ): Promise<UploadBillResponse> {
    try {
      logger.debug("[BillService] Iniciando upload da conta:", {
        imageUri: imageUri.substring(0, 50) + "...",
        establishmentName,
      });

      if (!imageUri || imageUri.trim().length === 0) {
        throw new Error("URI da imagem e obrigatoria");
      }

      const { filename, mimeType } = this.getImageMetadata(imageUri);

      logger.debug("[BillService] Preparando upload:", {
        filename,
        mimeType,
      });

      if (establishmentName && establishmentName.trim().length > 0) {
        logger.debug(
          "[BillService] Nome do estabelecimento adicionado:",
          establishmentName,
        );
      }

      let response: UploadBillResponse;

      try {
        logger.debug(
          "[BillService] Solicitando URL pre-assinada para upload...",
        );
        const presigned = await this.requestUploadUrl(filename, mimeType);
        await this.uploadToPresignedUrl(imageUri, mimeType, presigned);

        const api = apiService.getApi();
        const createResponse = await api.post<UploadBillResponse>("/bills", {
          imageKey: presigned.key,
          establishmentName,
        });
        response = createResponse.data;
      } catch (directUploadError: any) {
        if (!this.shouldFallbackToMultipart(directUploadError)) {
          throw directUploadError;
        }

        logger.warn(
          "[BillService] Upload direto indisponivel neste ambiente. Usando multipart legado...",
          directUploadError?.message,
        );

        response = await this.uploadWithFetchRetry<UploadBillResponse>(
          "/bills",
          () =>
            this.buildImageFormData(
              imageUri,
              filename,
              mimeType,
              establishmentName,
            ),
          60000,
          3,
        );
      }

      logger.debug("[BillService] Upload concluido com sucesso:", {
        billId: response.id,
        status: response.status,
        message: response.message,
      });

      return response;
    } catch (error: any) {
      logger.error("[BillService] Erro ao fazer upload:", error);

      const billError: UploadBillError = {
        message: "Erro ao fazer upload da conta",
        statusCode: error.response?.status,
      };

      if (error.response?.data?.message) {
        if (typeof error.response.data.message === "string") {
          billError.message = error.response.data.message;
        } else if (Array.isArray(error.response.data.message)) {
          billError.message = error.response.data.message[0];
          billError.errors = error.response.data.message;
        }
      } else if (error.message) {
        if (error.code === "ECONNABORTED") {
          billError.message =
            "Tempo limite excedido. Verifique sua conexao e tente novamente.";
        } else if (error.message.includes("Network")) {
          billError.message =
            "Erro de conexao. Verifique sua internet e tente novamente.";
        } else {
          billError.message = error.message;
        }
      }

      logger.error("[BillService] Erro processado:", billError);
      throw billError;
    }
  }

  async uploadBillImage(
    billId: string,
    imageUri: string,
  ): Promise<UploadBillResponse> {
    try {
      logger.debug(
        `[BillService] Iniciando upload de imagem para conta ${billId}...`,
      );

      if (!imageUri || imageUri.trim().length === 0) {
        throw new Error("URI da imagem e obrigatoria");
      }

      const { filename, mimeType } = this.getImageMetadata(imageUri);
      let response: UploadBillResponse;

      try {
        const presigned = await this.requestUploadUrl(filename, mimeType);
        await this.uploadToPresignedUrl(imageUri, mimeType, presigned);

        const api = apiService.getApi();
        const attachResponse = await api.post<UploadBillResponse>(
          `/bills/${billId}/image/attach`,
          { imageKey: presigned.key },
        );
        response = attachResponse.data;
      } catch (directUploadError: any) {
        if (!this.shouldFallbackToMultipart(directUploadError)) {
          throw directUploadError;
        }

        response = await this.uploadWithFetchRetry<UploadBillResponse>(
          `/bills/${billId}/image`,
          () => this.buildImageFormData(imageUri, filename, mimeType),
          60000,
          3,
        );
      }

      logger.debug("[BillService] Upload de imagem concluido:", response);
      return response;
    } catch (error: any) {
      logger.error(
        "[BillService] Erro ao fazer upload de imagem apos todas as tentativas:",
        error,
      );

      let errorMessage = "Erro ao enviar imagem da conta";

      if (error.message?.includes("Network") || !error.response) {
        errorMessage =
          "Erro de conexao. Verifique sua internet e tente novamente.";
      } else if (error.code === "ECONNABORTED") {
        errorMessage =
          "Tempo limite excedido. Verifique sua conexao e tente novamente.";
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      }

      throw {
        message: errorMessage,
        statusCode: error.response?.status,
      } as UploadBillError;
    }
  }

  async createBillSetup(
    config: CreateBillSetupConfig,
  ): Promise<UploadBillResponse> {
    try {
      logger.debug("[BillService] Creating bill setup with config:", config);
      const api = apiService.getApi();
      logger.debug("[BillService] API baseURL:", api.defaults.baseURL);
      const response = await api.post<UploadBillResponse>("/bills", config);
      logger.debug("[BillService] Success:", response.data);
      return response.data;
    } catch (error: any) {
      logger.error("[BillService] Full error object:", error);
      logger.error("[BillService] Error message:", error.message);
      logger.error("[BillService] Error code:", error.code);
      logger.error(
        "[BillService] Error response:",
        error.response?.status,
        error.response?.data,
      );
      const billError: UploadBillError = {
        message: "Erro ao criar configuracao da conta",
        statusCode: error.response?.status,
      };

      if (error.response?.data?.message) {
        billError.message = error.response.data.message;
      } else if (error.message) {
        billError.message = error.message;
      }

      throw billError;
    }
  }

  async getBill(billId: string): Promise<UploadBillResponse> {
    try {
      const api = apiService.getApi();
      const response = await api.get<UploadBillResponse>(`/bills/${billId}`);
      return response.data;
    } catch (error: any) {
      throw {
        message: error.response?.data?.message || "Erro ao buscar conta",
        statusCode: error.response?.status,
      } as UploadBillError;
    }
  }

  async listBills(
    page: number = 1,
    limit: number = 10,
    filters?: BillFilters,
  ): Promise<{
    data: UploadBillResponse[];
    meta: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    };
  }> {
    try {
      const api = apiService.getApi();
      const response = await api.get("/bills", {
        params: {
          page,
          limit,
          sortBy: "createdAt",
          sortOrder: "desc",
          ...filters,
        },
      });
      return response.data;
    } catch (error: any) {
      logger.error("[BillService] Erro ao listar contas:", error);
      throw {
        message: error.response?.data?.message || "Erro ao listar contas",
        statusCode: error.response?.status,
      } as UploadBillError;
    }
  }

  async updateBill(
    billId: string,
    data: UpdateBillPayload,
  ): Promise<UploadBillResponse> {
    try {
      const api = apiService.getApi();
      const response = await api.patch<UploadBillResponse>(
        `/bills/${billId}`,
        data,
      );
      return response.data;
    } catch (error: any) {
      throw {
        message: error.response?.data?.message || "Erro ao atualizar conta",
        statusCode: error.response?.status,
      } as UploadBillError;
    }
  }

  async deleteBill(billId: string): Promise<void> {
    try {
      const api = apiService.getApi();
      await api.delete(`/bills/${billId}`);
    } catch (error: any) {
      throw {
        message: error.response?.data?.message || "Erro ao deletar conta",
        statusCode: error.response?.status,
      } as UploadBillError;
    }
  }

  async getSummary(billId: string): Promise<BillSummaryResponse> {
    try {
      const api = apiService.getApi();
      const response = await api.get<BillSummaryResponse>(
        `/bills/${billId}/summary`,
      );
      return response.data;
    } catch (error: any) {
      logger.error("[BillService] Erro ao buscar summary:", error);
      throw {
        message:
          error.response?.data?.message || "Erro ao buscar resumo da conta",
        statusCode: error.response?.status,
      } as UploadBillError;
    }
  }

  async finalizeBill(
    billId: string,
    data: FinalizeBillPayload,
  ): Promise<FinalizeBillResponse> {
    try {
      logger.debug("[BillService] Finalizing bill:", billId, data);
      const api = apiService.getApi();
      const response = await api.post<FinalizeBillResponse>(
        `/bills/${billId}/finalize`,
        data,
      );
      logger.debug("[BillService] Bill finalized successfully:", response.data);
      return response.data;
    } catch (error: any) {
      logger.error("[BillService] Error finalizing bill:", error);
      logger.error(
        "[BillService] Finalize response payload:",
        error?.response?.data,
      );

      let errorMessage = "Erro ao finalizar conta";

      if (error.response?.data?.message) {
        if (typeof error.response.data.message === "string") {
          errorMessage = error.response.data.message;
        } else if (Array.isArray(error.response.data.message)) {
          errorMessage = error.response.data.message.join("\n");
        }
      } else if (error.response?.data) {
        errorMessage =
          typeof error.response.data === "string"
            ? error.response.data
            : JSON.stringify(error.response.data);
      } else if (error.message) {
        errorMessage = error.message;
      }

      throw {
        message: errorMessage,
        statusCode: error.response?.status,
      } as UploadBillError;
    }
  }

  async retryOcr(billId: string): Promise<UploadBillResponse> {
    try {
      const api = apiService.getApi();
      const response = await api.post<UploadBillResponse>(
        `/bills/${billId}/retry-ocr`,
      );
      return response.data;
    } catch (error: any) {
      throw {
        message: error.response?.data?.message || "Erro ao reprocessar OCR",
        statusCode: error.response?.status,
      } as UploadBillError;
    }
  }

  async duplicateBill(billId: string): Promise<UploadBillResponse> {
    try {
      logger.debug("[BillService] Duplicating bill:", billId);
      const api = apiService.getApi();
      const response = await api.post<UploadBillResponse>(
        `/bills/${billId}/duplicate`,
      );
      logger.debug(
        "[BillService] Bill duplicated successfully:",
        response.data,
      );
      return response.data;
    } catch (error: any) {
      logger.error("[BillService] Error duplicating bill:", error);
      throw {
        message: error.response?.data?.message || "Erro ao duplicar conta",
        statusCode: error.response?.status,
      } as UploadBillError;
    }
  }
}

export interface FinalizeBillPayload {
  divisions: Array<{
    billItemId: string;
    participantId: string;
    shareAmount: number;
  }>;
  fees: Array<{
    type: "SERVICE_PERCENTAGE" | "SERVICE_FIXED" | "COVER_CHARGE";
    value: number;
    description?: string;
  }>;
}

export interface FinalizeBillResponse {
  bill: UploadBillResponse;
  summary: {
    subtotal: number;
    totalFees: number;
    grandTotal: number;
  };
  participantTotals: Record<
    string,
    {
      subtotal: number;
      fees: number;
      total: number;
    }
  >;
  fees: Array<{
    id: string;
    billId: string;
    type: string;
    description?: string;
    value: number;
    createdAt: string;
    updatedAt: string;
  }>;
}

export default new BillService();
