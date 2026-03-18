import { IsEmail, IsNotEmpty, IsString, Length, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsEmail({}, { message: 'Informe um email válido.' })
  @IsNotEmpty({ message: 'O email é obrigatório.' })
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'O código é obrigatório.' })
  @Length(6, 6, { message: 'O código deve ter 6 dígitos.' })
  token: string;

  @IsString()
  @IsNotEmpty({ message: 'A nova senha é obrigatória.' })
  @MinLength(8, { message: 'A nova senha deve ter pelo menos 8 caracteres.' })
  newPassword: string;
}
