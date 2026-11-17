import {
  ArrowDown,
  ArrowUp,
  Circle,
  ImagePlus,
  Lock,
  Minus,
  MousePointer2,
  Pencil,
  Plus,
  Redo2,
  RotateCcw,
  RotateCw,
  Save,
  Square,
  Trash2,
  Library,
  Copy,
  MessageSquareText,
  LogOut,
  Type,
  Undo2,
  Unlock,
  UsersRound,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { PointerEvent, ReactNode } from 'react';
import { canvasArtSpeechX, measureCanvasArt, type CanvasArtMetrics } from './canvasSpeechAnchor';
import { canvasImageVisualRect, resizeCanvasImage } from './canvasImageGeometry';
import { importLegacyStageCast } from './stageLegacyCast';
import { defaultStageImagePosition, mayDragStageElement, stageContentChanged } from './stageUX';
import { StagePicture, STAGE_MOTIONS, STAGE_EMOTES, stageMotion, stageEmote } from './StageEffects';
import JrpgPortrait from './JrpgPortrait';
import { api } from '@/services/api';
import { listEveryAsset } from '@/services/assetPages';
import { AssetScope, type Asset } from '@/types';
import { useCampaign } from '@/contexts/CampaignContext';
import { useToast } from '@/contexts/ToastContext';
import { useOnlineUserIds } from '@/stores/gameStore';
import Button from '@/components/ui/Button';
import { apiErrorMessage } from '@/utils/errors';
import { getSceneHistory, subscribeSceneHistory, subscribeLiveSceneDialogue, type SceneUtterance } from './sceneDialogue';
import type {
  CampaignSceneBoard,
  SceneBoardElement,
  SceneBoardElementType,
  SceneBoardPoint,
  SceneBoardState,
  StageCue,
} from '@/types/sceneBoard';

const BOARD_WIDTH = 1600;
const BOARD_HEIGHT = 900;
const DEFAULT_BOARD: SceneBoardState = { background: '#f4efe6', elements: [] };

type LinkedCanvasImage = SceneBoardElement & { smugSpeakerKey?: string };
function linkedSpeaker(element: SceneBoardElement): string {
  const value = (element as LinkedCanvasImage).smugSpeakerKey;
  return typeof value === 'string' && /^(character|npc):[^:]+$/.test(value) ? value : '';
}
function canvasDialogueLabel(entry: SceneUtterance): string {
  const full = entry.quotes.join(' ');
  return full.length > 210 ? `${full.slice(0, 207).trimEnd()}…` : full;
}


type Tool = 'select' | 'pen';

function id(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function normaliseBoard(raw: unknown): SceneBoardState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...DEFAULT_BOARD, elements: [] };
  const value = raw as Partial<SceneBoardState>;
  const view = value.view && typeof value.view === 'object' && !Array.isArray(value.view)
    ? value.view as SceneBoardState['view']
    : undefined;
  // Preserve the live Scene pillar's staging when Canvas normalizes/saves
  // its own elements. Both share the existing scene-board JSON record.
  const stage = (value as unknown as Record<string, unknown>).smugSceneStage;
  return {
    background: typeof value.background === 'string' ? value.background : DEFAULT_BOARD.background,
    elements: Array.isArray(value.elements) ? value.elements as SceneBoardElement[] : [],
    presentation: value.presentation === true,
    allowPlayerEditing: value.allowPlayerEditing === true,
    revealTransition: value.revealTransition === 'fade' ? 'fade' : 'cut',
    ...(view ? { view } : {}),
    ...(stage !== undefined ? { smugSceneStage: stage } : {}),
  } as SceneBoardState;
}

function assetUrl(assetId: string): string {
  return api.getAssetUrl(assetId, 'maps');
}

function nextZ(elements: SceneBoardElement[]): number {
  return elements.reduce((max, element) => Math.max(max, element.z), 0) + 1;
}

function pointsToPath(points: SceneBoardPoint[]): string {
  if (points.length === 0) return '';
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
}

