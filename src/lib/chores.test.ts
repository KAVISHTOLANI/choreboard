import { describe, expect, it } from 'vitest';
import { assigneeOn, frequencyLabel, occurrenceIndex, occursOn, overdue, perWeek, plannedShare, removeMember, tasksOn, toggleDone, validateChore, weekSummary, type Chore, type ChoreDraft, type Completion, type Member } from './chores';

// 2026-11-23 is a Monday.
const MON = '2026-11-23';
const chore = (p: Partial<Chore>): Chore => ({ id: 'c', title: 'Dishes', room: 'Kitchen', minutes: 15, freq: { type: 'daily' }, assign: { mode: 'fixed', memberId: 'a' }, since: '2026-11-01', ...p });
const members: Member[] = [
  { id: 'a', name: 'Ana', color: '#000' },
  { id: 'b', name: 'Ben', color: '#111' },
];

describe('schedules', () => {
  it('handles daily, weekly and every-N-day chores', () => {
    expect(occursOn(chore({}), MON)).toBe(true);
    expect(occursOn(chore({ since: '2026-12-01' }), MON)).toBe(false);
    const weekly = chore({ freq: { type: 'weekly', days: [0, 3] } });
    expect(occursOn(weekly, MON)).toBe(true);
    expect(occursOn(weekly, '2026-11-24')).toBe(false);
    expect(occursOn(weekly, '2026-11-26')).toBe(true);
    const every = chore({ freq: { type: 'every', n: 3 }, since: '2026-11-20' });
    expect(['2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23'].map((d) => occursOn(every, d))).toEqual([true, false, false, true]);
  });
  it('labels frequencies and counts per week', () => {
    expect(frequencyLabel({ type: 'weekly', days: [4, 0, 2] })).toBe('Mon, Wed, Fri');
    expect(frequencyLabel({ type: 'weekly', days: [0, 1, 2, 3, 4] })).toBe('Weekdays');
    expect(frequencyLabel({ type: 'every', n: 14 })).toBe('Every 14 days');
    expect(perWeek({ type: 'every', n: 14 })).toBe(0.5);
  });
});

describe('rotation', () => {
  it('rotates by occurrence, not by calendar day', () => {
    const c = chore({ freq: { type: 'weekly', days: [0, 3] }, assign: { mode: 'rotate', memberIds: ['a', 'b'] }, since: MON });
    expect(occurrenceIndex(c, MON)).toBe(0);
    expect(assigneeOn(c, MON)).toBe('a');
    expect(assigneeOn(c, '2026-11-26')).toBe('b');
    expect(assigneeOn(c, '2026-11-30')).toBe('a');
  });
  it('returns null with nobody to assign', () => {
    expect(assigneeOn(chore({ assign: { mode: 'rotate', memberIds: [] } }), MON)).toBeNull();
    expect(assigneeOn(chore({ assign: { mode: 'fixed', memberId: '' } }), MON)).toBeNull();
  });
  it('drops removed people from chores', () => {
    const out = removeMember([chore({}), chore({ id: 'r', assign: { mode: 'rotate', memberIds: ['a', 'b'] } })], 'a');
    expect(out[0].assign).toEqual({ mode: 'fixed', memberId: '' });
    expect(out[1].assign).toEqual({ mode: 'rotate', memberIds: ['b'] });
  });
});

describe('tasks and summaries', () => {
  const chores = [chore({ id: 'dish' }), chore({ id: 'bins', minutes: 5, freq: { type: 'weekly', days: [0] }, assign: { mode: 'fixed', memberId: 'b' } })];
  it('toggles completion and credits the person who did it', () => {
    let done: Completion[] = [];
    const [t] = tasksOn(chores, done, MON);
    done = toggleDone(done, t, 'b');
    expect(done).toEqual([{ choreId: 'dish', date: MON, memberId: 'b' }]);
    const s = weekSummary(members, chores, done, MON);
    expect(s.find((x) => x.member.id === 'a')).toMatchObject({ assigned: 7, done: 0, minutesAssigned: 105 });
    expect(s.find((x) => x.member.id === 'b')).toMatchObject({ assigned: 1, done: 1, minutesDone: 15 });
    expect(toggleDone(done, t)).toEqual([]);
  });
  it('limits a summary to days up to today', () => {
    const s = weekSummary(members, chores, [], MON, '2026-11-24');
    expect(s.find((x) => x.member.id === 'a')!.assigned).toBe(2);
  });
  it('finds overdue tasks before today only', () => {
    const done: Completion[] = [{ choreId: 'dish', date: '2026-11-22', memberId: 'a' }];
    const o = overdue(chores, done, MON, 3);
    expect(o.map((t) => `${t.chore.id}@${t.date}`)).toEqual(['dish@2026-11-20', 'dish@2026-11-21']);
  });
  it('computes each person’s planned share of weekly minutes', () => {
    const share = plannedShare(members, [...chores, chore({ id: 'r', minutes: 20, freq: { type: 'weekly', days: [5] }, assign: { mode: 'rotate', memberIds: ['a', 'b'] } })]);
    expect(share.map((s) => s.minutes)).toEqual([115, 15]);
    expect(share[0].share + share[1].share).toBeCloseTo(1);
  });
});

describe('validation', () => {
  const base: ChoreDraft = { title: 'Mop', room: 'Kitchen', minutes: '20', freqType: 'weekly', days: [], n: '7', mode: 'rotate', memberIds: ['a'], memberId: '', since: MON };
  it('reports every problem', () => {
    const r = validateChore({ ...base, title: '', minutes: '0' }, ['a', 'b']);
    expect(Object.keys(r.errors).sort()).toEqual(['days', 'memberIds', 'minutes', 'title']);
  });
  it('builds a clean chore', () => {
    const r = validateChore({ ...base, days: [5, 1], memberIds: ['a', 'b', 'gone'] }, ['a', 'b']);
    expect(r.value).toMatchObject({ freq: { type: 'weekly', days: [1, 5] }, assign: { mode: 'rotate', memberIds: ['a', 'b'] }, minutes: 20 });
  });
  it('checks every-N and fixed assignee', () => {
    const r = validateChore({ ...base, freqType: 'every', n: '1', mode: 'fixed', memberId: 'x' }, ['a']);
    expect(r.errors.n).toBeDefined();
    expect(r.errors.memberId).toBeDefined();
  });
});
