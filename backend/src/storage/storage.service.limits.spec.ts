import 'reflect-metadata';
import { readFileSync } from 'fs';
import { join } from 'path';
import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BillsService } from '../bills/bills.service';
import { PresignedUploadDto } from '../bills/dto/presigned-upload.dto';
import { StorageService } from './storage.service';

/**
 * Limites e validações de imagem no servidor.
 *
 * Testes marcados com [CARACTERIZAÇÃO] registram o comportamento ATUAL, inclusive
 * lacunas conhecidas. Eles NÃO endossam esse comportamento: se um deles quebrar
 * porque a lacuna foi corrigida, atualize o teste de propósito. Cada lacuna
 * conhecida tem de ter um item de backlog (issue); ao corrigir uma, feche o item.
 *
 * O QUE ESTES TESTES PROVAM: o que os validadores e a assinatura da URL fazem com
 * entradas de fronteira, sem rede, sem S3 e sem banco (a assinatura é local, com
 * credenciais FALSAS).
 *
 * O QUE NÃO PROVAM: o que o S3 real faz com a URL assinada (inclusive o parâmetro
 * de checksum que o SDK coloca na URL), os 4,5 MB da Vercel, o Multer em uma
 * requisição real, nem nada sobre fotos reais. Isso exige ambiente real e fica
 * pendente.
 */
