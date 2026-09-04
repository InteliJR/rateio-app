import { create } from "zustand";
import { MeasurementUnit } from "../lib/measurementUnits";

export interface DraftParticipant {
  id: string;
  name: string;
}

export interface DraftItem {
  id: string;
  name: string;
  quantity: number;
  measurementUnit: MeasurementUnit;
  price: number;
  totalPrice: number;
}

export interface DraftFeeConfig {
  value: number;
  selectedParticipantIds: string[];
}

export interface DraftItemAllocation {
  selectedParticipantIds: string[];
  quantities: Record<string, number>;
}

export interface RateioDraftState {
  billId: string | null;
  billName: string;
  participants: DraftParticipant[];
  items: DraftItem[];
  serviceFeePercentage: number;
  couvertValue: number;
  serviceFeeConfig: DraftFeeConfig;
  couvertConfig: DraftFeeConfig;
  itemAllocations: Record<string, DraftItemAllocation>;
  initializeDraft: (payload: {
    billId: string;
    billName: string;
    participants: DraftParticipant[];
    items: DraftItem[];
    serviceFeePercentage: number;
    couvertValue: number;
    serviceFeeSelectedParticipantIds?: string[];
    couvertSelectedParticipantIds?: string[];
    itemAllocations?: Record<string, DraftItemAllocation>;
  }) => void;
  setBillMeta: (payload: {
    billName: string;
    participants: DraftParticipant[];
    items: DraftItem[];
    serviceFeePercentage: number;
    couvertValue: number;
  }) => void;
  setItemAllocation: (itemId: string, allocation: DraftItemAllocation) => void;
  setFeeSelection: (
    feeType: "service" | "couvert",
    selectedParticipantIds: string[],
  ) => void;
  clearDraft: () => void;
}

const getMandatoryCouvertParticipantIds = (
  participants: DraftParticipant[],
  couvertValue: number,
) =>
  couvertValue > 0 ? participants.map((participant) => participant.id) : [];

const reconcileItemAllocations = (
  items: DraftItem[],
  participants: DraftParticipant[],
  existingAllocations: Record<string, DraftItemAllocation>,
): Record<string, DraftItemAllocation> => {
  const validParticipantIds = new Set(
    participants.map((participant) => participant.id),
  );

  return items.reduce<Record<string, DraftItemAllocation>>((acc, item) => {
    const existingAllocation = existingAllocations[item.id];
    const existingQuantities =
      (
        existingAllocation as unknown as {
          quantities?: Record<string, number>;
          shares?: Record<string, number>;
        }
      )?.quantities ??
      (
        existingAllocation as unknown as {
          quantities?: Record<string, number>;
          shares?: Record<string, number>;
        }
      )?.shares ??
      {};

    if (!existingAllocation) {
      acc[item.id] = {
        selectedParticipantIds: participants.map(
          (participant) => participant.id,
        ),
        quantities: participants.reduce<Record<string, number>>(
          (quantityAcc, participant) => {
            quantityAcc[participant.id] = 0;
            return quantityAcc;
          },
          {},
        ),
      };
      return acc;
    }

    acc[item.id] = {
      selectedParticipantIds: existingAllocation.selectedParticipantIds.filter(
        (participantId) => validParticipantIds.has(participantId),
      ),
      quantities: participants.reduce<Record<string, number>>(
        (quantityAcc, participant) => {
          quantityAcc[participant.id] = existingQuantities[participant.id] ?? 0;
          return quantityAcc;
        },
        {},
      ),
    };

    return acc;
  }, {});
};

const buildDefaultAllocations = (
  items: DraftItem[],
  participants: DraftParticipant[],
): Record<string, DraftItemAllocation> => {
  return items.reduce<Record<string, DraftItemAllocation>>((acc, item) => {
    const selectedParticipantIds = participants.map(
      (participant) => participant.id,
    );
    const quantities = participants.reduce<Record<string, number>>(
      (quantityAcc, participant) => {
        quantityAcc[participant.id] = 0;
        return quantityAcc;
      },
      {},
    );

    acc[item.id] = {
      selectedParticipantIds,
      quantities,
    };

    return acc;
  }, {});
};

const initialState = {
  billId: null,
  billName: "",
  participants: [] as DraftParticipant[],
  items: [] as DraftItem[],
  serviceFeePercentage: 0,
  couvertValue: 0,
  serviceFeeConfig: { value: 0, selectedParticipantIds: [] },
  couvertConfig: { value: 0, selectedParticipantIds: [] },
  itemAllocations: {} as Record<string, DraftItemAllocation>,
};

export const useRateioDraftStore = create<RateioDraftState>((set) => ({
  ...initialState,

  initializeDraft: ({
    billId,
    billName,
    participants,
    items,
    serviceFeePercentage,
    couvertValue,
    serviceFeeSelectedParticipantIds = [],
    couvertSelectedParticipantIds = [],
    itemAllocations,
  }) =>
    set(() => ({
      billId,
      billName,
      participants,
      items,
      serviceFeePercentage,
      couvertValue,
      serviceFeeConfig: {
        value: serviceFeePercentage,
        selectedParticipantIds: serviceFeeSelectedParticipantIds,
      },
      couvertConfig: {
        value: couvertValue,
        selectedParticipantIds: getMandatoryCouvertParticipantIds(
          participants,
          couvertValue,
        ),
      },
      itemAllocations: itemAllocations
        ? reconcileItemAllocations(items, participants, itemAllocations)
        : buildDefaultAllocations(items, participants),
    })),

  setBillMeta: ({
    billName,
    participants,
    items,
    serviceFeePercentage,
    couvertValue,
  }) =>
    set((state) => ({
      billName,
      participants,
      items,
      serviceFeePercentage,
      couvertValue,
      serviceFeeConfig: {
        ...state.serviceFeeConfig,
        value: serviceFeePercentage,
        selectedParticipantIds:
          state.serviceFeeConfig.selectedParticipantIds.filter(
            (participantId) =>
              participants.some(
                (participant) => participant.id === participantId,
              ),
          ),
      },
      couvertConfig: {
        ...state.couvertConfig,
        value: couvertValue,
        selectedParticipantIds: getMandatoryCouvertParticipantIds(
          participants,
          couvertValue,
        ),
      },
      itemAllocations:
        Object.keys(state.itemAllocations).length > 0
          ? reconcileItemAllocations(items, participants, state.itemAllocations)
          : buildDefaultAllocations(items, participants),
    })),

  setItemAllocation: (itemId, allocation) =>
    set((state) => ({
      itemAllocations: {
        ...state.itemAllocations,
        [itemId]: allocation,
      },
    })),

  setFeeSelection: (feeType, selectedParticipantIds) =>
    set((state) => ({
      serviceFeeConfig:
        feeType === "service"
          ? { ...state.serviceFeeConfig, selectedParticipantIds }
          : state.serviceFeeConfig,
      couvertConfig:
        feeType === "couvert"
          ? {
              ...state.couvertConfig,
              selectedParticipantIds: getMandatoryCouvertParticipantIds(
                state.participants,
                state.couvertValue,
              ),
            }
          : state.couvertConfig,
    })),

  clearDraft: () => set(() => ({ ...initialState })),
}));
