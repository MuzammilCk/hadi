import { IsOptional, IsInt, Min, IsEnum, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import { FraudSignalStatus } from '../entities/fraud-signal.entity';

export class FraudSignalQueryDto {
  @IsOptional()
  @IsEnum(FraudSignalStatus)
  status?: FraudSignalStatus;

  @IsOptional()
  @IsUUID()
  user_id?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
