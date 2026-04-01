import { IsString, IsNotEmpty, IsOptional, IsUUID, IsBoolean } from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  slug: string;

  @IsUUID()
  @IsOptional()
  parent_id?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  is_commission_eligible?: boolean;
}
