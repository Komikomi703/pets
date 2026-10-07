import type { Point } from '../core/types';
import './pet-menu.css';

interface MenuAction {
  label: string;
  run(): Promise<unknown>;
}

/** Browser equivalent of the native popup; resolves when dismissed or an action completes. */
export function showPetMenu(position: Point, actions: MenuAction[], label = '猫のメニュー') {
  const menu = document.createElement('div');
  menu.className = 'pet-menu';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', label);
  const previousFocus = document.activeElement;
  let finished = false;
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const closed = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
  const cleanUp = () => {
    finished = true;
    menu.remove();
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', keydown, true);
    window.removeEventListener('blur', dismiss);
    window.removeEventListener('resize', dismiss);
    if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
  };
  const dismiss = () => {
    if (finished) return;
    cleanUp();
    resolve();
  };
  const outside = (event: PointerEvent) => {
    if (event.target instanceof Node && menu.contains(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    dismiss();
  };
  const buttons = actions.map(action => {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'menuitem');
    button.tabIndex = -1;
    button.textContent = action.label;
    button.addEventListener('click', () => {
      if (finished) return;
      cleanUp();
      void action.run().then(resolve, reject);
    });
    menu.append(button);
    return button;
  });
  const keydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      dismiss();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = buttons.findIndex(button => button === document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
      : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  };
  document.body.append(menu);
  const bounds = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(position.x, innerWidth - bounds.width - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(position.y, innerHeight - bounds.height - 8))}px`;
  document.addEventListener('pointerdown', outside, true);
  document.addEventListener('keydown', keydown, true);
  window.addEventListener('blur', dismiss);
  window.addEventListener('resize', dismiss);
  buttons[0]?.focus({ preventScroll: true });
  return { closed, dismiss };
}
