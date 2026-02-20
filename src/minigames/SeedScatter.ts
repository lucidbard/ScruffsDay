import { Scene } from '../game/Scene';
import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { Easing } from '../game/Tween';

interface SandyPatch {
  x: number;
  y: number;
  w: number;
  h: number;
}

type SeedType = 'rosemary' | 'palmetto' | 'acorn';

/** Wind resistance multiplier per seed type (higher = more drift). */
const WIND_FACTOR: Record<SeedType, number> = {
  rosemary: 0.6,
  palmetto: 1.4,
  acorn: 0.3,
};

/** Gravity (pixels/sec^2) per seed type. */
const GRAVITY: Record<SeedType, number> = {
  rosemary: 300,
  palmetto: 240,
  acorn: 420,
};

/** Friendly colour per seed type. */
const SEED_COLOR: Record<SeedType, number> = {
  rosemary: 0x3cb371,
  palmetto: 0x6b8e23,
  acorn: 0x8b6914,
};

const TOTAL_SEEDS = 15;
const WIN_SCORE = 80;
const GROUND_Y = 500;

export class SeedScatter extends Scene {
  private seedsRemaining = TOTAL_SEEDS;
  private score = 0;

  // Current seed in flight
  private currentSeed: Container | null = null;
  private seedFalling = false;
  private seedVelocity = { x: 0, y: 0 };
  private currentSeedType: SeedType = 'rosemary';

  // Drag state
  private isDragging = false;
  private dragStart = { x: 0, y: 0 };
  private aimLine: Graphics | null = null;

  // Wind
  private windDirection = 0; // angle in radians (0 = right)
  private windStrength = 50; // pixels/sec

  // Zone geometry
  private sandyPatches: SandyPatch[] = [];
  private invasivePatches: SandyPatch[] = [];

  // UI elements
  private scoreText!: Text;
  private seedsText!: Text;
  private windArrow!: Container;
  private windLabel!: Text;
  private gameActive = false;

  // Scruff sprite (simple bird shape at top)
  private scruffSprite!: Container;
  private scruffX = 640;
  private scruffDirection = 1; // 1 = right, -1 = left
  private scruffSpeed = 80; // pixels/sec

  // Seed type rotation
  private seedTypeOrder: SeedType[] = [];

  // Sprouts for visual feedback
  private sprouts: Container[] = [];

  onComplete?: () => void;

