// Drive a headless Edge/Chrome over the DevTools protocol to verify the day-grouped
// session list renders in the throwaway web profile.
// usage: node cdp-verify.mjs <pageUrl> <outDir>
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const pageUrl = process.argv[2];
const outDir = process.argv[3];
mkdirSync(outDir, { recursive: true });

const list = await (await fetch('http://127.0.0.1:9333/json/list')).json();
const target = list.find((item) => item.type === 'page');
if (target === undefined) throw new Error('no page target');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});

let nextId = 1;
const pending = new Map();
ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id !== undefined && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    message.error === undefined ? resolve(message.result) : reject(new Error(JSON.stringify(message.error)));
  }
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = nextId++;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
      if (result.exceptionDetails !== undefined) {
        throw new Error(result.exceptionDetails.text + ' ' + JSON.stringify(result.exceptionDetails.exception?.description ?? ''));
      }
      return result.result.value;
    } catch (error) {
      // Navigation destroys the old execution context; retry that class once.
      const transient = /Execution context|Cannot find context|Inspected target navigated/i.test(error.message);
      if (!transient || attempt > 5) throw error;
      await sleep(400);
    }
  }
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: pageUrl });
await sleep(2000);

const waitFor = async (expression, label, timeoutMs = 45000) => {
  const deadline = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < deadline) {
    try {
      if (await evaluate(`!!(${expression})`)) return true;
    } catch (error) {
      last = error.message;
    }
    await sleep(500);
  }
  throw new Error(`timeout waiting for ${label}${last === '' ? '' : ` (last error: ${last})`}`);
};

// The sidebar session list needs the session catalog to arrive over the Remote transport.
await waitFor(`document.querySelector('[aria-label="视图选项"]')`, 'view options button');
await waitFor(`document.querySelectorAll('[role="treeitem"]').length > 1`, 'session rows');

// A first-run preview notice can sit above the sidebar; dismiss it before clicking.
const dismissed = await evaluate(`(() => {
  const buttons = [...document.querySelectorAll('button')];
  const dismiss = buttons.find((button) => button.textContent.trim() === '继续' || button.textContent.trim() === 'Continue');
  if (dismiss === undefined) return 'no notice';
  dismiss.click();
  return 'dismissed notice';
})()`);
await sleep(800);

const shot = async (name) => {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(outDir, name), Buffer.from(data, 'base64'));
};

await shot('01-workspace-mode.png');

// Open 视图选项 and pick 分组方式 → 按天.
await evaluate(`[...document.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === '视图选项').click()`);
await sleep(800);
await shot('02-menu.png');
const menuVisible = await evaluate(`document.body.textContent.includes('分组方式')`);
const picked = await evaluate(`(() => {
  const candidates = [...document.querySelectorAll('body *')].filter((el) => el.children.length === 0 && el.textContent.trim() === '按天');
  const target = candidates[0];
  if (target === undefined) return 'menu item 按天 not found';
  let clickable = target;
  for (let i = 0; i < 4 && clickable !== null; i += 1) {
    if (clickable.getAttribute('role') === 'menuitem' || clickable.tagName === 'BUTTON') break;
    clickable = clickable.parentElement;
  }
  (clickable ?? target).click();
  return 'clicked';
})()`);
await sleep(1500);
await shot('03-day-mode.png');

const report = await evaluate(`(() => {
  const tree = [...document.querySelectorAll('[role="tree"]')].map((node) => node.textContent.replace(/\\s+/g, ' ').trim());
  const headers = [...document.querySelectorAll('[data-row-key^="day:"]')].map((node) => node.textContent.replace(/\\s+/g, ' ').trim());
  const rows = [...document.querySelectorAll('[data-row-key^="session:"]')].length;
  return { tree, headers, rows };
})()`);

// Collapse the first section to confirm the toggle wiring.
const collapsed = await evaluate(`(() => {
  const header = document.querySelector('[data-row-key^="day:"]');
  if (header === null) return { before: -1 };
  const before = document.querySelectorAll('[data-row-key^="session:"]').length;
  header.click();
  return { before };
})()`);
await sleep(700);
const afterCollapse = await evaluate(`document.querySelectorAll('[data-row-key^="session:"]').length`);
await shot('04-collapsed.png');
const afterExpand = await evaluate(`(() => {
  const header = document.querySelector('[data-row-key^="day:"]');
  if (header === null) return -1;
  header.click();
  return 0;
})()`);
await sleep(700);
const expandedRows = await evaluate(`document.querySelectorAll('[data-row-key^="session:"]').length`);

console.log(JSON.stringify({ dismissed, menuVisible, picked, report, collapsed, afterCollapse, afterExpand, expandedRows }, null, 2));
ws.close();
