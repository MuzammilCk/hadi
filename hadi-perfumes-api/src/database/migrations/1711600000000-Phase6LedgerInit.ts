import { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase6LedgerInit1711600000000 implements MigrationInterface {
  name = 'Phase6LedgerInit1711600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. commission_events
    await queryRunner.query(`
      CREATE TABLE "commission_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "order_id" uuid NOT NULL,
        "beneficiary_id" uuid NOT NULL,
        "commission_level" integer NOT NULL,
        "policy_version_id" uuid NOT NULL,
        "rule_id" uuid NOT NULL,
        "calculated_amount" numeric(12,2) NOT NULL,
        "currency" character varying(3) NOT NULL DEFAULT 'INR',
        "status" character varying(50) NOT NULL DEFAULT 'pending',
        "available_after" TIMESTAMP WITH TIME ZONE NOT NULL,
        "clawback_before" TIMESTAMP WITH TIME ZONE NOT NULL,
        "idempotency_key" character varying(255) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_commission_events_idempotency_key" UNIQUE ("idempotency_key"),
        CONSTRAINT "UQ_commission_events_order_beneficiary_level"
          UNIQUE ("order_id", "beneficiary_id", "commission_level"),
        CONSTRAINT "PK_commission_events" PRIMARY KEY ("id"),
        CONSTRAINT "FK_commission_events_order"
          FOREIGN KEY ("order_id") REFERENCES "orders"("id"),
        CONSTRAINT "FK_commission_events_beneficiary"
          FOREIGN KEY ("beneficiary_id") REFERENCES "users"("id"),
        CONSTRAINT "FK_commission_events_policy_version"
          FOREIGN KEY ("policy_version_id") REFERENCES "compensation_policy_versions"("id"),
        CONSTRAINT "FK_commission_events_rule"
          FOREIGN KEY ("rule_id") REFERENCES "commission_rules"("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_commission_events_status" ON "commission_events" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_commission_events_available_after" ON "commission_events" ("available_after")`);
    await queryRunner.query(`CREATE INDEX "IDX_commission_events_beneficiary_id" ON "commission_events" ("beneficiary_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_commission_events_order_id" ON "commission_events" ("order_id")`);

    // 2. commission_event_sources
    await queryRunner.query(`
      CREATE TABLE "commission_event_sources" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "commission_event_id" uuid NOT NULL,
        "outbox_event_id" uuid NOT NULL,
        "order_id" uuid NOT NULL,
        "buyer_id" uuid NOT NULL,
        "total_amount" numeric(12,2) NOT NULL,
        "currency" character varying(3) NOT NULL DEFAULT 'INR',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_commission_event_sources" PRIMARY KEY ("id"),
        CONSTRAINT "FK_commission_event_sources_commission_event"
          FOREIGN KEY ("commission_event_id") REFERENCES "commission_events"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_commission_event_sources_outbox"
          FOREIGN KEY ("outbox_event_id") REFERENCES "money_event_outbox"("id")
      )
    `);

    // 3. ledger_entries — NO updated_at column (append-only)
    await queryRunner.query(`
      CREATE TABLE "ledger_entries" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "entry_type" character varying(50) NOT NULL,
        "amount" numeric(12,2) NOT NULL,
        "currency" character varying(3) NOT NULL DEFAULT 'INR',
        "status" character varying(50) NOT NULL DEFAULT 'pending',
        "reference_id" uuid NOT NULL,
        "reference_type" character varying(50) NOT NULL,
        "reversal_of_entry_id" uuid,
        "note" text,
        "idempotency_key" character varying(255) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_ledger_entries_idempotency_key" UNIQUE ("idempotency_key"),
        CONSTRAINT "PK_ledger_entries" PRIMARY KEY ("id"),
        CONSTRAINT "FK_ledger_entries_user" FOREIGN KEY ("user_id") REFERENCES "users"("id"),
        CONSTRAINT "FK_ledger_entries_reversal"
          FOREIGN KEY ("reversal_of_entry_id") REFERENCES "ledger_entries"("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_ledger_entries_user_id" ON "ledger_entries" ("user_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_ledger_entries_reference_id" ON "ledger_entries" ("reference_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_ledger_entries_entry_type" ON "ledger_entries" ("entry_type")`);
    await queryRunner.query(`CREATE INDEX "IDX_ledger_entries_status" ON "ledger_entries" ("status")`);

    // 4. payout_batches (before payout_requests — FK dependency)
    await queryRunner.query(`
      CREATE TABLE "payout_batches" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "status" character varying(50) NOT NULL DEFAULT 'pending',
        "total_amount" numeric(12,2) NOT NULL DEFAULT 0,
        "currency" character varying(3) NOT NULL DEFAULT 'INR',
        "request_count" integer NOT NULL DEFAULT 0,
        "processed_count" integer NOT NULL DEFAULT 0,
        "failed_count" integer NOT NULL DEFAULT 0,
        "initiated_by" uuid NOT NULL,
        "started_at" TIMESTAMP WITH TIME ZONE,
        "completed_at" TIMESTAMP WITH TIME ZONE,
        "error_summary" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payout_batches" PRIMARY KEY ("id")
      )
    `);

    // 5. payout_requests
    await queryRunner.query(`
      CREATE TABLE "payout_requests" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "amount" numeric(12,2) NOT NULL,
        "currency" character varying(3) NOT NULL DEFAULT 'INR',
        "status" character varying(50) NOT NULL DEFAULT 'requested',
        "idempotency_key" character varying(255) NOT NULL,
        "payout_method" text,
        "batch_id" uuid,
        "approved_by" uuid,
        "approved_at" TIMESTAMP WITH TIME ZONE,
        "rejected_by" uuid,
        "rejected_at" TIMESTAMP WITH TIME ZONE,
        "rejection_reason" text,
        "failure_reason" text,
        "provider_ref_id" character varying(255),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_payout_requests_idempotency_key" UNIQUE ("idempotency_key"),
        CONSTRAINT "PK_payout_requests" PRIMARY KEY ("id"),
        CONSTRAINT "FK_payout_requests_user" FOREIGN KEY ("user_id") REFERENCES "users"("id"),
        CONSTRAINT "FK_payout_requests_batch"
          FOREIGN KEY ("batch_id") REFERENCES "payout_batches"("id"),
        CONSTRAINT "FK_payout_requests_approved_by"
          FOREIGN KEY ("approved_by") REFERENCES "users"("id"),
        CONSTRAINT "FK_payout_requests_rejected_by"
          FOREIGN KEY ("rejected_by") REFERENCES "users"("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_payout_requests_user_id" ON "payout_requests" ("user_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_payout_requests_status" ON "payout_requests" ("status")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payout_requests_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payout_requests_user_id"`);
    await queryRunner.query(`DROP TABLE "payout_requests"`);
    await queryRunner.query(`DROP TABLE "payout_batches"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ledger_entries_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ledger_entries_entry_type"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ledger_entries_reference_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ledger_entries_user_id"`);
    await queryRunner.query(`DROP TABLE "ledger_entries"`);
    await queryRunner.query(`DROP TABLE "commission_event_sources"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_commission_events_order_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_commission_events_beneficiary_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_commission_events_available_after"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_commission_events_status"`);
    await queryRunner.query(`DROP TABLE "commission_events"`);
  }
}
