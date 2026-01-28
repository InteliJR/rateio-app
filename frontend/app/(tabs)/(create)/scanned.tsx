import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  TextInput,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { BillItem } from "../../../components/items/ItemCard";
import { AddItemModal } from "../../../components/modals/AddItemModal";
import billService from "../../../services/bill.service";
import itemsService from "../../../services/items.service";
import participantsService, {
  Participant,
} from "../../../services/participants.service";
import divisionsService from "../../../services/divisions.service";

export default function ScannedBillScreen() {
  const { id, participants: participantsParam } = useLocalSearchParams();
  const router = useRouter();

  const [billName, setBillName] = useState("");
  const [items, setItems] = useState<BillItem[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [expandedItemId, setExpandedItemId] = useState<string>("");
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [billStatus, setBillStatus] = useState<
    "PENDING_OCR" | "OCR_FAILED" | "REVIEWING" | "DIVIDING" | "COMPLETED" | null
  >(null);
  const [processingOcr, setProcessingOcr] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [savingDivisions, setSavingDivisions] = useState<string | null>(null);

  // Estados de edição inline
  const [editingItemNameId, setEditingItemNameId] = useState<string | null>(
    null,
  );
  const [editingItemPriceId, setEditingItemPriceId] = useState<string | null>(
    null,
  );
  const [editingItemQtyId, setEditingItemQtyId] = useState<string | null>(null);
  const [savingItemId, setSavingItemId] = useState<string | null>(null);
  const [itemNames, setItemNames] = useState<Record<string, string>>({});
  const [itemPrices, setItemPrices] = useState<Record<string, string>>({});
  const [itemQuantities, setItemQuantities] = useState<Record<string, string>>(
    {},
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const saveTimeoutsRef = useRef<{ [key: string]: any }>({});

  useEffect(() => {
    loadBillData();

    // Limpar timeouts ao desmontar
    return () => {
      Object.values(saveTimeoutsRef.current).forEach((timeout) =>
        clearTimeout(timeout),
      );
      saveTimeoutsRef.current = {};
    };
  }, [id]);

  // Polling quando status for PENDING_OCR
  useEffect(() => {
    if (!id || billStatus !== "PENDING_OCR") return;

    console.log("[Scanned] Starting polling for OCR completion...");
    setProcessingOcr(true);
    let attempts = 0;
    const maxAttempts = 20; // Máximo de ~2 minutos

    const pollInterval = setInterval(async () => {
      attempts++;

      // Limite de tentativas para evitar polling infinito
      if (attempts > maxAttempts) {
        clearInterval(pollInterval);
        setProcessingOcr(false);
        Alert.alert(
          "Tempo limite excedido",
          "O processamento está demorando mais que o esperado. Você pode adicionar os itens manualmente.",
          [{ text: "OK" }],
        );
        return;
      }

      try {
        const billData = await billService.getBill(id as string);
        console.log("[Scanned] Polling - Status:", billData.status);

        if (billData.status !== "PENDING_OCR") {
          // OCR terminou ou falhou, limpar cache e recarregar dados
          console.log(
            "[Scanned] OCR completed, clearing cache and reloading data...",
          );
          itemsService.clearCache(id as string);
          clearInterval(pollInterval);
          setProcessingOcr(false);
          loadBillData();

          if (billData.status === "OCR_FAILED") {
            Alert.alert(
              "OCR Falhou",
              "Não foi possível reconhecer os itens da conta. Você pode adicionar os itens manualmente.",
              [{ text: "OK" }],
            );
          }
        }
      } catch (error: any) {
        console.error("[Scanned] Error polling:", error);

        // Se for erro 429 (Too Many Requests), aumentar intervalo
        if (
          error.response?.status === 429 ||
          error.message?.includes("Too Many Requests")
        ) {
          console.warn(
            "Rate limit atingido no polling, aguardando mais tempo...",
          );
        }
      }
    }, 5000); // Poll a cada 5 segundos

    return () => {
      console.log("[Scanned] Stopping polling");
      clearInterval(pollInterval);
    };
  }, [id, billStatus]);

  // Inicializar nomes, preços e quantidades dos itens quando items mudarem
  useEffect(() => {
    const names: Record<string, string> = {};
    const prices: Record<string, string> = {};
    const quantities: Record<string, string> = {};
    items.forEach((item) => {
      names[item.id] = item.name;
      prices[item.id] = item.price.toFixed(2).replace(".", ",");
      quantities[item.id] = item.quantity.toString();
    });
    setItemNames(names);
    setItemPrices(prices);
    setItemQuantities(quantities);
  }, [items]);

  const loadBillData = async () => {
    try {
      setLoading(true);
      console.log("[Scanned] Loading bill data for ID:", id);

      // Limpar cache para garantir dados atualizados
      itemsService.clearCache(id as string);

      // 1. Carregar informações da conta
      const billData = await billService.getBill(id as string);
      console.log("[Scanned] Bill data:", billData);

      setBillStatus(billData.status);
      setIsCompleted(billData.status === "COMPLETED");
      setBillName(billData.establishmentName || "");

      // Se o OCR ainda está processando, não tentar carregar itens ainda
      if (billData.status === "PENDING_OCR") {
        setProcessingOcr(true);
        setItems([]);
        setParticipants([]);
        setLoading(false);
        return;
      }

      setProcessingOcr(false);

      if (billData.status === "COMPLETED") {
        console.log("[Scanned] Bill is completed - read-only mode");
      }

      // 2. Carregar itens da conta
      const itemsData = await itemsService.getItems(id as string);
      console.log("[Scanned] Items loaded:", itemsData.length);

      // 3. Carregar participantes
      let participantsData: Participant[] = [];
      try {
        participantsData = await participantsService.getParticipantsByBill(
          id as string,
        );
        console.log("[Scanned] Participants loaded:", participantsData.length);

        if (participantsData.length === 0) {
          console.warn("[Scanned] No participants found for this bill");
        }

        setParticipants(participantsData);
      } catch (error: any) {
        console.error("[Scanned] Error loading participants:", error);
        setParticipants([]);
      }

      // 4. Carregar divisões existentes (assignments)
      let divisionsData: any[] = [];
      try {
        const divisionsResponse = await divisionsService.findAllByBill(
          id as string,
        );
        console.log(
          "[Scanned] Divisions response:",
          JSON.stringify(divisionsResponse, null, 2),
        );

        // Backend retorna: { billId, items: [{ billItem, divisions: [], totalDivided }], totalDivisions }
        if (divisionsResponse && typeof divisionsResponse === "object") {
          if (
            "items" in divisionsResponse &&
            Array.isArray((divisionsResponse as any).items)
          ) {
            // Extrair todas as divisões de todos os itens
            const allDivisions: any[] = [];
            (divisionsResponse as any).items.forEach((itemGroup: any) => {
              if (
                itemGroup &&
                itemGroup.divisions &&
                Array.isArray(itemGroup.divisions)
              ) {
                allDivisions.push(...itemGroup.divisions);
              }
            });
            divisionsData = allDivisions;
          } else if (Array.isArray(divisionsResponse)) {
            // Se for array direto (fallback)
            divisionsData = divisionsResponse;
          }
        }
        console.log("[Scanned] Divisions loaded:", divisionsData.length);
      } catch (error: any) {
        console.warn(
          "[Scanned] Error loading divisions (may not exist yet):",
          error.message,
        );
        divisionsData = [];
      }

      // 5. Mapear divisões para assignedParticipants nos itens
      const itemsWithAssignments = itemsData.map((item) => {
        // Encontrar todas as divisões deste item
        const itemDivisions = divisionsData.filter(
          (div: any) => div.billItemId === item.id,
        );

        // Mapear participantIds para nomes de participantes
        const assignedParticipantNames = itemDivisions
          .map((div: any) => {
            const participant = participantsData.find(
              (p: Participant) => p.id === div.participantId,
            );
            return participant?.name || "";
          })
          .filter(Boolean);

        return {
          ...item,
          assignedParticipants: assignedParticipantNames,
        };
      });

      setItems(itemsWithAssignments);
      console.log("[Scanned] Items with assignments:", itemsWithAssignments);
    } catch (error: any) {
      console.error("[Scanned] Error loading bill data:", error);
      Alert.alert(
        "Erro",
        error.message || "Não foi possível carregar os dados da conta",
      );
    } finally {
      setLoading(false);
    }
  };

  const saveBillName = async () => {
    if (!billName.trim()) return;

    try {
      setSavingName(true);
      await billService.updateBill(id as string, {
        establishmentName: billName.trim(),
      });
    } catch (error) {
      console.error("Error saving bill name:", error);
      Alert.alert("Erro", "Não foi possível salvar o nome da conta");
    } finally {
      setSavingName(false);
    }
  };

  // Participantes agora são carregados do backend no loadBillData

  /**
   * Recalcula as divisões de um item quando preço ou quantidade muda
   * Remove todas as divisões existentes e cria novas com o valor atualizado
   */
  const recalculateDivisionsForItem = async (
    itemId: string,
    updatedItem: BillItem,
  ) => {
    try {
      console.log("[Scanned] Recalculating divisions for item:", itemId);

      // Buscar divisões atuais do item
      const allDivisions = await divisionsService.findAllByBill(id as string);
      const currentItemDivisions = allDivisions.filter(
        (div: any) => div.billItemId === itemId,
      );

      if (currentItemDivisions.length === 0) {
        console.log("[Scanned] No divisions to recalculate for item:", itemId);
        return;
      }

      // Calcular novo valor total do item e shareAmount
      const totalItemPrice = updatedItem.price * (updatedItem.quantity || 1);
      const participantCount = updatedItem.assignedParticipants.length;
      const newShareAmount = divisionsService.calculateShareAmount(
        totalItemPrice,
        participantCount,
      );

      console.log("[Scanned] New total price:", totalItemPrice);
      console.log("[Scanned] New share amount:", newShareAmount);

      // Remover todas as divisões existentes deste item em paralelo
      await Promise.all(
        currentItemDivisions.map((div: any) => divisionsService.remove(div.id))
      );

      // Criar novas divisões com valores recalculados
      const participantIds = currentItemDivisions.map(
        (div: any) => div.participantId,
      );
      const divisions = participantIds.map((participantId: string) => ({
        participantId,
        shareAmount: newShareAmount,
      }));

      await divisionsService.createBatch(itemId, divisions);
      console.log(
        "[Scanned] Divisions recalculated for item:",
        itemId,
        "New share:",
        newShareAmount,
      );
    } catch (error: any) {
      console.error("[Scanned] Error recalculating divisions:", error);
      // Não mostrar alert para não interromper o fluxo
    }
  };

  const toggleParticipant = async (itemId: string, participantName: string) => {
    if (isCompleted) {
      Alert.alert(
        "Conta Finalizada",
        "Esta conta já foi finalizada e não pode ser editada.",
        [{ text: "OK" }],
      );
      return;
    }

    // Encontrar o participante pelo nome
    const participant = participants.find((p) => p.name === participantName);
    if (!participant) {
      console.error("[Scanned] Participant not found:", participantName);
      return;
    }

    // Encontrar o item
    const item = items.find((i) => i.id === itemId);
    if (!item) {
      console.error("[Scanned] Item not found:", itemId);
      console.error(
        "[Scanned] Available items:",
        items.map((i) => ({ id: i.id, name: i.name })),
      );
      Alert.alert("Erro", "Item não encontrado. Tente recarregar a página.");
      return;
    }

    console.log(
      "[Scanned] Toggling participant:",
      participantName,
      "for item:",
      itemId,
      "Item name:",
      item.name,
    );

    const isAssigned = item.assignedParticipants.includes(participantName);

    // Atualizar estado local imediatamente (otimista)
    setItems((prevItems) =>
      prevItems.map((i) => {
        if (i.id === itemId) {
          return {
            ...i,
            assignedParticipants: isAssigned
              ? i.assignedParticipants.filter((p) => p !== participantName)
              : [...i.assignedParticipants, participantName],
          };
        }
        return i;
      }),
    );

    // Salvar no backend
    try {
      setSavingDivisions(itemId);

      // Buscar divisões atuais deste item
      const allDivisions = await divisionsService.findAllByBill(id as string);
      const currentItemDivisions = allDivisions.filter(
        (div: any) => div.billItemId === itemId,
      );

      if (isAssigned) {
        // Remover participante: recalcular todas as divisões do item
        const newAssignedCount = item.assignedParticipants.length - 1;

        if (newAssignedCount === 0) {
          // Se não há mais participantes, remover todas as divisões
          for (const div of currentItemDivisions) {
            await divisionsService.remove(div.id);
          }
          console.log("[Scanned] All divisions removed (no participants left)");
        } else {
          // Recalcular divisões para os participantes restantes
          // item.price é unitPrice, precisamos do totalPrice = unitPrice * quantity
          const totalItemPrice = item.price * (item.quantity || 1);
          const shareAmount = divisionsService.calculateShareAmount(
            totalItemPrice,
            newAssignedCount,
          );

          // Remover todas as divisões existentes deste item em paralelo
          await Promise.all(
            currentItemDivisions.map((div: any) => divisionsService.remove(div.id))
          );

          // Criar novas divisões com valores recalculados para os participantes restantes
          const remainingAssignments = item.assignedParticipants
            .filter((name) => name !== participantName)
            .map((name) => {
              const p = participants.find((pp) => pp.name === name);
              return p!;
            });

          const divisions = remainingAssignments.map((p) => ({
            participantId: p.id,
            shareAmount: shareAmount,
          }));

          console.log(
            "[Scanned] Creating batch divisions for item:",
            itemId,
            "with divisions:",
            divisions,
          );
          await divisionsService.createBatch(itemId, divisions);
          console.log(
            "[Scanned] Divisions recalculated after removal for item:",
            itemId,
            "Share amount:",
            shareAmount,
          );
        }
      } else {
        // Adicionar participante: recalcular todas as divisões do item
        const newAssignedCount = item.assignedParticipants.length + 1;
        // item.price é unitPrice, precisamos do totalPrice = unitPrice * quantity
        const totalItemPrice = item.price * (item.quantity || 1);
        const shareAmount = divisionsService.calculateShareAmount(
          totalItemPrice,
          newAssignedCount,
        );

        // Remover todas as divisões existentes deste item em paralelo
        await Promise.all(
          currentItemDivisions.map((div: any) => divisionsService.remove(div.id))
        );

        // Criar novas divisões com valores recalculados para todos os participantes
        const newAssignments = [
          ...item.assignedParticipants.map((name) => {
            const p = participants.find((pp) => pp.name === name);
            return p!;
          }),
          participant,
        ];

        const divisions = newAssignments.map((p) => ({
          participantId: p.id,
          shareAmount: shareAmount,
        }));

        console.log(
          "[Scanned] Creating batch divisions for item:",
          itemId,
          "with divisions:",
          divisions,
        );
        await divisionsService.createBatch(itemId, divisions);
        console.log(
          "[Scanned] Divisions recalculated for item:",
          itemId,
          "Share amount:",
          shareAmount,
        );
      }
    } catch (error: any) {
      console.error("[Scanned] Error saving division:", error);
      Alert.alert(
        "Erro",
        error.message || "Não foi possível salvar a divisão. Tente novamente.",
      );

      // Reverter mudança local em caso de erro
      setItems((prevItems) =>
        prevItems.map((i) => {
          if (i.id === itemId) {
            return {
              ...i,
              assignedParticipants: isAssigned
                ? [...i.assignedParticipants, participantName]
                : i.assignedParticipants.filter((p) => p !== participantName),
            };
          }
          return i;
        }),
      );
    } finally {
      setSavingDivisions(null);
    }
  };

  const handleAddNewItem = async (
    newItem: Omit<BillItem, "id" | "assignedParticipants">,
  ) => {
    try {
      // Criar item no backend
      const createdItems = await itemsService.createItem(id as string, newItem);

      // Atualizar estado local com os itens retornados do backend
      if (Array.isArray(createdItems)) {
        setItems(createdItems);
      } else {
        // Se retornar um único item, adicionar à lista existente
        setItems([...items, createdItems]);
      }
      setIsModalVisible(false);
    } catch (error: any) {
      console.error("[Scanned] Error adding item:", error);
      Alert.alert(
        "Erro",
        error.message || "Não foi possível adicionar o item. Tente novamente.",
      );
    }
  };

  const deleteItem = async (itemId: string) => {
    if (isCompleted) {
      Alert.alert(
        "Conta Finalizada",
        "Esta conta já foi finalizada e não pode ser editada.",
        [{ text: "OK" }],
      );
      return;
    }

    try {
      // Deletar item no backend (isso também remove as divisões relacionadas)
      const result = await itemsService.deleteItem(id as string, itemId);

      // Se retornar a lista atualizada, usar ela; senão filtrar localmente
      if (Array.isArray(result)) {
        setItems(result);
      } else {
        setItems(items.filter((item) => item.id !== itemId));
      }

      if (expandedItemId === itemId) {
        setExpandedItemId("");
      }
    } catch (error: any) {
      console.error("[Scanned] Error deleting item:", error);
      Alert.alert(
        "Erro",
        error.message || "Não foi possível deletar o item. Tente novamente.",
      );
    }
  };

  // === FUNÇÕES DE EDIÇÃO DE NOME ===
  const handleItemNameChange = (itemId: string, newName: string) => {
    setItemNames((prev) => ({
      ...prev,
      [itemId]: newName,
    }));
  };

  const handleItemNameBlur = async (itemId: string) => {
    // Limpar timeout se existir
    if (saveTimeoutsRef.current[itemId]) {
      clearTimeout(saveTimeoutsRef.current[itemId]);
      delete saveTimeoutsRef.current[itemId];
    }

    const trimmedName = itemNames[itemId]?.trim();

    // Validar que nome não está vazio - mostrar alerta e manter em modo edição
    if (!trimmedName) {
      Alert.alert("Atenção", "O nome do item não pode ficar vazio");
      // Manter o foco no campo para o usuário digitar
      return;
    }

    // Se não mudou, apenas sair do modo de edição
    const originalItem = items.find((item) => item.id === itemId);
    if (originalItem && trimmedName === originalItem.name) {
      setEditingItemNameId(null);
      return;
    }

    // Salvar no backend com debounce
    const timeoutId = setTimeout(async () => {
      try {
        setSavingItemId(itemId);
        await itemsService.updateItemName(id as string, itemId, trimmedName);

        // Atualizar estado local
        setItems((prevItems) =>
          prevItems.map((item) =>
            item.id === itemId ? { ...item, name: trimmedName } : item,
          ),
        );
      } catch (error: any) {
        console.error("Error updating item name:", error);

        // Extrair mensagem de erro mais amigável
        let errorMessage = "Não foi possível atualizar o nome do item";
        if (error.response?.data?.message) {
          errorMessage = error.response.data.message;
        } else if (error.message) {
          errorMessage = error.message;
        }

        // Tratar erro 429 (Too Many Requests)
        if (
          error.response?.status === 429 ||
          error.message?.includes("Too Many Requests")
        ) {
          errorMessage =
            "Muitas requisições. Aguarde um momento e tente novamente.";
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }

        // Só mostrar alert se não for erro 404
        if (error.response?.status !== 404) {
          Alert.alert("Erro", errorMessage);
        }

        // Reverter para o valor original em caso de erro
        const originalItem = items.find((item) => item.id === itemId);
        if (originalItem) {
          setItemNames((prev) => ({
            ...prev,
            [itemId]: originalItem.name,
          }));
        }
      } finally {
        setSavingItemId(null);
        setEditingItemNameId(null);
      }
    }, 1000); // Debounce de 1 segundo para reduzir chamadas

    saveTimeoutsRef.current[itemId] = timeoutId;
  };

  // === FUNÇÕES DE EDIÇÃO DE PREÇO ===
  const handleItemPriceChange = (itemId: string, newPrice: string) => {
    // Permitir apenas números, vírgula e ponto
    const cleaned = newPrice.replace(/[^0-9,.]/g, "").replace(",", ".");
    setItemPrices((prev) => ({
      ...prev,
      [itemId]: cleaned.replace(".", ","),
    }));
  };

  const handleItemPriceBlur = async (itemId: string) => {
    // Limpar timeout se existir
    if (saveTimeoutsRef.current[itemId]) {
      clearTimeout(saveTimeoutsRef.current[itemId]);
      delete saveTimeoutsRef.current[itemId];
    }

    const priceStr = itemPrices[itemId]?.replace(",", ".") || "0";
    const newUnitPrice = parseFloat(priceStr);
    const originalItem = items.find((item) => item.id === itemId);

    if (!originalItem) return;

    // Validar valor unitário > 0
    if (isNaN(newUnitPrice) || newUnitPrice <= 0) {
      setItemPrices((prev) => ({
        ...prev,
        [itemId]: originalItem.price.toFixed(2).replace(".", ","),
      }));
      setEditingItemPriceId(null);
      return;
    }

    // Se não mudou, apenas sair do modo de edição
    if (Math.abs(newUnitPrice - originalItem.price) < 0.01) {
      setEditingItemPriceId(null);
      return;
    }

    // Salvar no backend com debounce
    const timeoutId = setTimeout(async () => {
      try {
        setSavingItemId(itemId);
        // Atualizar PREÇO UNITÁRIO no backend
        await itemsService.updateItemPrice(id as string, itemId, newUnitPrice);

        // Atualizar estado local: manter convenção `price` = unitário
        const updatedItem = { ...originalItem, price: newUnitPrice };
        setItems((prevItems) =>
          prevItems.map((item) =>
            item.id === itemId ? updatedItem : item,
          ),
        );

        // Recalcular divisões se houver participantes atribuídos
        if (originalItem.assignedParticipants && originalItem.assignedParticipants.length > 0) {
          await recalculateDivisionsForItem(itemId, updatedItem);
        }
      } catch (error: any) {
        console.error("Error updating item price:", error);

        let errorMessage = "Não foi possível atualizar o valor do item";
        if (error.response?.data?.message) {
          errorMessage = error.response.data.message;
        } else if (error.message) {
          errorMessage = error.message;
        }

        if (
          error.response?.status === 429 ||
          error.message?.includes("Too Many Requests")
        ) {
          errorMessage =
            "Muitas requisições. Aguarde um momento e tente novamente.";
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }

        if (error.response?.status !== 404) {
          Alert.alert("Erro", errorMessage);
        }

        // Reverter para o valor original em caso de erro
        setItemPrices((prev) => ({
          ...prev,
          [itemId]: originalItem.price.toFixed(2).replace(".", ","),
        }));
      } finally {
        setSavingItemId(null);
        setEditingItemPriceId(null);
      }
    }, 1000); // Debounce de 1 segundo para reduzir chamadas

    saveTimeoutsRef.current[itemId] = timeoutId;
  };

  // === FUNÇÕES DE EDIÇÃO DE QUANTIDADE ===
  const handleItemQuantityChange = (itemId: string, newQty: string) => {
    // Permitir campo vazio durante a edição, apenas remover caracteres não numéricos
    const cleaned = newQty.replace(/[^0-9]/g, "");
    setItemQuantities((prev) => ({
      ...prev,
      [itemId]: cleaned,
    }));
  };

  const handleItemQuantityBlur = async (itemId: string) => {
    // Limpar timeout se existir
    if (saveTimeoutsRef.current[itemId]) {
      clearTimeout(saveTimeoutsRef.current[itemId]);
      delete saveTimeoutsRef.current[itemId];
    }

    const qtyStr = itemQuantities[itemId] || "0";
    const newQuantity = parseInt(qtyStr, 10);
    const originalItem = items.find((item) => item.id === itemId);

    if (!originalItem) return;

    if (isNaN(newQuantity) || newQuantity < 1) {
      setItemQuantities((prev) => ({
        ...prev,
        [itemId]: originalItem.quantity.toString(),
      }));
      setEditingItemQtyId(null);
      return;
    }

    if (newQuantity === originalItem.quantity) {
      setEditingItemQtyId(null);
      return;
    }

    // Salvar nova QUANTIDADE no backend
    const timeoutId = setTimeout(async () => {
      try {
        setSavingItemId(itemId);
        await itemsService.updateItemQuantity(
          id as string,
          itemId,
          newQuantity,
        );

        const updatedItem = { ...originalItem, quantity: newQuantity };
        setItems((prevItems) =>
          prevItems.map((item) =>
            item.id === itemId ? updatedItem : item,
          ),
        );

        // Recalcular divisões se houver participantes atribuídos
        if (originalItem.assignedParticipants && originalItem.assignedParticipants.length > 0) {
          await recalculateDivisionsForItem(itemId, updatedItem);
        }
      } catch (error: any) {
        console.error("Error updating item quantity:", error);

        let errorMessage = "Não foi possível atualizar a quantidade do item";
        if (error.response?.data?.message) {
          errorMessage = error.response.data.message;
        } else if (error.message) {
          errorMessage = error.message;
        }

        if (
          error.response?.status === 429 ||
          error.message?.includes("Too Many Requests")
        ) {
          errorMessage =
            "Muitas requisições. Aguarde um momento e tente novamente.";
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }

        if (error.response?.status !== 404) {
          Alert.alert("Erro", errorMessage);
        }

        setItemQuantities((prev) => ({
          ...prev,
          [itemId]: originalItem.quantity.toString(),
        }));
      } finally {
        setSavingItemId(null);
        setEditingItemQtyId(null);
      }
    }, 1000); // Debounce de 1 segundo para reduzir chamadas

    saveTimeoutsRef.current[itemId] = timeoutId;
  };

  const handleSummary = () => {
    router.push({
      pathname: "/(tabs)/(create)/summary",
      params: {
        id: id as string, // Pass bill ID for backend data fetching
      },
    });
  };

  const formatCurrency = (value: number) => {
    return `R$ ${value.toFixed(2).replace(".", ",")}`;
  };

  /**
   * IMPORTANTE:
   * - No frontend, o campo `price` do BillItem representa o VALOR UNITÁRIO.
   * - O total da conta deve ser a soma de (quantidade × valor unitário) para cada item.
   */
  const calculateTotal = () => {
    // item.price é unitPrice, então total = unitPrice × quantity
    const total = items.reduce((sum, item) => {
      const unitPrice = Number(item.price) || 0;
      const quantity = Number(item.quantity) || 1;
      const itemTotal = unitPrice * quantity;
      console.log(`[Scanned] Item: ${item.name}, UnitPrice: ${unitPrice}, Qty: ${quantity}, Total: ${itemTotal}`);
      return sum + itemTotal;
    }, 0);
    console.log("[Scanned] Calculated total:", total);
    return total;
  };

  return (
    <SafeAreaView style={styles.container}>
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#81007F" />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.contentContainer}>
            {/* Banner de Conta Finalizada */}
            {isCompleted && (
              <View style={styles.completedBanner}>
                <MaterialCommunityIcons
                  name="check-circle"
                  size={20}
                  color="#10b981"
                />
                <Text style={styles.completedBannerText}>
                  Conta finalizada - Somente leitura
                </Text>
              </View>
            )}

            {/* Header */}
            <View style={styles.header}>
              <View style={styles.billNameContainer}>
                <View style={styles.billNameInputWrapper}>
                  <TextInput
                    style={[
                      styles.billNameInput,
                      !savingName && billName && styles.billNameInputEditable,
                    ]}
                    value={billName}
                    onChangeText={setBillName}
                    onBlur={saveBillName}
                    onFocus={() => {}}
                    placeholder="Nome da conta"
                    placeholderTextColor="#999"
                    editable={!isCompleted}
                  />
                  {!savingName && billName && !isCompleted && (
                    <Ionicons
                      name="create-outline"
                      size={16}
                      color="#8B2E8F"
                      style={styles.billNameEditIcon}
                    />
                  )}
                </View>
                {savingName && (
                  <ActivityIndicator
                    size="small"
                    color="#81007F"
                    style={styles.savingIndicator}
                  />
                )}
              </View>
              <TouchableOpacity
                style={styles.addItemBtn}
                onPress={() => setIsModalVisible(true)}
                disabled={isCompleted}
              >
                <Text style={styles.addItemBtnText}>+ Item</Text>
              </TouchableOpacity>
            </View>

            {/* Mensagem de processamento OCR */}
            {processingOcr && (
              <View style={styles.processingContainer}>
                <ActivityIndicator size="large" color="#81007F" />
                <Text style={styles.processingText}>
                  Processando imagem e reconhecendo itens...
                </Text>
                <Text style={styles.processingSubtext}>
                  Isso pode levar alguns segundos
                </Text>
              </View>
            )}

            {/* Mensagem quando OCR falhou */}
            {billStatus === "OCR_FAILED" && items.length === 0 && (
              <View style={styles.errorContainer}>
                <Ionicons
                  name="alert-circle-outline"
                  size={48}
                  color="#FF6B6B"
                />
                <Text style={styles.errorTitle}>
                  Não foi possível reconhecer os itens
                </Text>
                <Text style={styles.errorText}>
                  Você pode adicionar os itens manualmente usando o botão "+
                  Item"
                </Text>
              </View>
            )}

            {/* Lista de items vazia */}
            {!processingOcr &&
              items.length === 0 &&
              billStatus !== "OCR_FAILED" && (
                <View style={styles.emptyContainer}>
                  <MaterialCommunityIcons
                    name="receipt"
                    size={48}
                    color="#ccc"
                  />
                  <Text style={styles.emptyText}>Nenhum item encontrado</Text>
                  <Text style={styles.emptySubtext}>
                    Adicione itens manualmente usando o botão "+ Item"
                  </Text>
                </View>
              )}

            {/* Lista de items */}
            {!processingOcr &&
              items.map((item, index) => (
                <View key={item.id} style={styles.itemCardWrapper}>
                  <View style={styles.itemCardMain}>
                    <View style={styles.itemCardLeft}>
                      <View
                        style={[styles.inputWrapper, styles.nameInputWrapper]}
                      >
                        {editingItemNameId === item.id && !isCompleted ? (
                          <TextInput
                            style={[
                              styles.itemCardName,
                              styles.itemCardNameFocused,
                            ]}
                            value={
                              itemNames[item.id] !== undefined
                                ? itemNames[item.id]
                                : item.name
                            }
                            onChangeText={(text) =>
                              handleItemNameChange(item.id, text)
                            }
                            onBlur={() => handleItemNameBlur(item.id)}
                            placeholder="Nome do item"
                            placeholderTextColor="#999"
                            editable={true}
                            underlineColorAndroid="transparent"
                            selectionColor="#8B2E8F"
                            multiline={false}
                            numberOfLines={1}
                          />
                        ) : (
                          <TouchableOpacity
                            style={styles.itemCardNameContainer}
                            onPress={() =>
                              !isCompleted && setEditingItemNameId(item.id)
                            }
                            activeOpacity={isCompleted ? 1 : 0.7}
                          >
                            <Text
                              style={styles.itemCardNameText}
                              numberOfLines={1}
                              ellipsizeMode="tail"
                            >
                              {itemNames[item.id] !== undefined
                                ? itemNames[item.id]
                                : item.name}
                            </Text>
                            {!isCompleted && (
                              <Ionicons
                                name="create-outline"
                                size={14}
                                color="#8B2E8F"
                                style={styles.editIconInContainer}
                              />
                            )}
                          </TouchableOpacity>
                        )}
                      </View>
                      {savingItemId === item.id && (
                        <ActivityIndicator
                          size="small"
                          color="#81007F"
                          style={styles.savingItemIndicator}
                        />
                      )}
                    </View>
                    <View style={styles.itemCardRight}>
                      <View style={styles.inputWrapper}>
                        <TextInput
                          style={[
                            styles.itemCardQty,
                            editingItemQtyId === item.id &&
                              styles.itemCardQtyFocused,
                            editingItemQtyId !== item.id &&
                              styles.itemCardQtyEditable,
                          ]}
                          value={
                            itemQuantities[item.id] !== undefined
                              ? itemQuantities[item.id]
                              : item.quantity.toString()
                          }
                          onChangeText={(text) =>
                            handleItemQuantityChange(item.id, text)
                          }
                          onBlur={() => handleItemQuantityBlur(item.id)}
                          onFocus={() => setEditingItemQtyId(item.id)}
                          keyboardType="number-pad"
                          placeholder="1"
                          placeholderTextColor="#999"
                          underlineColorAndroid="transparent"
                          selectionColor="#8B2E8F"
                          editable={!isCompleted}
                        />
                      </View>
                      <Text style={styles.qtySuffix}>x</Text>
                      <View style={styles.inputWrapper}>
                        <TextInput
                          style={[
                            styles.itemCardAmount,
                            editingItemPriceId === item.id &&
                              styles.itemCardAmountFocused,
                            editingItemPriceId !== item.id &&
                              styles.itemCardAmountEditable,
                          ]}
                          value={
                            itemPrices[item.id] ||
                            item.price.toFixed(2).replace(".", ",")
                          }
                          onChangeText={(text) =>
                            handleItemPriceChange(item.id, text)
                          }
                          onBlur={() => handleItemPriceBlur(item.id)}
                          onFocus={() => setEditingItemPriceId(item.id)}
                          keyboardType="numeric"
                          placeholder="0,00"
                          placeholderTextColor="#999"
                          underlineColorAndroid="transparent"
                          selectionColor="#8B2E8F"
                          editable={!isCompleted}
                        />
                      </View>
                      <TouchableOpacity
                        onPress={() =>
                          setExpandedItemId(
                            expandedItemId === item.id ? "" : item.id,
                          )
                        }
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name={
                            expandedItemId === item.id
                              ? "chevron-up"
                              : "chevron-down"
                          }
                          size={20}
                          color="#666"
                        />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Dropdown com checkboxes */}
                  {expandedItemId === item.id && (
                    <View style={styles.dropdownWrapper}>
                      <ScrollView
                        style={styles.checkboxesScroll}
                        scrollEnabled={true}
                        showsVerticalScrollIndicator={true}
                      >
                        <View style={styles.checkboxesList}>
                          {participants.length === 0 ? (
                            <View style={styles.emptyParticipantsContainer}>
                              <Text style={styles.emptyParticipantsText}>
                                Nenhum participante encontrado
                              </Text>
                              <Text style={styles.emptyParticipantsSubtext}>
                                Adicione participantes na tela anterior
                              </Text>
                            </View>
                          ) : (
                            participants.map((participant, idx) => {
                              const isAssigned =
                                item.assignedParticipants.includes(
                                  participant.name,
                                );
                              const isSaving = savingDivisions === item.id;
                              return (
                                <TouchableOpacity
                                  key={participant.id || idx}
                                  style={styles.checkboxRow}
                                  onPress={() =>
                                    toggleParticipant(item.id, participant.name)
                                  }
                                  activeOpacity={0.6}
                                  disabled={isSaving || isCompleted}
                                >
                                  <View
                                    style={[
                                      styles.checkbox,
                                      isAssigned && styles.checkboxActive,
                                    ]}
                                  >
                                    {isAssigned && (
                                      <Ionicons
                                        name="checkmark"
                                        size={10}
                                        color="#8B2E8F"
                                      />
                                    )}
                                  </View>
                                  <Text style={styles.participantName}>
                                    {participant.name}
                                  </Text>
                                  {isSaving && (
                                    <ActivityIndicator
                                      size="small"
                                      color="#8B2E8F"
                                      style={{ marginLeft: 8 }}
                                    />
                                  )}
                                </TouchableOpacity>
                              );
                            })
                          )}
                        </View>
                      </ScrollView>

                      {/* Buttons Footer Row */}
                      <View style={styles.footerRow}>
                        {!isCompleted && (
                          <>
                            <TouchableOpacity
                              style={styles.deleteIconButton}
                              onPress={() => deleteItem(item.id)}
                            >
                              <MaterialCommunityIcons
                                name="trash-can-outline"
                                size={20}
                                color="#999"
                              />
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.addItemButton}
                              onPress={() => setIsModalVisible(true)}
                            >
                              <Text style={styles.addItemButtonLabel}>
                                Adicionar
                              </Text>
                            </TouchableOpacity>
                          </>
                        )}
                      </View>
                    </View>
                  )}
                </View>
              ))}

            {/* Card do Total - só mostrar se não estiver processando e houver itens */}
            {!processingOcr && items.length > 0 && (
              <View style={styles.totalCardWrapper}>
                <Text style={styles.totalCardLabel}>Total:</Text>
                <Text style={styles.totalCardAmount}>
                  {formatCurrency(calculateTotal())}
                </Text>
              </View>
            )}

            {/* Botão Visualizar Resumo - só mostrar se não estiver processando e houver itens */}
            {!processingOcr && items.length > 0 && (
              <TouchableOpacity
                style={styles.summaryBtn}
                onPress={handleSummary}
              >
                <Text style={styles.summaryBtnText}>Visualizar resumo</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      )}

      <AddItemModal
        visible={isModalVisible}
        onClose={() => setIsModalVisible(false)}
        onAdd={handleAddNewItem}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 32,
  },
  contentContainer: {
    flex: 1,
    paddingTop: 16,
    paddingHorizontal: 20,
  },
  completedBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#d1fae5",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 8,
    gap: 8,
    borderWidth: 1,
    borderColor: "#10b981",
  },
  completedBannerText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#065f46",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  billNameContainer: {
    flexDirection: "row",
    flex: 1,
    alignItems: "center",
    marginRight: 12,
  },
  billNameInputWrapper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    position: "relative",
  },
  billNameInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: "600",
    color: "#000",
    paddingVertical: 4,
    paddingRight: 26,
    minHeight: 26,
  },
  billNameInputEditable: {
    borderBottomWidth: 1,
    borderBottomColor: "#E8D5EA",
    borderStyle: "dashed",
    backgroundColor: "transparent",
    paddingBottom: 2,
  },
  billNameEditIcon: {
    position: "absolute",
    right: 2,
    top: 4,
    opacity: 0.6,
  },
  savingIndicator: {
    marginLeft: 8,
  },
  addItemBtn: {
    backgroundColor: "transparent",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1.5,
    borderColor: "#81007F",
  },
  addItemBtnText: {
    color: "#81007F",
    fontWeight: "600",
    fontSize: 14,
  },
  itemCardWrapper: {
    backgroundColor: "#fff",
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E5E5E5",
    overflow: "hidden",
  },
  itemCardMain: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: 16,
    paddingRight: 12,
    paddingVertical: 18,
    backgroundColor: "#fff",
  },
  itemCardRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexShrink: 0,
  },
  itemCardLeft: {
    flex: 1,
    marginRight: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
    flexShrink: 1,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    position: "relative",
  },
  nameInputWrapper: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    alignSelf: "stretch",
    flexShrink: 1,
    marginLeft: 0,
  },
  itemCardName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "400",
    color: "#000",
    padding: 0,
    paddingLeft: 0,
    paddingRight: 20,
    marginLeft: 0,
    borderWidth: 0,
    borderTopWidth: 0,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: "transparent",
    borderColor: "transparent",
    minHeight: 20,
    minWidth: 0,
    textAlign: "left",
    textAlignVertical: "center",
    includeFontPadding: false,
  },
  itemCardNameEditable: {
    borderBottomColor: "#E8D5EA",
    borderBottomWidth: 1,
    borderStyle: "dashed",
    backgroundColor: "transparent",
    paddingBottom: 2,
  },
  itemCardNameFocused: {
    borderBottomColor: "#8B2E8F",
    borderBottomWidth: 2,
    borderStyle: "solid",
    backgroundColor: "transparent",
    paddingRight: 20,
    paddingLeft: 0,
    paddingBottom: 1,
  },
  itemCardNameContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
    paddingLeft: 0,
    paddingRight: 0,
    borderBottomWidth: 1,
    borderBottomColor: "#E8D5EA",
    borderStyle: "dashed",
    paddingBottom: 2,
  },
  itemCardNameText: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: "400",
    color: "#000",
    minWidth: 0,
    textAlign: "left",
  },
  editIcon: {
    position: "absolute",
    right: 0,
    top: "50%",
    marginTop: -7,
    opacity: 0.5,
    width: 16,
    height: 16,
  },
  editIconInContainer: {
    marginLeft: 12,
    opacity: 0.5,
    flexShrink: 0,
  },
  savingItemIndicator: {
    marginLeft: 4,
  },
  itemCardQty: {
    fontSize: 14,
    fontWeight: "400",
    color: "#000",
    padding: 0,
    margin: 0,
    width: 30,
    textAlign: "center",
    borderWidth: 0,
    borderTopWidth: 0,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: "transparent",
    borderColor: "transparent",
  },
  itemCardQtyEditable: {
    backgroundColor: "#F0F0F0",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  itemCardQtyFocused: {
    borderBottomColor: "#8B2E8F",
    borderBottomWidth: 2,
    borderStyle: "solid",
    backgroundColor: "#FFF",
  },
  qtySuffix: {
    fontSize: 14,
    fontWeight: "400",
    color: "#000",
  },
  itemCardAmount: {
    fontSize: 15,
    fontWeight: "600",
    color: "#000",
    textAlign: "right",
    padding: 0,
    margin: 0,
    minWidth: 60,
    borderWidth: 0,
    borderTopWidth: 0,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: "transparent",
    borderColor: "transparent",
  },
  itemCardAmountEditable: {
    backgroundColor: "#F0F0F0",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  itemCardAmountFocused: {
    borderBottomColor: "#8B2E8F",
    borderBottomWidth: 2,
    borderStyle: "solid",
    backgroundColor: "#FFF",
  },
  dropdownWrapper: {
    backgroundColor: "#F8F8F8",
    borderTopWidth: 1,
    borderTopColor: "#E8E8E8",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  checkboxesScroll: {
    maxHeight: 140,
  },
  checkboxesList: {
    gap: 8,
  },
  emptyParticipantsContainer: {
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  emptyParticipantsText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#666",
    marginBottom: 4,
  },
  emptyParticipantsSubtext: {
    fontSize: 12,
    color: "#999",
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: "#999",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxActive: {
    borderColor: "#8B2E8F",
    backgroundColor: "#F1E4F2",
  },
  participantName: {
    fontSize: 14,
    color: "#333",
    flex: 1,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#E8E8E8",
  },
  deleteIconButton: {
    padding: 6,
  },
  addItemButton: {
    backgroundColor: "#F1E4F2",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  addItemButtonLabel: {
    color: "#81007F",
    fontSize: 13,
    fontWeight: "600",
  },
  emptyContainer: {
    paddingVertical: 48,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#666",
    marginTop: 16,
    textAlign: "center",
  },
  emptySubtext: {
    fontSize: 14,
    color: "#999",
    marginTop: 8,
    textAlign: "center",
  },
  totalCardWrapper: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E5E5E5",
  },
  totalCardLabel: {
    fontSize: 16,
    fontWeight: "400",
    color: "#333",
    marginBottom: 4,
  },
  totalCardAmount: {
    fontSize: 18,
    fontWeight: "700",
    color: "#000",
  },
  summaryBtn: {
    backgroundColor: "#81007F",
    borderRadius: 25,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: "center",
    marginTop: 16,
  },
  summaryBtnText: {
    color: "#FFD700",
    fontSize: 16,
    fontWeight: "600",
  },
  processingContainer: {
    paddingVertical: 40,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8F8F8",
    borderRadius: 10,
    marginTop: 12,
    marginBottom: 12,
  },
  processingText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#333",
    marginTop: 16,
    textAlign: "center",
  },
  processingSubtext: {
    fontSize: 14,
    color: "#666",
    marginTop: 8,
    textAlign: "center",
  },
  errorContainer: {
    paddingVertical: 40,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF5F5",
    borderRadius: 10,
    marginTop: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#FFE0E0",
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    marginTop: 16,
    textAlign: "center",
  },
  errorText: {
    fontSize: 14,
    color: "#666",
    marginTop: 8,
    textAlign: "center",
    lineHeight: 20,
  },
});
