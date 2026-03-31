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
  validParticipantIds?: Set<string>,
): number => {
  if (!allocation) return 0;

  if (item.quantity <= 1) {
    const selected = validParticipantIds
      ? allocation.selectedParticipantIds.filter((participantId) =>
          validParticipantIds.has(participantId),
        )
      : allocation.selectedParticipantIds;
    return selected.length > 0 ? 1 : 0;
  }

  return Object.entries(allocation.quantities).reduce((acc, [participantId, quantity]) => {
    if (validParticipantIds && !validParticipantIds.has(participantId)) {
      return acc;
    }
    return acc + quantity;
  }, 0);
};

export const validateItemAllocations = (
  items: DraftItem[],
  allocations: Record<string, DraftItemAllocation>,
  participants: DraftParticipant[],
): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const validParticipantIds = new Set(participants.map((participant) => participant.id));

  for (const item of items) {
    const allocation = allocations[item.id];
    const assignedQuantity = getAssignedQuantity(item, allocation, validParticipantIds);

    if (item.quantity <= 1) {
      const selected = allocation
        ? allocation.selectedParticipantIds.filter((participantId) =>
            validParticipantIds.has(participantId),
          )
        : [];
      if (!allocation || selected.length === 0) {
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
  const validParticipantIds = new Set(participants.map((participant) => participant.id));

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
      const selected = allocation.selectedParticipantIds.filter((participantId) =>
        validParticipantIds.has(participantId),
      );
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
  const servicePayers = serviceFeeConfig.selectedParticipantIds.filter(
    (participantId) => validParticipantIds.has(participantId),
  );
  const appliedServiceFeeTotal =
    servicePayers.length > 0 && serviceFeeTotal > 0 ? serviceFeeTotal : 0;

  if (appliedServiceFeeTotal > 0) {
    const evenShare = round2(appliedServiceFeeTotal / servicePayers.length);
    servicePayers.forEach((participantId, index) => {
      const amount =
        index === servicePayers.length - 1
          ? round2(appliedServiceFeeTotal - evenShare * (servicePayers.length - 1))
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

  const couvertPayers = couvertConfig.selectedParticipantIds.filter(
    (participantId) => validParticipantIds.has(participantId),
  );
  const appliedCouvertTotal =
    couvertPayers.length > 0 && couvertValue > 0 ? couvertValue : 0;

  if (appliedCouvertTotal > 0) {
    const evenShare = round2(appliedCouvertTotal / couvertPayers.length);
    couvertPayers.forEach((participantId, index) => {
      const amount =
        index === couvertPayers.length - 1
          ? round2(appliedCouvertTotal - evenShare * (couvertPayers.length - 1))
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

  const feesTotal = round2(appliedServiceFeeTotal + appliedCouvertTotal);
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
  const validParticipantIds = new Set(participants.map((participant) => participant.id));
  const divisions: Array<{
    billItemId: string;
    participantId: string;
    shareAmount: number;
  }> = [];

  for (const item of items) {
    const allocation = itemAllocations[item.id];
    if (!allocation) continue;

    if (item.quantity <= 1) {
      const selected = allocation.selectedParticipantIds.filter((participantId) =>
        validParticipantIds.has(participantId),
      );
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
