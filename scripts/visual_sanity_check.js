const path = require('path');
const puppeteer = require(path.resolve(__dirname, '../frontend/node_modules/puppeteer-core'));
const fs = require('fs');

async function run() {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  console.log('Navigating to 3D Model: http://localhost:3000/project/layout_bd96c82a/model...');
  await page.goto('http://localhost:3000/project/layout_bd96c82a/model', { waitUntil: 'networkidle2', timeout: 30000 });

  // Give Three.js time to compile shaders and render frames
  await new Promise(r => setTimeout(r, 4000));

  const artifactDir = path.resolve('C:\\Users\\ASUS\\.gemini\\antigravity-ide\\brain\\f08449b3-148b-472e-ad5c-386a58f2ec6c');
  if (!fs.existsSync(artifactDir)) {
    fs.mkdirSync(artifactDir, { recursive: true });
  }

  const screenshotPath = path.join(artifactDir, 'visual_sanity_check_3d.png');
  await page.screenshot({ path: screenshotPath });
  console.log('Saved visual sanity check screenshot to:', screenshotPath);

  // Inspect canvas element and state
  const canvasInfo = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return { error: 'No canvas found' };
    return {
      width: canvas.width,
      height: canvas.height,
      clientWidth: canvas.clientWidth,
      clientHeight: canvas.clientHeight,
    };
  });
  console.log('Canvas Info:', canvasInfo);

  await browser.close();
  console.log('Visual sanity check completed successfully.');
}

run().catch(err => {
  console.error('Error during visual check:', err);
  process.exit(1);
});
