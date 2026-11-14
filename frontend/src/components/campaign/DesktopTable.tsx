// ============================================
// Desktop Table: the campaign page's desktop arrangement
// The header, the paused banner and three resizable columns:
// Left: Campaign info, character, party
// Center: Map canvas
// Right: Chat, dice roller, controls
//
// The map, the session panels and the Party content are the page's,
// drawn once and moved into this arrangement's slots (tableHosts.tsx), so
// they outlive it. What is here is the arrangement's own: the header's
// buttons, the columns' sizes and whether a side column is folded away.
// The windows the header opens are the page's too, so its buttons only
// ask the page to open them.
// ============================================

import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react';
import { useLeavePage } from '@/hooks/useLeaveGuard';
import {
  ArrowLeft,
  Sun,
  PauseCircle,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen, Settings, BookOpen, Keyboard, GripHorizontal, RotateCcw } from 'lucide-react';
import { useCampaign } from '@/contexts/CampaignContext';
import { useGameStore } from '@/stores/gameStore';
import SessionSidebar from '@/components/campaign/SessionSidebar';
import SessionToolbar, { type SessionToolKey } from '@/components/campaign/SessionToolbar';
import { useTableSlot } from '@/components/campaign/tableHosts';
import ConnectionStatus from '@/components/ConnectionStatus';
import { SESSION_STATUS_LABELS, SessionPausedBanner } from '@/components/campaign/sessionStatus';
import { CampaignStatus } from '@/types';
import type { Campaign } from '@/types';
import Button from '@/components/ui/Button';
import Tooltip from '@/components/ui/Tooltip';

interface DesktopTableProps {
  campaign: Campaign;
  /** Whether the viewer owns the campaign, which may differ from running it. */
  isOwner: boolean;
  /** Which of the DM's slide-overs are open, which the toolbar shows pressed. */
  openTools: Record<SessionToolKey, boolean>;
  /** Open one of the DM's slide-overs; `settings` is also an owner's way to the settings. */
  onOpenTool: (key: SessionToolKey) => void;
  onOpenDocuments: () => void;
  onOpenShortcuts: () => void;
  workspace: 'map' | 'scene' | 'chat';
  onWorkspaceChange: (workspace: 'map' | 'scene' | 'chat') => void;
}

type PanelSide = 'left' | 'right';
type PanelGeometry = { x: number | null; y: number; width: number; height: number | null };
type PanelBounds = { width: number; height: number };
type Position = { x: number; y: number; width: number; height: number };
const GUTTER = 8;

const limit = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));
function initialPanel(side: PanelSide): PanelGeometry {
  const defaultWidth = side === 'left' ? 320 : 360;
  const sizeKey = `smugvtt:${side}-width`;
  try {
    const data = window.localStorage.getItem(`smugvtt:floating-${side}`);
    if (data) {
      const parsed = JSON.parse(data) as Partial<PanelGeometry>;
      if (typeof parsed === 'object' && parsed !== null) {
        return {
          x: typeof parsed.x === 'number' && Number.isFinite(parsed.x) ? parsed.x : null,
          y: typeof parsed.y === 'number' && Number.isFinite(parsed.y) ? parsed.y : GUTTER,
          width: typeof parsed.width === 'number' && Number.isFinite(parsed.width) ? parsed.width : defaultWidth,
          height: typeof parsed.height === 'number' && Number.isFinite(parsed.height) ? parsed.height : null,
        };
      }
    }
    return { x: null, y: GUTTER, width: Number(window.localStorage.getItem(sizeKey)) || defaultWidth, height: null };
  } catch {
    return { x: null, y: GUTTER, width: defaultWidth, height: null };
  }
}
function panelPosition(side: PanelSide, config: PanelGeometry, bounds: PanelBounds): Position {
  const usableWidth = Math.max(180, bounds.width - GUTTER * 2);
  const usableHeight = Math.max(120, bounds.height - GUTTER * 2);
  const minW = Math.min(side === 'left' ? 260 : 290, usableWidth);
  const width = limit(config.width, minW, Math.min(560, usableWidth));
  const minH = Math.min(200, usableHeight);
  const height = limit(config.height ?? Math.round(usableHeight * 0.82), minH, usableHeight);
  const initialX = config.x ?? (side === 'left' ? GUTTER : bounds.width - width - GUTTER);
  return {
    x: limit(initialX, GUTTER, Math.max(GUTTER, bounds.width - width - GUTTER)),
    y: limit(config.y, GUTTER, Math.max(GUTTER, bounds.height - height - GUTTER)),
    width, height,
  };
}

