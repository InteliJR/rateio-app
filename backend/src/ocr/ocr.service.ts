import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ImageAnnotatorClient } from '@google-cloud/vision';

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

@Injectable()
export class OcrService {
  private visionClient: ImageAnnotatorClient;

  constructor() {
    // Inicializar cliente do Google Vision
    this.visionClient = new ImageAnnotatorClient({
      keyFilename: process.env.GOOGLE_VISION_KEY_FILE, // ou usar GOOGLE_APPLICATION_CREDENTIALS
      // OU usar API key:
      // apiKey: process.env.GOOGLE_VISION_API_KEY,
    });
  }

  /**
   * Processar imagem e extrair texto via OCR
   */
  async processImage(imageUrl: string): Promise<OcrResult> {
    try {
      // 1. Fazer OCR da imagem
      const [result] = await this.visionClient.textDetection(imageUrl);
      const detections = result.textAnnotations;

      if (!detections || detections.length === 0) {
        throw new Error('Nenhum texto detectado na imagem');
      }

      const rawText = detections[0].description || '';

      // 2. Processar texto e extrair informações
      const parsedData = this.parseReceiptText(rawText);

      return {
        rawText,
        ...parsedData,
      };
    } catch (error) {
      console.error('❌ Erro no OCR:', error);
      throw new InternalServerErrorException(
        'Falha ao processar imagem. Verifique a qualidade da foto.',
      );
    }
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
}