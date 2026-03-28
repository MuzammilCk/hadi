import { Test, TestingModule } from '@nestjs/testing';
import { OtpService } from '../../src/modules/auth/services/otp.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OtpVerification } from '../../src/modules/auth/entities/otp-verification.entity';

describe('OtpService', () => {
  let service: OtpService;

  const mockOtpRepo = {
    update: jest.fn(),
    create: jest.fn().mockImplementation((dto) => dto),
    save: jest.fn(),
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OtpService,
        {
          provide: getRepositoryToken(OtpVerification),
          useValue: mockOtpRepo,
        },
      ],
    }).compile();

    service = module.get<OtpService>(OtpService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
