import { Application } from 'pixi.js';

const GAME_WIDTH = 1280;
const GAME_HEIGHT = 720;

async function init() {
  const app = new Application();
  await app.init({
    background: '#87CEEB',
    resizeTo: window,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });
  document.body.appendChild(app.canvas);

  // Scale game to fit viewport while maintaining aspect ratio
  function resize() {
    const scale = Math.min(
      window.innerWidth / GAME_WIDTH,
      window.innerHeight / GAME_HEIGHT
    );
    app.stage.scale.set(scale);
    app.stage.position.set(
      (window.innerWidth - GAME_WIDTH * scale) / 2,
      (window.innerHeight - GAME_HEIGHT * scale) / 2
    );
  }
  window.addEventListener('resize', resize);
  resize();
}

init();
