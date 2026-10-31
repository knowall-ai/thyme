import { SpeakerWaveIcon, SpeakerXMarkIcon } from '@heroicons/react/24/outline';

/** The one speaker control: mutes or unmutes the assistant everywhere. */
export function SpeakerToggle({
  name,
  muted,
  onChange,
  className = '',
}: {
  name: string;
  muted: boolean;
  onChange: (muted: boolean) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!muted)}
      aria-pressed={muted}
      aria-label={muted ? `Unmute ${name}` : `Mute ${name}`}
      title={muted ? `Unmute ${name}` : `Mute ${name}`}
      data-testid="ask-timmie-speaker"
      data-greeting-ignore
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${
        muted
          ? 'bg-dark-800 text-dark-400 hover:text-white'
          : 'bg-brand/15 text-brand hover:bg-brand/25'
      } ${className}`}
    >
      {muted ? (
        <SpeakerXMarkIcon className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <SpeakerWaveIcon className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      {muted ? 'Muted' : 'Voice on'}
    </button>
  );
}
