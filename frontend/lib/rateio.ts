import {
  DraftFeeConfig,
  DraftItem,
  DraftItemAllocation,
  DraftParticipant,
} from "../store/rateioDraftStore";

export interface ParticipantBreakdown {
  id: string;
  name: string;
  itemSubtotal: number;
  feeTotal: number;
  total: number;
  items: Array<{
    itemId: string;
    name: string;
    amount: number;
  }>;
  fees: Array<{
    type: "SERVICE_PERCENTAGE" | "COVER_CHARGE";
    label: string;
    amount: number;
  }>;
}

export interface ValidationIssue {
  itemId: string;
  message: string;
}

export interface RateioSummary {
  participants: ParticipantBreakdown[];
  subtotal: number;
  feesTotal: number;
  grandTotal: number;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

export const parseFeeParticipantIds = (
  description?: string | null,
): string[] => {
  if (!description) return [];

  try {
    const parsed = JSON.parse(description);
    if (
      parsed &&
      typeof parsed === "object" &&
      Array.isArray(parsed.selectedParticipantIds)
    ) {
      return parsed.selectedParticipantIds.filter(
        (value: unknown): value is string => typeof value === "string",
      );
    }
  } catch {
    return [];
  }

  return [];
};

export const serializeFeeParticipantIds = (selectedParticipantIds: string[]) =>
  JSON.stringify({ selectedParticipantIds });

export const buildDefaultAllocation = (
  item: DraftItem,
  participants: DraftParticipant[],
): DraftItemAllocation => ({
  selectedParticipantIds: participants.map((participant) => participant.id),
  quantities: participants.reduce<Record<string, number>>((acc, participant) => {
    acc[participant.id] = 0;
    return acc;
  }, {}),
});

export const getAssignedQuantity = (
  item: DraftItem,
  allocation: DraftItemAllocation | undefined,
): number => {
  if (!allocation) return 0;

  if (item.quantity <= 1) {
    return allocation.selectedParticipantIds.length > 0 ? 1 : 0;
  }

  return Object.values(allocation.quantities).reduce(
    (acc, quantity) => acc + quantity,
    0,
  );
};

export const validateItemAllocations = (
  items: DraftItem[],
  allocations: Record<string, DraftItemAllocation>,
): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];

  for (const item of items) {
    const allocation = allocations[item.id];
    const assignedQuantity = getAssignedQuantity(item, allocation);

    if (item.quantity <= 1) {
      if (!allocation || allocation.selectedParticipantIds.length === 0) {
        issues.push({
          itemId: item.id,
          message: `Selecione ao menos uma pessoa para pagar "${item.name}".`,
        });
      }
      continue;
    }

    if (assignedQuantity > item.quantity) {
      issues.push({
        itemId: item.id,
        message: `A soma atribuida para "${item.name}" ultrapassa a quantidade comprada.`,
      });
    }

    if (assignedQuantity < item.quantity) {
      issues.push({
        itemId: item.id,
        message: `Ainda ha unidades de "${item.name}" ausentes para adicionar.`,
      });
    }
  }

  return issues;
};

