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

  console.log('=== TEST 1: Load Layout 1 (layout_bd96c82a) ===');
  await page.goto('http://localhost:3000/project/layout_bd96c82a/edit', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(artifactDir, 'verification_layout_1_initial.png') });
  console.log('Saved verification_layout_1_initial.png');

  console.log('=== TEST 2: Bidirectional Sync (Layers List -> Canvas -> Inspector) ===');
  // 1. Click Living Room in Layers panel
  const clickedLivingRoom = await page.evaluate(() => {
    const el = document.querySelector('[id*="layer-room-living"]') || 
               Array.from(document.querySelectorAll('[id^="layer-room-"]')).find(e => e.innerText.includes('Living Room'));
    if (el) {
      el.click();
      return true;
    }
    return false;
  });
  console.log('Clicked Living Room in layers:', clickedLivingRoom);
  await new Promise(r => setTimeout(r, 1000));

  // Check inspector
  const livingRoomDetails = await page.evaluate(() => {
    const nameInput = document.querySelector('#inspector-room-name');
    const widthInput = document.querySelector('#inspector-exact-width');
    const areaEl = document.querySelector('#inspector-live-area');
    return {
      name: nameInput ? nameInput.value : null,
      width: widthInput ? widthInput.value : null,
      area: areaEl ? areaEl.textContent.trim() : null
    };
  });
  console.log('Inspector after Layers click:', livingRoomDetails);
  await page.screenshot({ path: path.join(artifactDir, 'verification_bidirectional_sync.png') });
  console.log('Saved verification_bidirectional_sync.png');

  console.log('=== TEST 3: Step Resize in Inspector ===');
  // Click +1' Width
  const clickedPlusW = await page.evaluate(() => {
    const btn = document.querySelector('#inspector-step-w-plus');
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  });
  console.log('Clicked +1\' Width:', clickedPlusW);
  await new Promise(r => setTimeout(r, 1000));

  const afterStepDetails = await page.evaluate(() => {
    const widthInput = document.querySelector('#inspector-exact-width');
    const areaEl = document.querySelector('#inspector-live-area');
    return {
      width: widthInput ? widthInput.value : null,
      area: areaEl ? areaEl.textContent.trim() : null
    };
  });
  console.log('Inspector after Step resize:', afterStepDetails);
  await page.screenshot({ path: path.join(artifactDir, 'verification_step_resize.png') });
  console.log('Saved verification_step_resize.png');

  console.log('=== TEST 4: Smart Alignment Guides During Drag ===');
  const roomDragCoords = await page.evaluate(() => {
    const room = document.querySelector('svg g[id^="canvas-room-"]');
    if (room) {
      const rect = room.querySelector('rect');
      if (rect) {
        const b = rect.getBoundingClientRect();
        return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
      }
    }
    return null;
  });

  if (roomDragCoords) {
    console.log('Dragging room at:', roomDragCoords);
    await page.mouse.move(roomDragCoords.x, roomDragCoords.y);
    await page.mouse.down();
    // Move across alignment thresholds
    for (let step = 1; step <= 20; step++) {
      await page.mouse.move(roomDragCoords.x + step * 2, roomDragCoords.y + step * 1);
      await new Promise(r => setTimeout(r, 25));
      const guidesCount = await page.evaluate(() => {
        return document.querySelectorAll('#alignment-guides-layer line').length;
      });
      if (guidesCount > 0) {
        console.log(`Alignment guides active (count: ${guidesCount})!`);
        await page.screenshot({ path: path.join(artifactDir, 'verification_alignment_guides.png') });
        console.log('Saved verification_alignment_guides.png');
        break;
      }
    }
    await page.mouse.up();
  }

  console.log('=== TEST 5: Mobile Viewport & Responsive Drawers ===');
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.goto('http://localhost:3000/project/layout_bd96c82a/edit', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(artifactDir, 'verification_mobile_canvas.png') });
  console.log('Saved verification_mobile_canvas.png');

  // Open Layers on Mobile
  await page.evaluate(() => {
    const btn = document.querySelector('#btn-toggle-layers');
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: path.join(artifactDir, 'verification_mobile_layers.png') });
  console.log('Saved verification_mobile_layers.png');

  // Close Layers and Open Properties on Mobile
  await page.evaluate(() => {
    const btnClose = document.querySelector('#btn-close-layers');
    if (btnClose) btnClose.click();
    const btnProp = document.querySelector('#btn-toggle-properties');
    if (btnProp) btnProp.click();
  });
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: path.join(artifactDir, 'verification_mobile_properties.png') });
  console.log('Saved verification_mobile_properties.png');

  console.log('=== TEST 6: Diversity Testing with Layout 2 (layout_4c8e1ba1) ===');
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto('http://localhost:3000/project/layout_4c8e1ba1/edit', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(artifactDir, 'verification_layout_2.png') });
  console.log('Saved verification_layout_2.png');

  console.log('=== TEST 7: Diversity Testing with Layout 3 (layout_bbaf53f2) ===');
  await page.goto('http://localhost:3000/project/layout_bbaf53f2/edit', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(artifactDir, 'verification_layout_3.png') });
  console.log('Saved verification_layout_3.png');

  await browser.close();
  console.log('=== ALL TESTS COMPLETED SUCCESSFULLY! ===');
}

run().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
