// frontend/services/divisions.service.ts

import { apiService } from './api.service';

export interface Division {
  id: string;
  billItemId: string;
  participantId: string;
  shareAmount: number;
  createdAt: string;
  updatedAt: string;
}

export interface DivisionItemDto {
  participantId: string;
  shareAmount: number;
}

export interface CreateBatchDivisionDto {
  billItemId: string;
  divisions: DivisionItemDto[];
}

export interface DivisionsError {
  message: string;
  statusCode?: number;
}

class DivisionsService {
  /**
   * Criar divisões em lote para um item
   * @param billItemId - ID do item da conta
   * @param divisions - Lista de divisões (participante + valor)
   * @returns Lista de divisões criadas
   * 
   * @example
   * // Exemplo de payload enviado ao backend:
   * {
   *   "billItemId": "item-uuid",
   *   "divisions": [
   *     { "participantId": "p1-uuid", "shareAmount": 25.00 },
   *     { "participantId": "p2-uuid", "shareAmount": 25.00 },
   *     { "participantId": "p3-uuid", "shareAmount": 25.00 },
   *     { "participantId": "p4-uuid", "shareAmount": 25.00 }
   *   ]
   * }
   * 
   * // Para um item de R$ 100,00 dividido entre 4 participantes
   * // shareAmount = 100 / 4 = 25.00 por pessoa
   */
  async createBatch(
    billItemId: string,
    divisions: DivisionItemDto[]
  ): Promise<Division[]> {
    try {
      const api = apiService.getApi();
      
      const payload: CreateBatchDivisionDto = {
        billItemId,
        divisions,
      };

      console.log('[DivisionsService] Creating batch divisions:', payload);

      const response = await api.post<Division[]>('/divisions/batch', payload);
      
      console.log('[DivisionsService] Batch created successfully:', response.data);
      
      return response.data;
    } catch (error: any) {
      const divisionsError: DivisionsError = {
        message: 'Erro ao salvar divisões',
        statusCode: error.response?.status,
      };

      if (error.response?.data?.message) {
        divisionsError.message = error.response.data.message;
      } else if (error.message) {
        divisionsError.message = error.message;
      }

      console.error('[DivisionsService] Error creating batch:', divisionsError);
      throw divisionsError;
    }
  }

  /**
   * Listar divisões de uma conta
   * @param billId - ID da conta
   * @returns Lista de divisões
   */
  async findAllByBill(billId: string): Promise<Division[]> {
    try {
      const api = apiService.getApi();
      const response = await api.get<Division[]>('/divisions', {
        params: { billId },
      });
      return response.data;
    } catch (error: any) {
      throw {
        message: error.response?.data?.message || 'Erro ao buscar divisões',
        statusCode: error.response?.status,
      } as DivisionsError;
    }
  }

  /**
   * Atualizar uma divisão
   * @param divisionId - ID da divisão
   * @param shareAmount - Novo valor
   * @returns Divisão atualizada
   */
  async update(divisionId: string, shareAmount: number): Promise<Division> {
    try {
      const api = apiService.getApi();
      const response = await api.patch<Division>(`/divisions/${divisionId}`, {
        shareAmount,
      });
      return response.data;
    } catch (error: any) {
      throw {
        message: error.response?.data?.message || 'Erro ao atualizar divisão',
        statusCode: error.response?.status,
      } as DivisionsError;
    }
  }

  /**
   * Remover uma divisão
   * @param divisionId - ID da divisão
   */
  async remove(divisionId: string): Promise<void> {
    try {
      const api = apiService.getApi();
      await api.delete(`/divisions/${divisionId}`);
    } catch (error: any) {
      throw {
        message: error.response?.data?.message || 'Erro ao remover divisão',
        statusCode: error.response?.status,
      } as DivisionsError;
    }
  }

  /**
   * Calcular o valor de divisão para cada participante
   * @param totalAmount - Valor total do item
   * @param numberOfParticipants - Número de participantes
   * @returns Valor por participante (arredondado para 2 casas decimais)
   * 
   * @remarks
   * Quando há resto na divisão (ex: R$ 10,00 / 3 pessoas = R$ 3,33...),
   * cada participante paga R$ 3,33 (arredondado).
   * O total distribuído será R$ 9,99, com diferença de R$ 0,01.
   * Essa diferença é aceitável e esperada no sistema.
   * 
   * Exemplos:
   * - R$ 10,00 / 3 = R$ 3,33 cada (total: R$ 9,99, resto: R$ 0,01)
   * - R$ 100,00 / 3 = R$ 33,33 cada (total: R$ 99,99, resto: R$ 0,01)
   * - R$ 10,00 / 4 = R$ 2,50 cada (total: R$ 10,00, resto: R$ 0,00)
   */
  calculateShareAmount(
    totalAmount: number,
    numberOfParticipants: number
  ): number {
    if (numberOfParticipants === 0) return 0;
    return Number((totalAmount / numberOfParticipants).toFixed(2));
  }
}

export default new DivisionsService();
