import { PartialType } from '@nestjs/mapped-types';
import { CreateFixedCostDto } from './create-fixed-cost.dto';

export class UpdateFixedCostDto extends PartialType(CreateFixedCostDto) {}
