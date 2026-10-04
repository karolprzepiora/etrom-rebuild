'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Progress = require('../src/core/progress.js');

// Stały punkt odniesienia: 15 czerwca 2026, czas lokalny.
const NOW = new Date(2026, 5, 15, 13, 45);

test('daysUntil liczy pełne dni kalendarzowe', () => {
  assert.equal(Progress.daysUntil('2026-06-15', NOW), 0);
  assert.equal(Progress.daysUntil('2026-06-16', NOW), 1);
  assert.equal(Progress.daysUntil('2026-06-22', NOW), 7);
  assert.equal(Progress.daysUntil('2026-07-15', NOW), 30);
  assert.equal(Progress.daysUntil('2026-06-14', NOW), -1);
});

test('daysUntil ignoruje godzinę w punkcie odniesienia', () => {
  const early = new Date(2026, 5, 15, 0, 1);
  const late = new Date(2026, 5, 15, 23, 59);
  assert.equal(Progress.daysUntil('2026-06-20', early), Progress.daysUntil('2026-06-20', late));
});

test('daysUntil zwraca null dla braku lub błędnej daty', () => {
  assert.equal(Progress.daysUntil('', NOW), null);
  assert.equal(Progress.daysUntil('2026-02-30', NOW), null);
  assert.equal(Progress.daysUntil(undefined, NOW), null);
});

test('deadlineInfo dobiera ton na granicach progów', () => {
  assert.equal(Progress.deadlineInfo('', NOW).tone, 'none');
  assert.equal(Progress.deadlineInfo('2026-06-14', NOW).tone, 'overdue');
  assert.equal(Progress.deadlineInfo('2026-06-15', NOW).tone, 'urgent');
  assert.equal(Progress.deadlineInfo('2026-06-22', NOW).tone, 'urgent');
  assert.equal(Progress.deadlineInfo('2026-06-23', NOW).tone, 'warning');
  assert.equal(Progress.deadlineInfo('2026-07-15', NOW).tone, 'warning');
  assert.equal(Progress.deadlineInfo('2026-07-16', NOW).tone, 'normal');
});

test('deadlineInfo opisuje termin po polsku', () => {
  assert.equal(Progress.deadlineInfo('2026-06-15', NOW).text, 'Termin dzisiaj');
  assert.equal(Progress.deadlineInfo('2026-06-16', NOW).text, 'Pozostało 1 dzień');
  assert.equal(Progress.deadlineInfo('2026-06-17', NOW).text, 'Pozostało 2 dni');
  assert.equal(Progress.deadlineInfo('2026-06-14', NOW).text, '1 dzień po terminie');
  assert.equal(Progress.deadlineInfo('2026-06-13', NOW).text, '2 dni po terminie');
  assert.equal(Progress.deadlineInfo('', NOW).text, 'Bez terminu');
});

test('projectProgress waży postęp godzinami etapów', () => {
  const project = {
    stages: [
      { id: 'a', status: 'done', hours: 10 },
      { id: 'b', status: 'todo', hours: 30 }
    ]
  };
  const stats = Progress.projectProgress(project);
  assert.equal(stats.percent, 25);
  assert.equal(stats.done, 1);
  assert.equal(stats.total, 2);
  assert.equal(stats.hoursDone, 10);
  assert.equal(stats.hoursTotal, 40);
});

test('projectProgress nie liczy etapów w toku jako zakończonych', () => {
  const stats = Progress.projectProgress({
    stages: [
      { status: 'working', hours: 50 },
      { status: 'done', hours: 50 }
    ]
  });
  assert.equal(stats.percent, 75); // domyślnie etap w toku bez zadań liczy się wg wagi 50%
  assert.equal(stats.done, 1);
  const strict = Progress.setRules({ method: 'done' });
  assert.equal(Progress.projectProgress({ stages: [{ status: 'working', hours: 50 }, { status: 'done', hours: 50 }] }).percent, 50);
  Progress.setRules({ method: 'auto', workingWeight: 0.5 });
  assert.equal(strict.method, 'done');
});

test('stageFraction: oszacowania zadań, liczba zadań, waga „w toku”', () => {
  const t = (status, estimate) => ({ status, estimate });
  assert.equal(Progress.stageFraction({ status: 'working', tasks: [t('done', 6), t('todo', 2)] }), 0.75);
  assert.equal(Progress.stageFraction({ status: 'working', tasks: [t('done'), t('todo'), t('todo'), t('todo')] }), 0.25);
  assert.equal(Progress.stageFraction({ status: 'working', tasks: [] }), 0.5);
  assert.equal(Progress.stageFraction({ status: 'working', tasks: [t('done', 5), t('done', 5)] }), 0.95);
  assert.equal(Progress.stageFraction({ status: 'todo' }), 0);
  assert.equal(Progress.stageFraction({ status: 'done' }), 1);
  assert.equal(Progress.stageFraction({ status: 'working', tasks: [t('done', 6), t('todo', 2)] }, { method: 'status', workingWeight: 0.3 }), 0.3);
});

