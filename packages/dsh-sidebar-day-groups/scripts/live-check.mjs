// Confirm the running Host is serving this fork: read the live module graph, touch
// the bundle, and watch for a revision change on the ui-workspace row.
import { statSync, utimesSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const bundle = resolve(here, '..', 'vendor', 'ui-workspace', 'client.js');
// usage: node scripts/live-check.mjs [webUrl]
const SSE = new URL('/plugins/events', process.argv[2] ?? 'http://127.0.0.1:51322').href;

const readGraph = async () => {
  const controller = new AbortController();
  const response = await fetch(SSE, { signal: controller.signal });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const deadline = Date.now() + 4000;
  let graph;
  while (Date.now() < deadline && graph === undefined) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    for (const line of buffer.split('\n')) {
      if (!line.startsWith('data: ')) continue;
      const payload = JSON.parse(line.slice(6));
      if (payload.type === 'graph') graph = payload.graph;
    }
  }
  controller.abort();
  return graph ?? { entries: [] };
};

const rowOf = (graph) => graph.entries.find((entry) => entry.id === '@deepseek-ai/dsh-client-ui-workspace');

const before = rowOf(await readGraph());
console.log('before:', JSON.stringify(before));

const stat = statSync(bundle);
utimesSync(bundle, stat.atime, new Date(Date.now() + 1000));
console.log('touched bundle at', new Date(Date.now() + 1000).toISOString());

await new Promise((resolveWait) => setTimeout(resolveWait, 3500));
const after = rowOf(await readGraph());
console.log('after: ', JSON.stringify(after));
console.log(before?.rev !== after?.rev ? 'REV CHANGED — the Host watches this fork' : 'rev unchanged');
