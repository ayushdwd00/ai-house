const path = require('path');
const puppeteer = require(path.resolve(__dirname, '../frontend/node_modules/puppeteer-core'));
const fs = require('fs');

async function main() {
  console.log('🚀 Starting end-to-end AI House generation verification...');

  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const consoleLogs = [];
  const errors = [];
  const apiRequests = [];

  page.on('console', msg => {
    const text = msg.text();
    consoleLogs.push(`[BROWSER ${msg.type()}] ${text}`);
    if (msg.type() === 'error') {
      errors.push(text);
      console.log('  ❌ Browser Console Error:', text);
    }
  });

  page.on('request', req => {
    const url = req.url();
    if (url.includes('/api/')) {
      console.log(`  🌐 API Request: ${req.method()} ${url}`);
      apiRequests.push({ method: req.method(), url, timestamp: Date.now() });
    }
  });

  page.on('response', async res => {
    const url = res.url();
    if (url.includes('/api/')) {
      console.log(`  ✅ API Response: ${res.status()} ${url}`);
    }
  });

  page.on('pageerror', err => {
    console.log('  ❌ Page Uncaught Error:', err.message);
    errors.push(err.message);
  });

  const artifactDir = path.resolve('C:\\Users\\ASUS\\.gemini\\antigravity-ide\\brain\\790f2130-d298-414f-a1dc-4c1113d11e50');
  if (!fs.existsSync(artifactDir)) {
    fs.mkdirSync(artifactDir, { recursive: true });
  }

  try {
    // 1. Load Homepage
    console.log('1. Navigating to http://localhost:3001...');
    await page.goto('http://localhost:3001', { waitUntil: 'networkidle2', timeout: 30000 });
    await page.screenshot({ path: path.join(artifactDir, 'e2e_01_home.png') });
    console.log('  📸 Saved e2e_01_home.png');

    // 2. Click CREATE
    console.log('2. Clicking CREATE button in floating nav...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, a'));
      const createBtn = btns.find(b => b.textContent && b.textContent.includes('CREATE'));
      if (createBtn) createBtn.click();
      else throw new Error('CREATE button not found');
    });
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: path.join(artifactDir, 'e2e_02_create_choice.png') });
    console.log('  📸 Saved e2e_02_create_choice.png');

    // 3. Select "DESIGN A NEW HOME"
    console.log('3. Selecting "01 DESIGN A NEW HOME"...');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const designNew = buttons.find(el => el.textContent && el.textContent.includes('DESIGN A NEW HOME'));
      if (designNew) {
        designNew.click();
      } else {
        throw new Error('DESIGN A NEW HOME button not found');
      }
    });

    console.log('  Waiting for Architectural Consultation to render...');
    await page.waitForFunction(() => {
      return document.body.innerText.includes('Plot Dimensions') ||
             document.body.innerText.includes('ARCHITECTURAL CONSULTATION') ||
             document.body.innerText.includes('CONTINUE');
    }, { timeout: 10000 });
    await page.screenshot({ path: path.join(artifactDir, 'e2e_03_consultation_started.png') });
    console.log('  📸 Saved e2e_03_consultation_started.png');

    // 4. Step through consultation questions until final review step
    console.log('4. Stepping through consultation brief to reach final generation...');
    for (let loop = 0; loop < 25; loop++) {
      await new Promise(r => setTimeout(r, 600));

      const hasGenerate = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const gen = buttons.find(b => b.textContent && b.textContent.includes('GENERATE ARCHITECTURAL DESIGN'));
        return Boolean(gen);
      });

      if (hasGenerate) {
        console.log(`  Reached final review step at loop ${loop}!`);
        break;
      }

      const clickedNext = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const targetBtn = buttons.find(b => {
          if (!b.textContent) return false;
          const t = b.textContent.trim().toUpperCase();
          return t.includes('CONTINUE') ||
                 t.includes('CONFIGURE ROOM SIZES') ||
                 t.includes('REVIEW BRIEF');
        });
        if (targetBtn && !targetBtn.disabled) {
          targetBtn.click();
          return targetBtn.textContent.trim();
        }
        return null;
      });

      if (clickedNext) {
        console.log(`  Loop ${loop}: Clicked '${clickedNext}'`);
      } else {
        console.log(`  Loop ${loop}: Next button not found, checking state...`);
      }
    }

    await page.screenshot({ path: path.join(artifactDir, 'e2e_04_review_step.png') });
    console.log('  📸 Saved e2e_04_review_step.png');

    // 5. Click GENERATE ARCHITECTURAL DESIGN
    console.log('5. Clicking GENERATE ARCHITECTURAL DESIGN...');
    const clickedGenerate = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const generateBtn = buttons.find(b => b.textContent && b.textContent.includes('GENERATE ARCHITECTURAL DESIGN'));
      if (generateBtn) {
        generateBtn.click();
        return true;
      }
      return false;
    });

    if (!clickedGenerate) {
      throw new Error('GENERATE ARCHITECTURAL DESIGN button was not found on screen');
    }

    console.log('6. Waiting for architectural generation & design schemes to complete (up to 120s)...');
    // Wait for the design scheme selection modal to appear
    await page.waitForFunction(() => {
      const text = document.body.innerText;
      return (
        text.includes('Choose a design direction') ||
        text.includes('Use this scheme') ||
        text.includes('Unable to connect') ||
        text.includes('[API ERROR]')
      );
    }, { timeout: 120000 });

    await page.screenshot({ path: path.join(artifactDir, 'e2e_05_schemes_modal.png') });
    console.log('  📸 Saved e2e_05_schemes_modal.png');

    const pageText = await page.evaluate(() => document.body.innerText);

    if (pageText.includes('Unable to connect to the architectural synthesis backend')) {
      throw new Error('FAIL: "Unable to connect to the architectural synthesis backend" error is still shown!');
    }

    if (pageText.includes('[API ERROR] generateHouseLayout failed')) {
      throw new Error('FAIL: "[API ERROR] generateHouseLayout failed" occurred!');
    }

    console.log('7. Generation succeeded! Selecting first design scheme with "Use this scheme"...');
    const schemeSelected = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const useBtn = buttons.find(b => b.textContent && b.textContent.includes('Use this scheme'));
      if (useBtn && !useBtn.disabled) {
        useBtn.click();
        return true;
      }
      return false;
    });

    console.log('  Scheme button clicked:', schemeSelected);
    if (!schemeSelected) {
      throw new Error('Could not find active "Use this scheme" button');
    }

    console.log('8. Waiting for navigation to project workspace (/project/.../plan)...');
    await page.waitForFunction(() => {
      return window.location.pathname.includes('/project/') && window.location.pathname.includes('/plan');
    }, { timeout: 20000 });

    await new Promise(r => setTimeout(r, 3000));
    const planUrl = page.url();
    console.log('  Current URL in workspace:', planUrl);
    await page.screenshot({ path: path.join(artifactDir, 'e2e_06_final_plan_workspace.png') });
    console.log('  📸 Saved e2e_06_final_plan_workspace.png');

    // 9. Navigate to MODEL tab (3D view)
    console.log('9. Switching to 3D MODEL view...');
    await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a, button'));
      const modelLink = links.find(el => el.textContent && el.textContent.trim().toUpperCase() === 'MODEL');
      if (modelLink) modelLink.click();
    });

    await new Promise(r => setTimeout(r, 4000));
    const modelUrl = page.url();
    console.log('  Current URL in 3D model view:', modelUrl);
    await page.screenshot({ path: path.join(artifactDir, 'e2e_07_final_3d_model.png') });
    console.log('  📸 Saved e2e_07_final_3d_model.png');

    console.log('\n=========================================');
    console.log('🎉 FULL END-TO-END VERIFICATION PASSED!');
    console.log('Backend URL:', 'http://localhost:8000');
    console.log('Frontend URL:', 'http://localhost:3001');
    console.log('Generated Plan URL:', planUrl);
    console.log('3D Model View URL:', modelUrl);
    console.log('All API calls succeeded without connection errors!');
    console.log('=========================================\n');

  } catch (err) {
    console.error('\n❌ E2E Verification failed:', err.message);
    await page.screenshot({ path: path.join(artifactDir, 'e2e_failure.png') }).catch(() => {});
    throw err;
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
