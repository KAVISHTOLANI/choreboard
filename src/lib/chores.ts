import { addDays, daysBetween, fromISO, isValidISODate } from '../shared/dates';

export interface Member {
  id: string;
  name: string;
  color: string;
  demo?: boolean;
}

export type Frequency = { type: 'daily' } | { type: 'weekly'; days: number[] } | { type: 'every'; n: number };
export type Assignment = { mode: 'fixed'; memberId: string } | { mode: 'rotate'; memberIds: string[] };

export interface Chore {
  id: string;
  title: string;
  room: string;
  minutes: number;
  freq: Frequency;
  assign: Assignment;
  /** First day the chore applies; also the anchor for "every N days" and rotation. */
  since: string;
  demo?: boolean;
}

export interface Completion {
  choreId: string;
  date: string;
  memberId: string;
}

export const ROOMS = ['Kitchen', 'Bathroom', 'Living room', 'Bedrooms', 'Laundry', 'Outdoors', 'Whole home'];
export const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Monday = 0 … Sunday = 6. */
export const dow = (iso: string) => (fromISO(iso).getDay() + 6) % 7;

export function occursOn(c: Chore, date: string): boolean {
  if (date < c.since) return false;
  if (c.freq.type === 'daily') return true;
  if (c.freq.type === 'weekly') return c.freq.days.includes(dow(date));
  return daysBetween(c.since, date) % c.freq.n === 0;
}

/** How many times the chore has occurred before `date` (used to rotate assignees fairly). */
export function occurrenceIndex(c: Chore, date: string): number {
  if (c.freq.type === 'daily') return Math.max(0, daysBetween(c.since, date));
  if (c.freq.type === 'every') return Math.max(0, Math.floor(daysBetween(c.since, date) / c.freq.n));
  let n = 0;
  for (let d = c.since; d < date; d = addDays(d, 1)) if (occursOn(c, d)) n++;
  return n;
}

export function assigneeOn(c: Chore, date: string): string | null {
  if (c.assign.mode === 'fixed') return c.assign.memberId || null;
  const ids = c.assign.memberIds;
  if (ids.length === 0) return null;
  return ids[occurrenceIndex(c, date) % ids.length];
}

export function frequencyLabel(f: Frequency): string {
  if (f.type === 'daily') return 'Every day';
  if (f.type === 'every') return f.n === 1 ? 'Every day' : `Every ${f.n} days`;
  if (f.days.length === 7) return 'Every day';
  if (f.days.length === 5 && [0, 1, 2, 3, 4].every((d) => f.days.includes(d))) return 'Weekdays';
  return [...f.days].sort().map((d) => DAY_SHORT[d]).join(', ');
}

/** Times per week, averaged (an every-10-days chore is 0.7). */
export function perWeek(f: Frequency): number {
  if (f.type === 'daily') return 7;
  if (f.type === 'weekly') return f.days.length;
  return 7 / f.n;
}

export interface Task {
  chore: Chore;
  date: string;
  memberId: string | null;
  done: Completion | undefined;
}

export function isDone(completions: Completion[], choreId: string, date: string) {
  return completions.find((x) => x.choreId === choreId && x.date === date);
}

export function tasksOn(chores: Chore[], completions: Completion[], date: string): Task[] {
  return chores.filter((c) => occursOn(c, date)).map((chore) => ({ chore, date, memberId: assigneeOn(chore, date), done: isDone(completions, chore.id, date) }));
}

export function toggleDone(completions: Completion[], task: Pick<Task, 'chore' | 'date' | 'memberId'>, by?: string): Completion[] {
  const hit = isDone(completions, task.chore.id, task.date);
  if (hit) return completions.filter((x) => x !== hit);
  return [...completions, { choreId: task.chore.id, date: task.date, memberId: by ?? task.memberId ?? '' }];
}

