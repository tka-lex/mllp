import type { Renderable } from '../content/renderable.interface.js';

export interface MessageResponseEvent {
  id: string;
  ack: string | Renderable | unknown;
}
