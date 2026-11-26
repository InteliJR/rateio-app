/**
 * Validação das credenciais do primeiro ADMIN criado pelo seed (requisitos 1.3 / 2.3).
 *
 * Recusa valores ausentes, placeholders no formato `<...>` (como os de um .env.example
 * copiado sem edição), e-mail inválido e senha curta. As mensagens citam só o nome da
 * variável, nunca o valor.
 */
export const MIN_SEED_PASSWORD_LENGTH = 12;

const PLACEHOLDER = /^<[^>]*>$/;
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export function validateSeedCredentials(input: {
  email?: string;
  password?: string;
}): string[] {
  const errors: string[] = [];
  const email = input.email?.trim() ?? '';
  const password = input.password ?? '';

  if (!email) errors.push('SEED_USER_EMAIL ausente');
  else if (PLACEHOLDER.test(email))
    errors.push('SEED_USER_EMAIL ainda é um placeholder (<...>)');
  else if (!EMAIL.test(email))
    errors.push('SEED_USER_EMAIL não é um e-mail válido');

  if (!password.trim()) errors.push('SEED_USER_PASSWORD ausente');
  else if (PLACEHOLDER.test(password.trim()))
    errors.push('SEED_USER_PASSWORD ainda é um placeholder (<...>)');
  else if (password.length < MIN_SEED_PASSWORD_LENGTH)
    errors.push(
      `SEED_USER_PASSWORD deve ter ao menos ${MIN_SEED_PASSWORD_LENGTH} caracteres`,
    );

  return errors;
}
