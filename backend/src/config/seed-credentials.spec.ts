import * as fc from 'fast-check';
import { validateSeedCredentials } from './seed-credentials';

describe('validateSeedCredentials (seed do primeiro ADMIN, 2.3)', () => {
  it('aceita e-mail válido e senha com 12+ caracteres', () => {
    expect(
      validateSeedCredentials({
        email: 'admin@rateio.app',
        password: 'Senha-Forte-2026!',
      }),
    ).toEqual([]);
  });

  it.each([
    ['ausentes', {}],
    ['vazios', { email: '', password: '' }],
    [
      'placeholders do .env.example antigo',
      {
        email: '<email-do-admin>',
        password: '<senha-forte-com-12+-caracteres>',
      },
    ],
  ])('recusa credenciais %s', (_label, input) => {
    const errors = validateSeedCredentials(input);
    expect(errors.some((e) => e.startsWith('SEED_USER_EMAIL'))).toBe(true);
    expect(errors.some((e) => e.startsWith('SEED_USER_PASSWORD'))).toBe(true);
  });

  it('recusa e-mail inválido e senha curta', () => {
    expect(
      validateSeedCredentials({
        email: 'admin',
        password: 'Senha-Forte-2026!',
      }),
    ).toEqual(['SEED_USER_EMAIL não é um e-mail válido']);
    expect(
      validateSeedCredentials({ email: 'a@b.com', password: 'curta' }),
    ).toEqual(['SEED_USER_PASSWORD deve ter ao menos 12 caracteres']);
  });

  it('nenhum placeholder <...> passa, qualquer que seja o tamanho, e o valor nunca aparece no erro', () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 12, maxLength: 60 })
          .filter((s) => !s.includes('>')),
        (inner) => {
          const value = `<${inner}>`;
          const errors = validateSeedCredentials({
            email: value,
            password: value,
          }).join(' | ');
          expect(errors).toMatch(/SEED_USER_EMAIL/);
          expect(errors).toMatch(/SEED_USER_PASSWORD/);
          if (inner.trim().length >= 4) expect(errors).not.toContain(inner);
        },
      ),
    );
  });
});
