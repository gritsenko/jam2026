/**
 * Bridge to the boot splash defined inline in index.html. The splash (title +
 * progress bar) paints before the module bundle even loads, so these helpers
 * just nudge its progress and dismiss it once the first scene is ready.
 *
 * The implementation lives in HTML on purpose: it must be alive during the
 * initial JS download/parse, which on slow mobiles is itself a "frozen" gap.
 */
interface BootSplash {
  /** Set progress 0–100 (monotonic; backwards jumps are ignored). */
  set(percent: number): void;
  /** Fill to 100%, fade out, then remove the splash from the DOM. */
  done(): void;
}

function splash(): BootSplash | undefined {
  return (window as unknown as { __boot?: BootSplash }).__boot;
}

/** Report boot progress (0–100) to the splash bar, if present. */
export function bootProgress(percent: number): void {
  splash()?.set(percent);
}

/** Dismiss the boot splash (fade + remove), with a hard-remove fallback. */
export function bootDone(): void {
  const s = splash();
  if (s) s.done();
  else document.getElementById('boot')?.remove();
}