test('projectProgress zaokrągla do pełnych procent', () => {
  const stats = Progress.projectProgress({
    stages: [
      { status: 'done', hours: 1 },
      { status: 'todo', hours: 1 },
      { status: 'todo', hours: 1 }
    ]
  });
  assert.equal(stats.percent, 33);
});

test('projectProgress bez etapów daje zero bez dzielenia przez zero', () => {
  assert.deepEqual(Progress.projectProgress({ stages: [] }), {
    percent: 0, done: 0, total: 0, hoursDone: 0, hoursTotal: 0
  });
  assert.equal(Progress.projectProgress(null).percent, 0);
  assert.equal(Progress.projectProgress({}).percent, 0);
});

test('projectProgress traktuje błędne godziny jako zero', () => {
  const stats = Progress.projectProgress({
    stages: [
      { status: 'done', hours: 'dużo' },
      { status: 'done', hours: 20 }
    ]
  });
  assert.equal(stats.hoursTotal, 20);
  assert.equal(stats.percent, 100);
});

test('isOverdue pomija projekty zakończone i bez terminu', () => {
  assert.equal(Progress.isOverdue({ status: 'active', deadline: '2026-06-14' }, NOW), true);
  assert.equal(Progress.isOverdue({ status: 'done', deadline: '2026-06-14' }, NOW), false);
  assert.equal(Progress.isOverdue({ status: 'active', deadline: '' }, NOW), false);
  assert.equal(Progress.isOverdue({ status: 'active', deadline: '2026-06-16' }, NOW), false);
  assert.equal(Progress.isOverdue(null, NOW), false);
});

test('activeStage wskazuje pierwszy etap w toku', () => {
  const project = {
    stages: [
      { id: 'a', status: 'done' },
      { id: 'b', status: 'working' },
      { id: 'c', status: 'working' },
      { id: 'd', status: 'todo' }
    ]
  };
  assert.equal(Progress.activeStage(project).id, 'b');
});

test('activeStage bez etapu w toku wskazuje pierwszy niezaczęty', () => {
  const project = {
    stages: [
      { id: 'a', status: 'done' },
      { id: 'b', status: 'done' },
      { id: 'c', status: 'todo' },
      { id: 'd', status: 'todo' }
    ]
  };
  assert.equal(Progress.activeStage(project).id, 'c');
});

test('activeStage przedkłada etap w toku nad wcześniejszy niezaczęty', () => {
  const project = {
    stages: [
      { id: 'a', status: 'todo' },
      { id: 'b', status: 'working' }
    ]
  };
  assert.equal(Progress.activeStage(project).id, 'b', 'praca trwająca jest ważniejsza niż kolejność');
});

test('activeStage zwraca null, gdy nie ma czego robić', () => {
  assert.equal(Progress.activeStage({ stages: [{ id: 'a', status: 'done' }] }), null);
  assert.equal(Progress.activeStage({ stages: [] }), null);
  assert.equal(Progress.activeStage(null), null);
  assert.equal(Progress.activeStage({}), null);
});

test('countdown: liczba dni do końca, po terminie i dziś', () => {
  const now = new Date(2026, 5, 15);
  assert.deepEqual(Progress.countdown('2026-07-10', now), { days: 25, tone: 'warning', number: 25, rest: 'dni do końca', text: '25 dni do końca' });
  assert.equal(Progress.countdown('2026-06-16', now).text, '1 dzień do końca');
  assert.equal(Progress.countdown('2026-06-20', now).tone, 'urgent');
  assert.equal(Progress.countdown('2026-12-01', now).tone, 'normal');
  assert.equal(Progress.countdown('2026-06-15', now).text, 'termin dzisiaj');
  assert.equal(Progress.countdown('2026-06-15', now).number, null);
  assert.equal(Progress.countdown('2026-06-12', now).text, '3 dni po terminie');
  assert.equal(Progress.countdown('2026-06-14', now).text, '1 dzień po terminie');
  assert.equal(Progress.countdown('2026-06-12', now).tone, 'overdue');
  assert.equal(Progress.countdown('', now).days, null);
  assert.equal(Progress.countdown('', now).text, '');
});
