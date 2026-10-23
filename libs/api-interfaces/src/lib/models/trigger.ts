export enum TriggerType {
  Selector = 'Selector',
  LocalStorage = 'LocalStorage',
  SessionStorage = 'SessionStorage',
  Cookie = 'Cookie',
}

export interface Trigger {
  type: string;
  value: string;
}
