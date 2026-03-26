import { Scene } from '../game/Scene';
import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { Easing } from '../game/Tween';

/** Habitat zone definition. */
interface Habitat {
  name: string;
  animalName: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: number;       // base outline color for the zone
  animalColor: number;  // color for the animal icon
  animalShape: 'circle' | 'oval' | 'hexCircle' | 'smallCircle';
}

const HABITATS: Habitat[] = [
  {
    name: 'Scrub Thicket',
    animalName: 'Scruff',
    x: 150,
    y: 500,
    w: 180,
    h: 120,
    color: 0x4169e1,
    animalColor: 0x4169e1,
    animalShape: 'circle',
  },
  {
    name: 'Tortoise Burrow',
    animalName: 'Shelly',
    x: 540,
    y: 520,
    w: 200,
    h: 110,
    color: 0x8b6914,
    animalColor: 0x8b6914,
    animalShape: 'hexCircle',
  },
  {
    name: 'Pine Clearing',
    animalName: 'Flicker',
    x: 100,
    y: 300,
    w: 200,
    h: 130,
    color: 0xcd3333,
    animalColor: 0xcd3333,
    animalShape: 'circle',
  },
  {
    name: 'Sandy Barrens',
    animalName: 'Sunny',
    x: 980,
    y: 340,
    w: 210,
    h: 120,
    color: 0x191970,
    animalColor: 0x191970,
    animalShape: 'oval',
  },
  {
    name: 'Underground',
    animalName: 'Pip',
    x: 540,
    y: 350,
    w: 180,
    h: 100,
    color: 0xd2b48c,
    animalColor: 0xd2b48c,
    animalShape: 'smallCircle',
  },
];

/** How many animals to show per round: round 1 = 2, round 2 = 3, round 3 = 4, round 4 = 5. */
const ROUND_LENGTHS = [2, 3, 4, 5];
const MAX_ROUNDS = ROUND_LENGTHS.length;
const FLASH_DURATION = 1500; // ms per animal flash
const FLASH_GAP = 400;       // ms gap between flashes

export class NightWatch extends Scene {
  private round = 0;
  private sequence: number[] = [];
  private playerGuess: number[] = [];
  private habitatContainers: Container[] = [];
  private animalIcons: Container[] = [];
  private zoneBgs: Graphics[] = [];
  private showingSequence = false;
  private waitingForInput = false;
  private gameActive = false;
  private feedbackText!: Text;
  private roundText!: Text;
  private instructionText!: Text;
  private pendingTimers: ReturnType<typeof setTimeout>[] = [];
  onComplete?: () => void;

