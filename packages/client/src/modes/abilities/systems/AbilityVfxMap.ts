import type { AbilityKey } from '../registry/abilities.registry';

export type AbilityVfxEntry = {
    vfxCast: string | null;
    vfxLoop: string | null;
    vfxHit: string | null;
    vfxTrail?: string | null;
};

export const ABILITY_VFX_MAP: Record<AbilityKey, AbilityVfxEntry> = {
    BULWARK_PHYSIOLOGY: { vfxCast: null, vfxLoop: null, vfxHit: null },
    SEISMIC_SLAM: { vfxCast: 'seismic_slam', vfxLoop: null, vfxHit: 'seismic_slam' },

    IRON_FORTRESS: { vfxCast: 'iron_fortress_dome', vfxLoop: 'iron_fortress_dome_loop', vfxHit: 'iron_fortress_block' },

    AERIAL_ADAPTATION: { vfxCast: null, vfxLoop: null, vfxHit: null },
    GALE_FORCE: { vfxCast: 'gale_force', vfxLoop: null, vfxHit: 'gale_force_hit' },
    SKY_FIRE_STRIKE: { vfxCast: 'sky_fire_telegraph', vfxLoop: null, vfxHit: 'sky_fire_impact' },

    SERPENTINE_MOBILITY: { vfxCast: null, vfxLoop: null, vfxHit: null },
    SHADOW_LEAP: { vfxCast: 'shadow_leap_depart', vfxLoop: null, vfxHit: 'shadow_leap_arrive', vfxTrail: 'shadow_form' },
    BASILISK_GAZE: { vfxCast: 'basilisk_pulse', vfxLoop: null, vfxHit: 'basilisk_gaze' },

    CHARGING_INSTINCT: { vfxCast: null, vfxLoop: null, vfxHit: null },
    BATTERING_RAM: { vfxCast: 'battering_ram_charge', vfxLoop: null, vfxHit: 'battering_ram_impact' },
    UNSTOPPABLE_HERD: { vfxCast: 'unstoppable_herd', vfxLoop: 'unstoppable_herd_aura', vfxHit: null, vfxTrail: 'unstoppable_herd_dust' },

    SCAVENGER_FRAME: { vfxCast: null, vfxLoop: null, vfxHit: null },
    JUNK_TURRET: { vfxCast: 'junk_turret_deploy', vfxLoop: 'junk_turret_idle', vfxHit: 'junk_turret_shot' },
    SCAVENGERS_FEAST: { vfxCast: 'scavengers_feast', vfxLoop: 'scavengers_feast_zone', vfxHit: null },

    FORGE_LINK: { vfxCast: 'forge_link', vfxLoop: 'forge_link_tether', vfxHit: 'forge_link_hit', vfxTrail: 'forge_link_tether' },
    SKY_EYE_RECON: { vfxCast: 'sky_eye_recon', vfxLoop: 'sky_eye_recon_scan', vfxHit: null },
    NEURO_TOXIN_CLOUD: { vfxCast: 'neuro_toxin', vfxLoop: 'neuro_toxin_fog', vfxHit: 'neuro_toxin_tick' },
    STAMPEDE_OVERDRIVE: { vfxCast: 'stampede_overdrive', vfxLoop: 'stampede_aura', vfxHit: 'stampede_impact', vfxTrail: 'stampede_dust' },
    SCRAP_MAGNET: { vfxCast: 'scrap_magnet', vfxLoop: 'scrap_magnet_pull', vfxHit: 'scrap_magnet_hit' },
};

export function collectAbilityVfxPrefabKeys(): string[] {
    const keys = new Set<string>();
    for (const entry of Object.values(ABILITY_VFX_MAP)) {
        if (entry.vfxCast) keys.add(entry.vfxCast);
        if (entry.vfxLoop) keys.add(entry.vfxLoop);
        if (entry.vfxHit) keys.add(entry.vfxHit);
        if (entry.vfxTrail) keys.add(entry.vfxTrail);
    }
    return Array.from(keys.values()).sort();
}
