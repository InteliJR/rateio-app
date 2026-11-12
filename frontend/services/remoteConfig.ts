import { logger } from "../lib/logger";

// Valor usado enquanto o servidor não respondeu, ou se a resposta for inválida.
// É o mesmo padrão do servidor (OCR_MIN_TEXT_LENGTH): sem calibração com fotos reais.
export const DEFAULT_MIN_TEXT_LENGTH = 20;

// Maior valor aceito (o mesmo limite do servidor)
export const MAX_MIN_TEXT_LENGTH = 500;

// Tempo máximo da busca. Nunca atrasa o fluxo da foto: a busca roda em segundo plano.
const FETCH_TIMEOUT_MS = 3000;

// Valor vindo do servidor; null = ainda não obtido (ou resposta inválida até agora)
let remoteMinTextLength: number | null = null;

// Evita buscas simultâneas
let inFlight: Promise<void> | null = null;

// Aceita só um inteiro de 0 a 500 (0 desliga a pré-validação). Qualquer outra coisa
// vira null e é ignorada: um servidor com defeito não pode quebrar nem travar o app.
export const parseMinTextLength = (value: unknown): number | null =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= 0 &&
  value <= MAX_MIN_TEXT_LENGTH
    ? value
    : null;

// Valor em uso agora: o do servidor, se já chegou; senão, o padrão. Síncrono, nunca
// espera rede.
export const getMinTextLength = (): number =>
  remoteMinTextLength ?? DEFAULT_MIN_TEXT_LENGTH;

// Busca a configuração do servidor em segundo plano. Nunca lança e nunca bloqueia:
// sem rede, com timeout, com erro HTTP ou com resposta inválida, o valor anterior
// (ou o padrão) continua valendo. Sem autenticação: a rota é pública.
export const refreshRemoteConfig = (baseUrl: string): Promise<void> => {
  if (!baseUrl) return Promise.resolve();
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(`${baseUrl}/config`, {
        signal: controller.signal,
      });
      if (!response.ok) return;

      const body: unknown = await response.json();
      const parsed = parseMinTextLength(
        (body as { ocr?: { minTextLength?: unknown } } | null)?.ocr
          ?.minTextLength,
      );
      if (parsed !== null) remoteMinTextLength = parsed;
    } catch {
      // Falha aberta: não registra o erro (só o fato de que usa o valor atual)
      logger.debug("Configuração remota indisponível, usando o valor atual");
    } finally {
      clearTimeout(timer);
      inFlight = null;
    }
  })();

  return inFlight;
};

// Só para teste: volta ao estado inicial
export const resetRemoteConfigForTests = (): void => {
  remoteMinTextLength = null;
  inFlight = null;
};