  async setup(): Promise<void> {
    // Sky background
    const bg = new Graphics();
    bg.rect(0, 0, 1280, 720);
    bg.fill({ color: 0xa8d8ea });
    this.container.addChild(bg);

    // Ground
    const ground = new Graphics();
    ground.rect(0, GROUND_Y, 1280, 220);
    ground.fill({ color: 0xe8d5a8 });
    this.container.addChild(ground);

    // Build zone layout
    this.buildZones();

    // Draw sandy patches (tan - good targets)
    for (const patch of this.sandyPatches) {
      const g = new Graphics();
      g.roundRect(patch.x, patch.y, patch.w, patch.h, 10);
      g.fill({ color: 0xf5e8c8 });
      g.stroke({ width: 2, color: 0xc8b28a });
      this.container.addChild(g);
    }

    // Draw invasive patches (dark green - bad targets)
    for (const patch of this.invasivePatches) {
      const g = new Graphics();
      g.roundRect(patch.x, patch.y, patch.w, patch.h, 8);
      g.fill({ color: 0x2d5a1e });
      g.stroke({ width: 2, color: 0x1a3a10 });
      // Leaf detail
      const leaf = new Graphics();
      leaf.circle(patch.x + patch.w / 2, patch.y + patch.h / 2, Math.min(patch.w, patch.h) / 3);
      leaf.fill({ color: 0x3a6b28 });
      this.container.addChild(g, leaf);
    }

    // Zone labels (subtle)
    for (const patch of this.sandyPatches) {
      const lbl = new Text({
        text: 'sand',
        style: new TextStyle({
          fontSize: 11,
          fill: '#B8A080',
          fontFamily: 'Arial, sans-serif',
        }),
      });
      lbl.anchor.set(0.5, 0.5);
      lbl.position.set(patch.x + patch.w / 2, patch.y + patch.h / 2);
      this.container.addChild(lbl);
    }

    // Scruff flying at top
    this.scruffSprite = this.buildScruffSprite();
    this.scruffSprite.position.set(this.scruffX, 60);
    this.container.addChild(this.scruffSprite);

    // Wind indicator
    this.windArrow = new Container();
    const arrowBg = new Graphics();
    arrowBg.roundRect(-50, -20, 100, 40, 8);
    arrowBg.fill({ color: 0xfff8dc, alpha: 0.8 });
    arrowBg.stroke({ width: 2, color: 0x3e2723 });
    this.windArrow.addChild(arrowBg);

    this.windLabel = new Text({
      text: 'Wind',
      style: new TextStyle({
        fontSize: 14,
        fill: '#3E2723',
        fontWeight: 'bold',
        fontFamily: 'Arial, sans-serif',
      }),
    });
    this.windLabel.anchor.set(0.5, 0.5);
    this.windLabel.position.set(0, 0);
    this.windArrow.addChild(this.windLabel);
    this.windArrow.position.set(1180, 30);
    this.container.addChild(this.windArrow);

    // Score display
    this.scoreText = new Text({
      text: 'Score: 0',
      style: new TextStyle({
        fontSize: 28,
        fill: '#3E2723',
        fontWeight: 'bold',
        fontFamily: 'Arial, sans-serif',
      }),
    });
    this.scoreText.position.set(20, 20);

    this.seedsText = new Text({
      text: `Seeds: ${TOTAL_SEEDS}`,
      style: new TextStyle({
        fontSize: 24,
        fill: '#3E2723',
        fontWeight: 'bold',
        fontFamily: 'Arial, sans-serif',
      }),
    });
    this.seedsText.position.set(20, 55);

    this.container.addChild(this.scoreText, this.seedsText);

    // Build seed type order (cycle through types)
    this.seedTypeOrder = [];
    const types: SeedType[] = ['rosemary', 'palmetto', 'acorn'];
    for (let i = 0; i < TOTAL_SEEDS; i++) {
      this.seedTypeOrder.push(types[i % 3]);
    }

    // Instructions overlay
    const instrOverlay = new Container();
    const instrBg = new Graphics();
    instrBg.roundRect(200, 120, 880, 460, 20);
    instrBg.fill({ color: 0xfff8dc });
    instrBg.stroke({ width: 4, color: 0x3e2723 });
    instrOverlay.addChild(instrBg);

    const instrTitle = new Text({
      text: 'Seed Scatter!',
      style: new TextStyle({
        fontSize: 40,
        fill: '#2E8B57',
        fontWeight: 'bold',
        fontFamily: 'Arial, sans-serif',
      }),
    });
    instrTitle.anchor.set(0.5, 0);
    instrTitle.position.set(640, 140);
    instrOverlay.addChild(instrTitle);

    const instrText = new Text({
      text:
        'Help Scruff drop native seeds onto the sandy patches below!\n\n' +
        'Drag down from Scruff to aim, then release to drop a seed.\n' +
        'Watch out for the wind - it pushes seeds sideways!\n\n' +
        'Seed types:\n' +
        '  Rosemary (green) - drops fairly straight\n' +
        '  Palmetto (olive) - drifts a lot in the wind\n' +
        '  Acorn (brown) - heavy, drops fast\n\n' +
        'Land on sandy patch: +10    Land on invasive: -5    Miss: -2\n' +
        `15 seeds total. Score ${WIN_SCORE} or more to win!`,
      style: new TextStyle({
        fontSize: 20,
        fill: '#3E2723',
        wordWrap: true,
        wordWrapWidth: 820,
        lineHeight: 28,
        fontFamily: 'Arial, sans-serif',
      }),
    });
    instrText.position.set(230, 200);
    instrOverlay.addChild(instrText);

    const tapStart = new Text({
      text: 'Tap to start!',
      style: new TextStyle({
        fontSize: 24,
        fill: '#4169E1',
        fontWeight: 'bold',
        fontStyle: 'italic',
        fontFamily: 'Arial, sans-serif',
      }),
    });
    tapStart.anchor.set(0.5, 0);
    tapStart.position.set(640, 530);
    instrOverlay.addChild(tapStart);

    instrBg.eventMode = 'static';
    instrBg.on('pointertap', () => {
      this.container.removeChild(instrOverlay);
      this.gameActive = true;
      this.randomizeWind();
      this.spawnSeed();
    });

    // Interaction area
    bg.eventMode = 'static';
    ground.eventMode = 'static';

    // Pointer events on the whole game area
    bg.on('pointerdown', (e) => this.onPointerDown(e));
    bg.on('pointermove', (e) => this.onPointerMove(e));
    bg.on('pointerup', () => this.onPointerUp());
    bg.on('pointerupoutside', () => this.onPointerUp());
    ground.on('pointerdown', (e) => this.onPointerDown(e));
    ground.on('pointermove', (e) => this.onPointerMove(e));
    ground.on('pointerup', () => this.onPointerUp());
    ground.on('pointerupoutside', () => this.onPointerUp());

    // Add instructions on top
    this.container.addChild(instrOverlay);
  }

