import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductCategory } from './entities/product-category.entity';
import { Listing } from './entities/listing.entity';
import { ListingImage } from './entities/listing-image.entity';
import { ListingStatusHistory } from './entities/listing-status-history.entity';
import { ListingModerationAction } from './entities/listing-moderation-action.entity';
import { ListingService } from './services/listing.service';
import { ProductCategoryService } from './services/product-category.service';
import { ListingController } from './controllers/listing.controller';
import { CategoryController } from './controllers/category.controller';
import { AdminListingController } from './controllers/admin-listing.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProductCategory,
      Listing,
      ListingImage,
      ListingStatusHistory,
      ListingModerationAction,
    ]),
  ],
  providers: [ListingService, ProductCategoryService],
  controllers: [ListingController, CategoryController, AdminListingController],
  exports: [ListingService, ProductCategoryService],
})
export class ListingModule {}
