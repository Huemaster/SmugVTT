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
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { PointerEvent, ReactNode } from 'react';
import { canvasArtSpeechX, measureCanvasArt, type CanvasArtMetrics } from './canvasSpeechAnchor';
import { api } from '@/services/api';
import { useCampaign } from '@/contexts/CampaignContext';
import { useToast } from '@/contexts/ToastContext';
import Button from '@/components/ui/Button';
import { apiErrorMessage } from '@/utils/errors';
import { getSceneHistory, subscribeSceneHistory, subscribeLiveSceneDialogue, type SceneUtterance } from './sceneDialogue';
import type {
  CampaignSceneBoard,
  SceneBoardElement,
  SceneBoardElementType,
  SceneBoardPoint,
  SceneBoardState,
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
  const campaignId = campaign?.id ?? '';
  const isGm = userRole === 'DM';

  const [scene, setScene] = useState<CampaignSceneBoard | null>(null);
  const [board, setBoard] = useState<SceneBoardState>(DEFAULT_BOARD);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tool, setTool] = useState<Tool>('select');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [zoom, setZoom] = useState(1);
  const [followGmView, setFollowGmView] = useState(true);
  const [history, setHistory] = useState<SceneBoardState[]>([]);
  const [future, setFuture] = useState<SceneBoardState[]>([]);
  const [dirty, setDirty] = useState(false);
  const [drawing, setDrawing] = useState<SceneBoardPoint[] | null>(null);
  const [newSceneName, setNewSceneName] = useState('');
  const [creatingScene, setCreatingScene] = useState(false);
  const [sceneOptionsOpen, setSceneOptionsOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [npcSpeakerOptions, setNpcSpeakerOptions] = useState<Array<{ key: string; name: string }>>([]);
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
    if (!canvasBubblesEnabled || !scene) return result;
    const since = Date.parse(scene.startedAt ?? scene.createdAt) || 0;
    for (const line of sceneDialogue) {
      if (Date.parse(line.createdAt) >= since) result.set(line.speakerKey, line);
    }
    return result;
  }, [canvasBubblesEnabled, scene?.id, scene?.startedAt, scene?.createdAt, sceneDialogue]);

  const [selectionOptionsOpen, setSelectionOptionsOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ elementId: string; x: number; y: number } | null>(null);
  const [sceneList, setSceneList] = useState<CampaignSceneBoard[]>([]);
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
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
  }, [board, isGm, selectedIds]);



  const load = useCallback(async () => {
    if (!campaignId) return;
    try {
      const [active, list] = await Promise.all([
        api.getActiveSceneBoard(campaignId),
        isGm ? api.listSceneBoards(campaignId) : Promise.resolve({ scenes: [] as CampaignSceneBoard[] }),
      ]);
      setScene(active.scene);
      setBoard(active.scene ? normaliseBoard(active.scene.boardState) : { ...DEFAULT_BOARD, elements: [] });
      if (isGm) setSceneList(list.scenes);
      setDirty(false);
      setHistory([]);
      setFuture([]);
      setSelectedId(null);
      setSelectedIds([]);
      const loadedBoard = active.scene ? normaliseBoard(active.scene.boardState) : null;
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

  // Viewers poll lightly so a GM's scene reveal/board save appears without reload.
  useEffect(() => {
    if (isGm || !campaignId) return;
    const timer = window.setInterval(() => void load(), 4000);
    return () => window.clearInterval(timer);
  }, [campaignId, isGm, load]);


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

  const commit = (next: SceneBoardState) => {
    if (!isGm) return;
    setHistory((current) => [...current.slice(-49), board]);
    setFuture([]);
    setBoard(next);
    setDirty(true);
  };

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

  const togglePresentation = () => {
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
  };

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

  const save = useCallback(async (showNotice = false) => {
    if (!isGm || !scene || !dirty) return !dirty;
    setSaving(true);
    try {
      // Do not write a stale Stage snapshot back over changes made from Chat/Map.
      // The update is still not atomic: the server should eventually support
      // field-level optimistic transactions for concurrent Canvas/Stage edits.
      const fresh = await api.getActiveSceneBoard(campaignId);
      if (!fresh.scene || fresh.scene.id !== scene.id) throw new Error('Active scene changed.');
      const latest = fresh.scene.boardState && typeof fresh.scene.boardState === 'object' && !Array.isArray(fresh.scene.boardState)
        ? fresh.scene.boardState as unknown as Record<string, unknown> : {};
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
      setBoard(normaliseBoard(result.scene.boardState));
      setDirty(false);
      if (showNotice) showToast('Scene board saved', 'success');
      return true;
    } catch (error) {
      showToast(apiErrorMessage(error) || 'Could not save Scene Board', 'error');
      return false;
    } finally {
      setSaving(false);
    }
  }, [board, campaignId, dirty, isGm, scene, showToast]);

  // Autosave shortly after each edit; the button remains for explicit reassurance.
  useEffect(() => {
    if (!dirty || !isGm || !scene) return;
    const timer = window.setTimeout(() => void save(false), 900);
    return () => window.clearTimeout(timer);
  }, [dirty, isGm, save, scene]);

  const createScene = async () => {
    const title = newSceneName.trim();
    if (!title || !campaignId) return;
    setCreatingScene(true);
    try {
      const result = await api.createSceneBoard(campaignId, {
        title,
        active: true,
        revealed: false,
        boardVisibility: 'gm',
      });
      setScene(result.scene);
      setBoard(normaliseBoard(result.scene.boardState));
      setSceneList((current) => [result.scene, ...current.map((row) => ({ ...row, active: false }))]);
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
      if (!window.confirm('You have unsaved Canvas edits. Save them before switching? Cancel keeps this Canvas open.')) return;
      const didSave = await save(false);
      if (!didSave) { showToast('Save failed. Canvas switch cancelled.', 'error'); return; }
    }
    try {
      const result = await api.updateSceneBoard(campaignId, sceneId, { active: true });
      setScene(result.scene);
      setBoard(normaliseBoard(result.scene.boardState));
      setSceneList((current) => current.map((row) => ({ ...row, active: row.id === result.scene.id })));
      setHistory([]);
      setFuture([]);
      setDirty(false);
      setSelectedId(null);
      setSelectedIds([]);
      const nextBoard = normaliseBoard(result.scene.boardState);
      if (nextBoard.view?.zoom) setZoom(Math.max(0.25, Math.min(2, nextBoard.view.zoom)));
    } catch (error) {
      showToast(apiErrorMessage(error) || 'Could not switch scene', 'error');
    }
  };

  const saveCanvasCopy = async () => {
    if (!isGm || !scene || libraryBusy) return;
    const title = window.prompt('Save this Canvas composition as:', `${scene.title} copy`)?.trim();
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
      showToast(`Canvas saved to library: ${title}`, 'success');
    } catch (error) {
      showToast(apiErrorMessage(error) || 'Could not save Canvas copy', 'error');
    } finally { setLibraryBusy(false); }
  };

  const renameLibraryCanvas = async (entry: CampaignSceneBoard) => {
    const title = window.prompt('Canvas name:', entry.title)?.trim();
    if (!title || title === entry.title) return;
    setLibraryBusy(true);
    try {
      const response = await api.updateSceneBoard(campaignId, entry.id, { title });
      setSceneList((items) => items.map((item) => item.id === entry.id ? response.scene : item));
      if (scene?.id === entry.id) setScene(response.scene);
    } catch (error) { showToast(apiErrorMessage(error) || 'Could not rename Canvas', 'error'); }
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
      const text = window.prompt('Text to place on the scene board:', 'Scene note');
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

  const duplicateSelected = () => {
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
  };

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
    if (!isGm || tool !== 'pen') return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrawing([pointInBoard(event)]);
    setSelectedId(null);
    setSelectedIds([]);
  };

  const onCanvasPointerMove = (event: PointerEvent) => {
    if (!drawing || tool !== 'pen') return;
    const point = pointInBoard(event);
    setDrawing((current) => current ? [...current, point] : current);
  };

  const onCanvasPointerUp = () => {
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
    if (!isGm || tool !== 'select' || element.locked) return;
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
    setHistory((current) => [...current.slice(-49), board]);
    setFuture([]);
  };

  const onElementPointerMove = (event: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = (event.clientX - drag.startX) / zoom;
    const dy = (event.clientY - drag.startY) / zoom;

    if (drag.mode === 'move') {
      const next = {
        ...board,
        elements: board.elements.map((element) => {
          const original = drag.originals[element.id];
          if (!original || original.locked) return element;
          if (element.type === 'stroke' && original.points) {
            return {
              ...element,
              points: original.points.map((point) => ({
                x: Math.max(0, Math.min(BOARD_WIDTH, point.x + dx)),
                y: Math.max(0, Math.min(BOARD_HEIGHT, point.y + dy)),
              })),
            };
          }
          return {
            ...element,
            x: Math.max(0, Math.min(BOARD_WIDTH - 20, original.x + dx)),
            y: Math.max(0, Math.min(BOARD_HEIGHT - 20, original.y + dy)),
          };
        }),
      };
      setBoard(next);
      setDirty(true);
    } else {
      const original = drag.originals[drag.id];
      if (!original) return;
      updateElement(drag.id, {
        width: Math.max(30, original.width + dx),
        height: Math.max(30, original.height + dy),
      }, false);
    }
  };

  const onElementPointerUp = () => {
    dragRef.current = null;
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
      const element: SceneBoardElement = {
        id: id('image'),
        type: 'image',
        x: 180,
        y: 120,
        width: 520,
        height: 320,
        rotation: 0,
        z: nextZ(board.elements),
        locked: false,
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
    const common = {
      position: 'absolute' as const,
      left: element.x,
      top: element.y,
      width: element.width,
      height: element.height,
      transform: `rotate(${element.rotation}deg)`,
      zIndex: element.z,
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
      body = <img src={element.imageUrl} alt="" draggable={false} className="h-full w-full select-none object-contain" />;
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
        style={common}
        className={`${active && isGm ? 'outline outline-2 outline-brand' : ''} ${speakingKey && element.type === 'image' && linkedSpeaker(element) === speakingKey ? 'ring-4 ring-sky-400/70' : ''} ${element.locked ? 'cursor-default' : isGm ? 'cursor-move' : ''}`}
        onPointerDown={(event) => onElementPointerDown(event, element, 'move')}
        onPointerMove={onElementPointerMove}
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
          setContextMenu({
            elementId: element.id,
            x: event.clientX,
            y: event.clientY,
          });
        }}
      >
        {body}
        {active && isGm && !element.locked && (
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
    return <div className="flex h-full items-center justify-center text-sm text-ink-muted">Loading Scene Board…</div>;
  }

  if (!scene) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-ink-secondary">{isGm ? 'No active Scene Board yet.' : 'The GM has not shared an active scene.'}</p>
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
              aria-label="Active scene"
            >
              {sceneList.map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}
            </select>
          ) : (
            <strong className="min-w-0 flex-1 truncate px-2 text-ink">{scene.title}</strong>
          )}

          {isGm && (
            <>
              <Button size="sm" variant={libraryOpen ? 'primary' : 'secondary'} icon={Library}
                onClick={() => setLibraryOpen((value) => !value)}>Canvas Library</Button>
              <Button
                size="sm"
                variant={sceneOptionsOpen ? 'primary' : 'secondary'}
                onClick={() => setSceneOptionsOpen((open) => !open)}
              >
                Scene Options
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
            </>
          )}

          <Button size="sm" variant="secondary" icon={MessageSquareText}
            onClick={() => setCanvasBubblesEnabled((value) => !value)}
            title="Show or hide quoted IC dialogue above linked Canvas images">
            {canvasBubblesEnabled ? 'Bubbles On' : 'Bubbles Off'}
          </Button>
          {scene.location && <span className="shrink-0 text-xs text-ink-muted">{scene.location}</span>}
          {scene.timeLabel && <span className="shrink-0 text-xs text-ink-muted">{scene.timeLabel}</span>}
        </div>

        {isGm && libraryOpen && <section className="rounded-cozy border border-ink/15 bg-paper p-2" aria-label="Canvas Library">
          <div className="mb-2 flex items-center justify-between gap-2">
            <strong className="text-sm">Canvas Library</strong>
            <Button size="sm" variant="secondary" icon={Copy} disabled={libraryBusy} onClick={() => void saveCanvasCopy()}>Save As New Canvas</Button>
          </div>
          <p className="mb-2 text-xs text-ink-muted">Reusable Canvas compositions. Loading another Canvas changes the shared active board. Stage dialogue is not copied.</p>
          <div className="grid max-h-52 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
            {sceneList.map((entry) => {
              const preview = normaliseBoard(entry.boardState);
              return <div key={entry.id} className="min-w-0 rounded border border-ink/15 p-1.5">
                <button type="button" disabled={libraryBusy || entry.id === scene.id}
                  onClick={() => void switchScene(entry.id)} title={`Load ${entry.title}`}
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

            <label className="ml-1 flex items-center gap-1 text-xs text-ink-secondary">
              <input
                type="checkbox"
                checked={scene.revealed}
                onChange={(event) => void patchSceneMeta({ revealed: event.target.checked })}
              />
              Revealed
            </label>

            <select
              className="input-cozy py-1 text-xs"
              style={{ width: 120 }}
              value={scene.boardVisibility}
              onChange={(event) => void patchSceneMeta({ boardVisibility: event.target.value as 'gm' | 'shared' })}
            >
              <option value="gm">GM only</option>
              <option value="shared">Shared</option>
            </select>

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
            <Button size="sm" variant="secondary" icon={ImagePlus} onClick={() => imageInputRef.current?.click()}>Image</Button>
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
            <Button size="sm" variant="secondary" disabled={selectedIds.length === 0} onClick={duplicateSelected}>Duplicate</Button>
            <span className="mx-0.5 h-5 w-px shrink-0 bg-ink/10" />
            <Button size="sm" variant="secondary" onClick={() => applyZoom(zoom - 0.1)}>−</Button>
            <span className="shrink-0 text-xs text-ink-muted">{Math.round(zoom * 100)}%</span>
            <Button size="sm" variant="secondary" onClick={() => applyZoom(zoom + 0.1)}>+</Button>
            <Button size="sm" variant="secondary" onClick={() => applyZoom(1)}>100%</Button>
            <Button size="sm" variant="secondary" onClick={fitScene}>Fit</Button>
          </div>
        )}

        {isGm && selected && selectionOptionsOpen && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 rounded bg-ink/5 p-1.5 text-xs">
            <span className="mr-1 font-medium capitalize text-ink">{selectedIds.length > 1 ? `${selectedIds.length} objects` : selected.type}</span>
            {selected.type === 'image' && selectedIds.length === 1 && <label className="flex items-center gap-1 text-xs font-semibold">
              Speak As
              <select aria-label="Link image to Chat speaker" className="input-cozy max-w-[12rem] py-1 text-xs"
                value={linkedSpeaker(selected)}
                onChange={(event) => updateElement(selected.id, { smugSpeakerKey: event.target.value || undefined } as Partial<SceneBoardElement>)}>
                <option value="">Unlinked image</option>
                {linkedSpeakers.map((speaker) => <option key={speaker.key} value={speaker.key}>{speaker.name}</option>)}
              </select>
            </label>}
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
        <div className="absolute top-3 z-[910] flex items-center gap-2 rounded-cozy border border-ink/20 bg-paper/95 p-2 shadow-lg"
          style={{ right: 'var(--smug-map-right-inset, 12px)' }} role="toolbar" aria-label="Canvas presentation controls">
          <span className="px-1 text-xs font-semibold text-ink-secondary">Presentation Mode</span>
          <Button size="sm" variant="secondary" icon={Library} onClick={() => { setLibraryOpen(true); togglePresentation(); }}>
            Canvas Library
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
          className="fixed z-[1000] min-w-44 rounded-cozy border border-ink/15 bg-paper p-1 shadow-xl"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <div className="px-3 py-1.5 text-xs font-medium capitalize text-ink-muted">
            {selected.type}
          </div>

          {selected.type === 'image' && <label className="block border-b border-ink/10 px-2 py-1.5 text-xs text-ink">
            Link to Speak As character
            <select aria-label="Link Canvas image to speaker" className="input-cozy mt-1 w-full text-xs" value={linkedSpeaker(selected)}
              onChange={(event) => { updateElement(selected.id, { smugSpeakerKey: event.target.value || undefined } as Partial<SceneBoardElement>); setContextMenu(null); }}>
              <option value="">Unlinked image</option>
              {linkedSpeakers.map((speaker) => <option key={speaker.key} value={speaker.key}>{speaker.name}</option>)}
            </select>
          </label>}
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
            if (tool === 'select') {
              setSelectedId(null);
              setSelectedIds([]);
            }
          }}
        >
          {[...board.elements].sort((a, b) => a.z - b.z).map(renderElement)}

          {/* A single non-interactive dialogue layer, above all visual objects.
              Bubbles never intercept Canvas pointer/drag controls. */}
          {canvasBubblesEnabled && <div className="pointer-events-none absolute inset-0 z-[1000]">
            {board.elements.filter((element) => element.type === 'image' && !element.hidden && latestDialogueBySpeaker.has(linkedSpeaker(element))).map((element) => {
              const spoken = latestDialogueBySpeaker.get(linkedSpeaker(element))!;
              const showBelow = element.y < 175;
              const x = Math.max(190, Math.min(BOARD_WIDTH - 190, canvasArtSpeechX(element.x, element.width, element.height, canvasArtMetrics[element.imageUrl ?? ''])));
              const y = showBelow ? element.y + element.height + 26 : element.y - 25;
              return <div key={`${element.id}:${spoken.messageId}`}
                role="status" aria-label={`${spoken.speakerName} says: ${spoken.quotes.join(' ')}`}
                className={`absolute w-[360px] rounded-xl border border-slate-400 bg-white/95 px-3 py-2 text-center text-[17px] leading-snug text-slate-900 shadow-xl ${speakingKey === spoken.speakerKey ? 'ring-4 ring-sky-400/60' : ''}`}
                style={{ left: x, top: y, transform: showBelow ? 'translateX(-50%)' : 'translate(-50%, -100%)' }}
                title={spoken.quotes.join(' ')}>
                <span className="block break-words">“{canvasDialogueLabel(spoken)}”</span>
                <span aria-hidden="true" className={`absolute left-1/2 h-4 w-4 -translate-x-1/2 rotate-45 border-slate-400 bg-white ${showBelow ? '-top-[9px] border-l border-t' : '-bottom-[9px] border-b border-r'}`} />
              </div>;
            })}
          </div>}

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
