import {
  IsString,
  IsNumber,
  IsPositive,
  Min,
  IsEnum,
  IsOptional,
  IsUUID,
  Equals,
  IsInt,
  IsBoolean,
} from 'class-validator';
import {
  ListingCondition,
  AuthenticityStatus,
  ListingStatus,
} from '../entities/listing.entity';

export class UpdateListingDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  sku?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @IsOptional()
  price?: number;

  @IsString()
  @Equals('INR', { message: 'Currency must be INR' })
  @IsOptional()
  currency?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  quantity?: number;

  @IsInt()
  @Min(10)
  @IsOptional()
  intensity?: number;

  @IsEnum(ListingCondition)
  @IsOptional()
  condition?: ListingCondition;

  @IsEnum(AuthenticityStatus)
  @IsOptional()
  authenticity_status?: AuthenticityStatus;

  @IsEnum(ListingStatus)
  @IsOptional()
  status?: ListingStatus;

  @IsUUID()
  @IsOptional()
  category_id?: string;

  @IsBoolean()
  @IsOptional()
  requires_approval?: boolean;
}
