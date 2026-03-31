import { IsNumber, IsInt, Min } from 'class-validator';

export class QualificationContextDto {
  @IsNumber()
  @Min(0)
  personalVolume: number;

  @IsNumber()
  @Min(0)
  downlineVolume: number;

  @IsInt()
  @Min(0)
  activeLegCount: number;
}
