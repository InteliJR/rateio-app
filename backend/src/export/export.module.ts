import { Module } from '@nestjs/common';
import { ExportService } from './export.service';

@Module({
  providers: [ExportService]
})
export class ExportModule {}
