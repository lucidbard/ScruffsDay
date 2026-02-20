import { Scene } from '../game/Scene';
import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { Easing } from '../game/Tween';

interface Vine {
  container: Container;
  isInvasive: boolean;
  speed: number; // pixels per second
  targetX: number;
  targetY: number;
  startX: number;
  startY: number;
  progress: number; // 0 to 1
  alive: boolean;
}

export class VineBuster extends Scene {
  private vines: Vine[] = [];
  private score = 0;
  private round = 1;
  private roundTimer = 30; // seconds
  private gameActive = false;
  private treeCenter = { x: 640, y: 360 };
  private scoreText!: Text;
  private timerText!: Text;
  private roundText!: Text;
  private spawnInterval = 1.5; // seconds between spawns
  private spawnTimer = 0;
  onComplete?: () => void;

  async setup(): Promise<void> {
    // Sky background
    const bg = new Graphics();
    bg.rect(0, 0, 1280, 720);
    bg.fill({ color: 0x87ceeb });
    this.container.addChild(bg);

    // Ground
    const ground = new Graphics();
    ground.rect(0, 500, 1280, 220);
    ground.fill({ color: 0xd2b48c });
    this.container.addChild(ground);

    // Tree in center (simple trunk + canopy)
    const trunk = new Graphics();
    trunk.rect(610, 250, 60, 300);
    trunk.fill({ color: 0x8b6914 });
    trunk.stroke({ width: 3, color: 0x000000 });
    this.container.addChild(trunk);

    const canopy = new Graphics();
    canopy.circle(640, 220, 120);
    canopy.fill({ color: 0x2e8b57 });
    canopy.stroke({ width: 3, color: 0x000000 });
    this.container.addChild(canopy);

    // Smaller canopy clusters
    const canopy2 = new Graphics();
    canopy2.circle(570, 260, 70);
    canopy2.fill({ color: 0x3a9b64 });
    canopy2.stroke({ width: 2, color: 0x000000 });
    this.container.addChild(canopy2);

    const canopy3 = new Graphics();
    canopy3.circle(710, 260, 70);
    canopy3.fill({ color: 0x3a9b64 });
    canopy3.stroke({ width: 2, color: 0x000000 });
    this.container.addChild(canopy3);

    // Instructions overlay at start
    const instrOverlay = new Container();
    const instrBg = new Graphics();
    instrBg.roundRect(200, 150, 880, 400, 20);
    instrBg.fill({ color: 0xfff8dc });
    instrBg.stroke({ width: 4, color: 0x3e2723 });
    instrOverlay.addChild(instrBg);

    const instrTitle = new Text({
      text: 'Vine Buster!',
      style: new TextStyle({
        fontSize: 40,
        fill: '#2E8B57',
        fontWeight: 'bold',
        fontFamily: 'Arial, sans-serif',
      }),
    });
    instrTitle.anchor.set(0.5, 0);
    instrTitle.position.set(640, 170);
    instrOverlay.addChild(instrTitle);

    const instrText = new Text({
      text:
        'Tap the invasive air potato vines (dark green, heart leaves) to cut them!\n\n' +
        'But be careful - do NOT tap the native grape vines (light green, round leaves).\n\n' +
        'Invasive vine cut: +10 points\n' +
        'Native vine cut: -5 points\n' +
        'Vine reaches tree: -10 points\n\n' +
        '3 rounds of 30 seconds. Score above 0 to win!',
      style: new TextStyle({
        fontSize: 22,
        fill: '#3E2723',
        wordWrap: true,
        wordWrapWidth: 820,
        lineHeight: 30,
        fontFamily: 'Arial, sans-serif',
      }),
    });
    instrText.position.set(230, 230);
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
    tapStart.position.set(640, 500);
    instrOverlay.addChild(tapStart);

    instrBg.eventMode = 'static';
    instrBg.on('pointertap', () => {
      this.container.removeChild(instrOverlay);
      this.gameActive = true;
    });

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

    this.timerText = new Text({
      text: 'Time: 30',
      style: new TextStyle({
        fontSize: 28,
        fill: '#3E2723',
        fontWeight: 'bold',
        fontFamily: 'Arial, sans-serif',
      }),
    });
    this.timerText.position.set(20, 55);

    this.roundText = new Text({
      text: 'Round 1 of 3',
      style: new TextStyle({
        fontSize: 24,
        fill: '#4169E1',
        fontWeight: 'bold',
        fontFamily: 'Arial, sans-serif',
      }),
    });
    this.roundText.position.set(1060, 20);

    this.container.addChild(this.scoreText, this.timerText, this.roundText);

    // Background tap to catch misses (must be interactive so vine taps are separate)
    bg.eventMode = 'static';
    ground.eventMode = 'static';

    // Add instructions on top
    this.container.addChild(instrOverlay);
  }

