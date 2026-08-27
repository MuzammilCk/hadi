import { IsEnum, IsString, IsOptional, MaxLength } from 'class-validator';

export class AdminFraudReviewDto {
  @IsEnum(['actioned', 'false_positive'])
  verdict: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  note?: string;
}
