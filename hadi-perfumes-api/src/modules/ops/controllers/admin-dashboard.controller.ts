import { Controller, Get, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../user/entities/user.entity';
import { User } from '../../user/entities/user.entity';
import { Order } from '../../order/entities/order.entity';
import { Listing } from '../../listing/entities/listing.entity';

@Controller('admin/dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminDashboardController {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(Listing)
    private readonly listingRepo: Repository<Listing>,
  ) {}

  @Get('stats')
  async getStats() {
    const [totalUsers, totalOrders, totalListings, recentOrders] =
      await Promise.all([
        this.userRepo.count(),
        this.orderRepo.count(),
        this.listingRepo.count(),
        this.orderRepo
          .createQueryBuilder('o')
          .select('SUM(o.total_amount)', 'revenue')
          .where("o.status NOT IN ('cancelled', 'refunded')")
          .getRawOne(),
      ]);

    return {
      total_users: totalUsers,
      total_orders: totalOrders,
      total_listings: totalListings,
      total_revenue: parseFloat(recentOrders?.revenue || '0'),
    };
  }
}
