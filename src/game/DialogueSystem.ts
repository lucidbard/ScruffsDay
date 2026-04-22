import { Assets, Container, Graphics, Sprite, Text, Texture, TextStyle, Ticker } from 'pixi.js';
import { DialogueVoice } from './DialogueVoice';
import type { TweenManager } from './Tween';
import { Easing } from './Tween';
import type { GameState } from './GameState';

export interface DialogueLine {
  text: string;
  condition: string | null;
}

export interface DialogueNode {
  speaker: string;
  lines: DialogueLine[];
  next: string | null;
  action?: string;
  setFlag?: string;
}

export type DialogueData = Record<string, DialogueNode>;

export interface ActiveLine {
  speaker: string;
  text: string;
  audioPath: string;
}

function audioPathFor(nodeId: string, lineIndex: number): string {
  return `assets/sounds/dialogue/${nodeId}__${lineIndex.toString().padStart(2, '0')}.wav`;
}

export class DialogueRunner {
  private data: DialogueData;
  private checkFlag: (flag: string) => boolean;
  private onSetFlag: ((flag: string) => void) | null;
  private currentNode: DialogueNode | null = null;
  private currentNodeId: string | null = null;
  private lineIndex = 0;
  private active = false;

  constructor(data: DialogueData, checkFlag: (flag: string) => boolean, onSetFlag?: (flag: string) => void) {
    this.data = data;
    this.checkFlag = checkFlag;
    this.onSetFlag = onSetFlag ?? null;
  }

  start(nodeId: string): ActiveLine | null {
    const node = this.data[nodeId];
    if (!node) return null;
    this.currentNode = node;
    this.currentNodeId = nodeId;
    this.lineIndex = 0;
    this.active = true;
    return this.getCurrentLine();
  }

  next(): ActiveLine | null {
    if (!this.currentNode) return null;
    this.lineIndex++;
    const line = this.getCurrentLine();
    if (!line) {
      // Dialogue node complete — process setFlag if present
      if (this.currentNode.setFlag && this.onSetFlag) {
        this.onSetFlag(this.currentNode.setFlag);
      }
      this.active = false;
      this.currentNode = null;
      this.currentNodeId = null;
    }
    return line;
  }

  isActive(): boolean {
    return this.active;
  }

  getCurrentNode(): DialogueNode | null {
    return this.currentNode;
  }

  private getCurrentLine(): ActiveLine | null {
    if (!this.currentNode || !this.currentNodeId) return null;
    while (this.lineIndex < this.currentNode.lines.length) {
      const line = this.currentNode.lines[this.lineIndex];
      if (line.condition === null || this.checkFlag(line.condition)) {
        return {
          speaker: this.currentNode.speaker,
          text: line.text,
          audioPath: audioPathFor(this.currentNodeId, this.lineIndex),
        };
      }
      this.lineIndex++;
    }
    this.active = false;
    return null;
  }
}

// Extra pixel margin the bubble image needs beyond the text content area
// to show the decorative leaf border and tail (trimmed transparent-bg image)
const BUBBLE_MARGIN = {
  left: 35,
  right: 30,
  top: 28,
  bottom: 40, // includes the tail nub
};

export class DialogueBubble {
  readonly container = new Container();
  private bg = new Graphics();
  private bgSprite: Sprite | null = null;
  private textBg = new Graphics(); // semi-transparent backing behind text
  private label = new Text({
    text: '',
    style: new TextStyle({
      fontFamily: "'Fredoka', 'Comic Sans MS', sans-serif",
      fontSize: 24,
      fill: '#2B1B17',
      wordWrap: true,
      wordWrapWidth: 350,
      lineHeight: 30,
    }),
  });
  private speakerLabel = new Text({
    text: '',
    style: new TextStyle({
      fontFamily: "'Fredoka', 'Comic Sans MS', sans-serif",
      fontSize: 20,
      fontWeight: 'bold',
      fill: '#1a5276',
    }),
  });
  private tapPrompt = new Text({
    text: 'tap to continue...',
    style: new TextStyle({
      fontFamily: "'Fredoka', 'Comic Sans MS', sans-serif",
      fontSize: 15,
      fill: '#5D4037',
      fontStyle: 'italic',
    }),
  });
  private skipButton = new Container();
  private voice = new DialogueVoice();
  private tapOverlay = new Graphics();
  private countdownRing = new Graphics();
  private currentLineKey: string | null = null;
  private tickerUpdate: (() => void) | null = null;
  /** Called when the user hits the skip arrow. Scenes should advance dialogue. */
  onSkip: (() => void) | null = null;

