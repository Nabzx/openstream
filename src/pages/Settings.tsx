import { useEffect, useState } from "react";
import HotkeySettings from "../HotkeySettings";
import BreakSafeAppsSettings from "../BreakSafeAppsSettings";
import TermCorrectionsSettings from "../TermCorrectionsSettings";
import Toggle from "../components/Toggle";
import type { OverlayPosition } from "../openstreamBridge";

function CopyTranscriptSection() {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    window.openstream.settings.get().then((settings) => setEnabled(settings.copyTranscriptToClipboard));
  }, []);

  return (
    <div className="setting-item">
      <h3 className="setting-item__name">Copy every dictation</h3>
      <p className="setting-item__desc">
        Also puts the finished text on the clipboard, so a paste that doesn’t land is never lost. Off by default,
        since it replaces whatever you had copied.
      </p>
      <div className="setting-item__control">
        <Toggle
          label="Copy each finished dictation to the clipboard"
          checked={enabled ?? false}
          disabled={enabled === null}
          onChange={(next) => {
            setEnabled(next);
            window.openstream.settings
              .setCopyTranscript(next)
              .then((settings) => setEnabled(settings.copyTranscriptToClipboard));
          }}
        />
      </div>
    </div>
  );
}

const IDLE_UNLOAD_OPTIONS = [
  { value: 0, label: "Never (stay loaded)" },
  { value: 5, label: "After 5 minutes idle" },
  { value: 10, label: "After 10 minutes idle" },
  { value: 20, label: "After 20 minutes idle" },
  { value: 30, label: "After 30 minutes idle" },
  { value: 60, label: "After 1 hour idle" },
];

