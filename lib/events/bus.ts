import type { Rating } from '@/lib/learning/types'

export type DomainEvent =
  | { type: 'ReviewCompleted'; userId: string; wordId: string; rating: Rating; at: Date }
  | { type: 'SessionFinished'; userId: string; reviewed: number; at: Date }

type EventType = DomainEvent['type']
type EventOf<T extends EventType> = Extract<DomainEvent, { type: T }>
type Handler<T extends EventType> = (event: EventOf<T>) => void | Promise<void>

export class EventBus {
  private readonly handlers = new Map<EventType, Handler<EventType>[]>()

  subscribe<T extends EventType>(type: T, handler: Handler<T>): void {
    const list = this.handlers.get(type) ?? []
    list.push(handler as unknown as Handler<EventType>)
    this.handlers.set(type, list)
  }

  async publish(event: DomainEvent): Promise<void> {
    const list = this.handlers.get(event.type) ?? []
    for (const handler of list) {
      try {
        await handler(event)
      } catch (err) {
        console.error(`event handler for ${event.type} failed:`, err)
      }
    }
  }
}

export const eventBus = new EventBus()
