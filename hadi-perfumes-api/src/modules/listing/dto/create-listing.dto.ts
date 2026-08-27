import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  Min,
  IsEnum,
  IsOptional,
  IsUUID,
  Equals,
  IsInt,
  IsBoolean,
  IsArray,
} from 'class-validator';
import {
  ListingCondition,
  AuthenticityStatus,
  ListingStatus,
} from '../entities/listing.entity';

export class CreateListingDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsNotEmpty()
  sku: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  price: number;

  @IsString()
  @Equals('INR', { message: 'Currency must be INR' })
  currency: string;

  @IsInt()
  @Min(0)
  quantity: number;

  @IsInt()
  @Min(10)
  @IsOptional()
  intensity?: number;

  @IsEnum(ListingCondition)
  @IsOptional()
  condition?: ListingCondition = ListingCondition.NEW;

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

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  media_keys?: string[];
}
