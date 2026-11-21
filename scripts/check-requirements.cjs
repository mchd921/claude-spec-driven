/**
 * 要件とテストの対応チェック（NFR-12, T4.4）。
 *
 * requirements.md の全要件 ID について、テスト名の先頭に付けた要件 ID（例: `REQ-1.9: …`、
 * `REQ-5.3, 5.4: …`、`REQ-3.8〜3.10: …`）を集計し、テストがない要件を一覧にする。
 *
 * 使い方: npm run check:requirements   （テストがなく、手動確認の対象でもない要件があると失敗する）
 *         npm run check:requirements -- --verbose   （全要件の一覧を表示する）
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const REQUIREMENTS = path.join(ROOT, 'specs/workout-tracker/requirements.md');

/**
 * 自動テストの名前に要件 ID を付けず、別の方法で確認する要件。
 * ここに載せた要件は「テストなし」でもエラーにしない。確認方法と結果の場所を必ず書く。
 */
const MANUAL = {
  'NFR-1': '主要 4 ブラウザでの手動確認（tasks.md T4.5）',
  'NFR-2': '幅 360px・実機での手動確認（tasks.md T0.4, T4.5）',
  'NFR-3': 'タップ領域の測定（tasks.md T4.3）。画面ごとの寸法は自動テスト（jsdom）では測れない',
  'NFR-5': '本番ビルドでの計測 scripts/measure-performance.cjs（tasks.md T4.2）',
  'NFR-6': 'Service Worker のオフライン確認（tasks.md T4.1, T4.5）',
  'NFR-8': 'ESLint の no-restricted-globals で fetch 等を禁止（eslint.config.js、npm run lint）',
  'NFR-9': 'Theme mode="system"。OS をダークにして確認（tasks.md T0.3, T3.8, T4.5）',
  'NFR-10': 'Lighthouse / axe-core のアクセシビリティ監査（tasks.md T4.3）',
  'NFR-12': 'このスクリプト自身が確認する（テスト名と要件 ID の対応）',
};

/** requirements.md の表の先頭列から、要件 ID を順に取り出す。 */
function readRequirementIds() {
  const text = fs.readFileSync(REQUIREMENTS, 'utf8');
  const ids = [];
  for (const line of text.split('\n')) {
    const m = /^\|\s*((?:REQ|NFR)-\d+(?:\.\d+)?)\s*\|/.exec(line);
    if (m) ids.push(m[1]);
  }
  return ids;
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.test\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * テスト名の先頭の要件 ID を取り出す。
 *   "REQ-1.9: …" → [REQ-1.9]
 *   "REQ-5.3, 5.4: …" → [REQ-5.3, REQ-5.4]
 *   "REQ-3.8〜3.10: …" → [REQ-3.8, REQ-3.9, REQ-3.10]
 *   "NFR-5: …" → [NFR-5]
 */
function parseTitleIds(title) {
  const head = /^((?:REQ|NFR)-[^:：]*)[:：]/.exec(title);
  if (!head) return [];
  const ids = [];
  let kind = null;
  for (const token of head[1].split(/[,、]/)) {
    const m = /^\s*(?:(REQ|NFR)-)?\s*(\d+)(?:\.(\d+))?\s*(?:〜\s*(?:(\d+)\.)?(\d+))?\s*$/.exec(token);
    if (!m) return ids; // 想定外の書き方はそこで打ち切る（後で「存在しない ID」として検出される）
    if (m[1]) kind = m[1];
    if (!kind) return ids;
    const first = Number(m[2]);
    if (m[3] === undefined) {
      ids.push(`${kind}-${first}`);
      continue;
    }
    const from = Number(m[3]);
    const to = m[5] !== undefined ? Number(m[5]) : from;
    for (let n = from; n <= to; n++) ids.push(`${kind}-${first}.${n}`);
  }
  return ids;
}

/** ソースから it('…') / test('…') のテスト名を取り出す（it.each・it.skip などの形も含む）。 */
function readTestTitles(file) {
  const source = fs.readFileSync(file, 'utf8');
  const titles = [];
  const re = /\b(?:it|test)(?:\.(?:each|skip|only|todo)(?:\([^)]*\))?)?\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;
  let m;
  while ((m = re.exec(source))) titles.push({ title: m[2], skipped: /\.(skip|todo)\(/.test(m[0]) });
  return titles;
}

function main() {
  const verbose = process.argv.includes('--verbose');
  const required = readRequirementIds();
  const known = new Set(required);
  const covered = new Map(); // ID → テストファイルの集合と件数
  const unknownIds = [];
  const skipped = [];

  for (const file of walk(path.join(ROOT, 'src'))) {
    const rel = path.relative(ROOT, file);
    for (const { title, skipped: isSkipped } of readTestTitles(file)) {
      for (const id of parseTitleIds(title)) {
        if (isSkipped) {
          skipped.push(`${rel}: ${title}`);
          continue;
        }
        if (!known.has(id)) {
          unknownIds.push(`${rel}: ${id}（${title.slice(0, 30)}）`);
          continue;
        }
        const entry = covered.get(id) ?? { count: 0, files: new Set() };
        entry.count++;
        entry.files.add(rel);
        covered.set(id, entry);
      }
    }
  }

  const missing = required.filter((id) => !covered.has(id));
  const unexpected = missing.filter((id) => !(id in MANUAL));
  const staleManual = Object.keys(MANUAL).filter((id) => !known.has(id));
  const manualButTested = Object.keys(MANUAL).filter((id) => covered.has(id));

  if (verbose) {
    console.log('要件 ID'.padEnd(10) + 'テスト数'.padStart(8) + '  テストファイル');
    for (const id of required) {
      const c = covered.get(id);
      const note = c ? [...c.files].map((f) => path.basename(f)).join(', ') : id in MANUAL ? `（手動確認）${MANUAL[id]}` : '（テストなし）';
      console.log(id.padEnd(10) + String(c?.count ?? 0).padStart(8) + '  ' + note);
    }
    console.log('');
  }

  const withTests = required.length - missing.length;
  console.log(`要件 ${required.length} 件のうち、テストがあるのは ${withTests} 件（${Math.round((withTests / required.length) * 100)}%）`);
  const manualMissing = missing.filter((id) => id in MANUAL);
  if (manualMissing.length > 0) {
    console.log(`\nテストなし・手動確認の対象（${manualMissing.length} 件）:`);
    for (const id of manualMissing) console.log(`  ${id}: ${MANUAL[id]}`);
  }
  if (manualButTested.length > 0) {
    console.log(`\n（参考）手動確認の対象だが、テスト名にも ID がある: ${manualButTested.join(', ')}`);
  }

  const problems = [];
  if (unexpected.length > 0) problems.push(`テストがなく、手動確認の対象でもない要件: ${unexpected.join(', ')}`);
  if (unknownIds.length > 0) problems.push(`requirements.md にない ID を使っているテスト:\n    ${unknownIds.join('\n    ')}`);
  if (staleManual.length > 0) problems.push(`MANUAL にあるが requirements.md にない ID: ${staleManual.join(', ')}`);
  if (skipped.length > 0) problems.push(`スキップ中のテスト（要件の確認に数えない）:\n    ${skipped.join('\n    ')}`);

  if (problems.length > 0) {
    console.error('\n問題があります:');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log('\nすべての要件が、テストまたは手動確認で対応づけられています。');
}

main();
