import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductCategory } from '../entities/product-category.entity';
import { CreateCategoryDto } from '../dto/create-category.dto';
import { UpdateCategoryDto } from '../dto/update-category.dto';
import { CategoryNotFoundException } from '../exceptions/listing.exceptions';

@Injectable()
export class ProductCategoryService {
  constructor(
    @InjectRepository(ProductCategory)
    private readonly categoryRepository: Repository<ProductCategory>,
  ) {}

  async createCategory(dto: CreateCategoryDto): Promise<ProductCategory> {
    const category = this.categoryRepository.create(dto);
    return await this.categoryRepository.save(category);
  }

  async listCategories(
    includeInactive: boolean = false,
  ): Promise<ProductCategory[]> {
    const query = this.categoryRepository.createQueryBuilder('cat');

    if (!includeInactive) {
      query.where('cat.is_active = :isActive', { isActive: true });
    }

    return await query.orderBy('cat.name', 'ASC').getMany();
  }

  async getCategoryById(id: string): Promise<ProductCategory> {
    const category = await this.categoryRepository.findOne({ where: { id } });
    if (!category) {
      throw new CategoryNotFoundException();
    }
    return category;
  }

  async updateCategory(
    id: string,
    dto: UpdateCategoryDto,
  ): Promise<ProductCategory> {
    const category = await this.getCategoryById(id);
    this.categoryRepository.merge(category, dto);
    return await this.categoryRepository.save(category);
  }

  async deactivateCategory(id: string): Promise<ProductCategory> {
    const category = await this.getCategoryById(id);
    category.is_active = false;
    return await this.categoryRepository.save(category);
  }
}
