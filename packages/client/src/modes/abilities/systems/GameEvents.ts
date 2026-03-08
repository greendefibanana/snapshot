import type { EntityId } from '@snapshot/shared';
import type { AbilityKey } from '../registry/abilities.registry';

export type TeamId = 1 | 2;

export type AbilitiesGameEventMap = {
    ABILITY_CAST: {
        casterId: EntityId;
        abilityKey: AbilityKey;
        payload?: unknown;
    };
    ABILITY_HIT: {
        casterId: EntityId;
        targetId: EntityId;
        abilityKey: AbilityKey;
    };
    FORGE_LINK_SHARED_DAMAGE: {
        sourceId: EntityId;
        teamId: TeamId;
        targetId: EntityId;
        sharedDamage: number;
    };
    BUFF_START: {
        teamId: TeamId;
        abilityKey: AbilityKey;
        durationSec: number | null;
    };
    BUFF_END: {
        teamId: TeamId;
        abilityKey: AbilityKey;
        reason: 'replaced' | 'expired';
    };
    DEPLOYABLE_SPAWN: {
        deployableId: string;
        ownerId: EntityId;
        abilityKey: AbilityKey;
        durationSec: number | null;
    };
    DEPLOYABLE_DESPAWN: {
        deployableId: string;
        ownerId: EntityId;
        abilityKey: AbilityKey;
        reason: 'expired' | 'removed';
    };
    DEBUG_MESSAGE: {
        message: string;
    };
    VFX_TAG: {
        tag: 'BASILISK_AFFECTED_MARKER';
        targetId: EntityId;
        durationSec: number;
    };
    SCRAP_MAGNET_TOKEN_PULL: {
        teamId: TeamId;
        pickupId: string;
        startPos: { x: number; y: number; z: number };
        endPos: { x: number; y: number; z: number };
    };
};

export type AbilitiesGameEventType = keyof AbilitiesGameEventMap;
