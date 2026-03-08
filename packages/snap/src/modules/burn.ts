import { createStubModule } from './stub.js';
import type { SnapModule } from './types.js';

export function createBurnModule(): SnapModule {
  return createStubModule('burn');
}
