import { apiService } from './api.service';

export enum FeeType {
  SERVICE_PERCENTAGE = 'SERVICE_PERCENTAGE',
  SERVICE_FIXED = 'SERVICE_FIXED',
  COVER_CHARGE = 'COVER_CHARGE',
}

export interface Fee {
  id: string;
  billId: string;
  type: FeeType;
  description?: string;
  value: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFeeDto {
  billId?: string;
  type: FeeType;
  value: number;
  description?: string;
}

export interface UpdateFeeDto {
  type?: FeeType;
  value?: number;
  description?: string;
}

class FeesService {
  /**
   * Criar nova taxa
   */
  async create(data: CreateFeeDto): Promise<Fee> {
    try {
      console.log('[FeesService] Creating fee:', data);
      const api = apiService.getApi();
      const response = await api.post('/fees', data);
      console.log('[FeesService] Fee created:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('[FeesService] Error creating fee:', error.response?.data || error);
      throw new Error(
        error.response?.data?.message || 'Erro ao criar taxa'
      );
    }
  }

  /**
   * Listar taxas de uma conta
   */
  async findAllByBill(billId: string): Promise<Fee[]> {
    try {
      console.log('[FeesService] Fetching fees for bill:', billId);
      const api = apiService.getApi();
      const response = await api.get('/fees', {
        params: { billId },
      });
      console.log('[FeesService] Fees fetched:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('[FeesService] Error fetching fees:', error.response?.data || error);
      throw new Error(
        error.response?.data?.message || 'Erro ao buscar taxas'
      );
    }
  }

  /**
   * Buscar taxa específica
   */
  async findOne(id: string): Promise<Fee> {
    try {
      console.log('[FeesService] Fetching fee:', id);
      const api = apiService.getApi();
      const response = await api.get(`/fees/${id}`);
      console.log('[FeesService] Fee fetched:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('[FeesService] Error fetching fee:', error.response?.data || error);
      throw new Error(
        error.response?.data?.message || 'Erro ao buscar taxa'
      );
    }
  }

  /**
   * Atualizar taxa
   */
  async update(id: string, data: UpdateFeeDto): Promise<Fee> {
    try {
      console.log('[FeesService] Updating fee:', id, data);
      const api = apiService.getApi();
      const response = await api.patch(`/fees/${id}`, data);
      console.log('[FeesService] Fee updated:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('[FeesService] Error updating fee:', error.response?.data || error);
      throw new Error(
        error.response?.data?.message || 'Erro ao atualizar taxa'
      );
    }
  }

  /**
   * Deletar taxa
   */
  async remove(id: string): Promise<void> {
    try {
      console.log('[FeesService] Deleting fee:', id);
      const api = apiService.getApi();
      await api.delete(`/fees/${id}`);
      console.log('[FeesService] Fee deleted');
    } catch (error: any) {
      console.error('[FeesService] Error deleting fee:', error.response?.data || error);
      throw new Error(
        error.response?.data?.message || 'Erro ao deletar taxa'
      );
    }
  }
}

export default new FeesService();
