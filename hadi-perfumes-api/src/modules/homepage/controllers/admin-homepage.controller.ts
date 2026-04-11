import {
  Controller,
  Get,
  Put,
  Param,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { HomepageService } from '../services/homepage.service';
import { UpsertSectionDto } from '../dto/upsert-section.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../user/entities/user.entity';

@Controller('admin/homepage')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTENT_MANAGER)
export class AdminHomepageController {
  constructor(private readonly homepageService: HomepageService) {}

  @Get()
  async getAllSections() {
    return this.homepageService.getAllSections();
  }

  @Put(':section_key')
  async upsertSection(
    @Param('section_key') sectionKey: string,
    @Body() dto: UpsertSectionDto,
    @Req() req: any,
  ) {
    return this.homepageService.upsertSection(sectionKey, dto, req.user.sub);
  }
}
