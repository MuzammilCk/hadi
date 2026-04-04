import { IsString, IsNotEmpty } from 'class-validator';

export class RejectPayoutDto {
  @IsString() @IsNotEmpty() reason: string;
}
