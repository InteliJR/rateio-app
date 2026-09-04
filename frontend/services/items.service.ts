import { logger } from "../lib/logger";
import billService from "./bill.service";
import { BillItem } from "../components/items/ItemCard";
import { apiService } from "./api.service";
import { round2 } from "../lib/formatters";
import {
  MAX_ITEM_QUANTITY,
  MAX_MONEY_VALUE,
  getItemTotalPrice,
  normalizeMeasurementUnit,
} from "../lib/measurementUnits";

export interface ItemsServiceState {
  items: BillItem[];
  loading: boolean;
  error: string | null;
}

class ItemsService {
  private cache: Map<string, BillItem[]> = new Map();

  async getItems(billId: string): Promise<BillItem[]> {
    // Sempre buscar do backend para garantir dados atualizados (especialmente após OCR)
    // Não usar cache aqui para evitar dados desatualizados

    try {
      const bill = await billService.getBill(billId);
      logger.debug(
        "[ItemsService] Bill items from backend:",
        bill.items?.length || 0,
      );

      // Backend returns items as { id, name, quantity, unitPrice, totalPrice }
      // No frontend, usamos:
      // - quantity: quantidade
      // - price: VALOR UNITÁRIO
      // O valor total do item é sempre calculado como quantity × price quando necessário.
      const items: BillItem[] = (bill.items || []).map(
        (item: any, index: number) => {
          if (!item.id) {
            logger.warn(
              "[ItemsService] Item sem ID do backend, usando index:",
              index,
            );
          }
          return {
            id: item.id || `temp-${index}`, // Prefer ID from backend, fallback to temp
            name: item.name || `Item ${index + 1}`,
            quantity: Number(item.quantity) || 1,
            measurementUnit: normalizeMeasurementUnit(item.measurementUnit),
            // `price` representa o valor unitário no frontend
            price:
              typeof item.unitPrice === "string"
                ? parseFloat(item.unitPrice)
                : Number(item.unitPrice) || 0,
            totalPrice: Number(item.totalPrice) || 0,
            assignedParticipants: [],
          };
        },
      );

      logger.debug("[ItemsService] Mapped items:", items.length);

      // Atualizar cache
      this.cache.set(billId, items);
      return items;
    } catch (error: any) {
      logger.error("[ItemsService] Error fetching items:", error);
      throw new Error(error.message || "Failed to fetch items");
    }
  }

  async createItem(
    billId: string,
    item: Omit<BillItem, "id" | "assignedParticipants">,
  ): Promise<BillItem> {
    // Aqui `item.price` já é o VALOR UNITÁRIO vindo do frontend
    const unitPrice = item.price;
    const totalPrice = getItemTotalPrice(item);

    try {
      const api = apiService.getApi();
      const response = await api.post(`/bills/${billId}/items`, {
        name: item.name,
        quantity: item.quantity,
        measurementUnit: item.measurementUnit,
        unitPrice,
        totalPrice,
      });

      // Atualizar cache
      const currentItems =
        this.cache.get(billId) || (await this.getItems(billId));
      const newItem: BillItem = {
        id: response.data.id,
        name: response.data.name,
        quantity: Number(response.data.quantity),
        measurementUnit: normalizeMeasurementUnit(
          response.data.measurementUnit,
        ),
        // No frontend `price` é sempre o valor unitário
        price:
          typeof response.data.unitPrice === "string"
            ? parseFloat(response.data.unitPrice)
            : response.data.unitPrice,
        totalPrice: Number(response.data.totalPrice),
        assignedParticipants: [],
      };
      const updatedItems = [...currentItems, newItem];
      this.cache.set(billId, updatedItems);

      return newItem;
    } catch (error: any) {
      logger.error("[ItemsService] Error creating item:", error);
      throw new Error(
        error.response?.data?.message || error.message || "Erro ao criar item",
      );
    }
  }

