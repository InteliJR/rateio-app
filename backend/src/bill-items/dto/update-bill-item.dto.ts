import { PartialType } from '@nestjs/mapped-types';
import { CreateBillItemDto } from './create-bill-item.dto';

export class UpdateBillItemDto extends PartialType(CreateBillItemDto) {}
