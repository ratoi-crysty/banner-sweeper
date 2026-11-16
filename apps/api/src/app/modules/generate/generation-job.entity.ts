import type { AgentStep } from '../agent';
import type {
  GenerateRuleRequest,
  GenerateRuleResult,
  GenerationJob,
  GenerationJobState,
} from './types/generate.types';
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class GenerationJobEntity implements GenerationJob {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('text', { nullable: true })
  error?: string;

  @Column('json')
  logs!: string[];

  @Column('json')
  request!: GenerateRuleRequest;

  @Column('json', { nullable: true })
  result?: GenerateRuleResult;

  @Column({ type: 'text' })
  state!: GenerationJobState;

  @Column('json')
  steps!: AgentStep[];

  @CreateDateColumn({ type: 'text' })
  createdAt!: string;

  @Column('datetime', { nullable: true })
  startedAt?: string;

  @Column('datetime', { nullable: true })
  finishedAt?: string;
}