function IdleUnloadSection() {
  const [minutes, setMinutes] = useState<number | null>(null);

  useEffect(() => {
    window.openstream.settings.get().then((settings) => setMinutes(settings.idleUnloadMinutes));
  }, []);

  // A saved custom value that isn't one of the presets still needs a row.
  const options =
    minutes !== null && !IDLE_UNLOAD_OPTIONS.some((o) => o.value === minutes)
      ? [...IDLE_UNLOAD_OPTIONS, { value: minutes, label: `After ${minutes} minutes idle` }]
      : IDLE_UNLOAD_OPTIONS;

  return (
    <div className="setting-item">
      <h3 className="setting-item__name">Free memory when idle</h3>
      <p className="setting-item__desc">
        The speech models hold about a gigabyte of memory while they’re loaded. Unload them after a spell of not
        dictating; the next dictation waits a few seconds for them to come back.
      </p>
      <div className="setting-item__control">
        <select
          className="field"
          value={minutes ?? 0}
          disabled={minutes === null}
          onChange={(event) => {
            const next = Number(event.target.value);
            setMinutes(next);
            window.openstream.settings
              .setIdleUnloadMinutes(next)
              .then((settings) => setMinutes(settings.idleUnloadMinutes));
          }}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

// #252: mirrors electron/languages.js - keep the two in step. Sorted by
// name; "auto" comes first.
const LANGUAGE_OPTIONS: { value: string; label: string }[] = [
  { value: "auto", label: "Detect automatically" },
  { value: "bs", label: "Bosnian" },
  { value: "bg", label: "Bulgarian" },
  { value: "hr", label: "Croatian" },
  { value: "cs", label: "Czech" },
  { value: "da", label: "Danish" },
  { value: "nl", label: "Dutch" },
  { value: "en", label: "English" },
  { value: "et", label: "Estonian" },
  { value: "fi", label: "Finnish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "el", label: "Greek" },
  { value: "hu", label: "Hungarian" },
  { value: "it", label: "Italian" },
  { value: "lv", label: "Latvian" },
  { value: "lt", label: "Lithuanian" },
  { value: "mt", label: "Maltese" },
  { value: "pl", label: "Polish" },
  { value: "pt", label: "Portuguese" },
  { value: "ro", label: "Romanian" },
  { value: "ru", label: "Russian" },
  { value: "sr", label: "Serbian" },
  { value: "sk", label: "Slovak" },
  { value: "sl", label: "Slovenian" },
  { value: "es", label: "Spanish" },
  { value: "sv", label: "Swedish" },
  { value: "uk", label: "Ukrainian" },
  { value: "be", label: "Belarusian" },
];

function InputLanguageSection() {
  const [language, setLanguage] = useState<string | null>(null);

  useEffect(() => {
    window.openstream.settings.get().then((settings) => setLanguage(settings.inputLanguage));
  }, []);

  return (
    <div className="setting-item">
      <h3 className="setting-item__name">Dictation language</h3>
      <p className="setting-item__desc">
        The model handles 28 European languages. Picking one improves accuracy for its alphabet. Automatic cleanup
        (spoken punctuation, filler removal) runs for English and for Auto when it sounds like English; any other
        language is left exactly as spoken.
      </p>
      <div className="setting-item__control">
        <select
          className="field"
          value={language ?? "en"}
          disabled={language === null}
          onChange={(event) => {
            const next = event.target.value;
            setLanguage(next);
            window.openstream.settings
              .setInputLanguage(next)
              .then((settings) => setLanguage(settings.inputLanguage));
          }}
        >
          {LANGUAGE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

type MicrophoneOption = { deviceId: string; label: string };

function MicrophoneSection() {
  const [selected, setSelected] = useState<string | null>(null);
  const [devices, setDevices] = useState<MicrophoneOption[] | null>(null);

  useEffect(() => {
    window.openstream.settings.get().then((settings) => setSelected(settings.microphoneDeviceId));
  }, []);

  useEffect(() => {
    // #137: a device's label is blank until this window has an active or
    // previously-granted mic permission - request just enough to unlock
    // labels, then let the stream go immediately. The capture window keeps
    // its own separate, resident stream; this one only exists for a moment.
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        stream.getTracks().forEach((track) => track.stop());
        return navigator.mediaDevices.enumerateDevices();
      })
      .then((infos) =>
        setDevices(
          infos
            .filter((info) => info.kind === "audioinput")
            .map((info, index) => ({ deviceId: info.deviceId, label: info.label || `Microphone ${index + 1}` })),
        ),
      )
      .catch(() => setDevices([]));
  }, []);

  const knownSelection = selected && devices?.some((device) => device.deviceId === selected);

  return (
    <div className="setting-item">
      <h3 className="setting-item__name">Microphone</h3>
      <p className="setting-item__desc">
        Which input device to record from. Leave this on System default to always follow whatever macOS is set to.
      </p>
      <div className="setting-item__control">
        <select
          className="field"
          value={selected ?? ""}
          disabled={selected === null || devices === null}
          onChange={(event) => {
            const next = event.target.value || null;
            setSelected(next);
            window.openstream.settings
              .setMicrophoneDeviceId(next)
              .then((settings) => setSelected(settings.microphoneDeviceId));
          }}
        >
          <option value="">System default</option>
          {devices?.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label}
            </option>
          ))}
          {/* The saved device is no longer in the list - unplugged, most
              likely. Keeps the picker honest rather than silently showing
              a blank selection; capture.js falls back to the system
              default on its own until a different device is picked here. */}
          {selected && devices !== null && !knownSelection && <option value={selected}>Not connected</option>}
        </select>
      </div>
      {devices !== null && devices.length === 0 && (
        <p className="hint">No other input devices found, or the app doesn’t have microphone access yet.</p>
      )}
    </div>
  );
}

function PauseMediaSection() {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    window.openstream.settings.get().then((settings) => setEnabled(settings.pauseMediaWhileRecording));
  }, []);

  return (
    <div className="setting-item">
      <h3 className="setting-item__name">Pause music while recording</h3>
      <p className="setting-item__desc">
        Pauses Music and Spotify when a recording starts and resumes them after, so the mic doesn’t pick them up.
        The first time, macOS asks permission to control each app.
      </p>
      <div className="setting-item__control">
        <Toggle
          label="Pause Music and Spotify while recording"
          checked={enabled ?? false}
          disabled={enabled === null}
          onChange={(next) => {
            setEnabled(next);
            window.openstream.settings
              .setPauseMediaWhileRecording(next)
              .then((settings) => setEnabled(settings.pauseMediaWhileRecording));
          }}
        />
      </div>
    </div>
  );
}

