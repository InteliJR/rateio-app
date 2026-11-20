/**
 * Property 1: Bug Condition - C_config e C_hygiene (1.1, 1.2, 1.3, 1.30).
 *
 * Convenção da suíte:
 *  - `it`         → falha já corrigida: o teste codifica o comportamento esperado e passa.
 *                   Rodado na cópia de produção (origin/main), FALHA, o que prova que a
 *                   falha existia e que o teste a detecta.
 *  - `itPendingFix` (it.failing) → falha ainda presente: o Jest exige que o teste falhe. Quando a correção
 *                   entrar, ele passa a "falhar" (verde → vermelho) avisando que deve virar `it`.
 *
 * Contraexemplos observados na produção (origin/main) — causas raiz confirmadas:
 *  - 1.1 Sem JWT_SECRET/JWT_REFRESH_SECRET a API sobe e aceita um token ADMIN assinado com
 *        o literal 'your-secret-key-change-in-production' (GET /users → 200).
 *        Causa: fallback `process.env.JWT_SECRET || '<literal>'` em auth.module.ts e jwt.strategy.ts.
 *  - 1.2 Não existe validação de ambiente (src/config/env.schema.ts ausente).
 *  - 1.3 prisma/seed.ts e auth_tests.py contêm a senha 'Admin@123456'.
 *  - 1.30 (pendente) CI sem npm audit/secret scan e actions @v3.
 */
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import * as jwt from 'jsonwebtoken';
import { seedUser } from '../helpers/factories';
import { itPendingFix } from '../helpers/pending';

const BACKEND = join(__dirname, '..', '..');
const LITERAL_SECRET = 'your-secret-key-change-in-production';

describe('Bug condition: configuração e higiene', () => {
  it('1.1 sem segredos JWT a API recusa o boot ou rejeita token forjado com o literal', async () => {
    const saved = {
      JWT_SECRET: process.env.JWT_SECRET,
      JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
    };
    delete process.env.JWT_SECRET;
    delete process.env.JWT_REFRESH_SECRET;

    let outcome: { bootRefused: true } | { status: number } = {
      bootRefused: true,
    };
    try {
      await jest.isolateModulesAsync(async () => {
        // Módulos recarregados: a versão de produção lê o segredo no import
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { createTestApp } = require('../helpers/test-app');
        let t;
        try {
          t = await createTestApp();
        } catch {
          return; // boot recusado (comportamento esperado)
        }
        try {
          const admin = await seedUser(t.prisma, { role: 'ADMIN' });
          const forged = jwt.sign(
            { sub: admin.id, email: admin.email, role: 'ADMIN' },
            LITERAL_SECRET,
            { expiresIn: '15m' },
          );
          const res = await t
            .http('get', '/users')
            .set('Authorization', `Bearer ${forged}`);
          outcome = { status: res.status };
        } finally {
          await t.close();
        }
      });
    } finally {
      Object.assign(process.env, saved);
    }

    expect([{ bootRefused: true }, { status: 401 }]).toContainEqual(outcome);
  });

  it('1.2 existe validação de ambiente: parseEnv({}) lista só as variáveis JWT', () => {
    const schemaPath = join(BACKEND, 'src', 'config', 'env.schema.ts');
    expect(existsSync(schemaPath)).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { parseEnv } = require(schemaPath);
    let message = '';
    try {
      parseEnv({});
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('JWT_SECRET');
    expect(message).toContain('JWT_REFRESH_SECRET');
    expect(message).not.toMatch(/PASSWORD_PEPPER|SMTP|AWS_S3|METRICS_TOKEN/);
  });

  it.each(['prisma/seed.ts', 'auth_tests.py'])(
    '1.3 %s não contém a senha padrão de ADMIN',
    (file) => {
      expect(readFileSync(join(BACKEND, file), 'utf8')).not.toContain(
        'Admin@123456',
      );
    },
  );

  itPendingFix(
    '1.30 CI executa npm audit e secret scan, sem actions @v3',
    () => {
      const dir = join(BACKEND, '..', '.github', 'workflows');
      const workflows = readdirSync(dir)
        .filter((f) => /\.ya?ml$/.test(f))
        .map((f) => readFileSync(join(dir, f), 'utf8'))
        .join('\n');
      expect(workflows).toMatch(/npm audit/);
      expect(workflows).toMatch(/gitleaks|trufflehog|secret/i);
      expect(workflows).not.toMatch(/@v3\b/);
    },
  );
});
