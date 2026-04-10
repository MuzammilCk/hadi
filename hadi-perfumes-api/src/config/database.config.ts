import { DataSource, DataSourceOptions } from 'typeorm';
import * as dotenv from 'dotenv';
dotenv.config();

const dbUrl =
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/hadi_perfumes';

/**
 * SSL auto-detection:
 *  - Disabled for localhost / 127.0.0.1 (local dev)
 *  - Disabled when DATABASE_SSL=false is explicitly set
 *  - Enabled (rejectUnauthorized:false) for all remote hosts (Supabase, RDS, etc.)
 *
 * Supabase pooler requires SSL — without it the connection is refused.
 */
const isLocalDb = dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1');

const sslConfig =
  process.env.DATABASE_SSL === 'false' || isLocalDb
    ? false
    : { rejectUnauthorized: false };

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  url: dbUrl,
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
  synchronize: false, // Never use synchronize in production
  ssl: sslConfig,
  // Required by Supabase Supavisor (transaction-mode pooler on port 6543).
  // Disables server-side prepared statements which are not supported in transaction mode.
  extra: {
    options: '-c statement_timeout=30000',
    // Fix L1: disable prepared statements for Supabase transaction-mode pooler
    ...(sslConfig ? { prepare: false } : {}),
  },
};

const dataSource = new DataSource(dataSourceOptions);
export default dataSource;
