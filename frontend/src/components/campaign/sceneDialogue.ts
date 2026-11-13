// SmugVTT Scene v1: display only dialogue explicitly enclosed in double quotes.
// Chat messages and Speak As metadata remain the canonical source of truth.
import { MessageType, type Message } from '@/types';

export interface SceneUtterance {
  messageId: string;
  speakerKey: string;
  speakerType: 'character' | 'npc';
  speakerId: string;
  speakerName: string;
  imageUrl: string | null;
  quotes: string[];
  createdAt: string;
}

/** Extract straight and typographic double quotes; never treat apostrophes as dialogue. */
export function extractQuotedDialogue(input: string): string[] {
  const quotes: string[] = [];
  let open: 'straight' | 'curly' | null = null;
  let buffer = '';
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    // Escaped quotation marks belong to the text, not delimiter structure.
    if (c === '\\' && i + 1 < input.length && ['"', '“', '”'].includes(input[i + 1])) {
      if (open) buffer += input[++i];
      else i++;
      continue;
    }
    if (!open) {
      if (c === '"') { open = 'straight'; buffer = ''; }
      else if (c === '“') { open = 'curly'; buffer = ''; }
    } else if ((open === 'straight' && c === '"') || (open === 'curly' && c === '”')) {
      const phrase = buffer.replace(/\s+/g, ' ').trim();
      if (phrase) quotes.push(phrase);
      buffer = '';
      open = null;
    } else {
      buffer += c;
    }
  }
  return quotes;
}

/** No names inferred from prose, no whispers, narration, OOC, rolls, or unconfirmed messages. */
export function sceneUtteranceFromMessage(message: Message): SceneUtterance | null {
  if (message.id.startsWith('temp-') || message.deletedAt || message.recipientId) return null;
  if (message.type !== MessageType.PLAYER && message.type !== MessageType.DM) return null;
  const metadata = message.metadata;
  if (!metadata || metadata.chatMode !== 'ic') return null;
  const speaker = metadata.speaker;
  if (!speaker || typeof speaker !== 'object' || Array.isArray(speaker)) return null;
  const info = speaker as Record<string, unknown>;
  if ((info.type !== 'character' && info.type !== 'npc') || typeof info.id !== 'string' || !info.id) return null;
  const quotes = extractQuotedDialogue(message.content);
  if (!quotes.length) return null;
  return {
    messageId: message.id,
    speakerKey: `${info.type}:${info.id}`,
    speakerType: info.type,
    speakerId: info.id,
    speakerName: typeof info.name === 'string' && info.name ? info.name : 'Character',
    imageUrl: typeof info.imageUrl === 'string' && info.imageUrl ? info.imageUrl : null,
    quotes,
    createdAt: message.createdAt,
  };
}

interface Feed {
  messages: readonly SceneUtterance[];
  listeners: Set<() => void>;
  liveListeners: Set<(utterance: SceneUtterance) => void>;
  signature: string;
}
const feeds = new Map<string, Feed>();
const EMPTY: readonly SceneUtterance[] = Object.freeze([]);
function feedFor(campaignId: string): Feed {
  let feed = feeds.get(campaignId);
  if (!feed) {
    feed = { messages: EMPTY, listeners: new Set(), liveListeners: new Set(), signature: '' };
    feeds.set(campaignId, feed);
  }
  return feed;
}
/** Receives messages already obtained by ChatPanel; no second history poll or socket subscription. */
export function publishSceneMessageHistory(campaignId: string, messages: readonly Message[]): void {
  if (!campaignId) return;
  const entries = messages.map(sceneUtteranceFromMessage).filter((value): value is SceneUtterance => !!value).slice(-250);
  const signature = entries.map((item) => `${item.messageId}:${item.quotes.join('\u241f')}`).join('\u241e');
  const feed = feedFor(campaignId);
  if (feed.signature === signature) return;
  feed.signature = signature;
  feed.messages = entries;
  feed.listeners.forEach((notify) => notify());
}
/** Called only on a confirmed, live server broadcast, never when loading old history. */
export function publishLiveSceneMessage(campaignId: string, message: Message): void {
  if (!campaignId) return;
  const entry = sceneUtteranceFromMessage(message);
  if (!entry) return;
  feedFor(campaignId).liveListeners.forEach((notify) => notify(entry));
}
export function subscribeSceneHistory(campaignId: string, notify: () => void): () => void {
  const feed = feedFor(campaignId);
  feed.listeners.add(notify);
  return () => { feed.listeners.delete(notify); };
}
export function getSceneHistory(campaignId: string): readonly SceneUtterance[] {
  return campaignId ? feedFor(campaignId).messages : EMPTY;
}
export function subscribeLiveSceneDialogue(campaignId: string, notify: (utterance: SceneUtterance) => void): () => void {
  const feed = feedFor(campaignId);
  feed.liveListeners.add(notify);
  return () => { feed.liveListeners.delete(notify); };
}
