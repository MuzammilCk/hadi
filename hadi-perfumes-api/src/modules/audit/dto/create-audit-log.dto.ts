import {
  IsString,
  IsOptional,
  IsUUID,
  IsObject,
} from 'class-validator';

export class CreateAuditLogDto {
  @IsUUID()
  @IsOptional()
  actor_id?: string | null;

  @IsString()
  action: string;

  @IsString()
  entity_type: string;

  @IsString()
  entity_id: string;

  @IsObject()
  @IsOptional()
  before_snapshot?: Record<string, any> | null;

  @IsObject()
  @IsOptional()
  after_snapshot?: Record<string, any> | null;

  @IsString()
  @IsOptional()
  ip_address?: string | null;

  @IsString()
  @IsOptional()
  user_agent?: string | null;
}
