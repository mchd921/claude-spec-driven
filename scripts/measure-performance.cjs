/**
 * 性能確認（NFR-5, T4.2）: 500 ワークアウト / 15,000 セットで各画面の表示時間を測る。
 *
 * 使い方（プロジェクトのルートで）:
 *   node scripts/measure-performance.cjs seed      # 開発サーバーを起動し、ダミーデータを IndexedDB に入れる
 *   node scripts/measure-performance.cjs measure   # 本番ビルドを配信し、各画面の表示時間を測る
 *
 * 2 つのコマンドは同じブラウザのプロファイル（.perf-profile/）と同じポートを使うので、
 * seed で入れたデータを measure が読む。CPU を 1 倍と 4 倍（スマホ相当）に絞って測る。
 */
/* global location, indexedDB */
const { chromium } = require('playwright');
const { spawn, execSync } = require('node:child_process');
const path = require('node:path');

const PORT = 5197;
const BASE_URL = `http://localhost:${PORT}/`;
const PROFILE = path.join(__dirname, '..', '.perf-profile');
const LIMIT_MS = 1000;
/** 1 回ごとのばらつきが大きいので、複数回測って中央値を使う。 */
const ROUNDS = 3;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(BASE_URL)).ok) return;
    } catch {
      // まだ起動していない。少し待って再試行する。
    }
    await sleep(500);
  }
  throw new Error('サーバーが起動しません');
}

