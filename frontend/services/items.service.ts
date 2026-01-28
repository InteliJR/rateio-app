import billService from './bill.service';
import { BillItem } from '../components/items/ItemCard';
import { apiService } from './api.service';

export interface ItemsServiceState {
  items: BillItem[];
  loading: boolean;
  error: string | null;
}

class ItemsService {
  private cache: Map<string, BillItem[]> = new Map();

  async getItems(billId: string): Promise<BillItem[]> {
    if (this.cache.has(billId)) {
      return this.cache.get(billId)!;
    }

    try {
      const bill = await billService.getBill(billId);
      // Backend returns items as { id, name, quantity, unitPrice, totalPrice }
      // No frontend, usamos:
      // - quantity: quantidade
      // - price: VALOR UNITÁRIO
      // O valor total do item é sempre calculado como quantity × price quando necessário.
      const items: BillItem[] = (bill.items || []).map((item: any) => {
        if (!item.id) {
          console.warn('[ItemsService] Item sem ID do backend:', item);
          throw new Error('Item sem ID retornado pelo backend');
        }
        return {
          id: item.id, // Backend sempre retorna UUID
          name: item.name,
          quantity: item.quantity,
          // `price` representa o valor unitário no frontend
          price:
            typeof item.unitPrice === 'string'
              ? parseFloat(item.unitPrice)
              : item.unitPrice,
          assignedParticipants: []
        };
      });

      this.cache.set(billId, items);
      return items;
    } catch (error: any) {
      console.error('Error fetching items:', error);
      throw new Error(error.message || 'Failed to fetch items');
    }
  }

  async createItem(
    billId: string,
    item: Omit<BillItem, 'id' | 'assignedParticipants'>
  ): Promise<BillItem> {
    // Aqui `item.price` já é o VALOR UNITÁRIO vindo do frontend
    const unitPrice = item.price;
    const totalPrice = item.price * item.quantity;

    try {
      const api = apiService.getApi();
      const response = await api.post(`/bills/${billId}/items`, {
        name: item.name,
        quantity: item.quantity,
        unitPrice,
        totalPrice,
      });

      // Atualizar cache
      const currentItems = this.cache.get(billId) || await this.getItems(billId);
      const newItem: BillItem = {
        id: response.data.id,
        name: response.data.name,
        quantity: response.data.quantity,
        // No frontend `price` é sempre o valor unitário
        price:
          typeof response.data.unitPrice === 'string'
            ? parseFloat(response.data.unitPrice)
            : response.data.unitPrice,
        assignedParticipants: [],
      };
      const updatedItems = [...currentItems, newItem];
      this.cache.set(billId, updatedItems);

      return newItem;
    } catch (error: any) {
      console.error('[ItemsService] Error creating item:', error);
      throw new Error(error.response?.data?.message || error.message || 'Erro ao criar item');
    }
  }

  async updateItem(billId: string, itemId: string, updates: Partial<BillItem>): Promise<BillItem[]> {
    const currentItems = this.cache.get(billId) || await this.getItems(billId);

    const newItems = currentItems.map(item =>
      item.id === itemId ? { ...item, ...updates } : item
    );

    this.cache.set(billId, newItems);

    await this.syncWithBackend(billId, newItems);

    return newItems;
  }

  async deleteItem(billId: string, itemId: string): Promise<BillItem[]> {
    try {
      const api = apiService.getApi();
      await api.delete(`/bills/${billId}/items/${itemId}`);

      // Atualizar cache
      const currentItems = this.cache.get(billId) || await this.getItems(billId);
      const newItems = currentItems.filter(item => item.id !== itemId);
      this.cache.set(billId, newItems);

      return newItems;
    } catch (error: any) {
      console.error('[ItemsService] Error deleting item:', error);
      
      // Se o item não foi encontrado (404), limpar cache para forçar recarga
      if (error.response?.status === 404) {
        this.clearCache(billId);
      }
      
      throw new Error(error.response?.data?.message || error.message || 'Erro ao deletar item');
    }
  }

  async updateItemName(billId: string, itemId: string, name: string): Promise<BillItem> {
    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new Error('O nome do item não pode estar vazio');
    }

