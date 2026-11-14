// ============================================
// Session Panels: Chat, Dice, Initiative, Notes and Session
//
// All five stay mounted, and the ones not open are hidden with
// `invisible` (visibility: hidden) rather than unmounted or
// display: none. This preserves chat history, dice results, and
// socket listeners across tab switches, and keeps hidden panels'
// layout measurable so ChatPanel's autoscroll-to-bottom keeps
// working while the tab is inactive.
//
// Which one is open is the game store's `sessionTab`, which the rail's
// tab bar (SessionSidebar) sets. Each panel fills the box it is drawn
// in, so that box is `position: relative` with a height of its own.
//
// On the desktop each panel is a tab panel named by its tab in the rail.
// The compact layout's bar has buttons, not tabs, and none for Notes and
// Session, which More opens, so there each panel is a group with its own
// name.
// ============================================

import { useEffect } from 'react';
import { BookOpen, Images, UsersRound } from 'lucide-react';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { useAuth } from '@/contexts/AuthContext';
import { useGameStore } from '@/stores/gameStore';
import { useCompactLayout } from '@/contexts/LayoutContext';
import { useCampaign } from '@/contexts/CampaignContext';
import { cn } from '@/utils/cn';
import { SESSION_TAB_LOOKS, type SessionTab } from './sessionTabs';
import ChatPanel from './ChatPanel';
import DiceRoller from './DiceRoller';
import VibeTracker from './VibeTracker';
import InitiativeTracker from './InitiativeTracker';
import SessionControls from './SessionControls';
import SessionHistory from './SessionHistory';
import PersonalNotes from './PersonalNotes';
import GmNpcPanel from './GmNpcPanel';
import type { ChatMessageBroadcast } from '@/types';

/**
 * Count chat messages that arrive while the chat is not on screen, as the
 * game store's `unreadChat`, the Chat tab's badge. ChatPanel stays mounted
 * and handles the messages themselves; this listener only keeps the count.
 */
function useUnreadChatCount() {
  const { socket } = useWebSocket();
  const { user } = useAuth();

  useEffect(() => {
    if (!socket) return;

    const handleChatMessage = (data: ChatMessageBroadcast) => {
      if (user && data.userId === user.id) return; // own messages aren't "unread"
      useGameStore.getState().countUnreadChat();
    };

    socket.onChatMessage(handleChatMessage);
    return () => {
      socket.off('chat.message', handleChatMessage);
    };
  }, [socket, user]);
}

export default function SessionPanels() {
  const activeTab = useGameStore((s) => s.sessionTab);
  const setActiveTab = useGameStore((s) => s.setSessionTab);
  const compact = useCompactLayout();
  const { userRole } = useCampaign();
  useUnreadChatCount();

  // A stored GM-only tab must never leave a player on an invisible panel after
  // a role change. Compact/mobile navigation does not advertise NPCs yet.
  useEffect(() => {
    if (activeTab === 'npcs' && userRole !== 'DM') setActiveTab('chat');
  }, [activeTab, userRole, setActiveTab]);

  /** What a panel is: a tab panel named by its tab in the rail, or on the compact layout a group with its own name. */
  const panel = (tab: SessionTab) =>
    compact
      ? { role: 'group', 'aria-label': SESSION_TAB_LOOKS[tab].label }
      : { role: 'tabpanel', 'aria-labelledby': `session-tab-${tab}` };

  // In a sheet, under the sheet's own heading, the panels need no space above.
  const pad = compact ? 'px-2 pb-2' : 'p-3';
  // A panel that scrolls inside itself clips what is taller than it: the
  // four not shown stay in the page, only invisible, and one taller than the
  // sheet made the sheet itself scroll on past its content, whichever tab was
  // open. Initiative and Session scroll as a whole instead.
  const clipped = 'overflow-hidden';

  return (
    <>
      <div
        id="session-tabpanel-chat"
        {...panel('chat')}
        className={cn('absolute inset-0', pad, clipped, activeTab === 'chat' ? 'animate-fade-in' : 'invisible')}
      >
        <ChatPanel />
      </div>


      <div
        id="session-tabpanel-journal"
        {...panel('journal')}
        className={cn('absolute inset-0 overflow-y-auto', pad, activeTab === 'journal' ? 'animate-fade-in' : 'invisible')}
      >
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-ink">Journal &amp; Handouts</h2>
          <button type="button" className="flex w-full items-center gap-2 rounded-cozy border border-ink/15 bg-paper px-3 py-2 text-sm text-ink hover:bg-ink/5"
            onClick={() => window.dispatchEvent(new Event('smugvtt:open-documents'))}>
            <BookOpen className="h-4 w-4" /> Browse campaign documents
          </button>
          <p className="text-xs text-ink-muted">Existing handout permissions and sharing are preserved.</p>
          <p className="text-xs text-ink-muted">Personal notes remain under More tools → Notes.</p>
        </div>
      </div>

      <div
        id="session-tabpanel-media"
        {...panel('media')}
        className={cn('absolute inset-0 overflow-y-auto', pad, activeTab === 'media' ? 'animate-fade-in' : 'invisible')}
      >
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-ink">Media &amp; Token Assets</h2>
          <button type="button" className="flex w-full items-center gap-2 rounded-cozy border border-ink/15 bg-paper px-3 py-2 text-sm text-ink hover:bg-ink/5"
            onClick={() => window.dispatchEvent(new Event('smugvtt:open-media'))}>
            <Images className="h-4 w-4" /> Open token artwork and templates
          </button>
          {userRole === 'DM' && <button type="button" className="flex w-full items-center gap-2 rounded-cozy border border-ink/15 bg-paper px-3 py-2 text-sm text-ink hover:bg-ink/5"
            onClick={() => window.dispatchEvent(new Event('smugvtt:open-token-manager'))}>
            <UsersRound className="h-4 w-4" /> Manage map tokens
          </button>}
          <p className="text-xs text-ink-muted">Existing media pickers remain intact. This is a launch panel, not a replacement asset database.</p>
        </div>
      </div>

      <div
        id="session-tabpanel-dice"
        {...panel('dice')}
        className={cn('absolute inset-0', pad, clipped, activeTab === 'dice' ? 'animate-fade-in' : 'invisible')}
      >
        <DiceRoller />
      </div>

      <div
        id="session-tabpanel-initiative"
        {...panel('initiative')}
        className={cn(
          'absolute inset-0', pad, 'overflow-y-auto',
          activeTab === 'initiative' ? 'animate-fade-in' : 'invisible'
        )}
      >
        <InitiativeTracker />
      </div>

      <div
        id="session-tabpanel-notes"
        {...panel('notes')}
        className={cn(
          'absolute inset-0', pad, clipped,
          activeTab === 'notes' ? 'animate-fade-in' : 'invisible'
        )}
      >
        <PersonalNotes />
      </div>

      <div
        id="session-tabpanel-session"
        {...panel('session')}
        className={cn(
          'absolute inset-0', pad, 'overflow-y-auto space-y-4',
          activeTab === 'session' ? 'animate-fade-in' : 'invisible'
        )}
      >
        <VibeTracker />
        {/* SessionControls renders nothing for players */}
        <SessionControls />
        {/* Everyone: the notes the DM wrote when each session ended */}
        <SessionHistory />
      </div>

      {userRole === 'DM' && (
        <div
          id="session-tabpanel-npcs"
          {...panel('npcs')}
          className={cn(
            'absolute inset-0', pad, 'overflow-hidden',
            activeTab === 'npcs' ? 'animate-fade-in' : 'invisible'
          )}
        >
          <GmNpcPanel />
        </div>
      )}

    </>
  );
}
