import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddRetailOnlyToRules1711300001000 implements MigrationInterface {
  name = 'AddRetailOnlyToRules1711300001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'qualification_rules',
      new TableColumn({
        name: 'is_retail_only',
        type: 'boolean',
        isNullable: false,
        default: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('qualification_rules', 'is_retail_only');
  }
}
