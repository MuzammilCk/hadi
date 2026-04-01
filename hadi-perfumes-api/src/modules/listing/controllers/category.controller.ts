import { Controller, Get, Param } from '@nestjs/common';
import { ProductCategoryService } from '../services/product-category.service';

@Controller('categories')
export class CategoryController {
  constructor(private readonly categoryService: ProductCategoryService) {}

  @Get()
  async getActiveCategories() {
    return this.categoryService.listCategories(false);
  }

  @Get(':id')
  async getCategoryById(@Param('id') id: string) {
    return this.categoryService.getCategoryById(id);
  }
}
