/**
 * Configuração que o app lê do servidor em vez de trazer fixa no código, para poder
 * ser ajustada sem publicar o app de novo.
 *
 * Hoje só há um valor: o mínimo de caracteres reconhecidos pelo ML Kit para a foto da
 * conta ser considerada legível (pré-validação no aparelho). É um ponto de partida
 * SEM calibração: o número ainda precisa ser conferido com fotos reais.
 */

/** Valor usado quando OCR_MIN_TEXT_LENGTH não está definida ou é inválida. */
export const OCR_MIN_TEXT_LENGTH_DEFAULT = 20;
/** Maior valor aceito: acima disso a foto de uma nota comum nunca passaria. */
export const OCR_MIN_TEXT_LENGTH_MAX = 500;

/**
 * Lê OCR_MIN_TEXT_LENGTH. Aceita um inteiro de 0 a 500; qualquer outra coisa (ausente,
 * vazio, texto, decimal, negativo, acima do máximo) volta ao padrão, nunca quebra.
 *
 * O valor 0 DESLIGA a pré-validação no app (toda foto segue para o servidor): é o
 * interruptor para o caso de o filtro estar barrando fotos boas.
 */
export function readOcrMinTextLength(
  raw: string | undefined = process.env.OCR_MIN_TEXT_LENGTH,
): number {
  if (raw === undefined || raw.trim() === '') {
    return OCR_MIN_TEXT_LENGTH_DEFAULT;
  }

  const value = Number(raw);

  return Number.isInteger(value) &&
    value >= 0 &&
    value <= OCR_MIN_TEXT_LENGTH_MAX
    ? value
    : OCR_MIN_TEXT_LENGTH_DEFAULT;
}

export interface AppConfig {
  ocr: {
    /** Mínimo de caracteres (sem espaços) para a foto ser considerada legível; 0 = desligado */
    minTextLength: number;
  };
}

/** Configuração entregue ao app. Lida a cada chamada, sem estado. */
export function buildAppConfig(): AppConfig {
  return { ocr: { minTextLength: readOcrMinTextLength() } };
}
