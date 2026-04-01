import { IsInt, IsUUID, Min, Max, IsOptional } from 'class-validator';

export class ReserveStockDto {
  @IsUUID()
  listingId: string;

  @IsInt()
  @Min(1)
  qty: number;

  @IsInt()
  @Min(60)
  @Max(3600)
  @IsOptional()
  ttlSeconds?: number;
}
