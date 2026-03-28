import {
  Controller,
  Post,
  Get,
  Body,
  UnauthorizedException,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SignupFlowService } from '../services/signup-flow.service';
import { JwtService } from '@nestjs/jwt';
import { ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private signupFlowService: SignupFlowService,
    private jwtService: JwtService,
  ) {}

  @UseGuards(ThrottlerGuard)
  @Post('otp/send')
  async sendOtp(@Body('phone') phone: string, @Req() req: any) {
    const ip = req.ip || req.connection?.remoteAddress;
    const deviceHash = req.headers['x-device-hash'] || null;
    return this.signupFlowService.sendOtp(phone, ip, deviceHash);
  }

  @UseGuards(ThrottlerGuard)
  @Post('otp/verify')
  async verifyOtp(@Body('phone') phone: string, @Body('otp') otp: string) {
    return this.signupFlowService.verifyOtp(phone, otp);
  }

  @Post('signup')
  async signup(@Body() dto: any, @Req() req: any) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid session token');
    }

    const token = authHeader.split(' ')[1];
    let payload: any;
    try {
      payload = this.jwtService.verify(token);
      if (payload.scope !== 'signup_only') {
        throw new Error('Invalid token scope');
      }
    } catch {
      throw new UnauthorizedException('Invalid or expired session token');
    }

    const ip = req.ip || req.connection?.remoteAddress;
    const deviceHash = req.headers['x-device-hash'] || null;

    return this.signupFlowService.signup(
      payload.phone,
      dto.full_name,
      dto.password,
      dto.referral_code,
      payload.attempt_id,
      ip,
      deviceHash,
    );
  }

  @Post('refresh')
  async refresh(@Body('refresh_token') refreshToken: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('Missing refresh token');
    }
    return this.signupFlowService.refresh(refreshToken);
  }

  @Post('logout')
  async logout(@Body('refresh_token') refreshToken: string) {
    if (!refreshToken) {
      return { success: true }; // Already logged out
    }
    return this.signupFlowService.logout(refreshToken);
  }
}