export const buildRateioSummary = ({
  participants,
  items,
  itemAllocations,
  serviceFeePercentage,
  serviceFeeConfig,
  couvertValue,
  couvertConfig,
}: {
  participants: DraftParticipant[];
  items: DraftItem[];
  itemAllocations: Record<string, DraftItemAllocation>;
  serviceFeePercentage: number;
  serviceFeeConfig: DraftFeeConfig;
  couvertValue: number;
  couvertConfig: DraftFeeConfig;
}): RateioSummary => {
  const participantMap = participants.reduce<Record<string, ParticipantBreakdown>>(
    (acc, participant) => {
      acc[participant.id] = {
        id: participant.id,
        name: participant.name,
        itemSubtotal: 0,
        feeTotal: 0,
        total: 0,
        items: [],
        fees: [],
      };
      return acc;
    },
    {},
  );

  for (const item of items) {
    const allocation = itemAllocations[item.id];
    if (!allocation) continue;

    if (item.quantity <= 1) {
      const selected = allocation.selectedParticipantIds;
      if (selected.length === 0) continue;

      const share = round2(item.price / selected.length);

      selected.forEach((participantId, index) => {
        const amount =
          index === selected.length - 1
            ? round2(item.price - share * (selected.length - 1))
            : share;
        participantMap[participantId].itemSubtotal = round2(
          participantMap[participantId].itemSubtotal + amount,
        );
        participantMap[participantId].items.push({
          itemId: item.id,
          name: item.name,
          amount,
        });
      });

      continue;
    }

    for (const participant of participants) {
      const quantity = allocation.quantities[participant.id] ?? 0;
      if (quantity <= 0) continue;

      const amount = round2(quantity * item.price);
      participantMap[participant.id].itemSubtotal = round2(
        participantMap[participant.id].itemSubtotal + amount,
      );
      participantMap[participant.id].items.push({
        itemId: item.id,
        name: `${item.name} (${quantity}x)`,
        amount,
      });
    }
  }

  const subtotal = round2(
    Object.values(participantMap).reduce(
      (acc, participant) => acc + participant.itemSubtotal,
      0,
    ),
  );

  const serviceFeeTotal =
    serviceFeePercentage > 0 ? round2((subtotal * serviceFeePercentage) / 100) : 0;
  const servicePayers = serviceFeeConfig.selectedParticipantIds;
  if (servicePayers.length > 0 && serviceFeeTotal > 0) {
    const evenShare = round2(serviceFeeTotal / servicePayers.length);
    servicePayers.forEach((participantId, index) => {
      const amount =
        index === servicePayers.length - 1
          ? round2(serviceFeeTotal - evenShare * (servicePayers.length - 1))
          : evenShare;
      participantMap[participantId].feeTotal = round2(
        participantMap[participantId].feeTotal + amount,
      );
      participantMap[participantId].fees.push({
        type: "SERVICE_PERCENTAGE",
        label: "Taxa de servico",
        amount,
      });
    });
  }

  const couvertPayers = couvertConfig.selectedParticipantIds;
  if (couvertPayers.length > 0 && couvertValue > 0) {
    const evenShare = round2(couvertValue / couvertPayers.length);
    couvertPayers.forEach((participantId, index) => {
      const amount =
        index === couvertPayers.length - 1
          ? round2(couvertValue - evenShare * (couvertPayers.length - 1))
          : evenShare;
      participantMap[participantId].feeTotal = round2(
        participantMap[participantId].feeTotal + amount,
      );
      participantMap[participantId].fees.push({
        type: "COVER_CHARGE",
        label: "Couvert artistico",
        amount,
      });
    });
  }

  const participantSummaries = participants.map((participant) => {
    const summary = participantMap[participant.id];
    return {
      ...summary,
      total: round2(summary.itemSubtotal + summary.feeTotal),
    };
  });

  const feesTotal = round2(serviceFeeTotal + (couvertPayers.length > 0 ? couvertValue : 0));
  const grandTotal = round2(subtotal + feesTotal);

  return {
    participants: participantSummaries,
    subtotal,
    feesTotal,
    grandTotal,
  };
};

export const buildDivisionsPayload = ({
  participants,
  items,
  itemAllocations,
}: {
  participants: DraftParticipant[];
  items: DraftItem[];
  itemAllocations: Record<string, DraftItemAllocation>;
}) => {
  const divisions: Array<{
    billItemId: string;
    participantId: string;
    shareAmount: number;
  }> = [];

  for (const item of items) {
    const allocation = itemAllocations[item.id];
    if (!allocation) continue;

    if (item.quantity <= 1) {
      const selected = allocation.selectedParticipantIds;
      if (selected.length === 0) continue;

      const baseShare = round2(item.price / selected.length);
      selected.forEach((participantId, index) => {
        const shareAmount =
          index === selected.length - 1
            ? round2(item.price - baseShare * (selected.length - 1))
            : baseShare;
        divisions.push({
          billItemId: item.id,
          participantId,
          shareAmount,
        });
      });
      continue;
    }

    participants.forEach((participant) => {
      const quantity = allocation.quantities[participant.id] ?? 0;
      if (quantity <= 0) return;

      divisions.push({
        billItemId: item.id,
        participantId: participant.id,
        shareAmount: round2(quantity * item.price),
      });
    });
  }

  return divisions;
};
