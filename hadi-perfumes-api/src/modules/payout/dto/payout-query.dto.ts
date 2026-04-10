import { IsOptional, IsString, IsInt, Min, Max, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';

export class PayoutQueryDto {
  @IsInt() @Min(1) @IsOptional() @Type(() => Number) page?: number = 1;
  @IsInt() @Min(1) @Max(100) @IsOptional() @Type(() => Number) limit?: number =
    20;
  @IsString() @IsOptional() status?: string;
  @IsUUID() @IsOptional() user_id?: string;
}
