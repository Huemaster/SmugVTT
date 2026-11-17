/** Silent, three-cycle visual effects for freeform Stage pictures. */
export type StageMotion = 'none' | 'float' | 'bob' | 'shake' | 'hop' | 'pulse' | 'fade' | 'slide' | 'jolt';
export type StageEmote = 'none' | 'anger' | 'stress' | 'sweat' | 'gloom' | 'alert' | 'question' | 'exclamation' | 'sparkle' | 'heart' | 'thought';
export interface StageCue {
  id: string;
  at: number;
  motion: StageMotion;
  emote: StageEmote;
}

export type SceneBoardElementType = 'text' | 'image' | 'rect' | 'ellipse' | 'line' | 'arrow' | 'stroke';

export interface SceneBoardPoint {
  x: number;
  y: number;
}

export interface SceneBoardElement {
  id: string;
  type: SceneBoardElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  z: number;
  locked: boolean;
  hidden?: boolean;

  text?: string;
  fontSize?: number;
  color?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;

  imageUrl?: string;
  imageAssetId?: string;
  /** Right-click > Speaking as / Character is; canonical IC Chat links. */
  smugSpeakerKey?: string;
  /** Optional silent effects; no sound and no infinite animation. */
  stageMotion?: StageMotion;
  /** Only an explicit GM toggle allows continuous picture motion. */
  stageRepeat?: boolean;
  stageEmote?: StageEmote;
  stageAutoReact?: boolean;
  stageCue?: StageCue;

  points?: SceneBoardPoint[];
}

export interface SceneBoardView {
  zoom: number;
  scrollLeft: number;
  scrollTop: number;
}

export interface SceneBoardState {
  background: string;
  elements: SceneBoardElement[];
  presentation?: boolean;
  /** GM-only toggle. Player movement is validated by a scoped server route. */
  allowPlayerEditing?: boolean;
  /** GM-chosen transition for newly revealed/shared scenes; no sound. */
  revealTransition?: 'cut' | 'fade';
  view?: SceneBoardView;
}

export interface CampaignSceneBoard {
  id: string;
  campaignId: string;
  title: string;
  location: string | null;
  timeLabel: string | null;
  imageUrl: string | null;
  participantIds: string[];
  summary: string | null;
  gmNotes: string | null;
  revealed: boolean;
  active: boolean;
  boardVisibility: 'gm' | 'shared';
  boardState: SceneBoardState;
  boardVersion: number;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
