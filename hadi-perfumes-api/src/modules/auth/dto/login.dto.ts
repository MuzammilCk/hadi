import { IsString, IsNotEmpty, MinLength } from 'class-validator';

export class LoginDto {
  /**
   * identifier: E.164 phone (+919876543210) OR email (user@example.com)
   * We validate only that it's a non-empty string here.
   * Service layer decides which lookup to perform.
   */
  @IsString()
  @IsNotEmpty()
  identifier: string;

  @IsString()
  @MinLength(8)
  password: string;
}
