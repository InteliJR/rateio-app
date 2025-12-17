// mobile/services/participants.service.ts

import { apiService } from "./api.service";

export interface Participant {
  id: string;
  billId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateParticipantDto {
  billId: string;
  name: string;
}

export interface ParticipantsError {
  message: string;
  statusCode?: number;
}

class ParticipantsService {
  /**
   * Salvar lista de participantes
   * @param billId - ID da conta
   * @param participants - Lista de nomes dos participantes
   * @returns Lista de participantes criados
   */
  async saveParticipants(
    billId: string,
    participants: string[]
  ): Promise<Participant[]> {
    try {
      const api = apiService.getApi();

      // Processar participantes: nomes vazios viram "Participante {número}"
      const participantsToSave = participants.map((name, index) => {
        const trimmedName = name.trim();
        // Se estiver vazio ou começar com "Nome Sobrenome", usar "Participante {número}"
        if (!trimmedName || trimmedName.startsWith('Nome Sobrenome')) {
          return {
            billId,
            name: `Participante ${index + 1}`,
          };
        }
        return {
          billId,
          name: trimmedName,
        };
      });

      // Criar participantes um por vez em paralelo
      const createPromises = participantsToSave.map((participant) =>
        api.post<Participant>('/participants', participant)
      );

      const responses = await Promise.all(createPromises);
      return responses.map((response) => response.data);
    } catch (error: any) {
      const participantsError: ParticipantsError = {
        message: "Erro ao salvar participantes",
        statusCode: error.response?.status,
      };

      if (error.response?.data?.message) {
        participantsError.message = error.response.data.message;
      } else if (error.message) {
        participantsError.message = error.message;
      }

      throw participantsError;
    }
  }

  /**
   * Listar participantes de uma conta
   * @param billId - ID da conta
   * @returns Lista de participantes
   */
  async getParticipantsByBill(billId: string): Promise<Participant[]> {
    try {
      const api = apiService.getApi();
      const response = await api.get<Participant[]>('/participants', {
        params: { billId },
      });
      return response.data;
    } catch (error: any) {
      throw {
        message: error.response?.data?.message || "Erro ao buscar participantes",
        statusCode: error.response?.status,
      } as ParticipantsError;
    }
  }

  /**
   * Criar um participante
   * @param billId - ID da conta
   * @param name - Nome do participante
   * @returns Participante criado
   */
  async createParticipant(
    billId: string,
    name: string
  ): Promise<Participant> {
    try {
      const api = apiService.getApi();
      const response = await api.post<Participant>('/participants', {
        billId,
        name: name.trim() || `Participante ${Date.now()}`,
      });
      return response.data;
    } catch (error: any) {
      throw {
        message: error.response?.data?.message || "Erro ao criar participante",
        statusCode: error.response?.status,
      } as ParticipantsError;
    }
  }

  /**
   * Atualizar participante
   * @param participantId - ID do participante
   * @param name - Novo nome
   * @returns Participante atualizado
   */
  async updateParticipant(
    participantId: string,
    name: string
  ): Promise<Participant> {
    try {
      const api = apiService.getApi();
      const response = await api.patch<Participant>(
        `/participants/${participantId}`,
        { name: name.trim() }
      );
      return response.data;
    } catch (error: any) {
      throw {
        message: error.response?.data?.message || "Erro ao atualizar participante",
        statusCode: error.response?.status,
      } as ParticipantsError;
    }
  }

  /**
   * Deletar participante
   * @param participantId - ID do participante
   */
  async deleteParticipant(participantId: string): Promise<void> {
    try {
      const api = apiService.getApi();
      await api.delete(`/participants/${participantId}`);
    } catch (error: any) {
      throw {
        message: error.response?.data?.message || "Erro ao deletar participante",
        statusCode: error.response?.status,
      } as ParticipantsError;
    }
  }
}

export default new ParticipantsService();