describe('StorageService: limites e validações de imagem', () => {
  const MB = 1024 * 1024;
  const USER = 'user-1';
  const envNames = [
    'AWS_S3_BUCKET',
    'AWS_S3_REGION',
    'AWS_S3_ACCESS_KEY',
    'AWS_S3_SECRET_KEY',
    'AWS_S3_PUBLIC_BASE_URL',
    'PUBLIC_BASE_URL',
  ] as const;
  const savedEnv: Record<string, string | undefined> = {};

  let storage: StorageService;

  beforeAll(() => {
    envNames.forEach((name) => {
      savedEnv[name] = process.env[name];
    });
    // Credenciais FALSAS: a assinatura é calculada localmente, sem rede
    process.env.AWS_S3_BUCKET = 'bucket-de-teste';
    process.env.AWS_S3_REGION = 'us-east-1';
    process.env.AWS_S3_ACCESS_KEY = 'chave-de-teste';
    process.env.AWS_S3_SECRET_KEY = 'segredo-falso-de-teste';
    delete process.env.AWS_S3_PUBLIC_BASE_URL;
    delete process.env.PUBLIC_BASE_URL;
    storage = new StorageService();
  });

  afterAll(() => {
    envNames.forEach((name) => {
      if (savedEnv[name] === undefined) delete process.env[name];
      else process.env[name] = savedEnv[name];
    });
  });

  describe('validateFileSize (limite do servidor: 10 MB)', () => {
    it.each([
      [0, true],
      [1, true],
      [10 * MB - 1, true],
      [10 * MB, true], // fronteira: 10 MiB exatos ainda passa
      [10 * MB + 1, false], // 1 byte além
      [10_000_000, true], // 10 MB decimais ficam abaixo de 10 MiB
      [11 * MB, false],
      [Number.POSITIVE_INFINITY, false],
      [Number.NaN, false],
    ])('tamanho %p bytes: %p', (size, expected) => {
      expect(storage.validateFileSize(size)).toBe(expected);
    });

    it('[CARACTERIZAÇÃO] tamanho negativo passa (só compara com o teto, não exige valor válido)', () => {
      expect(storage.validateFileSize(-1)).toBe(true);
    });

    it('o teto do servidor (10 MiB) é o dobro do limite do app (5 MB) e do multipart morto (5 MiB)', () => {
      expect(storage.validateFileSize(5 * MB + 1)).toBe(true);
      expect(storage.getMulterOptions().limits.fileSize).toBe(5 * MB);
    });
  });

  describe('validateFileType', () => {
    it.each([
      ['image/jpeg'],
      ['image/jpg'],
      ['image/png'],
      ['image/webp'],
      ['image/gif'],
    ])('aceita %s', (mimetype) => {
      expect(storage.validateFileType(mimetype)).toBe(true);
    });

    it.each([
      ['image/heic'],
      ['image/heif'],
      ['image/svg+xml'],
      ['image/bmp'],
      ['image/tiff'],
      ['image/pjpeg'],
      ['application/pdf'],
      ['text/plain'],
      ['IMAGE/JPEG'],
      ['image/jpeg; charset=binary'],
      [' image/jpeg'],
      [''],
    ])('rejeita %p', (mimetype) => {
      expect(storage.validateFileType(mimetype)).toBe(false);
    });

    it('[CARACTERIZAÇÃO] aceita image/gif sem saber se é animado (a OpenAI só aceita GIF não animado)', () => {
      expect(storage.validateFileType('image/gif')).toBe(true);
    });

    // O validador só recebe a string do MIME declarado: o conteúdo do arquivo nunca é
    // lido. A prova por comportamento (um arquivo que não é imagem passa se declarar
    // image/png) está no describe de BillsService, mais abaixo.
  });

  describe('isOwnedObjectKey', () => {
    const owned = (key: string, folder = 'bills', user = USER) =>
      storage.isOwnedObjectKey(key, folder, user);

    it.each([
      ['bills/user-1/foto.jpg'],
      ['bills/user-1/3f6c1a52-0d1e-4b7e-9a2f-5d6f7a8b9c01.png'],
    ])('aceita a chave do próprio usuário: %s', (key) => {
      expect(owned(key)).toBe(true);
    });

    it.each([
      ['bills/user-2/foto.jpg', 'outro usuário'],
      [
        'bills/user-10/foto.jpg',
        'usuário com o mesmo começo (user-1 × user-10)',
      ],
      ['bills/user-1', 'sem a barra final do prefixo'],
      ['bills/user-1foto.jpg', 'sem a barra entre o usuário e o arquivo'],
      ['avatars/user-1/foto.jpg', 'outra pasta'],
      ['Bills/user-1/foto.jpg', 'maiúsculas (a comparação diferencia caixa)'],
      ['/bills/user-1/foto.jpg', 'barra inicial'],
      ['', 'chave vazia'],
    ])('rejeita %p (%s)', (key) => {
      expect(owned(key)).toBe(false);
    });

    it.each([
      ['bills/user-1/../user-2/foto.jpg'],
      ['bills/user-1/..'],
      ['bills/user-1/../../x'],
      ['bills/user-1/..\\user-2/foto.jpg'],
    ])('rejeita travessia com ..: %s', (key) => {
      expect(owned(key)).toBe(false);
    });

    it('rejeita qualquer ocorrência de .. , até dentro de um nome de arquivo legítimo', () => {
      expect(owned('bills/user-1/foto..final.jpg')).toBe(false);
    });

    it('um ponto só não é travessia', () => {
      expect(owned('bills/user-1/./foto.jpg')).toBe(true);
      expect(owned('bills/user-1/foto.final.jpg')).toBe(true);
    });

    it('[CARACTERIZAÇÃO] só confere o prefixo: extensão e tipo do arquivo não são verificados', () => {
      expect(owned('bills/user-1/documento.exe')).toBe(true);
      expect(owned('bills/user-1/sem-extensao')).toBe(true);
      expect(owned('bills/user-1/a/b/c/d.txt')).toBe(true);
    });

    it('[CARACTERIZAÇÃO] a própria pasta do usuário, sem nome de arquivo, é aceita como chave', () => {
      expect(owned('bills/user-1/')).toBe(true);
    });

    it('[CARACTERIZAÇÃO] não decodifica a chave: %2e%2e não é tratado como travessia', () => {
      expect(owned('bills/user-1/%2e%2e/user-2/foto.jpg')).toBe(true);
    });

    it('[CARACTERIZAÇÃO] não confere se o objeto existe: é uma função síncrona que nunca chama o S3', () => {
      const send = jest.spyOn((storage as any).s3Client, 'send');

      const result = owned('bills/user-1/nunca-foi-enviada.jpg');

      expect(result).toBe(true);
      expect(send).not.toHaveBeenCalled();
      send.mockRestore();
    });
  });

  describe('URL assinada de upload (PUT direto ao S3)', () => {
    const presign = async (filename = 'foto.jpg', mimetype = 'image/jpeg') => {
      const result = await storage.createPresignedUploadUrl(
        'bills',
        USER,
        filename,
        mimetype,
      );
      return { ...result, url: new URL(result.uploadUrl) };
    };

    it('devolve uma chave do próprio usuário, validade de 600 s e o Content-Type pedido', async () => {
      const result = await presign();

      expect(result.key).toMatch(/^bills\/user-1\/[0-9a-f-]{36}\.jpg$/);
      expect(storage.isOwnedObjectKey(result.key, 'bills', USER)).toBe(true);
      expect(result.expiresIn).toBe(600);
      expect(result.url.searchParams.get('X-Amz-Expires')).toBe('600');
      expect(result.headers).toEqual({ 'Content-Type': 'image/jpeg' });
    });

    it('recusa tipo fora da lista (HEIC, PDF) antes de assinar', async () => {
      await expect(presign('foto.heic', 'image/heic')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(presign('nota.pdf', 'application/pdf')).rejects.toThrow(
        'Tipo de arquivo nao suportado para upload.',
      );
    });

    it('o nome da chave nunca contém o nome enviado pelo cliente', async () => {
      const result = await presign('../../etc/passwd', 'image/png');

      expect(result.key).not.toContain('passwd');
      expect(result.key).not.toContain('..');
      expect(result.key).toMatch(/^bills\/user-1\/[0-9a-f-]{36}\.png$/);
    });

    it.each([
      ['foto.JPEG', 'image/jpeg', 'jpg'],
      ['foto.PNG', 'image/png', 'png'],
      ['foto.com espaço', 'image/png', 'png'],
    ])('extensão da chave para %p com %p: %p', async (filename, mime, ext) => {
      expect((await presign(filename, mime)).key.endsWith(`.${ext}`)).toBe(
        true,
      );
    });

    it('[CARACTERIZAÇÃO] nome sem ponto vira a própria extensão da chave (o tipo declarado é ignorado)', async () => {
      const result = await presign('foto', 'image/webp');

      expect(result.key.endsWith('.foto')).toBe(true);
    });

    it('[CARACTERIZAÇÃO] a extensão vem do nome enviado e pode contradizer o tipo declarado', async () => {
      const result = await presign('arquivo.exe', 'image/jpeg');

      expect(result.key.endsWith('.exe')).toBe(true);
      expect(result.headers['Content-Type']).toBe('image/jpeg');
    });

    it('[CARACTERIZAÇÃO] o PUT assinado não limita tamanho: só o cabeçalho host é assinado', async () => {
      const { url } = await presign();

      // Sem content-length-range (isso só existe em POST assinado) e sem
      // content-length entre os cabeçalhos assinados: qualquer tamanho sobe.
      expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
      expect(url.searchParams.get('X-Amz-Content-Sha256')).toBe(
        'UNSIGNED-PAYLOAD',
      );
      expect(url.searchParams.has('content-length-range')).toBe(false);
    });

    it('[CARACTERIZAÇÃO] o Content-Type também não é assinado: o cliente pode enviar outro tipo no PUT', async () => {
      const { url } = await presign('foto.jpg', 'image/jpeg');

      expect(url.searchParams.get('X-Amz-SignedHeaders')).not.toContain(
        'content-type',
      );
    });

    it('[CARACTERIZAÇÃO] a URL carrega um parâmetro de checksum calculado para corpo VAZIO', async () => {
      const { url } = await presign();

      // CRC32 de zero bytes. Se o S3 aplica esse valor ao corpo real do PUT é
      // A CONFIRMAR com um upload real (não dá para provar sem rede).
      expect(url.searchParams.get('x-amz-checksum-crc32')).toBe('AAAAAA==');
      expect(url.searchParams.get('x-amz-sdk-checksum-algorithm')).toBe(
        'CRC32',
      );
    });

    it('a URL de leitura (GET) usada pelo OCR vale 3600 s e assina só o host', async () => {
      const url = new URL(await storage.getSignedUrl('bills/user-1/x.jpg'));

      expect(url.searchParams.get('X-Amz-Expires')).toBe('3600');
      expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
    });
  });

  describe('getMulterOptions (código sem uso)', () => {
    it('[CARACTERIZAÇÃO] define 5 MiB e filtro de tipo, mas nenhuma rota o usa', () => {
      const options = storage.getMulterOptions();
      const accepted: boolean[] = [];
      const fileFilter = (mimetype: string) =>
        options.fileFilter(
          {} as any,
          { mimetype } as any,
          (error: Error | null, ok?: boolean) =>
            accepted.push(error === null && ok === true),
        );

      ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].forEach(
        fileFilter,
      );
      ['image/heic', 'application/pdf'].forEach(fileFilter);

      expect(options.limits.fileSize).toBe(5 * MB);
      expect(accepted).toEqual([true, true, true, true, false, false]);
    });

    it('[CARACTERIZAÇÃO] nenhum arquivo fora do próprio StorageService chama getMulterOptions', () => {
      const root = join(__dirname, '..');
      const sources = [
        'bills/bills.controller.ts',
        'bills/bills.service.ts',
        'users/users.controller.ts',
        'app.module.ts',
      ].map((file) => readFileSync(join(root, file), 'utf8'));

      sources.forEach((source) => {
        expect(source).not.toContain('getMulterOptions');
      });
    });

    it('[CARACTERIZAÇÃO] as rotas de imagem da conta usam FileInterceptor("image") sem nenhuma opção de limite', () => {
      const controller = readFileSync(
        join(__dirname, '..', 'bills/bills.controller.ts'),
        'utf8',
      );

      expect(controller.match(/FileInterceptor\('image'\)/g)).toHaveLength(2);
      expect(controller).not.toMatch(/FileInterceptor\('image',/);
    });
  });
});

describe('PresignedUploadDto (regex do tipo e nome livre)', () => {
  const check = async (data: Record<string, unknown>) =>
    validate(plainToInstance(PresignedUploadDto, data));

  it.each([
    ['image/jpeg'],
    ['image/jpg'],
    ['image/png'],
    ['image/webp'],
    ['image/gif'],
  ])('aceita mimeType %s', async (mimeType) => {
    expect(await check({ filename: 'foto.jpg', mimeType })).toHaveLength(0);
  });

  it.each([
    ['image/heic'],
    ['image/heif'],
    ['image/svg+xml'],
    ['image/bmp'],
    ['IMAGE/JPEG'],
    ['image/jpegx'],
    ['ximage/jpeg'],
    ['image/jpeg '],
    ['image/jpeg\n'],
    ['image/'],
    ['application/pdf'],
    [''],
  ])('rejeita mimeType %p', async (mimeType) => {
    const errors = await check({ filename: 'foto.jpg', mimeType });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('mimeType');
  });

  it('exige que filename e mimeType sejam texto', async () => {
    expect(await check({ filename: 1, mimeType: 'image/png' })).toHaveLength(1);
    expect(await check({ filename: 'a.png', mimeType: 5 })).not.toHaveLength(0);
    expect(await check({})).toHaveLength(2);
  });

  it('[CARACTERIZAÇÃO] filename aceita qualquer texto: vazio, com travessia ou muito longo', async () => {
    for (const filename of ['', '../../x', 'a'.repeat(5000)]) {
      expect(await check({ filename, mimeType: 'image/png' })).toHaveLength(0);
    }
  });
});

describe('BillsService: onde os limites são aplicados (sem banco, sem S3)', () => {
  const USER = 'user-1';
  const MB = 1024 * 1024;
  const savedEnv: Record<string, string | undefined> = {};
  const envNames = [
    'AWS_S3_BUCKET',
    'AWS_S3_REGION',
    'AWS_S3_ACCESS_KEY',
    'AWS_S3_SECRET_KEY',
    'VERCEL',
  ];

  let storage: StorageService;
  let prisma: { bill: { create: jest.Mock } };
  let queue: { enqueue: jest.Mock };
  let service: BillsService;

  beforeAll(() => {
    envNames.forEach((name) => {
      savedEnv[name] = process.env[name];
    });
    process.env.AWS_S3_BUCKET = 'bucket-de-teste';
    process.env.AWS_S3_REGION = 'us-east-1';
    process.env.AWS_S3_ACCESS_KEY = 'chave-de-teste';
    process.env.AWS_S3_SECRET_KEY = 'segredo-falso-de-teste';
    // Na Vercel o processamento é disparado por cron: o teste não dispara a fila
    process.env.VERCEL = '1';
  });

  afterAll(() => {
    envNames.forEach((name) => {
      if (savedEnv[name] === undefined) delete process.env[name];
      else process.env[name] = savedEnv[name];
    });
  });

  beforeEach(() => {
    storage = new StorageService();
    prisma = {
      bill: {
        create: jest.fn(async ({ data }: any) => ({ id: 'bill-1', ...data })),
      },
    };
    queue = { enqueue: jest.fn(async () => ({ enqueued: true })) };
    const Ctor = BillsService as unknown as new (
      ...args: unknown[]
    ) => BillsService;
    service = new Ctor(prisma, storage, queue, {});
  });

  const file = (size: number, mimetype = 'image/jpeg') =>
    ({ size, mimetype, buffer: Buffer.alloc(0) }) as Express.Multer.File;

  it('multipart acima de 10 MiB: 400 "Tamanho máximo: 10MB", sem upload, sem conta e sem job', async () => {
    const upload = jest.spyOn(storage, 'uploadFile');

    await expect(
      service.create(file(10 * MB + 1), USER, {} as any),
    ).rejects.toThrow('Tamanho máximo: 10MB');

    expect(upload).not.toHaveBeenCalled();
    expect(prisma.bill.create).not.toHaveBeenCalled();
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('[CARACTERIZAÇÃO] a validação de tamanho recebe um arquivo que o Multer já carregou inteiro na memória', async () => {
    // O serviço só enxerga o objeto Express.Multer.File (com buffer). Não existe
    // recusa antes disso: o limite de 10 MiB é conferido depois do upload HTTP.
    const sizeCheck = jest.spyOn(storage, 'validateFileSize');
    const big = file(11 * MB);

    await expect(service.create(big, USER, {} as any)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(sizeCheck).toHaveBeenCalledWith(big.size);
    expect(Buffer.isBuffer(big.buffer)).toBe(true);
  });

  it('multipart com tipo fora da lista: 400 antes do upload', async () => {
    const upload = jest.spyOn(storage, 'uploadFile');

    await expect(
      service.create(file(1000, 'image/heic'), USER, {} as any),
    ).rejects.toThrow('Apenas imagens são permitidas');

    expect(upload).not.toHaveBeenCalled();
    expect(prisma.bill.create).not.toHaveBeenCalled();
  });

  it('multipart de 5 MiB + 1 a 10 MiB passa na validação do servidor (o limite de 5 MB é do app)', async () => {
    jest
      .spyOn(storage, 'uploadFile')
      .mockResolvedValue({ key: 'bills/x.jpg', url: 'https://img.test/x.jpg' });

    await service.create(file(8 * MB), USER, {} as any);

    expect(prisma.bill.create).toHaveBeenCalledTimes(1);
    expect(queue.enqueue).toHaveBeenCalledTimes(1);
  });

  it('[CARACTERIZAÇÃO] só o tipo declarado vale: um arquivo cujo conteúdo não é imagem passa se declarar image/png', async () => {
    jest
      .spyOn(storage, 'uploadFile')
      .mockResolvedValue({ key: 'bills/x.png', url: 'https://img.test/x.png' });
    const buffer = Buffer.from('isto não é uma imagem');
    const notAnImage = {
      size: buffer.length,
      mimetype: 'image/png',
      buffer,
    } as Express.Multer.File;

    await service.create(notAnImage, USER, {} as any);

    expect(prisma.bill.create).toHaveBeenCalledTimes(1);
    expect(queue.enqueue).toHaveBeenCalledTimes(1);
  });

  it('chave de outro usuário no caminho presigned: 400, sem conta e sem job', async () => {
    await expect(
      service.create(undefined, USER, {
        imageKey: 'bills/user-2/foto.jpg',
      } as any),
    ).rejects.toThrow('Chave de imagem invalida para este usuario.');

    expect(prisma.bill.create).not.toHaveBeenCalled();
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('[CARACTERIZAÇÃO] caminho presigned: chave do próprio usuário que NUNCA foi enviada ao S3 cria conta e job', async () => {
    const send = jest.spyOn((storage as any).s3Client, 'send');

    const created: any = await service.create(undefined, USER, {
      imageKey: 'bills/user-1/nunca-foi-enviada.jpg',
    } as any);

    // Nenhuma consulta ao S3 (existência, tamanho ou tipo): a conta nasce em
    // PENDING_OCR e o job é enfileirado. A falha só aparece na leitura.
    expect(send).not.toHaveBeenCalled();
    expect(prisma.bill.create).toHaveBeenCalledTimes(1);
    expect(created.status).toBe('PENDING_OCR');
    expect(queue.enqueue).toHaveBeenCalledWith('bill-1', USER);
  });
});