    try {
      const api = apiService.getApi();
      const response = await api.patch(`/bills/${billId}/items/${itemId}`, {
        name: trimmedName,
      });

      // Atualizar cache
      const currentItems = this.cache.get(billId) || await this.getItems(billId);
      const updatedItems = currentItems.map(item =>
        item.id === itemId
          ? {
              ...item,
              name: response.data.name,
            }
          : item
      );
      this.cache.set(billId, updatedItems);

      // Retornar item atualizado no formato BillItem
      const updatedItem = updatedItems.find(item => item.id === itemId);
      if (!updatedItem) {
        throw new Error('Item não encontrado após atualização');
      }

      return updatedItem;
    } catch (error: any) {
      console.error('[ItemsService] Error updating item name:', error);
      
      // Se o item não foi encontrado (404), limpar cache para forçar recarga
      if (error.response?.status === 404) {
        this.clearCache(billId);
      }
      
      throw new Error(error.response?.data?.message || error.message || 'Erro ao atualizar nome do item');
    }
  }

  /**
   * Atualiza o PREÇO UNITÁRIO de um item.
   * O total é sempre derivado como quantity × unitPrice.
   */
  async updateItemPrice(
    billId: string,
    itemId: string,
    unitPrice: number
  ): Promise<BillItem> {
    if (unitPrice <= 0) {
      throw new Error('O valor unitário do item deve ser maior que zero');
    }

    try {
      const api = apiService.getApi();
      const currentItems = this.cache.get(billId) || (await this.getItems(billId));
      const existing = currentItems.find((item) => item.id === itemId);
      const quantity = existing?.quantity ?? 1;
      const totalPrice = unitPrice * quantity;

      const response = await api.patch(`/bills/${billId}/items/${itemId}`, {
        unitPrice,
        totalPrice,
      });

      // Atualizar cache com quantity + unitPrice vindos do backend
      const updatedItems = currentItems.map((item) =>
        item.id === itemId
          ? {
              ...item,
              quantity: response.data.quantity,
              // manter convenção: `price` = unitPrice no frontend
              price:
                typeof response.data.unitPrice === 'string'
                  ? parseFloat(response.data.unitPrice)
                  : response.data.unitPrice,
            }
          : item
      );
      this.cache.set(billId, updatedItems);

      const updatedItem = updatedItems.find(item => item.id === itemId);
      if (!updatedItem) {
        throw new Error('Item não encontrado após atualização');
      }

      return updatedItem;
    } catch (error: any) {
      console.error('[ItemsService] Error updating item price:', error);
      
      // Se o item não foi encontrado (404), limpar cache para forçar recarga
      if (error.response?.status === 404) {
        this.clearCache(billId);
      }
      
      throw new Error(error.response?.data?.message || error.message || 'Erro ao atualizar valor do item');
    }
  }

  /**
   * Atualiza apenas a QUANTIDADE de um item.
   * O valor unitário é mantido e o total é recalculado como quantity × unitPrice.
   */
  async updateItemQuantity(
    billId: string,
    itemId: string,
    quantity: number
  ): Promise<BillItem> {
    if (quantity < 1 || !Number.isInteger(quantity)) {
      throw new Error('A quantidade deve ser um número inteiro maior ou igual a 1');
    }

    try {
      const api = apiService.getApi();
      const currentItems = this.cache.get(billId) || (await this.getItems(billId));
      const existing = currentItems.find((item) => item.id === itemId);
      if (!existing) {
        throw new Error('Item não encontrado para atualização de quantidade');
      }

      // `existing.price` no frontend é sempre o valor unitário
      const unitPrice = existing.price;
      const totalPrice = unitPrice * quantity;

      const response = await api.patch(`/bills/${billId}/items/${itemId}`, {
        quantity,
        totalPrice,
        unitPrice,
      });

      const updatedItems = currentItems.map(item =>
        item.id === itemId
          ? {
              ...item,
              quantity: response.data.quantity,
              // manter convenção: `price` = unitPrice no frontend
              price:
                typeof response.data.unitPrice === 'string'
                  ? parseFloat(response.data.unitPrice)
                  : response.data.unitPrice,
            }
          : item
      );
      this.cache.set(billId, updatedItems);

      const updatedItem = updatedItems.find(item => item.id === itemId);
      if (!updatedItem) {
        throw new Error('Item não encontrado após atualização');
      }

      return updatedItem;
    } catch (error: any) {
      console.error('[ItemsService] Error updating item quantity:', error);
      
      // Se o item não foi encontrado (404), limpar cache para forçar recarga
      if (error.response?.status === 404) {
        this.clearCache(billId);
      }
      
      throw new Error(error.response?.data?.message || error.message || 'Erro ao atualizar quantidade do item');
    }
  }

  // Helper to sync changes via updateBill
  private async syncWithBackend(billId: string, items: BillItem[]) {
    // Converter de volta para o formato do backend: { name, quantity, unitPrice, totalPrice }
    // No frontend:
    // - quantity: quantidade
    // - price: valor unitário
    const payloadItems = items.map(item => {
      const unitPrice = item.price;
      const totalPrice = Number((unitPrice * item.quantity).toFixed(2));
      return {
        name: item.name,
        quantity: item.quantity,
        unitPrice,
        totalPrice,
      };
    });

    console.log('[ItemsService] Sending payload to updateBill:', JSON.stringify(payloadItems, null, 2));

    try {
      await billService.updateBill(billId, {
        items: payloadItems
      });
      console.log('[ItemsService] updateBill success');
    } catch (error) {
      console.error('Sync failed:', error);
      // Revert cache logic could go here
      throw error;
    }
  }

  clearCache(billId: string) {
    this.cache.delete(billId);
  }
}

export default new ItemsService();
