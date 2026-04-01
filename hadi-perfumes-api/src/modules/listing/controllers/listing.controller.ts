import { Controller, Get, Param, Query } from '@nestjs/common';
import { ListingService } from '../services/listing.service';
import { ListingSearchDto } from '../dto/listing-search.dto';

@Controller('listings')
export class ListingController {
  constructor(private readonly listingService: ListingService) {}

  @Get()
  async searchListings(@Query() query: ListingSearchDto) {
    // Only fetch public/active items
    return this.listingService.searchListings(query, false);
  }

  @Get(':id')
  async getListing(@Param('id') id: string) {
    // Only return matching public items
    return this.listingService.getListingById(id, false);
  }
}
