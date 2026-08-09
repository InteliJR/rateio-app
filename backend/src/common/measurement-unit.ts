import { MeasurementUnit } from '@prisma/client';

const UNIT_ALIASES: Record<string, MeasurementUnit> = {
  UNIT: MeasurementUnit.UNIT,
  UN: MeasurementUnit.UNIT,
  UND: MeasurementUnit.UNIT,
  UNIDADE: MeasurementUnit.UNIT,
  UNIDADES: MeasurementUnit.UNIT,
  KILOGRAM: MeasurementUnit.KILOGRAM,
  KG: MeasurementUnit.KILOGRAM,
  KILO: MeasurementUnit.KILOGRAM,
  QUILO: MeasurementUnit.KILOGRAM,
  QUILOGRAMA: MeasurementUnit.KILOGRAM,
  QUILOGRAMAS: MeasurementUnit.KILOGRAM,
  GRAM: MeasurementUnit.GRAM,
  G: MeasurementUnit.GRAM,
  GR: MeasurementUnit.GRAM,
  GRAMA: MeasurementUnit.GRAM,
  GRAMAS: MeasurementUnit.GRAM,
  LITER: MeasurementUnit.LITER,
  L: MeasurementUnit.LITER,
  LT: MeasurementUnit.LITER,
  LITRO: MeasurementUnit.LITER,
  LITROS: MeasurementUnit.LITER,
  MILLILITER: MeasurementUnit.MILLILITER,
  ML: MeasurementUnit.MILLILITER,
  MILILITRO: MeasurementUnit.MILLILITER,
  MILILITROS: MeasurementUnit.MILLILITER,
};

export function normalizeMeasurementUnit(value: unknown): MeasurementUnit {
  if (typeof value !== 'string') {
    return MeasurementUnit.UNIT;
  }

  const normalized = value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

  return UNIT_ALIASES[normalized] ?? MeasurementUnit.UNIT;
}
