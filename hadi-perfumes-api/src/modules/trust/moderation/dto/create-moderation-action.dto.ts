import {
  IsEnum,
  IsUUID,
  IsString,
  IsOptional,
  IsDateString,
  MinLength,
  MaxLength,
  Length,
} from 'class-validator';
import {
  ModerationTargetType,
  ModerationActionType,
} from '../entities/moderation-action.entity';

export class CreateModerationActionDto {
  @IsEnum(ModerationTargetType)
  target_type: ModerationTargetType;

  @IsUUID()
  target_id: string;

  @IsEnum(ModerationActionType)
  action_type: ModerationActionType;

  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  reason: string;

  @IsDateString()
  @IsOptional()
  expires_at?: string;

  @IsString()
  @Length(8, 64)
  idempotency_key: string;
}
