import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';
import { tstz } from '../../../../common/utils/db-type.util';

@Entity('return_items')
export class ReturnItem {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) return_request_id: string;
  @Column({ type: 'uuid' }) order_item_id: string;
  @Column({ type: 'int', default: 1 }) quantity: number;
  @Column({ type: 'varchar', length: 50, nullable: true }) reason_code:
    | string
    | null;
  @CreateDateColumn({ type: tstz() as any }) created_at: Date;
}
