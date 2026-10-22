import {
  IsInt,
  IsNotEmpty,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  NotEquals,
} from 'class-validator';

export class AdminAdjustCreditsDto {
  @IsUUID('4', { message: 'Usuário inválido' })
  userId: string;

  @IsInt({ message: 'A quantidade deve ser um número inteiro' })
  @NotEquals(0, { message: 'A quantidade não pode ser zero' })
  @Min(-1000)
  @Max(1000)
  amount: number;

  @IsString()
  @IsNotEmpty({ message: 'O motivo é obrigatório' })
  @MaxLength(500)
  reason: string;

  /** Gerada pelo cliente (ex.: UUID) e reenviada se o pedido for repetido. */
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  idempotencyKey: string;
}