  enter(): void {
    this.score = 0;
    this.seedsRemaining = TOTAL_SEEDS;
    this.gameActive = false;
    this.seedFalling = false;
    this.isDragging = false;
    this.currentSeed = null;
    this.updateUI();
  }

  update(deltaMs: number): void {
    if (!this.gameActive) return;
    const dt = deltaMs / 1000;

    // Move Scruff back and forth at top
    this.scruffX += this.scruffDirection * this.scruffSpeed * dt;
    if (this.scruffX > 1100) this.scruffDirection = -1;
    if (this.scruffX < 180) this.scruffDirection = 1;
    this.scruffSprite.position.x = this.scruffX;
    this.scruffSprite.scale.x = this.scruffDirection > 0 ? 1 : -1;

    // Move seed attached to Scruff (before drop)
    if (this.currentSeed && !this.seedFalling) {
      this.currentSeed.position.set(this.scruffX, 90);
    }

    // Seed physics when falling
    if (this.currentSeed && this.seedFalling) {
      const type = this.currentSeedType;
      // Apply gravity
      this.seedVelocity.y += GRAVITY[type] * dt;
      // Apply wind
      this.seedVelocity.x += Math.cos(this.windDirection) * this.windStrength * WIND_FACTOR[type] * dt;

      this.currentSeed.position.x += this.seedVelocity.x * dt;
      this.currentSeed.position.y += this.seedVelocity.y * dt;

      // Check landing
      if (this.currentSeed.position.y >= GROUND_Y) {
        this.handleLanding(this.currentSeed.position.x, this.currentSeed.position.y);
      }

      // Check off-screen
      if (
        this.currentSeed.position.x < -20 ||
        this.currentSeed.position.x > 1300 ||
        this.currentSeed.position.y > 740
      ) {
        this.handleMiss();
      }
    }
  }

  private buildZones(): void {
    // Sandy patches (good targets) - spread across the ground
    this.sandyPatches = [
      { x: 80, y: 520, w: 160, h: 70 },
      { x: 320, y: 540, w: 150, h: 65 },
      { x: 560, y: 510, w: 170, h: 75 },
      { x: 800, y: 530, w: 160, h: 70 },
      { x: 1040, y: 520, w: 150, h: 65 },
    ];

    // Invasive patches (bad targets) - between sandy patches
    this.invasivePatches = [
      { x: 260, y: 515, w: 50, h: 50 },
      { x: 500, y: 540, w: 50, h: 50 },
      { x: 740, y: 525, w: 50, h: 50 },
      { x: 970, y: 535, w: 55, h: 50 },
      { x: 150, y: 600, w: 60, h: 45 },
      { x: 450, y: 610, w: 55, h: 50 },
      { x: 680, y: 605, w: 50, h: 45 },
      { x: 900, y: 615, w: 55, h: 50 },
      { x: 1140, y: 600, w: 50, h: 45 },
    ];
  }

