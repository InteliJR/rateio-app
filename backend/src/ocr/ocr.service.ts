import {
  Injectable,
  InternalServerErrorException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import OpenAI, { APIError, APIConnectionError, APIConnectionTimeoutError } from 'openai';
import { z } from 'zod';

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

// Schema de validação Zod para resposta da OpenAI
const OpenAiResponseSchema = z.object({
  establishmentName: z.string().optional(),
  items: z.array(
    z.object({
      name: z.string().min(1, 'Nome do item é obrigatório'),
      quantity: z.number().int().positive().default(1),
      unitPrice: z.number().nonnegative(),
      totalPrice: z.number().nonnegative(),
    }),
  ).min(1, 'Pelo menos um item é obrigatório'),
  totalAmount: z.number().nonnegative().optional(),
  subtotal: z.number().nonnegative().optional(),
  taxes: z
    .array(
      z.object({
        type: z.enum(['SERVICE', 'COVER_CHARGE', 'OTHER']).optional(),
        description: z.string().optional(),
        value: z.number().nonnegative(),
        percentage: z.number().nonnegative().nullable().optional(),
      }),
    )
    .optional(),
  discounts: z
    .array(
      z.object({
        description: z.string().optional(),
        value: z.number().nonnegative(),
      }),
    )
    .optional(),
  currency: z.string().default('BRL'),
});

type OpenAiResponse = z.infer<typeof OpenAiResponseSchema>;

@Injectable()
export class OcrService {
  private openaiClient: OpenAI;
  private readonly model: string;

  constructor() {
    // Validar variáveis de ambiente obrigatórias
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY não está definida nas variáveis de ambiente');
    }
    if (!process.env.OPENAI_MODEL) {
      throw new Error('OPENAI_MODEL não está definida nas variáveis de ambiente');
    }

    // Inicializar cliente OpenAI
    this.openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    this.model = process.env.OPENAI_MODEL;
  }

  /**
   * Processar imagem e extrair texto via OCR
   */
  async processImage(imageUrl: string): Promise<OcrResult> {
    try {
      // 1. Fazer OCR da imagem
      const response = await this.openaiClient.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: this.getStructuredPrompt(),
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageUrl,
                },
              },
            ],
          },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 2000,
      });

      const responseContent = response.choices[0]?.message?.content || '';

      if (!responseContent || responseContent.trim().length === 0) {
        throw new Error('Nenhum dado extraído da imagem');
      }

      // 2. Processar e validar resposta JSON
      try {
        const jsonData = JSON.parse(responseContent);
        const validatedData = this.validateAndParseResponse(jsonData);
        const parsedData = this.parseJsonResponse(validatedData, responseContent);

        return {
          rawText: responseContent,
          ...parsedData,
        };
      } catch (error) {
        // Tratar erros de parsing/validação
        if (error instanceof z.ZodError) {
          this.logValidationError(error, imageUrl);
          console.warn('JSON não passou na validação, usando parser de texto como fallback');
        } else if (error instanceof SyntaxError) {
          this.logError('JSON_INVALID', 'Resposta não é JSON válido', { imageUrl, error }, 'warn');
          console.warn('Resposta não é JSON válido, usando parser de texto como fallback');
        } else {
          this.logError('PARSE_ERROR', 'Erro ao processar resposta da OpenAI', { imageUrl, error });
        }

        // Fallback: tenta processar como texto
        const parsedData = this.parseReceiptText(responseContent);

        return {
          rawText: responseContent,
          ...parsedData,
        };
      }
    } catch (error) {
      // Capturar e tratar erros específicos da API OpenAI
      const ocrError = this.handleOpenAiError(error, imageUrl);
      throw ocrError;
    }
  }

  /**
   * Gera prompt estruturado para extração de dados em JSON
   */
  private getStructuredPrompt(): string {
    return `Analise esta imagem de uma conta de restaurante/bar e extraia os dados em formato JSON.

Estrutura esperada:
{
  "establishmentName": "Nome do estabelecimento",
  "items": [
    {
      "name": "Nome do item",
      "quantity": 1,
      "unitPrice": 10.00,
      "totalPrice": 10.00
    }
  ],
  "totalAmount": 50.00,
  "subtotal": 45.00,
  "taxes": [
    {
      "type": "SERVICE",
      "description": "Taxa de serviço",
      "value": 5.00,
      "percentage": 10
    }
  ],
  "discounts": [
    {
      "description": "Desconto",
      "value": 2.00
    }
  ],
  "currency": "BRL"
}

Instruções:
1. Extraia TODOS os itens da conta com nome, quantidade, preço unitário e preço total
2. Identifique o nome do estabelecimento (geralmente no topo da conta)
3. Calcule o total geral da conta
4. Identifique subtotais quando disponíveis
5. Extraia taxas e serviços (garçom, couvert, etc.) - inclua tipo, descrição, valor e percentual quando aplicável
6. Identifique descontos quando presentes
7. Identifique a moeda (BRL, USD, EUR, etc.) - padrão é BRL se não especificado
8. Para quantidades, se não estiver explícito, assuma 1
9. Para preços unitários, se não estiver explícito, calcule dividindo o preço total pela quantidade
10. Trate valores com vírgula ou ponto decimal (ex: 10,50 ou 10.50)
11. Se houver múltiplas moedas, use a moeda principal da conta
12. Retorne APENAS o JSON, sem texto adicional ou markdown

Casos especiais:
- Se houver taxa de serviço percentual, calcule o valor e inclua tanto o valor quanto o percentual
- Se houver couvert por pessoa, inclua como taxa do tipo "COVER_CHARGE"
- Se houver desconto percentual, calcule o valor e inclua ambos
- Se algum item não tiver preço claro, tente inferir só se estiver explícito ou deixe como null na maioria dos casos
- Se o total não estiver explícito, calcule somando todos os itens e taxas, subtraindo descontos

Exemplos de formato de conta:

Exemplo 1 - Conta simples:
RESTAURANTE DO JOÃO
Coca-Cola 2x 5,00 10,00
Hambúrguer 1x 25,00 25,00
Batata Frita 1x 12,00 12,00
Subtotal: 47,00
Taxa de Serviço (10%): 4,70
TOTAL: 51,70

JSON esperado:
{
  "establishmentName": "RESTAURANTE DO JOÃO",
  "items": [
    {"name": "Coca-Cola", "quantity": 2, "unitPrice": 5.00, "totalPrice": 10.00},
    {"name": "Hambúrguer", "quantity": 1, "unitPrice": 25.00, "totalPrice": 25.00},
    {"name": "Batata Frita", "quantity": 1, "unitPrice": 12.00, "totalPrice": 12.00}
  ],
  "subtotal": 47.00,
  "totalAmount": 51.70,
  "taxes": [
    {"type": "SERVICE", "description": "Taxa de Serviço", "value": 4.70, "percentage": 10}
  ],
  "currency": "BRL"
}

Exemplo 2 - Conta com couvert e desconto:
BAR DO ZÉ
Couvert 2x 3,50 7,00
Cerveja Brahma 3x 8,00 24,00
Porção de Amendoim 1x 15,00 15,00
Subtotal: 46,00
Desconto Fidelidade: -5,00
Taxa de Serviço (10%): 4,10
TOTAL: 45,10

JSON esperado:
{
  "establishmentName": "BAR DO ZÉ",
  "items": [
    {"name": "Cerveja Brahma", "quantity": 3, "unitPrice": 8.00, "totalPrice": 24.00},
    {"name": "Porção de Amendoim", "quantity": 1, "unitPrice": 15.00, "totalPrice": 15.00}
  ],
  "subtotal": 46.00,
  "totalAmount": 45.10,
  "taxes": [
    {"type": "COVER_CHARGE", "description": "Couvert", "value": 7.00, "percentage": null},
    {"type": "SERVICE", "description": "Taxa de Serviço", "value": 4.10, "percentage": 10}
  ],
  "discounts": [
    {"description": "Desconto Fidelidade", "value": 5.00}
  ],
  "currency": "BRL"
}

Exemplo 3 - Conta sem taxas:
PIZZARIA MAMA ITALIA
Pizza Margherita 1x 35,00 35,00
Refrigerante 2x 4,50 9,00
TOTAL: 44,00

JSON esperado:
{
  "establishmentName": "PIZZARIA MAMA ITALIA",
  "items": [
    {"name": "Pizza Margherita", "quantity": 1, "unitPrice": 35.00, "totalPrice": 35.00},
    {"name": "Refrigerante", "quantity": 2, "unitPrice": 4.50, "totalPrice": 9.00}
  ],
  "totalAmount": 44.00,
  "currency": "BRL"
}

Retorne o JSON seguindo exatamente a estrutura acima, baseando-se nos exemplos fornecidos.`;
  }

  /**
   * Valida e faz parse da resposta JSON usando Zod
   */
  private validateAndParseResponse(jsonData: any): OpenAiResponse {
    try {
      return OpenAiResponseSchema.parse(jsonData);
    } catch (error) {
      if (error instanceof z.ZodError) {
        // Log detalhado dos erros de validação
        const zodError = error as z.ZodError;
        const errors = zodError.issues.map((err) => ({
          path: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));
        console.error('Erros de validação:', JSON.stringify(errors, null, 2));
      }
      throw error;
    }
  }

  /**
   * Processa resposta JSON validada da OpenAI
   * Os dados já foram validados pelo Zod, então podemos confiar nos tipos
   */
  private parseJsonResponse(jsonData: OpenAiResponse, rawText: string): Omit<OcrResult, 'rawText'> {
    // Converter itens validados para o formato OcrResult
    const items: OcrResult['items'] = jsonData.items.map((item) => ({
      name: item.name.trim(),
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
    }));

    return {
      items,
      totalAmount: jsonData.totalAmount,
      establishmentName: jsonData.establishmentName?.trim(),
    };
  }

  /**
   * Parser do texto OCR para extrair itens e valores
   */
  private parseReceiptText(text: string): Omit<OcrResult, 'rawText'> {
    const lines = text.split('\n').filter((line) => line.trim());

    const items: OcrResult['items'] = [];
    let totalAmount: number | undefined;
    let establishmentName: string | undefined;

    // Regex para detectar itens com valor (ex: "Coca Cola 5,00" ou "2x Cerveja 12,00")
    const itemRegex = /(\d+x?\s*)?([a-zA-ZÀ-ÿ\s]+)\s+(\d+[,.]?\d*)/gi;
    
    // Regex para detectar total (ex: "TOTAL: 45,00" ou "Total R$ 45,00")
    const totalRegex = /total[:\s]*r?\$?\s*(\d+[,.]?\d+)/gi;

    // Tentar extrair nome do estabelecimento (primeira linha geralmente)
    if (lines.length > 0) {
      establishmentName = lines[0].trim();
    }

    // Extrair itens
    for (const line of lines) {
      const match = itemRegex.exec(line);
      if (match) {
        const quantityStr = match[1]?.replace('x', '').trim() || '1';
        const name = match[2].trim();
        const priceStr = match[3].replace(',', '.');

        const quantity = parseInt(quantityStr, 10) || 1;
        const price = parseFloat(priceStr);

        if (!isNaN(price) && name.length > 2) {
          items.push({
            name,
            quantity,
            unitPrice: quantity > 1 ? price / quantity : price,
            totalPrice: price,
          });
        }
      }

      // Extrair total
      const totalMatch = totalRegex.exec(line);
      if (totalMatch) {
        totalAmount = parseFloat(totalMatch[1].replace(',', '.'));
      }
    }

    return {
      items,
      totalAmount,
      establishmentName,
    };
  }

  /**
   * Validar resultado do OCR
   */
  validateOcrResult(result: OcrResult): boolean {
    return (
      result.rawText.length > 10 &&
      result.items.length > 0
    );
  }

  /**
   * Trata erros específicos da API OpenAI e retorna exceções apropriadas
   */
  private handleOpenAiError(error: any, imageUrl: string): InternalServerErrorException {
    // Erro de API (status HTTP, rate limit, etc)
    if (error instanceof APIError) {
      const status = error.status;
      const code = error.code;
      const message = error.message;

      this.logError('OPENAI_API_ERROR', 'Erro na API OpenAI', {
        imageUrl,
        status,
        code,
        message,
        error: error.error,
      });

      // Rate limit
      if (status === 429) {
        return new ServiceUnavailableException(
          'Limite de requisições excedido. Tente novamente em alguns instantes.',
        );
      }

      // Erro de autenticação
      if (status === 401 || status === 403) {
        return new InternalServerErrorException(
          'Erro de autenticação com a API OpenAI. Verifique as credenciais.',
        );
      }

      // Erro de requisição inválida
      if (status === 400) {
        return new BadRequestException(
          `Requisição inválida para a API OpenAI: ${message || 'Verifique os parâmetros da requisição'}`,
        );
      }

      // Outros erros da API
      return new InternalServerErrorException(
        `Erro na API OpenAI (${status}): ${message || 'Não foi possível processar a imagem'}`,
      );
    }

    // Erro de conexão
    if (error instanceof APIConnectionError || error instanceof APIConnectionTimeoutError) {
      this.logError('OPENAI_CONNECTION_ERROR', 'Erro de conexão com OpenAI', {
        imageUrl,
        message: error.message,
        cause: error.cause,
      });

      return new ServiceUnavailableException(
        'Não foi possível conectar à API OpenAI. Verifique sua conexão com a internet.',
      );
    }

    // Erro genérico
    this.logError('OCR_GENERIC_ERROR', 'Erro genérico no OCR', {
      imageUrl,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return new InternalServerErrorException(
      'Falha ao processar imagem. Verifique a qualidade da foto e tente novamente.',
    );
  }

  /**
   * Loga erros de validação com detalhes
   */
  private logValidationError(error: z.ZodError, imageUrl: string): void {
    const errors = error.issues.map((err) => ({
      path: err.path.join('.'),
      message: err.message,
      code: err.code,
      ...(err.code === 'invalid_type' && { received: (err as any).received, expected: (err as any).expected }),
    }));

    this.logError('VALIDATION_ERROR', 'Erro de validação do JSON retornado pela OpenAI', {
      imageUrl,
      errors,
      errorCount: errors.length,
    });
  }

  /**
   * Loga erros de forma estruturada para debug
   */
  private logError(
    errorType: string,
    message: string,
    context: Record<string, any>,
    level: 'error' | 'warn' = 'error',
  ): void {
    const logData = {
      timestamp: new Date().toISOString(),
      errorType,
      message,
      ...context,
    };

    if (level === 'error') {
      console.error(`[OCR_ERROR] ${errorType}:`, JSON.stringify(logData, null, 2));
    } else {
      console.warn(`[OCR_WARN] ${errorType}:`, JSON.stringify(logData, null, 2));
    }
  }
}