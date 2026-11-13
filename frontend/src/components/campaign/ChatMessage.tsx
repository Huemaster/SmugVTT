// ============================================
// Chat Message Component
// Displays individual chat messages with styling
// ============================================

import { memo } from 'react';
import { useMinuteClock } from '@/hooks/useMinuteClock';
import { useCompactLayout } from '@/contexts/LayoutContext';
import { Bot, Lock, Shield } from 'lucide-react';
import type { Message, MessageType } from '@/types';
import ChatMessageMenu from './ChatMessageMenu';
import SmugChatText from './SmugChatText';
import { speakerThemeStyle } from '@/utils/speakerTheme';
import { formatRelativeTime } from '@/utils/format';

interface ChatMessageProps {
  message: Message;
  isCurrentUser?: boolean;
  /** True while the message is optimistically displayed before server confirmation */
  isPending?: boolean;
  /** Why the server did not take this message, when it did not. */
  notSentReason?: string;
  onRetry?: (message: Message) => void;
  onDiscard?: (message: Message) => void;
  /** On a whisper: "Whisper to Mara" or "Whisper from Mara". */
  whisperLabel?: string;
  /** On a whisper: the other person's name, for "Only you and Mara can see this". */
  whisperPeer?: string;
  /** The campaign's DM sent it: a DM's whisper keeps the DM's shield. */
  sentByDM?: boolean;
  /** Choosing a whisper's name whispers back to the other person, while they are a member. */
  onWhisperBack?: (message: Message) => void;
  canEdit?: boolean;
  canDelete?: boolean;
  canRestore?: boolean;
  canViewHistory?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onRestore?: () => void;
  onHistory?: () => void;
}

/**
 * How long ago a message was sent ("2 minutes ago"), or the date past a week.
 */
function messageAge(timestamp: string, now: number): string {
  // Handle undefined, null, or empty timestamps
  if (!timestamp) {
    return 'unknown time';
  }

  // Check if date is invalid
  if (isNaN(new Date(timestamp).getTime())) {
    console.warn('[ChatMessage] Invalid timestamp:', timestamp);
    return 'unknown time';
  }

  return formatRelativeTime(timestamp, { now, words: true, dateAfterDays: 7 });
}

/**
 * Get message styling based on type
 */
function getMessageStyle(type: MessageType): { bg: string; textColor: string; borderColor: string } {
  switch (type) {
    case 'DM':
      return {
        bg: 'bg-warning/10',
        textColor: 'text-warning-ink',
        borderColor: 'border-warning/30',
      };
    case 'SYSTEM':
      return {
        bg: 'bg-moss-green/10',
        textColor: 'text-brand-ink',
        borderColor: 'border-moss-green/20',
      };
    case 'DICE_ROLL':
      return {
        bg: 'bg-info/10',
        textColor: 'text-info-ink',
        borderColor: 'border-info/30',
      };
    case 'CHARACTER_ACTION':
      return {
        bg: 'bg-spirit/10',
        textColor: 'text-spirit-ink',
        borderColor: 'border-spirit/30',
      };
    default: // PLAYER
      return {
        bg: 'bg-parchment/40',
        textColor: 'text-stone-gray',
        borderColor: 'border-stone-gray/20',
      };
  }
}

/** A whisper's tint, whoever sent it. */
const WHISPER_STYLE = { bg: 'bg-accent/10', textColor: 'text-stone-gray', borderColor: 'border-accent/30' };

