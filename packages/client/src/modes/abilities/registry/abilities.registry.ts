/**
 * Abilities Registry for Abilities (Sandbox)
 *
 * Source of truth: `.agent/abilities.md`
 * - Sections 2.1 - 2.5: Core Loadout Abilities
 * - Section 3.1 - 3.5: In-Match Power-Up Drops
 * - Section 4 (Rule #3): only one Drop buff active per team at once
 */

export const AbilityKind = {
    PASSIVE: 'PASSIVE',
    TACTICAL: 'TACTICAL',
    ULTIMATE: 'ULTIMATE',
    DROP: 'DROP',
} as const;

export type AbilityKind = typeof AbilityKind[keyof typeof AbilityKind];

export const AbilityKey = {
    // Urshari (2.1)
    BULWARK_PHYSIOLOGY: 'BULWARK_PHYSIOLOGY',
    SEISMIC_SLAM: 'SEISMIC_SLAM',
    IRON_FORTRESS: 'IRON_FORTRESS',
    // Aeonids (2.2)
    AERIAL_ADAPTATION: 'AERIAL_ADAPTATION',
    GALE_FORCE: 'GALE_FORCE',
    SKY_FIRE_STRIKE: 'SKY_FIRE_STRIKE',
    // Vexis (2.3)
    SERPENTINE_MOBILITY: 'SERPENTINE_MOBILITY',
    SHADOW_LEAP: 'SHADOW_LEAP',
    BASILISK_GAZE: 'BASILISK_GAZE',
    // Khaurans (2.4)
    CHARGING_INSTINCT: 'CHARGING_INSTINCT',
    BATTERING_RAM: 'BATTERING_RAM',
    UNSTOPPABLE_HERD: 'UNSTOPPABLE_HERD',
    // Zynni (2.5)
    SCAVENGER_FRAME: 'SCAVENGER_FRAME',
    JUNK_TURRET: 'JUNK_TURRET',
    SCAVENGERS_FEAST: 'SCAVENGERS_FEAST',
    // Drop buffs (3.1 - 3.5)
    FORGE_LINK: 'FORGE_LINK',
    SKY_EYE_RECON: 'SKY_EYE_RECON',
    NEURO_TOXIN_CLOUD: 'NEURO_TOXIN_CLOUD',
    STAMPEDE_OVERDRIVE: 'STAMPEDE_OVERDRIVE',
    SCRAP_MAGNET: 'SCRAP_MAGNET',
} as const;

export type AbilityKey = keyof typeof AbilityKey;

export interface AbilityDef {
    key: AbilityKey;
    kind: AbilityKind;
    name: string;
    specRef: string;
    cooldownSec: number | null;
    durationSec: number | null;
    rangeM: number | null;
    radiusM: number | null;
    notes: string;
    /**
     * Drop exclusivity group. Per spec section 3 + global rule 4.3:
     * only one Drop buff active per team at once.
     */
    dropTeamExclusiveGroup?: 'TEAM_DROP_BUFF';
}

/**
 * Global constraints encoded from spec.
 */
export const ABILITY_RULES = {
    // .agent/abilities.md Section 4, rule 3
    DROP_BUFF_MAX_ACTIVE_PER_TEAM: 1,
    DROP_BUFF_TEAM_EXCLUSIVE_GROUP: 'TEAM_DROP_BUFF' as const,
} as const;

