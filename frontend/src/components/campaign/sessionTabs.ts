import { MessageCircle, Dices, ListOrdered, PlayCircle, NotebookPen, UsersRound, BookOpen, Images, type LucideIcon } from 'lucide-react';
/**
 * The session panels (`SessionPanels.tsx`), in the order their tabs show
 * them. The rail's tab bar takes its tabs from here and the game store keeps
 * the open one (`sessionTab`), so a list of tabs is written once.
 */
export const SESSION_TABS = ['chat', 'journal', 'media', 'dice'] as const;

export type SessionTab = (typeof SESSION_TABS)[number] | 'initiative' | 'notes' | 'session' | 'npcs';

/**
 * Each panel's name and icon, as the rail's tabs show them; the compact
 * layout's bar and its More list name them the same.
 */
export const SESSION_TAB_LOOKS: Record<SessionTab, { label: string; icon: LucideIcon }> = {
  chat: { label: 'Chat', icon: MessageCircle },
  journal: { label: 'Journal', icon: BookOpen },
  media: { label: 'Media', icon: Images },
  dice: { label: 'Dice', icon: Dices },
  initiative: { label: 'Initiative', icon: ListOrdered },
  // Its own tab rather than a widget under Session: long-form writing needs the
  // full height of the rail, and people come back to it constantly during play.
  notes: { label: 'Notes', icon: NotebookPen },
  session: { label: 'Session', icon: PlayCircle },
  npcs: { label: 'NPCs', icon: UsersRound },
};

/**
 * The Chat tab's badge for `count` unread messages: what it shows, at most
 * "9+", and what it is called. The rail's tab and the compact layout's bar
 * both show it.
 */
export function unreadBadge(count: number): { text: string; label: string } {
  return { text: count > 9 ? '9+' : String(count), label: `${count} unread messages` };
}

/** Whether a stored value names a session panel. */
export function isSessionTab(value: unknown): value is SessionTab {
  return value === 'npcs' || value === 'initiative' || value === 'notes' || value === 'session' || SESSION_TABS.some((tab) => tab === value);
}
