import { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase2ModelInit1711200000000 implements MigrationInterface {
  name = 'Phase2ModelInit1711200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enum Types for PostgreSQL
    await queryRunner.query(
      `CREATE TYPE "public"."user_status_enum" AS ENUM('pending_otp', 'active', 'suspended', 'banned')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."user_kyc_status_enum" AS ENUM('not_required', 'pending', 'verified', 'rejected')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."referral_code_status_enum" AS ENUM('active', 'disabled', 'exhausted')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."onboarding_attempt_stage_enum" AS ENUM('otp_sent', 'otp_verified', 'referral_validated', 'completed', 'failed')`,
    );

    // Create Tables
    await queryRunner.query(`CREATE TABLE "users" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "phone" character varying(20) NOT NULL,
      "email" character varying(255),
      "password_hash" character varying(255),
      "full_name" character varying(255),
      "status" "public"."user_status_enum" NOT NULL DEFAULT 'pending_otp',
      "kyc_status" "public"."user_kyc_status_enum" NOT NULL DEFAULT 'not_required',
      "device_hash" character varying(255),
      "ip_at_signup" inet,
      "sponsor_id" uuid,
      "onboarding_completed_at" TIMESTAMP WITH TIME ZONE,
      "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "UQ_a000cca60bcf04454e727699490" UNIQUE ("phone"),
      CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"),
      CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id")
    )`);

    await queryRunner.query(`CREATE TABLE "referral_codes" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "code" character varying(32) NOT NULL,
      "owner_id" uuid NOT NULL,
      "status" "public"."referral_code_status_enum" NOT NULL DEFAULT 'active',
      "max_uses" integer,
      "uses_count" integer NOT NULL DEFAULT 0,
      "expires_at" TIMESTAMP WITH TIME ZONE,
      "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "UQ_b90554ee5e1a2f6bfbaeb33d98d" UNIQUE ("code"),
      CONSTRAINT "PK_fcc7316719dc18adce9ee08316c" PRIMARY KEY ("id")
    )`);

    await queryRunner.query(`CREATE TABLE "referral_redemptions" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "code_id" uuid NOT NULL,
      "redeemed_by_user_id" uuid NOT NULL,
      "sponsor_id" uuid NOT NULL,
      "ip_address" inet,
      "device_hash" character varying,
      "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_29cfc04153965ee91a45bed28bd" PRIMARY KEY ("id")
    )`);

    await queryRunner.query(`CREATE TABLE "sponsorship_links" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "user_id" uuid NOT NULL,
      "sponsor_id" uuid NOT NULL,
      "referral_code_id" uuid NOT NULL,
      "upline_path" text NOT NULL,
      "corrected_at" TIMESTAMP WITH TIME ZONE,
      "corrected_by" uuid,
      "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "UQ_a48f2fae3dd096bade27bdfa663" UNIQUE ("user_id"),
      CONSTRAINT "PK_c64cdfc41d13b6329ff0aa8f81d" PRIMARY KEY ("id")
    )`);

    await queryRunner.query(`CREATE TABLE "onboarding_attempts" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "phone" character varying(20) NOT NULL,
      "ip_address" inet,
      "device_hash" character varying,
      "stage" "public"."onboarding_attempt_stage_enum" NOT NULL,
      "failure_reason" character varying,
      "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_3c35bba7f58d9a26315efea2cca" PRIMARY KEY ("id")
    )`);

    await queryRunner.query(`CREATE TABLE "otp_verifications" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "phone" character varying(20) NOT NULL,
      "otp_hash" character varying(255) NOT NULL,
      "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
      "verified_at" TIMESTAMP WITH TIME ZONE,
      "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_ab6bb0ced0fb0bedcf85dc8c8d2" PRIMARY KEY ("id")
    )`);

    await queryRunner.query(`CREATE TABLE "refresh_tokens" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "user_id" uuid NOT NULL,
      "token_hash" character varying(255) NOT NULL,
      "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
      "revoked_at" TIMESTAMP WITH TIME ZONE,
      "ip_address" inet,
      "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_764653e07dbd48eb43eeba9ebaf" PRIMARY KEY ("id")
    )`);

    await queryRunner.query(`CREATE TABLE "onboarding_audit_logs" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "actor_id" uuid,
      "action" character varying NOT NULL,
      "target_type" character varying NOT NULL,
      "target_id" uuid NOT NULL,
      "metadata" text,
      "ip_address" inet,
      "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_bd4a18ad2c3fb66eec6a1f1bf40" PRIMARY KEY ("id")
    )`);

    // Foreign Keys
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_287dafeaa2a970e7a17730e23b8" FOREIGN KEY ("sponsor_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "referral_codes" ADD CONSTRAINT "FK_owner_id" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "referral_redemptions" ADD CONSTRAINT "FK_code_id" FOREIGN KEY ("code_id") REFERENCES "referral_codes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "referral_redemptions" ADD CONSTRAINT "FK_redeemed_by_user_id" FOREIGN KEY ("redeemed_by_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "referral_redemptions" ADD CONSTRAINT "FK_sponsor_id" FOREIGN KEY ("sponsor_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "sponsorship_links" ADD CONSTRAINT "FK_link_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "sponsorship_links" ADD CONSTRAINT "FK_link_sponsor_id" FOREIGN KEY ("sponsor_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "sponsorship_links" ADD CONSTRAINT "FK_link_referral_code_id" FOREIGN KEY ("referral_code_id") REFERENCES "referral_codes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD CONSTRAINT "FK_rt_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP CONSTRAINT "FK_rt_user_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sponsorship_links" DROP CONSTRAINT "FK_link_referral_code_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sponsorship_links" DROP CONSTRAINT "FK_link_sponsor_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sponsorship_links" DROP CONSTRAINT "FK_link_user_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "referral_redemptions" DROP CONSTRAINT "FK_sponsor_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "referral_redemptions" DROP CONSTRAINT "FK_redeemed_by_user_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "referral_redemptions" DROP CONSTRAINT "FK_code_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "referral_codes" DROP CONSTRAINT "FK_owner_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "FK_287dafeaa2a970e7a17730e23b8"`,
    );

    await queryRunner.query(`DROP TABLE "onboarding_audit_logs"`);
    await queryRunner.query(`DROP TABLE "refresh_tokens"`);
    await queryRunner.query(`DROP TABLE "otp_verifications"`);
    await queryRunner.query(`DROP TABLE "onboarding_attempts"`);
    await queryRunner.query(`DROP TABLE "sponsorship_links"`);
    await queryRunner.query(`DROP TABLE "referral_redemptions"`);
    await queryRunner.query(`DROP TABLE "referral_codes"`);
    await queryRunner.query(`DROP TABLE "users"`);

    await queryRunner.query(
      `DROP TYPE "public"."onboarding_attempt_stage_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."referral_code_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."user_kyc_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."user_status_enum"`);
  }
}
