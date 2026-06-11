const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: [
      '--use-fake-ui-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-background-networking',
      '--disable-extensions'
    ]
  });
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  const logs = [];
  page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text().slice(0, 700)}`));
  page.on('pageerror', err => logs.push(`[pageerror] ${err.message}`));
  await page.goto('https://buddyfetch-web.vercel.app/live', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => document.querySelectorAll('#avatarSelect option').length > 0, null, { timeout: 20000 });
  const selectedBefore = await page.evaluate(() => ({
    value: document.querySelector('#avatarSelect')?.value,
    text: document.querySelector('#avatarSelect')?.selectedOptions?.[0]?.textContent,
    opts: Array.from(document.querySelectorAll('#avatarSelect option')).map(o => ({value:o.value,text:o.textContent})).filter(o => /Elenora|7299/.test(o.text))
  }));
  await page.click('#startLiveBtn');
  await page.waitForTimeout(25000);
  const state = await page.evaluate(() => ({
    status: document.querySelector('#liveStatus')?.textContent,
    log: document.querySelector('#liveLog')?.innerText,
    videoReadyState: document.querySelector('#liveVideo')?.readyState,
    videoPaused: document.querySelector('#liveVideo')?.paused,
    videoWidth: document.querySelector('#liveVideo')?.videoWidth,
    videoHeight: document.querySelector('#liveVideo')?.videoHeight,
  }));
  console.log(JSON.stringify({ selectedBefore, state, logs: logs.slice(-40) }, null, 2));
  await browser.close();
})();
