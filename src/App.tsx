import { useState, type ReactNode } from 'react';
import { DemoTag, EmptyState, Field, Landing, NotFound, Notice, PageHead, Shell, uid, useFlash, usePersistentState, useRoute } from './shared/ui';
import { DataTable, useTable, type Column } from './shared/table';
import { addDays, formatDay, todayISO, weekStart } from './shared/dates';
import {
  DAY_SHORT,
  ROOMS,
  frequencyLabel,
  overdue,
  perWeek,
  plannedShare,
  removeMember,
  tasksOn,
  toggleDone,
  validateChore,
  week,
  weekSummary,
  type Chore,
  type ChoreDraft,
  type Completion,
  type Member,
  type Task,
} from './lib/chores';

const KEY = 'choreboard:store';
const NAV = [
  { to: '/', label: 'Overview' },
  { to: '/week', label: 'This week' },
  { to: '/chores', label: 'Chores' },
  { to: '/people', label: 'People' },
  { to: '/summary', label: 'Summary' },
];
const COLORS = ['#a0461a', '#2f5d8a', '#5b7f3a', '#8a4f9e', '#b08a1e', '#1f7a7a'];

interface Store {
  members: Member[];
  chores: Chore[];
  completions: Completion[];
}

export function demoStore(today: string): Store {
  const since = addDays(weekStart(today), -21);
  const members: Member[] = [
    { id: 'demo-a', name: 'Alex', color: COLORS[0], demo: true },
    { id: 'demo-b', name: 'Sam', color: COLORS[1], demo: true },
    { id: 'demo-c', name: 'Robin', color: COLORS[2], demo: true },
  ];
  const c = (id: string, title: string, room: string, minutes: number, freq: Chore['freq'], assign: Chore['assign']): Chore => ({ id: `demo-${id}`, title, room, minutes, freq, assign, since, demo: true });
  const chores: Chore[] = [
    c('dishes', 'Wash up and wipe counters', 'Kitchen', 20, { type: 'daily' }, { mode: 'rotate', memberIds: ['demo-a', 'demo-b', 'demo-c'] }),
    c('bins', 'Take bins out', 'Outdoors', 5, { type: 'weekly', days: [1] }, { mode: 'fixed', memberId: 'demo-b' }),
    c('recycling', 'Sort and take out recycling', 'Kitchen', 10, { type: 'weekly', days: [3] }, { mode: 'rotate', memberIds: ['demo-a', 'demo-c'] }),
    c('vacuum', 'Vacuum living room and hallway', 'Living room', 25, { type: 'weekly', days: [5] }, { mode: 'rotate', memberIds: ['demo-a', 'demo-b', 'demo-c'] }),
    c('bath', 'Clean the bathroom: sink, toilet, shower screen and mirror', 'Bathroom', 35, { type: 'weekly', days: [6] }, { mode: 'rotate', memberIds: ['demo-b', 'demo-c'] }),
    c('laundry', 'Laundry: wash, dry, fold', 'Laundry', 40, { type: 'weekly', days: [2, 5] }, { mode: 'fixed', memberId: 'demo-a' }),
    c('plants', 'Water plants', 'Whole home', 10, { type: 'every', n: 3 }, { mode: 'fixed', memberId: 'demo-c' }),
    c('fridge', 'Clear out the fridge', 'Kitchen', 15, { type: 'weekly', days: [6] }, { mode: 'fixed', memberId: 'demo-b' }),
    c('sheets', 'Change bed sheets', 'Bedrooms', 30, { type: 'every', n: 14 }, { mode: 'rotate', memberIds: ['demo-a', 'demo-b', 'demo-c'] }),
  ];
  const completions: Completion[] = [];
  for (let d = since; d < today; d = addDays(d, 1)) {
    for (const t of tasksOn(chores, [], d)) {
      const skip = (d.charCodeAt(9) + t.chore.title.length) % 6 === 0 && d > addDays(today, -6);
      if (!skip) completions.push({ choreId: t.chore.id, date: d, memberId: t.memberId ?? 'demo-a' });
    }
  }
  return { members, chores, completions };
}