  private buildScruffSprite(): Container {
    const c = new Container();
    // Simple bird body
    const body = new Graphics();
    body.ellipse(0, 0, 28, 18);
    body.fill({ color: 0x4169e1 });
    body.stroke({ width: 2, color: 0x000000 });
    c.addChild(body);

    // Head
    const head = new Graphics();
    head.circle(24, -8, 12);
    head.fill({ color: 0x4169e1 });
    head.stroke({ width: 2, color: 0x000000 });
    c.addChild(head);

    // Eye
    const eye = new Graphics();
    eye.circle(28, -10, 3);
    eye.fill({ color: 0xffffff });
    eye.stroke({ width: 1, color: 0x000000 });
    c.addChild(eye);
    const pupil = new Graphics();
    pupil.circle(29, -10, 1.5);
    pupil.fill({ color: 0x000000 });
    c.addChild(pupil);

    // Beak
    const beak = new Graphics();
    beak.moveTo(34, -8);
    beak.lineTo(42, -5);
    beak.lineTo(34, -3);
    beak.closePath();
    beak.fill({ color: 0xffa500 });
    beak.stroke({ width: 1, color: 0x000000 });
    c.addChild(beak);

    // Wings
    const wing = new Graphics();
    wing.moveTo(-10, -5);
    wing.quadraticCurveTo(-30, -25, -15, 5);
    wing.fill({ color: 0x5b8fd4 });
    wing.stroke({ width: 1.5, color: 0x000000 });
    c.addChild(wing);

    return c;
  }

  private spawnSeed(): void {
    if (this.seedsRemaining <= 0) return;

    const idx = TOTAL_SEEDS - this.seedsRemaining;
    this.currentSeedType = this.seedTypeOrder[idx];

    const seed = new Container();
    const color = SEED_COLOR[this.currentSeedType];

    if (this.currentSeedType === 'palmetto') {
      // Fan shape
      const fan = new Graphics();
      fan.moveTo(0, -8);
      fan.lineTo(-10, 6);
      fan.lineTo(-4, 4);
      fan.lineTo(0, 10);
      fan.lineTo(4, 4);
      fan.lineTo(10, 6);
      fan.closePath();
      fan.fill({ color });
      fan.stroke({ width: 1.5, color: 0x000000 });
      seed.addChild(fan);
    } else if (this.currentSeedType === 'acorn') {
      // Acorn shape - oval with cap
      const nut = new Graphics();
      nut.ellipse(0, 2, 6, 8);
      nut.fill({ color });
      nut.stroke({ width: 1.5, color: 0x000000 });
      seed.addChild(nut);
      const cap = new Graphics();
      cap.arc(0, -4, 7, Math.PI, 0);
      cap.fill({ color: 0xa0781e });
      cap.stroke({ width: 1, color: 0x000000 });
      seed.addChild(cap);
    } else {
      // Rosemary - small green dot
      const dot = new Graphics();
      dot.circle(0, 0, 6);
      dot.fill({ color });
      dot.stroke({ width: 1.5, color: 0x000000 });
      seed.addChild(dot);
    }

    // Seed type label
    const typeLbl = new Text({
      text: this.currentSeedType,
      style: new TextStyle({
        fontSize: 10,
        fill: '#FFF',
        fontWeight: 'bold',
        fontFamily: 'Arial, sans-serif',
      }),
    });
    typeLbl.anchor.set(0.5, 0);
    typeLbl.position.set(0, 14);
    seed.addChild(typeLbl);

    seed.position.set(this.scruffX, 90);
    this.currentSeed = seed;
    this.seedFalling = false;
    this.seedVelocity = { x: 0, y: 0 };
    this.container.addChild(seed);
  }

  private randomizeWind(): void {
    // Wind blows left or right (roughly horizontal)
    this.windDirection = Math.random() < 0.5 ? 0 : Math.PI; // 0 = right, PI = left
    // Add some vertical component
    this.windDirection += (Math.random() - 0.5) * 0.6;
    this.windStrength = 40 + Math.random() * 80;

    // Update wind indicator
    const dir = Math.cos(this.windDirection) > 0 ? 'right' : 'left';
    const strength = this.windStrength < 60 ? 'light' : this.windStrength < 90 ? 'medium' : 'strong';
    this.windLabel.text = `Wind: ${strength} ${dir}`;
  }

