import { Assets, Container, Graphics, Sprite, Text, Texture, TextStyle } from 'pixi.js';
import type { TweenManager } from './Tween';
import { Easing } from './Tween';

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
}

export class DialogueRunner {
  private data: DialogueData;
  private checkFlag: (flag: string) => boolean;
  private currentNode: DialogueNode | null = null;
  private lineIndex = 0;
  private active = false;

  constructor(data: DialogueData, checkFlag: (flag: string) => boolean) {
    this.data = data;
    this.checkFlag = checkFlag;
  }

  start(nodeId: string): ActiveLine | null {
    const node = this.data[nodeId];
    if (!node) return null;
    this.currentNode = node;
    this.lineIndex = 0;
    this.active = true;
    return this.getCurrentLine();
  }

  next(): ActiveLine | null {
    if (!this.currentNode) return null;
    this.lineIndex++;
    const line = this.getCurrentLine();
    if (!line) {
      this.active = false;
      this.currentNode = null;
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
    if (!this.currentNode) return null;
    while (this.lineIndex < this.currentNode.lines.length) {
      const line = this.currentNode.lines[this.lineIndex];
      if (line.condition === null || this.checkFlag(line.condition)) {
        return { speaker: this.currentNode.speaker, text: line.text };
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
      fontFamily: "'Patrick Hand', 'Comic Sans MS', cursive",
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
      fontFamily: "'Patrick Hand', 'Comic Sans MS', cursive",
      fontSize: 20,
      fontWeight: 'bold',
      fill: '#1a5276',
    }),
  });
  private tapPrompt = new Text({
    text: 'tap to continue...',
    style: new TextStyle({
      fontFamily: "'Patrick Hand', 'Comic Sans MS', cursive",
      fontSize: 15,
      fill: '#5D4037',
      fontStyle: 'italic',
    }),
  });

  constructor() {
    this.container.addChild(this.bg, this.textBg, this.speakerLabel, this.label, this.tapPrompt);
    this.container.visible = false;
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

  show(speaker: string, text: string, x: number, y: number): void {
    this.ensureBgSprite();
    this.speakerLabel.text = speaker;
    this.label.text = text;

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

      this.container.position.set(x - bubbleWidth / 2, y - bubbleHeight - 20);
    }

    this.container.visible = true;
  }

  hide(): void {
    this.container.visible = false;
    if (this.bgSprite) this.bgSprite.visible = false;
  }
}
