/**
 * Change a character's journal portrait without requiring its game-system
 * sheet to implement picture controls. Only rendered for permitted editors.
 * Never resends or replaces the character's sheet data.
 */
import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { ImagePlus } from 'lucide-react';
import { useServerConfigQuery } from '@/hooks/queries';
import { api } from '@/services/api';
import type { Character } from '@/types';
import { apiErrorMessage } from '@/utils/errors';
import { tokenPictureProblem, uploadTokenPicture } from '@/utils/tokenPicture';

interface CharacterPictureControlProps {
  character: Character;
  onSaved: (saved: Character) => void;
}

export default function CharacterPictureControl({ character, onSaved }: CharacterPictureControlProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const { data: serverConfig } = useServerConfigQuery();

  const selectPicture = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Re-selecting the same filename should fire a new change event.
    event.target.value = '';
    if (!file || busy) return;

    const problem = tokenPictureProblem(file, serverConfig);
    if (problem) {
      setNotice({ text: problem, error: true });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      // Upload first. If the upload fails, no character field is changed.
      const tokenImageUrl = await uploadTokenPicture(file, character.name, character.campaignId);
      // Read the newest revision so picture-only updates do not submit stale
      // journal fields or overwrite unrelated edits from another session.
      const { character: latest } = await api.getCharacter(character.id);
      const { character: saved } = await api.updateCharacter(character.id, {
        tokenImageUrl,
        updatedAt: latest.updatedAt,
      });
      onSaved(saved);
      setNotice({ text: 'Character picture updated.', error: false });
    } catch (error) {
      setNotice({ text: apiErrorMessage(error) || 'Picture could not be saved. The previous picture remains in use.', error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex max-w-44 flex-col items-end gap-1 text-right">
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        tabIndex={-1}
        aria-label={`Select picture for ${character.name}`}
        accept=".png,.jpg,.jpeg,.webp,.gif,image/png,image/jpeg,image/webp,image/gif"
        onChange={(event) => { void selectPicture(event); }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        aria-label={`Change picture for ${character.name}`}
        className="touch-target inline-flex items-center gap-1 rounded-cozy border border-ink/15 bg-paper px-2 py-1 text-xs text-ink hover:bg-ink/5 disabled:opacity-50"
      >
        <ImagePlus className="h-4 w-4 shrink-0" aria-hidden="true" />
        {busy ? 'Saving picture…' : 'Change Picture'}
      </button>
      {notice && (
        <span role={notice.error ? 'alert' : 'status'} className={`text-xs ${notice.error ? 'text-danger-ink' : 'text-success-ink'}`}>
          {notice.text}
        </span>
      )}
    </div>
  );
}