function ChatMessageInner({ message, isCurrentUser = false, isPending = false, notSentReason, onRetry, onDiscard, whisperLabel, whisperPeer, sentByDM = false, onWhisperBack , canEdit = false, canDelete = false, canRestore = false, canViewHistory = false, onEdit, onDelete, onRestore, onHistory}: ChatMessageProps) {
  // The row is memoised, so without this its "just now" never moved on.
  const now = useMinuteClock();
  const isWhisper = whisperLabel !== undefined;
  const { bg, textColor, borderColor } = isWhisper ? WHISPER_STYLE : getMessageStyle(message.type);
  const isSystem = message.type === 'SYSTEM';
  const isDM = message.type === 'DM';
  const showShield = isDM || (isWhisper && sentByDM);

  const rawSpeaker = message.metadata?.speaker;
  const speaker = rawSpeaker && typeof rawSpeaker === 'object' && !Array.isArray(rawSpeaker)
    ? rawSpeaker as { type?: unknown; id?: unknown; name?: unknown; imageUrl?: unknown; frame?: unknown; themeColor?: unknown }
    : null;
  const speakerName = typeof speaker?.name === 'string' ? speaker.name : null;
  const speakerImageUrl = typeof speaker?.imageUrl === 'string' ? speaker.imageUrl : null;
  const rawMode = message.metadata?.chatMode;
  const chatMode = rawMode === 'ic' || rawMode === 'ooc' || rawMode === 'narrator' ? rawMode : null;
  const showYou = isCurrentUser && !isSystem && (!speaker || speaker.type === 'self');

  const rawFrame = speaker?.frame;
  const frame = rawFrame && typeof rawFrame === 'object' && !Array.isArray(rawFrame)
    ? rawFrame as { zoom?: unknown; x?: unknown; y?: unknown }
    : null;
  const portraitZoom = typeof frame?.zoom === 'number' ? Math.max(0.6, Math.min(2, frame.zoom)) : 1;
  const portraitX = typeof frame?.x === 'number' ? Math.max(0, Math.min(100, frame.x)) : 50;
  const portraitY = typeof frame?.y === 'number' ? Math.max(0, Math.min(100, frame.y)) : 50;
  const portraitStyle = {
    objectPosition: `${portraitX}% ${portraitY}%`,
    transform: `scale(${portraitZoom})`,
    transformOrigin: `${portraitX}% ${portraitY}%`,
  };
  const speakerTheme = speakerThemeStyle(
    typeof speaker?.themeColor === 'string' ? speaker.themeColor : undefined,
  );
  const speakerNameStyle = speakerName
    ? { color: speakerTheme.backgroundColor }
    : undefined;

  // Get display name. A server-resolved Speak As identity wins over the account.
  const displayName = isSystem
    ? 'System'
    : speakerName || message.user?.displayName || 'Unknown User';

  const compact = useCompactLayout();

  const nameColor = isDM ? 'text-warning-ink' : isSystem || isCurrentUser ? 'text-brand-ink' : 'text-stone-gray';
  const onlyYou = `Only you and ${whisperPeer} can see this.`;
  const sentAt = message.createdAt ? new Date(message.createdAt).toLocaleString() : 'Unknown time';
  const shownContent = message.deletedAt ? 'Message deleted' : message.content;
  const editNotice = message.editedAt && !message.deletedAt
    ? <div className="mt-1 text-[10px] italic text-ink-muted">edited</div>
    : null;
  const actionMenu = !isSystem && !isPending ? (
    <ChatMessageMenu
      deleted={!!message.deletedAt}
      hasHistory={canViewHistory}
      canEdit={canEdit}
      canDelete={canDelete}
      canRestore={canRestore}
      onEdit={onEdit}
      onDelete={onDelete}
      onRestore={onRestore}
      onHistory={onHistory}
    />
  ) : null;

  const notSentRow = notSentReason && (
    <div className={`${compact ? 'mt-1' : 'mt-2'} flex flex-wrap items-center gap-2 text-xs`} role="status">
      <span className="text-danger-ink">Not sent: {notSentReason}</span>
      <button type="button" onClick={() => onRetry?.(message)} className="font-medium text-brand-ink underline hover:no-underline">
        Retry
      </button>
      <button type="button" onClick={() => onDiscard?.(message)} className="font-medium text-stone-gray underline hover:no-underline">
        Discard
      </button>
    </div>
  );

  // Speak-As metadata belongs in the header, not as a raw JSON dump.
  const visibleMetadata = message.metadata
    ? Object.fromEntries(Object.entries(message.metadata).filter(([key]) => key !== 'speaker' && key !== 'chatMode'))
    : null;
  const metadataBlock = !message.deletedAt && visibleMetadata &&
    Object.keys(visibleMetadata).length > 0 &&
    visibleMetadata.action !== 'user.joined' &&
    visibleMetadata.action !== 'user.left' &&
    visibleMetadata.action !== 'spirit_layer.toggle' &&
    visibleMetadata.action !== 'vibe.update' &&
    visibleMetadata.action !== 'session.started' &&
    visibleMetadata.action !== 'session.paused' &&
    visibleMetadata.action !== 'session.ended' &&
    visibleMetadata.action !== 'session.resumed' && (
      <div className="mt-2 pt-2 border-t">
        <pre className="text-xs opacity-70 font-mono">
          {JSON.stringify(visibleMetadata, null, 2)}
        </pre>
      </div>
    );

  /**
   * A system notice (a session paused or resumed, the spirit layer shown or
   * hidden) is one quiet centred line on either layout, so people's
   * messages stand out; a screen reader hears it named as the system's.
   */
  if (isSystem) {
    return (
      <div data-message-id={message.id} className="px-2 py-0.5 text-center text-xs text-ink-muted">
        <Bot className="mr-1 inline h-3 w-3 align-[-0.1em]" aria-hidden="true" />
        <span className="sr-only">System: </span>
        <span className="whitespace-pre-wrap wrap-break-word"><SmugChatText text={shownContent} /></span>
        <span className="whitespace-nowrap" title={sentAt}> · {messageAge(message.createdAt, now)}</span>
        {metadataBlock}
      </div>
    );
  }

  /**
   * The compact layout's chat, where a sheet half a phone's height should
   * show several messages: the sender and the time start the message's own
   * line, at the size they have on the desktop, and the padding is slimmer.
   * The icons, the colours, a whisper's way to whisper back and Not sent are
   * the desktop's.
   */
  if (compact) {
    const icon = 'mr-1 inline h-3.5 w-3.5 align-[-0.15em]';
    return (
      <div
        data-message-id={message.id}
        className={`relative rounded-lg border px-2.5 py-1 pr-8 ${bg} ${borderColor} ${isPending ? 'opacity-60' : ''} ${notSentReason ? 'border-danger/40' : ''}`}
      >
        {actionMenu}
        <p className={`text-sm ${textColor} whitespace-pre-wrap wrap-break-word`}>
          {isSystem && <Bot className={`${icon} text-brand-ink`} />}
          {isWhisper && (
            <span title={onlyYou} className="inline">
              <Lock className={`${icon} text-accent-ink`} aria-hidden="true" />
            </span>
          )}
          {speakerImageUrl && !isWhisper && (
            <span className="mr-1 inline-flex h-7 w-7 overflow-hidden rounded-full bg-ink/5 align-middle">
              <img src={speakerImageUrl} alt="" className="h-full w-full object-cover" style={portraitStyle} />
            </span>
          )}

          {showShield && <Shield className={`${icon} text-warning-ink`} />}
          {isWhisper ? (
            <>
              {onWhisperBack ? (
                // A finger's height, without making the line taller.
                <button
                  type="button"
                  onClick={() => onWhisperBack(message)}
                  title={`Whisper to ${whisperPeer}`}
                  className="-my-3 inline-flex items-center align-middle text-xs font-semibold text-accent-ink underline-offset-2 hover:underline"
                >
                  {whisperLabel}
                </button>
              ) : (
                <span className="text-xs font-semibold text-accent-ink">{whisperLabel}</span>
              )}
              <span className="sr-only">{onlyYou}</span>
            </>
          ) : (
            <span className={`text-xs font-semibold ${nameColor}`} style={speakerNameStyle}>
              {displayName}
              {showYou && ' (You)'}
              {chatMode && chatMode !== 'ic' && <span className="ml-1 font-normal uppercase opacity-60">[{chatMode}]</span>}
            </span>
          )}
          {/* The text keeps its own spaces and line breaks, so one space each. */}
          {notSentReason ? null : isPending ? (
            <>
              {' '}
              <span className="whitespace-nowrap text-xs text-stone-gray/50 italic">sending…</span>
            </>
          ) : (
            <>
              {' '}
              <span className="whitespace-nowrap text-xs text-stone-gray/70" title={sentAt}>
                {messageAge(message.createdAt, now)}
              </span>
            </>
          )}{' '}
          <SmugChatText text={shownContent} />
        </p>
        {notSentRow}
      {editNotice}
        {editNotice}
        {metadataBlock}
      </div>
    );
  }

  return (
    <div
      data-message-id={message.id}
      className={`relative p-3 pr-9 rounded-lg border ${bg} ${borderColor} transition-all hover:shadow-xs ${
        isPending ? 'opacity-60' : ''
      } ${notSentReason ? 'border-danger/40' : ''}`}
    >
      {actionMenu}
      {/* Message Header */}
      <div className="flex items-center gap-2 mb-1">
        {/* Icon for special message types */}
        {isSystem && <Bot className="w-3.5 h-3.5 text-brand-ink" />}
        {isWhisper && (
          <span title={onlyYou} className="inline-flex shrink-0">
            <Lock className="w-3.5 h-3.5 text-accent-ink" aria-hidden="true" />
          </span>
        )}
        {speakerImageUrl && !isWhisper && (
          <span className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-ink/5">
            <img src={speakerImageUrl} alt="" className="h-full w-full object-cover" style={portraitStyle} />
          </span>
        )}

        {showShield && <Shield className="w-3.5 h-3.5 shrink-0 text-warning-ink" />}

        {isWhisper ? (
          <>
            {onWhisperBack ? (
              <button
                type="button"
                onClick={() => onWhisperBack(message)}
                title={`Whisper to ${whisperPeer}`}
                className="min-w-0 text-left text-xs font-semibold text-accent-ink underline-offset-2 hover:underline"
              >
                {whisperLabel}
              </button>
            ) : (
              <span className="min-w-0 text-left text-xs font-semibold text-accent-ink">{whisperLabel}</span>
            )}
            <span className="sr-only">{onlyYou}</span>
          </>
        ) : (
        /* Username */
        <span className={`text-xs font-semibold ${nameColor}`} style={speakerNameStyle}>
          {displayName}
          {showYou && ' (You)'}
          {chatMode && chatMode !== 'ic' && <span className="ml-1 font-normal uppercase opacity-60">[{chatMode}]</span>}
        </span>
        )}

        {/* Timestamp / pending indicator */}
        {notSentReason ? null : isPending ? (
          <span className="shrink-0 whitespace-nowrap text-xs text-stone-gray/50 italic">sending…</span>
        ) : (
          <span className="shrink-0 whitespace-nowrap text-xs text-stone-gray/70" title={sentAt}>
            {messageAge(message.createdAt, now)}
          </span>
        )}
      </div>

      {/* Message Content */}
      <p className={`text-sm ${textColor} whitespace-pre-wrap wrap-break-word`}>
        <SmugChatText text={shownContent} />
      </p>

      {notSentRow}

      {metadataBlock}
    </div>
  );
}

// Memoised — chat panels can hold dozens of messages; without memo every new
// message causes the entire list to re-render. With memo only the new message
// and any that changed (e.g. pending → confirmed) re-render.
const ChatMessage = memo(ChatMessageInner);
export default ChatMessage;
