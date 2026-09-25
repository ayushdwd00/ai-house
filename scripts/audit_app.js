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

  console.log('Navigating to http://localhost:3000...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });

  const artifactDir = path.resolve('C:\\Users\\ASUS\\.gemini\\antigravity-ide\\brain\\085f1adf-33e7-4e7d-88ba-42d060585281');
  if (!fs.existsSync(artifactDir)) {
    fs.mkdirSync(artifactDir, { recursive: true });
  }

  const screenshotPath = path.join(artifactDir, 'initial_home_screen.png');
  await page.screenshot({ path: screenshotPath });
  console.log('Saved screenshot to:', screenshotPath);

  // Check page title and buttons
  const title = await page.title();
  console.log('Page title:', title);

  const buttons = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button, a')).map(el => ({
      text: el.innerText.trim(),
      href: el.getAttribute('href'),
      tag: el.tagName
    })).filter(b => b.text.length > 0);
  });
  console.log('Found buttons/links:', JSON.stringify(buttons.slice(0, 15), null, 2));

  await browser.close();
}

run().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
