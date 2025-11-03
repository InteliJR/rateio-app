import { PartialType } from '@nestjs/mapped-types';
import { CreateFreightDto } from './create-freight.dto';

export class UpdateFreightDto extends PartialType(CreateFreightDto) {}
