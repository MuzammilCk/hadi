import { IsOptional, IsEnum, IsUUID, IsNumber, Min, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { ListingCondition, AuthenticityStatus, ListingStatus } from '../entities/listing.entity';

export class ListingSearchDto {
  @IsEnum(ListingStatus)
  @IsOptional()
  status?: ListingStatus;

  @IsEnum(ListingCondition)
  @IsOptional()
  condition?: ListingCondition;

  @IsEnum(AuthenticityStatus)
  @IsOptional()
  authenticity_status?: AuthenticityStatus;

  @IsUUID()
  @IsOptional()
  category_id?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  min_price?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  max_price?: number;

  @IsString()
  @IsOptional()
  q?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @IsOptional()
  limit?: number = 20;

  @IsUUID()
  @IsOptional()
  seller_id?: string;
}