  private onPointerDown(e: { getLocalPosition: (target: Container) => { x: number; y: number } }): void {
    if (!this.gameActive || this.seedFalling || !this.currentSeed) return;
    const pos = e.getLocalPosition(this.container);
    this.isDragging = true;
    this.dragStart = { x: pos.x, y: pos.y };

    // Create aim line
    this.aimLine = new Graphics();
    this.container.addChild(this.aimLine);
  }

  private onPointerMove(e: { getLocalPosition: (target: Container) => { x: number; y: number } }): void {
    if (!this.isDragging || !this.aimLine || !this.currentSeed) return;
    const pos = e.getLocalPosition(this.container);

    this.aimLine.clear();
    // Draw dotted line from seed to pointer
    this.aimLine.moveTo(this.currentSeed.position.x, this.currentSeed.position.y);
    this.aimLine.lineTo(pos.x, pos.y);
    this.aimLine.stroke({ width: 3, color: 0xff6347, alpha: 0.7 });

    // Draw small target circle at pointer
    this.aimLine.circle(pos.x, pos.y, 8);
    this.aimLine.stroke({ width: 2, color: 0xff6347, alpha: 0.7 });
  }

  private onPointerUp(): void {
    if (!this.isDragging || !this.currentSeed) return;
    this.isDragging = false;

    // Remove aim line
    if (this.aimLine) {
      this.container.removeChild(this.aimLine);
      this.aimLine = null;
    }

    // Drop the seed - give it a small initial downward velocity
    // The seed will mostly fall straight down with gravity + wind
    this.seedFalling = true;
    this.seedVelocity = { x: 0, y: 30 };
  }

  private handleLanding(x: number, _y: number): void {
    if (!this.currentSeed) return;

    // Check if landed on sandy patch (good)
    let hitSandy = false;
    let hitInvasive = false;

    for (const patch of this.sandyPatches) {
      if (x >= patch.x && x <= patch.x + patch.w) {
        hitSandy = true;
        // Show sprout
        this.showSprout(x, GROUND_Y + 10);
        break;
      }
    }

    if (!hitSandy) {
      for (const patch of this.invasivePatches) {
        if (x >= patch.x && x <= patch.x + patch.w) {
          hitInvasive = true;
          break;
        }
      }
    }

    if (hitSandy) {
      this.score += 10;
      this.showFeedback(x, GROUND_Y - 20, '+10', 0x2e8b57);
    } else if (hitInvasive) {
      this.score -= 5;
      this.showFeedback(x, GROUND_Y - 20, '-5', 0xcd853f);
    } else {
      this.score -= 2;
      this.showFeedback(x, GROUND_Y - 20, '-2', 0x999999);
    }

    // Remove seed
    this.container.removeChild(this.currentSeed);
    this.currentSeed = null;
    this.seedFalling = false;
    this.seedsRemaining--;
    this.updateUI();

    if (this.seedsRemaining <= 0) {
      // Short delay then show results
      setTimeout(() => this.showResult(), 500);
    } else {
      this.randomizeWind();
      this.spawnSeed();
    }
  }

  private handleMiss(): void {
    if (!this.currentSeed) return;

    this.score -= 2;
    this.container.removeChild(this.currentSeed);
    this.currentSeed = null;
    this.seedFalling = false;
    this.seedsRemaining--;
    this.updateUI();

    if (this.seedsRemaining <= 0) {
      setTimeout(() => this.showResult(), 500);
    } else {
      this.randomizeWind();
      this.spawnSeed();
    }
  }

  private showFeedback(x: number, y: number, text: string, color: number): void {
    const lbl = new Text({
      text,
      style: new TextStyle({
        fontSize: 24,
        fill: `#${color.toString(16).padStart(6, '0')}`,
        fontWeight: 'bold',
        fontFamily: 'Arial, sans-serif',
      }),
    });
    lbl.anchor.set(0.5, 0.5);
    lbl.position.set(x, y);
    this.container.addChild(lbl);

    // Float up and fade
    this.tweens.add({
      target: lbl.position as unknown as Record<string, number>,
      props: { y: y - 40 },
      duration: 600,
      easing: Easing.easeOut,
      onComplete: () => {
        this.container.removeChild(lbl);
      },
    });
  }