  enter(): void {
    this.score = 0;
    this.round = 1;
    this.gameActive = false; // Will be set true after instructions dismissed
    this.roundTimer = 30;
    this.spawnTimer = 0;
    this.spawnInterval = 1.5;
    this.vines = [];
    this.updateUI();
  }

  update(deltaMs: number): void {
    if (!this.gameActive) return;
    const dt = deltaMs / 1000;

    // Timer
    this.roundTimer -= dt;
    if (this.roundTimer <= 0) {
      this.endRound();
      return;
    }

    // Spawn vines
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnVine();
      this.spawnTimer = this.spawnInterval;
    }

    // Move vines toward tree
    for (const vine of this.vines) {
      if (!vine.alive) continue;
      const dist = this.getVineDistance(vine);
      if (dist > 0) {
        vine.progress += (vine.speed / dist) * dt;
      }
      if (vine.progress >= 1) vine.progress = 1;

      const x = vine.startX + (vine.targetX - vine.startX) * vine.progress;
      const y = vine.startY + (vine.targetY - vine.startY) * vine.progress;
      vine.container.position.set(x, y);

      // Check if vine reached tree
      const dx = x - this.treeCenter.x;
      const dy = y - this.treeCenter.y;
      if (Math.sqrt(dx * dx + dy * dy) < 80) {
        this.score -= 10;
        vine.alive = false;
        vine.container.visible = false;
        this.updateUI();
      }
    }

