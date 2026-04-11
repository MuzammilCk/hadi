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

  @IsString({ each: true })
  @IsOptional()
  media_keys?: string[];
}
