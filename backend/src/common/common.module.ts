// src/common/common.module.ts
import { Module, Global } from '@nestjs/common';
import { RolesGuard } from './guards/roles.guard';
import { AppConfigModule } from '../app-config/app-config.module';

@Global()
@Module({
  imports: [AppConfigModule],
  providers: [RolesGuard],
  exports: [RolesGuard],
})
export class CommonModule {}
