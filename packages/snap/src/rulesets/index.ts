import { registerRuleset as registerEngineRuleset } from '../engine/registry.js';
import { ctf2dRuleset } from './ctf2d.js';
import { snapshotHardpointRuleset } from './snapshotHardpoint.js';

let registered = false;

export function registerBuiltinRulesets(): void {
  if (registered) return;
  registerEngineRuleset(snapshotHardpointRuleset);
  registerEngineRuleset(ctf2dRuleset);
  registered = true;
}

export * from './types.js';
export * from './registry.js';
export * from './snapshotHardpoint.js';
export * from './ctf2d.js';
