import { Renderable } from "./Renderable";
export interface MessageResponseEvent {
    id: string;
    ack: string | Renderable | unknown;
}
