import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 7 — Trust & Safety: Returns, Disputes, Fraud, Moderation, Hold/Release
 *
 * Creates 15 tables in FK dependency order.
 * down() drops in reverse FK order.
 */
export class Phase7TrustInit1711700001000 implements MigrationInterface {
  name = 'Phase7TrustInit1711700001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. trust_audit_logs (no FK dependencies)
    await queryRunner.query(`
      CREATE TABLE "trust_audit_logs" (
        "id"           uuid NOT NULL DEFAULT uuid_generate_v4(),
        "actor_id"     uuid,
        "actor_type"   varchar(20) NOT NULL,
        "action"       varchar(100) NOT NULL,
        "entity_type"  varchar(50) NOT NULL,
        "entity_id"    uuid NOT NULL,
        "metadata"     jsonb,
        "created_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_trust_audit_logs" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_trust_audit_entity" ON "trust_audit_logs" ("entity_type", "entity_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_trust_audit_actor" ON "trust_audit_logs" ("actor_id")`);

    // 2. return_requests
    await queryRunner.query(`
      CREATE TABLE "return_requests" (
        "id"                uuid NOT NULL DEFAULT uuid_generate_v4(),
        "order_id"          uuid NOT NULL,
        "buyer_id"          uuid NOT NULL,
        "reason_code"       varchar(50) NOT NULL,
        "reason_detail"     text,
        "status"            varchar(30) NOT NULL DEFAULT 'pending_review',
        "decision_note"     text,
        "decided_by"        uuid,
        "decided_at"        TIMESTAMPTZ,
        "refund_triggered"  boolean NOT NULL DEFAULT false,
        "clawback_triggered" boolean NOT NULL DEFAULT false,
        "idempotency_key"   varchar(255) NOT NULL,
        "created_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_return_requests_idempotency_key" UNIQUE ("idempotency_key"),
        CONSTRAINT "PK_return_requests" PRIMARY KEY ("id"),
        CONSTRAINT "FK_return_requests_order" FOREIGN KEY ("order_id") REFERENCES "orders"("id"),
        CONSTRAINT "FK_return_requests_buyer" FOREIGN KEY ("buyer_id") REFERENCES "users"("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_return_requests_order_id" ON "return_requests" ("order_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_return_requests_buyer_id" ON "return_requests" ("buyer_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_return_requests_status" ON "return_requests" ("status")`);

    // 3. return_items
    await queryRunner.query(`
      CREATE TABLE "return_items" (
        "id"                uuid NOT NULL DEFAULT uuid_generate_v4(),
        "return_request_id" uuid NOT NULL,
        "order_item_id"     uuid NOT NULL,
        "quantity"          integer NOT NULL DEFAULT 1,
        "reason_code"       varchar(50),
        "created_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_return_items" PRIMARY KEY ("id"),
        CONSTRAINT "FK_return_items_return_request"
          FOREIGN KEY ("return_request_id") REFERENCES "return_requests"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_return_items_order_item"
          FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id")
      )
    `);

    // 4. return_evidence
    await queryRunner.query(`
      CREATE TABLE "return_evidence" (
        "id"                uuid NOT NULL DEFAULT uuid_generate_v4(),
        "return_request_id" uuid NOT NULL,
        "uploaded_by"       uuid NOT NULL,
        "file_key"          varchar(500) NOT NULL,
        "file_type"         varchar(100),
        "description"       text,
        "created_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_return_evidence" PRIMARY KEY ("id"),
        CONSTRAINT "FK_return_evidence_return"
          FOREIGN KEY ("return_request_id") REFERENCES "return_requests"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_return_evidence_uploader" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id")
      )
    `);

    // 5. return_status_history
    await queryRunner.query(`
      CREATE TABLE "return_status_history" (
        "id"                uuid NOT NULL DEFAULT uuid_generate_v4(),
        "return_request_id" uuid NOT NULL,
        "from_status"       varchar(30),
        "to_status"         varchar(30) NOT NULL,
        "actor_id"          uuid,
        "actor_type"        varchar(20) NOT NULL,
        "note"              text,
        "created_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_return_status_history" PRIMARY KEY ("id"),
        CONSTRAINT "FK_return_status_history_return"
          FOREIGN KEY ("return_request_id") REFERENCES "return_requests"("id") ON DELETE CASCADE
      )
    `);

