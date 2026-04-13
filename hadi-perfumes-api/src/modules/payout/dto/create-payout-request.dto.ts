import {
  IsNumber,
  IsPositive,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
  IsIn,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Fix B7: Structured payout method validation.
 *
 * Previously payout_method was optional free-text. Bank transfers require
 * account_number + ifsc_code + account_name; UPI requires upi_id.
 * Without validation, payouts would be created with incomplete bank details,
 * causing manual intervention during settlement.
 */
export class PayoutMethodDto {
  @IsString()
  @IsIn(['bank_transfer', 'upi'])
  type: string;

  @ValidateIf((o) => o.type === 'bank_transfer')
  @IsString()
  @IsNotEmpty({ message: 'Account number is required for bank transfers' })
  account_number?: string;

  @ValidateIf((o) => o.type === 'bank_transfer')
  @IsString()
  @IsNotEmpty({ message: 'IFSC code is required for bank transfers' })
  ifsc_code?: string;

  @ValidateIf((o) => o.type === 'bank_transfer')
  @IsString()
  @IsNotEmpty({ message: 'Account holder name is required for bank transfers' })
  account_name?: string;

  @ValidateIf((o) => o.type === 'upi')
  @IsString()
  @IsNotEmpty({ message: 'UPI ID is required for UPI payouts' })
  upi_id?: string;
}

export class CreatePayoutRequestDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  @ValidateNested()
  @IsNotEmpty({ message: 'Payout method is required' })
  @Type(() => PayoutMethodDto)
  payout_method: PayoutMethodDto;
}
