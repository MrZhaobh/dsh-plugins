// Scroll the session list and capture the lower day sections.
// usage: node cdp-scroll-shot.mjs <outDir>
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const outDir = process.argv[2] ?? '.';
const list = await (await fetch('http://127.0.0.1:9333/json/list')).json();
const target = list.find((item) => item.type === 'page');
const ws = new WebSocket(target.webSocketDebuggerUrl);
let nextId = 1;
const pending = new Map();
ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  const entry = pending.get(message.id);
  if (entry === undefined) return;
  pending.delete(message.id);
  message.error === undefined ? entry.resolve(message.result) : entry.reject(new Error(JSON.stringify(message.error)));
});
await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }));
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = nextId++;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const scrolled = await evaluate(`(() => {
  let node = document.querySelector('[role="tree"]');
  while (node !== null && node.scrollHeight <= node.clientHeight) node = node.parentElement;
  if (node === null) return 'no scroll container';
  node.scrollTop = Math.round((node.scrollHeight - node.clientHeight) * 0.62);
  return node.scrollTop;
})()`);
await sleep(700);
const { data } = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(join(outDir, '05-scrolled.png'), Buffer.from(data, 'base64'));
console.log(JSON.stringify({ scrolled }));
ws.close();
