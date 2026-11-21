import { AlertDialog } from '@astryxdesign/core/AlertDialog';
import { Button } from '@astryxdesign/core/Button';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Heading } from '@astryxdesign/core/Heading';
import { Link } from '@astryxdesign/core/Link';
import { Text } from '@astryxdesign/core/Text';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useDatabase } from '../../app/DatabaseContext';
import { useReportSaveError } from '../../app/useReportSaveError';
import type { Template } from '../../domain/types';
import { deleteTemplate } from '../../services/templateService';
import './TemplatesPage.css';

/** メニュー一覧（REQ-4.7）。 */
export function TemplatesPage() {
  const db = useDatabase();
  const reportSaveError = useReportSaveError();
  const templates = useLiveQuery(
    async () => (await db.templates.toArray()).sort((x, y) => x.createdAt.localeCompare(y.createdAt)),
    [db],
  );
  const [deleting, setDeleting] = useState<Template | null>(null);

  const confirmDelete = async () => {
    if (!deleting) return;
    const id = deleting.id;
    setDeleting(null);
    try {
      await deleteTemplate(db, id);
    } catch (error) {
      reportSaveError(error);
    }
  };

  return (
    <>
      <Heading level={1}>メニュー</Heading>
      <div className="templates-actions">
        <Link href="/templates/new">メニューを作成</Link>
      </div>
      {templates && templates.length === 0 && (
        <EmptyState headingLevel={2} title="メニューがありません" description="よく行う種目の組み合わせをメニューにしておくと、ホームから 1 タップで始められます。" />
      )}
      <ul className="templates-list">
        {templates?.map((template) => (
          <li key={template.id} className="templates-item">
            <div className="templates-item-body">
              <Link href={`/templates/${template.id}`}>{template.name}</Link>
              <Text type="supporting">{template.items.length} 種目</Text>
            </div>
            <Button
              label="削除"
              aria-label={`${template.name} を削除`}
              variant="ghost"
              onClick={() => setDeleting(template)}
            />
          </li>
        ))}
      </ul>
      <AlertDialog
        isOpen={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="メニューを削除しますか？"
        description={`「${deleting?.name ?? ''}」を削除します。これまでのワークアウトの記録には影響しません。`}
        actionLabel="削除する"
        cancelLabel="キャンセル"
        onAction={() => void confirmDelete()}
      />
    </>
  );
}