    // 6. disputes
    await queryRunner.query(`
      CREATE TABLE "disputes" (
        "id"                uuid NOT NULL DEFAULT uuid_generate_v4(),
        "order_id"          uuid NOT NULL,
        "buyer_id"          uuid NOT NULL,
        "return_request_id" uuid,
        "reason_code"       varchar(50) NOT NULL,
        "reason_detail"     text,
        "status"            varchar(30) NOT NULL DEFAULT 'open',
        "resolution"        varchar(30),
        "resolved_by"       uuid,
        "resolved_at"       TIMESTAMPTZ,
        "resolution_note"   text,
        "escalated_at"      TIMESTAMPTZ,
        "closed_at"         TIMESTAMPTZ,
        "refund_triggered"  boolean NOT NULL DEFAULT false,
        "clawback_triggered" boolean NOT NULL DEFAULT false,
        "idempotency_key"   varchar(255) NOT NULL,
        "created_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_disputes_idempotency_key" UNIQUE ("idempotency_key"),
        CONSTRAINT "PK_disputes" PRIMARY KEY ("id"),
        CONSTRAINT "FK_disputes_order"          FOREIGN KEY ("order_id") REFERENCES "orders"("id"),
        CONSTRAINT "FK_disputes_buyer"          FOREIGN KEY ("buyer_id") REFERENCES "users"("id"),
        CONSTRAINT "FK_disputes_return_request" FOREIGN KEY ("return_request_id") REFERENCES "return_requests"("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_disputes_order_id" ON "disputes" ("order_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_disputes_buyer_id" ON "disputes" ("buyer_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_disputes_status" ON "disputes" ("status")`);

    // 7. dispute_evidence
    await queryRunner.query(`
      CREATE TABLE "dispute_evidence" (
        "id"           uuid NOT NULL DEFAULT uuid_generate_v4(),
        "dispute_id"   uuid NOT NULL,
        "uploaded_by"  uuid NOT NULL,
        "file_key"     varchar(500) NOT NULL,
        "file_type"    varchar(100),
        "description"  text,
        "created_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_dispute_evidence" PRIMARY KEY ("id"),
        CONSTRAINT "FK_dispute_evidence_dispute"
          FOREIGN KEY ("dispute_id") REFERENCES "disputes"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_dispute_evidence_uploader" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id")
      )
    `);

    // 8. dispute_status_history
    await queryRunner.query(`
      CREATE TABLE "dispute_status_history" (
        "id"          uuid NOT NULL DEFAULT uuid_generate_v4(),
        "dispute_id"  uuid NOT NULL,
        "from_status" varchar(30),
        "to_status"   varchar(30) NOT NULL,
        "actor_id"    uuid,
        "actor_type"  varchar(20) NOT NULL,
        "note"        text,
        "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_dispute_status_history" PRIMARY KEY ("id"),
        CONSTRAINT "FK_dispute_status_history_dispute"
          FOREIGN KEY ("dispute_id") REFERENCES "disputes"("id") ON DELETE CASCADE
      )
    `);

    // 9. fraud_signals
    await queryRunner.query(`
      CREATE TABLE "fraud_signals" (
        "id"              uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id"         uuid,
        "order_id"        uuid,
        "signal_type"     varchar(50) NOT NULL,
        "severity"        varchar(20) NOT NULL DEFAULT 'medium',
        "source"          varchar(50) NOT NULL,
        "evidence"        jsonb,
        "rule_ref"        varchar(255),
        "status"          varchar(20) NOT NULL DEFAULT 'new',
        "reviewed_by"     uuid,
        "reviewed_at"     TIMESTAMPTZ,
        "review_note"     text,
        "idempotency_key" varchar(255) NOT NULL,
        "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_fraud_signals_idempotency_key" UNIQUE ("idempotency_key"),
        CONSTRAINT "PK_fraud_signals" PRIMARY KEY ("id"),
        CONSTRAINT "FK_fraud_signals_user"  FOREIGN KEY ("user_id")  REFERENCES "users"("id"),
        CONSTRAINT "FK_fraud_signals_order" FOREIGN KEY ("order_id") REFERENCES "orders"("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_fraud_signals_user_id" ON "fraud_signals" ("user_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_fraud_signals_order_id" ON "fraud_signals" ("order_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_fraud_signals_status" ON "fraud_signals" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_fraud_signals_signal_type" ON "fraud_signals" ("signal_type")`);

    // 10. risk_assessments
    await queryRunner.query(`
      CREATE TABLE "risk_assessments" (
        "id"             uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id"        uuid NOT NULL,
        "risk_score"     integer NOT NULL DEFAULT 0,
        "risk_level"     varchar(20) NOT NULL DEFAULT 'low',
        "signal_count"   integer NOT NULL DEFAULT 0,
        "last_signal_at" TIMESTAMPTZ,
        "calculated_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        "created_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_risk_assessments" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_risk_assessments_user" UNIQUE ("user_id"),
        CONSTRAINT "FK_risk_assessments_user" FOREIGN KEY ("user_id") REFERENCES "users"("id")
      )
    `);

    // 11. abuse_watchlist_entries
    await queryRunner.query(`
      CREATE TABLE "abuse_watchlist_entries" (
        "id"         uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id"    uuid NOT NULL,
        "reason"     text NOT NULL,
        "added_by"   uuid,
        "removed_by" uuid,
        "removed_at" TIMESTAMPTZ,
        "is_active"  boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_abuse_watchlist_entries" PRIMARY KEY ("id"),
        CONSTRAINT "FK_abuse_watchlist_user" FOREIGN KEY ("user_id") REFERENCES "users"("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_abuse_watchlist_user_id" ON "abuse_watchlist_entries" ("user_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_abuse_watchlist_is_active" ON "abuse_watchlist_entries" ("is_active")`);

