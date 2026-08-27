import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fix A8: Prevent double payout requests via partial unique index.
 *
 * Without this index, two concurrent POST /wallet/payout-request with different
 * idempotency keys could both pass the application-level `findOne(REQUESTED/APPROVED)`
 * check and create two active payout requests, double-debiting the user's wallet.
 *
 * The partial unique index enforces at the database level that at most one
 * payout request per user can exist in 'requested' or 'approved' status.
 */
export class AddPayoutRequestActiveUniqueIndex1776100000000
  implements MigrationInterface
{
  name = 'AddPayoutRequestActiveUniqueIndex1776100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_payout_requests_one_active_per_user"
      ON "payout_requests" ("user_id")
      WHERE "status" IN ('requested', 'approved')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_payout_requests_one_active_per_user"`,
    );
  }
}
