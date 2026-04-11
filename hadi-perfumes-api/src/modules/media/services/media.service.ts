import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { MediaAsset, MediaAssetStatus } from '../entities/media-asset.entity';
import { AuditService } from '../../audit/services/audit.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private supabase: SupabaseClient | null = null;
  private readonly bucket: string;

  constructor(
    @InjectRepository(MediaAsset)
    private readonly mediaRepo: Repository<MediaAsset>,
    private readonly auditService: AuditService,
  ) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    this.bucket = process.env.SUPABASE_STORAGE_BUCKET || 'media';

    if (url && key) {
      this.supabase = createClient(url, key);
    } else {
      this.logger.warn(
        'SUPABASE_URL or SUPABASE_SERVICE_KEY not set — media uploads disabled',
      );
    }
  }

  async generateSignedUploadUrl(
    userId: string,
    filename: string,
    mimeType: string,
  ): Promise<{ upload_url: string; storage_key: string; media_id: string }> {
    if (!this.supabase) {
      throw new InternalServerErrorException(
        'Media uploads not configured — missing Supabase credentials',
      );
    }

    const ext = filename.split('.').pop() || 'bin';
    const storageKey = `uploads/${uuidv4()}.${ext}`;

    try {
      const { data, error } = await this.supabase.storage
        .from(this.bucket)
        .createSignedUploadUrl(storageKey);

      if (error) {
        this.logger.error('Supabase signed URL error', error);
        throw new InternalServerErrorException(
          'Failed to generate upload URL',
        );
      }

      // Save PENDING media asset row
      const asset = this.mediaRepo.create({
        storage_key: storageKey,
        bucket: this.bucket,
        mime_type: mimeType,
        status: MediaAssetStatus.PENDING,
        uploaded_by: userId,
      });
      const saved = await this.mediaRepo.save(asset);

      return {
        upload_url: data.signedUrl,
        storage_key: storageKey,
        media_id: saved.id,
      };
    } catch (error) {
      if (
        error instanceof InternalServerErrorException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error('Failed to generate signed upload URL', error);
      throw new InternalServerErrorException(
        'Failed to generate upload URL',
      );
    }
  }

  async confirmUpload(
    storageKey: string,
    userId: string,
    metadata: { alt_text?: string; width?: number; height?: number },
  ): Promise<MediaAsset> {
    const asset = await this.mediaRepo.findOne({
      where: { storage_key: storageKey },
    });

    if (!asset) {
      throw new NotFoundException('Media asset not found');
    }

    if (asset.status === MediaAssetStatus.ACTIVE) {
      return asset; // idempotent
    }

    const before = { ...asset };

    asset.status = MediaAssetStatus.ACTIVE;
    asset.alt_text = metadata.alt_text ?? asset.alt_text;
    asset.width = metadata.width ?? asset.width;
    asset.height = metadata.height ?? asset.height;

    const saved = await this.mediaRepo.save(asset);

    await this.auditService.log({
      actor_id: userId,
      action: 'MEDIA_UPLOAD_CONFIRMED',
      entity_type: 'media_asset',
      entity_id: saved.id,
      before_snapshot: { status: before.status },
      after_snapshot: { status: saved.status, alt_text: saved.alt_text },
    });

    return saved;
  }

  getPublicUrl(storageKey: string): string {
    const supabaseUrl = process.env.SUPABASE_URL;
    if (!supabaseUrl) {
      return storageKey; // fallback
    }
    // Supabase Storage public URL pattern
    return `${supabaseUrl}/storage/v1/object/public/${this.bucket}/${storageKey}`;
  }

  async resolveMediaUrls(mediaIds: string[]): Promise<string[]> {
    if (!mediaIds || mediaIds.length === 0) return [];

    const assets = await this.mediaRepo
      .createQueryBuilder('m')
      .where('m.id IN (:...ids)', { ids: mediaIds })
      .andWhere('m.status = :status', { status: MediaAssetStatus.ACTIVE })
      .getMany();

    return assets.map((a) => this.getPublicUrl(a.storage_key));
  }

  async softDelete(id: string, userId: string): Promise<void> {
    const asset = await this.mediaRepo.findOne({ where: { id } });
    if (!asset) {
      throw new NotFoundException('Media asset not found');
    }

    const before = { status: asset.status };
    asset.status = MediaAssetStatus.DELETED;
    await this.mediaRepo.save(asset);

    await this.auditService.log({
      actor_id: userId,
      action: 'MEDIA_DELETED',
      entity_type: 'media_asset',
      entity_id: id,
      before_snapshot: before,
      after_snapshot: { status: MediaAssetStatus.DELETED },
    });
  }
}
