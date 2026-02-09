import { Box, Layers } from 'lucide-react';

export const COLORS = [
  { name: 'Primary (Acid Lime)', value: '#CCFF00', class: 'bg-ink-primary', text: 'text-black' },
  { name: 'Secondary (Electric Violet)', value: '#7000FF', class: 'bg-ink-secondary', text: 'text-white' },
  { name: 'Accent (Cyan)', value: '#00FFFF', class: 'bg-ink-accent', text: 'text-black' },
  { name: 'Danger (Hot Pink)', value: '#FF0055', class: 'bg-ink-danger', text: 'text-white' },
  { name: 'Background (Deep Void)', value: '#0A0A10', class: 'bg-ink-bg', text: 'text-white' },
  { name: 'Surface (Gunmetal)', value: '#181820', class: 'bg-ink-surface', text: 'text-white' },
];

export const NAV_ITEMS = [
  { id: 'tokens', label: 'Design Tokens', icon: Box },
  { id: 'lobby', label: 'Live Lobby', icon: Layers },
];

export const SAMPLE_PLAYERS = [
  { id: '1', name: 'InkMaster99', level: 42, ready: true, weapon: 'Dual Splatters', avatar: 'https://picsum.photos/seed/ink1/200' },
  { id: '2', name: 'NeonSniper', level: 38, ready: true, weapon: 'Charge Rifle', avatar: 'https://picsum.photos/seed/ink2/200' },
  { id: '3', name: 'TentacleTim', level: 15, ready: false, weapon: 'Roller', avatar: 'https://picsum.photos/seed/ink3/200' },
  { id: '4', name: 'BlobLobber', level: 50, ready: true, weapon: 'Bucket', avatar: 'https://picsum.photos/seed/ink4/200' },
];