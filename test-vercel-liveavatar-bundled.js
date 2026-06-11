const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe',
    args: [
      '--use-fake-ui-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage'
    ]
  });
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
  const logs = [];
  page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text().slice(0, 1000)}`));
  page.on('pageerror', err => logs.push(`[pageerror] ${err.message}`));
  page.on('requestfailed', req => logs.push(`[requestfailed] ${req.url()} ${req.failure()?.errorText}`));
  await page.goto('https://buddyfetch-web.vercel.app/live', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForFunction(() => document.querySelectorAll('#avatarSelect option').length > 0, null, { timeout: 30000 });
  const selectedBefore = await page.evaluate(() => ({
    value: document.querySelector('#avatarSelect')?.value,
    text: document.querySelector('#avatarSelect')?.selectedOptions?.[0]?.textContent,
    status: document.querySelector('#liveStatus')?.textContent,
    optCount: document.querySelectorAll('#avatarSelect option').length,
    elenora: Array.from(document.querySelectorAll('#avatarSelect option')).filter(o => /Elenora Fitness Coach 2|7299/.test(o.textContent + o.value)).map(o => ({value:o.value,text:o.textContent,voice:o.dataset.voiceId}))
  }));
  await page.click('#startLiveBtn');
  await page.waitForTimeout(35000);
  const state = await page.evaluate(() => ({
    status: document.querySelector('#liveStatus')?.textContent,
    log: document.querySelector('#liveLog')?.innerText,
    videoReadyState: document.querySelector('#liveVideo')?.readyState,
    videoPaused: document.querySelector('#liveVideo')?.paused,
    videoWidth: document.querySelector('#liveVideo')?.videoWidth,
    videoHeight: document.querySelector('#liveVideo')?.videoHeight,
  }));
  console.log(JSON.stringify({ selectedBefore, state, logs: logs.slice(-80) }, null, 2));
  await browser.close();
})();


