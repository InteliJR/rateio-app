import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      datasources: {
        db: {
          url: PrismaService.getDatabaseUrl(),
        },
      },
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('Database connected successfully');
    } catch (error) {
      this.logger.error('Failed to connect to database', error);
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Database disconnected');
  }

  private static getDatabaseUrl(): string | undefined {
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      return undefined;
    }

    try {
      const parsedUrl = new URL(databaseUrl);
      const isSupabasePooler = parsedUrl.hostname.includes('pooler.supabase.com');
      const usesTransactionPooler = parsedUrl.port === '6543';

      if (isSupabasePooler && usesTransactionPooler) {
        if (!parsedUrl.searchParams.has('pgbouncer')) {
          parsedUrl.searchParams.set('pgbouncer', 'true');
        }

        if (!parsedUrl.searchParams.has('connection_limit')) {
          parsedUrl.searchParams.set('connection_limit', '1');
        }

        if (!parsedUrl.searchParams.has('pool_timeout')) {
          parsedUrl.searchParams.set('pool_timeout', '20');
        }

        if (!parsedUrl.searchParams.has('connect_timeout')) {
          parsedUrl.searchParams.set('connect_timeout', '15');
        }
      }

      return parsedUrl.toString();
    } catch {
      return databaseUrl;
    }
  }
}
