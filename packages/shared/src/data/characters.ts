/**
 * Character Data Definitions
 * 
 * All 20 playable characters (4 per species).
 * This is the primary source for balance changes.
 * 
 * EXTENSION POINT: Add new characters here.
 */

import {
    Species,
    Archetype,
    ARCHETYPE_BASE_STATS,
    type CharacterDefinition,
} from '../types/characters.js';

// =============================================================================
// URSHARI (Bears) - The Industrialists
// =============================================================================

const KODIAK: CharacterDefinition = {
    id: 'kodiak',
    name: 'Kodiak',
    species: Species.Urshari,
    archetype: Archetype.Tank,
    description: 'Defensive specialist and team protector. Excels at holding positions and absorbing damage.',
    baseStats: ARCHETYPE_BASE_STATS[Archetype.Tank],
    tacticalAbilities: ['deployable_cover', 'self_heal', 'knockback_roar', 'honey_trap'],
    ultimateAbilities: ['invulnerability_shell', 'team_damage_reduction', 'rampage_mode'],
};

const GRIZZLY: CharacterDefinition = {
    id: 'grizzly',
    name: 'Grizzly',
    species: Species.Urshari,
    archetype: Archetype.Skirmisher,
    description: 'Aggressive frontliner and momentum-based brawler. Builds power through sustained combat.',
    baseStats: ARCHETYPE_BASE_STATS[Archetype.Skirmisher],
    tacticalAbilities: ['deployable_cover', 'self_heal', 'knockback_roar', 'honey_trap'],
    ultimateAbilities: ['invulnerability_shell', 'team_damage_reduction', 'rampage_mode'],
};

const PANDA: CharacterDefinition = {
    id: 'panda',
    name: 'Panda',
    species: Species.Urshari,
    archetype: Archetype.Support,
    description: 'Healer and area control expert. Provides sustain for the team while denying enemy positions.',
    baseStats: ARCHETYPE_BASE_STATS[Archetype.Support],
    tacticalAbilities: ['deployable_cover', 'self_heal', 'knockback_roar', 'honey_trap'],
    ultimateAbilities: ['invulnerability_shell', 'team_damage_reduction', 'rampage_mode'],
};

const SUN_BEAR: CharacterDefinition = {
    id: 'sun_bear',
    name: 'Sun Bear',
    species: Species.Urshari,
    archetype: Archetype.Assassin,
    description: 'Silent hunter and close-range eliminator. Uses the Urshari bulk for devastating ambushes.',
    baseStats: ARCHETYPE_BASE_STATS[Archetype.Assassin],
    tacticalAbilities: ['deployable_cover', 'self_heal', 'knockback_roar', 'honey_trap'],
    ultimateAbilities: ['invulnerability_shell', 'team_damage_reduction', 'rampage_mode'],
};

// =============================================================================
// AEONIDS (Birds) - The Sky Lords
// =============================================================================

const SKYCLAW: CharacterDefinition = {
    id: 'skyclaw',
    name: 'Skyclaw',
    species: Species.Aeonids,
    archetype: Archetype.Tank,
    description: 'Aerial defender and dive-bomb specialist. Controls airspace while protecting allies below.',
    baseStats: ARCHETYPE_BASE_STATS[Archetype.Tank],
    tacticalAbilities: ['gust_dash', 'updraft', 'dive_strike', 'radar_pulse'],
    ultimateAbilities: ['sky_supremacy', 'tailwind_aura', 'aerial_bombardment'],
};

const WINDREAVER: CharacterDefinition = {
    id: 'windreaver',
    name: 'Windreaver',
    species: Species.Aeonids,
    archetype: Archetype.Skirmisher,
    description: 'Hit-and-run mobility expert. Weaves through combat at high speed, striking vulnerable targets.',
    baseStats: ARCHETYPE_BASE_STATS[Archetype.Skirmisher],
    tacticalAbilities: ['gust_dash', 'updraft', 'dive_strike', 'radar_pulse'],
    ultimateAbilities: ['sky_supremacy', 'tailwind_aura', 'aerial_bombardment'],
};

const SONGWING: CharacterDefinition = {
    id: 'songwing',
    name: 'Songwing',
    species: Species.Aeonids,
    archetype: Archetype.Support,
    description: 'Reconnaissance and team movement specialist. Provides unparalleled information advantage.',
    baseStats: ARCHETYPE_BASE_STATS[Archetype.Support],
    tacticalAbilities: ['gust_dash', 'updraft', 'dive_strike', 'radar_pulse'],
    ultimateAbilities: ['sky_supremacy', 'tailwind_aura', 'aerial_bombardment'],
};

