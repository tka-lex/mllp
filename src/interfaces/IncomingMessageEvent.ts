import type { Message } from '@sourceblock-ug/sb-sl7';
import type { MessageResponseEvent } from './MessageResponseEvent.js';

export interface IncomingMessageEvent extends MessageResponseEvent {
  msg: string;
  hl7: Message;
  buffer: Buffer;
}
