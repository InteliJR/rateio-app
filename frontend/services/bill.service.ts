// mobile/services/bill.service.ts

import { apiService } from "./api.service";

export interface BillItem {
  id: string;
  name: string;
  quantity: number;
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

export interface CreateBillSetupConfig {
  participantCount: number;
  billName?: string;
  serviceFeePercentage: number;
  coverChargeValue?: number;
  /** @deprecated Mantido para compatibilidade - sempre tratado como 'per_person' */
  coverChargeType?: 'total' | 'per_person';
  participantNames?: string[];
}

export interface BillFilters {
  status?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
}

export interface UpdateBillPayload {
  status?: "PENDING_OCR" | "OCR_FAILED" | "REVIEWING" | "DIVIDING" | "COMPLETED";
  establishmentName?: string;
  totalAmount?: number;
  items?: any[]; // Simplified for now
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
  /**
   * Faz upload de uma conta (imagem) para o servidor
   * @param imageUri - URI local da imagem otimizada
   * @param establishmentName - Nome do estabelecimento (opcional)
   * @returns Dados da conta processada
   */
  async uploadBill(
    imageUri: string,
    establishmentName?: string
  ): Promise<UploadBillResponse> {
    try {
      console.log('[BillService] Iniciando upload da conta:', {
        imageUri: imageUri.substring(0, 50) + '...',
        establishmentName,
      });

      // Validar URI da imagem
      if (!imageUri || imageUri.trim().length === 0) {
        throw new Error('URI da imagem é obrigatória');
      }

      // Criar FormData
      const formData = new FormData();

      // Extrair nome do arquivo da URI
      const uriParts = imageUri.split('/');
      const filename = uriParts[uriParts.length - 1] || `bill-${Date.now()}.jpg`;

      // Detectar tipo MIME correto
      let mimeType = 'image/jpeg'; // padrão
      if (filename.toLowerCase().endsWith('.png')) {
        mimeType = 'image/png';
      } else if (filename.toLowerCase().endsWith('.webp')) {
        mimeType = 'image/webp';
      } else if (filename.toLowerCase().endsWith('.heic')) {
        mimeType = 'image/heic';
      }

      console.log('[BillService] Preparando FormData:', {
        filename,
        mimeType,
      });

      // Adicionar imagem ao FormData com estrutura correta para React Native
      // O Expo/React Native espera um objeto com uri, name e type
      formData.append('image', {
        uri: imageUri,
        name: filename,
        type: mimeType,
      } as any);

      // Adicionar nome do estabelecimento se fornecido
      if (establishmentName && establishmentName.trim().length > 0) {
        formData.append('establishmentName', establishmentName.trim());
        console.log('[BillService] Nome do estabelecimento adicionado:', establishmentName);
      }

      // Fazer requisição com retry automático para uploads
      console.log('[BillService] Enviando requisição para /bills...');

      const response = await apiService.postWithRetry<UploadBillResponse>(
        '/bills',
        formData,
        {
          // Para uploads multipart no React Native + Axios 1.x:
          // É preciso deletar o Content-Type via transformRequest para que o XHR
          // nativo injete automaticamente o boundary correto (multipart/form-data; boundary=...)
          // Definir como undefined no headers não é suficiente pois o default do
          // Axios instance ('application/json') tem precedência em certos merge paths.
          transformRequest: (data: any, headers: any) => {
            if (headers) {
              delete headers['Content-Type'];
              delete headers['content-type'];
            }
            return data;
          },
          timeout: 60000, // 60 segundos - aumentado para dar tempo para OCR
        },
        3 // máximo de 3 retentativas
      );

      console.log('[BillService] Upload concluído com sucesso:', {
        billId: response.id,
        status: response.status,
        message: response.message,
      });

      return response;
    } catch (error: any) {
      console.error('[BillService] Erro ao fazer upload:', error);

      // Tratar erros de forma detalhada
      const billError: UploadBillError = {
        message: 'Erro ao fazer upload da conta',
        statusCode: error.response?.status,
      };

      // Extrair mensagem de erro do backend
      if (error.response?.data?.message) {
        if (typeof error.response.data.message === 'string') {
          billError.message = error.response.data.message;
        } else if (Array.isArray(error.response.data.message)) {
          billError.message = error.response.data.message[0];
          billError.errors = error.response.data.message;
        }
      } else if (error.message) {
        // Erros de rede ou timeout
        if (error.code === 'ECONNABORTED') {
          billError.message = 'Tempo limite excedido. Verifique sua conexão e tente novamente.';
        } else if (error.message.includes('Network')) {
          billError.message = 'Erro de conexão. Verifique sua internet e tente novamente.';
        } else {
          billError.message = error.message;
        }
      }

      console.error('[BillService] Erro processado:', billError);
      throw billError;
    }
  }

