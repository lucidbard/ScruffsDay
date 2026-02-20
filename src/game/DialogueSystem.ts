import { Container, Graphics, Text, TextStyle } from 'pixi.js';
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

export class DialogueBubble {
  readonly container = new Container();
  private bg = new Graphics();
  private label = new Text({
    text: '',
    style: new TextStyle({
      fontFamily: 'Arial, sans-serif',
      fontSize: 22,
      fill: '#3E2723',
      wordWrap: true,
      wordWrapWidth: 500,
      lineHeight: 28,
    }),
  });
  private speakerLabel = new Text({
    text: '',
    style: new TextStyle({
      fontFamily: 'Arial, sans-serif',
      fontSize: 18,
      fontWeight: 'bold',
      fill: '#4169E1',
    }),
  });
  private tapPrompt = new Text({
    text: 'tap to continue...',
    style: new TextStyle({
      fontFamily: 'Arial, sans-serif',
      fontSize: 14,
      fill: '#999999',
      fontStyle: 'italic',
    }),
  });

  constructor() {
    this.container.addChild(this.bg, this.speakerLabel, this.label, this.tapPrompt);
    this.container.visible = false;
  }

  show(speaker: string, text: string, x: number, y: number): void {
    this.speakerLabel.text = speaker;
    this.label.text = text;

    const padding = 16;
    const contentWidth = Math.max(this.label.width, this.speakerLabel.width, 200);
    const bubbleWidth = contentWidth + padding * 2;
    const bubbleHeight = this.speakerLabel.height + this.label.height + this.tapPrompt.height + padding * 3;

    this.bg.clear();
    this.bg.roundRect(0, 0, bubbleWidth, bubbleHeight, 12);
    this.bg.fill({ color: 0xFFF8DC });
    this.bg.stroke({ width: 3, color: 0x3E2723 });

    this.speakerLabel.position.set(padding, padding);
    this.label.position.set(padding, padding + this.speakerLabel.height + 8);
    this.tapPrompt.position.set(padding, padding + this.speakerLabel.height + 8 + this.label.height + 8);

    this.container.position.set(x - bubbleWidth / 2, y - bubbleHeight - 20);
    this.container.visible = true;
  }

  hide(): void {
    this.container.visible = false;
  }
}
