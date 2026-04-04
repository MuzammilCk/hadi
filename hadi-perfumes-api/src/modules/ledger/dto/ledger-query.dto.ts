import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class LedgerQueryDto {
  @IsInt() @Min(1) @IsOptional() @Type(() => Number) page?: number = 1;
  @IsInt() @Min(1) @Max(100) @IsOptional() @Type(() => Number) limit?: number = 20;
  @IsString() @IsOptional() entry_type?: string;
  @IsString() @IsOptional() status?: string;
}
