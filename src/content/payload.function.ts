import type { Renderable } from './renderable.interface.js';
import { isARenderable } from './renderable.guard.js';

export function getPayload(
  hl7Data: Buffer | Renderable | string,
): string | Buffer {
  if (typeof hl7Data === 'object' && isARenderable(hl7Data)) {
    return hl7Data.render();
  }
  return hl7Data;
}
