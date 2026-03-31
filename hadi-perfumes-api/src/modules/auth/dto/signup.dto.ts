import { IsString, IsNotEmpty, MinLength } from 'class-validator';

export class SignupDto {
  @IsString()
  @IsNotEmpty()
  full_name: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @IsNotEmpty()
  referral_code: string;
}
