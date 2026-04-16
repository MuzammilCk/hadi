import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../user/entities/user.entity';
import { NetworkGraphService } from '../services/network-graph.service';
import { QualificationEngineService } from '../services/qualification-engine.service';
import { QualificationRecalcJob } from '../../../jobs/qualification-recalc.job';
import { GraphCorrectionDto } from '../dto/graph-correction.dto';
import { RecalculateQualificationDto } from '../dto/recalculate-qualification.dto';
import { NetworkNode } from '../entities/network-node.entity';
import { GraphCorrectionLog } from '../entities/graph-correction-log.entity';
import { NetworkSnapshot } from '../entities/network-snapshot.entity';
import { GraphRebuildJob } from '../entities/graph-rebuild-job.entity';
import { NetworkNodeNotFoundException } from '../exceptions/network.exceptions';

/**
 * PHASE 3 GRAPH CORRECTION NOTE:
 * This controller corrects the COMPUTED GRAPH STATE (network_nodes).
 * The SOURCE OF TRUTH for the sponsor relationship is sponsorship_links (Phase 2).
 * To correct the actual sponsor record, call: POST /admin/referrals/:userId/correct
 * These two corrections should be run together. Running only one will create drift
 * between sponsorship_links and network_nodes until the next graph rebuild.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/network')
export class AdminNetworkController {
  constructor(
    private readonly graphService: NetworkGraphService,
    private readonly qualEngine: QualificationEngineService,
    private readonly recalcJob: QualificationRecalcJob,
    @InjectEntityManager()
    private entityManager: EntityManager,
  ) {}

  // ===== STATIC ROUTES FIRST — must come before dynamic :userId routes =====

  /**
   * GET /admin/network/corrections — paginated GraphCorrectionLog.
   */
  @Get('corrections')
  async getCorrections(
    @Query('userId') userId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = parseInt(page || '1', 10);
    const limitNum = parseInt(limit || '20', 10);

    const qb = this.entityManager
      .createQueryBuilder(GraphCorrectionLog, 'gcl')
      .orderBy('gcl.created_at', 'DESC');

    if (userId) {
      qb.where('gcl.user_id = :userId', { userId });
    }

    const [data, total] = await qb
      .skip((pageNum - 1) * limitNum)
      .take(limitNum)
      .getManyAndCount();

    return { data, total, page: pageNum, limit: limitNum };
  }

  /**
   * POST /admin/network/corrections — apply graph correction.
   */
  @Post('corrections')
  async applyCorrection(@Body() dto: GraphCorrectionDto, @Req() req: any) {
    if (dto.userId === dto.newSponsorId) {
      throw new BadRequestException(
        'Cannot assign a user as their own sponsor',
      );
    }

    const actorId = req.adminActorId;

    return this.entityManager.transaction(async (em) => {
      return this.graphService.applyGraphCorrection(dto, actorId, em);
    });
  }

  /**
   * POST /admin/network/recalculate — trigger rebuild job.
   */
  @Post('recalculate')
  async recalculate(@Body() dto: RecalculateQualificationDto, @Req() req: any) {
    const actorId = req.adminActorId;
    return this.recalcJob.run(dto.policyVersionId, dto.targetUserId, actorId);
  }

  /**
   * GET /admin/network/snapshots — paginated NetworkSnapshot.
   */
  @Get('snapshots')
  async getSnapshots(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = parseInt(page || '1', 10);
    const limitNum = parseInt(limit || '20', 10);

    const [data, total] = await this.entityManager
      .createQueryBuilder(NetworkSnapshot, 'ns')
      .orderBy('ns.created_at', 'DESC')
      .skip((pageNum - 1) * limitNum)
      .take(limitNum)
      .getManyAndCount();

    return { data, total, page: pageNum, limit: limitNum };
  }

  /**
   * POST /admin/network/snapshots — trigger manual snapshot.
   */
  @Post('snapshots')
  async takeSnapshot(@Req() req: any) {
    const actorId = req.adminActorId;
    return this.graphService.takeSnapshot('manual', actorId);
  }

  /**
   * GET /admin/network/rebuild-jobs — paginated GraphRebuildJob.
   */
  @Get('rebuild-jobs')
  async getRebuildJobs(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = parseInt(page || '1', 10);
    const limitNum = parseInt(limit || '20', 10);

    const qb = this.entityManager
      .createQueryBuilder(GraphRebuildJob, 'grj')
      .orderBy('grj.created_at', 'DESC');

    if (status) {
      qb.where('grj.status = :status', { status });
    }

    const [data, total] = await qb
      .skip((pageNum - 1) * limitNum)
      .take(limitNum)
      .getManyAndCount();

    return { data, total, page: pageNum, limit: limitNum };
  }

  // ===== DYNAMIC ROUTES — must come after all static routes =====

  /**
   * GET /admin/network/:userId/downline — paginated downline tree for any user.
   * Reuses NetworkGraphService.getDownline() with admin-provided userId.
   */
  @Get(':userId/downline')
  async getAdminDownline(
    @Param('userId') userId: string,
    @Query('maxDepth') maxDepth?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    // Verify the target user exists in the graph
    const rootNode = await this.entityManager.findOne(NetworkNode, {
      where: { user_id: userId },
    });

    if (!rootNode) {
      throw new NetworkNodeNotFoundException(userId);
    }

    const depth = maxDepth ? parseInt(maxDepth, 10) : undefined;
    const allDownline = await this.graphService.getDownline(userId, depth);

    const pageNum = parseInt(page || '1', 10);
    const limitNum = parseInt(limit || '50', 10);
    const start = (pageNum - 1) * limitNum;
    const paginatedData = allDownline.slice(start, start + limitNum);

    return {
      rootNode: {
        userId: rootNode.user_id,
        depth: rootNode.depth,
        sponsorId: rootNode.sponsor_id,
        directCount: rootNode.direct_count,
        totalDownline: allDownline.length,
      },
      data: paginatedData.map((n) => ({
        userId: n.user_id,
        depth: n.depth,
        sponsorId: n.sponsor_id,
        directCount: n.direct_count,
      })),
      total: allDownline.length,
      page: pageNum,
      limit: limitNum,
    };
  }

  /**
   * GET /admin/network/:userId/node — NetworkNode for specific user.
   */
  @Get(':userId/node')
  async getNode(@Param('userId') userId: string) {
    const node = await this.entityManager.findOne(NetworkNode, {
      where: { user_id: userId },
    });

    if (!node) {
      throw new NetworkNodeNotFoundException(userId);
    }

    return node;
  }

  /**
   * GET /admin/network/:userId/qualification — QualificationState for specific user.
   */
  @Get(':userId/qualification')
  async getQualification(@Param('userId') userId: string) {
    const state = await this.qualEngine.getCurrentState(userId);

    if (!state) {
      return {
        userId,
        isActive: false,
        isQualified: false,
        personalVolume: '0.00',
        downlineVolume: '0.00',
        activeLegCount: 0,
        evaluatedAt: null,
        disqualifiedReason: null,
      };
    }

    return state;
  }
}
