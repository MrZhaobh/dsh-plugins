#!/usr/bin/env node
// 把「按天分组」移植到当前安装的 ui-workspace bundle 上。
//
// 背景：这个包原来是「复制上游 bundle + 打 37 处补丁」，而 0.2.2-rc.5 把上游
// 压成了一行，补丁的行上下文全部失效。但 37 处里绝大多数是星标用的（星标已经
// 拆成独立插件了），真正属于「按天分组」的只有 4 处：
//
//   1. 新增 deriveDaySections 等函数（纯新增，不碰上游任何既有逻辑）
//   2. deriveGroups 开头加一个分支：按天模式改走 deriveDaySections
//   3. 视图选项菜单 items 加一项「按天」
//   4. 菜单 onSelect 认得 `day`
//
// 每处替换都断言命中，任何一处找不到就整体失败，绝不产出半成品。
//
// 用法：node scripts/port-day-groups.mjs [--check]
//   输入  upstream/client.orig.js          当前 DSH 安装里抽出来的原始 bundle
//   输出  vendor/ui-workspace/client.js    打过「按天分组」的 bundle
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const upstream = join(root, 'upstream', 'client.orig.js');
const target = join(root, 'vendor', 'ui-workspace', 'client.js');
const checkOnly = process.argv.includes('--check');

if (!existsSync(upstream)) {
  console.error(`missing ${upstream}`);
  process.exit(2);
}

let source = readFileSync(upstream, 'utf8');
const applied = [];

/** 精确替换一次；找不到就报错退出，避免产出半成品。 */
function replaceOnce(label, from, to) {
  const index = source.indexOf(from);
  if (index === -1) {
    console.error(`\n[FAIL] ${label}: anchor not found in the upstream bundle.`);
    console.error('       上游又变了，需要重新定位这一处。未写出任何文件。');
    process.exit(3);
  }
  if (source.indexOf(from, index + 1) !== -1) {
    console.error(`\n[FAIL] ${label}: anchor matched more than once, refusing to guess.`);
    process.exit(3);
  }
  source = source.slice(0, index) + to + source.slice(index + from.length);
  applied.push(label);
}

// ---------------------------------------------------------------------------
// 1) 新增函数：插在 deriveGroups 定义之前
// ---------------------------------------------------------------------------
const ANCHOR_DERIVE_GROUPS = 'function deriveGroups(list,workspaces,rowState,statuses,view){';

const NEW_FUNCTIONS = `
//#region day-groups （由 port-day-groups.mjs 生成，勿手改）
/** 从持久化的视图状态里读当前分组方式。读不到就当作未启用，不影响其它分组。 */
function __dayGroupBy(){
	try{
		const raw=window.localStorage.getItem(\`dsh.workspace.view.v5\`);
		if(raw===null)return void 0;
		const parsed=JSON.parse(raw);
		const value=parsed.groupBy??parsed.state?.groupBy??parsed.value?.groupBy;
		return typeof value===\`string\`?value:void 0;
	}catch{return void 0}
}
/** 一天的稳定键；时间戳无效时落到 unknown。 */
function __dayKey(at){
	if(typeof at!==\`number\`||!Number.isFinite(at))return \`unknown\`;
	const d=new Date(at);
	if(Number.isNaN(d.getTime()))return \`unknown\`;
	return \`\${d.getFullYear()}-\${String(d.getMonth()+1).padStart(2,\`0\`)}-\${String(d.getDate()).padStart(2,\`0\`)}\`;
}
/** 今天 / 昨天 / 具体日期。 */
function __dayLabel(at,now){
	if(typeof at!==\`number\`||!Number.isFinite(at))return \`更早\`;
	const d=new Date(at);
	if(Number.isNaN(d.getTime()))return \`更早\`;
	const today=new Date(now);
	const sameDay=(a,b)=>a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();
	if(sameDay(d,today))return \`今天\`;
	const yesterday=new Date(now);
	yesterday.setDate(yesterday.getDate()-1);
	if(sameDay(d,yesterday))return \`昨天\`;
	if(d.getFullYear()===today.getFullYear())return \`\${d.getMonth()+1}月\${d.getDate()}日\`;
	return \`\${d.getFullYear()}年\${d.getMonth()+1}月\${d.getDate()}日\`;
}
/**
 * 按天分段。返回结构与 deriveGroups 完全一致，所以下游的展开、水位线、
 * 当前会话定位等逻辑都不用改。
 *
 * 展开状态不能用上游算好的 expandedGroups：那个数组只由工作区 id 和空串组成，
 * 永远不含 day: 开头的 key，用了就会每段都折叠、一行都不渲染。这里改用原始
 * 的 groupExpansion 映射，语义是「没被显式折叠过就展开」。
 */
function deriveDaySections(list,rowState,statuses,view){
	const archived=new Set(rowState.archivedSessionIds);
	const pinned=new Set(rowState.pinnedSessionIds);
	const expansion=view.dayExpansion??{};
	const current=mainSessionId(list);
	const now=Date.now();
	const isPinned=s=>!s.blank&&pinned.has(s.id)&&!archived.has(s.id);
	const visible=[];
	for(const id of list.ids){
		const summary=list.byId[id];
		if(summary===void 0)continue;
		if(!sessionVisible(summary,current,archived,rowState.archivedFilter))continue;
		visible.push(summary);
	}
	const pinnedMembers=visible.filter(isPinned);
	const restMembers=visible.filter(s=>!isPinned(s));
	const buckets=[];
	for(const s of restMembers){
		const key=\`day:\${__dayKey(s.updatedAt)}\`;
		const last=buckets[buckets.length-1];
		if(last!==void 0&&last.key===key)last.members.push(s);
		else buckets.push({key,members:[s],at:s.updatedAt});
	}
	buckets.sort((left,right)=>((right.at??0)-(left.at??0)));
	const sections=[];
	const push=(key,label,members,containsCurrent)=>{
		const expanded=expansion[key]!==false;
		sections.push({
			key,
			workspaceId:void 0,
			cwd:void 0,
			createdAt:0,
			label,
			sessionCount:members.length,
			expanded,
			containsCurrent,
			sessions:expanded?sectionMembers(members,pinned,archived).map(member=>sessionNode(member,list,statuses,pinned,archived)):[]
		});
	};
	if(pinnedMembers.length>0)push(\`day:pinned\`,\`置顶\`,pinnedMembers,false);
	for(const bucket of buckets)push(bucket.key,__dayLabel(bucket.at,now),bucket.members,bucket.members.some(s=>s.id===current));
	return sections;
}
//#endregion day-groups
`;