const NIGHTTALON: CharacterDefinition = {
    id: 'nighttalon',
    name: 'Nighttalon',
    species: Species.Aeonids,
    archetype: Archetype.Assassin,
    description: 'Aerial assassin and vertical flanker. Strikes from unexpected angles with deadly precision.',
    baseStats: ARCHETYPE_BASE_STATS[Archetype.Assassin],
    tacticalAbilities: ['gust_dash', 'updraft', 'dive_strike', 'radar_pulse'],
    ultimateAbilities: ['sky_supremacy', 'tailwind_aura', 'aerial_bombardment'],
};

// =============================================================================
// VEXIS (Snakes) - The Technologists
// =============================================================================

const COILWARD: CharacterDefinition = {
    id: 'coilward',
    name: 'Coilward',
    species: Species.Vexis,
    archetype: Archetype.Tank,
    description: 'Reactive defender and counter-attack specialist. Punishes aggressive enemies with calculated strikes.',
    baseStats: ARCHETYPE_BASE_STATS[Archetype.Tank],
    tacticalAbilities: ['venom_spit', 'shed_skin', 'constrict', 'heat_vision'],
    ultimateAbilities: ['basilisk_stare', 'serpent_swarm', 'toxic_cloud', 'molt'],
};

const FANGREND: CharacterDefinition = {
    id: 'fangrend',
    name: 'Fangrend',
    species: Species.Vexis,
    archetype: Archetype.Skirmisher,
    description: 'Poison damage-over-time fighter. Weakens enemies steadily while remaining elusive.',
    baseStats: ARCHETYPE_BASE_STATS[Archetype.Skirmisher],
    tacticalAbilities: ['venom_spit', 'shed_skin', 'constrict', 'heat_vision'],
    ultimateAbilities: ['basilisk_stare', 'serpent_swarm', 'toxic_cloud', 'molt'],
};

const SCALEMIND: CharacterDefinition = {
    id: 'scalemind',
    name: 'Scalemind',
    species: Species.Vexis,
    archetype: Archetype.Support,
    description: 'Information warfare specialist. Reveals enemy positions and disrupts their coordination.',
    baseStats: ARCHETYPE_BASE_STATS[Archetype.Support],
    tacticalAbilities: ['venom_spit', 'shed_skin', 'constrict', 'heat_vision'],
    ultimateAbilities: ['basilisk_stare', 'serpent_swarm', 'toxic_cloud', 'molt'],
};

const VIPERCOIL: CharacterDefinition = {
    id: 'vipercoil',
    name: 'Vipercoil',
    species: Species.Vexis,
    archetype: Archetype.Assassin,
    description: 'Stealth infiltrator and single-target eliminator. Strikes from darkness with lethal venom.',
    baseStats: ARCHETYPE_BASE_STATS[Archetype.Assassin],
    tacticalAbilities: ['venom_spit', 'shed_skin', 'constrict', 'heat_vision'],
    ultimateAbilities: ['basilisk_stare', 'serpent_swarm', 'toxic_cloud', 'molt'],
};

// =============================================================================
// KHAURANS (Bulls) - The Enforcers
// =============================================================================

const IRONHORN: CharacterDefinition = {
    id: 'ironhorn',
    name: 'Ironhorn',
    species: Species.Khaurans,
    archetype: Archetype.Tank,
    description: 'Immovable anchor with charge-based defense. Holds the line with unstoppable determination.',
    baseStats: ARCHETYPE_BASE_STATS[Archetype.Tank],
    tacticalAbilities: ['charge', 'ground_stomp', 'protective_stance', 'battle_cry'],
    ultimateAbilities: ['unstoppable_force', 'shield_wall', 'execution_mode'],
};

const WARBULL: CharacterDefinition = {
    id: 'warbull',
    name: 'Warbull',
    species: Species.Khaurans,
    archetype: Archetype.Skirmisher,
    description: 'Relentless aggressor and melee powerhouse. Charges through enemy lines with devastating force.',
    baseStats: ARCHETYPE_BASE_STATS[Archetype.Skirmisher],
    tacticalAbilities: ['charge', 'ground_stomp', 'protective_stance', 'battle_cry'],
    ultimateAbilities: ['unstoppable_force', 'shield_wall', 'execution_mode'],
};

const SHIELDGUARD: CharacterDefinition = {
    id: 'shieldguard',
    name: 'Shieldguard',
    species: Species.Khaurans,
    archetype: Archetype.Support,
    description: 'Team protector and barrier specialist. Creates safe zones for allies to operate within.',
    baseStats: ARCHETYPE_BASE_STATS[Archetype.Support],
    tacticalAbilities: ['charge', 'ground_stomp', 'protective_stance', 'battle_cry'],
    ultimateAbilities: ['unstoppable_force', 'shield_wall', 'execution_mode'],
};

