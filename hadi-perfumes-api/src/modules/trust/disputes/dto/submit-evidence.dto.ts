import { IsString, IsOptional, MaxLength } from 'class-validator';

export class SubmitEvidenceDto {
  @IsString()
  @MaxLength(500)
  file_key: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  file_type?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;
}
