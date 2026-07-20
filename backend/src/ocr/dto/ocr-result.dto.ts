import {
  IsString,
  IsNumber,
  IsArray,
  IsOptional,
  IsNotEmpty,
  ValidateNested,
  Min,
  ArrayMinSize,
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';
import { Type, plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { OcrItemDto } from './ocr-item.dto';
import { OcrTaxDto } from './ocr-tax.dto';
import { OcrDiscountDto } from './ocr-discount.dto';
import { parseOcrNumber, parseOcrQuantity, roundMoney } from '../ocr-number.util';

export interface OcrResult {
  rawText: string;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }>;
  totalAmount?: number;
  establishmentName?: string;
}

/**
 * Valida se a soma dos itens bate com o totalAmount (com tolerância de 0.01)
 */
function IsTotalAmountValid(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isTotalAmountValid',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          const dto = args.object as OcrResultDto;
          
          // Se não tem totalAmount, não valida (é opcional)
          if (!dto.totalAmount) {
            return true;
          }

          // Se não tem itens, não pode validar
          if (!dto.items || dto.items.length === 0) {
            return true;
          }

          // Calcula soma dos itens
          const sumOfItems = dto.items.reduce((sum, item) => {
            return sum + (item.totalPrice || 0);
          }, 0);

          // Adiciona taxas se existirem
          let sumWithTaxes = sumOfItems;
          if (dto.taxes && dto.taxes.length > 0) {
            const taxesSum = dto.taxes.reduce((sum, tax) => sum + (tax.value || 0), 0);
            sumWithTaxes += taxesSum;
          }

          // Subtrai descontos se existirem
          let finalSum = sumWithTaxes;
          if (dto.discounts && dto.discounts.length > 0) {
            const discountsSum = dto.discounts.reduce((sum, discount) => sum + (discount.value || 0), 0);
            finalSum -= discountsSum;
          }

          // Tolerância de 0.01
          const tolerance = 0.01;
          const difference = Math.abs(finalSum - dto.totalAmount);

          return difference <= tolerance;
        },
        defaultMessage(args: ValidationArguments) {
          const dto = args.object as OcrResultDto;
          
          if (!dto.items || dto.items.length === 0) {
            return 'Não é possível validar o total sem itens';
          }

          const sumOfItems = dto.items.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
          let sumWithTaxes = sumOfItems;
          
          if (dto.taxes && dto.taxes.length > 0) {
            const taxesSum = dto.taxes.reduce((sum, tax) => sum + (tax.value || 0), 0);
            sumWithTaxes += taxesSum;
          }

          let finalSum = sumWithTaxes;
          if (dto.discounts && dto.discounts.length > 0) {
            const discountsSum = dto.discounts.reduce((sum, discount) => sum + (discount.value || 0), 0);
            finalSum -= discountsSum;
          }

          const difference = Math.abs(finalSum - (dto.totalAmount || 0));
          
          return `A soma dos itens (${finalSum.toFixed(2)}) não corresponde ao total (${dto.totalAmount?.toFixed(2)}). Diferença: ${difference.toFixed(2)}. Tolerância permitida: 0.01`;
        },
      },
    });
  };
}

export class OcrResultDto {
  @IsOptional()
  @IsString({ message: 'Nome do estabelecimento deve ser uma string' })
  establishmentName?: string;

  @IsNotEmpty({ message: 'Lista de itens é obrigatória' })
  @IsArray({ message: 'Items deve ser um array' })
  @ArrayMinSize(1, { message: 'Pelo menos um item é obrigatório' })
  @ValidateNested({ each: true })
  @Type(() => OcrItemDto)
  items: OcrItemDto[];

  @IsOptional()
  @IsNumber({}, { message: 'Valor total deve ser um número' })
  @Min(0.01, { message: 'Valor total deve ser um valor positivo' })
  @IsTotalAmountValid({ message: 'A soma dos itens não corresponde ao total (tolerância: 0.01)' })
  totalAmount?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Subtotal deve ser um número' })
  @Min(0, { message: 'Subtotal não pode ser negativo' })
  subtotal?: number;

  @IsOptional()
  @IsArray({ message: 'Taxas deve ser um array' })
  @ValidateNested({ each: true })
  @Type(() => OcrTaxDto)
  taxes?: OcrTaxDto[];

  @IsOptional()
  @IsArray({ message: 'Descontos deve ser um array' })
  @ValidateNested({ each: true })
  @Type(() => OcrDiscountDto)
  discounts?: OcrDiscountDto[];