const GOREBLADE: CharacterDefinition = {
    id: 'goreblade',
    name: 'Goreblade',
    species: Species.Khaurans,
    archetype: Archetype.Assassin,
    description: 'High-risk high-reward duelist. Excels in one-on-one combat with aggressive momentum.',
    baseStats: ARCHETYPE_BASE_STATS[Archetype.Assassin],
    tacticalAbilities: ['charge', 'ground_stomp', 'protective_stance', 'battle_cry'],
    ultimateAbilities: ['unstoppable_force', 'shield_wall', 'execution_mode'],
};

// =============================================================================
// ZYNNI (Rats) - The Survivors
// =============================================================================

const SCRAPLORD: CharacterDefinition = {
    id: 'scraplord',
    name: 'Scraplord',
    species: Species.Zynni,
    archetype: Archetype.Tank,
    description: 'Makeshift armor and improvised defenses. Turns battlefield debris into protective barriers.',
    baseStats: ARCHETYPE_BASE_STATS[Archetype.Tank],
    tacticalAbilities: ['scrap_shield', 'speed_burst', 'healing_pack', 'spike_trap'],
    ultimateAbilities: ['swarm_call', 'scrap_armor', 'emp_blast'],
};

const RUNNERBLADE: CharacterDefinition = {
    id: 'runnerblade',
    name: 'Runnerblade',
    species: Species.Zynni,
    archetype: Archetype.Skirmisher,
    description: 'Speed demon and evasion specialist. Too fast to hit, too quick to catch.',
    baseStats: ARCHETYPE_BASE_STATS[Archetype.Skirmisher],
    tacticalAbilities: ['scrap_shield', 'speed_burst', 'healing_pack', 'spike_trap'],
    ultimateAbilities: ['swarm_call', 'scrap_armor', 'emp_blast'],
};

const PATCHWORK: CharacterDefinition = {
    id: 'patchwork',
    name: 'Patchwork',
    species: Species.Zynni,
    archetype: Archetype.Support,
    description: 'Healer/engineer hybrid and gadget expert. Keeps the team running with creative solutions.',
    baseStats: ARCHETYPE_BASE_STATS[Archetype.Support],
    tacticalAbilities: ['scrap_shield', 'speed_burst', 'healing_pack', 'spike_trap'],
    ultimateAbilities: ['swarm_call', 'scrap_armor', 'emp_blast'],
};

const SHADOWRAT: CharacterDefinition = {
    id: 'shadowrat',
    name: 'Shadowrat',
    species: Species.Zynni,
    archetype: Archetype.Assassin,
    description: 'Trap setter and ambush specialist. Controls the battlefield with cunning placement.',
    baseStats: ARCHETYPE_BASE_STATS[Archetype.Assassin],
    tacticalAbilities: ['scrap_shield', 'speed_burst', 'healing_pack', 'spike_trap'],
    ultimateAbilities: ['swarm_call', 'scrap_armor', 'emp_blast'],
};

// =============================================================================
// CHARACTER REGISTRY
// =============================================================================

/** All character definitions indexed by ID */
export const CHARACTERS: Record<string, CharacterDefinition> = {
    // Urshari
    kodiak: KODIAK,
    grizzly: GRIZZLY,
    panda: PANDA,
    sun_bear: SUN_BEAR,

    // Aeonids
    skyclaw: SKYCLAW,
    windreaver: WINDREAVER,
    songwing: SONGWING,
    nighttalon: NIGHTTALON,

    // Vexis
    coilward: COILWARD,
    fangrend: FANGREND,
    scalemind: SCALEMIND,
    vipercoil: VIPERCOIL,

    // Khaurans
    ironhorn: IRONHORN,
    warbull: WARBULL,
    shieldguard: SHIELDGUARD,
    goreblade: GOREBLADE,

    // Zynni
    scraplord: SCRAPLORD,
    runnerblade: RUNNERBLADE,
    patchwork: PATCHWORK,
    shadowrat: SHADOWRAT,
};

/** Get all characters */
export function getAllCharacters(): CharacterDefinition[] {
    return Object.values(CHARACTERS);
}

/** Get characters by species */
export function getCharactersBySpecies(species: Species): CharacterDefinition[] {
    return getAllCharacters().filter(c => c.species === species);
}

/** Get characters by archetype */
export function getCharactersByArchetype(archetype: Archetype): CharacterDefinition[] {
    return getAllCharacters().filter(c => c.archetype === archetype);
}

/** Get a character by ID */
export function getCharacter(id: string): CharacterDefinition | undefined {
    return CHARACTERS[id];
}

/** Get a character by ID (throws if not found) */
export function getCharacterRequired(id: string): CharacterDefinition {
    const character = CHARACTERS[id];
    if (!character) {
        throw new Error(`Character not found: ${id}`);
    }
    return character;
}
