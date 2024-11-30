import type { Renderable } from './renderable.interface.js';

export function isARenderable(obj: unknown): obj is Renderable {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'render' in obj &&
    typeof obj.render === 'function'
  );
}
