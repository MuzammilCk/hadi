import { IsUUID, IsInt, Min, Max } from 'class-validator';

export class AddCartItemDto {
  @IsUUID()
  listing_id: string;

  @IsInt()
  @Min(1)
  @Max(10)
  qty: number;
}
