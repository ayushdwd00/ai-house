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

  console.log('Navigating to plan page: http://localhost:3000/project/layout_bd96c82a/plan...');
  await page.goto('http://localhost:3000/project/layout_bd96c82a/plan', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(artifactDir, 'audit_plan_initial.png') });
  console.log('Saved audit_plan_initial.png');

  console.log('Navigating to edit page: http://localhost:3000/project/layout_bd96c82a/edit...');
  await page.goto('http://localhost:3000/project/layout_bd96c82a/edit', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(artifactDir, 'audit_edit_initial.png') });
  console.log('Saved audit_edit_initial.png');

  await browser.close();
}

run().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
