const PREVENT = new Set([
  'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Tab', 'KeyF',
]);

export class Input {
  private downSet = new Set<string>();
  private pressedSet = new Set<string>();
  private releasedSet = new Set<string>();

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
    });
  }

  down(...codes: string[]): boolean {
    return codes.some((c) => this.downSet.has(c));
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
