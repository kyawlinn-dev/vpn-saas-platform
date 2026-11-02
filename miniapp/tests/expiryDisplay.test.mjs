import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import * as display from '../src/lib/businessDisplay.js';

test('time left stays active after midnight until exactly 04:00 Myanmar', () => {
  assert.equal(display.daysLeft('2026-10-28', new Date('2026-10-28T17:30:00Z')), 0);
  assert.equal(display.daysLeft('2026-10-28', new Date('2026-10-28T21:29:59Z')), 0);
  assert.equal(display.daysLeft('2026-10-28', new Date('2026-10-28T21:30:00Z')), -1);
  assert.equal(display.daysLeft('2026-10-28', new Date('2026-10-27T21:30:01Z')), 0);
});

test('strict expiry dates reject invalid days and accept leap/month/year rollovers', () => {
  for (const invalid of [null, '', '2026-02-29', '2024-02-30', '2026-04-31', '2026-13-01', '2026-00-01', '2026-01-00', '2026-1-01', '2026-10-28T00:00:00Z']) {
    assert.equal(display.daysLeft(invalid, new Date('2026-01-01Z')), null);
    assert.equal(display.expiryCutoffAt(invalid), null);
  }
  assert.equal(display.expiryCutoffAt('2024-02-29'), '2024-02-29T21:30:00.000Z');
  assert.equal(display.formatExpiryDeadline('2024-02-29'), 'Mar 1, 2024, 04:00 Myanmar');
  assert.equal(display.formatExpiryDeadline('2026-12-31'), 'Jan 1, 2027, 04:00 Myanmar');
  assert.equal(display.formatExpiryDeadline('2026-04-30'), 'May 1, 2026, 04:00 Myanmar');
});

test('prefers cutoff metadata, falls back for null metadata, ignores persisted expires_at', () => {
  const order = {expiry_date:'2026-10-28', expires_at:'2020-01-01T00:00:00Z',
    business_summary:{expiry_cutoff_at:'2026-10-29T21:30:00Z', expiry_timezone:'Asia/Yangon'}};
  assert.equal(display.daysLeft(order, new Date('2026-10-28T21:30:00Z')), 1);
  assert.equal(display.formatExpiryDeadline(order), 'Oct 30, 2026, 04:00 Myanmar');
  order.business_summary.expiry_cutoff_at = null;
  assert.equal(display.expiryCutoffAt(order), '2026-10-28T21:30:00.000Z');
  assert.equal(display.daysLeft(order, new Date('2026-10-28T21:30:00Z')), -1);
  assert.equal(display.expiryCutoffAt({expires_at:'2026-10-28T21:30:00Z'}), null);
});

test('deadline is independent of host timezone and accounting date stays unchanged', () => {
  for (const tz of ['UTC', 'America/Los_Angeles', 'Asia/Bangkok']) {
    const code = "import {formatExpiryDeadline,formatBusinessDate} from './src/lib/businessDisplay.js'; console.log(formatExpiryDeadline('2026-10-28')+'|'+formatBusinessDate('2026-10-28',{dateOnly:true}));";
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', code],
      {cwd:new URL('../', import.meta.url), env:{...process.env, TZ:tz}, encoding:'utf8'}).trim();
    assert.equal(output, 'Oct 29, 2026, 04:00 Myanmar|Oct 28, 2026');
  }
});