  async setup(): Promise<void> {
    // Night sky background
    const bg = new Graphics();
    bg.rect(0, 0, 1280, 720);
    bg.fill({ color: 0x1a1a3e });
    bg.eventMode = 'static';
    this.container.addChild(bg);

    // Stars
    this.drawStars();

    // Preserve silhouette at bottom
    const land = new Graphics();
    land.moveTo(0, 600);
    land.quadraticCurveTo(200, 570, 400, 580);
    land.quadraticCurveTo(640, 560, 900, 575);
    land.quadraticCurveTo(1100, 565, 1280, 580);
    land.lineTo(1280, 720);
    land.lineTo(0, 720);
    land.closePath();
    land.fill({ color: 0x0a0a1e });
    this.container.addChild(land);

    // Title
    const title = new Text({
      text: 'Night Watch',
      style: new TextStyle({
        fontSize: 36,
        fill: '#FFE44D',
        fontWeight: 'bold',
        fontFamily: 'Arial, sans-serif',
      }),
    });
    title.anchor.set(0.5, 0);
    title.position.set(640, 15);
    this.container.addChild(title);

    // Round indicator
    this.roundText = new Text({
      text: '',
      style: new TextStyle({
        fontSize: 22,
        fill: '#CCCCFF',
        fontWeight: 'bold',
        fontFamily: 'Arial, sans-serif',
      }),
    });
    this.roundText.anchor.set(0.5, 0);
    this.roundText.position.set(640, 58);
    this.container.addChild(this.roundText);

    // Instruction text
    this.instructionText = new Text({
      text: '',
      style: new TextStyle({
        fontSize: 20,
        fill: '#AAAADD',
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'italic',
      }),
    });
    this.instructionText.anchor.set(0.5, 0);
    this.instructionText.position.set(640, 85);
    this.container.addChild(this.instructionText);

    // Create habitat zones
    for (let i = 0; i < HABITATS.length; i++) {
      const h = HABITATS[i];
      const zone = new Container();

      // Zone background (dim by default)
      const zoneBg = new Graphics();
      zoneBg.roundRect(0, 0, h.w, h.h, 12);
      zoneBg.fill({ color: h.color, alpha: 0.15 });
      zoneBg.stroke({ width: 2, color: h.color, alpha: 0.4 });
      zone.addChild(zoneBg);
      this.zoneBgs.push(zoneBg);

      // Zone label
      const label = new Text({
        text: h.name,
        style: new TextStyle({
          fontSize: 13,
          fill: '#AAAACC',
          fontFamily: 'Arial, sans-serif',
        }),
      });
      label.anchor.set(0.5, 0);
      label.position.set(h.w / 2, h.h + 4);
      zone.addChild(label);

      // Animal icon (hidden initially)
      const animalIcon = this.createAnimalIcon(h);
      animalIcon.position.set(h.w / 2, h.h / 2);
      animalIcon.visible = false;
      zone.addChild(animalIcon);
      this.animalIcons.push(animalIcon);

      zone.position.set(h.x, h.y);
      zone.eventMode = 'static';
      zone.cursor = 'pointer';

      // Tap handler
      const idx = i;
      zone.on('pointertap', (e) => {
        e.stopPropagation();
        this.onHabitatTap(idx);
      });

      this.habitatContainers.push(zone);
      this.container.addChild(zone);
    }

    // Feedback text (center of screen)
    this.feedbackText = new Text({
      text: '',
      style: new TextStyle({
        fontSize: 32,
        fill: '#FFE44D',
        fontWeight: 'bold',
        fontFamily: 'Arial, sans-serif',
      }),
    });
    this.feedbackText.anchor.set(0.5, 0.5);
    this.feedbackText.position.set(640, 240);
    this.feedbackText.visible = false;
    this.container.addChild(this.feedbackText);

    // Instructions overlay
    const instrOverlay = new Container();
    const instrBg = new Graphics();
    instrBg.roundRect(200, 140, 880, 420, 20);
    instrBg.fill({ color: 0x1a1a3e, alpha: 0.95 });
    instrBg.stroke({ width: 4, color: 0xffe44d });
    instrOverlay.addChild(instrBg);

    const instrTitle = new Text({
      text: 'Night Watch!',
      style: new TextStyle({
        fontSize: 40,
        fill: '#FFE44D',
        fontWeight: 'bold',
        fontFamily: 'Arial, sans-serif',
      }),
    });
    instrTitle.anchor.set(0.5, 0);
    instrTitle.position.set(640, 160);
    instrOverlay.addChild(instrTitle);

    const instrText = new Text({
      text:
        "It's time for the final night survey of the preserve!\n\n" +
        'Watch as each animal appears in their habitat.\n' +
        'Then tap the habitats in the ORDER they appeared.\n\n' +
        'Round 1: 2 animals\n' +
        'Round 2: 3 animals\n' +
        'Round 3: 4 animals\n' +
        'Round 4: All 5 animals!\n\n' +
        "Don't worry - you can try again if you get it wrong!",
      style: new TextStyle({
        fontSize: 21,
        fill: '#CCCCEE',
        wordWrap: true,
        wordWrapWidth: 820,
        lineHeight: 28,
        fontFamily: 'Arial, sans-serif',
      }),
    });
    instrText.position.set(230, 218);
    instrOverlay.addChild(instrText);

    const tapStart = new Text({
      text: 'Tap to start!',
      style: new TextStyle({
        fontSize: 24,
        fill: '#FFE44D',
        fontWeight: 'bold',
        fontStyle: 'italic',
        fontFamily: 'Arial, sans-serif',
      }),
    });
    tapStart.anchor.set(0.5, 0);
    tapStart.position.set(640, 510);
    instrOverlay.addChild(tapStart);

    instrBg.eventMode = 'static';
    instrBg.on('pointertap', () => {
      this.container.removeChild(instrOverlay);
      this.gameActive = true;
      this.startRound();
    });

    this.container.addChild(instrOverlay);
  }

  enter(): void {
    this.round = 0;
    this.gameActive = false;
    this.showingSequence = false;
    this.waitingForInput = false;
  }

