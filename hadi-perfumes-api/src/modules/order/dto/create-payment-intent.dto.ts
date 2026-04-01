import { IsUUID, IsString, IsNotEmpty } from 'class-validator';

export class CreatePaymentIntentDto {
  @IsUUID()
  order_id: string;

  @IsString()
  @IsNotEmpty()
  idempotency_key: string;
}
