import { IsString, IsNotEmpty, MinLength } from 'class-validator';

export class RejectListingDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  reason: string;
}
