import { BaseOperation, OperationType } from './base-operation.js';

export enum OperationStorageStorageType {
  Local = 'Local',
  Session = 'Session',
}

export enum OperationStorageAction {
  Set = 'Set',
  Remove = 'Remove',
}

export interface BaseOperationStorage<T>
  extends BaseOperation<OperationType.Storage> {
  storageType: OperationStorageStorageType;
  action: T;
  key: string;
}

export interface OperationStorageSet
  extends BaseOperationStorage<OperationStorageAction.Set> {
  value: string;
}

export type OperationStorageRemove =
  BaseOperationStorage<OperationStorageAction.Remove>;

export type OperationStorage = OperationStorageSet | OperationStorageRemove;
