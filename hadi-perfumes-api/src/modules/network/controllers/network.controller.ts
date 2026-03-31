import {
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { NetworkGraphService } from '../services/network-graph.service';
import { QualificationEngineService } from '../services/qualification-engine.service';
import { RankAssignmentService } from '../services/rank-assignment.service';
import { GetDownlineDto } from '../dto/get-downline.dto';

@UseGuards(JwtAuthGuard)
@Controller('network')
export class NetworkController {
  constructor(
    private readonly graphService: NetworkGraphService,
    private readonly qualEngine: QualificationEngineService,
    private readonly rankService: RankAssignmentService,
  ) {}

  /**
   * GET /network/upline — authenticated user's upline path.
   */
  @Get('upline')
  async getUpline(@Req() req: any) {
    const userId: string = req.user.sub;
    try {
      const uplinePath = await this.graphService.getUplinePath(userId);
      const node = await this.graphService.getDirectRecruits(userId);
      // Get the node for the user to get sponsor info
      const downline = await this.graphService.getDownline(userId);
      // Find the user's own node — we need it for sponsor_id and depth
      const allNodes = await this.graphService.getDownline(userId, 0);

      // Get user's node directly
      let userNode;
      try {
        userNode = {
          depth: uplinePath.length,
          sponsorId: uplinePath.length > 0 ? uplinePath[uplinePath.length - 1] : null,
        };
      } catch {
        userNode = { depth: 0, sponsorId: null };
      }

      return {
        userId,
        depth: uplinePath.length,
        sponsorId: uplinePath.length > 0 ? uplinePath[uplinePath.length - 1] : null,
        uplinePath,
      };
    } catch (error) {
      // If no node exists yet, return empty state
      if (error?.status === 404) {
        return {
          userId,
          depth: 0,
          sponsorId: null,
          uplinePath: [],
        };
      }
      throw error;
    }
  }

  /**
   * GET /network/downline — paginated downline nodes.
   */
  @Get('downline')
  async getDownline(@Req() req: any, @Query() query: GetDownlineDto) {
    const userId: string = req.user.sub;
    const page = query.page || 1;
    const limit = query.limit || 20;
    const maxDepth = query.maxDepth;

    const allDownline = await this.graphService.getDownline(userId, maxDepth);

    // Paginate
    const total = allDownline.length;
    const start = (page - 1) * limit;
    const paginatedData = allDownline.slice(start, start + limit);

    return {
      data: paginatedData.map(node => ({
        userId: node.user_id,
        depth: node.depth,
        sponsorId: node.sponsor_id,
        directCount: node.direct_count,
      })),
      total,
      page,
      limit,
    };
  }

  /**
   * GET /network/stats — summary stats for authenticated user.
   */
  @Get('stats')
  async getStats(@Req() req: any) {
    const userId: string = req.user.sub;

    let depth = 0;
    let directCount = 0;
    let totalDownline = 0;
    let sponsorId: string | null = null;

    try {
      const uplinePath = await this.graphService.getUplinePath(userId);
      depth = uplinePath.length;
      sponsorId = uplinePath.length > 0 ? uplinePath[uplinePath.length - 1] : null;

      const recruits = await this.graphService.getDirectRecruits(userId);
      directCount = recruits.length;

      const downline = await this.graphService.getDownline(userId);
      totalDownline = downline.length;
    } catch {
      // Node may not exist yet
    }

    const qualState = await this.qualEngine.getCurrentState(userId);
    const currentRank = await this.rankService.getCurrentRank(userId);

    return {
      userId,
      depth,
      directCount,
      totalDownline,
      isActive: qualState?.is_active ?? false,
      isQualified: qualState?.is_qualified ?? false,
      currentRank: currentRank ? currentRank.rank_rule_id : null,
    };
  }

  /**
   * GET /network/qualification-status — full QualificationState for authenticated user.
   */
  @Get('qualification-status')
  async getQualificationStatus(@Req() req: any) {
    const userId: string = req.user.sub;
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

    return {
      userId,
      isActive: state.is_active,
      isQualified: state.is_qualified,
      personalVolume: state.personal_volume,
      downlineVolume: state.downline_volume,
      activeLegCount: state.active_legs_count,
      evaluatedAt: state.evaluated_at,
      disqualifiedReason: state.disqualified_reason,
    };
  }
}
