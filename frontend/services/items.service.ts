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
      // Backend returns items as { name, quantity, unitPrice, totalPrice }
      // We map to BillItem: { id, name, quantity, price (total), assignedParticipants }
      const items: BillItem[] = (bill.items || []).map((item: any, index: number) => ({
        id: item.id || index.toString(), // Prefer ID from backend if available
        name: item.name,
        quantity: item.quantity,
        price: item.totalPrice,
        assignedParticipants: []
      }));

      this.cache.set(billId, items);
      return items;
    } catch (error: any) {
      console.error('Error fetching items:', error);
      throw new Error(error.message || 'Failed to fetch items');
    }
  }

  async createItem(billId: string, item: Omit<BillItem, 'id' | 'assignedParticipants'>): Promise<BillItem> {
    const unitPrice = item.price / item.quantity;
    const totalPrice = item.price;

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
        price: response.data.totalPrice,
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
    const currentItems = this.cache.get(billId) || await this.getItems(billId);

    const newItems = currentItems.filter(item => item.id !== itemId);

    this.cache.set(billId, newItems);

    await this.syncWithBackend(billId, newItems);

    return newItems;
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
      throw new Error(error.response?.data?.message || error.message || 'Erro ao atualizar nome do item');
    }
  }

  async updateItemPrice(billId: string, itemId: string, totalPrice: number, unitPrice: number): Promise<BillItem> {
    if (totalPrice <= 0) {
      throw new Error('O valor do item deve ser maior que zero');
    }

    try {
      const api = apiService.getApi();
      const response = await api.patch(`/bills/${billId}/items/${itemId}`, {
        totalPrice,
        unitPrice,
      });

      // Atualizar cache
      const currentItems = this.cache.get(billId) || await this.getItems(billId);
      const updatedItems = currentItems.map(item =>
        item.id === itemId
          ? {
              ...item,
              price: response.data.totalPrice,
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
      throw new Error(error.response?.data?.message || error.message || 'Erro ao atualizar valor do item');
    }
  }

  async updateItemQuantity(billId: string, itemId: string, quantity: number, totalPrice: number): Promise<BillItem> {
    if (quantity < 1 || !Number.isInteger(quantity)) {
      throw new Error('A quantidade deve ser um número inteiro maior ou igual a 1');
    }

    try {
      const api = apiService.getApi();
      const unitPrice = totalPrice / quantity;
      const response = await api.patch(`/bills/${billId}/items/${itemId}`, {
        quantity,
        totalPrice,
        unitPrice,
      });

      const currentItems = this.cache.get(billId) || await this.getItems(billId);
      const updatedItems = currentItems.map(item =>
        item.id === itemId
          ? {
              ...item,
              quantity: response.data.quantity,
              price: response.data.totalPrice,
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
      throw new Error(error.response?.data?.message || error.message || 'Erro ao atualizar quantidade do item');
    }
  }

  // Helper to sync changes via updateBill
  private async syncWithBackend(billId: string, items: BillItem[]) {
    // Convert back to backend format: { name, quantity, unitPrice, totalPrice }
    const payloadItems = items.map(item => ({
      name: item.name,
      quantity: item.quantity,
      unitPrice: Number((item.price / item.quantity).toFixed(2)),
      totalPrice: item.price
    }));

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
