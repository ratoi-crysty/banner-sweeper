import { BaseOperation, OperationType } from './base-operation.js';

export enum OperationDomInteractionAction {
  Click = 'Click',
}

export interface OperationDomInteraction
  extends BaseOperation<OperationType.DomInteraction> {
  selector: string;
  action: OperationDomInteractionAction;
}
