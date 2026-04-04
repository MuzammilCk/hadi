import { IsNumber, IsPositive, IsOptional, IsString, ValidateNested, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class PayoutMethodDto {
  @IsString() @IsIn(['bank_transfer', 'upi']) type: string;
  @IsString() @IsOptional() account_number?: string;
  @IsString() @IsOptional() ifsc_code?: string;
  @IsString() @IsOptional() account_name?: string;
  @IsString() @IsOptional() upi_id?: string;
}

export class CreatePayoutRequestDto {
  @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() amount: number;
  @ValidateNested() @IsOptional() @Type(() => PayoutMethodDto) payout_method?: PayoutMethodDto;
}
