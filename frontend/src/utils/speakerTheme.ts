export interface SpeakerThemeStyle {
  backgroundColor: string;
  foregroundColor: string;
}

const KEYWORD_COLORS: Array<[RegExp, string]> = [
  [/red|crimson|scarlet|ruby/i, '#98414d'],
  [/blue|navy|azure|cobalt/i, '#466f9f'],
  [/green|forest|emerald|moss/i, '#4f795d'],
  [/purple|violet|plum|amethyst/i, '#72558f'],
  [/pink|rose|magenta/i, '#9c5678'],
  [/orange|amber|copper|rust/i, '#a6603b'],
  [/gold|yellow|ochre/i, '#9b762f'],
  [/teal|cyan|aqua|turquoise/i, '#397b7a'],
  [/black|charcoal|slate|gray|grey/i, '#42464d'],
  [/brown|umber|sepia/i, '#735744'],
];

function contrastForHex(hex: string): string {
  const value = hex.slice(1);
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.58 ? '#1f2430' : '#ffffff';
}

function fallbackFromLabel(label: string): string {
  let hash = 0;
  for (const char of label) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 42% 40%)`;
}

export function speakerThemeStyle(themeColor?: string | null): SpeakerThemeStyle {
  const value = themeColor?.trim();
  if (!value) return { backgroundColor: '#466f9f', foregroundColor: '#ffffff' };

  if (/^#[0-9a-f]{6}$/i.test(value)) {
    return { backgroundColor: value, foregroundColor: contrastForHex(value) };
  }

  const known = KEYWORD_COLORS.find(([pattern]) => pattern.test(value));
  if (known) {
    return { backgroundColor: known[1], foregroundColor: contrastForHex(known[1]) };
  }

  return { backgroundColor: fallbackFromLabel(value), foregroundColor: '#ffffff' };
}
