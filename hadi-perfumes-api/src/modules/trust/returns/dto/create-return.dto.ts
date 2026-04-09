import { IsUUID, IsEnum, IsString, IsOptional, MaxLength, IsArray, ValidateNested, IsInt, Min, Length } from 'class-validator';
import { Type } from 'class-transformer';
import { ReturnReasonCode } from '../entities/return-request.entity';

export class ReturnItemDto {
  @IsUUID()
  order_item_id: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsEnum(ReturnReasonCode)
  @IsOptional()
  reason_code?: ReturnReasonCode;
}

export class CreateReturnDto {
  @IsUUID()
  order_id: string;

  @IsEnum(ReturnReasonCode)
  reason_code: ReturnReasonCode;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  reason_detail?: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ReturnItemDto)
  items?: ReturnItemDto[];

  @IsString()
  @Length(8, 64)
  idempotency_key: string;
}
