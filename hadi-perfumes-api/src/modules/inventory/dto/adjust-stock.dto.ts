import { IsInt, Min, IsString, MinLength } from 'class-validator';

export class AdjustStockDto {
  @IsInt()
  @Min(0)
  newTotalQty: number;

  @IsString()
  @MinLength(5)
  reason: string;
}