  update(_deltaMs: number): void {
    // Game logic is event-driven (timeouts + taps), no per-frame update needed
  }

  private drawStars(): void {
    const starPositions = [
      { x: 80, y: 40, r: 2 }, { x: 220, y: 70, r: 1.5 }, { x: 350, y: 30, r: 2 },
      { x: 500, y: 55, r: 1.5 }, { x: 640, y: 25, r: 2.5 }, { x: 780, y: 50, r: 1.5 },
      { x: 920, y: 35, r: 2 }, { x: 1060, y: 60, r: 1 }, { x: 1180, y: 28, r: 2 },
      { x: 150, y: 110, r: 1 }, { x: 400, y: 95, r: 1.5 }, { x: 600, y: 120, r: 1 },
      { x: 840, y: 105, r: 1.5 }, { x: 1000, y: 90, r: 1 }, { x: 1200, y: 100, r: 1.5 },
      { x: 50, y: 160, r: 1 }, { x: 280, y: 150, r: 1.5 }, { x: 470, y: 170, r: 1 },
      { x: 720, y: 145, r: 2 }, { x: 950, y: 165, r: 1 }, { x: 1120, y: 140, r: 1.5 },
      { x: 180, y: 200, r: 1 }, { x: 530, y: 210, r: 1 }, { x: 870, y: 195, r: 1.5 },
      { x: 1050, y: 220, r: 1 },
    ];

    for (const star of starPositions) {
      const s = new Graphics();
      s.circle(star.x, star.y, star.r);
      s.fill({ color: 0xffffff, alpha: 0.5 + Math.random() * 0.5 });
      this.container.addChildAt(s, 1);

      // Twinkle animation
      this.tweens.add({
        target: s as unknown as Record<string, number>,
        props: { alpha: 0.3 + Math.random() * 0.4 },
        duration: 800 + Math.random() * 1200,
        yoyo: true,
        loop: true,
        easing: Easing.easeInOut,
      });
    }
  }

  private createAnimalIcon(h: Habitat): Container {
    const icon = new Container();
    const g = new Graphics();

    switch (h.animalShape) {
      case 'circle': {
        // Scruff (blue circle) or Flicker (red circle)
        g.circle(0, 0, 22);
        g.fill({ color: h.animalColor });
        g.stroke({ width: 3, color: 0xffffff });
        break;
      }
      case 'hexCircle': {
        // Shelly (brown circle with hex pattern)
        g.circle(0, 0, 24);
        g.fill({ color: h.animalColor });
        g.stroke({ width: 3, color: 0xffffff });
        // Hex pattern lines
        const hex = new Graphics();
        for (let a = 0; a < 6; a++) {
          const angle = (a * Math.PI * 2) / 6;
          hex.moveTo(0, 0);
          hex.lineTo(Math.cos(angle) * 14, Math.sin(angle) * 14);
        }
        hex.stroke({ width: 1.5, color: 0xffffff, alpha: 0.5 });
        icon.addChild(g, hex);
        // Add name label
        const nameLabel = new Text({
          text: h.animalName,
          style: new TextStyle({ fontSize: 11, fill: '#FFFFFF', fontWeight: 'bold', fontFamily: 'Arial, sans-serif' }),
        });
        nameLabel.anchor.set(0.5, 0);
        nameLabel.position.set(0, 28);
        icon.addChild(nameLabel);
        return icon;
      }
      case 'oval': {
        // Sunny (dark blue long oval)
        g.ellipse(0, 0, 14, 28);
        g.fill({ color: h.animalColor });
        g.stroke({ width: 3, color: 0xffffff });
        break;
      }
      case 'smallCircle': {
        // Pip (small tan circle with big ears)
        g.circle(0, 0, 16);
        g.fill({ color: h.animalColor });
        g.stroke({ width: 3, color: 0xffffff });
        // Ears
        const ears = new Graphics();
        ears.circle(-12, -14, 8);
        ears.circle(12, -14, 8);
        ears.fill({ color: h.animalColor });
        ears.stroke({ width: 2, color: 0xffffff });
        icon.addChild(g, ears);
        const nameLabel2 = new Text({
          text: h.animalName,
          style: new TextStyle({ fontSize: 11, fill: '#FFFFFF', fontWeight: 'bold', fontFamily: 'Arial, sans-serif' }),
        });
        nameLabel2.anchor.set(0.5, 0);
        nameLabel2.position.set(0, 22);
        icon.addChild(nameLabel2);
        return icon;
      }
    }

    icon.addChild(g);

    // Name label below icon
    const nameLabel = new Text({
      text: h.animalName,
      style: new TextStyle({ fontSize: 11, fill: '#FFFFFF', fontWeight: 'bold', fontFamily: 'Arial, sans-serif' }),
    });
    nameLabel.anchor.set(0.5, 0);
    nameLabel.position.set(0, h.animalShape === 'oval' ? 32 : 26);
    icon.addChild(nameLabel);

    return icon;
  }

