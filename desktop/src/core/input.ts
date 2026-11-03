const PREVENT = new Set([
  'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Tab', 'KeyF', 'KeyI', 'F11',
]);

const PAD_DEADZONE = 0.38;

export class Input {
  private downSet = new Set<string>();
  private pressedSet = new Set<string>();
  private releasedSet = new Set<string>();
  private padDown = new Set<string>();
  private padPrev = new Set<string>();

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (PREVENT.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.downSet.add(e.code);
      this.pressedSet.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      if (PREVENT.has(e.code)) e.preventDefault();
      this.downSet.delete(e.code);
      this.releasedSet.add(e.code);
    });
    window.addEventListener('blur', () => {
      this.downSet.clear();
      this.padDown.clear();
      this.padPrev.clear();
    });
  }

  /** Опрос геймпада. Вызывается один раз перед фиксированным шагом игры. */
  pollGamepad(): void {
    const next = new Set<string>();
    let pad: Gamepad | null = null;
    if (typeof navigator.getGamepads === 'function') {
      const pads = navigator.getGamepads();
      for (const candidate of pads) {
        if (candidate && candidate.connected) { pad = candidate; break; }
      }
    }

    if (pad) {
      const axisX = pad.axes[0] ?? 0;
      const axisY = pad.axes[1] ?? 0;
      if (axisX < -PAD_DEADZONE) next.add('KeyA');
      if (axisX > PAD_DEADZONE) next.add('KeyD');
      if (axisY < -0.6) next.add('ArrowUp');
      if (axisY > 0.6) next.add('ArrowDown');

      const pressed = (i: number): boolean => Boolean(pad!.buttons[i]?.pressed || (pad!.buttons[i]?.value ?? 0) > 0.5);
      if (pressed(0)) next.add('Space');      // A — прыжок
      if (pressed(1)) next.add('ShiftLeft');  // B — рывок
      if (pressed(2)) next.add('KeyJ');       // X — удар
      if (pressed(3)) next.add('KeyK');       // Y — огонь
      if (pressed(4)) next.add('KeyL');       // LB — лечение
      if (pressed(5)) next.add('KeyQ');       // RB — призыв
      if (pressed(6)) next.add('KeyR');       // LT — атака легиона
      if (pressed(8)) next.add('KeyI');       // Back — меню героя
      if (pressed(9)) next.add('Escape');     // Start — пауза
      if (pressed(12)) next.add('ArrowUp');
      if (pressed(13)) next.add('ArrowDown');
      if (pressed(14)) next.add('KeyA');
      if (pressed(15)) next.add('KeyD');
    }

    for (const code of next) {
      if (!this.padPrev.has(code)) this.pressedSet.add(code);
    }
    for (const code of this.padPrev) {
      if (!next.has(code)) this.releasedSet.add(code);
    }
    this.padPrev = next;
    this.padDown = next;
  }

  down(...codes: string[]): boolean {
    return codes.some((c) => this.downSet.has(c) || this.padDown.has(c));
  }

  pressed(...codes: string[]): boolean {
    return codes.some((c) => this.pressedSet.has(c));
  }

  released(...codes: string[]): boolean {
    return codes.some((c) => this.releasedSet.has(c));
  }

  endFrame(): void {
    this.pressedSet.clear();
    this.releasedSet.clear();
  }
}
