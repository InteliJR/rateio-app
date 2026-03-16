import {
  Injectable,
  InternalServerErrorException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import OpenAI, { APIError, APIConnectionError, APIConnectionTimeoutError } from 'openai';
import { ValidationError } from 'class-validator';
import { OcrResultDto, OcrResult } from './dto/ocr-result.dto';


@Injectable()
export class OcrService {
  private openaiClient: OpenAI;
  private readonly model: string;
  private readonly maxRetries = 3;
  private readonly baseDelayMs = 1000;
  private readonly maxDelayMs = 10000;

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
      // 1. Fazer OCR da imagem com retry
      const response = await this.retryWithBackoff(
        async () => {
          return await this.openaiClient.chat.completions.create({
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
        },
        imageUrl,
      );

      const responseContent = response.choices[0]?.message?.content || '';

      if (!responseContent || responseContent.trim().length === 0) {
        throw new Error('Nenhum dado extraído da imagem');
      }

      // 2. Processar e validar resposta JSON
      try {
        const jsonData = JSON.parse(responseContent);
        const validatedData = await OcrResultDto.fromOpenAiResponse(jsonData);
        const parsedData = this.parseJsonResponse(validatedData, responseContent);

        return {
          rawText: responseContent,
          ...parsedData,
        };
      } catch (error) {
        // Tratar erros de parsing/validação
        if (error instanceof SyntaxError) {
          this.logError('JSON_INVALID', 'Resposta não é JSON válido', { imageUrl, error }, 'warn');
          console.warn('Resposta não é JSON válido, usando parser de texto como fallback');
          
          // Fallback: tenta processar como texto
          const parsedData = this.parseReceiptText(responseContent);
          return {
            rawText: responseContent,
            ...parsedData,
          };
        } else if (Array.isArray(error) && error.length > 0 && error[0] instanceof ValidationError) {
          this.logValidationError(error, imageUrl);
          console.warn('JSON não passou na validação, tentando extrair dados mesmo assim...');
          
          // Tentar extrair dados do JSON mesmo com validação falhada
          try {
            const jsonData = JSON.parse(responseContent);
            const parsedData = this.parseJsonResponseUnvalidated(jsonData, responseContent);
            
            // Se conseguiu extrair pelo menos alguns itens, usar esses dados
            if (parsedData.items && parsedData.items.length > 0) {
              console.warn('Dados extraídos do JSON apesar da validação falhar. Itens encontrados:', parsedData.items.length);
              return {
                rawText: responseContent,
                ...parsedData,
              };
            }
          } catch (fallbackError) {
            console.warn('Não foi possível extrair dados do JSON, usando parser de texto como fallback');
          }
          
          // Fallback final: tenta processar como texto
          const parsedData = this.parseReceiptText(responseContent);
          return {
            rawText: responseContent,
            ...parsedData,
          };
        } else {
          this.logError('PARSE_ERROR', 'Erro ao processar resposta da OpenAI', { imageUrl, error });
          
          // Fallback: tenta processar como texto
          const parsedData = this.parseReceiptText(responseContent);
          return {
            rawText: responseContent,
            ...parsedData,
          };
        }
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
   * Processa resposta JSON validada da OpenAI
   * Os dados já foram validados pelo class-validator, então podemos confiar nos tipos
   */
  private parseJsonResponse(jsonData: OcrResultDto, rawText: string): Omit<OcrResult, 'rawText'> {
    // Converter itens validados para o formato OcrResult
    const items: OcrResult['items'] = jsonData.items.map((item) => ({
      name: item.name.trim(),
      quantity: item.quantity || 1,
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
   * Processa resposta JSON sem validação rigorosa (fallback quando validação falha)
   * Tenta extrair dados mesmo quando a validação do DTO falhou
   */
  private parseJsonResponseUnvalidated(jsonData: any, rawText: string): Omit<OcrResult, 'rawText'> {
    const items: OcrResult['items'] = [];
    
    // Tentar extrair itens do JSON
    if (jsonData.items && Array.isArray(jsonData.items)) {
      for (const item of jsonData.items) {
        if (item && item.name) {
          const name = String(item.name).trim();
          const quantity = item.quantity ? Math.max(1, Math.floor(Number(item.quantity))) : 1;
          const unitPrice = item.unitPrice ? Math.max(0, Number(item.unitPrice)) : 0;
          const totalPrice = item.totalPrice ? Math.max(0, Number(item.totalPrice)) : 0;
          
          // Só adicionar se tiver nome válido e preço válido
          if (name.length > 0 && (unitPrice > 0 || totalPrice > 0)) {
            items.push({
              name,
              quantity,
              unitPrice: unitPrice > 0 ? unitPrice : (totalPrice / quantity),
              totalPrice: totalPrice > 0 ? totalPrice : (unitPrice * quantity),
            });
          }
        }
      }
    }

    // Extrair outros campos
    const totalAmount = jsonData.totalAmount ? Number(jsonData.totalAmount) : undefined;
    const establishmentName = jsonData.establishmentName ? String(jsonData.establishmentName).trim() : undefined;

    return {
      items,
      totalAmount: totalAmount && totalAmount > 0 ? totalAmount : undefined,
      establishmentName: establishmentName && establishmentName.length > 0 ? establishmentName : undefined,
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
  private logValidationError(errors: ValidationError[], imageUrl: string): void {
    const validationErrors = errors.map((err) => {
      const error: any = {
        property: err.property,
        value: err.value,
        constraints: err.constraints,
      };

      if (err.children && err.children.length > 0) {
        error.children = err.children.map((child) => ({
          property: child.property,
          value: child.value,
          constraints: child.constraints,
        }));
      }

      return error;
    });

    console.error('Erros de validação:', JSON.stringify(validationErrors, null, 2));

    this.logError('VALIDATION_ERROR', 'Erro de validação do JSON retornado pela OpenAI', {
      imageUrl,
      errors: validationErrors,
      errorCount: validationErrors.length,
    });
  }

  /**
   * Retry logic com backoff exponencial
   * Tenta executar uma operação até maxRetries vezes com delay exponencial entre tentativas
   */
  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    imageUrl: string,
    attempt: number = 1,
  ): Promise<T> {
    try {
      this.logRetryAttempt(attempt, imageUrl, 'iniciando');
      const result = await operation();
      if (attempt > 1) {
        this.logRetryAttempt(attempt, imageUrl, 'sucesso');
      }
      return result;
    } catch (error) {
      // Erros que não devem ser retentados (autenticação, requisição inválida)
      if (this.shouldNotRetry(error)) {
        throw error;
      }

      // Se atingiu o máximo de tentativas, lança o erro
      if (attempt >= this.maxRetries) {
        this.logRetryAttempt(attempt, imageUrl, 'falhou_apos_todas_tentativas', error);
        throw error;
      }

      // Calcula delay exponencial: após tentativa 1 falhar = 1s, após tentativa 2 falhar = 2s
      const delayMs = this.getRetryDelayMs(error, attempt);
      this.logRetryAttempt(attempt, imageUrl, 'falhou_tentando_novamente', error, delayMs);

      // Aguarda antes de tentar novamente
      await this.sleep(delayMs);

      // Tenta novamente
      return this.retryWithBackoff(operation, imageUrl, attempt + 1);
    }
  }

  /**
   * Verifica se o erro não deve ser retentado
   */
  private shouldNotRetry(error: any): boolean {
    if (!error) {
      return false;
    }

    // Verificar primeiro se tem a propriedade status (funciona para APIError e mocks)
    // Isso deve vir primeiro porque instanceof pode não funcionar em mocks de teste
    // Verificar se tem status diretamente na propriedade
    const status = error.status;
    if (typeof status === 'number') {
      if (status === 401 || status === 403 || status === 400) {
        return true;
      }
    }

    // Erros de autenticação (401, 403) não devem ser retentados
    if (error instanceof APIError) {
      const apiErrorStatus = error.status;
      if (apiErrorStatus === 401 || apiErrorStatus === 403 || apiErrorStatus === 400) {
        return true;
      }
    }

    // Verificar também se o erro tem a propriedade code que indica erro de autenticação
    if (error.code && (error.code === 'unauthorized' || error.code === 'invalid_api_key')) {
      return true;
    }

    return false;
  }

  private getRetryDelayMs(error: any, attempt: number): number {
    const retryAfterMs = this.getRetryAfterMs(error);

    if (retryAfterMs !== null) {
      return retryAfterMs;
    }

    const exponentialDelayMs = this.baseDelayMs * Math.pow(2, attempt - 1);
    const jitterMs = Math.floor(Math.random() * 500);

    return Math.min(exponentialDelayMs + jitterMs, this.maxDelayMs);
  }

  private getRetryAfterMs(error: any): number | null {
    const retryAfterHeader =
      error?.headers?.['retry-after'] ??
      error?.headers?.get?.('retry-after');

    if (!retryAfterHeader) {
      return null;
    }

    const retryAfterSeconds = Number(retryAfterHeader);
    if (!Number.isNaN(retryAfterSeconds) && retryAfterSeconds > 0) {
      return Math.min(retryAfterSeconds * 1000, this.maxDelayMs);
    }

    const retryAt = new Date(retryAfterHeader).getTime();
    if (Number.isNaN(retryAt)) {
      return null;
    }

    return Math.min(
      Math.max(retryAt - Date.now(), this.baseDelayMs),
      this.maxDelayMs,
    );
  }

  /**
   * Aguarda um determinado tempo em milissegundos
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Loga tentativas de retry para monitoramento
   */
  private logRetryAttempt(
    attempt: number,
    imageUrl: string,
    status: 'iniciando' | 'sucesso' | 'falhou_tentando_novamente' | 'falhou_apos_todas_tentativas',
    error?: any,
    delayMs?: number,
  ): void {
    const logData: any = {
      timestamp: new Date().toISOString(),
      attempt,
      maxRetries: this.maxRetries,
      imageUrl,
      status,
    };

    if (error) {
      logData.error = {
        message: error instanceof Error ? error.message : String(error),
        type: error?.constructor?.name,
        ...(error instanceof APIError && {
          status: error.status,
          code: error.code,
        }),
      };
    }

    if (delayMs !== undefined) {
      logData.nextRetryDelayMs = delayMs;
    }

    if (status === 'falhou_apos_todas_tentativas') {
      console.error(`[OCR_RETRY] Tentativa ${attempt}/${this.maxRetries} falhou após todas as tentativas:`, JSON.stringify(logData, null, 2));
    } else if (status === 'falhou_tentando_novamente') {
      console.warn(`[OCR_RETRY] Tentativa ${attempt}/${this.maxRetries} falhou, tentando novamente em ${delayMs}ms:`, JSON.stringify(logData, null, 2));
    } else if (status === 'sucesso' && attempt > 1) {
      console.log(`[OCR_RETRY] Tentativa ${attempt}/${this.maxRetries} bem-sucedida após retry:`, JSON.stringify(logData, null, 2));
    } else if (status === 'iniciando' && attempt === 1) {
      // Não loga a primeira tentativa inicial para não poluir os logs
    }
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
