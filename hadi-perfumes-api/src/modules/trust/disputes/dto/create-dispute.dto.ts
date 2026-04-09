import { IsUUID, IsEnum, IsString, IsOptional, MaxLength, Length } from 'class-validator';
import { DisputeReasonCode } from '../entities/dispute.entity';

export class CreateDisputeDto {
  @IsUUID()
  order_id: string;

  @IsEnum(DisputeReasonCode)
  reason_code: DisputeReasonCode;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  reason_detail?: string;

  @IsUUID()
  @IsOptional()
  return_request_id?: string;

  @IsString()
  @Length(8, 64)
  idempotency_key: string;
}
