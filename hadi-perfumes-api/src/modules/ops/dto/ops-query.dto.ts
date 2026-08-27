import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class JobRunQueryDto {
  @IsOptional() @IsInt() @Min(1) @Type(() => Number) page?: number;
  @IsOptional() @IsInt() @Min(1) @Max(100) @Type(() => Number) limit?: number;
  @IsOptional() @IsString() from_date?: string;
  @IsOptional() @IsString() to_date?: string;
  @IsOptional() @IsString() job_name?: string;
  @IsOptional() @IsString() status?: string;
}

export class DeadLetterQueryDto {
  @IsOptional() @IsInt() @Min(1) @Type(() => Number) page?: number;
  @IsOptional() @IsInt() @Min(1) @Max(100) @Type(() => Number) limit?: number;
  @IsOptional() @IsString() from_date?: string;
  @IsOptional() @IsString() to_date?: string;
  @IsOptional() @IsString() job_name?: string;
}

export class SecurityEventQueryDto {
  @IsOptional() @IsInt() @Min(1) @Type(() => Number) page?: number;
  @IsOptional() @IsInt() @Min(1) @Max(100) @Type(() => Number) limit?: number;
  @IsOptional() @IsString() from_date?: string;
  @IsOptional() @IsString() to_date?: string;
  @IsOptional() @IsString() event_type?: string;
}

export class AuditLogQueryDto {
  @IsOptional() @IsInt() @Min(1) @Type(() => Number) page?: number;
  @IsOptional() @IsInt() @Min(1) @Max(100) @Type(() => Number) limit?: number;
  @IsOptional() @IsString() from_date?: string;
  @IsOptional() @IsString() to_date?: string;
  @IsOptional() @IsString() action?: string;
}