  private showSprout(x: number, y: number): void {
    const sprout = new Container();
    const stem = new Graphics();
    stem.moveTo(0, 0);
    stem.lineTo(0, -12);
    stem.stroke({ width: 2, color: 0x2e8b57 });
    sprout.addChild(stem);

    const leaf1 = new Graphics();
    leaf1.ellipse(-5, -14, 5, 3);
    leaf1.fill({ color: 0x3cb371 });
    sprout.addChild(leaf1);

    const leaf2 = new Graphics();
    leaf2.ellipse(5, -12, 5, 3);
    leaf2.fill({ color: 0x3cb371 });
    sprout.addChild(leaf2);

    sprout.position.set(x, y);
    sprout.scale.set(0, 0);
    this.container.addChild(sprout);
    this.sprouts.push(sprout);

    // Pop-in animation
    this.tweens.add({
      target: sprout.scale as unknown as Record<string, number>,
      props: { x: 1.2, y: 1.2 },
      duration: 200,
      easing: Easing.easeOut,
      onComplete: () => {
        this.tweens.add({
          target: sprout.scale as unknown as Record<string, number>,
          props: { x: 1, y: 1 },
          duration: 150,
          easing: Easing.bounce,
        });
      },
    });
  }

  private showResult(): void {
    this.gameActive = false;
    const won = this.score >= WIN_SCORE;

    const overlay = new Container();
    const bg = new Graphics();
    bg.roundRect(300, 200, 680, 300, 20);
    bg.fill({ color: 0xfff8dc });
    bg.stroke({ width: 4, color: 0x3e2723 });
    overlay.addChild(bg);

    const title = new Text({
      text: won ? 'Great planting!' : 'Nice try!',
      style: new TextStyle({
        fontSize: 36,
        fill: won ? '#2E8B57' : '#CD853F',
        fontWeight: 'bold',
        fontFamily: 'Arial, sans-serif',
      }),
    });
    title.anchor.set(0.5, 0);
    title.position.set(640, 230);
    overlay.addChild(title);

    const scoreDisplay = new Text({
      text: `Final Score: ${this.score}`,
      style: new TextStyle({
        fontSize: 28,
        fill: '#3E2723',
        fontFamily: 'Arial, sans-serif',
      }),
    });
    scoreDisplay.anchor.set(0.5, 0);
    scoreDisplay.position.set(640, 290);
    overlay.addChild(scoreDisplay);

    const message = new Text({
      text: won
        ? 'The native plants will bring the sandy barrens back to life!'
        : 'Every seed helps! The plants are starting to take root.',
      style: new TextStyle({
        fontSize: 22,
        fill: '#3E2723',
        wordWrap: true,
        wordWrapWidth: 600,
        fontFamily: 'Arial, sans-serif',
      }),
    });
    message.anchor.set(0.5, 0);
    message.position.set(640, 340);
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
    tapText.position.set(640, 420);
    overlay.addChild(tapText);

    bg.eventMode = 'static';
    bg.on('pointertap', () => {
      this.container.removeChild(overlay);
      // Always succeed (forgiving for kids)
      this.gameState.setFlag('seed_scatter_complete');
      this.onComplete?.();
    });

    this.container.addChild(overlay);
  }

  private updateUI(): void {
    this.scoreText.text = `Score: ${this.score}`;
    this.seedsText.text = `Seeds: ${this.seedsRemaining}`;
  }

  exit(): void {
    this.gameActive = false;
    this.seedFalling = false;
    this.isDragging = false;
    if (this.currentSeed) {
      this.container.removeChild(this.currentSeed);
      this.currentSeed = null;
    }
    if (this.aimLine) {
      this.container.removeChild(this.aimLine);
      this.aimLine = null;
    }
    for (const sprout of this.sprouts) {
      this.container.removeChild(sprout);
    }
    this.sprouts = [];
  }
}
