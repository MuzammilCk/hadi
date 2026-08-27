import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
} from 'typeorm';

export class Phase3NetworkInit1711300000000 implements MigrationInterface {
  name = 'Phase3NetworkInit1711300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. network_nodes — computed graph state per user
    await queryRunner.createTable(
      new Table({
        name: 'network_nodes',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
          },
          { name: 'user_id', type: 'uuid', isNullable: false, isUnique: true },
          { name: 'sponsor_id', type: 'uuid', isNullable: true },
          {
            name: 'upline_path',
            type: 'text',
            isNullable: false,
            default: "'[]'",
          },
          { name: 'depth', type: 'integer', isNullable: false, default: 0 },
          {
            name: 'direct_count',
            type: 'integer',
            isNullable: false,
            default: 0,
          },
          {
            name: 'total_downline',
            type: 'integer',
            isNullable: false,
            default: 0,
          },
          {
            name: 'last_rebuilt_at',
            type: 'timestamptz',
            isNullable: false,
            default: 'now()',
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            isNullable: false,
            default: 'now()',
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            isNullable: false,
            default: 'now()',
          },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      'network_nodes',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'network_nodes',
      new TableForeignKey({
        columnNames: ['sponsor_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );

    // 2. qualification_rules — versioned, configurable qualification criteria
    await queryRunner.createTable(
      new Table({
        name: 'qualification_rules',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
          },
          { name: 'policy_version_id', type: 'uuid', isNullable: false },
          { name: 'rule_key', type: 'varchar', isNullable: false },
          { name: 'rule_type', type: 'varchar', isNullable: false },
          {
            name: 'threshold_value',
            type: 'numeric',
            precision: 12,
            scale: 2,
            isNullable: false,
          },
          { name: 'window_days', type: 'integer', isNullable: false },
          {
            name: 'currency',
            type: 'varchar',
            length: '3',
            isNullable: false,
            default: "'USD'",
          },
          {
            name: 'is_mandatory',
            type: 'boolean',
            isNullable: false,
            default: true,
          },
          { name: 'description', type: 'text', isNullable: true },
          {
            name: 'created_at',
            type: 'timestamptz',
            isNullable: false,
            default: 'now()',
          },
        ],
        uniques: [{ columnNames: ['policy_version_id', 'rule_key'] }],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      'qualification_rules',
      new TableForeignKey({
        columnNames: ['policy_version_id'],
        referencedTableName: 'compensation_policy_versions',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    // 3. qualification_states — current qualification state per user
    await queryRunner.createTable(
      new Table({
        name: 'qualification_states',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
          },
          { name: 'user_id', type: 'uuid', isNullable: false, isUnique: true },
          {
            name: 'is_active',
            type: 'boolean',
            isNullable: false,
            default: false,
          },
          {
            name: 'is_qualified',
            type: 'boolean',
            isNullable: false,
            default: false,
          },
          { name: 'current_rank_id', type: 'uuid', isNullable: true },
          {
            name: 'personal_volume',
            type: 'numeric',
            precision: 12,
            scale: 2,
            isNullable: false,
            default: 0,
          },
          {
            name: 'downline_volume',
            type: 'numeric',
            precision: 12,
            scale: 2,
            isNullable: false,
            default: 0,
          },
          {
            name: 'active_legs_count',
            type: 'integer',
            isNullable: false,
            default: 0,
          },
          { name: 'policy_version_id', type: 'uuid', isNullable: true },
          {
            name: 'evaluated_at',
            type: 'timestamptz',
            isNullable: false,
            default: 'now()',
          },
          { name: 'disqualified_reason', type: 'varchar', isNullable: true },
          {
            name: 'created_at',
            type: 'timestamptz',
            isNullable: false,
            default: 'now()',
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            isNullable: false,
            default: 'now()',
          },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      'qualification_states',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'qualification_states',
      new TableForeignKey({
        columnNames: ['policy_version_id'],
        referencedTableName: 'compensation_policy_versions',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );

    // 4. qualification_events — immutable audit of every qualification state change
    await queryRunner.createTable(
      new Table({
        name: 'qualification_events',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
          },
          { name: 'user_id', type: 'uuid', isNullable: false },
          { name: 'event_type', type: 'varchar', isNullable: false },
          { name: 'previous_state', type: 'text', isNullable: true },
          { name: 'new_state', type: 'text', isNullable: true },
          { name: 'trigger_source', type: 'varchar', isNullable: false },
          { name: 'trigger_ref_id', type: 'uuid', isNullable: true },
          { name: 'policy_version_id', type: 'uuid', isNullable: true },
          { name: 'actor_id', type: 'uuid', isNullable: true },
          { name: 'metadata', type: 'text', isNullable: true },
          {
            name: 'created_at',
            type: 'timestamptz',
            isNullable: false,
            default: 'now()',
          },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      'qualification_events',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'qualification_events',
      new TableForeignKey({
        columnNames: ['policy_version_id'],
        referencedTableName: 'compensation_policy_versions',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );

    // 5. rank_assignments — current and historical rank assignments per user
    await queryRunner.createTable(
      new Table({
        name: 'rank_assignments',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
          },
          { name: 'user_id', type: 'uuid', isNullable: false },
          { name: 'rank_rule_id', type: 'uuid', isNullable: false },
          {
            name: 'assigned_at',
            type: 'timestamptz',
            isNullable: false,
            default: 'now()',
          },
          { name: 'revoked_at', type: 'timestamptz', isNullable: true },
          { name: 'assigned_by', type: 'varchar', isNullable: false },
          { name: 'policy_version_id', type: 'uuid', isNullable: false },
          { name: 'metadata', type: 'text', isNullable: true },
          {
            name: 'created_at',
            type: 'timestamptz',
            isNullable: false,
            default: 'now()',
          },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      'rank_assignments',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'rank_assignments',
      new TableForeignKey({
        columnNames: ['rank_rule_id'],
        referencedTableName: 'rank_rules',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'rank_assignments',
      new TableForeignKey({
        columnNames: ['policy_version_id'],
        referencedTableName: 'compensation_policy_versions',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    // 6. graph_rebuild_jobs — tracks background graph rebuild executions
    await queryRunner.createTable(
      new Table({
        name: 'graph_rebuild_jobs',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
          },
          { name: 'job_type', type: 'varchar', isNullable: false },
          {
            name: 'status',
            type: 'varchar',
            isNullable: false,
            default: "'pending'",
          },
          { name: 'triggered_by', type: 'varchar', isNullable: false },
          { name: 'actor_id', type: 'uuid', isNullable: true },
          { name: 'target_user_id', type: 'uuid', isNullable: true },
          {
            name: 'nodes_processed',
            type: 'integer',
            isNullable: false,
            default: 0,
          },
          { name: 'error_message', type: 'text', isNullable: true },
          { name: 'started_at', type: 'timestamptz', isNullable: true },
          { name: 'completed_at', type: 'timestamptz', isNullable: true },
          {
            name: 'created_at',
            type: 'timestamptz',
            isNullable: false,
            default: 'now()',
          },
        ],
      }),
      true,
    );

    // 7. graph_correction_logs — immutable record of every admin-initiated graph correction
    await queryRunner.createTable(
      new Table({
        name: 'graph_correction_logs',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
          },
          { name: 'user_id', type: 'uuid', isNullable: false },
          { name: 'correction_type', type: 'varchar', isNullable: false },
          { name: 'old_sponsor_id', type: 'uuid', isNullable: true },
          { name: 'new_sponsor_id', type: 'uuid', isNullable: true },
          { name: 'old_upline_path', type: 'text', isNullable: true },
          { name: 'new_upline_path', type: 'text', isNullable: true },
          { name: 'reason', type: 'text', isNullable: false },
          { name: 'actor_id', type: 'uuid', isNullable: false },
          {
            name: 'sponsorship_link_correction_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            isNullable: false,
            default: 'now()',
          },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      'graph_correction_logs',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    // 8. network_snapshots — periodic snapshots of the full graph state
    await queryRunner.createTable(
      new Table({
        name: 'network_snapshots',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
          },
          { name: 'snapshot_type', type: 'varchar', isNullable: false },
          {
            name: 'user_count',
            type: 'integer',
            isNullable: false,
            default: 0,
          },
          { name: 'snapshot_data', type: 'text', isNullable: false },
          { name: 'triggered_by', type: 'varchar', isNullable: false },
          { name: 'actor_id', type: 'uuid', isNullable: true },
          {
            name: 'created_at',
            type: 'timestamptz',
            isNullable: false,
            default: 'now()',
          },
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop in reverse FK-safe order
    await queryRunner.dropTable('network_snapshots', true);
    await queryRunner.dropTable('graph_correction_logs', true);
    await queryRunner.dropTable('graph_rebuild_jobs', true);
    await queryRunner.dropTable('rank_assignments', true);
    await queryRunner.dropTable('qualification_events', true);
    await queryRunner.dropTable('qualification_states', true);
    await queryRunner.dropTable('qualification_rules', true);
    await queryRunner.dropTable('network_nodes', true);
  }
}
