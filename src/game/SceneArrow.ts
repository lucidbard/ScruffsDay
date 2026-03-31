import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { TweenManager } from './Tween';
import { Easing } from './Tween';
import type { SceneId } from './GameState';

/**
 * Trail sign for scene navigation.
 * Styled as a wooden signpost pointing in the direction of the target scene.
 */
export class SceneArrow {
  readonly container = new Container();
  readonly targetScene: SceneId;

  constructor(
    direction: 'left' | 'right' | 'up' | 'down',
    targetScene: SceneId,
    labelText: string,
    x: number,
    y: number,
    tweens: TweenManager
  ) {
    this.targetScene = targetScene;

    const isHorizontal = direction === 'left' || direction === 'right';

    if (isHorizontal) {
      this.buildHorizontalSign(direction, labelText);
    } else {
      this.buildVerticalSign(direction, labelText);
    }

    this.container.position.set(x, y);
    this.container.eventMode = 'static';
    this.container.cursor = 'pointer';

    // Gentle sway animation
    tweens.add({
      target: this.container as unknown as Record<string, number>,
      props: { rotation: direction === 'left' ? -0.04 : 0.04 },
      duration: 1200,
      yoyo: true,
      loop: true,
      easing: Easing.easeInOut,
    });
  }

  private buildHorizontalSign(direction: 'left' | 'right', labelText: string): void {
    const signW = 160;
    const signH = 40;
    const pointW = 22;
    const isLeft = direction === 'left';

    const sign = new Graphics();

    // Wooden sign plank with pointed end
    if (isLeft) {
      sign.moveTo(pointW, 0);               // top-left after point
      sign.lineTo(signW, 0);                 // top-right
      sign.lineTo(signW, signH);             // bottom-right
      sign.lineTo(pointW, signH);            // bottom-left after point
      sign.lineTo(0, signH / 2);             // arrow point
      sign.closePath();
    } else {
      sign.moveTo(0, 0);                     // top-left
      sign.lineTo(signW - pointW, 0);        // top-right before point
      sign.lineTo(signW, signH / 2);         // arrow point
      sign.lineTo(signW - pointW, signH);    // bottom-right before point
      sign.lineTo(0, signH);                 // bottom-left
      sign.closePath();
    }
    // Wood grain fill
    sign.fill({ color: 0x8B6914 });
    sign.stroke({ width: 3, color: 0x5D4418 });

    // Wood grain lines
    const grainY1 = signH * 0.3;
    const grainY2 = signH * 0.65;
    const grainStart = isLeft ? pointW + 4 : 4;
    const grainEnd = isLeft ? signW - 4 : signW - pointW - 4;
    sign.moveTo(grainStart, grainY1);
    sign.lineTo(grainEnd, grainY1);
    sign.stroke({ width: 1, color: 0x7A5C12, alpha: 0.4 });
    sign.moveTo(grainStart + 10, grainY2);
    sign.lineTo(grainEnd - 5, grainY2);
    sign.stroke({ width: 1, color: 0x7A5C12, alpha: 0.3 });

    // Label text
    const textX = isLeft ? pointW + (signW - pointW) / 2 : (signW - pointW) / 2;
    const label = new Text({
      text: labelText,
      style: new TextStyle({
        fontFamily: "'Patrick Hand', 'Comic Sans MS', cursive",
        fontSize: 18,
        fill: '#FFF8DC',
        fontWeight: 'bold',
        align: 'center',
      }),
    });
    label.anchor.set(0.5, 0.5);
    label.position.set(textX, signH / 2);

    // Center the whole thing
    this.container.addChild(sign, label);
    this.container.pivot.set(signW / 2, signH / 2);
  }

  private buildVerticalSign(direction: 'up' | 'down', labelText: string): void {
    const signW = 150;
    const signH = 38;
    const pointH = 18;
    const isUp = direction === 'up';

    const sign = new Graphics();

    // Wooden plank with pointed top/bottom
    if (isUp) {
      sign.moveTo(0, pointH);                // left after point
      sign.lineTo(signW / 2, 0);             // top point
      sign.lineTo(signW, pointH);            // right after point
      sign.lineTo(signW, signH + pointH);    // bottom-right
      sign.lineTo(0, signH + pointH);        // bottom-left
      sign.closePath();
    } else {
      sign.moveTo(0, 0);                     // top-left
      sign.lineTo(signW, 0);                 // top-right
      sign.lineTo(signW, signH);             // bottom-right before point
      sign.lineTo(signW / 2, signH + pointH); // bottom point
      sign.lineTo(0, signH);                 // bottom-left before point
      sign.closePath();
    }
    sign.fill({ color: 0x8B6914 });
    sign.stroke({ width: 3, color: 0x5D4418 });

    // Wood grain
    const grainY = isUp ? pointH + signH * 0.4 : signH * 0.4;
    sign.moveTo(8, grainY);
    sign.lineTo(signW - 8, grainY);
    sign.stroke({ width: 1, color: 0x7A5C12, alpha: 0.4 });

    // Label
    const textY = isUp ? pointH + signH / 2 : signH / 2;
    const label = new Text({
      text: labelText,
      style: new TextStyle({
        fontFamily: "'Patrick Hand', 'Comic Sans MS', cursive",
        fontSize: 18,
        fill: '#FFF8DC',
        fontWeight: 'bold',
        align: 'center',
      }),
    });
    label.anchor.set(0.5, 0.5);
    label.position.set(signW / 2, textY);

    this.container.addChild(sign, label);
    this.container.pivot.set(signW / 2, (signH + pointH) / 2);
  }
}
