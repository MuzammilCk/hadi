import { Controller, Get, Patch, Body, Req, UseGuards } from '@nestjs/common';
import { SignupFlowService } from '../services/signup-flow.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { IsOptional, IsString, IsEmail } from 'class-validator';

class UpdateProfileDto {
  @IsOptional()
  @IsString()
  full_name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

@Controller('me')
export class MeController {
  constructor(private signupFlowService: SignupFlowService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async getMe(@Req() req: any) {
    return this.signupFlowService.getMyProfile(req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Get('onboarding-status')
  async getOnboardingStatus(@Req() req: any) {
    return this.signupFlowService.getOnboardingStatus(req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Patch()
  async updateMe(@Req() req: any, @Body() dto: UpdateProfileDto) {
    return this.signupFlowService.updateProfile(req.user.sub, dto);
  }
}
