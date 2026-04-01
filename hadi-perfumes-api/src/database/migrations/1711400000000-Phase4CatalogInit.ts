import { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase4CatalogInit1711400000000 implements MigrationInterface {
  name = 'Phase4CatalogInit1711400000000';

  public async up(queryRunner:QueryRunner): Promise<void> {
    // 1. product_categories
    await queryRunner.query(`
      CREATE TABLE "product_categories" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying NOT NULL,
        "slug" character varying NOT NULL,
        "parent_id" uuid,
        "description" text,
        "is_commission_eligible" boolean NOT NULL DEFAULT true,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_product_categories_slug" UNIQUE ("slug"),
        CONSTRAINT "PK_product_categories" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "product_categories" 
      ADD CONSTRAINT "FK_product_categories_parent" FOREIGN KEY ("parent_id") 
      REFERENCES "product_categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    // 2. listings
    // Keeping seller_id as the standard FK mapped to users, per Phase 4 requirements this will refer to Admin/Company users.
    await queryRunner.query(`
      CREATE TABLE "listings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "seller_id" uuid NOT NULL,
        "category_id" uuid,
        "title" character varying(255) NOT NULL,
        "description" text,
        "sku" character varying(100) NOT NULL,
        "price" numeric(12,2) NOT NULL,
        "currency" character varying(3) NOT NULL DEFAULT 'INR',
        "quantity" integer NOT NULL DEFAULT 0,
        "condition" character varying NOT NULL,
        "authenticity_status" character varying NOT NULL DEFAULT 'unverified',
        "status" character varying NOT NULL DEFAULT 'draft',
        "requires_approval" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_listings_sku" UNIQUE ("sku"),
        CONSTRAINT "PK_listings" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "listings" 
      ADD CONSTRAINT "FK_listings_seller" FOREIGN KEY ("seller_id") 
      REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "listings" 
      ADD CONSTRAINT "FK_listings_category" FOREIGN KEY ("category_id") 
      REFERENCES "product_categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    // 3. listing_images
    await queryRunner.query(`
      CREATE TABLE "listing_images" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "listing_id" uuid NOT NULL,
        "storage_key" character varying NOT NULL,
        "sort_order" integer NOT NULL DEFAULT 0,
        "is_primary" boolean NOT NULL DEFAULT false,
        "uploaded_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_listing_images" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "listing_images" 
      ADD CONSTRAINT "FK_listing_images_listing" FOREIGN KEY ("listing_id") 
      REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    // 4. listing_status_history
    await queryRunner.query(`
      CREATE TABLE "listing_status_history" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "listing_id" uuid NOT NULL,
        "from_status" character varying NOT NULL,
        "to_status" character varying NOT NULL,
        "actor_id" uuid,
        "actor_type" character varying NOT NULL DEFAULT 'system',
        "reason" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_listing_status_history" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "listing_status_history" 
      ADD CONSTRAINT "FK_listing_status_history_listing" FOREIGN KEY ("listing_id") 
      REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    // 5. listing_moderation_actions
    await queryRunner.query(`
      CREATE TABLE "listing_moderation_actions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "listing_id" uuid NOT NULL,
        "admin_id" uuid NOT NULL,
        "action" character varying NOT NULL,
        "reason" text,
        "evidence" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_listing_moderation_actions" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "listing_moderation_actions" 
      ADD CONSTRAINT "FK_listing_moderation_actions_listing" FOREIGN KEY ("listing_id") 
      REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "listing_moderation_actions" 
      ADD CONSTRAINT "FK_listing_moderation_actions_admin" FOREIGN KEY ("admin_id") 
      REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    // 6. inventory_items
    await queryRunner.query(`
      CREATE TABLE "inventory_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "listing_id" uuid NOT NULL,
        "total_qty" integer NOT NULL DEFAULT 0,
        "available_qty" integer NOT NULL DEFAULT 0,
        "reserved_qty" integer NOT NULL DEFAULT 0,
        "sold_qty" integer NOT NULL DEFAULT 0,
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_inventory_items_listing" UNIQUE ("listing_id"),
        CONSTRAINT "PK_inventory_items" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "inventory_items" 
      ADD CONSTRAINT "FK_inventory_items_listing" FOREIGN KEY ("listing_id") 
      REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    // 7. inventory_reservations
    await queryRunner.query(`
      CREATE TABLE "inventory_reservations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "listing_id" uuid NOT NULL,
        "inventory_item_id" uuid NOT NULL,
        "order_id" uuid,
        "reserved_by_user_id" uuid NOT NULL,
        "qty" integer NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "status" character varying NOT NULL DEFAULT 'reserved',
        "reservation_ttl_seconds" integer NOT NULL DEFAULT 900,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_inventory_reservations" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "inventory_reservations" 
      ADD CONSTRAINT "FK_inventory_reservations_listing" FOREIGN KEY ("listing_id") 
      REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "inventory_reservations" 
      ADD CONSTRAINT "FK_inventory_reservations_inventory_item" FOREIGN KEY ("inventory_item_id") 
      REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    // 8. inventory_events
    await queryRunner.query(`
      CREATE TABLE "inventory_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "inventory_item_id" uuid NOT NULL,
        "listing_id" uuid NOT NULL,
        "event_type" character varying NOT NULL,
        "qty_delta" integer NOT NULL,
        "qty_after" integer NOT NULL,
        "actor_id" uuid,
        "reference_id" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_inventory_events" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "inventory_events" 
      ADD CONSTRAINT "FK_inventory_events_inventory_item" FOREIGN KEY ("inventory_item_id") 
      REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "inventory_events" 
      ADD CONSTRAINT "FK_inventory_events_listing" FOREIGN KEY ("listing_id") 
      REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner:QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "inventory_events" DROP CONSTRAINT "FK_inventory_events_listing"`);
    await queryRunner.query(`ALTER TABLE "inventory_events" DROP CONSTRAINT "FK_inventory_events_inventory_item"`);
    
    await queryRunner.query(`ALTER TABLE "inventory_reservations" DROP CONSTRAINT "FK_inventory_reservations_inventory_item"`);
    await queryRunner.query(`ALTER TABLE "inventory_reservations" DROP CONSTRAINT "FK_inventory_reservations_listing"`);
    
    await queryRunner.query(`ALTER TABLE "inventory_items" DROP CONSTRAINT "FK_inventory_items_listing"`);
    
    await queryRunner.query(`ALTER TABLE "listing_moderation_actions" DROP CONSTRAINT "FK_listing_moderation_actions_admin"`);
    await queryRunner.query(`ALTER TABLE "listing_moderation_actions" DROP CONSTRAINT "FK_listing_moderation_actions_listing"`);
    
    await queryRunner.query(`ALTER TABLE "listing_status_history" DROP CONSTRAINT "FK_listing_status_history_listing"`);
    
    await queryRunner.query(`ALTER TABLE "listing_images" DROP CONSTRAINT "FK_listing_images_listing"`);
    
    await queryRunner.query(`ALTER TABLE "listings" DROP CONSTRAINT "FK_listings_category"`);
    await queryRunner.query(`ALTER TABLE "listings" DROP CONSTRAINT "FK_listings_seller"`);
    
    await queryRunner.query(`ALTER TABLE "product_categories" DROP CONSTRAINT "FK_product_categories_parent"`);

    await queryRunner.query(`DROP TABLE "inventory_events"`);
    await queryRunner.query(`DROP TABLE "inventory_reservations"`);
    await queryRunner.query(`DROP TABLE "inventory_items"`);
    await queryRunner.query(`DROP TABLE "listing_moderation_actions"`);
    await queryRunner.query(`DROP TABLE "listing_status_history"`);
    await queryRunner.query(`DROP TABLE "listing_images"`);
    await queryRunner.query(`DROP TABLE "listings"`);
    await queryRunner.query(`DROP TABLE "product_categories"`);
  }
}
