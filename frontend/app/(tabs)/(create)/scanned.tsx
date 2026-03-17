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
  KeyboardAvoidingView,
  Platform,
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
import feesService, { Fee, FeeType } from "../../../services/fees.service";
import { useTheme } from "../../../contexts/ThemeContext";

export default function ScannedBillScreen() {
  const { colors, getFontSize } = useTheme();
  const {
    id,
    participants: participantsParam,
    editMode,
  } = useLocalSearchParams();
  const router = useRouter();
  const isEditMode = editMode === "true";

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
  const [retryingOcr, setRetryingOcr] = useState(false);
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

  // Estados de edição de participantes
  const [editingParticipantId, setEditingParticipantId] = useState<
    string | null
  >(null);
  const [participantNameInput, setParticipantNameInput] = useState<string>("");
  const [savingParticipantId, setSavingParticipantId] = useState<string | null>(
    null,
  );

  // Estados de taxas
  const [fees, setFees] = useState<Fee[]>([]);
  const [serviceFeeInput, setServiceFeeInput] = useState<string>("");
  const [couvertInput, setCouvertInput] = useState<string>("");
  const [editingServiceFee, setEditingServiceFee] = useState(false);
  const [editingCouvert, setEditingCouvert] = useState(false);
  const [savingFee, setSavingFee] = useState(false);

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
    }, 3000); // Poll a cada 3 segundos

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
      // Se estiver em modo de edição (editMode), permitir edição mesmo se COMPLETED
      setIsCompleted(billData.status === "COMPLETED" && !isEditMode);
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

      // 4. Carregar taxas (fees)
      try {
        const feesResponse = await feesService.findAllByBill(id as string);
        console.log("[Scanned] Fees loaded:", feesResponse);

        // feesResponse pode ser array ou objeto com fees
        const feesData = Array.isArray(feesResponse)
          ? feesResponse
          : (feesResponse as any).fees || [];

        setFees(feesData);

        // Inicializar inputs de taxas
        const serviceFee = feesData.find(
          (f: Fee) => f.type === FeeType.SERVICE_PERCENTAGE,
        );
        const couvert = feesData.find(
          (f: Fee) => f.type === FeeType.COVER_CHARGE,
        );

        setServiceFeeInput(serviceFee ? serviceFee.value.toString() : "0");
        setCouvertInput(
          couvert ? couvert.value.toFixed(2).replace(".", ",") : "0,00",
        );
      } catch (error: any) {
        console.warn("[Scanned] Error loading fees:", error.message);
        setFees([]);
        setServiceFeeInput("0");
        setCouvertInput("0,00");
      }

      // 5. Carregar divisões existentes (assignments)
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

  const handleRetryOcr = async () => {
    try {
      setRetryingOcr(true);
      await billService.retryOcr(id as string);
      // Reset state to trigger polling again
      setBillStatus("PENDING_OCR");
      setProcessingOcr(true);
    } catch (error: any) {
      Alert.alert(
        "Erro",
        error.message || "Não foi possível reprocessar o OCR. Tente novamente.",
      );
    } finally {
      setRetryingOcr(false);
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
        currentItemDivisions.map((div: any) => divisionsService.remove(div.id)),
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
            currentItemDivisions.map((div: any) =>
              divisionsService.remove(div.id),
            ),
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
          currentItemDivisions.map((div: any) =>
            divisionsService.remove(div.id),
          ),
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

  const deleteItem = (itemId: string) => {
    if (isCompleted) {
      Alert.alert(
        "Conta Finalizada",
        "Esta conta já foi finalizada e não pode ser editada.",
        [{ text: "OK" }],
      );
      return;
    }

    Alert.alert("Excluir item", "Tem certeza que deseja excluir este item?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: async () => {
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
              error.message ||
                "Não foi possível deletar o item. Tente novamente.",
            );
          }
        },
      },
    ]);
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

    const priceStr = itemPrices[itemId]?.replace(",", ".") || "";
    const newUnitPrice = parseFloat(priceStr);
    const originalItem = items.find((item) => item.id === itemId);

    if (!originalItem) return;

    // Se campo está vazio ou valor é inválido, reverter para valor original
    if (priceStr === "" || isNaN(newUnitPrice) || newUnitPrice <= 0) {
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
          prevItems.map((item) => (item.id === itemId ? updatedItem : item)),
        );

        // Recalcular divisões se houver participantes atribuídos
        if (
          originalItem.assignedParticipants &&
          originalItem.assignedParticipants.length > 0
        ) {
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
          prevItems.map((item) => (item.id === itemId ? updatedItem : item)),
        );

        // Recalcular divisões se houver participantes atribuídos
        if (
          originalItem.assignedParticipants &&
          originalItem.assignedParticipants.length > 0
        ) {
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

  // Função para concluir edição e voltar aos detalhes da conta
  const handleSaveAndGoBack = () => {
    Alert.alert(
      "Concluir edição",
      "Deseja finalizar a edição e voltar para os detalhes da conta?",
      [
        { text: "Continuar editando", style: "cancel" },
        {
          text: "Concluir",
          onPress: () =>
            router.replace({
              pathname: "/(tabs)/bills/[id]",
              params: { id: id as string },
            }),
        },
      ],
    );
  };

  const formatCurrency = (value: number) => {
    return `R$ ${value.toFixed(2).replace(".", ",")}`;
  };

  /**
   * Inicia edição do nome do participante
   */
  const startEditingParticipant = (participant: Participant) => {
    if (isCompleted) return;
    setEditingParticipantId(participant.id);
    setParticipantNameInput(participant.name);
  };

  /**
   * Cancela edição do participante
   */
  const cancelEditingParticipant = () => {
    setEditingParticipantId(null);
    setParticipantNameInput("");
  };

  /**
   * Salva novo nome do participante
   */
  const saveParticipantName = async (participantId: string) => {
    const newName = participantNameInput.trim();
    if (!newName) {
      Alert.alert("Erro", "O nome não pode estar vazio");
      return;
    }

    const participant = participants.find((p) => p.id === participantId);
    if (!participant) return;

    // Se o nome não mudou, apenas cancelar edição
    if (newName === participant.name) {
      cancelEditingParticipant();
      return;
    }

    try {
      setSavingParticipantId(participantId);

      // Atualizar no backend
      await participantsService.updateParticipant(participantId, newName);

      // Atualizar nome nos itens que tinham esse participante atribuído
      const oldName = participant.name;
      setItems((prevItems) =>
        prevItems.map((item) => ({
          ...item,
          assignedParticipants: item.assignedParticipants.map((name) =>
            name === oldName ? newName : name,
          ),
        })),
      );

      // Atualizar lista de participantes local
      setParticipants((prev) =>
        prev.map((p) => (p.id === participantId ? { ...p, name: newName } : p)),
      );

      console.log(
        "[Scanned] Participant name updated:",
        participantId,
        "->",
        newName,
      );
    } catch (error: any) {
      console.error("Error updating participant name:", error);
      Alert.alert(
        "Erro",
        error.message || "Não foi possível atualizar o nome do participante",
      );
    } finally {
      setSavingParticipantId(null);
      cancelEditingParticipant();
    }
  };

  /**
   * Adiciona um novo participante à conta
   */
  const addParticipant = async () => {
    if (isCompleted) return;

    try {
      const newName = `Pessoa ${participants.length + 1}`;
      const newParticipant = await participantsService.createParticipant(
        id as string,
        newName,
      );

      setParticipants((prev) => [...prev, newParticipant]);
      console.log("[Scanned] New participant added:", newParticipant.name);
    } catch (error: any) {
      console.error("Error adding participant:", error);
      Alert.alert(
        "Erro",
        error.message || "Não foi possível adicionar participante",
      );
    }
  };

  /**
   * Remove um participante da conta
   */
  const removeParticipant = async (participantId: string) => {
    if (isCompleted) return;

    const participant = participants.find((p) => p.id === participantId);
    if (!participant) return;

    // Confirmar remoção
    Alert.alert(
      "Remover Participante",
      `Deseja remover "${participant.name}"? As divisões atribuídas a este participante serão removidas.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Remover",
          style: "destructive",
          onPress: async () => {
            try {
              await participantsService.deleteParticipant(participantId);

              // Atualizar lista de participantes local
              setParticipants((prev) =>
                prev.filter((p) => p.id !== participantId),
              );

              // Remover participante das atribuições dos itens
              setItems((prevItems) =>
                prevItems.map((item) => ({
                  ...item,
                  assignedParticipants: item.assignedParticipants.filter(
                    (name) => name !== participant.name,
                  ),
                })),
              );

              console.log("[Scanned] Participant removed:", participant.name);
            } catch (error: any) {
              console.error("Error removing participant:", error);
              Alert.alert(
                "Erro",
                error.message || "Não foi possível remover o participante",
              );
            }
          },
        },
      ],
    );
  };

  /**
   * Salva a taxa de serviço (porcentagem)
   */
  const saveServiceFee = async () => {
    if (isCompleted) return;

    const newValue = parseFloat(serviceFeeInput) || 0;

    // Validar: deve estar entre 0 e 100
    if (newValue < 0 || newValue > 100) {
      Alert.alert("Erro", "A taxa de serviço deve estar entre 0% e 100%");
      return;
    }

    try {
      setSavingFee(true);

      const existingFee = fees.find(
        (f) => f.type === FeeType.SERVICE_PERCENTAGE,
      );

      if (existingFee) {
        // Atualizar taxa existente
        if (newValue === 0) {
          // Se valor é 0, deletar a taxa
          await feesService.remove(existingFee.id);
          setFees((prev) => prev.filter((f) => f.id !== existingFee.id));
        } else {
          // Atualizar valor
          const updated = await feesService.update(existingFee.id, {
            value: newValue,
          });
          setFees((prev) =>
            prev.map((f) => (f.id === existingFee.id ? updated : f)),
          );
        }
      } else if (newValue > 0) {
        // Criar nova taxa
        const newFee = await feesService.create({
          billId: id as string,
          type: FeeType.SERVICE_PERCENTAGE,
          value: newValue,
        });
        setFees((prev) => [...prev, newFee]);
      }

      setEditingServiceFee(false);
      console.log("[Scanned] Service fee saved:", newValue);
    } catch (error: any) {
      console.error("Error saving service fee:", error);
      Alert.alert(
        "Erro",
        error.message || "Não foi possível salvar a taxa de serviço",
      );
    } finally {
      setSavingFee(false);
    }
  };

  /**
   * Salva o couvert (valor por pessoa)
   */
  const saveCouvert = async () => {
    if (isCompleted) return;

    const newValue = parseFloat(couvertInput.replace(",", ".")) || 0;

    if (newValue < 0) {
      Alert.alert("Erro", "O valor do couvert não pode ser negativo");
      return;
    }

    try {
      setSavingFee(true);

      const existingFee = fees.find((f) => f.type === FeeType.COVER_CHARGE);

      if (existingFee) {
        if (newValue === 0) {
          // Se valor é 0, deletar a taxa
          await feesService.remove(existingFee.id);
          setFees((prev) => prev.filter((f) => f.id !== existingFee.id));
        } else {
          // Atualizar valor
          const updated = await feesService.update(existingFee.id, {
            value: newValue,
          });
          setFees((prev) =>
            prev.map((f) => (f.id === existingFee.id ? updated : f)),
          );
        }
      } else if (newValue > 0) {
        // Criar nova taxa
        const newFee = await feesService.create({
          billId: id as string,
          type: FeeType.COVER_CHARGE,
          value: newValue,
          description: "Couvert por pessoa",
        });
        setFees((prev) => [...prev, newFee]);
      }

      setEditingCouvert(false);
      console.log("[Scanned] Couvert saved:", newValue);
    } catch (error: any) {
      console.error("Error saving couvert:", error);
      Alert.alert("Erro", error.message || "Não foi possível salvar o couvert");
    } finally {
      setSavingFee(false);
    }
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
      console.log(
        `[Scanned] Item: ${item.name}, UnitPrice: ${unitPrice}, Qty: ${quantity}, Total: ${itemTotal}`,
      );
      return sum + itemTotal;
    }, 0);
    console.log("[Scanned] Calculated total:", total);
    return total;
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingContainer}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        {loading ? (
          <View
            style={[
              styles.loadingContainer,
              { backgroundColor: colors.background },
            ]}
          >
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.contentContainer}>
              {/* Banner de Modo Edição */}
              {isEditMode && (
                <View style={styles.editModeBanner}>
                  <View style={styles.editModeIconContainer}>
                    <MaterialCommunityIcons
                      name="pencil-outline"
                      size={18}
                      color={colors.accent}
                    />
                  </View>
                  <View style={styles.editModeBannerContent}>
                    <Text style={styles.editModeBannerTitle}>
                      Modo de Edição
                    </Text>
                    <Text style={styles.editModeBannerSubtitle}>
                      Edite os valores e participantes abaixo
                    </Text>
                  </View>
                </View>
              )}
              {/* Banner de Conta Finalizada (só mostra se não estiver em modo edição) */}
              {isCompleted && !isEditMode && (
                <View style={styles.completedBanner}>
                  <MaterialCommunityIcons
                    name="check-circle"
                    size={20}
                    color={colors.success}
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
                        {
                          color: colors.text,
                          borderBottomColor: colors.primary,
                        },
                        !savingName && billName && styles.billNameInputEditable,
                      ]}
                      value={billName}
                      onChangeText={setBillName}
                      onBlur={saveBillName}
                      onFocus={() => {}}
                      placeholder="Nome da conta"
                      placeholderTextColor={colors.placeholderText}
                      editable={!isCompleted}
                    />
                    {!savingName && billName && !isCompleted && (
                      <Ionicons
                        name="create-outline"
                        size={16}
                        color={colors.primary}
                        style={styles.billNameEditIcon}
                      />
                    )}
                  </View>
                  {savingName && (
                    <ActivityIndicator
                      size="small"
                      color={colors.primary}
                      style={styles.savingIndicator}
                    />
                  )}
                </View>
                <TouchableOpacity
                  style={[
                    styles.addItemBtn,
                    { backgroundColor: colors.primary },
                  ]}
                  onPress={() => setIsModalVisible(true)}
                  disabled={isCompleted}
                >
                  <Text
                    style={[styles.addItemBtnText, { color: colors.accent }]}
                  >
                    + Item
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Mensagem de processamento OCR */}
              {processingOcr && (
                <View
                  style={[
                    styles.processingContainer,
                    { backgroundColor: colors.backgroundSecondary },
                  ]}
                >
                  <ActivityIndicator size="large" color={colors.primary} />
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
                <View
                  style={[
                    styles.errorContainer,
                    {
                      backgroundColor: colors.warningLight,
                      borderColor: colors.cardBorder,
                    },
                  ]}
                >
                  <Ionicons
                    name="alert-circle-outline"
                    size={48}
                    color={colors.error}
                  />
                  <Text style={[styles.errorTitle, { color: colors.text }]}>
                    Não foi possível reconhecer os itens
                  </Text>
                  <Text
                    style={[styles.errorText, { color: colors.textSecondary }]}
                  >
                    Tente reprocessar o OCR ou adicione os itens manualmente
                  </Text>
                  <View style={styles.retryButtonsRow}>
                    <TouchableOpacity
                      style={[
                        styles.retryOcrButton,
                        { backgroundColor: colors.primary },
                        retryingOcr && styles.retryButtonDisabled,
                      ]}
                      onPress={handleRetryOcr}
                      disabled={retryingOcr}
                    >
                      {retryingOcr ? (
                        <ActivityIndicator size="small" color={colors.accent} />
                      ) : (
                        <Ionicons
                          name="refresh-outline"
                          size={16}
                          color={colors.accent}
                        />
                      )}
                      <Text
                        style={[
                          styles.retryOcrButtonText,
                          { color: colors.accent },
                        ]}
                      >
                        {retryingOcr ? "Processando..." : "Tentar novamente"}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.retakePhotoButton,
                        {
                          borderColor: colors.primary,
                          backgroundColor: colors.background,
                        },
                      ]}
                      onPress={() =>
                        router.replace({
                          pathname: "/(tabs)/(create)/camera",
                          params: { id: id as string },
                        })
                      }
                    >
                      <Ionicons
                        name="camera-outline"
                        size={16}
                        color={colors.primary}
                      />
                      <Text
                        style={[
                          styles.retakePhotoButtonText,
                          { color: colors.primary },
                        ]}
                      >
                        Nova foto
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Lista de items vazia */}
              {!processingOcr &&
                items.length === 0 &&
                billStatus !== "OCR_FAILED" && (
                  <View
                    style={[
                      styles.emptyContainer,
                      { backgroundColor: colors.backgroundSecondary },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="receipt"
                      size={48}
                      color={colors.divider}
                    />
                    <Text style={[styles.emptyText, { color: colors.text }]}>
                      Nenhum item encontrado
                    </Text>
                    <Text
                      style={[
                        styles.emptySubtext,
                        { color: colors.textSecondary },
                      ]}
                    >
                      Adicione itens manualmente usando o botão "+ Item"
                    </Text>
                  </View>
                )}

              {/* Seção de Participantes - Editável */}
              {!processingOcr && (
                <View
                  style={[
                    styles.participantsSection,
                    {
                      backgroundColor: colors.backgroundSecondary,
                      borderColor: colors.cardBorder,
                    },
                  ]}
                >
                  <View style={styles.participantsSectionHeader}>
                    <Text
                      style={[
                        styles.participantsSectionTitle,
                        { color: colors.text },
                      ]}
                    >
                      Participantes ({participants.length})
                    </Text>
                    {!isCompleted && (
                      <TouchableOpacity
                        style={styles.addParticipantBtn}
                        onPress={addParticipant}
                      >
                        <Ionicons name="add" size={18} color={colors.primary} />
                        <Text
                          style={[
                            styles.addParticipantBtnText,
                            { color: colors.primary },
                          ]}
                        >
                          Adicionar
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {participants.length === 0 ? (
                    <Text style={styles.noParticipantsText}>
                      Nenhum participante. Adicione pelo menos um participante.
                    </Text>
                  ) : (
                    <View style={styles.participantsList}>
                      {participants.map((participant) => {
                        const isEditingThis =
                          editingParticipantId === participant.id;
                        const isSavingThis =
                          savingParticipantId === participant.id;

                        return (
                          <View
                            key={participant.id}
                            style={[
                              styles.participantChip,
                              {
                                backgroundColor: colors.cardBackground,
                                borderColor: colors.cardBorder,
                              },
                            ]}
                          >
                            {isEditingThis ? (
                              <View style={styles.participantChipEditContainer}>
                                <TextInput
                                  style={[
                                    styles.participantChipInput,
                                    {
                                      color: colors.text,
                                      borderBottomColor: colors.primary,
                                    },
                                  ]}
                                  value={participantNameInput}
                                  onChangeText={setParticipantNameInput}
                                  placeholderTextColor={colors.placeholderText}
                                  selectionColor={colors.primary}
                                  autoFocus
                                  selectTextOnFocus
                                  editable={!isSavingThis}
                                />
                                <TouchableOpacity
                                  onPress={() =>
                                    saveParticipantName(participant.id)
                                  }
                                  disabled={isSavingThis}
                                >
                                  {isSavingThis ? (
                                    <ActivityIndicator
                                      size="small"
                                      color={colors.primary}
                                    />
                                  ) : (
                                    <Ionicons
                                      name="checkmark"
                                      size={18}
                                      color={colors.success}
                                    />
                                  )}
                                </TouchableOpacity>
                                <TouchableOpacity
                                  onPress={cancelEditingParticipant}
                                  disabled={isSavingThis}
                                >
                                  <Ionicons
                                    name="close"
                                    size={18}
                                    color={colors.error}
                                  />
                                </TouchableOpacity>
                              </View>
                            ) : (
                              <>
                                <TouchableOpacity
                                  style={styles.participantChipNameArea}
                                  onPress={() =>
                                    !isCompleted &&
                                    startEditingParticipant(participant)
                                  }
                                  disabled={isCompleted}
                                >
                                  <Text
                                    style={[
                                      styles.participantChipName,
                                      { color: colors.text },
                                    ]}
                                  >
                                    {participant.name}
                                  </Text>
                                  {!isCompleted && (
                                    <Ionicons
                                      name="pencil"
                                      size={12}
                                      color={colors.textTertiary}
                                    />
                                  )}
                                </TouchableOpacity>
                                {!isCompleted && (
                                  <TouchableOpacity
                                    style={styles.participantChipRemove}
                                    onPress={() =>
                                      removeParticipant(participant.id)
                                    }
                                  >
                                    <Ionicons
                                      name="close-circle"
                                      size={18}
                                      color={colors.error}
                                    />
                                  </TouchableOpacity>
                                )}
                              </>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              )}

              {/* Seção de Taxas - Editável */}
              {!processingOcr && (
                <View
                  style={[
                    styles.feesSection,
                    {
                      backgroundColor: colors.couvertBackground,
                      borderColor: colors.cardBorder,
                    },
                  ]}
                >
                  <Text
                    style={[styles.feesSectionTitle, { color: colors.text }]}
                  >
                    Taxas
                  </Text>

                  {/* Taxa de Serviço */}
                  <View
                    style={[styles.feeRow, { borderBottomColor: colors.cardBorder }]}
                  >
                    <Text
                      style={[styles.feeLabel, { color: colors.textSecondary }]}
                    >
                      Taxa de Serviço
                    </Text>
                    {editingServiceFee && !isCompleted ? (
                      <View style={styles.feeEditContainer}>
                        <TextInput
                          style={[
                            styles.feeInput,
                            {
                              backgroundColor: colors.inputBackground,
                              borderColor: colors.primary,
                              color: colors.text,
                            },
                          ]}
                          value={serviceFeeInput}
                          onChangeText={setServiceFeeInput}
                          keyboardType="numeric"
                          placeholder="0"
                          placeholderTextColor={colors.placeholderText}
                          selectionColor={colors.primary}
                          editable={!savingFee}
                        />
                        <Text
                          style={[
                            styles.feeInputSuffix,
                            { color: colors.textSecondary },
                          ]}
                        >
                          %
                        </Text>
                        <TouchableOpacity
                          onPress={saveServiceFee}
                          disabled={savingFee}
                          style={styles.feeActionBtn}
                        >
                          {savingFee ? (
                            <ActivityIndicator size="small" color={colors.primary} />
                          ) : (
                            <Ionicons
                              name="checkmark"
                              size={18}
                              color={colors.success}
                            />
                          )}
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => {
                            const existingFee = fees.find(
                              (f) => f.type === FeeType.SERVICE_PERCENTAGE,
                            );
                            setServiceFeeInput(
                              existingFee ? existingFee.value.toString() : "0",
                            );
                            setEditingServiceFee(false);
                          }}
                          disabled={savingFee}
                          style={styles.feeActionBtn}
                        >
                          <Ionicons
                            name="close"
                            size={18}
                            color={colors.error}
                          />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.feeValueContainer}
                        onPress={() =>
                          !isCompleted && setEditingServiceFee(true)
                        }
                        disabled={isCompleted}
                      >
                        <Text
                          style={[styles.feeValue, { color: colors.primary }]}
                        >
                          {fees.find(
                            (f) => f.type === FeeType.SERVICE_PERCENTAGE,
                          )?.value || 0}
                          %
                        </Text>
                        {!isCompleted && (
                          <Ionicons
                            name="pencil"
                            size={14}
                            color={colors.textTertiary}
                          />
                        )}
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Couvert */}
                  <View
                    style={[styles.feeRow, { borderBottomColor: colors.cardBorder }]}
                  >
                    <Text
                      style={[styles.feeLabel, { color: colors.textSecondary }]}
                    >
                      Couvert (por pessoa)
                    </Text>
                    {editingCouvert && !isCompleted ? (
                      <View style={styles.feeEditContainer}>
                        <Text
                          style={[
                            styles.feeInputPrefix,
                            { color: colors.textSecondary },
                          ]}
                        >
                          R$
                        </Text>
                        <TextInput
                          style={[
                            styles.feeInput,
                            {
                              backgroundColor: colors.inputBackground,
                              borderColor: colors.primary,
                              color: colors.text,
                            },
                          ]}
                          value={couvertInput}
                          onChangeText={(text) => {
                            const cleaned = text.replace(/[^0-9,]/g, "");
                            setCouvertInput(cleaned);
                          }}
                          keyboardType="numeric"
                          placeholder="0,00"
                          placeholderTextColor={colors.placeholderText}
                          selectionColor={colors.primary}
                          editable={!savingFee}
                        />
                        <TouchableOpacity
                          onPress={saveCouvert}
                          disabled={savingFee}
                          style={styles.feeActionBtn}
                        >
                          {savingFee ? (
                            <ActivityIndicator size="small" color={colors.primary} />
                          ) : (
                            <Ionicons
                              name="checkmark"
                              size={18}
                              color={colors.success}
                            />
                          )}
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => {
                            const existingFee = fees.find(
                              (f) => f.type === FeeType.COVER_CHARGE,
                            );
                            setCouvertInput(
                              existingFee
                                ? existingFee.value.toFixed(2).replace(".", ",")
                                : "0,00",
                            );
                            setEditingCouvert(false);
                          }}
                          disabled={savingFee}
                          style={styles.feeActionBtn}
                        >
                          <Ionicons
                            name="close"
                            size={18}
                            color={colors.error}
                          />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.feeValueContainer}
                        onPress={() => !isCompleted && setEditingCouvert(true)}
                        disabled={isCompleted}
                      >
                        <Text
                          style={[styles.feeValue, { color: colors.primary }]}
                        >
                          R${" "}
                          {(
                            fees.find((f) => f.type === FeeType.COVER_CHARGE)
                              ?.value || 0
                          )
                            .toFixed(2)
                            .replace(".", ",")}
                        </Text>
                        {!isCompleted && (
                          <Ionicons
                            name="pencil"
                            size={14}
                            color={colors.textTertiary}
                          />
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              )}

              {/* Lista de items */}
              {!processingOcr &&
                items.map((item, index) => (
                  <View
                    key={item.id}
                    style={[
                      styles.itemCardWrapper,
                      {
                        backgroundColor: colors.cardBackground,
                        borderColor: colors.cardBorder,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.itemCardMain,
                        { backgroundColor: colors.cardBackground },
                      ]}
                    >
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
                              placeholderTextColor={colors.placeholderText}
                              editable={true}
                              underlineColorAndroid="transparent"
                              selectionColor={colors.primary}
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
                                  color={colors.primary}
                                  style={styles.editIconInContainer}
                                />
                              )}
                            </TouchableOpacity>
                          )}
                        </View>
                        {savingItemId === item.id && (
                          <ActivityIndicator
                            size="small"
                            color={colors.primary}
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
                            placeholderTextColor={colors.placeholderText}
                            underlineColorAndroid="transparent"
                            selectionColor={colors.primary}
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
                              editingItemPriceId === item.id
                                ? (itemPrices[item.id] ?? "")
                                : itemPrices[item.id] ||
                                  item.price.toFixed(2).replace(".", ",")
                            }
                            onChangeText={(text) =>
                              handleItemPriceChange(item.id, text)
                            }
                            onBlur={() => handleItemPriceBlur(item.id)}
                            onFocus={() => setEditingItemPriceId(item.id)}
                            keyboardType="numeric"
                            placeholder="0,00"
                            placeholderTextColor={colors.placeholderText}
                            underlineColorAndroid="transparent"
                            selectionColor={colors.primary}
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
                            color={colors.textSecondary}
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
                                const isEditingThis =
                                  editingParticipantId === participant.id;
                                const isSavingName =
                                  savingParticipantId === participant.id;

                                return (
                                  <View
                                    key={participant.id || idx}
                                    style={styles.checkboxRow}
                                  >
                                    <TouchableOpacity
                                      style={styles.checkboxTouchable}
                                      onPress={() =>
                                        toggleParticipant(
                                          item.id,
                                          participant.name,
                                        )
                                      }
                                      activeOpacity={0.6}
                                      disabled={
                                        isSaving || isCompleted || isEditingThis
                                      }
                                    >
                                      <View
                                        style={[
                                          styles.checkbox,
                                          {
                                            backgroundColor: colors.cardBackground,
                                            borderColor: colors.textTertiary,
                                          },
                                          isAssigned && [
                                            styles.checkboxActive,
                                            {
                                              backgroundColor: colors.checkboxActive,
                                              borderColor: colors.primary,
                                            },
                                          ],
                                        ]}
                                      >
                                        {isAssigned && (
                                          <Ionicons
                                            name="checkmark"
                                            size={10}
                                            color={colors.primary}
                                          />
                                        )}
                                      </View>
                                    </TouchableOpacity>

                                    {isEditingThis ? (
                                      <View
                                        style={styles.participantEditContainer}
                                      >
                                        <TextInput
                                          style={[
                                            styles.participantEditInput,
                                            {
                                              backgroundColor: colors.inputBackground,
                                              borderColor: colors.primary,
                                              color: colors.text,
                                            },
                                          ]}
                                          value={participantNameInput}
                                          onChangeText={setParticipantNameInput}
                                          placeholderTextColor={colors.placeholderText}
                                          selectionColor={colors.primary}
                                          autoFocus
                                          selectTextOnFocus
                                          editable={!isSavingName}
                                        />
                                        <TouchableOpacity
                                          style={styles.participantEditButton}
                                          onPress={() =>
                                            saveParticipantName(participant.id)
                                          }
                                          disabled={isSavingName}
                                        >
                                          {isSavingName ? (
                                            <ActivityIndicator
                                              size="small"
                                              color={colors.primary}
                                            />
                                          ) : (
                                            <Ionicons
                                              name="checkmark"
                                              size={18}
                                              color={colors.success}
                                            />
                                          )}
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                          style={styles.participantEditButton}
                                          onPress={cancelEditingParticipant}
                                          disabled={isSavingName}
                                        >
                                          <Ionicons
                                            name="close"
                                            size={18}
                                            color={colors.error}
                                          />
                                        </TouchableOpacity>
                                      </View>
                                    ) : (
                                      <TouchableOpacity
                                        style={styles.participantNameContainer}
                                        onPress={() =>
                                          startEditingParticipant(participant)
                                        }
                                        disabled={isCompleted}
                                      >
                                        <Text style={styles.participantName}>
                                          {participant.name}
                                        </Text>
                                        {!isCompleted && (
                                          <Ionicons
                                            name="pencil"
                                            size={14}
                                            color={colors.textTertiary}
                                            style={{ marginLeft: 8 }}
                                          />
                                        )}
                                      </TouchableOpacity>
                                    )}

                                    {isSaving && !isEditingThis && (
                                      <ActivityIndicator
                                        size="small"
                                        color={colors.primary}
                                        style={{ marginLeft: 8 }}
                                      />
                                    )}
                                  </View>
                                );
                              })
                            )}
                          </View>
                        </ScrollView>

                        {/* Buttons Footer Row */}
                        <View style={styles.footerRow}>
                          {!isCompleted && (
                            <TouchableOpacity
                              style={styles.deleteIconButton}
                              onPress={() => deleteItem(item.id)}
                            >
                              <MaterialCommunityIcons
                                name="trash-can-outline"
                                size={20}
                                color={colors.textTertiary}
                              />
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    )}
                  </View>
                ))}

              {/* Card do Total - só mostrar se não estiver processando e houver itens */}
              {!processingOcr && items.length > 0 && (
                <View
                  style={[
                    styles.totalCardWrapper,
                    {
                      backgroundColor: colors.cardBackground,
                      borderColor: colors.cardBorder,
                    },
                  ]}
                >
                  <Text style={[styles.totalCardLabel, { color: colors.text }]}>
                    Total:
                  </Text>
                  <Text style={[styles.totalCardAmount, { color: colors.text }]}>
                    {formatCurrency(calculateTotal())}
                  </Text>
                </View>
              )}

              {/* Botões - variam conforme o modo */}
              {!processingOcr && items.length > 0 && (
                <>
                  {isEditMode ? (
                    /* Modo Edição: Botão Concluir Edição */
                    <TouchableOpacity
                      style={[
                        styles.saveAndGoBackBtn,
                        { backgroundColor: colors.success },
                      ]}
                      onPress={handleSaveAndGoBack}
                    >
                      <MaterialCommunityIcons
                        name="check"
                        size={20}
                        color={colors.accent}
                      />
                      <Text
                        style={[
                          styles.saveAndGoBackBtnText,
                          { color: colors.accent },
                        ]}
                      >
                        Concluir Edição
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    /* Modo Normal: Botão Visualizar Resumo */
                    <TouchableOpacity
                      style={[
                        styles.summaryBtn,
                        { backgroundColor: colors.primary },
                      ]}
                      onPress={handleSummary}
                    >
                      <Text
                        style={[styles.summaryBtnText, { color: colors.accent }]}
                      >
                        Visualizar resumo
                      </Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>
          </ScrollView>
        )}
      </KeyboardAvoidingView>

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
  },
  keyboardAvoidingContainer: {
    flex: 1,
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
  editModeBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#8B2E8F",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
    gap: 12,
    shadowColor: "#8B2E8F",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  editModeIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  editModeBannerContent: {
    flex: 1,
  },
  editModeBannerTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },
  editModeBannerSubtitle: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.85)",
    marginTop: 2,
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
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    overflow: "hidden",
  },
  itemCardMain: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: 16,
    paddingRight: 12,
    paddingVertical: 18,
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
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxActive: {
    borderColor: "#8B2E8F",
    backgroundColor: "#F1E4F2",
  },
  checkboxTouchable: {
    padding: 4,
  },
  participantName: {
    fontSize: 14,
    color: "#333",
    flex: 1,
  },
  participantNameContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  participantEditContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  participantEditInput: {
    flex: 1,
    fontSize: 14,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  participantEditButton: {
    padding: 4,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#E8E8E8",
  },
  deleteIconButton: {
    padding: 6,
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
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    marginBottom: 8,
    borderWidth: 1,
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
  saveAndGoBackBtn: {
    backgroundColor: "#10b981",
    borderRadius: 25,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: "center",
    marginTop: 16,
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  saveAndGoBackBtnText: {
    color: "#fff",
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
  retryButtonsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 20,
  },
  retryOcrButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#81007F",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonDisabled: {
    opacity: 0.6,
  },
  retryOcrButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  retakePhotoButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1.5,
    borderColor: "#81007F",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retakePhotoButtonText: {
    color: "#81007F",
    fontSize: 14,
    fontWeight: "600",
  },
  // Estilos da Seção de Participantes
  participantsSection: {
    backgroundColor: "#F9F9FB",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E8E8ED",
  },
  participantsSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  participantsSectionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#333",
  },
  addParticipantBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#8B2E8F",
    gap: 4,
  },
  addParticipantBtnText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#8B2E8F",
  },
  noParticipantsText: {
    fontSize: 14,
    color: "#666",
    fontStyle: "italic",
  },
  participantsList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  participantChip: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    paddingVertical: 6,
    paddingLeft: 12,
    paddingRight: 6,
    borderWidth: 1,
  },
  participantChipEditContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  participantChipInput: {
    fontSize: 14,
    minWidth: 80,
    paddingVertical: 2,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
  },
  participantChipNameArea: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  participantChipName: {
    fontSize: 14,
  },
  participantChipRemove: {
    marginLeft: 4,
    padding: 2,
  },
  // Estilos da Seção de Taxas
  feesSection: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  feesSectionTitle: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 12,
  },
  feeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  feeLabel: {
    fontSize: 14,
  },
  feeValueContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  feeValue: {
    fontSize: 14,
    fontWeight: "600",
  },
  feeEditContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  feeInputPrefix: {
    fontSize: 14,
  },
  feeInput: {
    fontSize: 14,
    minWidth: 50,
    textAlign: "right",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderRadius: 6,
  },
  feeInputSuffix: {
    fontSize: 14,
  },
  feeActionBtn: {
    padding: 4,
  },
});
