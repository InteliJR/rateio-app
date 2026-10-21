import { Platform } from "react-native";
import { logger } from "../lib/logger";

// Mínimo de caracteres reconhecidos para considerar a foto legível (ajustável)
export const MIN_TEXT_LENGTH = 20;

export interface ImageValidationResult {
  isValid: boolean;
  reason?: string;
  textLength: number;
}

type MlkitOcrModule = typeof import("expo-mlkit-ocr");

// Cache do módulo nativo: undefined = ainda não carregado, null = indisponível
let mlkitOcr: MlkitOcrModule | null | undefined;

// Carrega o módulo uma única vez. Em web, Expo Go ou build sem o módulo nativo,
// o require lança erro e a validação é ignorada (falha aberta).
const loadMlkitOcr = (): MlkitOcrModule | null => {
  if (mlkitOcr !== undefined) return mlkitOcr;

  if (Platform.OS === "web") {
    mlkitOcr = null;
    return mlkitOcr;
  }

  try {
    mlkitOcr = require("expo-mlkit-ocr") as MlkitOcrModule;
  } catch (error) {
    logger.warn("ML Kit OCR indisponível, validação ignorada:", error);
    mlkitOcr = null;
  }
  return mlkitOcr;
};

// Pré-valida a foto no aparelho antes do envio. Nunca bloqueia por falha da
// própria validação: qualquer erro ou falta de suporte retorna isValid: true.
// O texto reconhecido nunca é armazenado nem logado, apenas o tamanho.
export const validateReceiptImage = async (
  uri: string,
): Promise<ImageValidationResult> => {
  const startedAt = Date.now();

  try {
    const module = loadMlkitOcr();
    if (!module || !module.isSupported()) {
      return { isValid: true, textLength: 0 };
    }

    const { text } = await module.recognizeText(uri);
    const textLength = text.replace(/\s/g, "").length;
    const isValid = textLength >= MIN_TEXT_LENGTH;

    logger.debug("Validação de imagem:", {
      textLength,
      durationMs: Date.now() - startedAt,
    });

    return isValid
      ? { isValid, textLength }
      : {
          isValid,
          reason: "Pouco texto reconhecido na imagem",
          textLength,
        };
  } catch (error) {
    logger.warn("Erro na validação da imagem, seguindo o fluxo normal:", error);
    return { isValid: true, textLength: 0 };
  }
};
