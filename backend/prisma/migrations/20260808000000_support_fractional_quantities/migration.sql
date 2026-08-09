-- Existing integer quantities remain unchanged while gaining three decimal places.
CREATE TYPE "MeasurementUnit" AS ENUM (
  'UNIT',
  'KILOGRAM',
  'GRAM',
  'LITER',
  'MILLILITER'
);

ALTER TABLE "bill_items"
  ALTER COLUMN "quantity" DROP DEFAULT,
  ALTER COLUMN "quantity" TYPE DECIMAL(12, 3)
    USING "quantity"::DECIMAL(12, 3),
  ALTER COLUMN "quantity" SET DEFAULT 1,
  ADD COLUMN "measurementUnit" "MeasurementUnit" NOT NULL DEFAULT 'UNIT';
