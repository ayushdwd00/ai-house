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

  const artifactDir = path.resolve('C:\\Users\\ASUS\\.gemini\\antigravity-ide\\brain\\085f1adf-33e7-4e7d-88ba-42d060585281');

  await page.goto('http://localhost:3000/project/layout_bd96c82a/edit', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));

  // Click on the Living Room area (around center of SVG canvas)
  console.log('Clicking on canvas at x: 620, y: 520...');
  await page.mouse.click(620, 520);
  await new Promise(r => setTimeout(r, 1000));

  await page.screenshot({ path: path.join(artifactDir, 'audit_edit_selected_room.png') });
  console.log('Saved audit_edit_selected_room.png');

  // Check what HTML elements appeared (e.g. modals, sidebars, panels)
  const elements = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input, select, textarea, [role="dialog"], aside, .sidebar')).map(el => ({
      tag: el.tagName,
      className: el.className,
      value: el.value || el.innerText
    }));
  });
  console.log('Form elements/dialogs after click:', JSON.stringify(elements, null, 2));

  await browser.close();
}

run().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
