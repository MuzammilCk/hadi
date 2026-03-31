import { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase1CommissionInit1711100000000 implements MigrationInterface {
  name = 'Phase1CommissionInit1711100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enum type for policy status
    await queryRunner.query(
      `CREATE TYPE "public"."compensation_policy_status_enum" AS ENUM('draft', 'active', 'archived', 'deprecated')`,
    );

    // compensation_policy_versions
    await queryRunner.query(`CREATE TABLE "compensation_policy_versions" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "version" integer NOT NULL,
      "name" character varying,
      "description" text,
      "status" "public"."compensation_policy_status_enum" NOT NULL DEFAULT 'draft',
      "effective_from" TIMESTAMP WITH TIME ZONE,
      "effective_to" TIMESTAMP WITH TIME ZONE,
      "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "UQ_compensation_policy_version" UNIQUE ("version"),
      CONSTRAINT "PK_compensation_policy_versions" PRIMARY KEY ("id")
    )`);

    // commission_rules
    await queryRunner.query(`CREATE TABLE "commission_rules" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "policy_version_id" uuid,
      "level" integer NOT NULL,
      "percentage" numeric(5,4) NOT NULL,
      "min_order_value" numeric(12,2) NOT NULL DEFAULT 0,
      "eligible_categories" text,
      "eligible_seller_statuses" text,
      "cap_per_order" numeric(12,2),
      "payout_delay_days" integer NOT NULL DEFAULT 14,
      "clawback_window_days" integer NOT NULL DEFAULT 30,
      "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_commission_rules" PRIMARY KEY ("id")
    )`);

    // rank_rules
    await queryRunner.query(`CREATE TABLE "rank_rules" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "policy_version_id" uuid,
      "rank_level" integer NOT NULL,
      "rank_name" character varying NOT NULL,
      "personal_sales_volume_requirement" numeric(12,2) NOT NULL DEFAULT 0,
      "downline_sales_volume_requirement" numeric(12,2) NOT NULL DEFAULT 0,
      "active_legs_requirement" integer NOT NULL DEFAULT 0,
      "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_rank_rules" PRIMARY KEY ("id")
    )`);

    // compliance_disclosures
    await queryRunner.query(`CREATE TABLE "compliance_disclosures" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "policy_version_id" uuid,
      "disclosure_key" character varying NOT NULL,
      "disclosure_text" text NOT NULL,
      "is_mandatory" boolean NOT NULL DEFAULT true,
      "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_compliance_disclosures" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_compliance_disclosure_policy_key" UNIQUE ("policy_version_id", "disclosure_key")
    )`);

    // allowed_earnings_claims
    await queryRunner.query(`CREATE TABLE "allowed_earnings_claims" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "policy_version_id" uuid,
      "claim_text" text NOT NULL,
      "context" character varying,
      "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_allowed_earnings_claims" PRIMARY KEY ("id")
    )`);

    // rule_audit_logs
    await queryRunner.query(`CREATE TABLE "rule_audit_logs" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "actor_id" uuid,
      "action" character varying NOT NULL,
      "target_type" character varying NOT NULL,
      "target_id" uuid NOT NULL,
      "metadata" text,
      "ip_address" inet,
      "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_rule_audit_logs" PRIMARY KEY ("id")
    )`);

    // Foreign Keys
    await queryRunner.query(
      `ALTER TABLE "commission_rules" ADD CONSTRAINT "FK_commission_rules_policy_version" FOREIGN KEY ("policy_version_id") REFERENCES "compensation_policy_versions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "rank_rules" ADD CONSTRAINT "FK_rank_rules_policy_version" FOREIGN KEY ("policy_version_id") REFERENCES "compensation_policy_versions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "compliance_disclosures" ADD CONSTRAINT "FK_compliance_disclosures_policy_version" FOREIGN KEY ("policy_version_id") REFERENCES "compensation_policy_versions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "allowed_earnings_claims" ADD CONSTRAINT "FK_allowed_earnings_claims_policy_version" FOREIGN KEY ("policy_version_id") REFERENCES "compensation_policy_versions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "allowed_earnings_claims" DROP CONSTRAINT "FK_allowed_earnings_claims_policy_version"`,
    );
    await queryRunner.query(
      `ALTER TABLE "compliance_disclosures" DROP CONSTRAINT "FK_compliance_disclosures_policy_version"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rank_rules" DROP CONSTRAINT "FK_rank_rules_policy_version"`,
    );
    await queryRunner.query(
      `ALTER TABLE "commission_rules" DROP CONSTRAINT "FK_commission_rules_policy_version"`,
    );

    await queryRunner.query(`DROP TABLE "rule_audit_logs"`);
    await queryRunner.query(`DROP TABLE "allowed_earnings_claims"`);
    await queryRunner.query(`DROP TABLE "compliance_disclosures"`);
    await queryRunner.query(`DROP TABLE "rank_rules"`);
    await queryRunner.query(`DROP TABLE "commission_rules"`);
    await queryRunner.query(`DROP TABLE "compensation_policy_versions"`);

    await queryRunner.query(
      `DROP TYPE "public"."compensation_policy_status_enum"`,
    );
  }
}
