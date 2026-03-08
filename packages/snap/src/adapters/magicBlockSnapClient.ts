import { createMagicBlockSnapClientAdapter } from './magicblock/clientAdapter.js';
import type { SnapAuthorityBridgeConfig } from './magicblock/types.js';
import type { SnapClient } from './snapClient.js';

export function createMagicBlockSnapClient(config: SnapAuthorityBridgeConfig): SnapClient {
  return createMagicBlockSnapClientAdapter(config);
}