  /**
   * Faz upload de uma imagem para uma conta existente
   * @param billId - ID da conta existente
   * @param imageUri - URI local da imagem otimizada
   * @returns Dados da conta atualizada
   */
  async uploadBillImage(
    billId: string,
    imageUri: string
  ): Promise<UploadBillResponse> {
    try {
      console.log(`[BillService] Iniciando upload de imagem para conta ${billId}...`);

      if (!imageUri || imageUri.trim().length === 0) {
        throw new Error('URI da imagem é obrigatória');
      }

      const formData = new FormData();
      const uriParts = imageUri.split('/');
      const filename = uriParts[uriParts.length - 1] || `bill-${Date.now()}.jpg`;

      let mimeType = 'image/jpeg';
      if (filename.toLowerCase().endsWith('.png')) mimeType = 'image/png';
      else if (filename.toLowerCase().endsWith('.webp')) mimeType = 'image/webp';

      formData.append('image', {
        uri: imageUri,
        name: filename,
        type: mimeType,
      } as any);

      // Usar retry automático para upload de imagem
      const response = await apiService.postWithRetry<UploadBillResponse>(
        `/bills/${billId}/image`,
        formData,
        {
          transformRequest: (data: any, headers: any) => {
            if (headers) {
              delete headers['Content-Type'];
              delete headers['content-type'];
            }
            return data;
          },
          timeout: 60000,
        },
        3 // máximo de 3 retentativas
      );

      console.log('[BillService] Upload de imagem concluído:', response);
      return response;
    } catch (error: any) {
      console.error('[BillService] Erro ao fazer upload de imagem após todas as tentativas:', error);

      // Mensagens de erro mais específicas
      let errorMessage = "Erro ao enviar imagem da conta";

      if (error.message?.includes('Network') || !error.response) {
        errorMessage = "Erro de conexão. Verifique sua internet e tente novamente.";
      } else if (error.code === 'ECONNABORTED') {
        errorMessage = "Tempo limite excedido. Verifique sua conexão e tente novamente.";
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      }

      throw {
        message: errorMessage,
        statusCode: error.response?.status,
      } as UploadBillError;
    }
  }

  /**
   * Cria a configuração inicial da conta
   * @param config - Configuração inicial (participantes, nome, taxa)
   * @returns ID da conta criada
   */
  async createBillSetup(config: CreateBillSetupConfig): Promise<UploadBillResponse> {
    try {
      console.log('[BillService] Creating bill setup with config:', config);
      const api = apiService.getApi();
      console.log('[BillService] API baseURL:', api.defaults.baseURL);
      const response = await api.post<UploadBillResponse>("/bills", config);
      console.log('[BillService] Success:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('[BillService] Full error object:', error);
      console.error('[BillService] Error message:', error.message);
      console.error('[BillService] Error code:', error.code);
      console.error('[BillService] Error response:', error.response?.status, error.response?.data);
      const billError: UploadBillError = {
        message: "Erro ao criar configuração da conta",
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
   * Lista todas as contas do usuário com paginação
   * @param page - Número da página (padrão: 1)
   * @param limit - Itens por página (padrão: 10)
   * @returns Objeto com array de bills e metadados de paginação
   */
  async listBills(
    page: number = 1,
    limit: number = 10,
    filters?: BillFilters
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
          sortBy: 'createdAt',
          sortOrder: 'desc',
          ...filters,
        },
      });
      return response.data;
    } catch (error: any) {
      console.error('[BillService] Erro ao listar contas:', error);
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
    data: UpdateBillPayload
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

  /**
   * Busca o resumo/summary da conta com valores por participante
   * @param billId - ID da conta
   * @returns Resumo com participantes e seus valores
   */
  async getSummary(billId: string): Promise<BillSummaryResponse> {
    try {
      const api = apiService.getApi();
      const response = await api.get<BillSummaryResponse>(`/bills/${billId}/summary`);
      return response.data;
    } catch (error: any) {
      console.error('[BillService] Erro ao buscar summary:', error);
      throw {
        message: error.response?.data?.message || "Erro ao buscar resumo da conta",
        statusCode: error.response?.status,
      } as UploadBillError;
    }
  }

  /**
   * Finaliza a conta, salvando todas as divisões e taxas
   * Muda o status para COMPLETED e bloqueia edições
   * @param billId - ID da conta
   * @param data - Dados de finalização (divisões e taxas)
   * @returns Resumo da conta finalizada
   */
  async finalizeBill(billId: string, data: FinalizeBillPayload): Promise<FinalizeBillResponse> {
    try {
      console.log('[BillService] Finalizing bill:', billId, data);
      const api = apiService.getApi();
      const response = await api.post<FinalizeBillResponse>(
        `/bills/${billId}/finalize`,
        data
      );
      console.log('[BillService] Bill finalized successfully:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('[BillService] Error finalizing bill:', error);

      // Tratar mensagem de erro que pode ser string ou array
      let errorMessage = "Erro ao finalizar conta";

      if (error.response?.data?.message) {
        if (typeof error.response.data.message === 'string') {
          errorMessage = error.response.data.message;
        } else if (Array.isArray(error.response.data.message)) {
          // Se for array, juntar todas as mensagens
          errorMessage = error.response.data.message.join('\n');
        }
      } else if (error.message) {
        errorMessage = error.message;
      }

      throw {
        message: errorMessage,
        statusCode: error.response?.status,
      } as UploadBillError;
    }
  }

  /**
   * Reprocessa o OCR de uma conta que falhou
   * @param billId - ID da conta
   */
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

  /**
   * Duplica uma conta existente (reutilizar)
   * Cria uma nova conta com os mesmos itens, participantes e taxas
   * @param billId - ID da conta original
   * @returns Nova conta duplicada
   */
  async duplicateBill(billId: string): Promise<UploadBillResponse> {
    try {
      console.log('[BillService] Duplicating bill:', billId);
      const api = apiService.getApi();
      const response = await api.post<UploadBillResponse>(`/bills/${billId}/duplicate`);
      console.log('[BillService] Bill duplicated successfully:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('[BillService] Error duplicating bill:', error);
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
    type: 'SERVICE_PERCENTAGE' | 'SERVICE_FIXED' | 'COVER_CHARGE';
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
  participantTotals: Record<string, {
    subtotal: number;
    fees: number;
    total: number;
  }>;
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
