import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class AdminUpdateOrderStatusDto {
  @IsString()
  @IsNotEmpty()
  status: string;

  @IsString()
  @IsOptional()
  reason?: string;
}
