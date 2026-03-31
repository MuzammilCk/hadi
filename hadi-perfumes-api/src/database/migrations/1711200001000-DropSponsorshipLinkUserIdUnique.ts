import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropSponsorshipLinkUserIdUnique1711200001000
  implements MigrationInterface
{
  name = 'DropSponsorshipLinkUserIdUnique1711200001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sponsorship_links" DROP CONSTRAINT IF EXISTS "UQ_a48f2fae3dd096bade27bdfa663"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sponsorship_links" ADD CONSTRAINT "UQ_a48f2fae3dd096bade27bdfa663" UNIQUE ("user_id")`,
    );
  }
}