  async updateItem(
    billId: string,
    itemId: string,
    updates: Partial<BillItem>,
  ): Promise<BillItem[]> {
    const currentItems =
      this.cache.get(billId) || (await this.getItems(billId));

    const newItems = currentItems.map((item) =>
      item.id === itemId ? { ...item, ...updates } : item,
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
      const currentItems =
        this.cache.get(billId) || (await this.getItems(billId));
      const newItems = currentItems.filter((item) => item.id !== itemId);
      this.cache.set(billId, newItems);

      return newItems;
    } catch (error: any) {
      logger.error("[ItemsService] Error deleting item:", error);

      // Se o item não foi encontrado (404), limpar cache para forçar recarga
      if (error.response?.status === 404) {
        this.clearCache(billId);
      }

      throw new Error(
        error.response?.data?.message ||
          error.message ||
          "Erro ao deletar item",
      );
    }
  }

  async updateItemName(
    billId: string,
    itemId: string,
    name: string,
  ): Promise<BillItem> {
    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new Error("O nome do item não pode estar vazio");
    }

    try {
      const api = apiService.getApi();
      const response = await api.patch(`/bills/${billId}/items/${itemId}`, {
        name: trimmedName,
      });

      // Atualizar cache
      const currentItems =
        this.cache.get(billId) || (await this.getItems(billId));
      const updatedItems = currentItems.map((item) =>
        item.id === itemId
          ? {
              ...item,
              name: response.data.name,
            }
          : item,
      );
      this.cache.set(billId, updatedItems);

      // Retornar item atualizado no formato BillItem
      const updatedItem = updatedItems.find((item) => item.id === itemId);
      if (!updatedItem) {
        throw new Error("Item não encontrado após atualização");
      }

      return updatedItem;
    } catch (error: any) {
      logger.error("[ItemsService] Error updating item name:", error);

      // Se o item não foi encontrado (404), limpar cache para forçar recarga
      if (error.response?.status === 404) {
        this.clearCache(billId);
      }

      throw new Error(
        error.response?.data?.message ||
          error.message ||
          "Erro ao atualizar nome do item",
      );
    }
  }

  /**
   * Atualiza o PREÇO UNITÁRIO de um item.
   * O total é sempre derivado como quantity × unitPrice.
   */
  async updateItemPrice(
    billId: string,
    itemId: string,
    unitPrice: number,
  ): Promise<BillItem> {
    if (unitPrice <= 0 || unitPrice > MAX_MONEY_VALUE) {
      throw new Error("O valor unitário do item deve ser maior que zero");
    }

    try {
      const api = apiService.getApi();
      const currentItems =
        this.cache.get(billId) || (await this.getItems(billId));
      const existing = currentItems.find((item) => item.id === itemId);
      const quantity = existing?.quantity ?? 1;
      const totalPrice = round2(unitPrice * quantity);

      const response = await api.patch(`/bills/${billId}/items/${itemId}`, {
        unitPrice,
        totalPrice,
      });

      // Atualizar cache com quantity + unitPrice vindos do backend
      const updatedItems = currentItems.map((item) =>
        item.id === itemId
          ? {
              ...item,
              quantity: Number(response.data.quantity),
              // manter convenção: `price` = unitPrice no frontend
              price:
                typeof response.data.unitPrice === "string"
                  ? parseFloat(response.data.unitPrice)
                  : response.data.unitPrice,
              totalPrice: Number(response.data.totalPrice),
            }
          : item,
      );
      this.cache.set(billId, updatedItems);

      const updatedItem = updatedItems.find((item) => item.id === itemId);
      if (!updatedItem) {
        throw new Error("Item não encontrado após atualização");
      }

      return updatedItem;
    } catch (error: any) {
      logger.error("[ItemsService] Error updating item price:", error);

      // Se o item não foi encontrado (404), limpar cache para forçar recarga
      if (error.response?.status === 404) {
        this.clearCache(billId);
      }

      throw new Error(
        error.response?.data?.message ||
          error.message ||
          "Erro ao atualizar valor do item",
      );
    }
  }

  /**
   * Atualiza apenas a QUANTIDADE de um item.
   * O valor unitário é mantido e o total é recalculado como quantity × unitPrice.
   */
  async updateItemQuantity(
    billId: string,
    itemId: string,
    quantity: number,
  ): Promise<BillItem> {
    if (quantity < 0.001 || quantity > MAX_ITEM_QUANTITY) {
      throw new Error("A quantidade deve estar entre 0,001 e 999.999,999");
    }

    try {
      const api = apiService.getApi();
      const currentItems =
        this.cache.get(billId) || (await this.getItems(billId));
      const existing = currentItems.find((item) => item.id === itemId);
      if (!existing) {
        throw new Error("Item não encontrado para atualização de quantidade");
      }

      // `existing.price` no frontend é sempre o valor unitário
      const unitPrice = existing.price;
      const totalPrice = round2(unitPrice * quantity);

      const response = await api.patch(`/bills/${billId}/items/${itemId}`, {
        quantity,
        totalPrice,
        unitPrice,
      });

      const updatedItems = currentItems.map((item) =>
        item.id === itemId
          ? {
              ...item,
              quantity: Number(response.data.quantity),
              // manter convenção: `price` = unitPrice no frontend
              price:
                typeof response.data.unitPrice === "string"
                  ? parseFloat(response.data.unitPrice)
                  : response.data.unitPrice,
              totalPrice: Number(response.data.totalPrice),
            }
          : item,
      );
      this.cache.set(billId, updatedItems);

      const updatedItem = updatedItems.find((item) => item.id === itemId);
      if (!updatedItem) {
        throw new Error("Item não encontrado após atualização");
      }

      return updatedItem;
    } catch (error: any) {
      logger.error("[ItemsService] Error updating item quantity:", error);

      // Se o item não foi encontrado (404), limpar cache para forçar recarga
      if (error.response?.status === 404) {
        this.clearCache(billId);
      }

      throw new Error(
        error.response?.data?.message ||
          error.message ||
          "Erro ao atualizar quantidade do item",
      );
    }
  }

  async updateItemMeasurementUnit(
    billId: string,
    itemId: string,
    measurementUnit: BillItem["measurementUnit"],
  ): Promise<BillItem> {
    try {
      const api = apiService.getApi();
      const response = await api.patch(`/bills/${billId}/items/${itemId}`, {
        measurementUnit,
      });
      const currentItems =
        this.cache.get(billId) || (await this.getItems(billId));
      const updatedItems = currentItems.map((item) =>
        item.id === itemId
          ? {
              ...item,
              measurementUnit: normalizeMeasurementUnit(
                response.data.measurementUnit,
              ),
            }
          : item,
      );
      this.cache.set(billId, updatedItems);
      const updatedItem = updatedItems.find((item) => item.id === itemId);
      if (!updatedItem) throw new Error("Item não encontrado após atualização");
      return updatedItem;
    } catch (error: any) {
      logger.error(
        "[ItemsService] Error updating item measurement unit:",
        error,
      );
      throw new Error(
        error.response?.data?.message ||
          error.message ||
          "Erro ao atualizar unidade do item",
      );
    }
  }

  // Helper to sync changes via updateBill
  private async syncWithBackend(billId: string, items: BillItem[]) {
    // Converter de volta para o formato do backend: { name, quantity, unitPrice, totalPrice }
    // No frontend:
    // - quantity: quantidade
    // - price: valor unitário
    const payloadItems = items.map((item) => {
      const unitPrice = item.price;
      const totalPrice = getItemTotalPrice(item);
      return {
        name: item.name,
        quantity: item.quantity,
        measurementUnit: item.measurementUnit,
        unitPrice,
        totalPrice,
      };
    });

    logger.debug(
      "[ItemsService] Sending payload to updateBill:",
      JSON.stringify(payloadItems, null, 2),
    );

    try {
      await billService.updateBill(billId, {
        items: payloadItems,
      });
      logger.debug("[ItemsService] updateBill success");
    } catch (error) {
      logger.error("Sync failed:", error);
      // Revert cache logic could go here
      throw error;
    }
  }

  clearCache(billId: string) {
    this.cache.delete(billId);
  }
}

export default new ItemsService();
