import { Renderable } from "./Renderable.js";

export interface MessageResponseEvent {
  id: string;
  ack: string | Renderable | unknown;
}
