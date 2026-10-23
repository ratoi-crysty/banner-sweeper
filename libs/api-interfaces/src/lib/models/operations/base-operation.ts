export enum OperationType {
  DomInteraction = 'DomInteraction',
  Storage = 'Storage',
}

export interface BaseOperation<T extends OperationType> {
  id: string;
  type: T;
}
