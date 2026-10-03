/* ETROM — zdarzenia projektowe do „Aktualności”: etap zakończony, zmiana stanu projektu,
   zamknięcie / wstrzymanie / wznowienie. Czyste funkcje, bez DOM.
   Aplikacja porównuje poprzedni i bieżący stan (snapshot) i dopisuje zdarzenia do social.events;
   ostatnio widziany poziom stanu projektu jest zapisany (social.health), więc zmiana, która nastąpiła
   między sesjami (np. minął termin), też zostanie zauważona. */
(function (root) {
  'use strict';

  var node = typeof module !== 'undefined' && module.exports;
  var Insight = node ? require('./insight.js') : root.ETROM.Insight;
  var Model = node ? require('./model.js') : root.ETROM.Model;

  var RANK = { alarm: 0, warning: 1, normal: 2 };
  // Ten sam poziom nie wraca do strumienia częściej niż co tyle godzin (ochrona przed „migotaniem”).
  var REPEAT_HOURS = 12;

  var HEALTH_TITLE = {
    warning: 'Projekt przeszedł w stan ostrzegawczy',
    alarm: 'Projekt przeszedł w stan alarmowy',
    normal: 'Projekt wrócił do normy'
  };

  /** Odcisk stanu portfela: status projektu, statusy etapów i poziom stanu. */
  function snapshot(projects, now) {
    var out = {};
    (projects || []).forEach(function (p) {
      var stages = {};
      (p.stages || []).forEach(function (st) { stages[st.id] = st.status; });
      out[p.id] = { status: p.status, stages: stages, level: Insight.health(p, now).level };
    });
    return out;
  }

  function stageName(project, id) {
    var st = (project.stages || []).filter(function (x) { return x.id === id; })[0];
    return st ? Model.describeStage(st).name : '';
  }

  function nextStageName(project, id) {
    var list = project.stages || [];
    var i = list.findIndex(function (x) { return x.id === id; });
    for (var k = i + 1; k < list.length; k += 1) if (list[k].status !== 'done') return Model.describeStage(list[k]).name;
    return '';
  }

  /**
   * @param {Object} prev snapshot poprzedni (null → brak zdarzeń)
   * @param {Array} projects bieżące projekty
   * @param {Date} now
   * @param {{actorId?: string, health?: Object<string,string>, recent?: Array}} [ctx]
   *   health — ostatnio widziane poziomy (z social.health), recent — dotychczasowe zdarzenia (do ochrony przed powtórkami)
   * @returns {{events: Array, snapshot: Object, health: Object}}
   */
  function detect(prev, projects, now, ctx) {
    var o = ctx || {};
    var ref = now instanceof Date ? now : new Date();
    var next = snapshot(projects, ref);
    var seenHealth = o.health || {};
    var events = [];
    var health = {};
    var at = ref.toISOString();

    (projects || []).forEach(function (project) {
      var before = prev && prev[project.id];
      var after = next[project.id];
      health[project.id] = after.level === 'closed' ? (seenHealth[project.id] || 'normal') : after.level;

      if (before) {
        // Zakończone etapy.
        (project.stages || []).forEach(function (st) {
          if (st.status === 'done' && before.stages[st.id] && before.stages[st.id] !== 'done') {
            var following = nextStageName(project, st.id);
            events.push({ event: 'stage-done', projectId: project.id, stageId: st.id, at: at, actorId: o.actorId || '', level: 'normal',
              title: 'Etap zakończony', text: stageName(project, st.id), detail: following ? 'Następny etap: ' + following : 'To był ostatni etap' });
          }
        });
        // Status projektu.
        if (before.status !== project.status) {
          if (project.status === 'done') events.push({ event: 'project-done', projectId: project.id, at: at, actorId: o.actorId || '', level: 'normal', title: 'Projekt zakończony', text: project.name, detail: '' });
          else if (project.status === 'paused') events.push({ event: 'project-paused', projectId: project.id, at: at, actorId: o.actorId || '', level: 'warning', title: 'Projekt wstrzymany', text: project.name, detail: '' });
          else if (before.status === 'paused' && project.status === 'active') events.push({ event: 'project-resumed', projectId: project.id, at: at, actorId: o.actorId || '', level: 'normal', title: 'Projekt wznowiony', text: project.name, detail: '' });
        }
      }

      // Zmiana poziomu stanu: względem poprzedniego odcisku albo ostatnio zapisanego poziomu.
      var was = before ? (before.level === 'closed' ? null : before.level) : (seenHealth[project.id] || null);
      var now2 = after.level;
      if (was && now2 !== 'closed' && was !== now2 && RANK[was] !== undefined && RANK[now2] !== undefined) {
        var repeated = (o.recent || []).some(function (e) {
          return e.event === 'health' && e.projectId === project.id && e.level === now2 && ref.getTime() - Date.parse(e.at) < REPEAT_HOURS * 3600000;
        });
        if (!repeated) {
          var reasons = Insight.health(project, ref).reasons;
          events.push({
            event: 'health', projectId: project.id, at: at, actorId: '', level: now2, title: HEALTH_TITLE[now2],
            text: now2 === 'normal' ? 'Terminy, harmonogram, zadania i pisma są w normie.' : (reasons[0] ? reasons[0].text : ''),
            detail: now2 !== 'normal' && reasons.length > 1 ? 'Powodów: ' + reasons.length : ''
          });
        }
      }
    });

    return { events: events, snapshot: next, health: health };
  }

  var api = { snapshot: snapshot, detect: detect, REPEAT_HOURS: REPEAT_HOURS, HEALTH_TITLE: HEALTH_TITLE, stageName: stageName, nextStageName: nextStageName };
  if (node) module.exports = api;
  else { root.ETROM = root.ETROM || {}; root.ETROM.Events = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
