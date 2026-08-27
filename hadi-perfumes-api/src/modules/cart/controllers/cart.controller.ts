import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CartService } from '../services/cart.service';
import { AddCartItemDto } from '../dto/add-cart-item.dto';
import { UpdateCartItemDto } from '../dto/update-cart-item.dto';
import { MergeCartDto } from '../dto/merge-cart.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@Controller('cart')
@UseGuards(JwtAuthGuard)
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  async getCart(@Req() req: any) {
    const items = await this.cartService.getCart(req.user.sub);
    return { items };
  }

  @Post('items')
  async addItem(@Req() req: any, @Body() dto: AddCartItemDto) {
    const items = await this.cartService.addItem(req.user.sub, dto);
    return { items };
  }

  @Patch('items/:id')
  async updateItem(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    const items = await this.cartService.updateItem(req.user.sub, id, dto);
    return { items };
  }

  @Delete('items/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeItem(@Req() req: any, @Param('id') id: string) {
    await this.cartService.removeItem(req.user.sub, id);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async clearCart(@Req() req: any) {
    await this.cartService.clearCart(req.user.sub);
  }

  @Post('merge')
  async mergeGuestCart(@Req() req: any, @Body() dto: MergeCartDto) {
    const items = await this.cartService.mergeGuestCart(
      req.user.sub,
      dto.items,
    );
    return { items };
  }
}
