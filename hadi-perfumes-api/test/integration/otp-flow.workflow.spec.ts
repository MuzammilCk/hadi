import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../../src/modules/auth/auth.module';
import { ReferralModule } from '../../src/modules/referral/referral.module';
import { DataSource } from 'typeorm';
import { OtpService } from '../../src/modules/auth/services/otp.service';
import { OtpVerification } from '../../src/modules/auth/entities/otp-verification.entity';

describe('OTP Flow Workflow (Integration)', () => {
  jest.setTimeout(30000);

  let dataSource: DataSource;
  let otpService: OtpService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          dropSchema: true,
          entities: [__dirname + '/../../src/**/*.entity{.ts,.js}'],
          synchronize: true,
        }),
        AuthModule,
        ReferralModule,
      ],
    }).compile();

    otpService = module.get<OtpService>(OtpService);
    dataSource = module.get<DataSource>(DataSource);
  }, 30000);

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('should create an OTP record when sendOtp is called', async () => {
    const phone = '+1234567890';
    await otpService.sendOtp(phone);

    const otpRepo = dataSource.getRepository(OtpVerification);
    const records = await otpRepo.find({ where: { phone } });

    expect(records.length).toBe(1);
    expect(records[0].otp_hash).toBeDefined();
    expect(records[0].verified_at).toBeNull();
  });

  it('should invalidate previous OTPs when sending a new one', async () => {
    const phone = '+1234567891';
    await otpService.sendOtp(phone);
    await otpService.sendOtp(phone); // second send

    const otpRepo = dataSource.getRepository(OtpVerification);
    const records = await otpRepo.find({ where: { phone }, order: { created_at: 'ASC' } });

    expect(records.length).toBe(2);
    // First OTP should be expired (expires_at <= now)
    expect(records[0].expires_at.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('should return false for an invalid OTP code', async () => {
    const phone = '+1234567892';
    await otpService.sendOtp(phone);

    const result = await otpService.verifyOtp(phone, '000000');
    expect(result).toBe(false);
  });
});
