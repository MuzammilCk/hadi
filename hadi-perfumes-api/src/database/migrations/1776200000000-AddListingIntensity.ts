import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add intensity column to listings table.
 *
 * Intensity (10–100 scale) is a first-class product attribute used for
 * server-side faceted filtering on the storefront.  Previously, the
 * frontend derived this from free-text descriptions, which broke under
 * server-side pagination.
 *
 * Mapping:  Soft = 10-39  |  Moderate = 40-69  |  Intense = 70-100
 */
export class AddListingIntensity1776200000000 implements MigrationInterface {
  name = 'AddListingIntensity1776200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "listings"
      ADD COLUMN "intensity" smallint DEFAULT 70
    `);
    await queryRunner.query(`
      ALTER TABLE "listings"
      ADD CONSTRAINT "CHK_listing_intensity_range"
      CHECK ("intensity" >= 10 AND "intensity" <= 100)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "listings" DROP CONSTRAINT IF EXISTS "CHK_listing_intensity_range"`,
    );
    await queryRunner.query(
      `ALTER TABLE "listings" DROP COLUMN IF EXISTS "intensity"`,
    );
  }
}
