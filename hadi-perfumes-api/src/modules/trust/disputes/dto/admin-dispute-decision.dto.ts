import { IsEnum, IsString, IsOptional, MaxLength } from 'class-validator';
import { DisputeResolution } from '../entities/dispute.entity';

export class AdminDisputeDecisionDto {
  @IsEnum(DisputeResolution)
  resolution: DisputeResolution;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  note?: string;
}
