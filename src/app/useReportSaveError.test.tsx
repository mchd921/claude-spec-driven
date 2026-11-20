import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { QUOTA_MESSAGE, SAVE_FAILED_MESSAGE } from './saveError';
import { useReportSaveError } from './useReportSaveError';

function Probe() {
  const report = useReportSaveError();
  return (
    <>
      <button onClick={() => report(new Error('boom'))}>generic</button>
      <button onClick={() => report(Object.assign(new Error('full'), { name: 'QuotaExceededError' }))}>quota</button>
    </>
  );
}
const setup = () => render(<Probe />);

describe('useReportSaveError', () => {
  it('REQ-1.19: 保存に失敗すると「保存できませんでした」と表示する', async () => {
    setup();
    await userEvent.click(screen.getByText('generic'));
    expect((await screen.findAllByText(SAVE_FAILED_MESSAGE)).length).toBeGreaterThan(0);
  });

  it('REQ-1.19: 容量超過のときは、バックアップを促す文言を表示する', async () => {
    setup();
    await userEvent.click(screen.getByText('quota'));
    const [el] = await screen.findAllByText(QUOTA_MESSAGE);
    expect(el).toHaveTextContent('バックアップ');
  });
});
