import { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase8OpsInit1711800000000 implements MigrationInterface {
  name = 'Phase8OpsInit1711800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. job_runs — operational record for every BullMQ job execution
    await queryRunner.query(`
      CREATE TABLE "job_runs" (
        "id"            uuid NOT NULL DEFAULT uuid_generate_v4(),
        "job_name"      varchar(100) NOT NULL,
        "queue_name"    varchar(100) NOT NULL,
        "bull_job_id"   varchar(255),
        "status"        varchar(20)  NOT NULL DEFAULT 'running',
        "attempt"       integer      NOT NULL DEFAULT 1,
        "actor_id"      uuid,
        "payload"       jsonb,
        "result"        jsonb,
        "error_message" text,
        "duration_ms"   integer,
        "started_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
        "completed_at"  TIMESTAMPTZ,
        "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_job_runs" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_job_runs_job_name" ON "job_runs" ("job_name")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_job_runs_status" ON "job_runs" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_job_runs_created" ON "job_runs" ("created_at" DESC)`,
    );

    // 2. dead_letter_events — jobs that exceeded retry limit
    await queryRunner.query(`
      CREATE TABLE "dead_letter_events" (
        "id"             uuid NOT NULL DEFAULT uuid_generate_v4(),
        "job_name"       varchar(100) NOT NULL,
        "queue_name"     varchar(100) NOT NULL,
        "bull_job_id"    varchar(255),
        "payload"        jsonb,
        "last_error"     text,
        "attempt_count"  integer NOT NULL DEFAULT 1,
        "replayable"     boolean NOT NULL DEFAULT false,
        "replayed_at"    TIMESTAMPTZ,
        "replayed_by"    uuid,
        "created_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_dead_letter_events" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_dead_letter_job_name" ON "dead_letter_events" ("job_name")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_dead_letter_created" ON "dead_letter_events" ("created_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_dead_letter_replayable" ON "dead_letter_events" ("replayable")`,
    );

    // 3. security_events — auth abuse, rate-limit hits, suspicious requests
    await queryRunner.query(`
      CREATE TABLE "security_events" (
        "id"           uuid NOT NULL DEFAULT uuid_generate_v4(),
        "event_type"   varchar(50)  NOT NULL,
        "severity"     varchar(20)  NOT NULL DEFAULT 'medium',
        "ip_address"   varchar(50),
        "user_id"      uuid,
        "path"         varchar(500),
        "method"       varchar(10),
        "details"      jsonb,
        "created_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_security_events" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_security_events_type" ON "security_events" ("event_type")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_security_events_user" ON "security_events" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_security_events_created" ON "security_events" ("created_at" DESC)`,
    );

    // 4. Missing indexes on hot query paths (all additive)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_commission_events_status_available"
        ON "commission_events" ("status", "available_after")
        WHERE "status" = 'pending'
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_ledger_user_type_status"
        ON "ledger_entries" ("user_id", "entry_type", "status")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_trust_audit_action_created"
        ON "trust_audit_logs" ("action", "created_at" DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_payout_requests_status_created"
        ON "payout_requests" ("status", "created_at" DESC)
        WHERE "status" = 'approved'
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_disputes_status_created"
        ON "disputes" ("status", "created_at")
        WHERE "status" = 'open'
    `);

    await queryRunner.query(`
      ALTER TABLE "resolution_events" ADD COLUMN IF NOT EXISTS "processed" boolean NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_resolution_events_type_processed"
        ON "resolution_events" ("resolution_type", "processed")
        WHERE "processed" = false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop additive indexes in reverse order
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_resolution_events_type_processed"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_disputes_status_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_payout_requests_status_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_trust_audit_action_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_ledger_user_type_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_commission_events_status_available"`,
    );

    // Drop Phase 8 tables in reverse creation order
    await queryRunner.query(`DROP TABLE IF EXISTS "security_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "dead_letter_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "job_runs"`);
  }
}
