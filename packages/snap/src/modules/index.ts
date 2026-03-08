export * from './types.js';
export * from './stake.js';
export * from './registry.js';
export * from './scoring.js';
export * from './mutation.js';
export * from './mutation.sim.js';
export * from './stakeSettlement.sim.js';
export * from './burn.js';
export * from './settlement.js';
export * from './provenance.js';

import { createBurnModule } from './burn.js';
import { createMutationModule } from './mutation.js';
import { createProvenanceModule } from './provenance.js';
import { createRegistryModule } from './registry.js';
import { createScoringModule } from './scoring.js';
import { createSettlementModule } from './settlement.js';
import { createStakeModule } from './stake.js';
import type { SnapModule } from './types.js';

export function createBuiltinModules(): Record<string, SnapModule> {
  return {
    stake: createStakeModule(),
    registry: createRegistryModule(),
    scoring: createScoringModule(),
    mutation: createMutationModule(),
    burn: createBurnModule(),
    settlement: createSettlementModule(),
    provenance: createProvenanceModule(),
  };
}
