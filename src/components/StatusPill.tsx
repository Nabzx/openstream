import { CheckIcon } from "./Icons";

export type PillTone = "ok" | "wait" | "err" | "muted";

const TONE_CLASS: Record<PillTone, string> = {
  ok: "pill--ok",
  wait: "pill--wait",
  err: "pill--err",
  muted: "pill--muted",
};

export default function StatusPill({ tone, label }: { tone: PillTone; label: string }) {
  return (
    <span className={`pill ${TONE_CLASS[tone]}`}>
      {tone === "ok" && <CheckIcon />}
      {label}
    </span>
  );
}
