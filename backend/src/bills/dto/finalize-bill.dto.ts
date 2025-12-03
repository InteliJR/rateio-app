import { Division, Fee } from '@prisma/client';
export class FinalizeBillDto {
  divisions: Division[];

  fees: Fee[];
}
