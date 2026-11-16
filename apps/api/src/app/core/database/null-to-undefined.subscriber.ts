import { EntitySubscriberInterface, EventSubscriber } from 'typeorm';

@EventSubscriber()
export class NullToUndefinedSubscriber implements EntitySubscriberInterface {
  afterLoad(entity: Record<string, unknown>): void {
    for (const key of Object.keys(entity)) {
      if (entity[key] === null) {
        delete entity[key];
      }
    }
  }
}