export default function App() {
  const [route, navigate] = useRoute();
  const today = todayISO();
  const [store, setStore] = usePersistentState<Store>(KEY, () => demoStore(today));
  const ctx = { store, setStore, today, navigate };
  const edit = route.match(/^\/chore\/(.+)$/);
  let page: ReactNode;
  if (route === '/') page = <Home />;
  else if (route === '/week') page = <Week {...ctx} />;
  else if (route === '/chores') page = <Chores {...ctx} />;
  else if (edit) page = <Editor {...ctx} id={edit[1] === 'new' ? undefined : edit[1]} />;
  else if (route === '/people') page = <People {...ctx} />;
  else if (route === '/summary') page = <Summary {...ctx} />;
  else page = <NotFound />;
  return (
    <Shell name="Choreboard" wordmark={['Chore', 'board']} nav={NAV} route={route} cta={{ to: '/week', label: 'Open the board' }} footerNote="Runs entirely in your browser. Everyone using it shares this device’s copy.">
      {page}
    </Shell>
  );
}

type Ctx = { store: Store; setStore: (s: Store) => void; today: string; navigate: (to: string) => void };

function Chip({ m }: { m?: Member }) {
  if (!m) return <span className="chip chip-none">Unassigned</span>;
  return <span className="chip" style={{ ['--c' as string]: m.color }}><i aria-hidden="true">{m.name[0]}</i>{m.name}</span>;
}

