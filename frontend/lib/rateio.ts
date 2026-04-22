import {
  DraftFeeConfig,
  DraftItem,
  DraftItemAllocation,
  DraftParticipant,
} from "../store/rateioDraftStore";
import { round2 } from "./formatters";

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

type ItemUnitAssignment = {
  participantIds: string[];
};

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

const getItemTotal = (item: DraftItem) => round2(item.quantity * item.price);

const getSelectedParticipantIds = (
  allocation: DraftItemAllocation | undefined,
  validParticipantIds?: Set<string>,
) => {
  if (!allocation) return [];

  return allocation.selectedParticipantIds.filter((participantId) => {
    if (validParticipantIds && !validParticipantIds.has(participantId)) {
      return false;
    }

    return true;
  });
};

const getNormalizedParticipantQuantities = (
  item: DraftItem,
  allocation: DraftItemAllocation | undefined,
  validParticipantIds?: Set<string>,
) => {
  if (!allocation) {
    return [] as Array<{ participantId: string; quantity: number }>;
  }

  return getSelectedParticipantIds(allocation, validParticipantIds)
    .map((participantId) => ({
      participantId,
      quantity: Math.max(
        0,
        Math.min(
          item.quantity,
          Math.trunc(allocation.quantities[participantId] ?? 0),
        ),
      ),
    }))
    .filter(({ quantity }) => quantity > 0);
};

export const getAssignedQuantity = (
  item: DraftItem,
  allocation: DraftItemAllocation | undefined,
  validParticipantIds?: Set<string>,
) =>
  getNormalizedParticipantQuantities(item, allocation, validParticipantIds).reduce(
    (acc, participant) => acc + participant.quantity,
    0,
  );

export const getSharedQuantity = (
  item: DraftItem,
  allocation: DraftItemAllocation | undefined,
  validParticipantIds?: Set<string>,
) =>
  Math.max(
    0,
    getAssignedQuantity(item, allocation, validParticipantIds) - item.quantity,
  );

const buildItemUnitAssignments = (
  item: DraftItem,
  allocation: DraftItemAllocation | undefined,
  validParticipantIds: Set<string>,
) => {
  const participantQuantities = getNormalizedParticipantQuantities(
    item,
    allocation,
    validParticipantIds,
  );

  if (participantQuantities.length === 0) {
    return [] as ItemUnitAssignment[];
  }

  const units = Array.from({ length: item.quantity }, () => ({
    participantIds: [] as string[],
  }));
  const remainingByParticipant = participantQuantities.reduce<Record<string, number>>(
    (acc, participant) => {
      acc[participant.participantId] = participant.quantity;
      return acc;
    },
    {},
  );
  const orderedParticipantIds = participantQuantities.map(
    (participant) => participant.participantId,
  );

  while (
    orderedParticipantIds.some(
      (participantId) => (remainingByParticipant[participantId] ?? 0) > 0,
    )
  ) {
    orderedParticipantIds.forEach((participantId) => {
      if ((remainingByParticipant[participantId] ?? 0) <= 0) {
        return;
      }

      let targetIndex = -1;
      let lowestOccupancy = Number.POSITIVE_INFINITY;

      units.forEach((unit, index) => {
        if (unit.participantIds.includes(participantId)) {
          return;
        }

        if (unit.participantIds.length < lowestOccupancy) {
          lowestOccupancy = unit.participantIds.length;
          targetIndex = index;
        }
      });

      if (targetIndex === -1) {
        return;
      }

      units[targetIndex].participantIds.push(participantId);
      remainingByParticipant[participantId] -= 1;
    });
  }

  return units;
};

export const buildItemParticipantAmounts = (
  item: DraftItem,
  allocation: DraftItemAllocation | undefined,
  validParticipantIds: Set<string>,
) => {
  const units = buildItemUnitAssignments(item, allocation, validParticipantIds);
  const amounts: Record<string, number> = {};

  units.forEach((unit) => {
    if (unit.participantIds.length === 0) {
      return;
    }

    const splitAmount = round2(item.price / unit.participantIds.length);
    let allocated = 0;

    unit.participantIds.forEach((participantId, index) => {
      const amount =
        index === unit.participantIds.length - 1
          ? round2(item.price - allocated)
          : splitAmount;

      allocated = round2(allocated + amount);
      amounts[participantId] = round2((amounts[participantId] ?? 0) + amount);
    });
  });

  return amounts;
};

