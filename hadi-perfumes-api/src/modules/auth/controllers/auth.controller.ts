import {
  Controller,
  Post,
  Body,
  UnauthorizedException,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SignupFlowService } from '../services/signup-flow.service';
import { JwtService } from '@nestjs/jwt';
import { ThrottlerGuard } from '@nestjs/throttler';
import { SendOtpDto } from '../dto/send-otp.dto';
import { VerifyOtpDto } from '../dto/verify-otp.dto';
import { SignupDto } from '../dto/signup.dto';
import { RefreshTokenDto } from '../dto/refresh-token.dto';
import { LoginDto } from '../dto/login.dto';
import { GoogleLoginDto } from '../dto/google-login.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private signupFlowService: SignupFlowService,
    private jwtService: JwtService,
  ) {}

  @UseGuards(ThrottlerGuard)
  @Post('otp/send')
  async sendOtp(@Body() dto: SendOtpDto, @Req() req: any) {
    const ip = req.ip || req.connection?.remoteAddress;
    const deviceHash = req.headers['x-device-hash'] || null;
    return this.signupFlowService.sendOtp(dto.phone, ip, deviceHash);
  }

  @UseGuards(ThrottlerGuard)
  @Post('otp/verify')
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.signupFlowService.verifyOtp(dto.phone, dto.otp);
  }

  // Fix L1: signup must be rate-limited — prevents credential stuffing via session tokens
  @UseGuards(ThrottlerGuard)
  @Post('signup')
  async signup(@Body() dto: SignupDto, @Req() req: any) {
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
      dto.email,
      dto.referral_code,
      payload.attempt_id,
      ip,
      deviceHash,
    );
  }

  // Fix L1: refresh must be rate-limited — prevents brute-force refresh token guessing
  @UseGuards(ThrottlerGuard)
  @Post('refresh')
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.signupFlowService.refresh(dto.refresh_token);
  }

  @Post('logout')
  async logout(@Body() dto: RefreshTokenDto) {
    return this.signupFlowService.logout(dto.refresh_token);
  }

  @UseGuards(ThrottlerGuard)
  @Post('login')
  async login(@Body() dto: LoginDto) {
    return this.signupFlowService.login(dto.identifier, dto.password);
  }

  @UseGuards(ThrottlerGuard)
  @Post('google')
  async loginWithGoogle(@Body() dto: GoogleLoginDto) {
    return this.signupFlowService.loginWithGoogle(dto.credential);
  }
}
