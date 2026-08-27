import { IsString, IsNotEmpty, Matches } from 'class-validator';

export class CreateSignedUrlDto {
  @IsString()
  @IsNotEmpty()
  filename: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^(image|video)\/(jpeg|png|webp|gif|mp4|webm)$/, {
    message: 'Unsupported mime type',
  })
  mime_type: string;
}