  constructor(private gameState?: GameState) {
    // Full-screen invisible hit area — tap anywhere to advance (when allowed)
    this.tapOverlay.rect(0, 0, 1280, 720);
    this.tapOverlay.fill({ color: 0x000000, alpha: 0.001 });
    this.tapOverlay.eventMode = 'static';
    this.tapOverlay.on('pointertap', (e) => {
      e.stopPropagation();
      if (this.canAdvance()) {
        this.onSkip?.(); // reuse onSkip callback — scene's advanceDialogue
      }
    });
    this.tapOverlay.visible = false;

    this.buildSkipButton();
    // Order: fullscreen tap layer at index 0 (behind bubble), then bg, labels, countdown, skip
    this.container.addChild(
      this.tapOverlay,
      this.bg,
      this.textBg,
      this.speakerLabel,
      this.label,
      this.tapPrompt,
      this.countdownRing,
      this.skipButton,
    );
    this.container.visible = false;

    // Tick progress while visible
    this.tickerUpdate = () => this.updateCountdown();
    Ticker.shared.add(this.tickerUpdate);
  }

  private buildSkipButton(): void {
    const bg = new Graphics();
    bg.roundRect(-18, -14, 36, 28, 8);
    bg.fill({ color: 0x3E2723, alpha: 0.35 });
    const arrow = new Text({
      text: '\u00BB',
      style: new TextStyle({
        fontFamily: "'Fredoka', 'Comic Sans MS', sans-serif",
        fontSize: 22,
        fontWeight: 'bold',
        fill: '#FFF8DC',
      }),
    });
    arrow.anchor.set(0.5, 0.5);
    this.skipButton.addChild(bg, arrow);
    this.skipButton.eventMode = 'static';
    this.skipButton.cursor = 'pointer';
    this.skipButton.on('pointertap', (e) => {
      e.stopPropagation();
      this.voice.cut();
      this.onSkip?.();
    });
  }

  /** True when the current line may be advanced by tap (audio done + min time). */
  canAdvance(): boolean {
    return this.voice.canAdvance();
  }

  private setTapPromptReady(ready: boolean): void {
    this.tapPrompt.alpha = ready ? 1 : 0.25;
  }

  private updateSkipVisibility(): void {
    const played = this.currentLineKey
      ? !!this.gameState?.hasLinePlayed(this.currentLineKey)
      : false;
    this.skipButton.visible = played;
  }

