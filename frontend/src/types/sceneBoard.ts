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
