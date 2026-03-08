import type { AbilityKey } from '../registry/abilities.registry';

export const ABILITIES_TUNING = {
    BASE_PLAYER_HP: 100,
    MAP_BOUNDS_HALF_EXTENT_M: 40,
    DEFAULT_ZONE_RADIUS_M: 10,
    DEFAULT_ZONE_CENTER: { x: 0, y: 0, z: 0 },
    DEFAULT_DROP_POS: { x: 0, y: 0, z: -8 },
    CHARGE_VALUES: {
        // Spec section 5
        kill: { tactical: 40, ultimate: 20 },
        assist: { tactical: 20, ultimate: 10 },
        zone_control_tick: { tactical: 10, ultimate: 5 },
        drop_capture: { tactical: 60, ultimate: 40 },
    },
    ABILITY: {
        PASSIVE: {
            BULWARK_PHYSIOLOGY: {
                maxHpMultiplier: 1.15,
            },
            AERIAL_ADAPTATION: {
                jumpHeightMultiplier: 1.15,
                midAirControlMultiplier: 1.2,
            },
            SERPENTINE_MOBILITY: {
                wallClimbEnabled: 1,
                crouchVisibilityMultiplier: 0.8,
            },
            CHARGING_INSTINCT: {
                straightSprintMultiplier: 1.15,
                movementAbilitySlowdownMultiplier: 0.75,
            },
            SCAVENGER_FRAME: {
                hitboxScaleMultiplier: 0.9,
                interactionSpeedMultiplier: 1.2,
            },
        },
        SEISMIC_SLAM: {
            leapRangeM: 6,
            stunRadiusM: 3,
            stunSec: 0.5,
            damage: 18,
        },
        IRON_FORTRESS: {
            durationSec: 6,
            radiusM: 6,
            insideOutgoingDamageMultiplier: 0.5,
        },
        GALE_FORCE: {
            rangeM: 10,
            coneAngleDeg: 50,
            closePushM: 10,
            edgePushM: 4,
        },
        SKY_FIRE_STRIKE: {
            delaySec: 1.5,
            centerRadiusM: 2,
            outerRadiusM: 4,
            centerDamage: 120,
            outerDamage: 65,
            strikeCount: 3,
        },
        SHADOW_LEAP: {
            dashRangeM: 15,
            shadowFormSec: 1.2,
        },
        BASILISK_GAZE: {
            radiusM: 8,
            facingDotThreshold: 0.6,
            freezeSec: 1,
            slowSec: 2,
            slowPct: 0.7,
        },
        BATTERING_RAM: {
            chargeRangeM: 12,
            chargeWidthM: 1.4,
            knockdownSec: 0.5,
            wallImpactDamage: 90,
        },
        UNSTOPPABLE_HERD: {
            durationSec: 10,
        },
        JUNK_TURRET: {
            durationSec: 15,
            rangeM: 12,
            dps: 10,
            tickSec: 0.25,
        },
        SCAVENGERS_FEAST: {
            durationSec: 8,
            signalMultiplier: 2,
        },
    },
    DROP: {
        FORGE_LINK: {
            durationSec: 15,
            linkRangeM: 20,
            damageReductionPct: 0.3,
            absorbCap: 200,
        },
        SKY_EYE_RECON: {
            durationSec: 12,
        },
        NEURO_TOXIN_CLOUD: {
            durationSec: 8,
            dps: 5,
            radiusM: 6,
            tickSec: 0.25,
            cooldownRegenMultiplier: 0.4,
        },
        STAMPEDE_OVERDRIVE: {
            durationSec: 12,
            sprintSpeedMultiplier: 1.5,
            knockbackCooldownSec: 1.5,
            knockbackRadiusM: 1.4,
            knockbackDistanceM: 3.5,
            knockbackRequireSprinting: 1,
            minSprintDistancePerTickM: 0.15,
        },
        SCRAP_MAGNET: {
            durationSec: 12,
            pendingCredits: 100,
            pullRadiusM: 18,
            pullSpeedMps: 20,
            pickupCaptureRadiusM: 0.75,
        },
    },
} as const;

export type ChargeReason = keyof typeof ABILITIES_TUNING.CHARGE_VALUES;

export const DEPLOYABLE_ABILITY_KEYS: readonly AbilityKey[] = [
    'JUNK_TURRET',
    'NEURO_TOXIN_CLOUD',
];