export function week(start: string) {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** Unfinished tasks from the `days` days before today (today itself is never overdue). */
export function overdue(chores: Chore[], completions: Completion[], today: string, days = 7): Task[] {
  const out: Task[] = [];
  for (let i = days; i >= 1; i--) out.push(...tasksOn(chores, completions, addDays(today, -i)).filter((t) => !t.done));
  return out;
}

export interface MemberSummary {
  member: Member;
  assigned: number;
  done: number;
  minutesAssigned: number;
  minutesDone: number;
}

/** Per-person totals for a week. Completions are credited to whoever did them, which may differ from the assignee. */
export function weekSummary(members: Member[], chores: Chore[], completions: Completion[], start: string, until?: string): MemberSummary[] {
  const rows = new Map(members.map((m) => [m.id, { member: m, assigned: 0, done: 0, minutesAssigned: 0, minutesDone: 0 }]));
  for (const d of week(start)) {
    if (until && d > until) break;
    for (const t of tasksOn(chores, completions, d)) {
      const a = t.memberId ? rows.get(t.memberId) : undefined;
      if (a) {
        a.assigned++;
        a.minutesAssigned += t.chore.minutes;
      }
      const by = t.done ? rows.get(t.done.memberId) : undefined;
      if (by) {
        by.done++;
        by.minutesDone += t.chore.minutes;
      }
    }
  }
  return [...rows.values()];
}

/** Share of planned weekly minutes per person, from the chore definitions (ignores what was actually done). */
export function plannedShare(members: Member[], chores: Chore[]) {
  const mins = new Map(members.map((m) => [m.id, 0]));
  for (const c of chores) {
    const weekly = perWeek(c.freq) * c.minutes;
    if (c.assign.mode === 'fixed') mins.set(c.assign.memberId, (mins.get(c.assign.memberId) ?? 0) + weekly);
    else for (const id of c.assign.memberIds) mins.set(id, (mins.get(id) ?? 0) + weekly / c.assign.memberIds.length);
  }
  const total = [...mins.values()].reduce((a, b) => a + b, 0);
  return members.map((m) => ({ member: m, minutes: Math.round(mins.get(m.id) ?? 0), share: total ? (mins.get(m.id) ?? 0) / total : 0 }));
}

export interface ChoreDraft {
  title: string;
  room: string;
  minutes: string;
  freqType: Frequency['type'];
  days: number[];
  n: string;
  mode: Assignment['mode'];
  memberId: string;
  memberIds: string[];
  since: string;
}

export function validateChore(d: ChoreDraft, memberIds: string[]): { errors: Partial<Record<keyof ChoreDraft, string>>; value?: Omit<Chore, 'id'> } {
  const e: Partial<Record<keyof ChoreDraft, string>> = {};
  if (!d.title.trim()) e.title = 'Name the chore.';
  const minutes = Number(d.minutes);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 480) e.minutes = 'Minutes must be a whole number from 1 to 480.';
  if (d.freqType === 'weekly' && d.days.length === 0) e.days = 'Pick at least one day.';
  const n = Number(d.n);
  if (d.freqType === 'every' && (!Number.isInteger(n) || n < 2 || n > 365)) e.n = 'Use a whole number of days from 2 to 365.';
  if (d.mode === 'fixed' && !memberIds.includes(d.memberId)) e.memberId = 'Choose who does it.';
  if (d.mode === 'rotate' && d.memberIds.filter((id) => memberIds.includes(id)).length < 2) e.memberIds = 'Pick at least two people to rotate between.';
  if (!isValidISODate(d.since)) e.since = 'Enter a start date.';
  if (Object.keys(e).length) return { errors: e };
  const freq: Frequency = d.freqType === 'daily' ? { type: 'daily' } : d.freqType === 'weekly' ? { type: 'weekly', days: [...d.days].sort() } : { type: 'every', n };
  const assign: Assignment = d.mode === 'fixed' ? { mode: 'fixed', memberId: d.memberId } : { mode: 'rotate', memberIds: d.memberIds.filter((id) => memberIds.includes(id)) };
  return { errors: e, value: { title: d.title.trim(), room: d.room, minutes, freq, assign, since: d.since } };
}

/** Removes a person: fixed chores become unassigned, rotations drop them. */
export function removeMember(chores: Chore[], id: string): Chore[] {
  return chores.map((c) => {
    if (c.assign.mode === 'fixed') return c.assign.memberId === id ? { ...c, assign: { mode: 'fixed', memberId: '' } } : c;
    return { ...c, assign: { mode: 'rotate', memberIds: c.assign.memberIds.filter((m) => m !== id) } };
  });
}
