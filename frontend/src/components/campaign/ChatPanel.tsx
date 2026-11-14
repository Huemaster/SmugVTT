// ============================================
// Chat Panel Component
// Real-time chat with message history and WebSocket integration
// ============================================

import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { MessageCircle, Send, Loader, AlertCircle, Eraser, X, Lock, Shield } from 'lucide-react';
import { useParams } from 'react-router';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { useOnRejoin } from '@/hooks/useOnRejoin';
import { useAuth } from '@/contexts/AuthContext';
import { useCampaign } from '@/contexts/CampaignContext';
import { useCompactLayout } from '@/contexts/LayoutContext';
import { useGrowingTextarea } from '@/hooks/useGrowingTextarea';
import { getMessages } from '@/services/message.service';
import { mergeMessages } from '@/utils/messageMerge';
import { cursorBefore } from '@/utils/messageHistory';
import { api } from '@/services/api';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import ChatMessage from './ChatMessage';
import JumpToNewest from './JumpToNewest';
import ChatMessageSkeleton from '@/components/skeletons/ChatMessageSkeleton';
import { MessageType } from '@/types';
import type { Message, ChatMessageBroadcast, ChatMessageEvent, MessageHistoryPage } from '@/types';
import Button from '@/components/ui/Button';
import { errorMessage, errorSummary } from '@/utils/errors';
import type { ChatSystemBroadcast } from '@/types';
import { MAX_CHAT_MESSAGE_LENGTH } from '@/constants/chatLimits';
import { useOnlineUserIds } from '@/stores/gameStore';
import { speakerThemeStyle } from '@/utils/speakerTheme';
import { DISPLAY_NAME_MAX_LENGTH } from '@/constants/accountLimits';
  /* remove online-user selector import */
import { whisperTargets, readSlashWhisper, isSlashWhisper, slashWhisperRefusal, byLabel } from '@/utils/chatWhisper';
import ChatIdentitySelect from './ChatIdentitySelect';
import ChatSoundControl from './ChatSoundControl';
import { Dices } from 'lucide-react';
import { useTableRoll } from '@/hooks/useTableRoll';
// SmugVTT v0.6.7: chat dice commands + local roll mirror.
import { chatChimeFromCharacterData, chatChimeFromMetadata, playChatChime } from '@/utils/chatChimes';
import type { ChatIdentityOption, ChatMode, PortraitFrame } from './ChatIdentitySelect';
import type { CampaignNpc } from '@/types/fork';
import { publishSceneMessageHistory, publishLiveSceneMessage } from './sceneDialogue';

/** Messages per page. The server caps this at MAX_CHAT_HISTORY_PAGE (constants/chatLimits.ts). */
const PAGE_SIZE = 50;

/**
 * The most messages the panel holds, in memory and on screen, in every
 * layout. While the reader is at the newest message, the oldest leave as new
 * ones arrive, and Load More brings them back from the server.
 */
export const MAX_HELD_MESSAGES = 400;

/**
 * The most the panel holds while the reader is scrolled up, unless their own
 * Load More took it further (see withinCap). What they are reading stays put
 * until then; past it the oldest leave even so, since a chat left scrolled up
 * all evening would otherwise hold every message.
 */
const MAX_HELD_SCROLLED_UP = 2 * MAX_HELD_MESSAGES;

/**
 * How many pages a rejoin reads back looking for a message already shown.
 * Past it, the list starts again from the newest pages.
 */
const MAX_RESYNC_PAGES = 10;

/** Shown under the box once a message is this close to the limit. */
const LENGTH_WARNING_AT = MAX_CHAT_MESSAGE_LENGTH - 200;

/**
 * Room in the box for `/whisper <name> ` (or `/w`) ahead of a whisper's
 * message, since the server counts the message alone.
 */
const WHISPER_PREFIX_ROOM = '/whisper '.length + DISPLAY_NAME_MAX_LENGTH + 1;

/**
 * A name for a message being sent, which the server gives back on the
 * sender's copy and uses to post a resent message once. Not
 * crypto.randomUUID, which a page served over plain http does not have.
 */
function newClientId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** The id a message being sent is shown under until the server names it. */
const pendingId = (clientId: string) => `temp-${clientId}`;

/** A message still being sent, or not sent: the server has not named it. */
const isPending = (message: Message) => message.id.startsWith('temp-');

/**
 * What comes before the oldest message held, and how Load More reaches it:
 * the server's cursor from the last page read; `find`, when older messages
 * may exist but no cursor starts where the list does (the oldest were let go,
 * or no page has been read), so Load More first finds one; or `none`, when
 * the oldest held is the campaign's first.
 */
type Earlier = { kind: 'cursor'; cursor: string } | { kind: 'find' } | { kind: 'none' };

/** The messages held, oldest first, and what comes before them. */
interface Held {
  messages: Message[];
  earlier: Earlier;
  /**
   * How many the reader's last Load More left the list holding, or 0 once
   * they are back at the newest message; see withinCap.
   */
  afterLoadMore: number;
}

/** What comes before a page just read. */
const earlierThan = (page: MessageHistoryPage): Earlier =>
  page.pagination.hasMore && page.pagination.nextCursor ? { kind: 'cursor', cursor: page.pagination.nextCursor } : { kind: 'none' };

/**
 * `held` with its oldest messages let go until MAX_HELD_MESSAGES remain. While
 * the reader is scrolled up the most is MAX_HELD_SCROLLED_UP, or what their
 * last Load More left plus MAX_HELD_MESSAGES when that is more, so what they
 * are reading, or brought back to read, stays while the table talks. Back at
 * the newest, that is forgotten. A message still being sent, or not sent,
 * stays too, since it holds what someone typed.
 */
function withinCap(held: Held, atNewest: boolean): Held {
  const most = atNewest ? MAX_HELD_MESSAGES : Math.max(MAX_HELD_SCROLLED_UP, held.afterLoadMore + MAX_HELD_MESSAGES);
  const now = atNewest && held.afterLoadMore !== 0 ? { ...held, afterLoadMore: 0 } : held;
  let excess = now.messages.length - most;
  if (excess <= 0) return now;
  const kept = now.messages.filter((message) => {
    if (excess === 0 || isPending(message)) return true;
    excess -= 1;
    return false;
  });
  return kept.length === now.messages.length ? now : { ...now, messages: kept, earlier: { kind: 'find' } };
}

interface SpeakerPresence {
  userId: string;
  userName: string;
  speaker: {
    type: 'self' | 'character' | 'npc' | 'narrator';
    id?: string;
    name: string;
    imageUrl?: string | null;
    themeColor?: string;
    frame?: { zoom: number; x: number; y: number };
  };
}

