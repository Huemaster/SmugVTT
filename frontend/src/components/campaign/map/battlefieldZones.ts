/** Generic battlefield markup: labels are deliberately independent of game mechanics. */
export const ZONE_PRESETS = [
  { id: 'light-cover', label: 'Light Cover', color: '#e7ad42' },
  { id: 'heavy-cover', label: 'Heavy Cover', color: '#cb713e' },
  { id: 'high-ground', label: 'High Ground', color: '#6e91d9' },
  { id: 'low-ground', label: 'Low Ground', color: '#9673c4' },
  { id: 'smoke', label: 'Smoke', color: '#9299a1' },
  { id: 'obscured', label: 'Obscured', color: '#606a79' },
  { id: 'healing', label: 'Healing', color: '#4daf7c' },
  { id: 'hazard', label: 'Hazard', color: '#d15a69' },
] as const;
export type ZoneType = (typeof ZONE_PRESETS)[number]['id'];
export const DEFAULT_ZONE_OPACITY = 30;
