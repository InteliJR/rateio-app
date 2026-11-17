import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  NotEquals,
} from 'class-validator';

export class AdjustCreditsDto {
  /** Positivo concede, negativo retira. Zero não é ajuste. */
  @IsInt()
  @NotEquals(0)
  amount: number;

  /** Obrigatório: é o que explica o ajuste para quem auditar depois. */
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  @MaxLength(300)
  reason: string;

  /** Opcional. Repetir a mesma referência não ajusta o saldo duas vezes. */
  @IsOptional()
  @IsUUID()
  reference?: string;
}
