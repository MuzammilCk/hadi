import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Patch,
  Delete,
  UseGuards,
  Req,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ListingService } from '../services/listing.service';
import { ProductCategoryService } from '../services/product-category.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../user/entities/user.entity';
import { CreateListingDto } from '../dto/create-listing.dto';
import { UpdateListingDto } from '../dto/update-listing.dto';
import { CreateCategoryDto } from '../dto/create-category.dto';
import { UpdateCategoryDto } from '../dto/update-category.dto';
import { ListingSearchDto } from '../dto/listing-search.dto';
import { AddImageDto } from '../dto/add-image.dto';
import { ReorderImagesDto } from '../dto/reorder-images.dto';
import { ModerationActionDto } from '../dto/moderation-action.dto';
import { ModerationAction } from '../entities/listing-moderation-action.entity';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminListingController {
  constructor(
    private readonly listingService: ListingService,
    private readonly categoryService: ProductCategoryService,
  ) {}

  // ================= Categories ==================
  @Post('categories')
  async createCategory(@Body() dto: CreateCategoryDto) {
    return this.categoryService.createCategory(dto);
  }

  @Patch('categories/:id')
  async updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoryService.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  async deactivateCategory(@Param('id') id: string) {
    return this.categoryService.deactivateCategory(id);
  }

  // ================= Listings ==================
  @Post('listings')
  async createListing(@Req() req: any, @Body() dto: CreateListingDto) {
    return this.listingService.createListing(req.adminActorId, dto);
  }

  @Get('listings')
  async searchListings(@Query() query: ListingSearchDto) {
    return this.listingService.searchListings(query, true); // isAdmin = true
  }

  @Get('listings/:id')
  async getListing(@Param('id') id: string) {
    return this.listingService.getListingById(id, true);
  }

  @Patch('listings/:id')
  async updateListing(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateListingDto,
  ) {
    return this.listingService.updateListing(id, req.adminActorId, dto);
  }

  // ================= Images ==================
  @Post('listings/:id/images')
  async addImage(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: AddImageDto,
  ) {
    return this.listingService.addImage(id, req.adminActorId, dto);
  }

  @Delete('listings/:listingId/images/:imageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteImage(
    @Req() req: any,
    @Param('listingId') listingId: string,
    @Param('imageId') imageId: string,
  ) {
    return this.listingService.removeImage(imageId, req.adminActorId);
  }

  @Patch('listings/:id/images/reorder')
  @HttpCode(HttpStatus.NO_CONTENT)
  async reorderImages(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: ReorderImagesDto,
  ) {
    return this.listingService.reorderImages(
      id,
      req.adminActorId,
      dto.orderedIds,
    );
  }

  // ================= Moderation & Status ==================
  @Post('listings/:id/approve')
  async approveListing(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: ModerationActionDto,
  ) {
    return this.listingService.moderateListing(
      id,
      req.adminActorId,
      ModerationAction.APPROVE,
      dto,
    );
  }

  @Post('listings/:id/reject')
  async rejectListing(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: ModerationActionDto,
  ) {
    return this.listingService.moderateListing(
      id,
      req.adminActorId,
      ModerationAction.REJECT,
      dto,
    );
  }

  @Post('listings/:id/pause')
  async pauseListing(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: ModerationActionDto,
  ) {
    return this.listingService.moderateListing(
      id,
      req.adminActorId,
      ModerationAction.PAUSE,
      dto,
    );
  }

  @Post('listings/:id/resume')
  async resumeListing(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: ModerationActionDto,
  ) {
    return this.listingService.moderateListing(
      id,
      req.adminActorId,
      ModerationAction.RESUME,
      dto,
    );
  }

  @Delete('listings/:id')
  async removeListing(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: ModerationActionDto,
  ) {
    return this.listingService.moderateListing(
      id,
      req.adminActorId,
      ModerationAction.REMOVE,
      dto,
    );
  }
}
