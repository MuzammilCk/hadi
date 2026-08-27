import {
  IsString,
  IsOptional,
  IsBoolean,
  IsObject,
  IsArray,
  IsUUID,
  IsInt,
  Min,
} from 'class-validator';

export class UpsertSectionDto {
  @IsObject()
  content: Record<string, any>;

  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  media_ids?: string[];

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;

  @IsInt()
  @Min(0)
  @IsOptional()
  sort_order?: number;
}
