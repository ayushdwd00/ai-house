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

  console.log('1. Navigating to edit page...');
  await page.goto('http://localhost:3000/project/layout_bd96c82a/edit', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));

  // Find and click "Primary Suite" or "Living Room" in the left layers list
  console.log('2. Clicking "Primary Suite" in left layers panel...');
  const layersClicked = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('div'));
    const suiteItem = items.find(el => el.textContent && el.textContent.includes('Primary Suite') && el.textContent.includes('sf'));
    if (suiteItem) {
      suiteItem.click();
      return true;
    }
    return false;
  });
  console.log('Layers clicked:', layersClicked);
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(artifactDir, 'audit_edit_selected_room.png') });
  console.log('Saved audit_edit_selected_room.png');

  // Verify Inspector shows room details
  const inspectorDetails = await page.evaluate(() => {
    const input = document.querySelector('input[value*="Primary Suite"]');
    const widthInput = document.querySelector('input[placeholder*="12\'-0"]');
    const areaText = document.body.innerText.includes('SQ FT');
    return { hasRoomInput: !!input, hasWidthInput: !!widthInput, hasArea: areaText };
  });
  console.log('Inspector details:', inspectorDetails);

  // Test Step Resize "+1' Width"
  console.log('3. Clicking "+1\' Width" in Inspector...');
  const clickedStep = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => b.textContent && b.textContent.includes("+1' Width"));
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  });
  console.log('Clicked step resize:', clickedStep);
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(artifactDir, 'audit_edit_stepped_dim.png') });
  console.log('Saved audit_edit_stepped_dim.png');

  // Test drag with alignment guides
  console.log('4. Testing drag with smart alignment guides...');
  // Find a room element on the SVG
  const roomRect = await page.evaluate(() => {
    // find a room group with rect
    const roomGroups = document.querySelectorAll('svg g[transform^="translate"]');
    for (const g of roomGroups) {
      const rect = g.querySelector('rect');
      if (rect && parseFloat(rect.getAttribute('width')) > 80 && parseFloat(rect.getAttribute('height')) > 80) {
        const b = rect.getBoundingClientRect();
        if (b.width > 20 && b.height > 20 && b.x > 300) {
          return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
        }
      }
    }
    return null;
  });

  if (roomRect) {
    console.log('Found room center at:', roomRect);
    await page.mouse.move(roomRect.x, roomRect.y);
    await page.mouse.down();
    // Drag slowly across several steps to cross alignment threshold
    for (let i = 1; i <= 25; i++) {
      await page.mouse.move(roomRect.x + i * 2, roomRect.y + i * 1);
      await new Promise(r => setTimeout(r, 20));
      // Check if alignment guides are visible
      const guidesCount = await page.evaluate(() => {
        const guides = document.querySelectorAll('#alignment-guides-layer line');
        return guides.length;
      });
      if (guidesCount > 0) {
        console.log(`Alignment guides detected at step ${i}! Count: ${guidesCount}`);
        await page.screenshot({ path: path.join(artifactDir, 'audit_edit_drag_guides.png') });
        console.log('Saved audit_edit_drag_guides.png');
        break;
      }
    }
    await page.mouse.up();
  } else {
    console.log('Could not find room bounding rect for drag test');
  }

  // Test zoom controls
  console.log('5. Testing Zoom In / Zoom Out / Fit...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const zoomInBtn = buttons.find(b => b.title && b.title.includes('Zoom In'));
    if (zoomInBtn) zoomInBtn.click();
  });
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: path.join(artifactDir, 'audit_edit_zoomed.png') });
  console.log('Saved audit_edit_zoomed.png');

  // Test mobile viewport
  console.log('6. Testing mobile viewport (390x844)...');
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.goto('http://localhost:3000/project/layout_bd96c82a/edit', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(artifactDir, 'audit_edit_mobile.png') });
  console.log('Saved audit_edit_mobile.png');

  await browser.close();
  console.log('Interaction testing complete!');
}

run().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
