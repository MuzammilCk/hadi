import { IsOptional, IsUUID } from 'class-validator';

export class RecalculateQualificationDto {
  @IsOptional()
  @IsUUID()
  targetUserId?: string;

  @IsUUID()
  policyVersionId: string;
}
