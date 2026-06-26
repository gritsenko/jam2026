import { Container } from 'pixi.js';
import { COLORS, hex } from '../theme';
import { LANGS, getLang, setLang, t } from '../core/i18n';
import { Button } from './Button';
import { makeText } from './helpers';

/**
 * Compact language selector: an optional "LANGUAGE" caption above a row of pills,
 * one per {@link LANGS} entry, with the active language highlighted. Tapping a
 * different language persists the choice and reloads (see core/i18n.setLang) so
 * every scene re-renders in it. Origin top-left; the caller sets `position` and
 * reads {@link contentHeight} to stack siblings below it.
 */
export class LangSwitch extends Container {
  /** Laid-out height (Pixi's `height` is a bounds getter, so this is separate). */
  readonly contentHeight: number;

  constructor(width: number, showCaption = true) {
    super();
    let y = 0;
    if (showCaption) {
      const cap = makeText(t('settings.language'), 'label', { fontSize: 24, fill: hex(COLORS.textDim) });
      cap.anchor.set(0.5, 0);
      cap.position.set(width / 2, 0);
      this.addChild(cap);
      y = 42;
    }

    const gap = 18;
    const bw = (width - gap * (LANGS.length - 1)) / LANGS.length;
    const bh = 72;
    LANGS.forEach((lang, i) => {
      const active = lang.id === getLang();
      const btn = new Button({
        label: lang.label,
        width: bw,
        height: bh,
        preset: 'label',
        primary: active,
        labelColor: active ? COLORS.textBright : COLORS.textDim,
        onClick: () => {
          // Re-read the live language: the active pill is a no-op, a different one
          // switches + reloads. (Guard against a double-tap re-triggering a reload.)
          if (lang.id !== getLang()) setLang(lang.id);
        },
      });
      btn.position.set(bw / 2 + i * (bw + gap), y + bh / 2);
      this.addChild(btn);
    });

    this.contentHeight = y + bh;
  }
}