    // 12. payout_holds
    await queryRunner.query(`
      CREATE TABLE "payout_holds" (
        "id"                uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id"           uuid NOT NULL,
        "payout_request_id" uuid,
        "reason_type"       varchar(50) NOT NULL,
        "reason_ref_id"     uuid,
        "reason_ref_type"   varchar(50),
        "status"            varchar(20) NOT NULL DEFAULT 'active',
        "held_by"           uuid,
        "released_by"       uuid,
        "released_at"       TIMESTAMPTZ,
        "release_note"      text,
        "idempotency_key"   varchar(255) NOT NULL,
        "created_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_payout_holds_idempotency_key" UNIQUE ("idempotency_key"),
        CONSTRAINT "PK_payout_holds" PRIMARY KEY ("id"),
        CONSTRAINT "FK_payout_holds_user"    FOREIGN KEY ("user_id") REFERENCES "users"("id"),
        CONSTRAINT "FK_payout_holds_request" FOREIGN KEY ("payout_request_id") REFERENCES "payout_requests"("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_payout_holds_user_id" ON "payout_holds" ("user_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_payout_holds_status" ON "payout_holds" ("status")`);

    // 13. commission_holds
    await queryRunner.query(`
      CREATE TABLE "commission_holds" (
        "id"                  uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id"             uuid NOT NULL,
        "commission_event_id" uuid,
        "reason_type"         varchar(50) NOT NULL,
        "reason_ref_id"       uuid,
        "reason_ref_type"     varchar(50),
        "status"              varchar(20) NOT NULL DEFAULT 'active',
        "held_by"             uuid,
        "released_by"         uuid,
        "released_at"         TIMESTAMPTZ,
        "release_note"        text,
        "idempotency_key"     varchar(255) NOT NULL,
        "created_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_commission_holds_idempotency_key" UNIQUE ("idempotency_key"),
        CONSTRAINT "PK_commission_holds" PRIMARY KEY ("id"),
        CONSTRAINT "FK_commission_holds_user"  FOREIGN KEY ("user_id") REFERENCES "users"("id"),
        CONSTRAINT "FK_commission_holds_event" FOREIGN KEY ("commission_event_id") REFERENCES "commission_events"("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_commission_holds_user_id" ON "commission_holds" ("user_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_commission_holds_status" ON "commission_holds" ("status")`);

    // 14. resolution_events
    await queryRunner.query(`
      CREATE TABLE "resolution_events" (
        "id"              uuid NOT NULL DEFAULT uuid_generate_v4(),
        "entity_type"     varchar(30) NOT NULL,
        "entity_id"       uuid NOT NULL,
        "resolution_type" varchar(50) NOT NULL,
        "actor_id"        uuid,
        "actor_type"      varchar(20) NOT NULL,
        "note"            text,
        "idempotency_key" varchar(255) NOT NULL,
        "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_resolution_events_idempotency_key" UNIQUE ("idempotency_key"),
        CONSTRAINT "PK_resolution_events" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_resolution_events_entity" ON "resolution_events" ("entity_type", "entity_id")`);

    // 15. moderation_actions
    await queryRunner.query(`
      CREATE TABLE "moderation_actions" (
        "id"              uuid NOT NULL DEFAULT uuid_generate_v4(),
        "target_type"     varchar(30) NOT NULL,
        "target_id"       uuid NOT NULL,
        "action_type"     varchar(30) NOT NULL,
        "reason"          text NOT NULL,
        "actor_id"        uuid NOT NULL,
        "actor_type"      varchar(20) NOT NULL DEFAULT 'admin',
        "expires_at"      TIMESTAMPTZ,
        "reversed_at"     TIMESTAMPTZ,
        "reversed_by"     uuid,
        "metadata"        jsonb,
        "idempotency_key" varchar(255) NOT NULL,
        "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_moderation_actions_idempotency_key" UNIQUE ("idempotency_key"),
        CONSTRAINT "PK_moderation_actions" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_moderation_actions_target" ON "moderation_actions" ("target_type", "target_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_moderation_actions_actor" ON "moderation_actions" ("actor_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop in reverse FK order
    await queryRunner.query(`DROP TABLE IF EXISTS "moderation_actions" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "resolution_events" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "commission_holds" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "payout_holds" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "abuse_watchlist_entries" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "risk_assessments" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "fraud_signals" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "dispute_status_history" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "dispute_evidence" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "disputes" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "return_status_history" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "return_evidence" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "return_items" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "return_requests" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "trust_audit_logs" CASCADE`);
  }
}
