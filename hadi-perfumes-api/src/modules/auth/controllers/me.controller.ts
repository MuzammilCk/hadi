import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { SignupFlowService } from '../services/signup-flow.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';

@Controller('me')
export class MeController {
  constructor(private signupFlowService: SignupFlowService) {}

  @UseGuards(JwtAuthGuard)
  @Get('onboarding-status')
  async getOnboardingStatus(@Req() req: any) {
    return this.signupFlowService.getOnboardingStatus(req.user.sub);
  }
}
