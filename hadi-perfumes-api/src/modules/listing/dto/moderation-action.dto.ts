import { IsString, IsOptional, MinLength } from 'class-validator';

export class ModerationActionDto {
  @IsString()
  @IsOptional()
  @MinLength(5)
  reason?: string;

  @IsString()
  @IsOptional()
  evidence?: string;
}
