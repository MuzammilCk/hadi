import { IsString, IsNotEmpty, IsOptional, IsInt, Min } from 'class-validator';

export class AddImageDto {
  @IsString()
  @IsNotEmpty()
  storage_key: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  sort_order?: number;
}
