import { IsString, IsNotEmpty, IsOptional, IsInt, Min } from 'class-validator';

export class ConfirmUploadDto {
  @IsString()
  @IsNotEmpty()
  storage_key: string;

  @IsString()
  @IsOptional()
  alt_text?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  width?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  height?: number;
}
