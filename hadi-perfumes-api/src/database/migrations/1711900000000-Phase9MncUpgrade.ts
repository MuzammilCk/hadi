import { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase9MncUpgrade1711900000000 implements MigrationInterface {
  name = 'Phase9MncUpgrade1711900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add role column to users table
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "role" character varying(30) NOT NULL DEFAULT 'customer'
    `);

    // 2. Create media_assets table
    await queryRunner.query(`
      CREATE TABLE "media_assets" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "storage_key" character varying(500) NOT NULL,
        "bucket" character varying(100) NOT NULL,
        "alt_text" character varying(255),
        "width" integer,
        "height" integer,
        "mime_type" character varying(100) NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'pending',
        "uploaded_by" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_media_assets_storage_key" UNIQUE ("storage_key"),
        CONSTRAINT "PK_media_assets" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "media_assets"
      ADD CONSTRAINT "FK_media_assets_uploaded_by" FOREIGN KEY ("uploaded_by")
      REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    // 3. Create audit_logs table
    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "actor_id" uuid,
        "action" character varying(100) NOT NULL,
        "entity_type" character varying(50) NOT NULL,
        "entity_id" character varying(255) NOT NULL,
        "before_snapshot" jsonb,
        "after_snapshot" jsonb,
        "ip_address" character varying(50),
        "user_agent" character varying(500),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_audit_logs" PRIMARY KEY ("id")
      )
    `);

    // Create indexes for audit_logs query patterns
    await queryRunner.query(`
      CREATE INDEX "IDX_audit_logs_entity" ON "audit_logs" ("entity_type", "entity_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_audit_logs_actor" ON "audit_logs" ("actor_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_audit_logs_created_at" ON "audit_logs" ("created_at" DESC)
    `);

    // 4. Create homepage_sections table
    await queryRunner.query(`
      CREATE TABLE "homepage_sections" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "section_key" character varying(100) NOT NULL,
        "content" jsonb NOT NULL DEFAULT '{}',
        "media_ids" jsonb,
        "is_active" boolean NOT NULL DEFAULT true,
        "sort_order" integer NOT NULL DEFAULT 0,
        "updated_by" uuid,
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_homepage_sections_key" UNIQUE ("section_key"),
        CONSTRAINT "PK_homepage_sections" PRIMARY KEY ("id")
      )
    `);

    // 5. Seed initial homepage sections
    await queryRunner.query(`
      INSERT INTO "homepage_sections" ("section_key", "content", "is_active", "sort_order")
      VALUES
        ('hero', '{"title": "Discover the Art of Fragrance", "subtitle": "Curated luxury perfumes from around the world", "cta_text": "Shop Now", "cta_link": "/product"}', true, 0),
        ('featured_collection', '{"title": "Featured Collection", "description": "Our handpicked selection of premium fragrances", "collection_tag": "featured"}', true, 1),
        ('brand_statement', '{"title": "The Hadi Difference", "description": "Authenticity guaranteed. Every fragrance verified.", "highlights": ["100% Authentic", "Expert Curation", "Free Shipping"]}', true, 2)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "homepage_sections"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_logs_created_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_logs_actor"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_logs_entity"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs"`);

    await queryRunner.query(
      `ALTER TABLE "media_assets" DROP CONSTRAINT IF EXISTS "FK_media_assets_uploaded_by"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "media_assets"`);

    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "role"`);
  }
}