  @IsOptional()
  @IsString({ message: 'Moeda deve ser uma string' })
  currency?: string;

  /**
   * Valida e converte resposta JSON da OpenAI para OcrResultDto
   */
  static async fromOpenAiResponse(jsonData: any): Promise<OcrResultDto> {
    // Criar cópia para não mutar o objeto original
    const processedData = { ...jsonData };

    // Aplicar defaults antes da conversão
    if (processedData.items && Array.isArray(processedData.items)) {
      processedData.items = processedData.items.map((item: any) =>
        OcrResultDto.normalizeItem(item),
      );
    }

    processedData.totalAmount = OcrResultDto.normalizePositiveMoney(
      processedData.totalAmount ??
        processedData.total ??
        processedData.valorTotal ??
        processedData.valor_total ??
        processedData.totalGeral ??
        processedData.total_geral,
    );
    processedData.subtotal = OcrResultDto.normalizePositiveMoney(
      processedData.subtotal,
      true,
    );

    if (processedData.taxes && Array.isArray(processedData.taxes)) {
      processedData.taxes = processedData.taxes.map((tax: any) => ({
        ...tax,
        value: OcrResultDto.normalizePositiveMoney(
          tax.value ?? tax.valor ?? tax.amount,
          true,
        ),
        percentage: OcrResultDto.normalizePositiveMoney(
          tax.percentage ?? tax.percentual ?? tax.percent,
          true,
        ),
      }));
    }

    if (processedData.discounts && Array.isArray(processedData.discounts)) {
      processedData.discounts = processedData.discounts.map((discount: any) => ({
        ...discount,
        value: OcrResultDto.normalizePositiveMoney(
          discount.value ?? discount.valor ?? discount.amount,
          true,
        ),
      }));
    }
    if (!processedData.currency) {
      processedData.currency = 'BRL';
    }

    // Converter JSON para instância do DTO
    const ocrResultDto = plainToInstance(OcrResultDto, processedData, {
      enableImplicitConversion: true,
    });

    // Validar usando class-validator
    const errors = await validate(ocrResultDto, {
      whitelist: true,
      forbidNonWhitelisted: false,
    });

    if (errors.length > 0) {
      throw errors;
    }

    return ocrResultDto;
  }

  private static normalizeItem(item: any) {
    const quantity = parseOcrQuantity(
      item.quantity ?? item.quantidade ?? item.qty ?? item.qtd ?? 1,
    );
    const unitPrice = parseOcrNumber(
      item.unitPrice ??
        item.unit_price ??
        item.precoUnitario ??
        item.preco_unitario ??
        item.valorUnitario ??
        item.valor_unitario ??
        item.price ??
        item.preco ??
        item.valor,
    );
    const totalPrice = parseOcrNumber(
      item.totalPrice ??
        item.total_price ??
        item.precoTotal ??
        item.preco_total ??
        item.valorTotal ??
        item.valor_total ??
        item.total,
    );
    const normalizedUnitPrice =
      unitPrice && unitPrice > 0
        ? unitPrice
        : totalPrice && totalPrice > 0
          ? totalPrice / quantity
          : undefined;
    const normalizedTotalPrice =
      totalPrice && totalPrice > 0
        ? totalPrice
        : normalizedUnitPrice && normalizedUnitPrice > 0
          ? normalizedUnitPrice * quantity
          : undefined;

    return {
      ...item,
      name:
        item.name ??
        item.nome ??
        item.description ??
        item.descricao ??
        item.produto,
      quantity,
      unitPrice:
        normalizedUnitPrice === undefined
          ? undefined
          : roundMoney(normalizedUnitPrice),
      totalPrice:
        normalizedTotalPrice === undefined
          ? undefined
          : roundMoney(normalizedTotalPrice),
    };
  }

  private static normalizePositiveMoney(
    value: unknown,
    allowZero = false,
  ): number | undefined {
    const parsed = parseOcrNumber(value);
    if (parsed === undefined) {
      return undefined;
    }

    const normalized = Math.abs(parsed);
    if (normalized > 0 || allowZero) {
      return roundMoney(normalized);
    }

    return undefined;
  }

  /**
   * Valida se o resultado do OCR tem conteúdo suficiente
   */
  static validateOcrResult(result: OcrResult): boolean {
    return result.rawText.length > 10 && result.items.length > 0;
  }
}

