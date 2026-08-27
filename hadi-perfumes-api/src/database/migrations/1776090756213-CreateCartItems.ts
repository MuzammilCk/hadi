import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCartItems1776090756213 implements MigrationInterface {
  name = 'CreateCartItems1776090756213';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "cart_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "listing_id" uuid NOT NULL,
        "qty" integer NOT NULL DEFAULT 1,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_cart_items_user_listing" UNIQUE ("user_id", "listing_id"),
        CONSTRAINT "PK_cart_items" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "cart_items"
        ADD CONSTRAINT "FK_cart_items_user"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "cart_items"
        ADD CONSTRAINT "FK_cart_items_listing"
        FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_cart_items_user_id" ON "cart_items" ("user_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "cart_items"`);
  }
}
