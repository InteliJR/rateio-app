import { Controller, Get } from '@nestjs/common';
import { buildAppConfig } from './app-config';
import type { AppConfig } from './app-config';

/**
 * Configuração pública do app. Sem autenticação de propósito: não há nada sensível
 * aqui (só números de comportamento) e o app a lê antes de qualquer ação do usuário.
 * Continua sob o limite de requisições global.
 */
@Controller('config')
export class AppConfigController {
  @Get()
  getConfig(): AppConfig {
    return buildAppConfig();
  }
}
