import { IsNotEmpty, IsString, IsUUID, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateParticipantDto {
  @IsNotEmpty({ message: 'O ID da conta é obrigatório' })
  @IsUUID('4', { message: 'ID da conta inválido' })
  billId: string;

  @IsNotEmpty({ message: 'O nome do participante é obrigatório' })
  @IsString({ message: 'O nome deve ser uma string' })
  @MinLength(1, { message: 'O nome do participante não pode ser vazio' })
  @Transform(({ value }) => value?.trim())
  name: string;
}
