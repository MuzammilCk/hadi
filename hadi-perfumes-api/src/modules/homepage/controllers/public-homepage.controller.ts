import { Controller, Get } from '@nestjs/common';
import { HomepageService } from '../services/homepage.service';

@Controller('public/homepage')
export class PublicHomepageController {
  constructor(private readonly homepageService: HomepageService) {}

  @Get()
  async getPublicHomepage() {
    return this.homepageService.getPublicSections();
  }
}
