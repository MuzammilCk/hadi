import { IsEnum, IsString, IsOptional, MaxLength } from 'class-validator';

export class AdminReturnDecisionDto {
  @IsEnum(['approved', 'rejected', 'escalated', 'completed'])
  decision: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  note?: string;
}