  /** Draw a small filling pie next to the tap prompt as audio + min timer progress. */
  private updateCountdown(): void {
    if (!this.container.visible) {
      this.countdownRing.clear();
      return;
    }
    const p = this.voice.getProgress();
    // Position: right of the tap prompt text, one line up from bottom
    const cx = this.tapPrompt.position.x + this.tapPrompt.width + 18;
    const cy = this.tapPrompt.position.y + this.tapPrompt.height / 2;
    const r = 9;
    this.countdownRing.clear();
    // Outer ring
    this.countdownRing.circle(cx, cy, r);
    this.countdownRing.stroke({ width: 2, color: 0x3E2723, alpha: 0.55 });
    // Filled sector
    if (p > 0) {
      this.countdownRing.moveTo(cx, cy);
      this.countdownRing.arc(cx, cy, r - 1, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
      this.countdownRing.lineTo(cx, cy);
      this.countdownRing.fill({ color: p >= 1 ? 0x2E8B57 : 0xFFD54F, alpha: 0.95 });
    }
  }

  private ensureBgSprite(): void {
    if (this.bgSprite) return;
    // Check if texture is already in the Assets cache (preloaded in main.ts)
    const tex = Assets.cache.get('assets/ui/dialogue-bubble-bg.png');
    if (tex) {
      this.bgSprite = new Sprite(tex as Texture);
      this.bgSprite.visible = false;
      this.container.addChildAt(this.bgSprite, 0);
    }
  }

  show(line: ActiveLine | { speaker: string; text: string; audioPath?: string }, x: number, y: number): void {
    this.ensureBgSprite();
    this.speakerLabel.text = line.speaker;
    this.label.text = line.text;
    this.setTapPromptReady(false);

    // Derive per-line key from audioPath (e.g. "assets/sounds/dialogue/tutorial__00.wav" → "tutorial__00")
    const key = line.audioPath ? line.audioPath.replace(/^.*\/([^/]+)\.wav$/, '$1') : null;
    this.currentLineKey = key;
    this.updateSkipVisibility();

    this.voice.play(line.audioPath ?? null, () => {
      // Natural completion only — skip-cut doesn't mark played
      if (key && this.gameState) {
        this.gameState.markLinePlayed(key);
        this.updateSkipVisibility();
      }
    });
    this.voice.onReady(() => this.setTapPromptReady(true));

    const padding = 16;
    const contentWidth = Math.max(this.label.width, this.speakerLabel.width, 200);
    const contentHeight = this.speakerLabel.height + this.label.height + this.tapPrompt.height + padding;

    if (this.bgSprite) {
      const innerPad = 24; // extra padding inside the parchment area
      const innerW = contentWidth + innerPad * 2;
      const innerH = contentHeight + innerPad * 2;
      const spriteW = BUBBLE_MARGIN.left + innerW + BUBBLE_MARGIN.right;
      const spriteH = BUBBLE_MARGIN.top + innerH + BUBBLE_MARGIN.bottom;
      this.bgSprite.width = spriteW;
      this.bgSprite.height = spriteH;
      // Offset sprite so the inner parchment aligns with text at (0,0)
      this.bgSprite.position.set(-BUBBLE_MARGIN.left, -BUBBLE_MARGIN.top);
      this.bgSprite.visible = true;
      this.bg.visible = false;

      // Semi-transparent cream backing behind text for readability
      this.textBg.clear();
      this.textBg.roundRect(innerPad - 6, innerPad - 4, contentWidth + 12, contentHeight + 8, 6);
      this.textBg.fill({ color: 0xFFF8DC, alpha: 0.65 });
      this.textBg.visible = true;

      this.speakerLabel.position.set(innerPad, innerPad);
      this.label.position.set(innerPad, innerPad + this.speakerLabel.height + 8);
      this.tapPrompt.position.set(innerPad, innerPad + this.speakerLabel.height + 8 + this.label.height + 8);
      this.skipButton.position.set(innerPad + contentWidth - 18, innerPad + contentHeight - 14);

      // The tail tip in the bubble image is near the bottom-left.
      // Position so the tail points at the speaker, clamped to stay on-screen.
      const tailOffsetX = 0.07 * spriteW;
      const bx = Math.max(10, Math.min(1280 - spriteW - 10, x - tailOffsetX));
      this.container.position.set(bx, y - innerH - 20);
    } else {
      // Graphics fallback
      const bubbleWidth = contentWidth + padding * 2;
      const bubbleHeight = contentHeight + padding * 2;

      this.bg.clear();
      this.bg.roundRect(0, 0, bubbleWidth, bubbleHeight, 12);
      this.bg.fill({ color: 0xFFF8DC });
      this.bg.stroke({ width: 3, color: 0x3E2723 });
      this.bg.visible = true;
      this.textBg.visible = false;

      this.speakerLabel.position.set(padding, padding);
      this.label.position.set(padding, padding + this.speakerLabel.height + 8);
      this.tapPrompt.position.set(padding, padding + this.speakerLabel.height + 8 + this.label.height + 8);
      this.skipButton.position.set(bubbleWidth - padding - 18, bubbleHeight - padding - 14);

      this.container.position.set(x - bubbleWidth / 2, y - bubbleHeight - 20);
    }

    this.tapOverlay.visible = true;
    this.container.visible = true;
  }

  hide(): void {
    this.voice.stop();
    this.container.visible = false;
    this.tapOverlay.visible = false;
    this.countdownRing.clear();
    if (this.bgSprite) this.bgSprite.visible = false;
    this.currentLineKey = null;
  }
}