  private startRound(): void {
    const count = ROUND_LENGTHS[this.round];
    this.roundText.text = `Round ${this.round + 1} of ${MAX_ROUNDS}`;
    this.instructionText.text = 'Watch carefully...';

    // Generate random sequence of 'count' unique habitat indices
    const available = [0, 1, 2, 3, 4];
    this.sequence = [];
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(Math.random() * available.length);
      this.sequence.push(available[idx]);
      available.splice(idx, 1);
    }

    this.playerGuess = [];
    this.showSequence();
  }

  private async showSequence(): Promise<void> {
    this.showingSequence = true;
    this.waitingForInput = false;

    // Hide all animal icons first
    for (const icon of this.animalIcons) {
      icon.visible = false;
    }

    // Dim all zone backgrounds
    for (let i = 0; i < this.zoneBgs.length; i++) {
      this.redrawZoneBg(i, false);
    }

    // Brief pause before starting
    await this.delay(600);

    // Show each animal in sequence
    for (let i = 0; i < this.sequence.length; i++) {
      const habitatIdx = this.sequence[i];

      // Light up zone
      this.redrawZoneBg(habitatIdx, true);
      // Show animal
      this.animalIcons[habitatIdx].visible = true;
      this.animalIcons[habitatIdx].alpha = 0;

      // Fade in
      this.tweens.add({
        target: this.animalIcons[habitatIdx] as unknown as Record<string, number>,
        props: { alpha: 1 },
        duration: 300,
        easing: Easing.easeOut,
      });

      await this.delay(FLASH_DURATION);

      // Fade out
      this.tweens.add({
        target: this.animalIcons[habitatIdx] as unknown as Record<string, number>,
        props: { alpha: 0 },
        duration: 300,
        easing: Easing.easeIn,
        onComplete: () => {
          this.animalIcons[habitatIdx].visible = false;
        },
      });

      // Dim zone
      this.redrawZoneBg(habitatIdx, false);

      if (i < this.sequence.length - 1) {
        await this.delay(FLASH_GAP);
      }
    }

    await this.delay(300);

    this.showingSequence = false;
    this.waitingForInput = true;
    this.instructionText.text = 'Now tap the habitats in order!';
  }

  private redrawZoneBg(idx: number, lit: boolean): void {
    const h = HABITATS[idx];
    const bg = this.zoneBgs[idx];
    bg.clear();
    bg.roundRect(0, 0, h.w, h.h, 12);
    if (lit) {
      bg.fill({ color: h.color, alpha: 0.5 });
      bg.stroke({ width: 3, color: 0xffe44d, alpha: 0.9 });
    } else {
      bg.fill({ color: h.color, alpha: 0.15 });
      bg.stroke({ width: 2, color: h.color, alpha: 0.4 });
    }
  }

  private onHabitatTap(idx: number): void {
    if (!this.waitingForInput || this.showingSequence || !this.gameActive) return;

    this.playerGuess.push(idx);

    // Brief flash to confirm tap
    this.redrawZoneBg(idx, true);
    this.animalIcons[idx].visible = true;
    this.animalIcons[idx].alpha = 1;

    // Check if correct so far
    const guessIndex = this.playerGuess.length - 1;
    if (this.playerGuess[guessIndex] !== this.sequence[guessIndex]) {
      // Wrong!
      this.waitingForInput = false;
      this.showFeedback('Try again!', '#FF6347');

      // Brief delay then replay
      this.scheduleTimer(() => {
        if (!this.gameActive) return;
        for (const icon of this.animalIcons) {
          icon.visible = false;
        }
        for (let i = 0; i < this.zoneBgs.length; i++) {
          this.redrawZoneBg(i, false);
        }
        this.playerGuess = [];
        this.showSequence();
      }, 1200);
      return;
    }

    // Correct so far - dim after brief flash
    this.scheduleTimer(() => {
      if (!this.gameActive) return;
      this.redrawZoneBg(idx, false);
      this.animalIcons[idx].visible = false;
    }, 300);

    // Check if round is complete
    if (this.playerGuess.length === this.sequence.length) {
      this.waitingForInput = false;
      this.showFeedback('Great memory!', '#2ECC71');

      // Light up all correct habitats briefly
      for (const seqIdx of this.sequence) {
        this.redrawZoneBg(seqIdx, true);
        this.animalIcons[seqIdx].visible = true;
        this.animalIcons[seqIdx].alpha = 1;
      }

      this.scheduleTimer(() => {
        if (!this.gameActive) return;
        for (const icon of this.animalIcons) {
          icon.visible = false;
        }
        for (let i = 0; i < this.zoneBgs.length; i++) {
          this.redrawZoneBg(i, false);
        }

        this.round++;
        if (this.round >= MAX_ROUNDS) {
          this.showVictory();
        } else {
          this.startRound();
        }
      }, 1500);
    }
  }

  private showFeedback(text: string, color: string): void {
    this.feedbackText.text = text;
    this.feedbackText.style.fill = color;
    this.feedbackText.visible = true;
    this.feedbackText.alpha = 1;

    // Fade out
    this.tweens.add({
      target: this.feedbackText as unknown as Record<string, number>,
      props: { alpha: 0 },
      duration: 1000,
      delay: 600,
      easing: Easing.easeIn,
      onComplete: () => {
        this.feedbackText.visible = false;
      },
    });
  }

  private showVictory(): void {
    this.gameActive = false;
    this.gameState.setFlag('night_watch_complete');

    // Light up all habitats
    for (let i = 0; i < HABITATS.length; i++) {
      this.redrawZoneBg(i, true);
      this.animalIcons[i].visible = true;
      this.animalIcons[i].alpha = 1;
    }

    const overlay = new Container();
    const bg = new Graphics();
    bg.roundRect(250, 180, 780, 340, 20);
    bg.fill({ color: 0x1a1a3e, alpha: 0.95 });
    bg.stroke({ width: 4, color: 0xffe44d });
    overlay.addChild(bg);

    const titleTxt = new Text({
      text: 'Survey Complete!',
      style: new TextStyle({
        fontSize: 38,
        fill: '#FFE44D',
        fontWeight: 'bold',
        fontFamily: 'Arial, sans-serif',
      }),
    });
    titleTxt.anchor.set(0.5, 0);
    titleTxt.position.set(640, 210);
    overlay.addChild(titleTxt);

    const message = new Text({
      text:
        'Every animal is safe and sound in their restored habitat!\n\n' +
        'Scruff in the thicket, Shelly in her burrow,\n' +
        'Flicker among the pines, Sunny on warm sand,\n' +
        'and Pip cozy underground.',
      style: new TextStyle({
        fontSize: 22,
        fill: '#CCCCEE',
        wordWrap: true,
        wordWrapWidth: 700,
        lineHeight: 30,
        fontFamily: 'Arial, sans-serif',
        align: 'center',
      }),
    });
    message.anchor.set(0.5, 0);
    message.position.set(640, 270);
    overlay.addChild(message);

    const tapText = new Text({
      text: 'Tap to continue...',
      style: new TextStyle({
        fontSize: 18,
        fill: '#999999',
        fontStyle: 'italic',
        fontFamily: 'Arial, sans-serif',
      }),
    });
    tapText.anchor.set(0.5, 0);
    tapText.position.set(640, 460);
    overlay.addChild(tapText);

    bg.eventMode = 'static';
    bg.on('pointertap', () => {
      this.container.removeChild(overlay);
      this.onComplete?.();
    });

    this.container.addChild(overlay);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private scheduleTimer(callback: () => void, ms: number): void {
    const id = setTimeout(() => {
      const idx = this.pendingTimers.indexOf(id);
      if (idx !== -1) this.pendingTimers.splice(idx, 1);
      callback();
    }, ms);
    this.pendingTimers.push(id);
  }

  exit(): void {
    this.gameActive = false;
    this.showingSequence = false;
    this.waitingForInput = false;
    for (const id of this.pendingTimers) clearTimeout(id);
    this.pendingTimers = [];
  }
}
