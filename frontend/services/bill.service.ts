// mobile/services/bill.service.ts

import { apiService } from "./api.service";

export interface UploadBillResponse {
  id: string;
  imageUrl: string;
  establishmentName?: string;
  totalAmount?: number;
  items?: Array<{
    description: string;
    amount: number;
  }>;
  createdAt: string;
}

export interface UploadBillError {
  message: string;
  statusCode?: number;
}

class BillService {
  /**
   * Faz upload de uma conta (imagem) para o servidor
   * @param imageUri - URI local da imagem
   * @param establishmentName - Nome do estabelecimento (opcional)
   * @returns Dados da conta processada
   */
  async uploadBill(
    imageUri: string,
    establishmentName?: string
  ): Promise<UploadBillResponse> {
    try {
      // Criar FormData
      const formData = new FormData();

      // Extrair nome do arquivo da URI
      const filename = imageUri.split("/").pop() || "photo.jpg";
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : "image/jpeg";

      // Adicionar imagem ao FormData
      formData.append("image", {
        uri: imageUri,
        name: filename,
        type: type,
      } as any);

      // Adicionar nome do estabelecimento se fornecido
      if (establishmentName) {
        formData.append("establishmentName", establishmentName);
      }

      // Fazer requisição
      const api = apiService.getApi();
      const response = await api.post<UploadBillResponse>("/bills", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
        timeout: 30000, // 30 segundos para upload
      });

      return response.data;
    } catch (error: any) {
      // Tratar erros
      const billError: UploadBillError = {
        message: "Erro ao fazer upload da conta",
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

  /**
   * Busca detalhes de uma conta específica
   * @param billId - ID da conta
   */
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

  /**
   * Lista todas as contas do usuário
   */
  async listBills(): Promise<UploadBillResponse[]> {
    try {
      const api = apiService.getApi();
      const response = await api.get<UploadBillResponse[]>("/bills");
      return response.data;
    } catch (error: any) {
      throw {
        message: error.response?.data?.message || "Erro ao listar contas",
        statusCode: error.response?.status,
      } as UploadBillError;
    }
  }

  /**
   * Atualiza informações de uma conta
   * @param billId - ID da conta
   * @param data - Dados para atualizar
   */
  async updateBill(
    billId: string,
    data: Partial<Omit<UploadBillResponse, "id" | "createdAt">>
  ): Promise<UploadBillResponse> {
    try {
      const api = apiService.getApi();
      const response = await api.patch<UploadBillResponse>(
        `/bills/${billId}`,
        data
      );
      return response.data;
    } catch (error: any) {
      throw {
        message: error.response?.data?.message || "Erro ao atualizar conta",
        statusCode: error.response?.status,
      } as UploadBillError;
    }
  }

  /**
   * Deleta uma conta
   * @param billId - ID da conta
   */
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
}

export default new BillService();
