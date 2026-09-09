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

        <StartupSection />
      </div>
    </main>
  );
}
