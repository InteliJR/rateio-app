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
      // Map backend items to frontend BillItems
      const items: BillItem[] = (bill.items || []).map((item: any, index: number) => ({
        id: item._id || index.toString(), // Use _id if available, else index
        name: item.description,
        quantity: 1, // Default to 1 if not provided by backend structure
        price: item.amount,
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
    // Convert back to backend format
    // Logic from scanned.tsx: split items by quantity if > 1
    const payloadItems: { description: string; amount: number }[] = [];

    items.forEach(item => {
      if (item.quantity > 1) {
        const unitPrice = item.price / item.quantity;
        for (let i = 0; i < item.quantity; i++) {
          payloadItems.push({
            description: item.name,
            amount: Number(unitPrice.toFixed(2))
          });
        }
      } else {
        payloadItems.push({
          description: item.name,
          amount: item.price
        });
      }
    });

    try {
      await billService.updateBill(billId, {
        items: payloadItems
      });
    } catch (error) {
      console.error('Sync failed:', error);
      // Should we revert cache? For now, let's keep optimistic UI but log error
      throw error;
    }
  }

  clearCache(billId: string) {
    this.cache.delete(billId);
  }
}

export default new ItemsService();