export default function ChatPanel() {
  const { id: campaignId } = useParams<{ id: string }>();
  const { socket, joinedEpoch } = useWebSocket();
  const rollAtTable = useTableRoll(socket);
  const { user } = useAuth();
  const { userRole, campaign } = useCampaign();
  // In the compact layout's Chat sheet, about 330 px tall on a phone, the
  // sheet's heading names the chat, so the panel keeps its own heading for
  // screen readers only, the line with the count is slim, the box starts at
  // one line and the hint about the keys is read out but not shown; the
  // messages sit closer together, each a denser row (ChatMessage). The log
  // gets the room.
  const compact = useCompactLayout();
  const onlineUserIds = useOnlineUserIds();
  /* remove online user list state from chat */

  // Everyone in the campaign, by user id, with the name the chat shows for
  // them; the To list offers everyone but this user, those in session first.
  const targets = useMemo(
    () => whisperTargets(campaign?.memberships ?? [], campaign?.characters ?? []),
    [campaign?.memberships, campaign?.characters]
  );
  const others = useMemo(() => [...targets.values()].filter((t) => t.userId !== user?.id).sort(byLabel), [targets, user?.id]);
  const dmUserId = campaign?.memberships?.find((m) => m.role === 'DM')?.userId;

  /**
   * Who the next message goes to, or null for everyone. Kept with the name it
   * was chosen under: a member who leaves stays chosen, marked as gone, and
   * is never swapped for everyone.
   */
  const [recipient, setRecipient] = useState<{ id: string; name: string } | null>(null);
  const recipientGone = recipient !== null && !targets.has(recipient.id);
  const recipientName = recipient ? (targets.get(recipient.id)?.label ?? recipient.name) : null;
  /** Why the panel itself did not send what is in the box (a `/w` it could not read). */
  const [boxRefusal, setBoxRefusal] = useState<string | null>(null);
  const [showDiceInChat, setShowDiceInChat] = useState(false);
  useEffect(() => {
    if (!campaignId) return;
    try {
      setShowDiceInChat(window.localStorage.getItem(`smug-dice-chat:${campaignId}`) === '1');
    } catch {
      setShowDiceInChat(false);
    }
  }, [campaignId]);
  const toggleDiceInChat = () => {
    setShowDiceInChat((current) => {
      const next = !current;
      try {
        if (campaignId) window.localStorage.setItem(`smug-dice-chat:${campaignId}`, next ? '1' : '0');
      } catch { /* local preference only */ }
      return next;
    });
  };
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Older versions wrote a chat message every time someone connected or
  // dropped, which on a flaky connection buried the actual conversation. They
  // are no longer written, but existing campaigns still carry the backlog —
  // this lets the DM clear it when they choose rather than a migration doing it
  // silently on upgrade.
  const [confirmClearJoins, setConfirmClearJoins] = useState(false);
  const [clearingJoins, setClearingJoins] = useState(false);

  const handleClearJoinLeave = async () => {
    if (!campaign?.id) return;
    setConfirmClearJoins(false);
    setClearingJoins(true);
    try {
      const { deleted } = await api.clearJoinLeaveMessages(campaign.id);
      if (deleted > 0) {
        setMessages((prev) =>
          prev.filter((m) => {
            const action = (m.metadata as { action?: string } | null)?.action;
            return action !== 'user.joined' && action !== 'user.left';
          })
        );
      }
    } catch (err) {
      console.error('[ChatPanel] Failed to clear join/leave messages:', errorSummary(err));
    } finally {
      setClearingJoins(false);
    }
  };

  // State
  const [held, setHeld] = useState<Held>({ messages: [], earlier: { kind: 'find' }, afterLoadMore: 0 });
  const { messages, earlier } = held;
  /** Why a message was not sent, by its pending id, for those that were not. */
  const [notSent, setNotSent] = useState<Record<string, string>>({});
  // The messages as last shown, for a send's answer that arrives later.
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  // Feed Scene and Map from the one canonical ChatPanel. No extra chat socket or copy.
  useEffect(() => { if (campaignId) publishSceneMessageHistory(campaignId, messages); }, [campaignId, messages]);
  const [messageInput, setMessageInput] = useState('');

  const [forkNpcs, setForkNpcs] = useState<CampaignNpc[]>([]);
  const [speakerKey, setSpeakerKey] = useState('self');
  const [chatMode, setChatMode] = useState<ChatMode>('ic');
  const [draftReady, setDraftReady] = useState(false);
  const [portraitFrames, setPortraitFrames] = useState<Record<string, PortraitFrame>>({});
  const [speakerPresence, setSpeakerPresence] = useState<Record<string, SpeakerPresence>>({});
  const [collapsedSpeakerIds, setCollapsedSpeakerIds] = useState<Set<string>>(new Set());
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});

  const ownMembership = campaign?.memberships?.find((membership) => membership.userId === user?.id);
  const speakAsOptions = useMemo<ChatIdentityOption[]>(() => {
    const options: ChatIdentityOption[] = [
      {
        key: 'self',
        type: 'self',
        label: user?.displayName ?? 'You',
        imageUrl: user?.avatarUrl ?? null,
        frame: portraitFrames.self,
        chatChime: 'default',
      },
    ];

    const allowedCharacterIds = userRole === 'DM'
      ? new Set((campaign?.characters ?? []).map((character) => character.id))
      : new Set(ownMembership?.characterIds ?? []);

    for (const character of campaign?.characters ?? []) {
      if (!allowedCharacterIds.has(character.id)) continue;
      options.push({
        key: `character:${character.id}`,
        type: 'character',
        id: character.id,
        label: character.name,
        imageUrl: character.tokenImageUrl,
        chatChime: chatChimeFromCharacterData(character.data),
        frame: portraitFrames[`character:${character.id}`],
      });
    }

    if (userRole === 'DM') {
      options.push({ key: 'narrator', type: 'narrator', label: 'Narrator' });
      for (const npc of forkNpcs) {
        const matchingCharacterPortraits = (campaign?.characters ?? []).filter(
          (character) => character.name === npc.name && character.tokenImageUrl,
        );
        const fallbackImageUrl =
          matchingCharacterPortraits.length === 1
            ? matchingCharacterPortraits[0].tokenImageUrl
            : null;

        options.push({
          key: `npc:${npc.id}`,
          type: 'npc',
          id: npc.id,
          label: npc.name,
          imageUrl: npc.imageUrl ?? fallbackImageUrl,
          frame: portraitFrames[`npc:${npc.id}`],
        });
      }
    }

    return options;
  }, [campaign?.characters, forkNpcs, ownMembership?.characterIds, portraitFrames, user?.avatarUrl, user?.displayName, userRole]);

  const selectedIdentity = speakAsOptions.find((option) => option.key === speakerKey) ?? speakAsOptions[0];

  useEffect(() => {
    const announce = () => {
      if (!selectedIdentity) return;
      window.dispatchEvent(new CustomEvent('smugvtt:speak-as-changed', {
        detail: {
          key: selectedIdentity.key,
          type: selectedIdentity.type,
          id: selectedIdentity.id,
          label: selectedIdentity.label,
          imageUrl: selectedIdentity.imageUrl ?? null,
          chatChime: selectedIdentity.chatChime ?? 'default',
        },
      }));
    };

    const onRequest = () => announce();
    const onSet = (event: Event) => {
      const key = (event as CustomEvent<{ key?: string }>).detail?.key;
      if (!key || !speakAsOptions.some((option) => option.key === key)) return;
      setSpeakerKey(key);
      setChatMode('ic');
    };

    announce();
    window.addEventListener('smugvtt:speak-as-request', onRequest);
    window.addEventListener('smugvtt:set-speak-as', onSet);
    return () => {
      window.removeEventListener('smugvtt:speak-as-request', onRequest);
      window.removeEventListener('smugvtt:set-speak-as', onSet);
    };
  }, [selectedIdentity, speakAsOptions]);



  useEffect(() => {
    const expiryTimers = new Map<string, number>();

    const clearTypingUser = (userId: string) => {
      const existingTimer = expiryTimers.get(userId);
      if (existingTimer !== undefined) {
        window.clearTimeout(existingTimer);
        expiryTimers.delete(userId);
      }
      setTypingUsers((current) => {
        if (!(userId in current)) return current;
        const next = { ...current };
        delete next[userId];
        return next;
      });
    };

    const handleTyping = (data: {
      userId?: string;
      speakerName?: string;
      typing?: boolean;
    }) => {
      if (!data?.userId || data.userId === user?.id) return;

      if (data.typing !== true || !data.speakerName) {
        clearTypingUser(data.userId);
        return;
      }

      setTypingUsers((current) => ({
        ...current,
        [data.userId!]: data.speakerName!,
      }));

      const previous = expiryTimers.get(data.userId);
      if (previous !== undefined) window.clearTimeout(previous);
      expiryTimers.set(
        data.userId,
        window.setTimeout(() => clearTypingUser(data.userId!), 3500),
      );
    };

    socket.on('chat.typing', handleTyping);
    return () => {
      socket.off('chat.typing', handleTyping);
      for (const timer of expiryTimers.values()) window.clearTimeout(timer);
    };
  }, [socket, user?.id]);

  useEffect(() => {
    const handlePresence = (data: SpeakerPresence) => {
      if (!data?.userId || !data.speaker?.name) return;
      setSpeakerPresence((current) => ({ ...current, [data.userId]: data }));
    };
    const handlePresenceState = (data: { speakers?: SpeakerPresence[] }) => {
      if (!Array.isArray(data?.speakers)) return;
      setSpeakerPresence(Object.fromEntries(data.speakers.map((entry) => [entry.userId, entry])));
    };

    socket.on('speaker.presence', handlePresence);
    socket.on('speaker.presence.state', handlePresenceState);
    socket.getSocket()?.emit('speaker.presence.request');
    return () => {
      socket.off('speaker.presence', handlePresence);
      socket.off('speaker.presence.state', handlePresenceState);
    };
  }, [socket, joinedEpoch]);

  useEffect(() => {
    const rawSocket = socket.getSocket();
    if (!rawSocket?.connected || !selectedIdentity) return;
    rawSocket.emit('speaker.presence', {
      speakerType: selectedIdentity.type,
      speakerId: selectedIdentity.id,
      ...(selectedIdentity.frame ? { portraitFrame: selectedIdentity.frame } : {}),
    });
  }, [joinedEpoch, selectedIdentity, socket]);

  useEffect(() => {
    const rawSocket = socket.getSocket();
    if (!rawSocket?.connected || !selectedIdentity) return;

    const hasText = messageInput.trim().length > 0;
    rawSocket.emit('chat.typing', {
      typing: hasText,
      speakerType: selectedIdentity.type,
      speakerId: selectedIdentity.id,
    });

    if (!hasText) return;

    const stopTimer = window.setTimeout(() => {
      rawSocket.emit('chat.typing', {
        typing: false,
        speakerType: selectedIdentity.type,
        speakerId: selectedIdentity.id,
      });
    }, 1800);

    return () => window.clearTimeout(stopTimer);
  }, [joinedEpoch, messageInput, selectedIdentity, socket]);


  useEffect(() => {
    if (!campaignId) return;
    try {
      const raw = window.localStorage.getItem(`smug-portrait-frames:${campaignId}`);
      if (raw) setPortraitFrames(JSON.parse(raw) as Record<string, PortraitFrame>);
      else setPortraitFrames({});
    } catch {
      setPortraitFrames({});
    }
  }, [campaignId]);

  useEffect(() => {
    if (!campaignId) return;
    try {
      const raw = window.localStorage.getItem(`smug-speaker-collapsed:${campaignId}`);
      const ids = raw ? JSON.parse(raw) : [];
      setCollapsedSpeakerIds(new Set(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : []));
    } catch {
      setCollapsedSpeakerIds(new Set());
    }
  }, [campaignId]);

  const toggleSpeakerPicture = (userId: string) => {
    setCollapsedSpeakerIds((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      if (campaignId) {
        window.localStorage.setItem(`smug-speaker-collapsed:${campaignId}`, JSON.stringify([...next]));
      }
      return next;
    });
  };

  const setPortraitFrame = (key: string, frame: PortraitFrame) => {
    setPortraitFrames((current) => {
      const next = { ...current, [key]: frame };
      if (campaignId) window.localStorage.setItem(`smug-portrait-frames:${campaignId}`, JSON.stringify(next));
      return next;
    });
  };

  useEffect(() => {
    if (!campaignId || userRole !== 'DM') {
      setForkNpcs([]);
      return;
    }
    let cancelled = false;
    void api.listCampaignNpcs(campaignId)
      .then((result) => {
        if (!cancelled) setForkNpcs(result.npcs);
      })
      .catch((err) => console.warn('[ChatPanel] Could not load NPC speaking identities:', errorSummary(err)));
    return () => { cancelled = true; };
  }, [campaignId, userRole]);

  useEffect(() => {
    if (!speakAsOptions.some((option) => option.key === speakerKey)) setSpeakerKey('self');
  }, [speakAsOptions, speakerKey]);

  useEffect(() => {
    if (!campaignId || !user?.id) return;
    const key = `fork-chat-draft:${campaignId}:${user.id}`;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as { text?: unknown; mode?: unknown };
        if (typeof parsed.text === 'string') setMessageInput(parsed.text);
        // SmugVTT chat is IC-only; legacy draft mode values are intentionally ignored.
      }
    } catch {
      // A damaged local draft should never block chat.
    } finally {
      setDraftReady(true);
    }
  }, [campaignId, user?.id]);

  useEffect(() => {
    if (!draftReady || !campaignId || !user?.id) return;
    const key = `fork-chat-draft:${campaignId}:${user.id}`;
    const timer = window.setTimeout(() => {
      if (!messageInput) {
        window.localStorage.removeItem(key);
      } else {
        window.localStorage.setItem(key, JSON.stringify({ text: messageInput }));
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [campaignId, draftReady, messageInput, user?.id]);
  // The box grows with what is typed: 4 lines in the compact layout's Chat
  // sheet, where the log gives up the rows, and 6 on a computer.
  useGrowingTextarea(textareaRef, messageInput, compact ? 4 : 6);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  // History read while the log is on screen (Load More, a rejoin) arrives a
  // page at a time, which the live region would read out in full; it is
  // quiet until a frame after each read.
  const [historyReads, setHistoryReads] = useState(0);
  const quietly = useCallback(async (read: () => Promise<void>) => {
    setHistoryReads((n) => n + 1);
    try {
      await read();
    } finally {
      requestAnimationFrame(() => setHistoryReads((n) => n - 1));
    }
  }, []);

  // Rate limiting state (10 messages per minute = 1 per 6 seconds)
  const [canSend, setCanSend] = useState(true);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  /**
   * Distance from the bottom to restore once an older page has been added,
   * with the page's oldest message, which names the page it belongs to.
   */
  const restoreScrollRef = useRef<{ offsetFromBottom: number; pageOldestId: string } | null>(null);
  const wasAtBottomRef = useRef(true);
  /** Something arrived below while the reader was scrolled up. */
  const [newBelow, setNewBelow] = useState(false);

  /** Change the messages held, adding none newer, and keep what comes before them. */
  const setMessages = useCallback((update: (prev: Message[]) => Message[]) => {
    setHeld((h) => {
      const next = update(h.messages);
      return next === h.messages ? h : { ...h, messages: next };
    });
  }, []);

  /** Add messages at the newest end, then hold the list within MAX_HELD_MESSAGES. */
  const addMessages = useCallback((update: (prev: Message[]) => Message[]) => {
    setHeld((h) => {
      const next = update(h.messages);
      return next === h.messages ? h : withinCap({ ...h, messages: next }, wasAtBottomRef.current);
    });
  }, []);


  const patchHeldMessage = useCallback((patch: Partial<Message> & { id: string }) => {
    setMessages((prev) => prev.map((message) => message.id === patch.id ? { ...message, ...patch } : message));
  }, [setMessages]);

  const editStoredMessage = async (message: Message) => {
    if (!campaignId || isPending(message) || message.deletedAt) return;
    const next = window.prompt('Edit message:', message.content);
    if (next === null || next.trim() === message.content || !next.trim()) return;
    try {
      const result = await api.editForkChatMessage(campaignId, message.id, next.trim());
      patchHeldMessage(result.message);
    } catch (err) {
      setError(errorMessage(err) || 'Could not edit message');
    }
  };

  const deleteStoredMessage = async (message: Message) => {
    if (!campaignId || isPending(message) || message.deletedAt) return;
    if (!window.confirm('Delete this chat message? It can be restored later.')) return;
    try {
      const result = await api.deleteForkChatMessage(campaignId, message.id);
      patchHeldMessage(result.message);
    } catch (err) {
      setError(errorMessage(err) || 'Could not delete message');
    }
  };

  const restoreStoredMessage = async (message: Message) => {
    if (!campaignId || isPending(message) || !message.deletedAt) return;
    try {
      const result = await api.restoreForkChatMessage(campaignId, message.id);
      patchHeldMessage(result.message);
    } catch (err) {
      setError(errorMessage(err) || 'Could not restore message');
    }
  };

  const showMessageHistory = async (message: Message) => {
    if (!campaignId) return;
    try {
      const result = await api.getForkChatMessageRevisions(campaignId, message.id);
      if (result.revisions.length === 0) {
        window.alert('No earlier revisions.');
        return;
      }
      window.alert(result.revisions
        .map((revision, index) => `${index + 1}. ${new Date(revision.createdAt).toLocaleString()}\n${revision.content}`)
        .join('\n\n'));
    } catch (err) {
      setError(errorMessage(err) || 'Could not load message history');
    }
  };

  // ============================================
  // Scroll Management
  // ============================================

  /**
   * Check if user is scrolled to bottom
   */
  const isAtBottom = (): boolean => {
    const container = messagesContainerRef.current;
    if (!container) return true;

    const threshold = 50; // pixels from bottom
    const isBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
    return isBottom;
  };

  /**
   * Scroll to bottom of messages.
   * Uses scrollTo on the container directly to avoid scrollIntoView
   * propagating up to parent scrollable elements (e.g. the sidebar).
   */
  /**
   * Put the reader back where they were after older messages are added above.
   *
   * Laid out before paint rather than after, so the list does not visibly jump.
   * Measured from the bottom because that distance is what the new content does
   * not change.
   */
  useLayoutEffect(() => {
    const restore = restoreScrollRef.current;
    if (restore === null) return;
    restoreScrollRef.current = null;
    // A page the list did not take (see Load More) moved nothing.
    if (messages.find((m) => !isPending(m))?.id !== restore.pageOldestId) return;

    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight - restore.offsetFromBottom;
    }
  }, [messages]);

  const scrollToBottom = (smooth = true) => {
    const container = messagesContainerRef.current;
    if (!container) return;
    container.scrollTo({
      top: container.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto',
    });
  };

  /**
   * Update wasAtBottom ref when user scrolls
   */
  const handleScroll = () => {
    wasAtBottomRef.current = isAtBottom();
    if (wasAtBottomRef.current) setNewBelow(false);
  };

  const jumpToNewest = () => {
    wasAtBottomRef.current = true;
    setNewBelow(false);
    scrollToBottom(true);
  };

  /**
   * Keep a reader at the newest message there when the log's box changes
   * size: the log keeps its scroll position as its box shrinks, which would
   * leave the newest messages below it (a sheet made half height again, the
   * panel moved from the desktop's rail into the compact layout's sheet, a
   * window made shorter).
   */
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (wasAtBottomRef.current) container.scrollTo({ top: container.scrollHeight, behavior: 'auto' });
    });
    observer.observe(container);
    return () => observer.disconnect();
    // The log is drawn once the history has loaded.
  }, [isLoading]);

  // ============================================
  // Load Messages
  // ============================================

  /**
   * Load initial messages
   */
  useEffect(() => {
    if (!campaignId) return;

    const loadInitialMessages = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const page = await getMessages(campaignId, PAGE_SIZE);

        // The server sends newest first; the panel reads oldest first.
        // Merged with what is already shown: a message can arrive live
        // before the history does.
        setHeld((h) => withinCap({ ...h, messages: mergeMessages(h.messages, page.messages), earlier: earlierThan(page) }, wasAtBottomRef.current));

        // Scroll to bottom after initial load (without smooth)
        setTimeout(() => scrollToBottom(false), 100);
      } catch (err) {
        console.error('[ChatPanel] Failed to load messages:', errorSummary(err));
        setError(errorMessage(err) || 'Failed to load messages');
      } finally {
        setIsLoading(false);
      }
    };

    loadInitialMessages();
  }, [campaignId]);

  /**
   * Resync chat history after a WebSocket reconnect.
   *
   * The realtime stream may have missed messages while we were disconnected
   * (the backend stores every message in Postgres, but only live subscribers
   * see them in real time). On reconnect, read back from the newest message
   * until a page holds one already shown, and merge, deduping by id: reading
   * only the newest page left a lasting gap after a busy absence, behind
   * which Load More cannot reach. When MAX_RESYNC_PAGES do not get back to
   * what is shown, the list starts again from what was read, and Load More
   * carries on from there.
   *
   * Driven by `joinedEpoch`, which counts joins of the campaign: every join
   * after the first is a rejoin. The transport's own reconnect comes before
   * the socket is back in the campaign's room, and a message sent in that
   * gap would be missed by a read made then.
   */
  useOnRejoin(joinedEpoch, () => {
    if (!campaignId) return;

    const resync = async () => {
      try {
        const shown = new Set(messagesRef.current.filter((m) => !isPending(m)).map((m) => m.id));
        const joinsUp = (page: Message[]) => shown.size === 0 || page.some((m) => shown.has(m.id));
        let page = await getMessages(campaignId, PAGE_SIZE);
        const fresh = [...page.messages];
        let joined = joinsUp(page.messages);
        for (let read = 1; !joined && read < MAX_RESYNC_PAGES && page.pagination.hasMore && page.pagination.nextCursor; read++) {
          page = await getMessages(campaignId, PAGE_SIZE, page.pagination.nextCursor);
          fresh.push(...page.messages);
          joined = joinsUp(page.messages);
        }

        // mergeMessages already orders and dedupes; sorting again here on the
        // timestamp alone would undo the id tiebreak it applies.
        if (joined || !page.pagination.hasMore) {
          setHeld((h) => withinCap({ ...h, messages: mergeMessages(h.messages, fresh) }, wasAtBottomRef.current));
        } else {
          // Too much was missed to join up: keep only messages still being
          // sent, and page back from what was read.
          setHeld((h) => withinCap({ messages: mergeMessages(h.messages.filter(isPending), fresh), earlier: earlierThan(page), afterLoadMore: 0 }, wasAtBottomRef.current));
        }
      } catch (err) {
        console.error('[ChatPanel] Failed to resync messages after reconnect:', errorSummary(err));
        // Non-fatal — user will still see new messages going forward
      }
    };

    void quietly(resync);
  });

  /**
   * Load more messages (pagination)
   */
  const loadMoreMessages = () => quietly(async () => {
    if (!campaignId || isLoadingMore || earlier.kind === 'none') return;
    // What is read goes above the oldest message held.
    const oldest = messagesRef.current.find((m) => !isPending(m));

    try {
      setIsLoadingMore(true);

      // Hand back exactly what the server gave us. It decides what a position
      // in the history is; the panel does not construct one. When no cursor
      // it gave starts where the list does, one is found first.
      const from = earlier.kind === 'cursor'
        ? { cursor: earlier.cursor }
        : oldest
          ? await cursorBefore((limit, cursor) => getMessages(campaignId, limit, cursor), oldest)
          : {};
      const page = from && (await getMessages(campaignId, PAGE_SIZE, from.cursor));
      setError(null);

      // What was read joins up with the list only while its oldest message is
      // the one it was read for. Let go meanwhile, or replaced by a rejoin's
      // fresh start, the page is dropped, and another Load More reads from the
      // list as it is. Checked in the update itself, which sees every change
      // made before it, drawn yet or not.
      const readFor = (h: Held) => h.messages.find((m) => !isPending(m))?.id === oldest?.id;
      if (!page) {
        setHeld((h) => (readFor(h) ? { ...h, earlier: { kind: 'none' } } : h));
        return;
      }

      // Older messages are added above what is on screen, which would otherwise
      // push the reader's place down by the height of the new page and make a
      // second Load More impossible to aim at. Remember where the bottom was,
      // now that the page is here: taken before the request, a failed one left
      // it set for whatever message came next, which then jumped the list.
      const container = messagesContainerRef.current;
      const pageOldest = page.messages[page.messages.length - 1];
      restoreScrollRef.current = container && pageOldest
        ? { offsetFromBottom: container.scrollHeight - container.scrollTop, pageOldestId: pageOldest.id }
        : null;

      // Merged rather than prepended: a page that overlaps what is on screen
      // would otherwise show its messages twice, duplicate keys and all. Not
      // held within MAX_HELD_MESSAGES: the reader asked for these.
      setHeld((h) => {
        if (!readFor(h)) return h;
        const messages = mergeMessages(h.messages, page.messages);
        return { messages, earlier: earlierThan(page), afterLoadMore: messages.length };
      });
    } catch (err) {
      console.error('[ChatPanel] Failed to load more messages:', errorSummary(err));
      setError(errorMessage(err) || 'Failed to load more messages');
    } finally {
      setIsLoadingMore(false);
    }
  });

  // ============================================
  // WebSocket Integration
  // ============================================

  /**
   * Listen for incoming chat messages
   */
  useEffect(() => {
    if (!socket) return;

    const handleChatMessage = (data: ChatMessageBroadcast) => {
      console.log('[ChatPanel] Received chat message:', data);

      // Convert broadcast format to Message format
      const newMessage: Message = {
        id: data.id,
        campaignId: campaignId!,
        userId: data.userId,
        user: { id: data.userId, displayName: data.userName },
        recipientId: data.recipientId ?? null,
        recipient: data.recipientId ? { id: data.recipientId, displayName: data.recipientName ?? '' } : null,
        type: data.type,
        content: data.content,
        metadata: data.metadata ?? null,
        createdAt: data.timestamp,
      };
      if (data.userId !== user?.id) {
        playChatChime(chatChimeFromMetadata(data.metadata));
      }
      if (campaignId) publishLiveSceneMessage(campaignId, newMessage);

      // Our own message comes back with the name it was sent under, and
      // takes the place of the copy shown while it was sending (or marked
      // Not sent, when the answer was lost but the message went through).
      // Anything already shown under its id is not added again.
      const ownPendingId = data.clientId ? pendingId(data.clientId) : null;
      addMessages((prev) => {
        const pendingIndex = ownPendingId ? prev.findIndex((msg) => msg.id === ownPendingId) : -1;
        if (pendingIndex !== -1) {
          const updated = [...prev];
          updated[pendingIndex] = newMessage;
          return prev.some((msg) => msg.id === data.id) ? updated.filter((msg, i) => i === pendingIndex || msg.id !== data.id) : updated;
        }
        return prev.some((msg) => msg.id === data.id) ? prev : [...prev, newMessage];
      });
      if (ownPendingId) setNotSent((prev) => withoutKey(prev, ownPendingId));

      // Auto-scroll if user was at bottom; otherwise say something arrived.
      if (wasAtBottomRef.current) {
        setTimeout(() => scrollToBottom(true), 50);
      } else if (!ownPendingId) {
        setNewBelow(true);
      }
    };

    const handleChatMutation = (data: {
      id: string;
      content?: string;
      metadata?: Message['metadata'];
      editedAt?: string | null;
      deletedAt?: string | null;
      deletedById?: string | null;
    }) => {
      patchHeldMessage({
        id: data.id,
        ...(data.content !== undefined ? { content: data.content } : {}),
        ...(data.metadata !== undefined ? { metadata: data.metadata } : {}),
        ...(data.editedAt !== undefined ? { editedAt: data.editedAt } : {}),
        ...(data.deletedAt !== undefined ? { deletedAt: data.deletedAt } : {}),
        ...(data.deletedById !== undefined ? { deletedById: data.deletedById } : {}),
      });
    };

    const handleSystemMessage = (data: ChatSystemBroadcast) => {
      console.log('[ChatPanel] Received system message:', data);

      const systemMessage: Message = {
        // The server's own id, not one made up here. A fabricated id can never
        // match the row when history replays it, so the notice appeared twice.
        id: data.id,
        campaignId: campaignId!,
        userId: null,
        type: MessageType.SYSTEM,
        content: data.content,
        metadata: data.metadata || null,
        createdAt: data.timestamp,
      };

      addMessages((prev) => mergeMessages(prev, [systemMessage]));

      if (wasAtBottomRef.current) {
        setTimeout(() => scrollToBottom(true), 50);
      } else {
        setNewBelow(true);
      }
    };

    socket.onChatMessage(handleChatMessage);
    socket.onChatSystem(handleSystemMessage);
    socket.on('chat.mutated', handleChatMutation);

    return () => {
      socket.off('chat.message', handleChatMessage);
      socket.off('chat.system', handleSystemMessage);
      socket.off('chat.mutated', handleChatMutation);
    };
  }, [socket, campaignId, addMessages, patchHeldMessage, user?.id]);

  useEffect(() => {
    if (!socket || !campaignId || !showDiceInChat) return;
    const handleDiceRoll = (data: {
      id?: string;
      userId: string;
      userName: string;
      characterName?: string;
      expression: string;
      result: number;
      breakdown?: string;
      purpose?: string;
      timestamp: string;
      secret?: boolean;
    }) => {
      const speaker = data.characterName?.trim() || data.userName;
      const purpose = data.purpose?.trim();
      const lead = [speaker, purpose].filter(Boolean).join(' · ');
      const content = `${lead ? `${lead} — ` : ''}${data.expression} = ${data.result}${data.secret ? ' · Secret' : ''}`;
      const id = `smug-dice-${data.id ?? `${data.timestamp}-${data.userId}-${data.expression}-${data.result}`}`;
      const diceMessage: Message = {
        id,
        campaignId,
        userId: data.userId,
        user: { id: data.userId, displayName: data.userName },
        recipientId: null,
        recipient: null,
        type: MessageType.DICE_ROLL,
        content,
        metadata: null,
        createdAt: data.timestamp,
      };
      addMessages((prev) => prev.some((message) => message.id === id) ? prev : [...prev, diceMessage]);
      if (wasAtBottomRef.current) setTimeout(() => scrollToBottom(true), 50);
      else setNewBelow(true);
    };
    socket.on('dice.rolled', handleDiceRoll);
    socket.on('dice.rolled.secret', handleDiceRoll);
    return () => {
      socket.off('dice.rolled', handleDiceRoll);
      socket.off('dice.rolled.secret', handleDiceRoll);
    };
  }, [socket, campaignId, showDiceInChat, addMessages]);

  // ============================================
  // Rate Limiting
  // ============================================

  /**
   * Cooldown timer
   */
  useEffect(() => {
    if (cooldownSeconds > 0) {
      const timer = setTimeout(() => {
        setCooldownSeconds((prev) => prev - 1);
      }, 1000);

      return () => clearTimeout(timer);
    } else if (cooldownSeconds === 0 && !canSend) {
      setCanSend(true);
    }

    return undefined;
  }, [cooldownSeconds, canSend]);

  /**
   * Start rate limit cooldown (only if the DM has enabled it for this campaign)
   */
  const startCooldown = () => {
    if (!campaign?.chatCooldownEnabled) return;
    setCanSend(false);
    setCooldownSeconds(campaign.chatCooldownSeconds ?? 5);
  };

  // ============================================
  // Send Message
  // ============================================

  /**
   * Handle message submission
   */
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    sendMessage();
  };

  /**
   * Handle Enter key (submit) and Shift+Enter (newline)
   */
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter while an input method is composing confirms the candidate.
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  /**
   * Send one message and wait for the server's answer. Confirmed, the copy
   * shown takes the stored id; refused or unanswered, it is marked Not sent
   * with the reason, for Retry or Discard.
   */
  const deliver = async (
    clientId: string,
    content: string,
    type: ChatMessageEvent['type'],
    recipientId?: string,
    identity: ChatIdentityOption = selectedIdentity,
    mode: ChatMode = chatMode,
  ) => {
    if (!socket) return;
    const id = pendingId(clientId);
    setNotSent((prev) => withoutKey(prev, id));
    const answer = await socket.sendChatMessage({
      content,
      type,
      clientId,
      ...(recipientId ? { recipientId } : {}),
      speakerType: identity.type,
      ...(identity.id ? { speakerId: identity.id } : {}),
      mode,
      ...(identity.frame ? { portraitFrame: identity.frame } : {}),
    });
    if (answer.ok) {
      playChatChime(identity.chatChime ?? 'default');
      // Usually the message itself has come back first and taken its place.
      setMessages((prev) => {
        if (!prev.some((msg) => msg.id === id)) return prev;
        return prev.some((msg) => msg.id === answer.id)
          ? prev.filter((msg) => msg.id !== id)
          : prev.map((msg) => (msg.id === id ? { ...msg, id: answer.id } : msg));
      });
    } else if (messagesRef.current.some((msg) => msg.id === id)) {
      // Still showing as sending: the message itself has not come back.
      setNotSent((reasons) => ({ ...reasons, [id]: answer.error }));
    }
  };

  /** Send a message marked Not sent again, under the name it had, to whoever it was for. */
  const retry = (message: Message) => {
    // A copy still being sent holds the type that was asked for, PLAYER or DM.
    const asked = message.type === MessageType.DM ? MessageType.DM : MessageType.PLAYER;
    const rawSpeaker = message.metadata?.speaker;
    const speaker = rawSpeaker && typeof rawSpeaker === 'object' && !Array.isArray(rawSpeaker)
      ? rawSpeaker as { type?: unknown; id?: unknown; name?: unknown; imageUrl?: unknown; frame?: unknown; chatChime?: unknown }
      : null;
    const identity: ChatIdentityOption = {
      key: typeof speaker?.id === 'string' ? `${String(speaker.type)}:${speaker.id}` : String(speaker?.type ?? 'self'),
      type: speaker?.type === 'character' || speaker?.type === 'npc' || speaker?.type === 'narrator' ? speaker.type : 'self',
      ...(typeof speaker?.id === 'string' ? { id: speaker.id } : {}),
      label: typeof speaker?.name === 'string' ? speaker.name : user?.displayName ?? 'You',
      imageUrl: typeof speaker?.imageUrl === 'string' ? speaker.imageUrl : null,
      frame: speaker?.frame && typeof speaker.frame === 'object' && !Array.isArray(speaker.frame)
        ? speaker.frame as PortraitFrame
        : undefined,
      chatChime: typeof speaker?.chatChime === 'string' ? speaker.chatChime : 'default',
    };
    const savedMode = message.metadata?.chatMode;
    const mode: ChatMode = savedMode === 'ic' || savedMode === 'narrator' ? savedMode : 'ooc';
    void deliver(message.id.slice('temp-'.length), message.content, asked, message.recipientId ?? undefined, identity, mode);
  };

  /** Drop a message marked Not sent. */
  const discard = (message: Message) => {
    setMessages((prev) => prev.filter((msg) => msg.id !== message.id));
    setNotSent((prev) => withoutKey(prev, message.id));
  };

  /**
   * Send the message in the box: shown at once as sending, then confirmed or
   * marked Not sent when the server answers.
   */
  const sendMessage = (): void => {
    const text = messageInput.trim();
    if (!text || !canSend || !socket || !campaignId || !user) return;
    const rollSlash = /^\/(?:r|roll)(?:\s+(.+))?$/i.exec(text);
    if (rollSlash) {
      const expression = rollSlash[1]?.trim();
      if (!expression) {
        setBoxRefusal('Roll syntax: /r 1d20+5 or /roll 4d6kh3');
        return;
      }
      const characterName = selectedIdentity?.type === 'character' || selectedIdentity?.type === 'npc'
        ? selectedIdentity.label
        : undefined;
      void rollAtTable({ expression, ...(characterName ? { characterName } : {}) }).then((made) => {
        if (!made) return;
        setMessageInput('');
        setBoxRefusal(null);
        window.requestAnimationFrame(() => textareaRef.current?.focus());
      });
      return;
    }

    // `/w <name> <message>` whispers this one message; anything it cannot
    // read as that is kept in the box with the reason, and sent to no one.
    let to = recipient;
    let content = text;
    const slash = readSlashWhisper(text, others);
    if (slash.kind === 'to' && slash.content) {
      to = { id: slash.userId, name: targets.get(slash.userId)?.label ?? '' };
      content = slash.content;
    } else if (slash.kind !== 'none') {
      setBoxRefusal(slashWhisperRefusal(slash));
      return;
    }

    const clientId = newClientId();

    // The type asked for, PLAYER or DM, also on a whisper: the server makes
    // it a WHISPER, and Retry sends what was asked.
    const messageType: ChatMessageEvent['type'] =
      userRole === 'DM' && (selectedIdentity.type === 'self' || selectedIdentity.type === 'narrator')
        ? MessageType.DM
        : MessageType.PLAYER;

    const optimisticMessage: Message = {
      id: pendingId(clientId),
      campaignId,
      userId: user.id,
      user: { id: user.id, displayName: user.displayName },
      recipientId: to?.id ?? null,
      recipient: to ? { id: to.id, displayName: targets.get(to.id)?.displayName ?? to.name } : null,
      type: messageType,
      content,
      metadata: {
        speaker: {
          type: selectedIdentity.type,
          ...(selectedIdentity.id ? { id: selectedIdentity.id } : {}),
          name: selectedIdentity.label.replace(/ \/ OOC$/, ''),
          imageUrl: selectedIdentity.imageUrl ?? null,
          ...(selectedIdentity.frame ? { frame: selectedIdentity.frame } : {}),
          chatChime: selectedIdentity.chatChime ?? 'default',
        },
        chatMode,
      },
      createdAt: new Date().toISOString(),
    };

    addMessages((prev) => [...prev, optimisticMessage]);

    // Clear input and scroll
    setMessageInput('');
    if (campaignId && user?.id) {
      window.localStorage.removeItem(`fork-chat-draft:${campaignId}:${user.id}`);
    }
    setTimeout(() => scrollToBottom(true), 50);

    // Start rate limit cooldown
    startCooldown();

    void deliver(clientId, content, messageType, to?.id, selectedIdentity, chatMode);
  };

  useEffect(() => {
    const refreshSpeakerProfile = () => {
      const rawSocket = socket.getSocket();
      if (!rawSocket?.connected || !selectedIdentity) return;
      rawSocket.emit('speaker.presence', {
        speakerType: selectedIdentity.type,
        speakerId: selectedIdentity.id,
        ...(selectedIdentity.frame ? { portraitFrame: selectedIdentity.frame } : {}),
      });
    };
    window.addEventListener('smugvtt:speaker-profile-changed', refreshSpeakerProfile);
    return () => window.removeEventListener('smugvtt:speaker-profile-changed', refreshSpeakerProfile);
  }, [selectedIdentity, socket]);

  const chooseSpeaker = (key: string) => {
    setSpeakerKey(key);
    setChatMode('ic');
  };


  /* remove recipient dropdown change handler */

  /** Choosing a whisper's name sets the To list to the other person in it. */
  const whisperBack = useCallback((message: Message) => {
    const peerId = message.userId === user?.id ? message.recipientId : message.userId;
    const target = peerId ? targets.get(peerId) : undefined;
    if (!target) return;
    setRecipient({ id: target.userId, name: target.label });
    setBoxRefusal(null);
    textareaRef.current?.focus();
  }, [targets, user?.id]);


  useEffect(() => {
    const beginWhisper = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string }>).detail;
      const target = detail?.userId ? targets.get(detail.userId) : undefined;
      if (!target || target.userId === user?.id) return;
      setRecipient({ id: target.userId, name: target.label });
      setBoxRefusal(null);
      window.requestAnimationFrame(() => textareaRef.current?.focus());
    };
    window.addEventListener('smugvtt:whisper', beginWhisper);
    return () => window.removeEventListener('smugvtt:whisper', beginWhisper);
  }, [targets, user?.id]);

  /** How a whisper is labelled in the list, or null for a message to everyone. */
  const whisperView = (message: Message): { label: string; peer: string; canReply: boolean } | null => {
    if (message.type !== MessageType.WHISPER && !message.recipientId) return null;
    const mine = message.userId === user?.id;
    const peerId = mine ? message.recipientId : message.userId;
    const fallback = mine ? message.recipient?.displayName : message.user?.displayName;
    const peer = (peerId ? targets.get(peerId)?.label : undefined) || fallback || 'Unknown User';
    return { label: mine ? `Whisper to ${peer}` : `Whisper from ${peer}`, peer, canReply: !!peerId && targets.has(peerId) && peerId !== user?.id };
  };

  // A whisper typed as `/w <name> ` has its message counted alone, as the
  // server counts it.
  const slashInBox = isSlashWhisper(messageInput);
  const typedWhisper = slashInBox ? readSlashWhisper(messageInput.trim(), others) : null;
  const countedLength = typedWhisper?.kind === 'to' ? typedWhisper.content.length : messageInput.length;

  // The line under the box names who the message will reach: whoever a
  // typed `/w` names, whatever the To list says, or else the To list's
  // choice. A `/w` that fits nobody, or several, says so as it is typed, in
  // a line that is not announced; the same words are announced if it is sent.
  const typedTarget = typedWhisper?.kind === 'to' ? targets.get(typedWhisper.userId) : undefined;
  const typingRefusal = typedWhisper && (typedWhisper.kind === 'several' || typedWhisper.kind === 'nobody') ? slashWhisperRefusal(typedWhisper) : null;
  const goesTo: { id: string; name: string; gone: boolean } | null = typedTarget
    ? { id: typedTarget.userId, name: typedTarget.label, gone: false }
    : typingRefusal
      ? null
      : recipient && { id: recipient.id, name: recipientName ?? recipient.name, gone: recipientGone };
  /* remove obsolete dmTarget/player recipient groups */

  // ============================================
  // Render
  // ============================================

  if (isLoading) {
    return (
      <div className="glass-panel h-full flex flex-col">
        {/* Header skeleton */}
        <div className="flex items-center gap-2 p-4 border-b border-moss-green/20">
          <MessageCircle className="w-5 h-5 text-brand-ink/40" />
          <div className="h-5 w-10 bg-moss-green/15 rounded-sm animate-pulse" />
        </div>
        {/* Message skeletons */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <ChatMessageSkeleton variant="long" />
          <ChatMessageSkeleton variant="short" />
          <ChatMessageSkeleton variant="medium" />
          <ChatMessageSkeleton variant="long" />
          <ChatMessageSkeleton variant="short" />
        </div>
        {/* Input placeholder */}
        <div className="p-4 border-t border-moss-green/20 animate-pulse">
          <div className="h-16 bg-moss-green/5 rounded-lg" />
        </div>
      </div>
    );
  }

  // The composer's parts, which the two arrangements lay out differently.
  // Each has a key, so a change of arrangement keeps the box and its focus.
  const speakerControls = (
    <ChatIdentitySelect
      options={speakAsOptions}
      value={selectedIdentity.key}
      onChange={chooseSpeaker}
      onFrameChange={setPortraitFrame}
      compact={compact}
    />
  );

  /* remove To Everyone selector declarations */
  const messageBox = (
    <div key="box" className="min-w-0 flex-1">
      <textarea
        ref={textareaRef}
        value={messageInput}
        onChange={(e) => {
          setMessageInput(e.target.value);
          setBoxRefusal(null);
        }}
        onKeyDown={handleKeyDown}
        placeholder={recipient ? 'Whisper…' : 'Message…  /w name · /r 1d20'}
        aria-label="Chat message"
        aria-describedby="chat-hint"
        className={`input-cozy w-full text-sm resize-none ${compact ? 'min-h-11 px-2.5' : 'min-h-[60px] px-3'} ${canSend ? '' : 'opacity-50 cursor-not-allowed'}`}
        rows={compact ? 1 : 2}
        maxLength={slashInBox ? MAX_CHAT_MESSAGE_LENGTH + WHISPER_PREFIX_ROOM : MAX_CHAT_MESSAGE_LENGTH}
        readOnly={!canSend}
        aria-disabled={!canSend}
      />
    </div>
  );

  const sendButton = (
    <div key="send" className="flex shrink-0 flex-col items-stretch gap-1">
      <button
        type="button"
        onClick={toggleDiceInChat}
        aria-pressed={showDiceInChat}
        aria-label={showDiceInChat ? 'Hide dice rolls in chat' : 'Show dice rolls in chat'}
        title={showDiceInChat ? 'Dice rolls are shown in Chat' : 'Dice rolls are hidden from Chat'}
        className={`ml-auto inline-flex h-5 min-w-7 items-center justify-center rounded border px-1 transition-colors ${
          showDiceInChat
            ? 'border-moss-green/30 bg-moss-green/15 text-brand-ink'
            : 'border-ink/10 bg-paper/70 text-warm-gray hover:text-brand-ink'
        }`}
      >
        <Dices className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <Button
        type="submit"
        className={`${compact ? 'px-3 min-h-11' : 'px-4'} py-2 flex items-center justify-center gap-2`}
        disabled={!messageInput.trim() || !canSend}
        aria-label={!canSend ? `Rate limited — wait ${cooldownSeconds} seconds` : 'Send message'}
      >
        {!canSend && cooldownSeconds > 0 ? (
          <span className="text-sm font-mono" aria-hidden="true">{cooldownSeconds}s</span>
        ) : (
          <Send className="w-4 h-4" aria-hidden="true" />
        )}
      </Button>
    </div>
  );

  // What the panel holds, which in a long session is not all there is.
  const visibleMessages = messages.filter((message) => !message.deletedAt && (showDiceInChat || message.type !== MessageType.DICE_ROLL));
  const visibleSpeakerPresence = Object.values(speakerPresence)
    .filter((entry) => entry.userId === user?.id || onlineUserIds.has(entry.userId))
    .sort((a, b) => {
      if (a.userId === user?.id) return -1;
      if (b.userId === user?.id) return 1;
      return a.userName.localeCompare(b.userName);
    });

  const speakAsOverlay = typeof document !== 'undefined'
    ? createPortal(
        <div className="pointer-events-none fixed bottom-20 left-3 z-[1200] flex max-w-[calc(100vw-1.5rem)] items-end gap-2 overflow-x-auto lg:bottom-3">
          {visibleSpeakerPresence.map((entry) => {
            const collapsed = collapsedSpeakerIds.has(entry.userId);
            const frame = entry.speaker.frame ?? { zoom: 1, x: 50, y: 50 };
            const theme = speakerThemeStyle(entry.speaker.themeColor);
            const initial = entry.speaker.name.trim().charAt(0).toUpperCase() || '?';

            return (
              <div
                key={entry.userId}
                className="pointer-events-auto shrink-0 overflow-hidden rounded-cozy border border-paper/35 bg-black/75 shadow-2xl backdrop-blur-sm"
                title={`${entry.userName} is speaking as ${entry.speaker.name}`}
              >
                {!collapsed && (
                  <div className="relative h-40 w-32 overflow-hidden bg-ink/20">
                    {entry.speaker.imageUrl ? (
                      <img
                        src={entry.speaker.imageUrl}
                        alt=""
                        className="h-full w-full object-cover"
                        style={{
                          objectPosition: `${frame.x}% ${frame.y}%`,
                          transform: `scale(${frame.zoom})`,
                          transformOrigin: `${frame.x}% ${frame.y}%`,
                        }}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-paper/90 text-4xl font-semibold text-ink-secondary">
                        {initial}
                      </div>
                    )}
                  </div>
                )}
                <div
                  className="flex min-w-32 items-center gap-1 px-2.5 py-1.5"
                  style={{ backgroundColor: theme.backgroundColor, color: theme.foregroundColor }}
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-tight">
                    {entry.speaker.name}
                  </span>
                  <button
                    type="button"
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-sm font-bold leading-none opacity-80 hover:bg-black/15 hover:opacity-100"
                    title={collapsed ? 'Show portrait' : 'Hide portrait'}
                    aria-label={collapsed ? `Show ${entry.speaker.name} portrait` : `Hide ${entry.speaker.name} portrait`}
                    onClick={() => toggleSpeakerPicture(entry.userId)}
                  >
                    {collapsed ? '+' : '−'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>,
        document.body,
      )
    : null;

  const typingNames = Object.values(typingUsers);
  const typingLabel =
    typingNames.length === 0
      ? null
      : typingNames.length === 1
        ? `${typingNames[0]} is typing…`
        : typingNames.length === 2
          ? `${typingNames[0]} and ${typingNames[1]} are typing…`
          : `${typingNames.length} people are typing…`;

  const shownCount = visibleMessages.length > 0 && (
    <span className="text-xs text-stone-gray/70 ml-auto">
      {visibleMessages.length} shown
    </span>
  );
  const clearJoinsButton = userRole === 'DM' && (
    <button
      onClick={() => setConfirmClearJoins(true)}
      disabled={clearingJoins}
      aria-label="Clear old join and leave messages"
      title="Clear old join and leave messages"
      className={`p-1.5 rounded-lg text-stone-gray hover:text-brand-ink hover:bg-moss-green/10 transition-colors disabled:opacity-50 ${
        messages.length > 0 ? '' : 'ml-auto'
      }${compact ? ' touch-target inline-flex items-center justify-center' : ''}`}
    >
      <Eraser className="w-4 h-4" />
    </button>
  );
  const loadMoreButton = (
    <Button
      onClick={loadMoreMessages}
      disabled={isLoadingMore}
      variant="secondary" className={`text-sm px-4 py-2${compact ? ' min-h-11' : ''}`}
    >
      {isLoadingMore ? (
        <>
          <Loader className="w-3 h-3 animate-spin mr-2" />
          Loading...
        </>
      ) : (
        'Load More'
      )}
    </Button>
  );
  const hasEarlier = earlier.kind !== 'none' && messages.length > 0;

  return (
    <div className="glass-panel h-full flex flex-col">
      {/* Chat Header. In the compact layout's sheet, whose heading names the
          chat, the panel's heading is read out only, and the count and the
          DM's eraser go at the top of the log beside Load More, where they
          scroll away with the history. */}
      {compact ? (
        <h3 className="sr-only">Chat</h3>
      ) : (
      <div className="flex items-center gap-2 border-b border-moss-green/20 p-4">
        <MessageCircle className="w-5 h-5 text-brand-ink" />
        <h3 className="text-lg font-semibold text-brand-ink">Chat</h3>
        {shownCount}
        {clearJoinsButton}
      </div>
      )}

      <ConfirmDialog
        isOpen={confirmClearJoins}
        title="Clear join and leave messages?"
        message="Removes the old “has joined” and “has left” notices from this campaign's chat for everyone. The rest of the conversation is untouched, and no new ones are created."
        confirmLabel="Clear"
        cancelLabel="Keep"
        variant="warning"
        onConfirm={handleClearJoinLeave}
        onCancel={() => setConfirmClearJoins(false)}
      />

      {/* Error Display */}
      {error && (
        <div className="mx-4 mt-4 p-3 bg-danger/10 border border-danger/30 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-danger-ink shrink-0" />
          <p className="text-sm text-danger-ink flex-1">{error}</p>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Dismiss"
            className="p-1 rounded-sm text-danger-ink hover:bg-danger/10"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Messages Area */}
      <div className="relative flex-1 min-h-0 flex flex-col">
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        role="log"
        aria-live={historyReads > 0 ? 'off' : 'polite'}
        aria-label="Chat messages"
        aria-relevant="additions"
        className={compact ? 'flex-1 overflow-y-auto px-2 py-1.5 space-y-1.5' : 'flex-1 overflow-y-auto p-4 space-y-3'}
      >
        {/* Load More Button; on the compact layout with the count and the DM's eraser */}
        {compact ? (
          (messages.length > 0 || clearJoinsButton) && (
            <div className="flex items-center gap-2">
              {hasEarlier && loadMoreButton}
              {shownCount}
              {clearJoinsButton}
            </div>
          )
        ) : (
          hasEarlier && (
            <div className="text-center pb-2">
              {loadMoreButton}
            </div>
          )
        )}

        {/* Messages List */}
        {visibleMessages.length === 0 ? (
          <div className="text-center py-8">
            <MessageCircle className="w-12 h-12 text-brand-ink/30 mx-auto mb-3" />
            <p className="text-sm text-warm-gray mb-2">No messages yet</p>
            <p className="text-xs text-stone-gray/70">
              Start a conversation with your party
            </p>
          </div>
        ) : (
          <>
            {visibleMessages.map((message) => {
              const whisper = whisperView(message);
              const canModerateChat = userRole === 'DM' || ownMembership?.gmAccess === true;
              const mayManage =
                !isPending(message) &&
                message.type !== MessageType.SYSTEM &&
                message.type !== MessageType.DICE_ROLL &&
                (message.userId === user?.id || (canModerateChat && !message.recipientId));
              const mayEdit = mayManage && message.type !== MessageType.DICE_ROLL && !message.deletedAt;
              return (
                <ChatMessage
                  key={message.id}
                  message={message}
                  isCurrentUser={message.userId === user?.id}
                  isPending={isPending(message) && !(message.id in notSent)}
                  notSentReason={notSent[message.id]}
                  onRetry={retry}
                  onDiscard={discard}
                  whisperLabel={whisper?.label}
                  whisperPeer={whisper?.peer}
                  sentByDM={!!dmUserId && message.userId === dmUserId}
                  onWhisperBack={whisper?.canReply ? whisperBack : undefined}
                  canEdit={mayEdit}
                  canDelete={mayManage && !message.deletedAt}
                  canRestore={mayManage && !!message.deletedAt}
                  canViewHistory={mayManage && !!message.editedAt}
                  onEdit={() => void editStoredMessage(message)}
                  onDelete={() => void deleteStoredMessage(message)}
                  onRestore={() => void restoreStoredMessage(message)}
                  onHistory={() => void showMessageHistory(message)}
                />
              );
            })}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>
      {newBelow && <JumpToNewest onClick={jumpToNewest} />}
      </div>

      {/* Input Area */}
      <div className={`${compact ? 'px-3 py-2' : 'p-4'} border-t border-moss-green/20`}>
        <form onSubmit={handleSubmit} className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">{speakerControls}</div>
            <ChatSoundControl />
          </div>
          {/* Who the message goes to (keyed by user id: display names are not
              unique), the box and Send. The compact layout's Chat sheet puts
              all three on one row, so the log keeps the room; the parts have
              keys, so a change of arrangement keeps the box and its focus. */}
          {/* The compact layout's Chat sheet puts To, the box and Send on one
              row, so the log keeps the room. */}
          {typingLabel && (
            <div
              className="px-1 text-xs italic text-ink-muted"
              aria-live="polite"
              aria-atomic="true"
            >
              {typingLabel}
            </div>
          )}
          {recipient && (
            <div className="flex items-center justify-between gap-2 rounded-cozy bg-accent/10 px-2 py-1 text-xs text-accent-ink">
              <span className="min-w-0 truncate">
                <Lock className="mr-1 inline h-3 w-3" aria-hidden="true" />
                Whisper to {recipientName ?? recipient.name}
              </span>
              <button
                type="button"
                className="shrink-0 rounded p-0.5 hover:bg-accent/10"
                title="Return to public chat"
                aria-label="Return to public chat"
                onClick={() => setRecipient(null)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <div key="compose" className="flex items-end gap-2">
            {messageBox}
            {sendButton}
          </div>
          {speakAsOverlay}

          {goesTo && (
            <p className={`text-xs text-center flex items-center justify-center gap-1 ${goesTo.gone ? 'text-warning-ink' : 'text-accent-ink'}`}>
              <Lock className="w-3 h-3 shrink-0" aria-hidden="true" />
              {/* The shield the log shows beside a DM's message, for the campaign's DM by user id. */}
              {goesTo.id === dmUserId && <Shield className="w-3 h-3 shrink-0 text-warning-ink" aria-hidden="true" />}
              <span>{goesTo.gone ? `${goesTo.name} is no longer in the campaign.` : `Only you and ${goesTo.name} can see this.`}</span>
              {goesTo.id === dmUserId && <span className="sr-only">{goesTo.name} is the DM.</span>}
            </p>
          )}
          {boxRefusal ? (
            <p role="alert" className="text-xs text-danger-ink text-center">{boxRefusal}</p>
          ) : (
            typingRefusal && <p className="text-xs text-warning-ink text-center">{typingRefusal}</p>
          )}

          {/* Rate Limiting Feedback */}
          {!canSend && cooldownSeconds > 0 && (
            <p className="text-xs text-warning-ink text-center">
              Wait {cooldownSeconds}s before sending another message
            </p>
          )}
          {canSend && countedLength >= LENGTH_WARNING_AT && (
            <p className="text-xs text-warning-ink text-center" aria-live="polite">
              {countedLength} of {MAX_CHAT_MESSAGE_LENGTH} characters
            </p>
          )}
          {canSend && countedLength < LENGTH_WARNING_AT && (
            <p id="chat-hint" className={compact ? 'sr-only' : 'text-xs text-stone-gray/70 text-center'}>
              Press Enter to send, Shift+Enter for new line
            </p>
          )}
        </form>
      </div>
    </div>
  );
}

/** The same record without `key`. */
function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) return record;
  const next = { ...record };
  delete next[key];
  return next;
}
