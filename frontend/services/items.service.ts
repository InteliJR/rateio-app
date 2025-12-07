import billService from './bill.service';
import { BillItem } from '../components/items/ItemCard';

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

  async createItem(billId: string, item: Omit<BillItem, 'id' | 'assignedParticipants'>): Promise<BillItem[]> {
    const currentItems = this.cache.get(billId) || await this.getItems(billId);

    // Create optimistic item
    const newItem: BillItem = {
      ...item,
      id: Date.now().toString(),
      assignedParticipants: []
    };

    const newItems = [...currentItems, newItem];
    this.cache.set(billId, newItems);

    // Sync with backend
    await this.syncWithBackend(billId, newItems);

    return newItems;
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

  // Helper to sync changes via updateBill
  private async syncWithBackend(billId: string, items: BillItem[]) {
    // Convert back to backend format: { name, quantity, unitPrice, totalPrice }
    const payloadItems = items.map(item => ({
      name: item.name,
      quantity: item.quantity,
      unitPrice: Number((item.price / item.quantity).toFixed(2)),
      totalPrice: item.price
    }));

    try {
      await billService.updateBill(billId, {
        items: payloadItems
      });
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