function startServer(args) {
  const child = spawn('npx', ['vite', ...args, '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
  return () => {
    try {
      process.kill(-child.pid);
    } catch {
      // すでに終了している
    }
  };
}

async function seed() {
  execSync(`rm -rf ${PROFILE}`);
  const stop = startServer([]);
  try {
    await waitForServer();
    const context = await chromium.launchPersistentContext(PROFILE, { viewport: { width: 360, height: 760 } });
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(BASE_URL);
    await page.getByRole('heading', { level: 1, name: 'ホーム' }).waitFor();
    const counts = await page.evaluate(async () => {
      const { generateDummyData } = await import('/src/test/dummyData.ts');
      const { restoreBackup } = await import('/src/services/backupService.ts');
      const { createBackupFile } = await import('/src/domain/backupSchema.ts');
      const { db } = await import('/src/db/index.ts');
      const file = createBackupFile(generateDummyData(), new Date().toISOString());
      const result = await restoreBackup(db, file);
      return result.ok ? result.counts : result;
    });
    console.log('ダミーデータを投入:', JSON.stringify(counts));
    await context.close();
  } finally {
    stop();
  }
}

async function measure() {
  execSync('npm run build', { stdio: 'ignore' });
  const stop = startServer(['preview']);
  try {
    await waitForServer();
    const context = await chromium.launchPersistentContext(PROFILE, { viewport: { width: 360, height: 760 } });
    const page = context.pages()[0] ?? (await context.newPage());
    const cdp = await context.newCDPSession(page);

    const results = [];
    for (const rate of [1, 4]) for (let round = 0; round < ROUNDS; round++) {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate });
      await page.goto(BASE_URL + '#/');
      await page.getByRole('heading', { level: 1, name: 'ホーム' }).waitFor();

      /** 操作（hash の変更など）から、ready が表示されるまでの時間（ms） */
      const time = async (label, action, ready) => {
        const t0 = performance.now();
        await action();
        await ready();
        results.push({ rate, label, ms: Math.round(performance.now() - t0) });
      };
      const go = (hash) => () => page.evaluate((h) => { location.hash = h; }, hash);
      const heading = (name) => () => page.getByRole('heading', { level: 1, name }).waitFor();

      // 最新ワークアウトの ID（記録画面の確認用）
      const latestId = await page.evaluate(() => new Promise((resolve, reject) => {
        const open = indexedDB.open('workout-tracker');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const all = open.result.transaction('workouts').objectStore('workouts').getAll();
          all.onsuccess = () => {
            const sorted = all.result.sort((a, b) => b.date.localeCompare(a.date));
            resolve(sorted[0].id);
          };
        };
      }));

      await time('ホーム', go('#/history'), heading('履歴')); // 一度別の画面へ
      await time('ホーム', go('#/'), () => page.getByRole('button', { name: 'ダミーメニュー 1', exact: false }).first().waitFor());
      await time('履歴一覧（30 件）', go('#/history'), async () => {
        await page.getByRole('link', { name: /のワークアウトを開く/ }).nth(29).waitFor();
      });
      await time('履歴一覧「さらに表示」', () => page.getByRole('button', { name: /さらに表示/ }).click(), async () => {
        await page.getByRole('link', { name: /のワークアウトを開く/ }).nth(59).waitFor();
      });
      await time('履歴カレンダー', () => page.getByRole('radio', { name: 'カレンダー' }).click(), () => page.getByRole('grid').waitFor());
      await time('記録画面（最新のワークアウト）', go(`#/workouts/${latestId}`), () => page.getByRole('button', { name: '種目を追加' }).waitFor());
      await page.evaluate((h) => { location.hash = h; }, '#/progress');
      await heading('グラフ')();
      await time('グラフ（種目の選択リストを開く）', () => page.getByRole('combobox', { name: '種目' }).click(), () =>
        page.getByRole('option', { name: 'ベンチプレス', exact: true }).waitFor(),
      );
      await time('グラフ（種目を選ぶ → 3 グラフ表示）', () => page.getByRole('option', { name: 'ベンチプレス', exact: true }).click(), async () => {
        await page.getByRole('img', { name: /最大重量/ }).waitFor();
        await page.getByRole('img', { name: /ボリューム/ }).waitFor();
      });
      await time('グラフ（期間を全期間に切り替え）', () => page.getByRole('radio', { name: '全期間' }).click(), async () => {
        await page.getByRole('img', { name: /最大重量/ }).waitFor();
        await page.getByRole('img', { name: /ボリューム/ }).waitFor();
      });
      await time('メニュー一覧', go('#/templates'), () => page.getByRole('link', { name: 'ダミーメニュー 1' }).waitFor());
      await time('メニュー編集', () => page.getByRole('link', { name: 'ダミーメニュー 1' }).click(), heading('メニュー編集'));
      await time('設定', go('#/settings'), heading('設定'));
      await time('種目マスタ', go('#/exercises'), heading('種目マスタ'));

      // 設定: JSON エクスポート（全データを読み出してダウンロードさせるまで）
      await page.evaluate((h) => { location.hash = h; }, '#/settings');
      await heading('設定')();
      await time('JSON エクスポート', () => page.getByRole('button', { name: 'JSON エクスポート' }).click(), () => page.waitForEvent('download'));

      // 起動（再読み込み）から表示まで
      await page.goto(BASE_URL + '#/');
      await page.getByRole('heading', { level: 1, name: 'ホーム' }).waitFor();
      await time('起動（再読み込み → ホーム）', () => page.reload(), () => page.getByRole('button', { name: /ダミーメニュー 1/ }).first().waitFor());
      await page.goto(BASE_URL + '#/history');
      await time('起動（再読み込み → 履歴）', () => page.reload(), () => page.getByRole('link', { name: /のワークアウトを開く/ }).nth(29).waitFor());
    }
    await context.close();

    console.log(`\n画面の表示時間（目標: ${LIMIT_MS}ms 以内、${ROUNDS} 回の中央値）\n`);
    const labels = [...new Set(results.map((r) => r.label))];
    console.log('画面'.padEnd(38) + 'CPU×1'.padStart(10) + 'CPU×4'.padStart(10));
    let over = 0;
    for (const label of labels) {
      const cells = [1, 4].map((rate) => {
        const all = results.filter((r) => r.rate === rate && r.label === label).map((r) => r.ms).sort((a, b) => a - b);
        const ms = all[Math.floor(all.length / 2)];
        if (ms > LIMIT_MS) over++;
        return `${ms}${ms > LIMIT_MS ? ' ×' : ''}`.padStart(10);
      });
      console.log(label.padEnd(36) + cells.join(''));
    }
    console.log(over === 0 ? '\nすべて ' + LIMIT_MS + 'ms 以内' : `\n${over} 件が ${LIMIT_MS}ms を超えました（×）`);
  } finally {
    stop();
  }
}

const command = process.argv[2];
(command === 'seed' ? seed() : command === 'measure' ? measure() : Promise.reject(new Error('seed か measure を指定してください')))
  .catch((e) => { console.error(e.message); process.exit(1); });
