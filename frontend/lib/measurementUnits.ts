import { formatNumberPtBr, round2 } from "./formatters";

export type MeasurementUnit =
  | "UNIT"
  | "KILOGRAM"
  | "GRAM"
  | "LITER"
  | "MILLILITER";

export const MIN_ITEM_QUANTITY = 0.001;
export const MAX_ITEM_QUANTITY = 999_999.999;
export const MAX_MONEY_VALUE = 99_999_999.99;

export const MEASUREMENT_UNIT_OPTIONS: Array<{
  value: MeasurementUnit;
  label: string;
}> = [
  { value: "UNIT", label: "un" },
  { value: "KILOGRAM", label: "kg" },
  { value: "GRAM", label: "g" },
  { value: "LITER", label: "L" },
  { value: "MILLILITER", label: "ml" },
];

export const normalizeMeasurementUnit = (
  value?: string | null,
): MeasurementUnit =>
  MEASUREMENT_UNIT_OPTIONS.some((option) => option.value === value)
    ? (value as MeasurementUnit)
    : "UNIT";

export const getMeasurementUnitLabel = (unit: MeasurementUnit) =>
  MEASUREMENT_UNIT_OPTIONS.find((option) => option.value === unit)?.label ??
  "un";

export const isMeasuredItem = (item: {
  quantity: number;
  measurementUnit?: MeasurementUnit;
}) =>
  normalizeMeasurementUnit(item.measurementUnit) !== "UNIT" ||
  !Number.isInteger(item.quantity);

export const formatItemQuantity = (
  quantity: number,
  measurementUnit: MeasurementUnit,
) =>
  `${formatNumberPtBr(quantity, 0, 3)} ${getMeasurementUnitLabel(measurementUnit)}`;

export const getItemTotalPrice = (item: {
  quantity: number;
  price: number;
  totalPrice?: number;
}) =>
  Number.isFinite(item.totalPrice) && Number(item.totalPrice) > 0
    ? round2(Number(item.totalPrice))
    : round2(item.quantity * item.price);
