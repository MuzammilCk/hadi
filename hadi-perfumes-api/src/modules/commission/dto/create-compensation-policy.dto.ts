import {
  IsString,
  IsOptional,
  IsArray,
  IsDateString,
  ValidateNested,
  Min,
  IsNumber,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CommissionRuleDto } from './commission-rule.dto';

export class RankRuleDto {
  @IsNumber()
  @Min(1)
  rank_level: number;

  @IsString()
  rank_name: string;

  @IsNumber()
  @Min(0)
  personal_sales_volume_requirement: number;

  @IsNumber()
  @Min(0)
  downline_sales_volume_requirement: number;

  @IsNumber()
  @Min(0)
  active_legs_requirement: number;
}

export class ComplianceDisclosureDto {
  @IsString()
  disclosure_key: string;

  @IsString()
  disclosure_text: string;

  @IsBoolean()
  @IsOptional()
  is_mandatory?: boolean;
}

export class AllowedEarningsClaimDto {
  @IsString()
  claim_text: string;

  @IsString()
  @IsOptional()
  context?: string;
}

export class CreateCompensationPolicyDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsDateString()
  @IsOptional()
  effective_from?: Date;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CommissionRuleDto)
  commission_rules: CommissionRuleDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RankRuleDto)
  @IsOptional()
  rank_rules?: RankRuleDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ComplianceDisclosureDto)
  @IsOptional()
  compliance_disclosures?: ComplianceDisclosureDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AllowedEarningsClaimDto)
  @IsOptional()
  allowed_earnings_claims?: AllowedEarningsClaimDto[];
}
