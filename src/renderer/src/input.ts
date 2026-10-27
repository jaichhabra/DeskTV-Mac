import type { Dir } from '../../shared/nav';
import { isTyping, move } from './focus';
import { select } from './sounds';

/**
 * Keyboard, remote and controller in one place. Remotes that act as a keyboard (most HTPC remotes and air mice)
 * send arrows, Enter, Escape or BrowserBack, and ContextMenu; controllers come in through the Gamepad API.
 * Holding Enter (or the A button) opens an item's menu, as a long press does on a TV.
 */
export interface InputHandlers {
  back(): void;
  /** Return true to take the arrow (move mode); false lets focus move. */
  arrow?(dir: Dir): boolean;
  /** Any input at all, for the screensaver's idle timer; return true to swallow it. */
  poke(): boolean;
  toggleTv(): void;
  search(): void;
}

const HOLD_MS = 600;
const ARROWS: Record<string, Dir> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };

export function attachInput(h: InputHandlers): () => void {
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  let held = false;
  let pressed: HTMLElement | null = null;

  const openMenu = (el: HTMLElement): void => {
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.bottom }));
  };

  const press = (): void => {
    const el = document.activeElement as HTMLElement | null;
    if (!el?.hasAttribute('data-item') || isTyping(el)) return;
    pressed = el;
    held = false;
    if (holdTimer) clearTimeout(holdTimer);
    holdTimer = setTimeout(() => {
      held = true;
      if (pressed) openMenu(pressed);
    }, HOLD_MS);
  };

  const release = (): void => {
    if (holdTimer) clearTimeout(holdTimer);
    holdTimer = null;
    const el = pressed;
    pressed = null;
    if (el && !held && document.activeElement === el) {
      select();
      el.click();
    }
  };

  const arrow = (dir: Dir): void => {
    if (h.arrow?.(dir)) return;
    move(dir);
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    if (h.poke()) {
      e.preventDefault();
      return;
    }
    if (e.defaultPrevented) return;
    const typing = isTyping(document.activeElement);
    const dir = ARROWS[e.key];
    if (dir) {
      // In a text field, left and right move the caret until it reaches an end; up and down leave it.
      if (typing && (dir === 'left' || dir === 'right')) {
        const input = document.activeElement as HTMLInputElement;
        const atEnd = dir === 'left' ? input.selectionStart === 0 : input.selectionEnd === input.value.length;
        if (!atEnd || input.selectionStart !== input.selectionEnd) return;
      }
      e.preventDefault();
      arrow(dir);
      return;
    }
    switch (e.key) {
      case 'Enter':
        if (typing) return;
        e.preventDefault();
        if (!e.repeat) press();
        return;
      case ' ':
        if (typing) return;
        e.preventDefault();
        if (!e.repeat) (document.activeElement as HTMLElement | null)?.click();
        return;
      case 'Escape':
      case 'BrowserBack':
      case 'GoBack':
        e.preventDefault();
        h.back();
        return;
      case 'Backspace':
        if (typing) return;
        e.preventDefault();
        h.back();
        return;
      case 'ContextMenu':
        e.preventDefault();
        if (document.activeElement instanceof HTMLElement) openMenu(document.activeElement);
        return;
      case 'f':
      case 'F':
        if (!(e.ctrlKey && e.metaKey)) break;
        e.preventDefault();
        h.toggleTv();
        return;
      case 'F11':
        e.preventDefault();
        h.toggleTv();
        return;
      case 'BrowserSearch':
        e.preventDefault();
        h.search();
        return;
    }
    if (!typing && (e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f'))) {
      e.preventDefault();
      h.search();
    }
  };

  const onKeyUp = (e: KeyboardEvent): void => {
    if (e.key === 'Enter') release();
  };

  // The mouse focuses what it points at, so mouse and remote never disagree about the focused item.
  let lastX = -1;
  let lastY = -1;
  const onPointerMove = (e: PointerEvent): void => {
    if (Math.abs(e.clientX - lastX) + Math.abs(e.clientY - lastY) < 3) return;
    lastX = e.clientX;
    lastY = e.clientY;
    if (h.poke()) return;
    const item = (e.target as Element | null)?.closest<HTMLElement>('[data-item]');
    if (item && item !== document.activeElement && !isTyping(document.activeElement)) item.focus({ preventScroll: true });
  };
  const onPointerDown = (e: PointerEvent): void => {
    if (h.poke()) e.preventDefault();
  };
  const onWheel = (): void => void h.poke();

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('wheel', onWheel, { passive: true });
  const stopPad = attachGamepad({ arrow, press, release, back: h.back, poke: h.poke, menu: () => {
    if (document.activeElement instanceof HTMLElement) openMenu(document.activeElement);
  } });

  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerdown', onPointerDown, true);
    window.removeEventListener('wheel', onWheel);
    stopPad();
  };
}

/** Standard-mapping controllers: d-pad or left stick to move, A to select (hold for the menu), B back, Y menu. */
function attachGamepad(h: {
  arrow(d: Dir): void;
  press(): void;
  release(): void;
  back(): void;
  poke(): boolean;
  menu(): void;
}): () => void {
  let frame = 0;
  const was = new Map<string, boolean>();
  const repeatAt = new Map<Dir, number>();

  const edge = (key: string, down: boolean): 'down' | 'up' | null => {
    const before = was.get(key) ?? false;
    was.set(key, down);
    return down === before ? null : down ? 'down' : 'up';
  };

  const loop = (): void => {
    const pads = navigator.getGamepads().filter((p): p is Gamepad => !!p && p.mapping === 'standard');
    if (!pads.length) {
      frame = 0;
      return;
    }
    const p = pads[0];
    const b = (i: number): boolean => !!p.buttons[i]?.pressed;
    const now = performance.now();
    const dirs: [Dir, boolean][] = [
      ['up', b(12) || p.axes[1] < -0.6],
      ['down', b(13) || p.axes[1] > 0.6],
      ['left', b(14) || p.axes[0] < -0.6],
      ['right', b(15) || p.axes[0] > 0.6]
    ];
    for (const [d, down] of dirs) {
      const e = edge(d, down);
      if (e === 'down') {
        if (!h.poke()) h.arrow(d);
        repeatAt.set(d, now + 420);
      } else if (down && now >= (repeatAt.get(d) ?? Infinity)) {
        h.arrow(d);
        repeatAt.set(d, now + 110);
      }
    }
    const a = edge('a', b(0));
    if (a === 'down' && !h.poke()) h.press();
    if (a === 'up') h.release();
    if (edge('b', b(1)) === 'down' && !h.poke()) h.back();
    if (edge('y', b(3)) === 'down' && !h.poke()) h.menu();
    frame = requestAnimationFrame(loop);
  };

  const start = (): void => {
    if (!frame) frame = requestAnimationFrame(loop);
  };
  window.addEventListener('gamepadconnected', start);
  start();
  return () => {
    window.removeEventListener('gamepadconnected', start);
    cancelAnimationFrame(frame);
  };
}
