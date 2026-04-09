import { IsOptional, IsInt, Min, IsEnum, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import { ModerationTargetType } from '../entities/moderation-action.entity';

export class ModerationQueryDto {
  @IsOptional()
  @IsEnum(ModerationTargetType)
  target_type?: ModerationTargetType;

  @IsOptional()
  @IsUUID()
  target_id?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
