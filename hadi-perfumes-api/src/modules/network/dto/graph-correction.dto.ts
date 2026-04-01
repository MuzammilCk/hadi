import { IsUUID, IsString, MinLength } from 'class-validator';

export class GraphCorrectionDto {
  @IsUUID()
  userId: string;

  @IsUUID()
  newSponsorId: string;

  @IsString()
  @MinLength(10)
  reason: string;
}
