import { Trigger } from './trigger.js';
import { Operation } from './operations/operation.js';

export interface Work {
  id: string;
  name: string;
  hosts: string[];
  trigger: Trigger;
  steps: Operation[];
}
