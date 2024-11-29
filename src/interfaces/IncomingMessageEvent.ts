import { Message } from "@sourceblock-ug/sb-sl7";
import { MessageResponseEvent } from "./MessageResponseEvent";

export interface IncomingMessageEvent extends MessageResponseEvent {
  msg: string;
  hl7: Message;
  buffer: Buffer;
}
