import { IsInt, Min } from 'class-validator';

export class AddStockDto {
  @IsInt()
  @Min(1)
  qty: number;
}
