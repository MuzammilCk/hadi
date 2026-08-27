import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 7 Audit Fixes — 2026-04-08
 *
 * Changes:
 *  1. money_event_outbox: add error_count (dead-letter tracking) and last_error columns.
 *     Required by the H3 fix in commission-calculation.service.ts — the outbox processor
 *     now increments error_count on each failure and stops retrying after COMMISSION_MAX_RETRIES.
 *
 *  2. payout_batches: add partial UNIQUE index on status WHERE status = 'processing'.
 *     Structural guard so the DB enforces only one batch can be PROCESSING at a time,
 *     complementing the FOR UPDATE NOWAIT row-level lock in executeBatch.
 */
export class Phase7AuditFixes1711700000000 implements MigrationInterface {
  name = 'Phase7AuditFixes1711700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1a. Add error_count to money_event_outbox (dead-letter tracking)
    await queryRunner.query(`
      ALTER TABLE "money_event_outbox"
        ADD COLUMN IF NOT EXISTS "error_count" integer NOT NULL DEFAULT 0
    `);

    // 1b. Add last_error to money_event_outbox
    await queryRunner.query(`
      ALTER TABLE "money_event_outbox"
        ADD COLUMN IF NOT EXISTS "last_error" character varying
    `);

    // 1c. Index on error_count to efficiently filter out dead-lettered events
    //     (WHERE error_count < maxRetries in processUnpublishedEvents)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_money_event_outbox_error_count"
        ON "money_event_outbox" ("error_count")
    `);

    // 2. Partial UNIQUE index: only one batch can be PROCESSING at a time.
    //    NOTE: Cannot use CONCURRENTLY inside a migration transaction.
    //    This is safe on a new/empty table; for large existing tables run
    //    CREATE UNIQUE INDEX CONCURRENTLY separately in a maintenance window.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_payout_batches_one_processing"
        ON "payout_batches" ("status")
        WHERE "status" = 'processing'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_payout_batches_one_processing"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_money_event_outbox_error_count"
    `);
    await queryRunner.query(`
      ALTER TABLE "money_event_outbox" DROP COLUMN IF EXISTS "last_error"
    `);
    await queryRunner.query(`
      ALTER TABLE "money_event_outbox" DROP COLUMN IF EXISTS "error_count"
    `);
  }
}
