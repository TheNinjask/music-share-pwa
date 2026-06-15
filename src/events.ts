import type { AppEvents } from './types';

type EventCallback<T> = T extends void ? () => void : (data: T) => void;

class EventBus {
  private listeners = new Map<string, Set<EventCallback<unknown>>>();

  on<K extends keyof AppEvents>(event: K, callback: EventCallback<AppEvents[K]>): () => void {
    if (!this.listeners.has(event as string)) {
      this.listeners.set(event as string, new Set());
    }
    const set = this.listeners.get(event as string)!;
    set.add(callback as EventCallback<unknown>);

    // Return unsubscribe function
    return () => {
      set.delete(callback as EventCallback<unknown>);
    };
  }

  emit<K extends keyof AppEvents>(event: K, ...args: AppEvents[K] extends void ? [] : [AppEvents[K]]): void {
    const set = this.listeners.get(event as string);
    if (set) {
      for (const cb of set) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (cb as any)(...args);
        } catch (err) {
          console.error(`Event handler error for "${event as string}":`, err);
        }
      }
    }
  }

  off<K extends keyof AppEvents>(event: K, callback: EventCallback<AppEvents[K]>): void {
    const set = this.listeners.get(event as string);
    if (set) {
      set.delete(callback as EventCallback<unknown>);
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}

export const bus = new EventBus();
