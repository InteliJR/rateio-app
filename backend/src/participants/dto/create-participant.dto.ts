import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class CreateParticipantDto {
  @IsNotEmpty({ message: 'O ID da conta é obrigatório' })
  @IsUUID('4', { message: 'ID da conta inválido' })
  billId: string;

  @IsNotEmpty({ message: 'O nome do participante é obrigatório' })
  @IsString({ message: 'O nome deve ser uma string' })
  name: string;
}
