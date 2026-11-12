/**
 * `itPendingFix`: caso de bug condition cuja correção ainda não foi implementada.
 *
 * Padrão: `it.failing` — o Jest exige que o teste falhe (a falha de segurança existe) e
 * mantém a suíte verde. Quando a correção entrar, o teste passa a "falhar" e deve virar `it`.
 *
 * BUG_CONDITION_STRICT=1 roda esses casos como `it` normal, mostrando o motivo exato de
 * cada falha (útil para confirmar que falham pela causa raiz, e não por erro de montagem).
 */
export const itPendingFix: jest.It =
  process.env.BUG_CONDITION_STRICT === '1'
    ? it
    : (it.failing as unknown as jest.It);
