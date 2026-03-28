import {
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  IsDateString,
  ValidateNested,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CommissionRuleDto {
  @IsNumber()
  @Min(1)
  level: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  percentage: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  min_order_value?: number;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  eligible_categories?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  eligible_seller_statuses?: string[];

  @IsNumber()
  @Min(0)
  @IsOptional()
  cap_per_order?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  payout_delay_days?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  clawback_window_days?: number;
}