export default function SceneBoardPanel() {
  const { campaign, userRole } = useCampaign();
  const { showToast } = useToast();
  const onlineCanvasIds = useOnlineUserIds();
  const connectedCanvasCount = (campaign?.memberships ?? []).filter((member) => onlineCanvasIds.has(member.userId)).length;
  const campaignId = campaign?.id ?? '';
  const isGm = userRole === 'DM';

  const [scene, setScene] = useState<CampaignSceneBoard | null>(null);
  const [board, setBoard] = useState<SceneBoardState>(DEFAULT_BOARD);
  const boardRef = useRef(board);
  boardRef.current = board;
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const canEdit = isGm || (userRole === 'PLAYER' && scene?.revealed === true && scene.boardVisibility === 'shared' && board.allowPlayerEditing === true);
  const [snapToGrid, setSnapToGrid] = useState(() => {
    try { return window.localStorage.getItem('smugvtt:stage-snap') === 'true'; } catch { return false; }
  });
  const [dialogueStyle, setDialogueStyle] = useState<'bubbles' | 'vn' | 'jrpg'>(() => {
    try {
      const value = window.localStorage.getItem('smugvtt:stage-dialogue-style');
      return value === 'vn' || value === 'jrpg' ? value : 'bubbles';
    } catch { return 'bubbles'; }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem('smugvtt:stage-snap', String(snapToGrid));
      window.localStorage.setItem('smugvtt:stage-dialogue-style', dialogueStyle);
    } catch { /* client presentation preferences are optional */ }
  }, [snapToGrid, dialogueStyle]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Spotlight is a per-viewer presentation preference, never a board edit.
  const [spotlightEnabled, setSpotlightEnabled] = useState(() => {
    try { return window.localStorage.getItem('smugvtt:canvas-spotlight') === 'true'; } catch { return false; }
  });
  useEffect(() => {
    try { window.localStorage.setItem('smugvtt:canvas-spotlight', String(spotlightEnabled)); } catch { /* optional */ }
  }, [spotlightEnabled]);
  const [revealSequence, setRevealSequence] = useState(0);
  const [showRevealFade, setShowRevealFade] = useState(false);
  useEffect(() => {
    if (!showRevealFade) return;
    const timer = window.setTimeout(() => setShowRevealFade(false), 760);
    return () => window.clearTimeout(timer);
  }, [revealSequence, showRevealFade]);
  const [tool, setTool] = useState<Tool>('select');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [zoom, setZoom] = useState(1);
  const [followGmView, setFollowGmView] = useState(true);
  const [history, setHistory] = useState<SceneBoardState[]>([]);
  const [future, setFuture] = useState<SceneBoardState[]>([]);
  const [dirty, setDirty] = useState(false);
  const [drawing, setDrawing] = useState<SceneBoardPoint[] | null>(null);
  const [marquee, setMarquee] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const marqueeRef = useRef<{ pointerId: number; start: SceneBoardPoint; end: SceneBoardPoint; moved: boolean } | null>(null);
  const suppressCanvasClickRef = useRef(false);
  const [newSceneName, setNewSceneName] = useState('');
  const [creatingScene, setCreatingScene] = useState(false);
  const [sceneOptionsOpen, setSceneOptionsOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [existingImagePickerOpen, setExistingImagePickerOpen] = useState(false);
  const [existingImageSearch, setExistingImageSearch] = useState('');
  const [existingImageAssets, setExistingImageAssets] = useState<Asset[]>([]);
  const [existingImagesLoading, setExistingImagesLoading] = useState(false);
  const [existingImagesError, setExistingImagesError] = useState('');
  const [placeNewImagesHidden, setPlaceNewImagesHidden] = useState(true);
  const [npcSpeakerOptions, setNpcSpeakerOptions] = useState<Array<{ key: string; name: string }>>([]);
  useEffect(() => {
    if (!existingImagePickerOpen || !isGm || !campaignId) return;
    let active = true;
    setExistingImagesLoading(true);
    setExistingImagesError('');
    void listEveryAsset({ type: 'MAP' }).then((assets) => {
      if (!active) return;
      // Never offer another campaign's files or a user's private-only art.
      setExistingImageAssets(assets.filter((asset) => asset.scope === AssetScope.GLOBAL ||
        (asset.scope === AssetScope.CAMPAIGN && asset.campaignId === campaignId)));
    }).catch(() => { if (active) setExistingImagesError('Could not load previously uploaded campaign pictures.'); })
      .finally(() => { if (active) setExistingImagesLoading(false); });
    return () => { active = false; };
  }, [existingImagePickerOpen, isGm, campaignId]);
  // The Canvas hit rectangle is not the visible painted portrait. Cache each
  // image's actual horizontal ink span so bubbles follow asymmetric artwork.
  const [canvasArtMetrics, setCanvasArtMetrics] = useState<Record<string, CanvasArtMetrics>>({});
  const canvasArtSourceKey = [...new Set(board.elements.filter((element) => element.type === 'image' && element.imageUrl).map((element) => element.imageUrl!))].sort().join('\u0000');
  useEffect(() => {
    let alive = true;
    const urls = canvasArtSourceKey ? canvasArtSourceKey.split('\u0000') : [];
    for (const url of urls) {
      void measureCanvasArt(url).then((metrics) => {
        if (!alive || !metrics) return;
        setCanvasArtMetrics((current) => ({ ...current, [url]: metrics }));
      });
    }
    return () => { alive = false; };
  }, [canvasArtSourceKey]);
  const [canvasBubblesEnabled, setCanvasBubblesEnabled] = useState(() => {
    try { return window.localStorage.getItem('smugvtt:canvas-bubbles') !== 'false'; } catch { return true; }
  });
  // Viewer preference: honour OS reduced-motion unless explicitly overridden.
  // This is local to the browser, never saved to a campaign or sent to players.
  const [pictureMotionEnabled, setPictureMotionEnabled] = useState(() => {
    try {
      const stored = window.localStorage.getItem('smugvtt:canvas-picture-motion');
      if (stored === 'true') return true;
      if (stored === 'false') return false;
      return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    } catch { return true; }
  });
  useEffect(() => {
    try { window.localStorage.setItem('smugvtt:canvas-picture-motion', String(pictureMotionEnabled)); }
    catch { /* browser privacy settings can prevent local storage */ }
  }, [pictureMotionEnabled]);
  const [speakingKey, setSpeakingKey] = useState('');
  const subscribeToDialogue = useCallback((notify: () => void) => subscribeSceneHistory(campaignId, notify), [campaignId]);
  const dialogueSnapshot = useCallback(() => getSceneHistory(campaignId), [campaignId]);
  const sceneDialogue = useSyncExternalStore(subscribeToDialogue, dialogueSnapshot, () => getSceneHistory(''));
  const linkedSpeakers = useMemo(() => [
    ...(campaign?.characters ?? []).map((character) => ({ key: `character:${character.id}`, name: character.name })),
    ...npcSpeakerOptions,
  ], [campaign?.characters, npcSpeakerOptions]);
  const latestDialogueBySpeaker = useMemo(() => {
    const result = new Map<string, SceneUtterance>();
    if (!scene) return result;
    const since = Date.parse(scene.startedAt ?? scene.createdAt) || 0;
    for (const line of sceneDialogue) {
      if (Date.parse(line.createdAt) >= since) result.set(line.speakerKey, line);
    }
    return result;
  }, [scene, sceneDialogue]);

  const [selectionOptionsOpen, setSelectionOptionsOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ elementId: string; x: number; y: number } | null>(null);
  const [sceneList, setSceneList] = useState<CampaignSceneBoard[]>([]);
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  // SmugVTT private Stage speaker-dock-aware JRPG dialogue v3
  // Existing Chat presence portraits are portaled into document.body. Only their
  // actual on-screen height is used; no duplicate cards or presence subscriptions.
  const [speakerDockHeightPx, setSpeakerDockHeightPx] = useState(0);
  useEffect(() => {
    let dock: HTMLElement | null = null;
    const measure = () => {
      const next = dock && window.getComputedStyle(dock).display !== 'none'
        ? Math.ceil(dock.getBoundingClientRect().height)
        : 0;
      setSpeakerDockHeightPx((previous) => previous === next ? previous : next);
    };
    const resizeObserver = new ResizeObserver(measure);
    const attach = () => {
      const found = document.querySelector<HTMLElement>('[data-smug-speaker-presence]');
      if (found !== dock) {
        resizeObserver.disconnect();
        dock = found;
        if (dock) resizeObserver.observe(dock);
      }
      measure();
    };
    // Chat's portal may mount after Canvas. Observe additions only until found.
    const mountObserver = new MutationObserver(() => {
      if (!dock || !document.body.contains(dock)) attach();
    });
    mountObserver.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', attach);
    attach();
    return () => {
      mountObserver.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener('resize', attach);
    };
  }, []);
  // The Canvas itself is scaled: convert viewport pixels to Canvas coordinates.
  // Expanding/collapsing any player's portrait automatically adjusts the offset.
  const jrpgDockClearance = speakerDockHeightPx > 0
    ? Math.ceil((speakerDockHeightPx + 16) / Math.max(0.25, zoom))
    : 0;
  const imageInputRef = useRef<HTMLInputElement>(null);
  const replaceImageInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{
    id: string;
    ids: string[];
    mode: 'move' | 'resize';
    startX: number;
    startY: number;
    originals: Record<string, SceneBoardElement>;
  } | null>(null);
  const panRef = useRef<{ pointerId: number; startX: number; startY: number; scrollLeft: number; scrollTop: number } | null>(null);
  // Keep polling from overwriting an optimistic player drag before the server responds.
  const playerSavePending = useRef(false);

  useEffect(() => {
    try { window.localStorage.setItem('smugvtt:canvas-bubbles', String(canvasBubblesEnabled)); } catch { /* optional browser setting */ }
  }, [canvasBubblesEnabled]);
  useEffect(() => {
    if (!isGm || !campaignId) return;
    let alive = true;
    void api.listCampaignNpcs(campaignId).then((response) => {
      if (alive) setNpcSpeakerOptions(response.npcs.map((npc) => ({ key: `npc:${npc.id}`, name: npc.name })));
    }).catch(() => { if (alive) setNpcSpeakerOptions([]); });
    return () => { alive = false; };
  }, [campaignId, isGm]);
  useEffect(() => subscribeLiveSceneDialogue(campaignId, (line) => {
    setSpeakingKey(line.speakerKey);
  }), [campaignId]);
  useEffect(() => {
    if (!speakingKey) return;
    const timer = window.setTimeout(() => setSpeakingKey(''), 4500);
    return () => window.clearTimeout(timer);
  }, [speakingKey]);
  const spotlightActive = spotlightEnabled && Boolean(speakingKey) && board.elements.some(
    (element) => element.type === 'image' && !element.hidden && linkedSpeaker(element) === speakingKey,
  );

  const selected = useMemo(
    () => board.elements.find((element) => element.id === selectedId) ?? null,
    [board.elements, selectedId],
  );

  useEffect(() => {
    if (!selectedId) setSelectionOptionsOpen(false);
  }, [selectedId]);

  useEffect(() => {
    setSelectedIds((current) => current.filter((elementId) => board.elements.some((element) => element.id === elementId)));
    if (selectedId && !board.elements.some((element) => element.id === selectedId)) setSelectedId(null);
  }, [board.elements, selectedId]);

  useEffect(() => {
    if (!contextMenu) return;

    const close = () => setContextMenu(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };

    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [contextMenu]);





  const load = useCallback(async () => {
    if (!campaignId) return;
    try {
      const [active, list] = await Promise.all([
        api.getActiveSceneBoard(campaignId),
        isGm ? api.listSceneBoards(campaignId) : Promise.resolve({ scenes: [] as CampaignSceneBoard[] }),
      ]);
      // The GM may open an inactive private draft without publishing it.
      const selectedScene = active.scene ?? (isGm ? list.scenes[0] ?? null : null);
      setScene(selectedScene);
      setBoard(selectedScene ? normaliseBoard(selectedScene.boardState) : { ...DEFAULT_BOARD, elements: [] });
      if (isGm) setSceneList(list.scenes);
      setDirty(false);
      setHistory([]);
      setFuture([]);
      setSelectedId(null);
      setSelectedIds([]);
      const loadedBoard = selectedScene ? normaliseBoard(selectedScene.boardState) : null;
      if (loadedBoard?.view?.zoom) setZoom(Math.max(0.25, Math.min(2, loadedBoard.view.zoom)));
    } catch (error) {
      showToast(apiErrorMessage(error) || 'Could not load Scene Board', 'error');
    } finally {
      setLoading(false);
    }
  }, [campaignId, isGm, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll for shared board changes without remounting the viewer's interaction.
  // Initial load/switch resets selection and history; a routine background
  // refresh must NOT erase the currently selected artwork every four seconds.
  const refreshPlayerStage = useCallback(async () => {
    if (!campaignId || dragRef.current || playerSavePending.current) return;
    try {
      const response = await api.getActiveSceneBoard(campaignId);
      // A drag or save might have started while the request was in flight.
      if (dragRef.current || playerSavePending.current) return;
      const incoming = response.scene;
      const previous = sceneRef.current;
      if (!stageContentChanged(previous, incoming)) return;
      sceneRef.current = incoming;
      setScene(incoming);
      const next = incoming ? normaliseBoard(incoming.boardState) : { ...DEFAULT_BOARD, elements: [] };
      boardRef.current = next;
      setBoard(next);
      // The viewer fades in a newly published scene; Cut is immediate.
      if (incoming && previous?.id !== incoming.id && next.revealTransition === 'fade' &&
          !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        setRevealSequence((value) => value + 1);
        setShowRevealFade(true);
      }
      if (previous?.id !== incoming?.id) {
        setSelectedId(null);
        setSelectedIds([]);
        setContextMenu(null);
      }
    } catch {
      // Temporary network trouble must not wipe the existing visible Stage.
      // The next interval retries, and explicit edits report their own errors.
    }
  }, [campaignId]);

  // Viewers poll lightly so a GM's scene reveal/board save appears without reload.
  useEffect(() => {
    if (isGm || !campaignId) return;
    const timer = window.setInterval(() => { void refreshPlayerStage(); }, 4000);
    return () => window.clearInterval(timer);
  }, [campaignId, isGm, refreshPlayerStage]);


  useEffect(() => {
    if (isGm || !followGmView || !board.presentation || !board.view) return;
    const nextZoom = Math.max(0.25, Math.min(2, board.view.zoom));
    setZoom(nextZoom);
    window.requestAnimationFrame(() => {
      const viewport = viewportRef.current;
      if (!viewport || !board.view) return;
      viewport.scrollLeft = board.view.scrollLeft;
      viewport.scrollTop = board.view.scrollTop;
    });
  }, [board.presentation, board.view, followGmView, isGm]);

  const commit = useCallback((next: SceneBoardState) => {
    if (!isGm) return;
    setHistory((current) => [...current.slice(-49), board]);
    setFuture([]);
    setBoard(next);
    setDirty(true);
  }, [board, isGm]);

  const updateElement = (elementId: string, patch: Partial<SceneBoardElement>, track = true) => {
    const next = {
      ...board,
      elements: board.elements.map((element) => element.id === elementId ? { ...element, ...patch } : element),
    };
    if (track) commit(next);
    else {
      setBoard(next);
      setDirty(true);
    }
  };


  const playCue = (element: SceneBoardElement) => {
    if (!isGm || element.type !== 'image') return;
    const cue: StageCue = {
      id: id('stage-cue'),
      at: Date.now(),
      motion: stageMotion(element.stageMotion ?? 'pulse'),
      emote: stageEmote(element.stageEmote ?? 'none'),
    };
    updateElement(element.id, { stageCue: cue });
    setContextMenu(null);
  };

  const rememberPresentationView = (nextZoom = zoom) => {
    const viewport = viewportRef.current;
    if (!isGm || !board.presentation || !viewport) return;
    setBoard((current) => ({
      ...current,
      view: {
        zoom: nextZoom,
        scrollLeft: viewport.scrollLeft,
        scrollTop: viewport.scrollTop,
      },
    }));
    setDirty(true);
  };

  const applyZoom = (next: number) => {
    const clamped = Math.max(0.25, Math.min(2, next));
    setZoom(clamped);
    window.requestAnimationFrame(() => rememberPresentationView(clamped));
  };

  const fitScene = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const next = Math.max(0.25, Math.min(1, (viewport.clientWidth - 24) / BOARD_WIDTH, (viewport.clientHeight - 24) / BOARD_HEIGHT));
    setZoom(next);
    window.requestAnimationFrame(() => {
      viewport.scrollLeft = 0;
      viewport.scrollTop = 0;
      rememberPresentationView(next);
    });
  };

  const togglePresentation = useCallback(() => {
    if (!isGm) return;
    const viewport = viewportRef.current;
    const nextPresentation = !board.presentation;
    commit({
      ...board,
      presentation: nextPresentation,
      ...(nextPresentation && viewport
        ? { view: { zoom, scrollLeft: viewport.scrollLeft, scrollTop: viewport.scrollTop } }
        : {}),
    });
    setContextMenu(null);
  }, [board, commit, isGm, zoom]);

  // Presentation used to hide every editor control, trapping the GM until a
  // console event was dispatched. Esc always exits unless the user is editing
  // another control; the floating exit control remains available regardless.
  useEffect(() => {
    if (!isGm || !board.presentation) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      togglePresentation();
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [isGm, board.presentation, togglePresentation]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('smugvtt:scene-presentation-state', {
      detail: { active: board.presentation },
    }));
  }, [board.presentation]);

  useEffect(() => {
    if (!isGm) return;
    const onToggle = () => togglePresentation();
    window.addEventListener('smugvtt:scene-presentation-toggle', onToggle);
    return () => window.removeEventListener('smugvtt:scene-presentation-toggle', onToggle);
  }, [isGm, togglePresentation]);

  const undo = () => {
    if (!isGm || history.length === 0) return;
    const previous = history[history.length - 1];
    setHistory((current) => current.slice(0, -1));
    setFuture((current) => [board, ...current].slice(0, 50));
    setBoard(previous);
    setDirty(true);
  };

  const redo = () => {
    if (!isGm || future.length === 0) return;
    const next = future[0];
    setFuture((current) => current.slice(1));
    setHistory((current) => [...current, board].slice(-50));
    setBoard(next);
    setDirty(true);
  };

  const saveInFlightRef = useRef(false);
  const save = useCallback(async (showNotice = false) => {
    if (!isGm || !scene || !dirty) return !dirty;
    // Serialize writes: a second autosave must not race the first against
    // the same boardVersion and then replace newer edits with stale data.
    if (saveInFlightRef.current) return false;
    saveInFlightRef.current = true;
    setSaving(true);
    try {
      // Do not write a stale Stage snapshot back over changes made from Chat/Map.
      // The update is still not atomic: the server should eventually support
      // field-level optimistic transactions for concurrent Canvas/Stage edits.
      const freshScene = scene.active
        ? (await api.getActiveSceneBoard(campaignId)).scene
        : (await api.listSceneBoards(campaignId)).scenes.find((entry) => entry.id === scene.id);
      if (!freshScene || freshScene.id !== scene.id) throw new Error('Scene changed or draft was removed.');
      if (freshScene.boardVersion !== scene.boardVersion) {
        throw new Error('Canvas was modified elsewhere. Reload the draft before saving to avoid overwriting it.');
      }
      const latest = freshScene.boardState && typeof freshScene.boardState === 'object' && !Array.isArray(freshScene.boardState)
        ? freshScene.boardState as unknown as Record<string, unknown> : {};
      const nextBoard = {
        ...board,
        ...(latest.smugSceneStage !== undefined ? { smugSceneStage: latest.smugSceneStage } : {}),
      } as SceneBoardState;
      const result = await api.updateSceneBoard(campaignId, scene.id, { boardState: nextBoard });
      // If the current server strips unrecognized image metadata, do not
      // silently claim that Speak As links were saved.
      const returned = normaliseBoard(result.scene.boardState);
      for (const element of nextBoard.elements) {
        if (element.type !== 'image' || !linkedSpeaker(element)) continue;
        const savedImage = returned.elements.find((item) => item.id === element.id);
        if (!savedImage || linkedSpeaker(savedImage) !== linkedSpeaker(element)) {
          throw new Error('Canvas link was not persisted by the server. The Speak As image link needs backend support.');
        }
      }
      setScene(result.scene);
      setSceneList((current) => current.map((item) => item.id === result.scene.id ? result.scene : item));
      // The user may have edited again while the request was in flight.
      // Accept the server's new version but do not clobber the newer local
      // board. Keep it dirty so the next serialized autosave persists it.
      if (boardRef.current === board) {
        setBoard(returned);
        setDirty(false);
      }
      if (showNotice) showToast('Scene board saved', 'success');
      return true;
    } catch (error) {
      showToast(apiErrorMessage(error) || 'Could not save Scene Board', 'error');
      return false;
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);
    }
  }, [board, campaignId, dirty, isGm, scene, showToast]);

  // Autosave shortly after each edit; the button remains for explicit reassurance.
  // Retrying after an in-flight save finishes handles edits made mid-request.
  useEffect(() => {
    if (!dirty || !isGm || !scene || saving) return;
    const timer = window.setTimeout(() => void save(false), 900);
    return () => window.clearTimeout(timer);
  }, [dirty, isGm, save, scene, saving]);

  const createScene = async () => {
    const title = newSceneName.trim();
    if (!title || !campaignId) return;
    setCreatingScene(true);
    try {
      // Private by default. Creating a draft never interrupts the players' active scene.
      const result = await api.createSceneBoard(campaignId, {
        title,
        active: false,
        revealed: false,
        boardVisibility: 'gm',
      });
      setScene(result.scene);
      setBoard(normaliseBoard(result.scene.boardState));
      setSceneList((current) => [result.scene, ...current]);
      setNewSceneName('');
      setHistory([]);
      setFuture([]);
      setDirty(false);
      showToast('Scene created', 'success');
    } catch (error) {
      showToast(apiErrorMessage(error) || 'Could not create scene', 'error');
    } finally {
      setCreatingScene(false);
    }
  };

  const switchScene = async (sceneId: string) => {
    if (!isGm || !sceneId) return;
    if (sceneId === scene?.id) return;
    if (dirty) {
      // Never discard local edits because an autosave failed or is pending.
      if (!window.confirm('You have unsaved Stage edits. Save them before switching? Cancel keeps this Stage open.')) return;
      const didSave = await save(false);
      if (!didSave) { showToast('Save failed. Stage switch cancelled.', 'error'); return; }
    }
    try {
      // Opening a scene in Canvas is a local GM preview, not a broadcast.
      const listing = await api.listSceneBoards(campaignId);
      const selectedScene = listing.scenes.find((entry) => entry.id === sceneId);
      if (!selectedScene) throw new Error('Draft not found.');
      setScene(selectedScene);
      setBoard(normaliseBoard(selectedScene.boardState));
      setSceneList(listing.scenes);
      setHistory([]);
      setFuture([]);
      setDirty(false);
      setSelectedId(null);
      setSelectedIds([]);
      const nextBoard = normaliseBoard(selectedScene.boardState);
      if (nextBoard.view?.zoom) setZoom(Math.max(0.25, Math.min(2, nextBoard.view.zoom)));
    } catch (error) {
      showToast(apiErrorMessage(error) || 'Could not open Canvas draft', 'error');
    }
  };

  const goLive = async () => {
    if (!isGm || !scene || libraryBusy) return;
    if (!window.confirm(`Present "${scene.title}" to players now? This replaces the current live Canvas.`)) return;
    setLibraryBusy(true);
    try {
      // Save the draft before publishing; failed saves must never go live.
      if (dirty && !(await save(false))) return;
      const result = await api.updateSceneBoard(campaignId, scene.id, {
        active: true, revealed: true, boardVisibility: 'shared',
      });
      setScene(result.scene);
      setSceneList((current) => current.map((item) => item.id === result.scene.id
        ? result.scene : { ...item, active: false }));
      if (normaliseBoard(result.scene.boardState).revealTransition === 'fade' &&
          !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        setRevealSequence((value) => value + 1);
        setShowRevealFade(true);
      }
      showToast(`Canvas now live: ${result.scene.title}`, 'success');
    } catch (error) {
      showToast(apiErrorMessage(error) || 'Could not publish Canvas', 'error');
    } finally { setLibraryBusy(false); }
  };

  const returnToLive = async () => {
    if (dirty && !(await save(false))) return;
    await load();
  };

  /** Explicit, additive import: earlier small portraits are never discarded. */
  const importSceneCast = () => {
    if (!isGm) return;
    const images = importLegacyStageCast(board, () => id('stage-image'));
    if (!images.length) {
      showToast('No additional Scene portraits to import. Existing linked pictures are kept.', 'info');
      return;
    }
    commit({ ...board, elements: [...board.elements, ...images] });
    showToast(`${images.length} Scene portrait${images.length === 1 ? '' : 's'} placed on Stage. Resize and arrange them as you like.`, 'success');
  };

  const saveCanvasCopy = async () => {
    if (!isGm || !scene || libraryBusy) return;
    const title = window.prompt('Save this Stage composition as:', `${scene.title} copy`)?.trim();
    if (!title) return;
    if (dirty) {
      const ok = await save(false);
      if (!ok) { showToast('Save failed. Copy cancelled.', 'error'); return; }
    }
    setLibraryBusy(true);
    try {
      // Create a private, unrevealed board first. Never publish a partial copy.
      const created = await api.createSceneBoard(campaignId, {
        title, active: false, revealed: false, boardVisibility: 'gm',
      });
      const fresh = await api.getActiveSceneBoard(campaignId);
      const original = fresh.scene?.id === scene.id ? fresh.scene.boardState : board;
      const snapshot = normaliseBoard(original);
      // A library Canvas is a visual composition, not the active dialogue/cast state.
      const { smugSceneStage: _activeStage, ...composition } = snapshot as SceneBoardState & { smugSceneStage?: unknown };
      const updated = await api.updateSceneBoard(campaignId, created.scene.id, { boardState: composition as SceneBoardState });
      setSceneList((current) => [updated.scene, ...current.filter((item) => item.id !== updated.scene.id)]);
      showToast(`Stage saved to library: ${title}`, 'success');
    } catch (error) {
      showToast(apiErrorMessage(error) || 'Could not save Stage copy', 'error');
    } finally { setLibraryBusy(false); }
  };

  const renameLibraryCanvas = async (entry: CampaignSceneBoard) => {
    const title = window.prompt('Stage name:', entry.title)?.trim();
    if (!title || title === entry.title) return;
    setLibraryBusy(true);
    try {
      const response = await api.updateSceneBoard(campaignId, entry.id, { title });
      setSceneList((items) => items.map((item) => item.id === entry.id ? response.scene : item));
      if (scene?.id === entry.id) setScene(response.scene);
    } catch (error) { showToast(apiErrorMessage(error) || 'Could not rename Stage', 'error'); }
    finally { setLibraryBusy(false); }
  };

  const patchSceneMeta = async (patch: Partial<Pick<CampaignSceneBoard, 'title' | 'location' | 'timeLabel' | 'revealed' | 'boardVisibility'>>) => {
    if (!isGm || !scene) return;
    try {
      const result = await api.updateSceneBoard(campaignId, scene.id, patch);
      setScene(result.scene);
      setSceneList((current) => current.map((row) => row.id === result.scene.id ? result.scene : row));
    } catch (error) {
      showToast(apiErrorMessage(error) || 'Could not update scene', 'error');
    }
  };

  const addElement = (type: SceneBoardElementType) => {
    if (!isGm) return;
    const z = nextZ(board.elements);
    let element: SceneBoardElement;

    if (type === 'text') {
      const text = window.prompt('Text to place on Stage:', 'Scene note');
      if (!text) return;
      element = {
        id: id('text'), type, x: 180, y: 140, width: 320, height: 120,
        rotation: 0, z, locked: false, text, fontSize: 28, color: '#211f1a',
      };
    } else if (type === 'rect') {
      element = {
        id: id('rect'), type, x: 220, y: 180, width: 260, height: 160,
        rotation: 0, z, locked: false, fill: '#f7d9a8', stroke: '#6e5a3c', strokeWidth: 3,
      };
    } else if (type === 'ellipse') {
      element = {
        id: id('ellipse'), type, x: 260, y: 220, width: 220, height: 160,
        rotation: 0, z, locked: false, fill: '#dce9f2', stroke: '#536d7a', strokeWidth: 3,
      };
    } else {
      element = {
        id: id(type), type, x: 300, y: 300, width: 260, height: 80,
        rotation: 0, z, locked: false, stroke: '#3e3a32', strokeWidth: 4,
      };
    }

    commit({ ...board, elements: [...board.elements, element] });
    setSelectedId(element.id);
    setTool('select');
  };

  const deleteSelected = () => {
    if (!isGm || selectedIds.length === 0) return;
    const deletable = new Set(
      board.elements.filter((element) => selectedIds.includes(element.id) && !element.locked).map((element) => element.id),
    );
    if (deletable.size === 0) return;
    commit({ ...board, elements: board.elements.filter((element) => !deletable.has(element.id)) });
    setSelectedId(null);
    setSelectedIds([]);
  };

  const duplicateSelected = useCallback(() => {
    if (!isGm || selectedIds.length === 0) return;
    const originals = board.elements.filter((element) => selectedIds.includes(element.id));
    if (originals.length === 0) return;
    const baseZ = nextZ(board.elements);
    const copies = originals.map((element, index) => ({
      ...element,
      id: id(element.type),
      x: Math.min(BOARD_WIDTH - 20, element.x + 24),
      y: Math.min(BOARD_HEIGHT - 20, element.y + 24),
      z: baseZ + index,
      locked: false,
      ...(element.points ? { points: element.points.map((point) => ({ x: point.x + 24, y: point.y + 24 })) } : {}),
    }));
    commit({ ...board, elements: [...board.elements, ...copies] });
    const ids = copies.map((element) => element.id);
    setSelectedIds(ids);
    setSelectedId(ids[ids.length - 1] ?? null);
  }, [board, commit, isGm, selectedIds]);

  useEffect(() => {
    if (!isGm || selectedIds.length === 0) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable
      ) {
        return;
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        const deletable = new Set(
          board.elements.filter((element) => selectedIds.includes(element.id) && !element.locked).map((element) => element.id),
        );
        if (deletable.size === 0) return;
        event.preventDefault();
        commit({ ...board, elements: board.elements.filter((element) => !deletable.has(element.id)) });
        setSelectedId(null);
        setSelectedIds([]);
        setContextMenu(null);
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        duplicateSelected();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [board, isGm, selectedIds, commit, duplicateSelected]);

  const moveLayer = (direction: 1 | -1) => {
    if (!selected || selected.locked) return;
    updateElement(selected.id, { z: selected.z + direction });
  };

  const pointInBoard = (event: PointerEvent): SceneBoardPoint => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: Math.max(0, Math.min(BOARD_WIDTH, (event.clientX - rect.left) / zoom)),
      y: Math.max(0, Math.min(BOARD_HEIGHT, (event.clientY - rect.top) / zoom)),
    };
  };

  const onCanvasPointerDown = (event: PointerEvent) => {
    // A drag on empty Canvas in Select mode is a selection box, not a pan.
    // This remains separate from middle-button panning and pen drawing.
    if (canEdit && tool === 'select' && event.button === 0 && event.target === event.currentTarget) {
      const start = pointInBoard(event);
      marqueeRef.current = { pointerId: event.pointerId, start, end: start, moved: false };
      setMarquee({ x: start.x, y: start.y, width: 0, height: 0 });
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (!isGm || tool !== 'pen') return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrawing([pointInBoard(event)]);
    setSelectedId(null);
    setSelectedIds([]);
  };

  const onCanvasPointerMove = (event: PointerEvent) => {
    const activeMarquee = marqueeRef.current;
    if (activeMarquee && activeMarquee.pointerId === event.pointerId) {
      const end = pointInBoard(event);
      activeMarquee.end = end;
      activeMarquee.moved ||= Math.hypot(end.x - activeMarquee.start.x, end.y - activeMarquee.start.y) >= 4;
      setMarquee({
        x: Math.min(activeMarquee.start.x, end.x), y: Math.min(activeMarquee.start.y, end.y),
        width: Math.abs(end.x - activeMarquee.start.x), height: Math.abs(end.y - activeMarquee.start.y),
      });
      return;
    }
    if (!drawing || tool !== 'pen') return;
    const point = pointInBoard(event);
    setDrawing((current) => current ? [...current, point] : current);
  };

  const onCanvasPointerUp = () => {
    const completed = marqueeRef.current;
    if (completed) {
      marqueeRef.current = null;
      setMarquee(null);
      if (completed.moved) {
        const x1 = Math.min(completed.start.x, completed.end.x);
        const x2 = Math.max(completed.start.x, completed.end.x);
        const y1 = Math.min(completed.start.y, completed.end.y);
        const y2 = Math.max(completed.start.y, completed.end.y);
        const hits = boardRef.current.elements.filter((element) => {
          if (element.type === 'stroke' || element.locked || (!isGm && (element.hidden || element.type !== 'image'))) return false;
          const visual = element.type === 'image'
            ? canvasImageVisualRect(element, canvasArtMetrics[element.imageUrl ?? ''])
            : { left: 0, top: 0, width: element.width, height: element.height };
          const left = element.x + visual.left;
          const top = element.y + visual.top;
          return left < x2 && left + visual.width > x1 && top < y2 && top + visual.height > y1;
        }).map((element) => element.id);
        setSelectedIds(hits);
        setSelectedId((hits.length ? hits[hits.length - 1] : null));
        suppressCanvasClickRef.current = true;
      }
      return;
    }
    if (!drawing || drawing.length < 2) {
      setDrawing(null);
      return;
    }
    const element: SceneBoardElement = {
      id: id('stroke'),
      type: 'stroke',
      x: 0,
      y: 0,
      width: BOARD_WIDTH,
      height: BOARD_HEIGHT,
      rotation: 0,
      z: nextZ(board.elements),
      locked: false,
      points: drawing,
      stroke: '#2f2c27',
      strokeWidth: 4,
    };
    commit({ ...board, elements: [...board.elements, element] });
    setDrawing(null);
  };

  const onElementPointerDown = (event: PointerEvent, element: SceneBoardElement, mode: 'move' | 'resize') => {
    if (!mayDragStageElement(event.button, canEdit, isGm, tool, element)) return;
    event.stopPropagation();

    if (mode === 'move' && event.shiftKey) {
      setSelectedIds((current) => current.includes(element.id)
        ? current.filter((id) => id !== element.id)
        : [...current, element.id]);
      setSelectedId(element.id);
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    const ids = mode === 'move' && selectedIds.includes(element.id) && selectedIds.length > 1
      ? selectedIds
      : [element.id];
    setSelectedId(element.id);
    setSelectedIds(ids);
    const originals = Object.fromEntries(
      board.elements.filter((candidate) => ids.includes(candidate.id)).map((candidate) => [candidate.id, candidate]),
    );
    dragRef.current = {
      id: element.id,
      ids,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      originals,
    };
    if (isGm) {
      setHistory((current) => [...current.slice(-49), board]);
      setFuture([]);
    }
  };

  const onElementPointerMove = (event: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = (event.clientX - drag.startX) / zoom;
    const dy = (event.clientY - drag.startY) / zoom;

    const current = boardRef.current;
    const snap = (value: number) => snapToGrid ? Math.round(value / 20) * 20 : value;
    if (drag.mode === 'move') {
      const next = {
        ...current,
        elements: current.elements.map((element) => {
          const original = drag.originals[element.id];
          if (!original || original.locked) return element;
          if (element.type === 'stroke' && original.points) {
            return {
              ...element,
              points: original.points.map((point) => ({
                x: Math.max(0, Math.min(BOARD_WIDTH, snap(point.x + dx))),
                y: Math.max(0, Math.min(BOARD_HEIGHT, snap(point.y + dy))),
              })),
            };
          }
          return {
            ...element,
            x: Math.max(0, Math.min(BOARD_WIDTH - 20, snap(original.x + dx))),
            y: Math.max(0, Math.min(BOARD_HEIGHT - 20, snap(original.y + dy))),
          };
        }),
      };
      boardRef.current = next;
      setBoard(next);
      if (isGm) setDirty(true);
    } else {
      const original = drag.originals[drag.id];
      if (!original) return;
      const resized = original.type === 'image'
        ? resizeCanvasImage(original, canvasArtMetrics[original.imageUrl ?? ''], dx, dy, false)
        : { width: Math.max(30, snap(original.width + dx)), height: Math.max(30, snap(original.height + dy)) };
      const next = { ...current, elements: current.elements.map((element) => element.id === drag.id ? { ...element, ...resized } : element) };
      boardRef.current = next;
      setBoard(next);
      if (isGm) setDirty(true);
    }
  };

  const onElementPointerUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || isGm || !canEdit || !scene || !campaignId) return;
    // A player can move and resize only via the server's scoped, versioned
    // transform endpoint, which never accepts arbitrary scene/GM metadata.
    const changed = boardRef.current.elements.filter((element) => drag.ids.includes(element.id)
      && (element.x !== drag.originals[element.id]?.x || element.y !== drag.originals[element.id]?.y
        || element.width !== drag.originals[element.id]?.width || element.height !== drag.originals[element.id]?.height));
    if (!changed.length) return;
    playerSavePending.current = true;
    void (async () => {
      try {
        let version = scene.boardVersion;
        for (const element of changed) {
          const result = await api.transformStageElement(campaignId, scene.id, element.id, {
            boardVersion: version, x: element.x, y: element.y, width: element.width, height: element.height,
          });
          version = result.scene.boardVersion;
          setScene(result.scene);
          setBoard(normaliseBoard(result.scene.boardState));
        }
      } catch (error) {
        showToast(apiErrorMessage(error) || 'Stage changed. Reloading the shared layout.', 'error');
        void load();
      } finally {
        playerSavePending.current = false;
      }
    })();
  };

  const onViewportPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 1) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    panRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    };
  };

  const onViewportPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    const viewport = viewportRef.current;
    if (!pan || !viewport || pan.pointerId !== event.pointerId) return;
    viewport.scrollLeft = pan.scrollLeft - (event.clientX - pan.startX);
    viewport.scrollTop = pan.scrollTop - (event.clientY - pan.startY);
  };

  const onViewportPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!panRef.current || panRef.current.pointerId !== event.pointerId) return;
    panRef.current = null;
    rememberPresentationView();
  };


  const replaceImage = async (file: File) => {
    if (!campaignId || !isGm || !selected || selected.type !== 'image') return;

    const form = new FormData();
    form.append('file', file);
    form.append('type', 'MAP');
    form.append('scope', 'CAMPAIGN');
    form.append('campaignId', campaignId);
    form.append('name', file.name);
    form.append('tags', 'scene-board');

    try {
      const result = await api.uploadAsset(form);
      updateElement(selected.id, {
        imageAssetId: result.asset.id,
        imageUrl: assetUrl(result.asset.id),
      });
      setContextMenu(null);
      showToast('Scene image replaced', 'success');
    } catch (error) {
      showToast(apiErrorMessage(error) || 'Could not replace image', 'error');
    }
  };

  const placeExistingImage = (asset: Asset) => {
    if (!isGm || !campaignId) return;
    const position = defaultStageImagePosition(board.elements.filter((item) => item.type === 'image').length);
    const element: SceneBoardElement = {
      id: id('image'), type: 'image', x: position.x, y: position.y,
      width: 640, height: 480, rotation: 0, z: nextZ(board.elements), locked: false,
      hidden: placeNewImagesHidden,
      imageAssetId: asset.id, imageUrl: assetUrl(asset.id),
    };
    commit({ ...board, elements: [...board.elements, element] });
    setSelectedId(element.id);
    setSelectedIds([element.id]);
    setExistingImagePickerOpen(false);
  };

  const uploadImage = async (file: File) => {
    if (!campaignId || !isGm) return;
    const form = new FormData();
    form.append('file', file);
    form.append('type', 'MAP');
    form.append('scope', 'CAMPAIGN');
    form.append('campaignId', campaignId);
    form.append('name', file.name);
    form.append('tags', 'scene-board');

    try {
      const result = await api.uploadAsset(form);
      const position = defaultStageImagePosition(board.elements.filter((item) => item.type === 'image').length);
      const element: SceneBoardElement = {
        id: id('image'),
        type: 'image',
        x: position.x,
        y: position.y,
        width: 640,
        height: 480,
        rotation: 0,
        z: nextZ(board.elements),
        locked: false,
        hidden: placeNewImagesHidden,
        imageAssetId: result.asset.id,
        imageUrl: assetUrl(result.asset.id),
      };
      commit({ ...board, elements: [...board.elements, element] });
      setSelectedId(element.id);
    } catch (error) {
      showToast(apiErrorMessage(error) || 'Could not upload image', 'error');
    }
  };

  const renderElement = (element: SceneBoardElement) => {
    if (element.hidden && !isGm) return null;
    const active = selectedIds.includes(element.id);
    const editable = canEdit && (isGm || element.type === 'image') && (!element.hidden || isGm);
    const visualImage = element.type === 'image'
      ? canvasImageVisualRect(element, canvasArtMetrics[element.imageUrl ?? '']) : null;
    const common = {
      position: 'absolute' as const,
      left: element.x,
      top: element.y,
      width: element.width,
      height: element.height,
      transform: `rotate(${element.rotation}deg)`,
      zIndex: element.z,
      ...(spotlightActive && element.type === 'image' && linkedSpeaker(element) ? {
        opacity: linkedSpeaker(element) === speakingKey ? 1 : 0.76,
        filter: linkedSpeaker(element) === speakingKey
          ? 'brightness(1.06) drop-shadow(0 0 16px rgba(255,220,150,.48))'
          : 'brightness(.88) saturate(.90)',
        transition: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'none' : 'opacity 250ms ease, filter 250ms ease',
      } : {}),
    };

    let body: ReactNode;
    if (element.type === 'text') {
      body = (
        <div
          className="h-full w-full whitespace-pre-wrap break-words p-2"
          style={{ fontSize: element.fontSize ?? 28, color: element.color ?? '#211f1a' }}
          onDoubleClick={() => {
            if (!isGm || element.locked) return;
            const text = window.prompt('Edit text:', element.text ?? '');
            if (text !== null) updateElement(element.id, { text });
          }}
        >
          {element.text}
        </div>
      );
    } else if (element.type === 'image') {
      const speaker = linkedSpeaker(element);
      const spoken = speaker ? latestDialogueBySpeaker.get(speaker) : undefined;
      const cueFromChat = spoken && element.stageAutoReact !== false &&
        Date.parse(spoken.createdAt) >= (element.stageCue?.at ?? 0);
      const cue: StageCue | undefined = cueFromChat
        ? { id: `chat-${spoken.messageId}`, at: Date.parse(spoken.createdAt),
            motion: stageMotion(element.stageMotion ?? 'pulse'), emote: stageEmote(element.stageEmote ?? 'none') }
        : element.stageCue;
      body = <StagePicture src={element.imageUrl} cue={cue} motionEnabled={pictureMotionEnabled} repeat={element.stageRepeat === true} repeatMotion={stageMotion(element.stageMotion ?? 'none')} />;
    } else if (element.type === 'rect') {
      body = <div className="h-full w-full" style={{ background: element.fill, border: `${element.strokeWidth ?? 3}px solid ${element.stroke ?? '#444'}` }} />;
    } else if (element.type === 'ellipse') {
      body = <div className="h-full w-full rounded-full" style={{ background: element.fill, border: `${element.strokeWidth ?? 3}px solid ${element.stroke ?? '#444'}` }} />;
    } else if (element.type === 'line' || element.type === 'arrow') {
      body = (
        <svg viewBox={`0 0 ${element.width} ${element.height}`} className="h-full w-full overflow-visible">
          <defs>
            <marker id={`arrow-${element.id}`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 z" fill={element.stroke ?? '#333'} />
            </marker>
          </defs>
          <line
            x1="0"
            y1={element.height / 2}
            x2={element.width}
            y2={element.height / 2}
            stroke={element.stroke ?? '#333'}
            strokeWidth={element.strokeWidth ?? 4}
            markerEnd={element.type === 'arrow' ? `url(#arrow-${element.id})` : undefined}
          />
        </svg>
      );
    } else {
      return null;
    }

    return (
      <div
        key={element.id}
        style={{ ...common, ...(visualImage ? { pointerEvents: 'none' as const, ...(element.hidden ? { opacity: 0.55 } : {}) } : {}) }}
        className={`${active && editable && !visualImage ? 'outline outline-2 outline-brand' : ''} ${speakingKey && element.type === 'image' && linkedSpeaker(element) === speakingKey ? 'ring-4 ring-info/70' : ''} ${element.locked ? 'cursor-default' : editable ? 'cursor-move' : ''}`}
        onPointerDown={(event) => { if (!visualImage) onElementPointerDown(event, element, 'move'); }}
        onPointerMove={onElementPointerMove}
        onPointerUp={onElementPointerUp}
        onClick={(event) => {
          event.stopPropagation();
          if (!editable) return;
          // A click at the end of a group drag must not discard the group.
          if (!event.shiftKey && !(selectedIds.includes(element.id) && selectedIds.length > 1)) {
            setSelectedId(element.id);
            setSelectedIds([element.id]);
          }
        }}
        onContextMenu={(event) => {
          if (!isGm) return;
          event.preventDefault();
          event.stopPropagation();
          setSelectedId(element.id);
          if (!selectedIds.includes(element.id)) setSelectedIds([element.id]);
          setContextMenu({
            elementId: element.id,
            x: event.clientX,
            y: event.clientY,
          });
        }}
      >
        {body}
        {visualImage && (
          <div
            data-smug-image-hitbox={element.id}
            aria-label={element.hidden ? 'GM-hidden Canvas image' : 'Canvas image'}
            title={element.hidden ? 'Hidden from players — GM can arrange and reveal' : undefined}
            className={`${active && editable ? 'outline outline-2 outline-brand' : ''} absolute`}
            style={{ left: visualImage.left, top: visualImage.top, width: visualImage.width,
              height: visualImage.height, pointerEvents: 'auto' }}
            onPointerDown={(event) => onElementPointerDown(event, element, 'move')}
            onPointerMove={onElementPointerMove}
            onPointerUp={onElementPointerUp}
          >
            {active && editable && !element.locked && (
              <button type="button" aria-label="Resize selected scene element"
                className="absolute -bottom-2 -right-2 h-5 w-5 rounded-sm border border-brand bg-paper shadow"
                onPointerDown={(event) => onElementPointerDown(event, element, 'resize')}
                onPointerMove={onElementPointerMove} onPointerUp={onElementPointerUp} />
            )}
          </div>
        )}
        {active && editable && !element.locked && !visualImage && (
          <button
            type="button"
            aria-label="Resize selected scene element"
            className="absolute -bottom-2 -right-2 h-5 w-5 rounded-sm border border-brand bg-paper shadow"
            onPointerDown={(event) => onElementPointerDown(event, element, 'resize')}
            onPointerMove={onElementPointerMove}
            onPointerUp={onElementPointerUp}
          />
        )}
      </div>
    );
  };

  if (loading) {
    return <div className="flex h-full items-center justify-center text-sm text-ink-muted">Loading Stage…</div>;
  }

  if (!scene) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-ink-secondary">{isGm ? 'No active Stage yet.' : 'The GM has not shared an active scene.'}</p>
        {isGm && (
          <div className="flex w-full max-w-md gap-2">
            <input className="input-cozy flex-1" value={newSceneName} onChange={(event) => setNewSceneName(event.target.value)} placeholder="Scene title" />
            <Button icon={Plus} loading={creatingScene} disabled={!newSceneName.trim()} onClick={() => void createScene()}>Create</Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col gap-2">
      <div className={`${board.presentation ? 'hidden' : ''} shrink-0 rounded-cozy border border-ink/10 bg-paper p-1.5`}
        style={{ marginLeft: 'var(--smug-map-left-inset, 0px)', marginRight: 'var(--smug-map-right-inset, 0px)' }}
      >
        <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto">
          {isGm ? (
            <select
              className="input-cozy shrink-0 py-1 text-sm"
              style={{ width: 260 }}
              value={scene.id}
              onChange={(event) => void switchScene(event.target.value)}
              aria-label="Stage to edit (switching here does not go live)"
              title="Open a Canvas privately; use Go Live to present it to players"
            >
              {sceneList.map((row) => <option key={row.id} value={row.id}>{row.title}{row.active ? ' (Live)' : ' (Draft)'}</option>)}
            </select>
          ) : (
            <strong className="min-w-0 flex-1 truncate px-2 text-ink">{scene.title}</strong>
          )}

          {isGm && (
            <>

              <Button size="sm" variant={libraryOpen ? 'primary' : 'secondary'} icon={Library}
                onClick={() => setLibraryOpen((value) => !value)}>Stage Library</Button>
              <Button
                size="sm"
                variant={sceneOptionsOpen ? 'primary' : 'secondary'}
                onClick={() => setSceneOptionsOpen((open) => !open)}
              >
                Stage Options
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={togglePresentation}
                title="Enter Canvas Presentation Mode. Press Escape to exit."
              >
                Present
              </Button>

              {selected && (
                <Button
                  size="sm"
                  variant={selectionOptionsOpen ? 'primary' : 'secondary'}
                  onClick={() => setSelectionOptionsOpen((open) => !open)}
                >
                  Selection: {selectedIds.length > 1 ? `${selectedIds.length} objects` : selected.type}
                </Button>
              )}

              <Button
                size="sm"
                variant="secondary"
                icon={Save}
                loading={saving}
                disabled={!dirty}
                onClick={() => void save(true)}
              >
                {dirty ? 'Save' : 'Saved'}
              </Button>
              {(!scene.active || !scene.revealed || scene.boardVisibility !== 'shared') && (
                <Button size="sm" variant="primary" disabled={saving || libraryBusy} onClick={() => void goLive()}>
                  Go Live
                </Button>
              )}
              {!scene.active && sceneList.some((item) => item.active) && (
                <Button size="sm" variant="secondary" onClick={() => void returnToLive()}>
                  Return to Live
                </Button>
              )}
              {!scene.active && <span className="text-xs font-semibold text-warning-ink">{scene.revealed && scene.boardVisibility === 'shared' ? 'Inactive (previously shared)' : 'GM-only draft'}</span>}
            </>
          )}

          <label className="flex shrink-0 items-center gap-1 text-xs">
            Dialogue
            <select className="input-cozy py-1 text-xs" aria-label="Stage dialogue style"
              value={dialogueStyle} onChange={(event) => setDialogueStyle(event.target.value as 'bubbles' | 'vn' | 'jrpg')}>
              <option value="bubbles">Speech bubbles</option>
              <option value="vn">Visual novel</option>
              <option value="jrpg">16/32-bit JRPG</option>
            </select>
          </label>
          <label className="flex shrink-0 items-center gap-1 text-xs" title="Briefly emphasize the current linked IC speaker; other character pictures dim only in your browser">
            <input type="checkbox" checked={spotlightEnabled} onChange={(event) => setSpotlightEnabled(event.target.checked)} />
            Speaker spotlight
          </label>
          <Button size="sm" variant="secondary" icon={MessageSquareText}
            onClick={() => setCanvasBubblesEnabled((value) => !value)}
            aria-pressed={canvasBubblesEnabled}
            title="Show or hide quoted IC dialogue in the selected Stage style">
            {canvasBubblesEnabled ? 'Dialogue On' : 'Dialogue Off'}
          </Button>
          <label className="flex shrink-0 items-center gap-1 text-xs" title="Per-browser Canvas motion preference. Turn on to play motion cues even if your OS uses Reduce Motion.">
            <input type="checkbox" aria-label="Enable Canvas picture motion" checked={pictureMotionEnabled}
              onChange={(event) => setPictureMotionEnabled(event.target.checked)} />
            Picture Motion {pictureMotionEnabled ? 'On' : 'Off'}
          </label>
          {scene.location && <span className="shrink-0 text-xs text-ink-muted">{scene.location}</span>}
          {scene.timeLabel && <span className="shrink-0 text-xs text-ink-muted">{scene.timeLabel}</span>}
        </div>

        {isGm && libraryOpen && <section className="rounded-cozy border border-ink/15 bg-paper p-2" aria-label="Stage Library">
          <div className="mb-2 flex items-center justify-between gap-2">
            <strong className="text-sm">Stage Library</strong>
            <Button size="sm" variant="secondary" icon={Copy} disabled={libraryBusy} onClick={() => void saveCanvasCopy()}>Save As New Stage</Button>
          </div>
          <p className="mb-2 text-xs text-ink-muted">GM preview is private; opening or editing a draft will not change what players see. Use Go Live to publish. IC Chat is never duplicated.</p>
          <div className="grid max-h-52 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
            {sceneList.map((entry) => {
              const preview = normaliseBoard(entry.boardState);
              return <div key={entry.id} className="min-w-0 rounded border border-ink/15 p-1.5">
                <button type="button" disabled={libraryBusy || entry.id === scene.id}
                  onClick={() => void switchScene(entry.id)} title={`Privately preview ${entry.title}`}
                  className="w-full overflow-hidden rounded border border-ink/10 text-left">
                  <div className="relative h-14" style={{ background: preview.background }}>
                    <div className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[10px] text-white">{preview.elements.length} items</div>
                  </div>
                  <span className="block truncate px-1 py-0.5 text-xs font-semibold">{entry.title}</span>
                </button>
                <div className="mt-1 flex justify-between gap-1 text-[10px]">
                  <span className="text-ink-muted">{entry.id === scene.id ? 'Active' : entry.revealed ? 'Revealed' : 'Private'}</span>
                  <button type="button" disabled={libraryBusy} className="underline" onClick={() => void renameLibraryCanvas(entry)}>Rename</button>
                </div>
              </div>;
            })}
          </div>
        </section>}

        {isGm && existingImagePickerOpen && (
          <section className="mt-1.5 rounded-cozy border border-ink/15 bg-paper p-2" aria-label="Previously uploaded Canvas images">
            <div className="mb-2 flex items-center justify-between gap-2">
              <strong className="text-sm">Previously Used Images</strong>
              <input className="input-cozy w-52 py-1 text-xs" aria-label="Search previously uploaded pictures"
                placeholder="Search pictures…" value={existingImageSearch}
                onChange={(event) => setExistingImageSearch(event.target.value)} />
            </div>
            {existingImagesLoading && <p className="text-xs text-ink-muted">Loading pictures…</p>}
            {existingImagesError && <p className="text-xs text-danger-ink" role="alert">{existingImagesError}</p>}
            {!existingImagesLoading && !existingImagesError && existingImageAssets.length === 0 &&
              <p className="text-xs text-ink-muted">No reusable campaign pictures yet.</p>}
            <div className="grid max-h-52 grid-cols-3 gap-2 overflow-y-auto md:grid-cols-6">
              {existingImageAssets.filter((asset) => asset.name.toLocaleLowerCase().includes(existingImageSearch.toLocaleLowerCase()))
                .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
                .slice(0, 120).map((asset) => (
                  <button key={asset.id} type="button" title={`Place ${asset.name}`} onClick={() => placeExistingImage(asset)}
                    className="min-w-0 overflow-hidden rounded border border-ink/15 bg-ink/5 p-1 text-left hover:border-brand">
                    <img src={assetUrl(asset.id)} alt="" loading="lazy" className="h-16 w-full object-contain" />
                    <span className="block truncate text-[10px] font-medium text-ink">{asset.name}</span>
                  </button>
              ))}
            </div>
          </section>
        )}

        {isGm && sceneOptionsOpen && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 rounded bg-ink/5 p-1.5">
            <input
              className="input-cozy py-1 text-xs"
              style={{ width: 210 }}
              value={newSceneName}
              onChange={(event) => setNewSceneName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && newSceneName.trim()) void createScene();
              }}
              placeholder="New scene title"
              aria-label="New scene title"
            />
            <Button
              size="sm"
              variant="secondary"
              icon={Plus}
              loading={creatingScene}
              disabled={!newSceneName.trim()}
              onClick={() => void createScene()}
            >
              New
            </Button>

            <label className="ml-1 flex items-center gap-1 text-xs text-ink-secondary" title="Drafts remain private until Go Live">
              <input
                type="checkbox"
                checked={scene.revealed}
                disabled={!scene.active}
                onChange={(event) => void patchSceneMeta({ revealed: event.target.checked })}
              />
              Revealed
            </label>
            <label className="flex items-center gap-1 text-xs text-ink-secondary">
              Reveal effect
              <select className="input-cozy py-1 text-xs" aria-label="Canvas reveal effect"
                value={board.revealTransition ?? 'cut'}
                onChange={(event) => commit({ ...board, revealTransition: event.target.value as 'cut' | 'fade' })}>
                <option value="cut">Cut</option>
                <option value="fade">Fade (silent)</option>
              </select>
            </label>
            <label className="flex items-center gap-1 text-xs text-ink-secondary" title="When this scene is revealed and shared, players can drag and resize visible, unlocked pictures. GM notes, drawings and scene settings remain protected.">
              <input type="checkbox" checked={board.allowPlayerEditing === true}
                onChange={(event) => commit({ ...board, allowPlayerEditing: event.target.checked })} />
              Allow players to arrange pictures
            </label>
            {board.allowPlayerEditing && (!scene.revealed || scene.boardVisibility !== 'shared') && (
              <span className="text-xs text-warning-ink" role="status">Reveal this scene and set visibility to Shared before player arranging becomes available.</span>
            )}

            <select
              className="input-cozy py-1 text-xs"
              style={{ width: 120 }}
              value={scene.boardVisibility}
              disabled={!scene.active}
              onChange={(event) => void patchSceneMeta({ boardVisibility: event.target.value as 'gm' | 'shared' })}
            >
              <option value="gm">GM only</option>
              <option value="shared">Shared</option>
            </select>
            <Button size="sm" variant="secondary" onClick={importSceneCast}
              title="Copy older Scene portraits into the freeform Stage without deleting the original Scene cast">
              Import existing Scene cast
            </Button>

            <label className="flex items-center gap-1.5 text-xs text-ink-muted">
              Background
              <input
                type="color"
                value={board.background}
                onChange={(event) => commit({ ...board, background: event.target.value })}
                className="h-7 w-9 cursor-pointer rounded border border-ink/10 bg-transparent p-0"
              />
            </label>
          </div>
        )}

        {isGm && (
          <div className="mt-1.5 flex flex-nowrap items-center gap-1.5 overflow-x-auto pb-0.5">
            <Button size="sm" variant={tool === 'select' ? 'primary' : 'secondary'} icon={MousePointer2} onClick={() => setTool('select')}>Select</Button>
            <Button size="sm" variant={tool === 'pen' ? 'primary' : 'secondary'} icon={Pencil} onClick={() => setTool('pen')}>Doodle</Button>
            <Button size="sm" variant="secondary" icon={Type} onClick={() => addElement('text')}>Text</Button>
            <Button size="sm" variant="secondary" icon={Square} onClick={() => addElement('rect')}>Box</Button>
            <Button size="sm" variant="secondary" icon={Circle} onClick={() => addElement('ellipse')}>Circle</Button>
            <Button size="sm" variant="secondary" icon={Minus} onClick={() => addElement('line')}>Line</Button>
            <Button size="sm" variant="secondary" icon={ArrowUp} onClick={() => addElement('arrow')}>Arrow</Button>
            <Button size="sm" variant="secondary" icon={ImagePlus} onClick={() => imageInputRef.current?.click()} title="Add a 640×480 Stage picture; supports PNG, JPEG, WebP and GIF. Drag to resize after placing.">Image</Button>
            <Button size="sm" variant={existingImagePickerOpen ? 'primary' : 'secondary'}
              onClick={() => setExistingImagePickerOpen((open) => !open)}>Previously Used</Button>
            <label className="flex shrink-0 items-center gap-1 text-xs" title="Place newly uploaded or reused pictures hidden from players">
              <input type="checkbox" checked={placeNewImagesHidden} onChange={(event) => setPlaceNewImagesHidden(event.target.checked)} />
              Place hidden
            </label>
            <input
              ref={imageInputRef}
              hidden
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadImage(file);
                event.currentTarget.value = '';
              }}
            />
            <input
              ref={replaceImageInputRef}
              hidden
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void replaceImage(file);
                event.currentTarget.value = '';
              }}
            />
            <span className="mx-0.5 h-5 w-px shrink-0 bg-ink/10" />
            <Button size="sm" variant="secondary" icon={Undo2} disabled={history.length === 0} onClick={undo}>Undo</Button>
            <Button size="sm" variant="secondary" icon={Redo2} disabled={future.length === 0} onClick={redo}>Redo</Button>
            <label className="flex shrink-0 items-center gap-1 text-xs text-ink-secondary">
              <input type="checkbox" checked={snapToGrid} onChange={(event) => setSnapToGrid(event.target.checked)} />
              Snap movement (20 px)
            </label>
            <Button size="sm" variant="secondary" disabled={selectedIds.length === 0} onClick={duplicateSelected}>Duplicate</Button>
            <span className="mx-0.5 h-5 w-px shrink-0 bg-ink/10" />
            <Button size="sm" variant="secondary" onClick={() => applyZoom(zoom - 0.1)}>−</Button>
            <span className="shrink-0 text-xs text-ink-muted">{Math.round(zoom * 100)}%</span>
            <Button size="sm" variant="secondary" onClick={() => applyZoom(zoom + 0.1)}>+</Button>
            <Button size="sm" variant="secondary" onClick={() => applyZoom(1)}>100%</Button>
            <Button size="sm" variant="secondary" onClick={fitScene}>Fit</Button>
          </div>
        )}

        {!isGm && canEdit && (
          <label className="mt-1 flex items-center gap-1.5 text-xs text-ink-secondary">
            <input type="checkbox" checked={snapToGrid} onChange={(event) => setSnapToGrid(event.target.checked)} />
            Snap to 20 px grid while arranging shared Stage
          </label>
        )}

        {isGm && selected && selectionOptionsOpen && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 rounded bg-ink/5 p-1.5 text-xs">
            <span className="mr-1 font-medium capitalize text-ink">{selectedIds.length > 1 ? `${selectedIds.length} objects` : selected.type}</span>
            {selected.type === 'image' && selectedIds.length === 1 && <label className="flex items-center gap-1 text-xs font-semibold">
              Speaking as / Character is
              <select aria-label="Link image to Chat speaker" className="input-cozy max-w-[12rem] py-1 text-xs"
                value={linkedSpeaker(selected)}
                onChange={(event) => updateElement(selected.id, { smugSpeakerKey: event.target.value || undefined } as Partial<SceneBoardElement>)}>
                <option value="">Unlinked image</option>
                {linkedSpeakers.map((speaker) => <option key={speaker.key} value={speaker.key}>{speaker.name}</option>)}
              </select>
            </label>}
            {selected.type === 'image' && selectedIds.length === 1 && <>
              <label className="flex items-center gap-1">Motion
                <select className="input-cozy py-1 text-xs" aria-label="Stage picture motion"
                  value={stageMotion(selected.stageMotion ?? 'pulse')}
                  onChange={(event) => {
                    const motion = stageMotion(event.target.value);
                    updateElement(selected.id, { stageMotion: motion, stageCue: {
                      id: id('motion-preview'), at: Date.now(), motion, emote: 'none',
                    } });
                  }}>
                  {STAGE_MOTIONS.map(([value, name]) => <option key={value} value={value}>{name}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-1">Emote
                <select className="input-cozy py-1 text-xs" aria-label="Stage picture emote"
                  value={stageEmote(selected.stageEmote)}
                  onChange={(event) => updateElement(selected.id, { stageEmote: stageEmote(event.target.value) })}>
                  {STAGE_EMOTES.map(([value, name]) => <option key={value} value={value}>{name}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-1" title="Trigger this picture's selected motion/emote on linked quoted IC dialogue">
                <input type="checkbox" checked={selected.stageAutoReact !== false}
                  onChange={(event) => updateElement(selected.id, { stageAutoReact: event.target.checked })} />
                React to Chat
              </label>
              <label className="flex items-center gap-1" title="Loop this picture's selected motion until Repeat is turned off">
                <input type="checkbox" aria-label="Repeat picture motion"
                  checked={selected.stageRepeat === true}
                  onChange={(event) => updateElement(selected.id, { stageRepeat: event.target.checked })} />
                Repeat Motion
              </label>
              <Button size="sm" variant="secondary" onClick={() => playCue(selected)}>Play cue</Button>
            </>}
            {selected.type === 'image' && selectedIds.length === 1 && (
              <Button size="sm" variant="secondary"
                onClick={() => updateElement(selected.id, { hidden: !selected.hidden })}>
                {selected.hidden ? 'Reveal to Players' : 'Hide from Players'}
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={duplicateSelected}>Duplicate</Button>
            <Button size="sm" variant="secondary" icon={selected.locked ? Unlock : Lock} onClick={() => updateElement(selected.id, { locked: !selected.locked })}>
              {selected.locked ? 'Unlock' : 'Lock'}
            </Button>
            <Button size="sm" variant="secondary" icon={RotateCcw} disabled={selected.locked} onClick={() => updateElement(selected.id, { rotation: selected.rotation - 15 })}>-15°</Button>
            <Button size="sm" variant="secondary" icon={RotateCw} disabled={selected.locked} onClick={() => updateElement(selected.id, { rotation: selected.rotation + 15 })}>+15°</Button>
            <Button size="sm" variant="secondary" icon={ArrowUp} disabled={selected.locked} onClick={() => moveLayer(1)}>Forward</Button>
            <Button size="sm" variant="secondary" icon={ArrowDown} disabled={selected.locked} onClick={() => moveLayer(-1)}>Back</Button>
            <Button size="sm" variant="danger" icon={Trash2} disabled={selected.locked} onClick={deleteSelected}>Delete</Button>
          </div>
        )}
      </div>

      {board.presentation && isGm && (
        <div className="absolute top-3 z-[910] flex items-center gap-2 rounded-cozy border border-ink/20 bg-paper/95 p-2 shadow-lg opacity-[0.13] transition-opacity duration-300 hover:opacity-100 focus-within:opacity-100 motion-reduce:transition-none [@media(hover:none)]:opacity-100"
          style={{ right: 'var(--smug-map-right-inset, 12px)' }} role="toolbar" aria-label="Stage presentation controls">
          <span className="px-1 text-xs font-semibold text-ink-secondary">Presentation Mode</span>
          <Button size="sm" variant="secondary" icon={Library} onClick={() => { setLibraryOpen(true); togglePresentation(); }}>
            Stage Library
          </Button>
          <Button size="sm" variant="primary" icon={LogOut} onClick={togglePresentation}>
            Exit (Esc)
          </Button>
        </div>
      )}

      {board.presentation && !isGm && (
        <div className="absolute top-3 z-[900] flex items-center gap-2 rounded-cozy border border-ink/15 bg-paper/95 p-1.5 shadow-lg"
          style={{ right: 'var(--smug-map-right-inset, 12px)' }}>
          <label className="flex items-center gap-1.5 px-1 text-xs text-ink-secondary">
            <input type="checkbox" checked={followGmView} onChange={(event) => setFollowGmView(event.target.checked)} />
            Follow GM
          </label>
          <span className="text-xs text-ink-muted">{Math.round(zoom * 100)}%</span>
        </div>
      )}

      {contextMenu && selected && contextMenu.elementId === selected.id && (
        <div
          className="fixed z-[1000] min-w-44 overflow-y-auto rounded-cozy border border-ink/15 bg-paper p-1 shadow-xl"
          // Context menus can be tall once speaker, emotion and picture tools
          // are shown. Open up and left as needed, and scroll the menu itself
          // rather than letting the last buttons fall off a phone/iPad screen.
          style={{
            left: Math.max(8, Math.min(contextMenu.x, window.innerWidth - 260)),
            top: Math.max(8, Math.min(contextMenu.y, window.innerHeight - 440)),
            maxHeight: `calc(100dvh - ${Math.max(8, Math.min(contextMenu.y, window.innerHeight - 440)) + 8}px)`,
            maxWidth: 'calc(100vw - 16px)',
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <div className="px-3 py-1.5 text-xs font-medium capitalize text-ink-muted">
            {selected.type}
          </div>

          {selected.type === 'image' && <label className="block border-b border-ink/10 px-2 py-1.5 text-xs text-ink">
            Speaking as / Character is
            <select aria-label="Speaking as / Character is" className="input-cozy mt-1 w-full text-xs" value={linkedSpeaker(selected)}
              onChange={(event) => { updateElement(selected.id, { smugSpeakerKey: event.target.value || undefined } as Partial<SceneBoardElement>); setContextMenu(null); }}>
              <option value="">Unlinked image</option>
              {linkedSpeakers.map((speaker) => <option key={speaker.key} value={speaker.key}>{speaker.name}</option>)}
            </select>
          </label>}
          {selected.type === 'image' && <>
            <div className="border-b border-ink/10 px-2 py-1.5 text-xs">
              <label className="block">Motion
                <select className="input-cozy mt-1 w-full text-xs" aria-label="Right-click Stage motion"
                  value={stageMotion(selected.stageMotion ?? 'pulse')}
                  onChange={(event) => {
                    const motion = stageMotion(event.target.value);
                    updateElement(selected.id, { stageMotion: motion, stageCue: {
                      id: id('motion-preview'), at: Date.now(), motion, emote: 'none',
                    } });
                  }}>
                  {STAGE_MOTIONS.map(([value, name]) => <option key={value} value={value}>{name}</option>)}
                </select>
              </label>
              <label className="mt-1 block">Emote
                <select className="input-cozy mt-1 w-full text-xs" aria-label="Right-click Stage emote"
                  value={stageEmote(selected.stageEmote)}
                  onChange={(event) => updateElement(selected.id, { stageEmote: stageEmote(event.target.value) })}>
                  {STAGE_EMOTES.map(([value, name]) => <option key={value} value={value}>{name}</option>)}
                </select>
              </label>
              <label className="mt-1 flex items-center gap-1">
                <input type="checkbox" checked={selected.stageAutoReact !== false}
                  onChange={(event) => updateElement(selected.id, { stageAutoReact: event.target.checked })} />
                React to quoted IC Chat
              </label>
              <label className="mt-1 flex items-center gap-1">
                  <input type="checkbox" aria-label="Repeat picture motion in menu"
                    checked={selected.stageRepeat === true}
                    onChange={(event) => updateElement(selected.id, { stageRepeat: event.target.checked })} />
                  Repeat Motion
                </label>
                <button className="mt-2 rounded border px-2 py-1" type="button" onClick={() => playCue(selected)}>Play silent cue</button>
            </div>
          </>}
          {selected.type === 'image' && (
            <button type="button"
              className="flex w-full items-center rounded px-3 py-2 text-left text-sm text-ink hover:bg-ink/5"
              onClick={() => { updateElement(selected.id, { hidden: !selected.hidden }); setContextMenu(null); }}>
              {selected.hidden ? 'Reveal to Players' : 'Hide from Players'}
            </button>
          )}
          {selected.type === 'image' && (
            <button
              type="button"
              className="flex w-full items-center rounded px-3 py-2 text-left text-sm text-ink hover:bg-ink/5"
              onClick={() => {
                setContextMenu(null);
                replaceImageInputRef.current?.click();
              }}
            >
              Replace Image...
            </button>
          )}

          {selected.type === 'text' && (
            <button
              type="button"
              className="flex w-full items-center rounded px-3 py-2 text-left text-sm text-ink hover:bg-ink/5"
              onClick={() => {
                const nextText = window.prompt('Edit text:', selected.text ?? '');
                if (nextText !== null) updateElement(selected.id, { text: nextText });
                setContextMenu(null);
              }}
            >
              Edit Text...
            </button>
          )}

          <button
            type="button"
            className="flex w-full items-center rounded px-3 py-2 text-left text-sm text-ink hover:bg-ink/5"
            onClick={() => {
              updateElement(selected.id, { locked: !selected.locked });
              setContextMenu(null);
            }}
          >
            {selected.locked ? 'Unlock' : 'Lock'}
          </button>
          <button
            type="button"
            disabled={selected.locked}
            className="flex w-full items-center rounded px-3 py-2 text-left text-sm text-ink hover:bg-ink/5 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => {
              moveLayer(1);
              setContextMenu(null);
            }}
          >
            Bring Forward
          </button>
          <button
            type="button"
            disabled={selected.locked}
            className="flex w-full items-center rounded px-3 py-2 text-left text-sm text-ink hover:bg-ink/5 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => {
              moveLayer(-1);
              setContextMenu(null);
            }}
          >
            Send Back
          </button>
          <div className="my-1 border-t border-ink/10" />
          <button
            type="button"
            disabled={selected.locked}
            className="flex w-full items-center rounded px-3 py-2 text-left text-sm text-danger-ink hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => {
              deleteSelected();
              setContextMenu(null);
            }}
          >
            Delete
          </button>
        </div>
      )}

      <div
        ref={viewportRef}
        className="min-h-0 flex-1 overflow-auto rounded-cozy border border-ink/10 bg-ink/5 p-3"
        onPointerDown={onViewportPointerDown}
        onPointerMove={onViewportPointerMove}
        onPointerUp={onViewportPointerUp}
        onWheel={(event) => {
          if (!event.ctrlKey) return;
          event.preventDefault();
          applyZoom(zoom + (event.deltaY < 0 ? 0.1 : -0.1));
        }}
      >
        {/* Visible on Canvas just as connection status is visible elsewhere. */}
        <div className="pointer-events-none sticky left-2 top-2 z-[850] h-0 w-max">
          <div className="inline-flex items-center gap-1.5 rounded bg-paper/90 px-2 py-1 text-xs font-medium text-ink shadow ring-1 ring-ink/10" role="status"
            aria-label={`${connectedCanvasCount} campaign participants connected`}>
            <UsersRound className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{connectedCanvasCount} connected</span>
          </div>
        </div>
        <div className="relative mx-auto" style={{ width: BOARD_WIDTH * zoom, height: BOARD_HEIGHT * zoom }}>
        <div
          ref={canvasRef}
          className={`absolute left-0 top-0 overflow-hidden shadow-lg ${tool === 'pen' && isGm ? 'cursor-crosshair' : ''}`}
          style={{
            width: BOARD_WIDTH,
            height: BOARD_HEIGHT,
            background: board.background,
            transform: `scale(${zoom})`,
            transformOrigin: 'top left',
          }}
          onPointerDown={onCanvasPointerDown}
          onPointerMove={onCanvasPointerMove}
          onPointerUp={onCanvasPointerUp}
          onClick={() => {
            if (suppressCanvasClickRef.current) { suppressCanvasClickRef.current = false; return; }
            if (tool === 'select') {
              setSelectedId(null);
              setSelectedIds([]);
            }
          }}
        >
          {[...board.elements].sort((a, b) => a.z - b.z).map(renderElement)}
          {marquee && (
            <div aria-hidden="true" className="pointer-events-none absolute z-[850] border border-dashed border-brand bg-brand/10"
              style={{ left: marquee.x, top: marquee.y, width: marquee.width, height: marquee.height }} />
          )}
          {showRevealFade && <div key={revealSequence} aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-[1200] bg-[#080e20]"
            style={{ animation: 'smugvtt-canvas-reveal 720ms ease-out forwards' }} />}

          {/* A single non-interactive dialogue layer, above all visual objects.
              Bubbles never intercept Canvas pointer/drag controls. */}
          {canvasBubblesEnabled && dialogueStyle === 'bubbles' && <div className="pointer-events-none absolute inset-0 z-[1000]">
            {board.elements.filter((element) => element.type === 'image' && !element.hidden && latestDialogueBySpeaker.has(linkedSpeaker(element))).map((element) => {
              const spoken = latestDialogueBySpeaker.get(linkedSpeaker(element))!;
              const showBelow = element.y < 175;
              const x = Math.max(190, Math.min(BOARD_WIDTH - 190, canvasArtSpeechX(element.x, element.width, element.height, canvasArtMetrics[element.imageUrl ?? ''])));
              const y = showBelow ? element.y + element.height + 26 : element.y - 25;
              return <div key={`${element.id}:${spoken.messageId}`}
                role="status" aria-label={`${spoken.speakerName} says: ${spoken.quotes.join(' ')}`}
                className={`absolute w-[360px] rounded-xl border border-ink/30 bg-white/95 px-3 py-2 text-center text-[17px] leading-snug text-ink shadow-xl ${speakingKey === spoken.speakerKey ? 'ring-4 ring-info/60' : ''}`}
                style={{ left: x, top: y, transform: showBelow ? 'translateX(-50%)' : 'translate(-50%, -100%)' }}
                title={spoken.quotes.join(' ')}>
                <span className="block break-words">“{canvasDialogueLabel(spoken)}”</span>
                <span aria-hidden="true" className={`absolute left-1/2 h-4 w-4 -translate-x-1/2 rotate-45 border-ink/30 bg-white ${showBelow ? '-top-[9px] border-l border-t' : '-bottom-[9px] border-b border-r'}`} />
              </div>;
            })}
          </div>}

          {canvasBubblesEnabled && dialogueStyle !== 'bubbles' && sceneDialogue.length > 0 && (() => {
            const since = Date.parse(scene.startedAt ?? scene.createdAt) || 0;
            const entry = [...sceneDialogue].reverse().find((line) => Date.parse(line.createdAt) >= since);
            if (!entry) return null;
            // Speak As portrait first; a visible Stage picture linked to the same
            // identity is only a fallback when the Chat identity has no picture.
            const portraitUrl = entry.imageUrl || board.elements.find((element) =>
              element.type === 'image' && !element.hidden && linkedSpeaker(element) === entry.speakerKey
            )?.imageUrl || null;
            return <div key={entry.messageId} role="status"
               data-smug-stage-dialogue={dialogueStyle}
               style={dialogueStyle === 'jrpg' ? { bottom: `calc(1.25rem + ${jrpgDockClearance}px)` } : undefined}
              aria-label={`${entry.speakerName} says: ${entry.quotes.join(' ')}`}
              className={`pointer-events-none absolute bottom-5 left-8 right-8 z-[1000] px-6 py-4 text-white shadow-2xl ${dialogueStyle === 'jrpg'
                ? 'border-[5px] border-white bg-[#14203b] font-mono text-[23px] leading-relaxed outline outline-[5px] outline-black'
                : 'rounded-xl border-2 border-white/70 bg-ink/90 text-[22px] leading-snug backdrop-blur-md'}`}>
              {dialogueStyle === 'jrpg' ? (
                <div className="flex items-start gap-5">
                  <JrpgPortrait src={portraitUrl} name={entry.speakerName} />
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 font-bold text-[#f7d98b]">{entry.speakerName}</div>
                    <div className="break-words">“{canvasDialogueLabel(entry)}”</div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="mb-1 font-bold text-warning-ink">{entry.speakerName}</div>
                  <div className="break-words">“{canvasDialogueLabel(entry)}”</div>
                </>
              )}
            </div>;
          })()}

          <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`}>
            {board.elements.filter((element) => element.type === 'stroke' && (!element.hidden || isGm)).map((element) => (
              <path
                key={element.id}
                d={pointsToPath(element.points ?? [])}
                fill="none"
                stroke={element.stroke ?? '#2f2c27'}
                strokeWidth={(element.strokeWidth ?? 4) + (selectedIds.includes(element.id) && isGm ? 2 : 0)}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={selectedIds.includes(element.id) ? 0.75 : 1}
                pointerEvents={isGm ? 'stroke' : 'none'}
                onPointerDown={(event) => onElementPointerDown(event as unknown as PointerEvent, element, 'move')}
                onPointerMove={(event) => onElementPointerMove(event as unknown as PointerEvent)}
                onPointerUp={onElementPointerUp}
                onClick={(event) => {
                  event.stopPropagation();
                  if (!isGm) return;
                  if (!event.shiftKey) {
                    setSelectedId(element.id);
                    setSelectedIds([element.id]);
                  }
                }}
                onContextMenu={(event) => {
                  if (!isGm) return;
                  event.preventDefault();
                  event.stopPropagation();
                  setSelectedId(element.id);
                  if (!selectedIds.includes(element.id)) setSelectedIds([element.id]);
                  setContextMenu({ elementId: element.id, x: event.clientX, y: event.clientY });
                }}
              />
            ))}
            {drawing && (
              <path
                d={pointsToPath(drawing)}
                fill="none"
                stroke="#2f2c27"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
          </svg>
        </div>
        </div>
      </div>
    </div>
  );
}
