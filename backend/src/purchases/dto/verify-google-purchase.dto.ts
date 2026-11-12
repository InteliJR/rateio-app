import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class VerifyGooglePurchaseDto {
  @IsNotEmpty({ message: 'O produto é obrigatório' })
  @IsString()
  @MaxLength(128)
  productId: string;

  @IsNotEmpty({ message: 'O token da compra é obrigatório' })
  @IsString()
  @MaxLength(4096)
  purchaseToken: string;
}
