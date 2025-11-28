import { IsOptional, IsString, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateParticipantDto {
  @IsOptional()
  @IsString({ message: 'O nome deve ser uma string' })
  @MinLength(1, { message: 'O nome do participante não pode ser vazio' })
  @Transform(({ value }) => value?.trim())
  name?: string;
}
