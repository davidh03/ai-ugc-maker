export const presets = {
  product: {
    name: 'Product Teaser',
    durationSec: 15,
    html: (brief, durationSec) => `<!DOCTYPE html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: 1920px; height: 1080px; background: #0a0a0a; overflow: hidden; }
  .slide { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; position: absolute; top: 0; left: 0; }
  .text { color: #fff; font-family: system-ui, sans-serif; font-size: 72px; text-align: center; padding: 80px; line-height: 1.2; }
  .tagline { color: #aaa; font-size: 32px; margin-top: 24px; }
</style>
</head>
<body>
  <div class="slide" data-track-index="0" data-start="0" data-duration="${durationSec}">
    <div class="text">
      ${brief}
      <div class="tagline">${brief}</div>
    </div>
  </div>
</body>
</html>`
  },

  explainer: {
    name: 'Explainer',
    durationSec: 30,
    html: (brief, durationSec) => `<!DOCTYPE html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: 1920px; height: 1080px; background: linear-gradient(135deg, #1a1a2e, #16213e); overflow: hidden; }
  .slide { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; position: absolute; top: 0; left: 0; }
  .content { color: #fff; font-family: system-ui, sans-serif; text-align: center; padding: 120px; }
  .title { font-size: 80px; font-weight: bold; margin-bottom: 32px; }
  .body { font-size: 36px; color: #ccc; line-height: 1.6; }
</style>
</head>
<body>
  <div class="slide" data-track-index="0" data-start="0" data-duration="${durationSec}">
    <div class="content">
      <div class="title">${brief}</div>
      <div class="body">${brief}</div>
    </div>
  </div>
</body>
</html>`
  },

  social: {
    name: 'Social Clip',
    durationSec: 15,
    html: (brief, durationSec) => `<!DOCTYPE html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: 1080px; height: 1920px; background: #000; overflow: hidden; }
  .slide { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; position: absolute; top: 0; left: 0; }
  .text { color: #fff; font-family: system-ui, sans-serif; font-size: 64px; text-align: center; padding: 60px; line-height: 1.3; }
</style>
</head>
<body>
  <div class="slide" data-track-index="0" data-start="0" data-duration="${durationSec}">
    <div class="text">${brief}</div>
  </div>
</body>
</html>`
  },
};