    this.updateUI();
  }

  private spawnVine(): void {
    const isInvasive = Math.random() > 0.3; // 70% invasive, 30% native
    const side = Math.floor(Math.random() * 4); // top, right, bottom, left

    let startX: number, startY: number;
    switch (side) {
      case 0:
        startX = 100 + Math.random() * 1080;
        startY = -20;
        break;
      case 1:
        startX = 1300;
        startY = 100 + Math.random() * 400;
        break;
      case 2:
        startX = 100 + Math.random() * 1080;
        startY = 540;
        break;
      default:
        startX = -20;
        startY = 100 + Math.random() * 400;
        break;
    }

    // Vine visual
    const vineContainer = new Container();
    const body = new Graphics();

    if (isInvasive) {
      // Dark green vine with heart-shaped leaves
      body.circle(0, 0, 20);
      body.fill({ color: 0x006400 });
      body.stroke({ width: 3, color: 0x000000 });
      // Heart-shaped leaf marker
      const leaf = new Graphics();
      leaf.moveTo(0, -8);
      leaf.bezierCurveTo(-10, -18, -18, -4, 0, 8);
      leaf.moveTo(0, -8);
      leaf.bezierCurveTo(10, -18, 18, -4, 0, 8);
      leaf.fill({ color: 0x004400 });
      leaf.stroke({ width: 2, color: 0x003300 });
      vineContainer.addChild(body, leaf);
    } else {
      // Lighter green with round leaves
      body.circle(0, 0, 18);
      body.fill({ color: 0x8fbc8f });
      body.stroke({ width: 3, color: 0x000000 });
      // Round leaf
      const leaf = new Graphics();
      leaf.circle(0, -12, 10);
      leaf.fill({ color: 0x90ee90 });
      leaf.stroke({ width: 2, color: 0x006400 });
      vineContainer.addChild(body, leaf);
    }

    vineContainer.position.set(startX, startY);
    vineContainer.eventMode = 'static';
    vineContainer.cursor = 'pointer';

    const vineData: Vine = {
      container: vineContainer,
      isInvasive,
      speed: 60 + (this.round - 1) * 20, // faster each round
      targetX: this.treeCenter.x + (Math.random() - 0.5) * 80,
      targetY: this.treeCenter.y + (Math.random() - 0.5) * 80,
      startX,
      startY,
      progress: 0,
      alive: true,
    };

    vineContainer.on('pointertap', (e) => {
      e.stopPropagation();
      if (!vineData.alive || !this.gameActive) return;
      vineData.alive = false;
      if (vineData.isInvasive) {
        this.score += 10;
      } else {
        this.score -= 5;
      }
      // Cut animation - shrink and disappear
      this.tweens.add({
        target: vineContainer.scale as unknown as Record<string, number>,
        props: { x: 0, y: 0 },
        duration: 200,
        easing: Easing.easeIn,
        onComplete: () => {
          vineContainer.visible = false;
        },
      });
      this.updateUI();
    });

    this.vines.push(vineData);
    this.container.addChild(vineContainer);
  }

  private getVineDistance(vine: Vine): number {
    const dx = vine.targetX - vine.startX;
    const dy = vine.targetY - vine.startY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private endRound(): void {
    this.gameActive = false;

    // Clear remaining vines
    for (const vine of this.vines) {
      vine.alive = false;
      vine.container.visible = false;
    }
    this.vines = [];

    if (this.round < 3) {
      // Show "Did you know?" fact
      this.showFactPopup();
    } else {
      // Game over
      this.showResult();
    }
  }

  private showFactPopup(): void {
    const facts = [
      'Did you know? Air potato is an invasive vine from Asia that can grow 8 inches per day!',
      'Did you know? Native grape vines provide food for birds and small mammals!',
      'Did you know? Sand pines are specially adapted to Florida\'s dry, sandy soil!',
    ];
    const fact = facts[this.round - 1] || facts[0];

    const overlay = new Container();
    const bg = new Graphics();
    bg.roundRect(200, 200, 880, 300, 20);
    bg.fill({ color: 0xfff8dc });
    bg.stroke({ width: 4, color: 0x3e2723 });
    overlay.addChild(bg);

    const text = new Text({
      text: fact,
      style: new TextStyle({
        fontSize: 24,
        fill: '#3E2723',
        wordWrap: true,
        wordWrapWidth: 820,
        lineHeight: 32,
        fontFamily: 'Arial, sans-serif',
      }),
    });
    text.position.set(230, 230);
    overlay.addChild(text);

    const tapText = new Text({
      text: 'Tap to continue...',
      style: new TextStyle({
        fontSize: 18,
        fill: '#999999',
        fontStyle: 'italic',
        fontFamily: 'Arial, sans-serif',
      }),
    });
    tapText.position.set(500, 440);
    overlay.addChild(tapText);

    bg.eventMode = 'static';
    bg.on('pointertap', () => {
      this.container.removeChild(overlay);
      this.round++;
      this.roundTimer = 30;
      this.spawnTimer = 0;
      this.spawnInterval = Math.max(0.5, this.spawnInterval - 0.3);
      this.gameActive = true;
      this.updateUI();
    });

    this.container.addChild(overlay);
  }

  private showResult(): void {
    const won = this.score > 0;
    const overlay = new Container();
    const bg = new Graphics();
    bg.roundRect(300, 200, 680, 300, 20);
    bg.fill({ color: 0xfff8dc });
    bg.stroke({ width: 4, color: 0x3e2723 });
    overlay.addChild(bg);

    const title = new Text({
      text: won ? 'Great job!' : 'Nice try!',
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
        ? 'You saved the sand pine! Flicker is so grateful!'
        : 'The tree survived! Let\'s head back.',
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
      this.gameState.setFlag('vine_buster_complete');
      this.onComplete?.();
    });

    this.container.addChild(overlay);
  }

  private updateUI(): void {
    this.scoreText.text = `Score: ${this.score}`;
    this.timerText.text = `Time: ${Math.ceil(Math.max(0, this.roundTimer))}`;
    this.roundText.text = `Round ${this.round} of 3`;
  }

  exit(): void {
    this.gameActive = false;
    for (const vine of this.vines) {
      vine.alive = false;
      vine.container.visible = false;
    }
    this.vines = [];
  }
}
