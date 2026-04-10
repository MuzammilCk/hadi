import { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase6PayoutLedgerId1711600000001 implements MigrationInterface {
  name = 'Phase6PayoutLedgerId1711600000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payout_requests" ADD "ledger_entry_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "payout_requests" ADD CONSTRAINT "FK_payout_requests_ledger_entry" FOREIGN KEY ("ledger_entry_id") REFERENCES "ledger_entries"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payout_requests" DROP CONSTRAINT "FK_payout_requests_ledger_entry"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payout_requests" DROP COLUMN "ledger_entry_id"`,
    );
  }
}
