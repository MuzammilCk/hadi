import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  Req,
  Body,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { ReturnService } from '../services/return.service';
import { CreateReturnDto } from '../dto/create-return.dto';
import { ReturnQueryDto } from '../dto/return-query.dto';

@Controller('returns')
@UseGuards(JwtAuthGuard)
export class ReturnController {
  constructor(private readonly returnService: ReturnService) {}

  @Post()
  async createReturn(@Req() req: any, @Body() dto: CreateReturnDto) {
    return this.returnService.createReturn(
      req.user.sub,
      dto,
      dto.idempotency_key,
    );
  }

  @Get('my')
  async listMyReturns(@Req() req: any, @Query() query: ReturnQueryDto) {
    return this.returnService.listMyReturns(req.user.sub, query);
  }

  @Get(':id')
  async getReturn(@Req() req: any, @Param('id') id: string) {
    return this.returnService.getReturn(id, req.user.sub);
  }
}
