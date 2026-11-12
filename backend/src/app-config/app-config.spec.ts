import 'reflect-metadata';
import { readFileSync } from 'fs';
import { join } from 'path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CommonModule } from '../common/common.module';
import {
  OCR_MIN_TEXT_LENGTH_DEFAULT,
  OCR_MIN_TEXT_LENGTH_MAX,
  buildAppConfig,
  readOcrMinTextLength,
} from './app-config';

/**
 * Configuração entregue ao app (GET /config). A rota é montada pelo CommonModule de
 * verdade, sem banco. Não prova: o app lendo o valor num aparelho, nem a Vercel
 * aplicando uma variável de ambiente nova (isso exige novo deploy do servidor).
 */
describe('app-config', () => {
  const original = process.env.OCR_MIN_TEXT_LENGTH;

  afterEach(() => {
    if (original === undefined) delete process.env.OCR_MIN_TEXT_LENGTH;
    else process.env.OCR_MIN_TEXT_LENGTH = original;
  });

  describe('readOcrMinTextLength', () => {
    it('o padrão é 20 e o máximo aceito é 500', () => {
      expect(OCR_MIN_TEXT_LENGTH_DEFAULT).toBe(20);
      expect(OCR_MIN_TEXT_LENGTH_MAX).toBe(500);
    });

    it.each([
      ['20', 20],
      ['35', 35],
      ['1', 1],
      ['500', 500],
      [' 40 ', 40],
    ])('valor válido %p vira %p', (raw, expected) => {
      expect(readOcrMinTextLength(raw)).toBe(expected);
    });

    it('0 é aceito e desliga a pré-validação no app', () => {
      expect(readOcrMinTextLength('0')).toBe(0);
    });

    it.each([
      [undefined],
      [''],
      ['   '],
      ['abc'],
      ['12abc'],
      ['-1'],
      ['501'],
      ['1000000'],
      ['1.5'],
      ['NaN'],
      ['Infinity'],
      ['1e2x'],
    ])('valor inválido %p volta ao padrão de 20', (raw) => {
      expect(readOcrMinTextLength(raw)).toBe(20);
    });

    it('sem argumento, lê OCR_MIN_TEXT_LENGTH do ambiente a cada chamada', () => {
      process.env.OCR_MIN_TEXT_LENGTH = '33';
      expect(readOcrMinTextLength()).toBe(33);

      process.env.OCR_MIN_TEXT_LENGTH = 'lixo';
      expect(readOcrMinTextLength()).toBe(20);

      delete process.env.OCR_MIN_TEXT_LENGTH;
      expect(readOcrMinTextLength()).toBe(20);
    });
  });

  describe('buildAppConfig', () => {
    it('formato entregue ao app', () => {
      process.env.OCR_MIN_TEXT_LENGTH = '25';

      expect(buildAppConfig()).toEqual({ ocr: { minTextLength: 25 } });
    });
  });

  describe('GET /config (rota real montada pelo CommonModule)', () => {
    let app: INestApplication;

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [CommonModule],
      }).compile();
      app = moduleRef.createNestApplication();
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it('responde 200 sem autenticação, em JSON, com o padrão quando a variável não existe', async () => {
      delete process.env.OCR_MIN_TEXT_LENGTH;

      const response = await request(app.getHttpServer()).get('/config');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.body).toEqual({ ocr: { minTextLength: 20 } });
    });

    it('reflete o valor configurado, sem reiniciar o módulo', async () => {
      process.env.OCR_MIN_TEXT_LENGTH = '45';
      const first = await request(app.getHttpServer()).get('/config');

      process.env.OCR_MIN_TEXT_LENGTH = '0';
      const second = await request(app.getHttpServer()).get('/config');

      expect(first.body.ocr.minTextLength).toBe(45);
      expect(second.body.ocr.minTextLength).toBe(0);
    });

    it('valor inválido na variável: responde 200 com o padrão (nunca 500)', async () => {
      process.env.OCR_MIN_TEXT_LENGTH = '-7';

      const response = await request(app.getHttpServer()).get('/config');

      expect(response.status).toBe(200);
      expect(response.body.ocr.minTextLength).toBe(20);
    });

    it('só entrega o necessário: nenhum outro campo no corpo', async () => {
      const response = await request(app.getHttpServer()).get('/config');

      expect(Object.keys(response.body)).toEqual(['ocr']);
      expect(Object.keys(response.body.ocr)).toEqual(['minTextLength']);
    });
  });

  it('o AppModule continua importando o CommonModule (senão a rota /config some em silêncio)', () => {
    const source = readFileSync(join(__dirname, '..', 'app.module.ts'), 'utf8');

    expect(source).toMatch(/CommonModule,/);
  });
});