const distributeEvenly = (total: number, participantIds: string[]) => {
  if (participantIds.length === 0 || total <= 0) {
    return {} as Record<string, number>;
  }

  const evenShare = round2(total / participantIds.length);
  const distribution: Record<string, number> = {};

  participantIds.forEach((participantId, index) => {
    distribution[participantId] =
      index === participantIds.length - 1
        ? round2(total - evenShare * (participantIds.length - 1))
        : evenShare;
  });

  return distribution;
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

    if (!allocation) {
      issues.push({
        itemId: item.id,
        message: `Defina quem vai pagar "${item.name}".`,
      });
      continue;
    }

    const selectedParticipantIds = getSelectedParticipantIds(
      allocation,
      validParticipantIds,
    );

    if (selectedParticipantIds.length === 0) {
      issues.push({
        itemId: item.id,
        message: `Selecione ao menos uma pessoa para pagar "${item.name}".`,
      });
      continue;
    }

    const normalizedParticipantQuantities = getNormalizedParticipantQuantities(
      item,
      allocation,
      validParticipantIds,
    );

    if (normalizedParticipantQuantities.length === 0) {
      issues.push({
        itemId: item.id,
        message: `Informe ao menos uma quantidade para "${item.name}".`,
      });
      continue;
    }

    const hasInvalidQuantity = selectedParticipantIds.some((participantId) => {
      const quantity = allocation.quantities[participantId] ?? 0;
      return !Number.isInteger(quantity) || quantity < 0 || quantity > item.quantity;
    });

    if (hasInvalidQuantity) {
      issues.push({
        itemId: item.id,
        message: `Cada pessoa pode pagar no máximo ${item.quantity} unidade(s) de "${item.name}".`,
      });
      continue;
    }

    const assignedQuantity = getAssignedQuantity(item, allocation, validParticipantIds);

    if (assignedQuantity < item.quantity) {
      issues.push({
        itemId: item.id,
        message: `Ainda faltam atribuições de quantidade para "${item.name}".`,
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
    const participantAmounts = buildItemParticipantAmounts(
      item,
      allocation,
      validParticipantIds,
    );

    Object.entries(participantAmounts).forEach(([participantId, amount]) => {
      if (amount <= 0) return;

      participantMap[participantId].itemSubtotal = round2(
        participantMap[participantId].itemSubtotal + amount,
      );
      participantMap[participantId].items.push({
        itemId: item.id,
        name: item.name,
        amount,
      });
    });
  }

  const subtotal = round2(
    Object.values(participantMap).reduce(
      (acc, participant) => acc + participant.itemSubtotal,
      0,
    ),
  );

  if (serviceFeePercentage > 0) {
    const serviceParticipants = participants.filter((participant) => {
      if (
        !serviceFeeConfig.selectedParticipantIds.includes(participant.id)
      ) {
        return false;
      }

      return participantMap[participant.id].itemSubtotal > 0;
    });
    const serviceBase = round2(
      serviceParticipants.reduce(
        (acc, participant) => acc + participantMap[participant.id].itemSubtotal,
        0,
      ),
    );
    const serviceTotal = round2(serviceBase * (serviceFeePercentage / 100));
    let allocatedServiceFee = 0;

    serviceParticipants.forEach((participant, index) => {
      const subtotalBase = participantMap[participant.id].itemSubtotal;
      const amount =
        index === serviceParticipants.length - 1
          ? round2(serviceTotal - allocatedServiceFee)
          : round2(subtotalBase * (serviceFeePercentage / 100));

      if (amount <= 0) return;

      allocatedServiceFee = round2(allocatedServiceFee + amount);
      participantMap[participant.id].feeTotal = round2(
        participantMap[participant.id].feeTotal + amount,
      );
      participantMap[participant.id].fees.push({
        type: "SERVICE_PERCENTAGE",
        label: "Taxa de serviço",
        amount,
      });
    });
  }

  const couvertPayers =
    couvertValue > 0
      ? participants
          .map((participant) => participant.id)
          .filter((participantId) => validParticipantIds.has(participantId))
      : [];
  const coveredCouvertAmount =
    couvertPayers.length > 0 && couvertValue > 0 ? couvertValue : 0;

  if (coveredCouvertAmount > 0) {
    couvertPayers.forEach((participantId) => {
      const amount = coveredCouvertAmount;
      participantMap[participantId].feeTotal = round2(
        participantMap[participantId].feeTotal + amount,
      );
      participantMap[participantId].fees.push({
        type: "COVER_CHARGE",
        label: "Couvert artístico",
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

  const feesTotal = round2(
    participantSummaries.reduce((acc, participant) => acc + participant.feeTotal, 0),
  );
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
    const participantAmounts = buildItemParticipantAmounts(
      item,
      allocation,
      validParticipantIds,
    );

    Object.entries(participantAmounts).forEach(([participantId, shareAmount]) => {
      if (shareAmount <= 0) return;

      divisions.push({
        billItemId: item.id,
        participantId,
        shareAmount,
      });
    });
  }

  return divisions;
};
