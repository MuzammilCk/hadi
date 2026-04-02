import { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase5OrdersInit1711500000000 implements MigrationInterface {
  name = 'Phase5OrdersInit1711500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. checkout_sessions
    await queryRunner.query(`
      CREATE TABLE "checkout_sessions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "idempotency_key" character varying(255) NOT NULL,
        "buyer_id" uuid NOT NULL,
        "status" character varying(50) NOT NULL DEFAULT 'pending',
        "items" text NOT NULL,
        "subtotal" numeric(12,2) NOT NULL,
        "shipping_fee" numeric(12,2) NOT NULL DEFAULT 0,
        "tax_amount" numeric(12,2) NOT NULL DEFAULT 0,
        "discount_amount" numeric(12,2) NOT NULL DEFAULT 0,
        "total_amount" numeric(12,2) NOT NULL,
        "currency" character varying(3) NOT NULL DEFAULT 'INR',
        "reservation_ids" text NOT NULL DEFAULT '[]',
        "expires_at" TIMESTAMP WITH TIME ZONE,
        "completed_at" TIMESTAMP WITH TIME ZONE,
        "failed_reason" character varying,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_checkout_sessions_idempotency_key" UNIQUE ("idempotency_key"),
        CONSTRAINT "PK_checkout_sessions" PRIMARY KEY ("id")
      )
    `);

    // 2. orders
    await queryRunner.query(`
      CREATE TABLE "orders" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "idempotency_key" character varying(255) NOT NULL,
        "checkout_session_id" uuid,
        "buyer_id" uuid NOT NULL,
        "status" character varying(50) NOT NULL DEFAULT 'created',
        "subtotal" numeric(12,2) NOT NULL,
        "shipping_fee" numeric(12,2) NOT NULL DEFAULT 0,
        "tax_amount" numeric(12,2) NOT NULL DEFAULT 0,
        "discount_amount" numeric(12,2) NOT NULL DEFAULT 0,
        "total_amount" numeric(12,2) NOT NULL,
        "currency" character varying(3) NOT NULL DEFAULT 'INR',
        "platform_revenue" numeric(12,2) NOT NULL DEFAULT 0,
        "shipping_address" text,
        "billing_address" text,
        "contact" text,
        "notes" character varying,
        "metadata" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "completed_at" TIMESTAMP WITH TIME ZONE,
        "cancelled_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "UQ_orders_idempotency_key" UNIQUE ("idempotency_key"),
        CONSTRAINT "PK_orders" PRIMARY KEY ("id"),
        CONSTRAINT "FK_orders_buyer" FOREIGN KEY ("buyer_id") REFERENCES "users"("id"),
        CONSTRAINT "FK_orders_checkout_session" FOREIGN KEY ("checkout_session_id") REFERENCES "checkout_sessions"("id")
      )
    `);

    // 3. order_items
    await queryRunner.query(`
      CREATE TABLE "order_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "order_id" uuid NOT NULL,
        "listing_id" uuid NOT NULL,
        "inventory_reservation_id" uuid,
        "title" character varying NOT NULL,
        "sku" character varying NOT NULL,
        "unit_price" numeric(12,2) NOT NULL,
        "qty" integer NOT NULL,
        "line_total" numeric(12,2) NOT NULL,
        "currency" character varying(3) NOT NULL DEFAULT 'INR',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_order_items" PRIMARY KEY ("id"),
        CONSTRAINT "FK_order_items_order" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_order_items_listing" FOREIGN KEY ("listing_id") REFERENCES "listings"("id")
      )
    `);

    // 4. order_status_history
    await queryRunner.query(`
      CREATE TABLE "order_status_history" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "order_id" uuid NOT NULL,
        "from_status" character varying,
        "to_status" character varying NOT NULL,
        "actor_type" character varying NOT NULL,
        "actor_id" character varying,
        "reason" character varying,
        "metadata" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_order_status_history" PRIMARY KEY ("id"),
        CONSTRAINT "FK_order_status_history_order" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE
      )
    `);

    // 5. payments
    await queryRunner.query(`
      CREATE TABLE "payments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "order_id" uuid NOT NULL,
        "idempotency_key" character varying(255) NOT NULL,
        "provider" character varying NOT NULL DEFAULT 'stripe',
        "provider_payment_intent_id" character varying(255),
        "provider_charge_id" character varying,
        "status" character varying(50) NOT NULL DEFAULT 'pending',
        "amount" numeric(12,2) NOT NULL,
        "currency" character varying(3) NOT NULL DEFAULT 'INR',
        "authorized_at" TIMESTAMP WITH TIME ZONE,
        "captured_at" TIMESTAMP WITH TIME ZONE,
        "failed_at" TIMESTAMP WITH TIME ZONE,
        "refunded_at" TIMESTAMP WITH TIME ZONE,
        "failure_reason" character varying,
        "metadata" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_payments_order_id" UNIQUE ("order_id"),
        CONSTRAINT "UQ_payments_idempotency_key" UNIQUE ("idempotency_key"),
        CONSTRAINT "UQ_payments_provider_payment_intent_id" UNIQUE ("provider_payment_intent_id"),
        CONSTRAINT "PK_payments" PRIMARY KEY ("id"),
        CONSTRAINT "FK_payments_order" FOREIGN KEY ("order_id") REFERENCES "orders"("id")
      )
    `);

    // 6. payment_webhook_events
    await queryRunner.query(`
      CREATE TABLE "payment_webhook_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "provider" character varying NOT NULL,
        "provider_event_id" character varying(255) NOT NULL,
        "event_type" character varying NOT NULL,
        "payload" text NOT NULL,
        "signature_verified" boolean NOT NULL DEFAULT false,
        "processed" boolean NOT NULL DEFAULT false,
        "processed_at" TIMESTAMP WITH TIME ZONE,
        "error" character varying,
        "order_id" uuid,
        "payment_id" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_payment_webhook_events_provider_event_id" UNIQUE ("provider_event_id"),
        CONSTRAINT "PK_payment_webhook_events" PRIMARY KEY ("id"),
        CONSTRAINT "FK_payment_webhook_events_order" FOREIGN KEY ("order_id") REFERENCES "orders"("id"),
        CONSTRAINT "FK_payment_webhook_events_payment" FOREIGN KEY ("payment_id") REFERENCES "payments"("id")
      )
    `);

    // 7. order_audit_logs
    await queryRunner.query(`
      CREATE TABLE "order_audit_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "order_id" uuid NOT NULL,
        "action" character varying NOT NULL,
        "actor_type" character varying NOT NULL,
        "actor_id" character varying,
        "old_value" text,
        "new_value" text,
        "reason" character varying,
        "ip_address" character varying,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_order_audit_logs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_order_audit_logs_order" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE
      )
    `);

    // 8. money_event_outbox
    await queryRunner.query(`
      CREATE TABLE "money_event_outbox" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "event_type" character varying NOT NULL,
        "aggregate_id" uuid NOT NULL,
        "payload" text NOT NULL,
        "published" boolean NOT NULL DEFAULT false,
        "published_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_money_event_outbox" PRIMARY KEY ("id")
      )
    `);

    // Indexes
    await queryRunner.query(`CREATE INDEX "IDX_orders_buyer_id" ON "orders" ("buyer_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_orders_status" ON "orders" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_order_items_order_id" ON "order_items" ("order_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_payments_order_id" ON "payments" ("order_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_money_event_outbox_published" ON "money_event_outbox" ("published")`);

    // Add FK constraint to inventory_reservations
    await queryRunner.query(`
      ALTER TABLE "inventory_reservations"
        ADD CONSTRAINT "FK_inventory_reservations_order"
        FOREIGN KEY ("order_id")
        REFERENCES "orders"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "inventory_reservations"
        DROP CONSTRAINT IF EXISTS "FK_inventory_reservations_order"
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_money_event_outbox_published"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payments_order_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_order_items_order_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_orders_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_orders_buyer_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "money_event_outbox"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "order_audit_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "payment_webhook_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "payments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "order_status_history"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "order_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "orders"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "checkout_sessions"`);
  }
}
