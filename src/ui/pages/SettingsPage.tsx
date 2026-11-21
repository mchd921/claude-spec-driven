import { AlertDialog } from '@astryxdesign/core/AlertDialog';
import { Button } from '@astryxdesign/core/Button';
import { Heading } from '@astryxdesign/core/Heading';
import { Link } from '@astryxdesign/core/Link';
import { Text } from '@astryxdesign/core/Text';
import { useToast } from '@astryxdesign/core/Toast';
import { useRef, useState } from 'react';
import { useDatabase } from '../../app/DatabaseContext';
import { useReportSaveError } from '../../app/useReportSaveError';
import { parseBackupText, type BackupFile } from '../../domain/backupSchema';
import { defaultDeps } from '../../services/deps';
import {
  backupFileName,
  csvFileName,
  exportBackup,
  exportSetsCsv,
  restoreBackup,
  serializeBackup,
} from '../../services/backupService';
import { CSV_BOM } from '../../domain/csv';
import { downloadTextFile } from '../download';
import './SettingsPage.css';

/** 設定画面（データ管理）。バックアップの書き出し・読み込みと CSV の書き出し（REQ-5.1〜5.7）。 */
export function SettingsPage() {
  const db = useDatabase();
  const toast = useToast();
  const reportSaveError = useReportSaveError();
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<BackupFile | null>(null);

  const guard = async (work: () => Promise<void>) => {
    try {
      await work();
    } catch (e) {
      reportSaveError(e);
    }
  };

  const exportJson = () =>
    guard(async () => {
      const file = await exportBackup(db);
      downloadTextFile(backupFileName(defaultDeps.today()), serializeBackup(file), 'application/json');
    });

  const exportCsv = () =>
    guard(async () => {
      const csv = await exportSetsCsv(db);
      // Excel で文字化けしないよう、UTF-8 の BOM を付ける。
      const text = csv.startsWith(CSV_BOM) ? csv : CSV_BOM + csv;
      downloadTextFile(csvFileName(defaultDeps.today()), text, 'text/csv;charset=utf-8');
    });

  /** ファイルを検証する。不正なら確認を出さずにエラーを表示する（REQ-5.5）。 */
  const onFileChosen = async (file: File | undefined) => {
    setError(null);
    if (!file) return;
    const text = await file.text();
    const parsed = parseBackupText(text);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setPending(parsed.value);
  };

  const confirmImport = async () => {
    const backup = pending;
    setPending(null);
    if (!backup) return;
    await guard(async () => {
      const result = await restoreBackup(db, backup);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast({ body: `インポートしました（ワークアウト ${result.counts.workouts} 件、セット ${result.counts.sets} 件）` });
    });
  };

  return (
    <>
      <Heading level={1}>設定</Heading>

      <section aria-labelledby="settings-backup" className="settings-section">
        <Heading level={2} id="settings-backup">バックアップ</Heading>
        <Text type="supporting">
          データはこの端末のブラウザにだけ保存されています。定期的にエクスポートして、別の場所にも保管してください。
        </Text>
        <div className="settings-actions">
          <Button label="JSON エクスポート" onClick={() => void exportJson()} />
          <Button label="JSON インポート" onClick={() => fileInput.current?.click()} />
          <Button label="CSV エクスポート" onClick={() => void exportCsv()} />
        </div>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          aria-label="バックアップファイルを選択"
          className="settings-file-input"
          onChange={(event) => {
            const input = event.currentTarget;
            void onFileChosen(input.files?.[0]).finally(() => {
              input.value = '';
            });
          }}
        />
        {error && (
          <Text role="alert" type="supporting">
            {error}
          </Text>
        )}
      </section>

      <section aria-labelledby="settings-master" className="settings-section">
        <Heading level={2} id="settings-master">種目</Heading>
        <Link href="/exercises">種目マスタ</Link>
      </section>

      <AlertDialog
        isOpen={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title="データを置き換えますか？"
        description={
          pending
            ? `ファイルの内容（ワークアウト ${pending.data.workouts.length} 件、セット ${pending.data.sets.length} 件）で、この端末の既存の全データを置き換えます。元に戻せません。`
            : ''
        }
        actionLabel="置き換える"
        cancelLabel="キャンセル"
        onAction={() => void confirmImport()}
      />
    </>
  );
}