export const ABILITIES: Record<AbilityKey, AbilityDef> = {
    BULWARK_PHYSIOLOGY: {
        key: 'BULWARK_PHYSIOLOGY',
        kind: AbilityKind.PASSIVE,
        name: 'Bulwark Physiology',
        specRef: '2.1 Passive',
        cooldownSec: null,
        durationSec: null,
        rangeM: null,
        radiusM: null,
        notes: '+15% maximum HP. Always active.',
    },
    SEISMIC_SLAM: {
        key: 'SEISMIC_SLAM',
        kind: AbilityKind.TACTICAL,
        name: 'Seismic Slam',
        specRef: '2.1 Tactical',
        cooldownSec: 25,
        durationSec: 0.5,
        rangeM: 6,
        radiusM: 3,
        notes: 'Leap + slam. Minor AOE damage. 0.5s stun near Drop/extract.',
    },
    IRON_FORTRESS: {
        key: 'IRON_FORTRESS',
        kind: AbilityKind.ULTIMATE,
        name: 'Iron Fortress',
        specRef: '2.1 Ultimate',
        cooldownSec: null,
        durationSec: 6,
        rangeM: null,
        radiusM: null,
        notes: '360 dome. Blocks incoming outside projectiles. Inside shoots out at 50% damage.',
    },
    AERIAL_ADAPTATION: {
        key: 'AERIAL_ADAPTATION',
        kind: AbilityKind.PASSIVE,
        name: 'Aerial Adaptation',
        specRef: '2.2 Passive',
        cooldownSec: null,
        durationSec: null,
        rangeM: null,
        radiusM: null,
        notes: 'Extended jump height and mid-air movement control.',
    },
    GALE_FORCE: {
        key: 'GALE_FORCE',
        kind: AbilityKind.TACTICAL,
        name: 'Gale Force',
        specRef: '2.2 Tactical',
        cooldownSec: 20,
        durationSec: null,
        rangeM: 10,
        radiusM: null,
        notes: 'Forward cone push. 10m close-range, 4-6m edge. No damage.',
    },
    SKY_FIRE_STRIKE: {
        key: 'SKY_FIRE_STRIKE',
        kind: AbilityKind.ULTIMATE,
        name: 'Sky-Fire Strike',
        specRef: '2.2 Ultimate',
        cooldownSec: null,
        durationSec: 1.5,
        rangeM: null,
        radiusM: null,
        notes: 'Select 3 targets. 1.5s delay, then beam impacts.',
    },
    SERPENTINE_MOBILITY: {
        key: 'SERPENTINE_MOBILITY',
        kind: AbilityKind.PASSIVE,
        name: 'Serpentine Mobility',
        specRef: '2.3 Passive',
        cooldownSec: null,
        durationSec: null,
        rangeM: null,
        radiusM: null,
        notes: 'Wall-climbing and reduced visibility while crouched.',
    },
    SHADOW_LEAP: {
        key: 'SHADOW_LEAP',
        kind: AbilityKind.TACTICAL,
        name: 'Shadow Leap',
        specRef: '2.3 Tactical',
        cooldownSec: 22,
        durationSec: null,
        rangeM: 15,
        radiusM: null,
        notes: 'Dash 15m. Shadow-form: no damage dealt/received. Pass through enemies.',
    },
    BASILISK_GAZE: {
        key: 'BASILISK_GAZE',
        kind: AbilityKind.ULTIMATE,
        name: 'Basilisk Gaze',
        specRef: '2.3 Ultimate',
        cooldownSec: null,
        durationSec: 3,
        rangeM: null,
        radiusM: null,
        notes: 'Pulse: 1s freeze then 2s 70% slow on enemies facing Vexis.',
    },
    CHARGING_INSTINCT: {
        key: 'CHARGING_INSTINCT',
        kind: AbilityKind.PASSIVE,
        name: 'Charging Instinct',
        specRef: '2.4 Passive',
        cooldownSec: null,
        durationSec: null,
        rangeM: null,
        radiusM: null,
        notes: 'Faster straight-line sprint and reduced slowdown during movement abilities.',
    },
    BATTERING_RAM: {
        key: 'BATTERING_RAM',
        kind: AbilityKind.TACTICAL,
        name: 'Battering Ram',
        specRef: '2.4 Tactical',
        cooldownSec: 25,
        durationSec: 0.5,
        rangeM: null,
        radiusM: null,
        notes: 'Charge; first enemy pinned/carried. Wall collision = high impact damage, else 0.5s knockdown.',
    },
    UNSTOPPABLE_HERD: {
        key: 'UNSTOPPABLE_HERD',
        kind: AbilityKind.ULTIMATE,
        name: 'Unstoppable Herd',
        specRef: '2.4 Ultimate',
        cooldownSec: null,
        durationSec: 10,
        rangeM: null,
        radiusM: null,
        notes: 'Team anti-control aura: immune to stun/slow/knockback.',
    },
    SCAVENGER_FRAME: {
        key: 'SCAVENGER_FRAME',
        kind: AbilityKind.PASSIVE,
        name: 'Scavenger Frame',
        specRef: '2.5 Passive',
        cooldownSec: null,
        durationSec: null,
        rangeM: null,
        radiusM: null,
        notes: 'Smaller hitbox and faster interaction with Drops/objectives.',
    },
    JUNK_TURRET: {
        key: 'JUNK_TURRET',
        kind: AbilityKind.TACTICAL,
        name: 'Junk Turret',
        specRef: '2.5 Tactical',
        cooldownSec: 25,
        durationSec: 15,
        rangeM: 12,
        radiusM: null,
        notes: 'Deploy turret. Low health. Targets nearest enemy.',
    },
    SCAVENGERS_FEAST: {
        key: 'SCAVENGERS_FEAST',
        kind: AbilityKind.ULTIMATE,
        name: "Scavenger's Feast",
        specRef: '2.5 Ultimate',
        cooldownSec: null,
        durationSec: 8,
        rangeM: null,
        radiusM: null,
        notes: 'While alive inside zone: team Signal generation doubled; ends on death.',
    },
    FORGE_LINK: {
        key: 'FORGE_LINK',
        kind: AbilityKind.DROP,
        name: 'Forge-Link',
        specRef: '3.1 Drop Buff',
        cooldownSec: null,
        durationSec: 15,
        rangeM: 20,
        radiusM: null,
        notes: 'Teammate links share damage, -30% reduced, breaks after 200 absorbed.',
        dropTeamExclusiveGroup: ABILITY_RULES.DROP_BUFF_TEAM_EXCLUSIVE_GROUP,
    },
    SKY_EYE_RECON: {
        key: 'SKY_EYE_RECON',
        kind: AbilityKind.DROP,
        name: 'Sky-Eye Recon',
        specRef: '3.2 Drop Buff',
        cooldownSec: null,
        durationSec: 12,
        rangeM: null,
        radiusM: null,
        notes: 'Outline enemies through walls and reveal ultimate state.',
        dropTeamExclusiveGroup: ABILITY_RULES.DROP_BUFF_TEAM_EXCLUSIVE_GROUP,
    },
    NEURO_TOXIN_CLOUD: {
        key: 'NEURO_TOXIN_CLOUD',
        kind: AbilityKind.DROP,
        name: 'Neuro-Toxin Cloud',
        specRef: '3.3 Drop Buff',
        cooldownSec: null,
        durationSec: 8,
        rangeM: null,
        radiusM: null,
        notes: 'Deploy Hardpoint cloud: 5 DPS and -60% cooldown regeneration to enemies inside.',
        dropTeamExclusiveGroup: ABILITY_RULES.DROP_BUFF_TEAM_EXCLUSIVE_GROUP,
    },
    STAMPEDE_OVERDRIVE: {
        key: 'STAMPEDE_OVERDRIVE',
        kind: AbilityKind.DROP,
        name: 'Stampede Overdrive',
        specRef: '3.4 Drop Buff',
        cooldownSec: null,
        durationSec: 12,
        rangeM: null,
        radiusM: null,
        notes: '+50% sprint speed, remove heavy weapon movement penalty, sprint knockback (1.5s per-target gate).',
        dropTeamExclusiveGroup: ABILITY_RULES.DROP_BUFF_TEAM_EXCLUSIVE_GROUP,
    },
    SCRAP_MAGNET: {
        key: 'SCRAP_MAGNET',
        kind: AbilityKind.DROP,
        name: 'Scrap-Magnet',
        specRef: '3.5 Drop Buff',
        cooldownSec: null,
        durationSec: null,
        rangeM: null,
        radiusM: null,
        notes: 'Grant 100 pending Kalyx Credits and pull fragment pickups to player.',
        dropTeamExclusiveGroup: ABILITY_RULES.DROP_BUFF_TEAM_EXCLUSIVE_GROUP,
    },
};

export const CORE_ABILITY_KEYS = (Object.keys(ABILITIES) as AbilityKey[]).filter(
    (k) => ABILITIES[k].kind !== AbilityKind.DROP
);

export const DROP_ABILITY_KEYS = (Object.keys(ABILITIES) as AbilityKey[]).filter(
    (k) => ABILITIES[k].kind === AbilityKind.DROP
);