replaceOnce('插入 day-groups 函数', ANCHOR_DERIVE_GROUPS, `${NEW_FUNCTIONS}\n${ANCHOR_DERIVE_GROUPS}`);

// ---------------------------------------------------------------------------
// 2) deriveGroups 开头分支到按天
// ---------------------------------------------------------------------------
replaceOnce(
  'deriveGroups 分支',
  'function deriveGroups(list,workspaces,rowState,statuses,view){const archived=new Set(rowState.archivedSessionIds);',
  'function deriveGroups(list,workspaces,rowState,statuses,view){if(__dayGroupBy()===`day`)return deriveDaySections(list,rowState,statuses,view);const archived=new Set(rowState.archivedSessionIds);',
);

// ---------------------------------------------------------------------------
// 3) 菜单加一项「按天」（放在「单列表」之后）
// ---------------------------------------------------------------------------
replaceOnce(
  '菜单项',
  '{id:`flat`,label:t(`groupBy.flat`),icon:(0,react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFlatListOutlineRegular,{})},',
  '{id:`flat`,label:t(`groupBy.flat`),icon:(0,react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFlatListOutlineRegular,{})},{id:`day`,label:t(`groupBy.day`),icon:(0,react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconClockOutlineRegular,{})},',
);

// ---------------------------------------------------------------------------
// 4) onSelect 认得 day
// ---------------------------------------------------------------------------
replaceOnce(
  '菜单 onSelect',
  'if(id===`workspace`||id===`workspace-tree`||id===`flat`)onGroupPick(id);',
  'if(id===`workspace`||id===`workspace-tree`||id===`flat`||id===`day`)onGroupPick(id);',
);

// ---------------------------------------------------------------------------
// 5) 语言字典：groupBy.day
// ---------------------------------------------------------------------------
replaceOnce(
  'zh 字典',
  '"groupBy.flat":`单列表`,',
  '"groupBy.flat":`单列表`,"groupBy.day":`按天`,',
);
replaceOnce(
  'en 字典',
  '"groupBy.flat":`In one list`,',
  '"groupBy.flat":`In one list`,"groupBy.day":`By day`,',
);

// ---------------------------------------------------------------------------
// 6) 组标题优先用 label
//
// 上游写的是 `row.workspaceId === void 0 ? t('group.ungrouped') : row.label`，
// 也就是「没有 workspaceId 就当未分组」，直接忽略 label。按天分组的分段本来
// 就不属于任何工作区（workspaceId 为 undefined），所以标题会被吞成「未分组」。
//
// 改成 `row.label ?? t('group.ungrouped')`：内建的未分组组 label 本来就是
// undefined，行为不变；有 label 的组（内建工作区组、按天分段）都显示自己的标题。
// workspaceId 仍保持 undefined，于是这些分段不会挂上工作区的右键菜单和拖拽。
// ---------------------------------------------------------------------------
replaceOnce(
  '组标题取 label',
  'const label=row.workspaceId===void 0?t(`group.ungrouped`):row.label;',
  'const label=row.label??t(`group.ungrouped`);',
);

// ---------------------------------------------------------------------------
// 7) 把原始 groupExpansion 传进 view
//
// 上游算出的 expandedGroups 只含工作区 id 和空串（见上面的 useMemo），按天分段
// 永远查不到自己，会全部折叠。把未经过滤的 groupExpansion 一起传下去，
// 让日期段按「没被显式折叠过就展开」判断。
// ---------------------------------------------------------------------------
replaceOnce(
  '调用点传 groupExpansion',
  'deriveGroups(list,workspaces,rowState,statuses,{expandedGroups,ungroupedOrder:ungroupedSessionIds}),[list,workspaces,rowState,statuses,expandedGroups,ungroupedSessionIds]);',
  'deriveGroups(list,workspaces,rowState,statuses,{expandedGroups,ungroupedOrder:ungroupedSessionIds,dayExpansion:groupExpansion}),[list,workspaces,rowState,statuses,expandedGroups,ungroupedSessionIds,groupExpansion]);',
);

// ---------------------------------------------------------------------------
if (checkOnly) {
  const current = readFileSync(target, 'utf8');
  const same = current === source;
  console.log(same ? '按天分组补丁已是最新' : '按天分组补丁与上游派生结果不一致（需要重跑）');
  for (const label of applied) console.log(`  ✓ ${label}`);
  process.exit(same ? 0 : 1);
}

writeFileSync(target, source);
console.log(`已写出 ${target}`);
for (const label of applied) console.log(`  ✓ ${label}`);