/* ---------- Board ---------- */
function Board({ store, start, today, onToggle, filterMember, filterRoom, compact }: { store: Store; start: string; today: string; onToggle?: (t: Task) => void; filterMember?: string; filterRoom?: string; compact?: boolean }) {
  const byId = new Map(store.members.map((m) => [m.id, m]));
  return (
    <div className={`board ${compact ? 'is-compact' : ''}`}>
      {week(start).map((d, i) => {
        const tasks = tasksOn(store.chores, store.completions, d).filter((t) => (!filterMember || t.memberId === filterMember) && (!filterRoom || t.chore.room === filterRoom));
        const done = tasks.filter((t) => t.done).length;
        return (
          <section key={d} className={`day ${d === today ? 'is-today' : ''} ${d < today ? 'is-past' : ''}`} aria-label={formatDay(d, { weekday: 'long', day: 'numeric', month: 'long' })} style={{ ['--i' as string]: i }}>
            <header className="day-head">
              <span className="mono">{DAY_SHORT[i]}</span>
              <strong>{formatDay(d, { day: 'numeric' })}</strong>
              {tasks.length > 0 && <span className="small muted">{done}/{tasks.length}</span>}
            </header>
            {tasks.length === 0 ? <p className="small muted day-empty">Nothing due</p> : (
              <ul className="tasks">
                {tasks.slice(0, compact ? 3 : undefined).map((t) => {
                  const m = t.memberId ? byId.get(t.memberId) : undefined;
                  const late = !t.done && d < today;
                  return (
                    <li key={t.chore.id} className={`task ${t.done ? 'is-done' : ''} ${late ? 'is-late' : ''}`} style={{ ['--c' as string]: m?.color ?? 'var(--muted)' }}>
                      {onToggle ? (
                        <label className="task-check">
                          <input type="checkbox" checked={!!t.done} onChange={() => onToggle(t)} aria-label={`${t.chore.title}, ${formatDay(d, { weekday: 'long' })}${m ? `, ${m.name}` : ''}`} />
                          <span className="task-title">{t.chore.title}</span>
                        </label>
                      ) : <span className="task-title">{t.chore.title}</span>}
                      <span className="task-meta small">
                        <span className="dot-c" aria-hidden="true" />{m?.name ?? 'Unassigned'} · {t.chore.minutes} min{late && <strong className="late"> · missed</strong>}
                      </span>
                    </li>
                  );
                })}
                {compact && tasks.length > 3 && <li className="small muted">+{tasks.length - 3} more</li>}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function HeroPreview() {
  const today = todayISO();
  const s = demoStore(today);
  const summary = plannedShare(s.members, s.chores);
  return (
    <div className="hero-cb">
      <Board store={s} start={weekStart(today)} today={today} compact />
      <div className="share-bar" role="img" aria-label={`Planned weekly minutes: ${summary.map((x) => `${x.member.name} ${x.minutes}`).join(', ')}`}>
        {summary.map((x) => <span key={x.member.id} style={{ flexGrow: x.minutes, background: x.member.color }}>{x.member.name} {Math.round(x.share * 100)}%</span>)}
      </div>
    </div>
  );
}

function Home() {
  return (
    <Landing
      eyebrow="Household chores · rotas & weekly board"
      title={<>Share the housework <em>without the argument.</em></>}
      lead="Write each chore down once with how often it happens and who does it — or rotate it between people. Choreboard lays out the week, keeps track of what’s done, and shows who is carrying the load."
      primary={{ href: '#/week', label: 'Open this week’s board' }}
      secondary={{ href: '#/summary', label: 'See the weekly summary' }}
      previewLabel="This week — demo household"
      preview={<HeroPreview />}
      steps={[
        { title: 'Add the people', body: 'Everyone who shares the home, each with a colour.' },
        { title: 'List the chores', body: 'Room, minutes, schedule (daily, chosen weekdays, every N days) and a person or a rotation.' },
        { title: 'Tick and review', body: 'Tick chores on the weekly board. The summary compares planned and actual minutes per person.' },
      ]}
      stepsIntro="Choreboard opens with a labelled demo household of three people and nine chores. Clear it when you’re ready to add your own."
      features={[
        { title: 'Fair rotation', body: 'Rotating chores move to the next person each time they come round, not each calendar day.' },
        { title: 'Missed chores', body: 'Anything left unticked from the past week is listed so it can be picked up.' },
        { title: 'Credit where due', body: 'Tick a chore on someone’s behalf and record who actually did it.' },
        { title: 'Load at a glance', body: 'Each person’s share of planned weekly minutes, plus done vs assigned for the week.' },
      ]}
      note="Choreboard keeps one copy on this device. It doesn’t sync between phones or send reminders."
      closing={{ title: <>Start with the chore <em>nobody likes.</em></>, action: { href: '#/chore/new', label: 'Add a chore' } }}
    />
  );
}

function Week({ store, setStore, today }: Ctx) {
  const [start, setStart] = useState(weekStart(today));
  const [member, setMember] = useState('');
  const [room, setRoom] = useState('');
  const [doneBy, setDoneBy] = useState('');
  const [flash, setFlash] = useFlash();
  const late = overdue(store.chores, store.completions, today);
  const byId = new Map(store.members.map((m) => [m.id, m]));
  if (store.chores.length === 0)
    return <EmptyState title="No chores yet" actions={<><a className="btn btn-primary" href="#/chore/new">Add a chore</a><button type="button" className="btn" onClick={() => setStore(demoStore(today))}>Load demo household</button></>}>Add the people who share the home, then the chores.</EmptyState>;
  function toggle(t: Task) {
    if (t.date > today) return setFlash({ kind: 'error', text: 'You can’t tick a chore for a day that hasn’t happened yet.' });
    const completions = toggleDone(store.completions, t, doneBy || undefined);
    setStore({ ...store, completions });
    if (!t.done) setFlash({ kind: 'success', text: `Done: ${t.chore.title}${doneBy && doneBy !== t.memberId ? ` (by ${byId.get(doneBy)?.name})` : ''}.` });
  }
  return (
    <div className="stack">
      <PageHead
        eyebrow={`Week of ${formatDay(start, { day: 'numeric', month: 'long', year: 'numeric' })}`}
        title={start === weekStart(today) ? <>This <em>week.</em></> : <>Week of <em>{formatDay(start, { day: 'numeric', month: 'short' })}</em></>}
        actions={<div className="row nowrap">
          <button type="button" className="btn btn-sm" onClick={() => setStart(addDays(start, -7))} aria-label="Previous week">←</button>
          <button type="button" className="btn btn-sm" onClick={() => setStart(weekStart(today))} disabled={start === weekStart(today)}>This week</button>
          <button type="button" className="btn btn-sm" onClick={() => setStart(addDays(start, 7))} aria-label="Next week">→</button>
        </div>}
      />
      {flash && <Notice kind={flash.kind} onDismiss={() => setFlash(null)}>{flash.text}</Notice>}
      <div className="filters card">
        <Field label="Show chores for">{(p) => <select {...p} value={member} onChange={(e) => setMember(e.target.value)}><option value="">Everyone</option>{store.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>}</Field>
        <Field label="Room">{(p) => <select {...p} value={room} onChange={(e) => setRoom(e.target.value)}><option value="">All rooms</option>{ROOMS.map((r) => <option key={r}>{r}</option>)}</select>}</Field>
        <Field label="Credit ticks to">{(p) => <select {...p} value={doneBy} onChange={(e) => setDoneBy(e.target.value)}><option value="">The assigned person</option>{store.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>}</Field>
      </div>
      <Board store={store} start={start} today={today} onToggle={toggle} filterMember={member} filterRoom={room} />
      {late.length > 0 && start === weekStart(today) && (
        <section className="card stack" aria-labelledby="late-title">
          <h2 id="late-title" className="h3">Missed in the last 7 days <span className="badge badge-warn">{late.length}</span></h2>
          <ul className="list">
            {late.slice(0, 8).map((t) => (
              <li key={`${t.chore.id}${t.date}`} className="row-between">
                <span>{t.chore.title} <span className="small muted">· {formatDay(t.date, { weekday: 'short', day: 'numeric', month: 'short' })}</span></span>
                <span className="row nowrap"><Chip m={t.memberId ? byId.get(t.memberId) : undefined} /><button type="button" className="btn btn-sm" onClick={() => toggle(t)}>Mark done</button></span>
              </li>
            ))}
          </ul>
          {late.length > 8 && <p className="small muted">…and {late.length - 8} more.</p>}
        </section>
      )}
    </div>
  );
}

/* ---------- Chores ---------- */
function Chores({ store, setStore, today }: Ctx) {
  const [q, setQ] = useState('');
  const [flash, setFlash] = useFlash();
  const byId = new Map(store.members.map((m) => [m.id, m]));
  const rows = store.chores.filter((c) => `${c.title} ${c.room}`.toLowerCase().includes(q.trim().toLowerCase()));
  const who = (c: Chore) => (c.assign.mode === 'fixed' ? byId.get(c.assign.memberId)?.name ?? 'Unassigned' : `Rotates: ${c.assign.memberIds.map((i) => byId.get(i)?.name).filter(Boolean).join(' → ') || 'nobody'}`);
  const columns: Column<Chore>[] = [
    { key: 'title', label: 'Chore', sort: (c) => c.title, render: (c) => <><a href={`#/chore/${c.id}`}>{c.title}</a>{c.demo && <> <DemoTag /></>}</> },
    { key: 'room', label: 'Room', sort: (c) => c.room, render: (c) => c.room },
    { key: 'freq', label: 'How often', sort: (c) => -perWeek(c.freq), render: (c) => frequencyLabel(c.freq) },
    { key: 'who', label: 'Who', sort: who, render: who },
    { key: 'min', label: 'Minutes', num: true, sort: (c) => c.minutes, render: (c) => c.minutes },
    { key: 'week', label: 'Min / week', num: true, sort: (c) => perWeek(c.freq) * c.minutes, render: (c) => Math.round(perWeek(c.freq) * c.minutes) },
  ];
  const table = useTable(rows, columns, { initialSort: 'room', pageSize: 10 });
  return (
    <div className="stack">
      <PageHead eyebrow="Chores" title={<>Everything that <em>needs doing.</em></>} actions={<a className="btn btn-primary" href="#/chore/new">Add chore</a>} />
      {flash && <Notice kind={flash.kind} onDismiss={() => setFlash(null)}>{flash.text}</Notice>}
      {store.chores.length === 0 ? (
        <EmptyState title="No chores yet" actions={<><a className="btn btn-primary" href="#/chore/new">Add a chore</a><button type="button" className="btn" onClick={() => setStore(demoStore(today))}>Load demo household</button></>}>Start with the three chores that cause the most friction.</EmptyState>
      ) : (
        <div className="card stack">
          <div className="filters"><Field label="Search chores" className="grow">{(p) => <input {...p} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chore or room" />}</Field></div>
          <DataTable caption="Chores" columns={columns} table={table} rowKey={(c) => c.id} empty="No chores match that search." />
          {(store.chores.some((c) => c.demo) || store.members.some((m) => m.demo)) && (
            <div><button type="button" className="btn btn-ghost btn-sm" onClick={() => { const ids = new Set(store.chores.filter((c) => c.demo).map((c) => c.id)); let chores = store.chores.filter((c) => !c.demo); for (const m of store.members.filter((m) => m.demo)) chores = removeMember(chores, m.id); setStore({ members: store.members.filter((m) => !m.demo), chores, completions: store.completions.filter((x) => !ids.has(x.choreId)) }); setFlash({ kind: 'success', text: 'Demo household removed.' }); }}>Clear demo household</button></div>
          )}
        </div>
      )}
    </div>
  );
}

function Editor({ store, setStore, today, navigate, id }: Ctx & { id?: string }) {
  const existing = id ? store.chores.find((c) => c.id === id) : undefined;
  const memberIds = store.members.map((m) => m.id);
  const [d, setD] = useState<ChoreDraft>(() =>
    existing
      ? { title: existing.title, room: existing.room, minutes: String(existing.minutes), freqType: existing.freq.type, days: existing.freq.type === 'weekly' ? existing.freq.days : [], n: existing.freq.type === 'every' ? String(existing.freq.n) : '7', mode: existing.assign.mode, memberId: existing.assign.mode === 'fixed' ? existing.assign.memberId : memberIds[0] ?? '', memberIds: existing.assign.mode === 'rotate' ? existing.assign.memberIds : [], since: existing.since }
      : { title: '', room: 'Kitchen', minutes: '15', freqType: 'weekly', days: [], n: '7', mode: 'fixed', memberId: memberIds[0] ?? '', memberIds: [], since: weekStart(today) },
  );
  const [submitted, setSubmitted] = useState(false);
  if (id && !existing) return <EmptyState title="Chore not found" actions={<a className="btn btn-primary" href="#/chores">Back to chores</a>}>It may have been deleted.</EmptyState>;
  if (store.members.length === 0) return <EmptyState title="Add people first" actions={<a className="btn btn-primary" href="#/people">Add people</a>}>Chores are assigned to people, so add at least one person.</EmptyState>;
  const errors = submitted ? validateChore(d, memberIds).errors : {};
  const set = <K extends keyof ChoreDraft>(k: K, v: ChoreDraft[K]) => setD({ ...d, [k]: v });
  function save(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    const r = validateChore(d, memberIds);
    if (!r.value) return;
    if (existing) setStore({ ...store, chores: store.chores.map((c) => (c.id === existing.id ? { ...existing, ...r.value!, demo: false } : c)) });
    else setStore({ ...store, chores: [...store.chores, { ...r.value, id: uid('chore') }] });
    navigate('/chores');
  }
  return (
    <div className="stack">
      <PageHead eyebrow={existing ? 'Edit chore' : 'New chore'} title={existing ? <>Edit <em>{existing.title}</em></> : <>Add a <em>chore.</em></>} />
      <form className="card stack" onSubmit={save} noValidate>
        {Object.keys(errors).length > 0 && <Notice kind="error">Please fix the highlighted fields.</Notice>}
        <div className="form-grid">
          <Field label="Chore" error={errors.title}>{(p) => <input {...p} value={d.title} onChange={(e) => set('title', e.target.value)} maxLength={100} />}</Field>
          <Field label="Room">{(p) => <select {...p} value={d.room} onChange={(e) => set('room', e.target.value)}>{ROOMS.map((r) => <option key={r}>{r}</option>)}</select>}</Field>
          <Field label="Minutes it takes" error={errors.minutes}>{(p) => <input {...p} inputMode="numeric" value={d.minutes} onChange={(e) => set('minutes', e.target.value)} />}</Field>
          <Field label="Starting" hint="First day it applies; rotations count from here" error={errors.since}>{(p) => <input {...p} type="date" value={d.since} onChange={(e) => set('since', e.target.value)} />}</Field>
        </div>
        <fieldset className="stack">
          <legend className="label">How often</legend>
          <div className="tabs" role="radiogroup" aria-label="How often">
            {([['daily', 'Every day'], ['weekly', 'On set weekdays'], ['every', 'Every N days']] as const).map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={d.freqType === v} onClick={() => set('freqType', v)}>{l}</button>)}
          </div>
          {d.freqType === 'weekly' && (
            <div className="stack">
              <div className="row day-picks">{DAY_SHORT.map((n, i) => <label key={n} className="check"><input type="checkbox" checked={d.days.includes(i)} onChange={(e) => set('days', e.target.checked ? [...d.days, i] : d.days.filter((x) => x !== i))} /> {n}</label>)}</div>
              {errors.days && <span className="error-text">{errors.days}</span>}
            </div>
          )}
          {d.freqType === 'every' && <Field label="Every how many days?" error={errors.n}>{(p) => <input {...p} inputMode="numeric" value={d.n} onChange={(e) => set('n', e.target.value)} style={{ maxWidth: 140 }} />}</Field>}
        </fieldset>
        <fieldset className="stack">
          <legend className="label">Who does it</legend>
          <div className="tabs" role="radiogroup" aria-label="Who does it">
            {([['fixed', 'One person'], ['rotate', 'Take turns']] as const).map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={d.mode === v} onClick={() => set('mode', v)}>{l}</button>)}
          </div>
          {d.mode === 'fixed' ? (
            <Field label="Person" error={errors.memberId}>{(p) => <select {...p} value={d.memberId} onChange={(e) => set('memberId', e.target.value)}><option value="">Choose…</option>{store.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>}</Field>
          ) : (
            <div className="stack">
              <p className="small muted">Tick people in the order they take turns. Each time the chore comes round it moves to the next person.</p>
              <div className="row">{store.members.map((m) => <label key={m.id} className="check"><input type="checkbox" checked={d.memberIds.includes(m.id)} onChange={(e) => set('memberIds', e.target.checked ? [...d.memberIds, m.id] : d.memberIds.filter((x) => x !== m.id))} /> {m.name}</label>)}</div>
              {d.memberIds.length > 0 && <p className="small">Order: {d.memberIds.map((i) => store.members.find((m) => m.id === i)?.name).join(' → ')}</p>}
              {errors.memberIds && <span className="error-text">{errors.memberIds}</span>}
            </div>
          )}
        </fieldset>
        <div className="row">
          <button className="btn btn-primary" type="submit">{existing ? 'Save changes' : 'Save chore'}</button>
          <a className="btn btn-ghost" href="#/chores">Cancel</a>
          {existing && <button type="button" className="btn btn-danger" onClick={() => { if (window.confirm(`Delete “${existing.title}” and its history?`)) { setStore({ ...store, chores: store.chores.filter((c) => c.id !== existing.id), completions: store.completions.filter((x) => x.choreId !== existing.id) }); navigate('/chores'); } }}>Delete chore</button>}
        </div>
      </form>
    </div>
  );
}

/* ---------- People ---------- */
function People({ store, setStore }: Ctx) {
  const [name, setName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useFlash();
  const share = plannedShare(store.members, store.chores);
  function add(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return setErr('Enter a name.');
    if (store.members.some((m) => m.name.toLowerCase() === n.toLowerCase())) return setErr(`${n} is already on the list.`);
    setErr(null);
    setStore({ ...store, members: [...store.members, { id: uid('person'), name: n, color: COLORS[store.members.length % COLORS.length] }] });
    setName('');
    setFlash({ kind: 'success', text: `Added ${n}.` });
  }
  return (
    <div className="stack">
      <PageHead eyebrow="People" title={<>Who <em>lives here.</em></>} description="Removing someone unassigns their chores and drops them from rotations." />
      {flash && <Notice kind={flash.kind} onDismiss={() => setFlash(null)}>{flash.text}</Notice>}
      <form className="card filters" onSubmit={add} noValidate>
        <Field label="Name" className="grow" error={err}>{(p) => <input {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />}</Field>
        <button className="btn btn-primary" type="submit">Add person</button>
      </form>
      {store.members.length === 0 ? <EmptyState title="Nobody yet">Add everyone who shares the chores.</EmptyState> : (
        <ul className="people">
          {store.members.map((m) => {
            const s = share.find((x) => x.member.id === m.id)!;
            return (
              <li key={m.id} className="card person" style={{ ['--c' as string]: m.color }}>
                <span className="avatar" aria-hidden="true">{m.name[0]}</span>
                <div className="grow-1">
                  <strong>{m.name}</strong>{m.demo && <> <DemoTag /></>}
                  <div className="small muted">{s.minutes} planned min / week · {Math.round(s.share * 100)}% of the load</div>
                </div>
                <label className="color-pick"><span className="sr-only">Colour for {m.name}</span><input type="color" value={m.color} onChange={(e) => setStore({ ...store, members: store.members.map((x) => (x.id === m.id ? { ...x, color: e.target.value } : x)) })} /></label>
                <button type="button" className="btn btn-sm btn-ghost" aria-label={`Remove ${m.name}`} onClick={() => { if (window.confirm(`Remove ${m.name}? Their chores become unassigned.`)) setStore({ ...store, members: store.members.filter((x) => x.id !== m.id), chores: removeMember(store.chores, m.id) }); }}>Remove</button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ---------- Summary ---------- */
function Summary({ store, today }: Ctx) {
  const start = weekStart(today);
  const rows = weekSummary(store.members, store.chores, store.completions, start, today);
  const planned = plannedShare(store.members, store.chores);
  const max = Math.max(1, ...rows.map((r) => Math.max(r.minutesAssigned, r.minutesDone)));
  const [tip, setTip] = useState<string | null>(null);
  if (store.members.length === 0) return <EmptyState title="Nothing to summarise" actions={<a className="btn btn-primary" href="#/people">Add people</a>}>Add people and chores first.</EmptyState>;
  return (
    <div className="stack">
      <PageHead eyebrow={`Week so far · ${formatDay(start, { day: 'numeric', month: 'short' })} – ${formatDay(today, { day: 'numeric', month: 'short' })}`} title={<>Who did <em>what.</em></>} description="Minutes are credited to whoever ticked the chore off, so cover and swaps show up honestly." />
      <section className="card stack" aria-labelledby="mins-title">
        <h2 id="mins-title" className="h3">Minutes this week</h2>
        <div className="hbars" role="img" aria-label={rows.map((r) => `${r.member.name}: ${r.minutesDone} of ${r.minutesAssigned} minutes done`).join('; ')} onMouseLeave={() => setTip(null)}>
          {rows.map((r, i) => (
            <div key={r.member.id} className="hbar-row" style={{ ['--i' as string]: i }}>
              <span className="hbar-name">{r.member.name}</span>
              <div className="hbar-track" tabIndex={0} onMouseEnter={() => setTip(`${r.member.name}: ${r.minutesDone} min done, ${r.minutesAssigned} min assigned`)} onFocus={() => setTip(`${r.member.name}: ${r.minutesDone} min done, ${r.minutesAssigned} min assigned`)} onBlur={() => setTip(null)}>
                <span className="hbar assigned" style={{ width: `${(r.minutesAssigned / max) * 100}%` }} />
                <span className="hbar done" style={{ width: `${(r.minutesDone / max) * 100}%`, background: r.member.color }} />
              </div>
              <span className="hbar-num mono">{r.minutesDone}<small>/{r.minutesAssigned}</small></span>
            </div>
          ))}
        </div>
        <p className="small" aria-live="polite">{tip ?? 'Hover or focus a bar for details.'}</p>
        <p className="legend"><span><i className="key-done" />Done (person’s colour)</span><span><i className="key-assigned" />Assigned so far</span><span className="muted">· minutes, Monday to today</span></p>
      </section>
      <section className="card stack" aria-labelledby="tbl-title">
        <h2 id="tbl-title" className="h3">Done vs assigned</h2>
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">Chores done and assigned per person this week</caption>
            <thead><tr><th scope="col">Person</th><th scope="col" className="num">Done</th><th scope="col" className="num">Assigned</th><th scope="col" className="num">Planned share</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.member.id}><th scope="row"><Chip m={r.member} /></th><td className="num">{r.done}</td><td className="num">{r.assigned}</td><td className="num">{Math.round((planned.find((p) => p.member.id === r.member.id)?.share ?? 0) * 100)}%</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