export default function DesktopTable({
  campaign,
  isOwner,
  openTools,
  onOpenTool,
  onOpenDocuments,
  onOpenShortcuts,
  workspace,
  onWorkspaceChange,
}: DesktopTableProps) {
  const leavePage = useLeavePage();
  const { userRole } = useCampaign();
  const mapSlot = useTableSlot('map');
  const partySlot = useTableSlot('party');
  const stageSlot = useTableSlot('stage');
  const [sceneExpanded, setSceneExpanded] = useState(false);

  // All three workspaces retain usable side panels. Their content is portaled
  // once, and the Chat workspace gets a navigation panel rather than a second
  // live chat connection.
  const [leftCollapsed, setLeftCollapsed] = useState(() => {
    try { return window.localStorage.getItem('smugvtt:hide-party-panel') === 'true'; } catch { return false; }
  });
  const [rightCollapsed, setRightCollapsed] = useState(() => {
    try { return window.localStorage.getItem('smugvtt:hide-session-panel') === 'true'; } catch { return false; }
  });
  const toggleLeft = () => setLeftCollapsed((value) => {
    try { window.localStorage.setItem('smugvtt:hide-party-panel', String(!value)); } catch { /* optional */ }
    return !value;
  });
  const toggleRight = () => setRightCollapsed((value) => {
    try { window.localStorage.setItem('smugvtt:hide-session-panel', String(!value)); } catch { /* optional */ }
    return !value;
  });
  useEffect(() => {
    useGameStore.getState().setSessionShown(workspace === 'chat' || !rightCollapsed);
  }, [workspace, rightCollapsed]);

  const [frontPanel, setFrontPanel] = useState<PanelSide>('right');
  const mainRef = useRef<HTMLElement>(null);
  const cleanupInteraction = useRef<(() => void) | null>(null);
  const [bounds, setBounds] = useState<PanelBounds>(() => ({
    width: typeof window === 'undefined' ? 1280 : window.innerWidth,
    height: typeof window === 'undefined' ? 640 : Math.max(320, window.innerHeight - 90),
  }));
  const [leftConfig, setLeftConfig] = useState<PanelGeometry>(() => initialPanel('left'));
  const [rightConfig, setRightConfig] = useState<PanelGeometry>(() => initialPanel('right'));
  const left = panelPosition('left', leftConfig, bounds);
  const right = panelPosition('right', rightConfig, bounds);
  useEffect(() => {
    const node = mainRef.current;
    if (!node) return;
    const measure = () => {
      const rect = node.getBoundingClientRect();
      setBounds((before) => {
        const width = Math.max(320, Math.round(rect.width));
        const height = Math.max(240, Math.round(rect.height));
        return before.width === width && before.height === height ? before : { width, height };
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem('smugvtt:floating-left', JSON.stringify(leftConfig));
      window.localStorage.setItem('smugvtt:floating-right', JSON.stringify(rightConfig));
    } catch { /* optional per-user browser storage */ }
  }, [leftConfig, rightConfig]);
  useEffect(() => () => { cleanupInteraction.current?.(); }, []);

  const updatePanel = (side: PanelSide, geometry: PanelGeometry) => {
    if (side === 'left') setLeftConfig(geometry);
    else setRightConfig(geometry);
  };
  const resetPanel = (side: PanelSide) => updatePanel(side, {
    x: null, y: GUTTER, width: side === 'left' ? 320 : 360, height: null,
  });
  const startPanelInteraction = (
    side: PanelSide, mode: 'move' | 'width' | 'height' | 'corner',
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest('button')) return;
    event.preventDefault();
    event.stopPropagation();
    cleanupInteraction.current?.();
    setFrontPanel(side);
    const rect = side === 'left' ? left : right;
    const x0 = event.clientX, y0 = event.clientY;
    const onMove = (pointer: PointerEvent) => {
      const dx = pointer.clientX - x0;
      const dy = pointer.clientY - y0;
      let nextX = rect.x, nextY = rect.y, nextW = rect.width, nextH = rect.height;
      if (mode === 'move') {
        nextX += dx; nextY += dy;
      } else {
        if (mode === 'width' || mode === 'corner') {
          nextW += (side === 'left' ? dx : -dx);
          if (side === 'right') nextX += dx;
        }
        if (mode === 'height' || mode === 'corner') nextH += dy;
      }
      nextW = limit(nextW, Math.min(side === 'left' ? 260 : 290, bounds.width - 16), bounds.width - 16);
      nextH = limit(nextH, Math.min(200, bounds.height - 16), bounds.height - 16);
      nextX = limit(nextX, GUTTER, Math.max(GUTTER, bounds.width - nextW - GUTTER));
      nextY = limit(nextY, GUTTER, Math.max(GUTTER, bounds.height - nextH - GUTTER));
      updatePanel(side, { x: nextX, y: nextY, width: nextW, height: nextH });
    };
    const stop = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      if (cleanupInteraction.current === stop) cleanupInteraction.current = null;
    };
    cleanupInteraction.current = stop;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  };
  const keyMovePanel = (side: PanelSide, dx: number, dy: number) => {
    const pos = side === 'left' ? left : right;
    updatePanel(side, {
      x: limit(pos.x + dx, GUTTER, Math.max(GUTTER, bounds.width - pos.width - GUTTER)),
      y: limit(pos.y + dy, GUTTER, Math.max(GUTTER, bounds.height - pos.height - GUTTER)),
      width: pos.width, height: pos.height,
    });
  };
  // Map and Canvas top toolbars reserve only the actual space occupied by
  // panel windows near the top, not a permanent 4.5rem empty strip.
  const leftInset = !leftCollapsed && left.y < 110 && left.x < bounds.width / 2
    ? Math.min(bounds.width - 240, left.x + left.width + 14) : 16;
  const rightInset = !rightCollapsed && right.y < 110 && right.x > bounds.width / 2 - right.width
    ? Math.min(bounds.width - 240, bounds.width - right.x + 14) : 16;
  const workspaceInsets = {
    '--smug-map-left-inset': `${leftInset}px`,
    '--smug-map-right-inset': `${rightInset}px`,
  } as CSSProperties;

  const windowPanel = (side: PanelSide, content: ReactNode) => {
    const pos = side === 'left' ? left : right;
    const collapsed = side === 'left' ? leftCollapsed : rightCollapsed;
    if (collapsed) return null;
    const hide = side === 'left' ? toggleLeft : toggleRight;
    const label = side === 'left'
      ? (sceneExpanded || workspace === 'map' ? 'Character and party' : 'Scene Stage')
      : (workspace === 'chat' && !sceneExpanded ? 'Character and party' : 'Session tools / Chat');
    return (
      <div key={side} aria-label={`${label} panel`}
        className="pointer-events-auto absolute flex flex-col overflow-hidden rounded-cozy border border-moss-green/20 bg-paper/95 shadow-lg backdrop-blur-sm"
        onPointerDownCapture={() => setFrontPanel(side)}
        style={{ left: pos.x, top: pos.y, width: pos.width, height: pos.height, zIndex: frontPanel === side ? 35 : 30 }}>
        <div
          role="toolbar" tabIndex={0} aria-label={`Move ${label} panel`}
          title={`Drag to move ${label.toLowerCase()} panel. Alt + arrow keys also move it.`}
          onPointerDown={(event) => startPanelInteraction(side, 'move', event)}
          onKeyDown={(event) => {
            if (!event.altKey) return;
            const dx = event.key === 'ArrowLeft' ? -16 : event.key === 'ArrowRight' ? 16 : 0;
            const dy = event.key === 'ArrowUp' ? -16 : event.key === 'ArrowDown' ? 16 : 0;
            if (!dx && !dy) return;
            event.preventDefault();
            keyMovePanel(side, dx, dy);
          }}
          className="flex h-8 shrink-0 cursor-move touch-none select-none items-center justify-between gap-2 border-b border-ink/10 bg-paper/90 px-2 text-xs font-semibold text-ink-secondary focus-visible:outline-2 focus-visible:outline-brand"
        >
          <div className="flex min-w-0 items-center gap-1.5"><GripHorizontal className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="truncate">{label}</span></div>
          <div className="flex items-center gap-1">
            <button type="button" title="Reset panel size and position" aria-label={`Reset ${label} panel position`}
              className="rounded px-1 py-0.5 hover:bg-ink/10" onClick={() => resetPanel(side)}><RotateCcw className="h-3.5 w-3.5" /></button>
            <button type="button" title="Close panel" aria-label={`Hide ${label} panel`}
              className="rounded px-1 py-0.5 hover:bg-ink/10" onClick={hide}>×</button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">{content}</div>
        <div role="separator" tabIndex={0} aria-label={`Resize ${label} horizontally`}
          aria-orientation="vertical" title="Drag to resize panel width"
          onPointerDown={(event) => startPanelInteraction(side, 'width', event)}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault();
            const dx = (event.key === 'ArrowRight' ? 16 : -16) * (side === 'left' ? 1 : -1);
            const cfg = side === 'left' ? left : right;
            updatePanel(side, { x: side === 'left' ? cfg.x : cfg.x - dx, y: cfg.y, width: cfg.width + dx, height: cfg.height });
          }}
          className={`absolute ${side === 'left' ? 'right-0' : 'left-0'} top-8 bottom-4 z-40 w-2 pointer-coarse:w-11 cursor-col-resize touch-none hover:bg-brand/25 focus-visible:bg-brand/30`} />
        <div role="separator" tabIndex={0} aria-label={`Resize ${label} vertically`}
          aria-orientation="horizontal" title="Drag to resize panel height"
          onPointerDown={(event) => startPanelInteraction(side, 'height', event)}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
            event.preventDefault();
            const height = (side === 'left' ? left : right).height + (event.key === 'ArrowDown' ? 16 : -16);
            updatePanel(side, { x: pos.x, y: pos.y, width: pos.width, height });
          }}
          className="absolute bottom-0 left-6 right-6 z-40 h-2 pointer-coarse:h-11 cursor-row-resize touch-none hover:bg-brand/25 focus-visible:bg-brand/30" />
        <div title="Drag to resize panel width and height"
          onPointerDown={(event) => startPanelInteraction(side, 'corner', event)}
          className={`absolute bottom-0 z-50 h-4 w-4 cursor-nwse-resize touch-none border-ink/30 ${side === 'left' ? 'right-0 border-b-2 border-r-2' : 'left-0 border-b-2 border-l-2'}`} />
      </div>
    );
  };

  const pillars = [
    { key: 'map', name: 'Map' },
    { key: 'chat', name: 'Chat' },
    { key: 'scene', name: 'Canvas' },
  ] as const;
  const partyPane = <aside ref={partySlot.ref} className="h-full min-w-0 overflow-y-auto p-3" />;
  const stagePane = <div ref={stageSlot.ref} className="h-full min-w-0" />;
  // Map mode uses the right window for LIVE Chat + dice + announcements.
  // The Scene stage remains mounted in its host (parked offscreen) so
  // switching workspaces never loses staging state or unmounts Chat.
  const stageVisible = sceneExpanded || ((workspace === 'chat' || workspace === 'scene') && !leftCollapsed);
  const partyVisible = sceneExpanded ? !leftCollapsed : workspace === 'map' ? !leftCollapsed : workspace === 'chat' && !rightCollapsed;
  const sessionVisible = (!sceneExpanded && workspace === 'chat') || !rightCollapsed;

  return (
    <>
      {/* Header Bar */}
      {/* Wraps onto a second row in a narrow window instead of running off its edge. */}
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 bg-moss-green/10 border-b border-moss-green/20 shadow-xs">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            // Asking first about work the page holds, such as Paint not saved.
            onClick={() => leavePage('/dashboard')}
            variant="secondary" className="flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="max-sm:sr-only">Dashboard</span>
          </Button>

          <div className="h-6 w-px bg-moss-green/20" />

          <h1 className="min-w-0 break-words text-xl font-bold text-brand-ink">
            {campaign.name}
          </h1>
          <nav aria-label="SmugVTT workspaces" className="flex items-center gap-1 rounded-cozy border border-ink/10 bg-paper/75 p-1">
            {pillars.map(({ key, name }) => (
              <button
                key={key}
                type="button"
                aria-pressed={!sceneExpanded && workspace === key}
                onClick={() => { setSceneExpanded(false); onWorkspaceChange(key); }}
                className={`rounded-cozy px-3 py-1.5 text-sm font-semibold transition-colors ${workspace === key ? 'bg-accent text-accent-text' : 'text-ink-secondary hover:bg-ink/10'}`}
              >{name}</button>
            ))}
            <button type="button" aria-pressed={sceneExpanded} onClick={() => setSceneExpanded(true)}
              className={`rounded-cozy px-3 py-1.5 text-sm font-semibold transition-colors ${sceneExpanded ? 'bg-accent text-accent-text' : 'text-ink-secondary hover:bg-ink/10'}`}>Scene</button>
          </nav>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Connection Status */}
          <ConnectionStatus />

          {/* Session status indicator (visible to all) */}
          {campaign.status === CampaignStatus.ACTIVE && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-success/10 border border-success/20">
              <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <span className="text-xs font-medium text-success-ink hidden sm:inline">{SESSION_STATUS_LABELS[CampaignStatus.ACTIVE]}</span>
            </div>
          )}
          {campaign.status === CampaignStatus.PAUSED && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-warm-amber/10 border border-warm-amber/20">
              <PauseCircle className="w-3.5 h-3.5 text-accent-ink" />
              <span className="text-xs font-medium text-accent-ink hidden sm:inline">{SESSION_STATUS_LABELS[CampaignStatus.PAUSED]}</span>
            </div>
          )}
          {campaign.status === CampaignStatus.INACTIVE && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-stone-gray/10 border border-stone-gray/20">
              <div className="w-2 h-2 rounded-full bg-stone-gray/50" />
              <span className="text-xs font-medium text-stone-gray hidden sm:inline">{SESSION_STATUS_LABELS[CampaignStatus.INACTIVE]}</span>
            </div>
          )}

          {/* Vibe indicator (visible to all) */}
          {campaign?.currentVibe && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-warm-amber/10 border border-warm-amber/20">
              <Sun className="w-3.5 h-3.5 text-accent-ink" />
              <span className="text-xs font-medium text-accent-ink capitalize hidden sm:inline">
                {campaign.currentVibe}
              </span>
            </div>
          )}

          {/* DM tools — grouped icon toolbar */}
          {userRole === 'DM' && (
            <>
              <div className="h-6 w-px bg-moss-green/20" />
              <SessionToolbar
                openPanels={openTools}
                onOpen={onOpenTool}
                spiritLayerEnabled={campaign?.spiritLayerEnabled}
              />
            </>
          )}

          {/* An owner who has handed the game over keeps two powers — deleting
              the campaign and taking the seat back — and this is their way to
              them. It sits here, beside where the DM's own settings gear would
              be, because that is where somebody goes looking for it; tucked in
              the sidebar it read as missing. */}
          {isOwner && userRole !== 'DM' && (
            <>
              <div className="h-6 w-px bg-moss-green/20" />
              <Tooltip content="Owner settings — delete, or take back the DM role" side="bottom">
                <Button
                  variant="ghost"
                  iconOnly
                  icon={Settings}
                  aria-label="Owner Settings"
                  onClick={() => onOpenTool('settings')}
                />
              </Tooltip>
            </>
          )}

          {/* Documents shared with the campaign. Every member, not just the
              DM: a rulebook the table is meant to read has to be reachable by
              the people reading it. */}
          <div className="h-6 w-px bg-moss-green/20" />
          <Tooltip content="Campaign documents" side="bottom">
            <Button
              variant="ghost"
              iconOnly
              icon={BookOpen}
              aria-label="Campaign documents"
              onClick={onOpenDocuments}
            />
          </Tooltip>
          <Tooltip content="Keyboard shortcuts" side="bottom">
            <Button
              variant="ghost"
              iconOnly
              icon={Keyboard}
              aria-label="Keyboard shortcuts"
              onClick={onOpenShortcuts}
            />
          </Tooltip>

          {/* Sidebar collapse toggles (all roles) */}
          <div className="h-6 w-px bg-moss-green/20" />
          <div className="flex items-center gap-1">
            <Tooltip content={leftCollapsed ? 'Show left panel' : 'Hide left panel'} side="bottom">
              <Button
                variant="ghost"
                iconOnly
                icon={leftCollapsed ? PanelLeftOpen : PanelLeftClose}
                aria-label={leftCollapsed ? 'Show left panel' : 'Hide left panel'}
                onClick={toggleLeft}
              />
            </Tooltip>
            <Tooltip content={rightCollapsed ? 'Show right panel' : 'Hide right panel'} side="bottom">
              <Button
                variant="ghost"
                iconOnly
                icon={rightCollapsed ? PanelRightOpen : PanelRightClose}
                aria-label={rightCollapsed ? 'Show right panel' : 'Hide right panel'}
                onClick={toggleRight}
              />
            </Tooltip>
          </div>
        </div>
      </header>

      {/* Session Paused Banner — visible to players when session is paused */}
      {campaign.status === CampaignStatus.PAUSED && userRole !== 'DM' && <SessionPausedBanner />}

      {/* Full-bleed workspaces without permanent top gutters. Side panels
          can be moved or resized without remounting the hosted content. */}
      <main ref={mainRef} className="relative isolate flex-1 min-h-0 overflow-hidden bg-ink/5" style={workspaceInsets}>
        <section
          ref={mapSlot.ref}
          aria-label="Map and Canvas workspace"
          className={`absolute inset-0 min-w-0 ${workspace === 'chat' || sceneExpanded ? 'invisible pointer-events-none' : ''}`}
        />

        {workspace === 'chat' && !sceneExpanded && (
          <section className="absolute inset-0 overflow-hidden py-2" aria-label="Chat workspace"
            style={{ paddingLeft: leftInset + 4, paddingRight: rightInset + 4 }}>
            <div className="mx-auto h-full w-full max-w-5xl overflow-hidden rounded-cozy border border-moss-green/20 bg-paper shadow-xl">
              <SessionSidebar />
            </div>
          </section>
        )}

        {sceneExpanded && (
          <section className="absolute inset-0 overflow-hidden p-2" aria-label="Expanded Scene workspace"
            style={{ paddingLeft: leftInset + 4, paddingRight: rightInset + 4 }}>
            <div className="mx-auto h-full w-full max-w-6xl overflow-hidden rounded-cozy border border-moss-green/20 bg-paper shadow-xl">
              {stagePane}
            </div>
          </section>
        )}

        {windowPanel('left', sceneExpanded || workspace === 'map'
          ? partyPane
          : stagePane)}
        {windowPanel('right', sceneExpanded || workspace === 'scene' || workspace === 'map'
          ? <SessionSidebar /> : partyPane)}

        {/* One live instance of each hosted surface even while the relevant
            panel is folded. Map mode keeps Chat visible in the right window. */}
        {!stageVisible && <div ref={stageSlot.ref} aria-hidden="true" className="absolute -left-[10000px] top-0 h-px w-px overflow-hidden" />}
        {!partyVisible && <aside ref={partySlot.ref} aria-hidden="true" className="absolute -left-[10000px] top-0 h-px w-px overflow-hidden" />}
        {!sessionVisible && <div aria-hidden="true" className="pointer-events-none invisible absolute -left-[10000px] top-0 h-96 w-80 overflow-hidden"><SessionSidebar /></div>}
      </main>
    </>
  );
}
