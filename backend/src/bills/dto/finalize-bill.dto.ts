import { IsNumber, IsString } from 'class-validator';

export class FinalizeBillDto {
  @IsString({ each: true })
  divisions: string[];

  @IsNumber({})
  fees: number[];
}