function SoundCuesSection() {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    window.openstream.settings.get().then((settings) => setEnabled(settings.soundCues));
  }, []);

  return (
    <div className="setting-item">
      <h3 className="setting-item__name">Sound cues</h3>
      <p className="setting-item__desc">
        A short sound when a recording starts and when the text lands, so you don’t have to watch the overlay.
      </p>
      <div className="setting-item__control">
        <Toggle
          label="Play a sound at the start and end of a dictation"
          checked={enabled ?? false}
          disabled={enabled === null}
          onChange={(next) => {
            setEnabled(next);
            window.openstream.settings.setSoundCues(next).then((settings) => setEnabled(settings.soundCues));
          }}
        />
      </div>
    </div>
  );
}

const OVERLAY_POSITION_OPTIONS: { value: OverlayPosition; label: string }[] = [
  { value: "bottom", label: "Bottom centre" },
  { value: "bottom-left", label: "Bottom left" },
  { value: "bottom-right", label: "Bottom right" },
  { value: "top", label: "Top centre" },
  { value: "top-left", label: "Top left" },
  { value: "top-right", label: "Top right" },
];

function OverlayPositionSection() {
  const [position, setPosition] = useState<OverlayPosition | null>(null);

  useEffect(() => {
    window.openstream.settings.get().then((settings) => setPosition(settings.overlayPosition));
  }, []);

  return (
    <div className="setting-item">
      <h3 className="setting-item__name">Overlay position</h3>
      <p className="setting-item__desc">Where the push-to-talk overlay sits while you’re speaking.</p>
      <div className="setting-item__control">
        <select
          className="field"
          value={position ?? "bottom"}
          disabled={position === null}
          onChange={(event) => {
            const next = event.target.value as OverlayPosition;
            setPosition(next);
            window.openstream.settings
              .setOverlayPosition(next)
              .then((settings) => setPosition(settings.overlayPosition));
          }}
        >
          {OVERLAY_POSITION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

// #264: mirrors electron/recordingHistoryStore.js's DEFAULT_RETENTION_DAYS.
const HISTORY_RETENTION_OPTIONS = [
  { value: 0, label: "Forever" },
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
  { value: 365, label: "1 year" },
];

function HistoryRetentionDaysSection() {
  const [days, setDays] = useState<number | null>(null);

  useEffect(() => {
    window.openstream.settings.get().then((settings) => setDays(settings.historyRetentionDays));
  }, []);

  // A saved custom value that isn't one of the presets still needs a row.
  const options =
    days !== null && !HISTORY_RETENTION_OPTIONS.some((o) => o.value === days)
      ? [...HISTORY_RETENTION_OPTIONS, { value: days, label: `${days} days` }]
      : HISTORY_RETENTION_OPTIONS;

  return (
    <div className="setting-item">
      <h3 className="setting-item__name">Keep recording history for</h3>
      <p className="setting-item__desc">
        How long a dictation stays in the History tab before it's deleted automatically. Only the text is ever
        kept - your audio is never saved past the dictation itself.
      </p>
      <div className="setting-item__control">
        <select
          className="field"
          value={days ?? 30}
          disabled={days === null}
          onChange={(event) => {
            const next = Number(event.target.value);
            setDays(next);
            window.openstream.settings
              .setHistoryRetentionDays(next)
              .then((settings) => setDays(settings.historyRetentionDays));
          }}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

// #264: mirrors electron/recordingHistoryStore.js's MAX_ENTRIES.
const HISTORY_MAX_ENTRIES_OPTIONS = [10, 25, 50, 100, 250];

function HistoryMaxEntriesSection() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    window.openstream.settings.get().then((settings) => setCount(settings.historyMaxEntries));
  }, []);

  const options = count !== null && !HISTORY_MAX_ENTRIES_OPTIONS.includes(count)
    ? [...HISTORY_MAX_ENTRIES_OPTIONS, count].sort((a, b) => a - b)
    : HISTORY_MAX_ENTRIES_OPTIONS;

  return (
    <div className="setting-item">
      <h3 className="setting-item__name">Recording history size</h3>
      <p className="setting-item__desc">
        The most dictations to keep at once, oldest dropped first once you're over. Independent of how long
        they're kept - whichever limit is hit first applies.
      </p>
      <div className="setting-item__control">
        <select
          className="field"
          value={count ?? 50}
          disabled={count === null}
          onChange={(event) => {
            const next = Number(event.target.value);
            setCount(next);
            window.openstream.settings
              .setHistoryMaxEntries(next)
              .then((settings) => setCount(settings.historyMaxEntries));
          }}
        >
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function PostProcessSection() {
  const [scriptPath, setScriptPath] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    window.openstream.settings.get().then((settings) => {
      setScriptPath(settings.postProcessScriptPath);
      setLoaded(true);
    });
  }, []);

  function pick() {
    window.openstream.settings.pickPostProcessScript().then((settings) => {
      if (!settings) return; // the picker was cancelled
      setScriptPath(settings.postProcessScriptPath);
    });
  }

  function clear() {
    window.openstream.settings
      .setPostProcessScript(null)
      .then((settings) => setScriptPath(settings.postProcessScriptPath));
  }

  return (
    <div className="setting-item">
      <h3 className="setting-item__name">Post-processing hook</h3>
      <p className="setting-item__desc">
        Pipe the finished text through your own script (stdin in, stdout out) before it's delivered - a
        spellchecker, a personal glossary, a call out to a local model, anything you can script. It runs with full
        access to whatever the script itself can do, so only point this at something you trust. If it fails, times
        out, or goes missing, the text is delivered exactly as it would be without it.
      </p>
      <div className="setting-item__control">
        {scriptPath ? (
          <span className="chip">
            <span className="mono">{scriptPath}</span>
            <button type="button" onClick={clear} disabled={!loaded} aria-label="Remove the post-processing hook">
              ×
            </button>
          </span>
        ) : (
          <button type="button" className="btn" onClick={pick} disabled={!loaded}>
            Choose script…
          </button>
        )}
      </div>
    </div>
  );
}

function StartupSection() {
  const [openAtLogin, setOpenAtLogin] = useState<boolean | null>(null);

  useEffect(() => {
    window.openstream.app.getLoginItem().then(setOpenAtLogin);
  }, []);

  return (
    <div className="setting-item">
      <h3 className="setting-item__name">Launch at login</h3>
      <p className="setting-item__desc">Starts quietly in the menu bar, no window.</p>
      <div className="setting-item__control">
        <Toggle
          label="Launch OpenStream at login"
          checked={openAtLogin ?? false}
          disabled={openAtLogin === null}
          onChange={(next) => {
            setOpenAtLogin(next);
            window.openstream.app.setLoginItem(next).then(setOpenAtLogin);
          }}
        />
      </div>
    </div>
  );
}

export default function Settings() {
  return (
    <main className="page">
      <div className="settings-list">
        {/* HotkeySettings renders its own `.setting` section - owned by the
            one-key shortcut work (#216). index.css matches it to the
            `.setting-item` pattern with `order`, CSS only. */}
        <HotkeySettings />

        <div className="setting-item">
          <h3 className="setting-item__name">Line breaks by app</h3>
          <p className="setting-item__desc">
            A spoken “new paragraph” becomes a real line break only in these apps. Everywhere else it is dropped,
            since a newline can submit a half-typed terminal command or send an unfinished message.
          </p>
          <BreakSafeAppsSettings />
        </div>

        <InputLanguageSection />

        <MicrophoneSection />

        <div className="setting-item">
          <h3 className="setting-item__name">Names &amp; terms</h3>
          <p className="setting-item__desc">
            Fix a name or a project term the transcription keeps getting wrong. Each entry rewrites a word or
            phrase wherever it is heard, whatever the capitalisation.
          </p>
          <TermCorrectionsSettings />
        </div>

        <CopyTranscriptSection />

        <PauseMediaSection />

        <SoundCuesSection />

        <OverlayPositionSection />

        <IdleUnloadSection />

        <HistoryRetentionDaysSection />

        <HistoryMaxEntriesSection />

        <PostProcessSection />

        <StartupSection />
      </div>
    </main>
  );
}
