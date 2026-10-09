/* ETROM — katalog osób i funkcje w projektach.
   Czyste funkcje, bez DOM. Funkcja jest relacją osoba ↔ projekt opartą
   o stabilny identyfikator, nie o wpisane imię i nazwisko. */
(function (root) {
  'use strict';

  var ORG_ROLES = {
    managing: 'Zarządzający',
    member: 'Członek zespołu'
  };

  var COOPERATION = {
    internal: 'Pracownik',
    external: 'Współpracownik zewnętrzny',
    consultant: 'Konsultant'
  };

  // Cztery funkcje jednoosobowe i otwarta lista członków zespołu.
  var FUNCTIONS = [
    { key: 'leader', label: 'Lider', short: 'Lider', single: true },
    { key: 'coordinator', label: 'Koordynator', short: 'Koordynator', single: true },
    { key: 'proxyLead', label: 'Pełnomocnik wiodący', short: 'Pełn. wiodący', single: true },
    { key: 'proxyExtra', label: 'Pełnomocnik dodatkowy', short: 'Pełn. dodatkowy', single: true }
  ];

  var SINGLE_KEYS = FUNCTIONS.map(function (f) { return f.key; });
  var LIMITS = { name: 80, position: 120 };

  function text(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function emptyTeam() {
    return { leader: '', coordinator: '', proxyLead: '', proxyExtra: '', members: [] };
  }

  function fullName(person) {
    if (!person) return '';
    return (text(person.firstName) + ' ' + text(person.lastName)).trim();
  }

  function nextPersonId(people) {
    var max = 0;
    (people || []).forEach(function (person) {
      var match = /^p-(\d+)$/.exec(String(person && person.id));
      if (match) max = Math.max(max, Number(match[1]));
    });
    return 'p-' + (max + 1);
  }

  /**
   * @returns {{valid: boolean, errors: Object, value: Object}}
   */
  function validatePerson(input, people, ignoreId) {
    var data = input || {};
    var list = Array.isArray(people) ? people : [];
    var errors = {};

    var firstName = text(data.firstName);
    var lastName = text(data.lastName);
    var position = text(data.position);
    var orgRole = text(data.orgRole) || 'member';
    var cooperation = text(data.cooperation) || 'internal';

    if (!firstName) errors.firstName = 'Podaj imię.';
    else if (firstName.length > LIMITS.name) errors.firstName = 'Imię może mieć najwyżej ' + LIMITS.name + ' znaków.';

    if (!lastName) errors.lastName = 'Podaj nazwisko.';
    else if (lastName.length > LIMITS.name) errors.lastName = 'Nazwisko może mieć najwyżej ' + LIMITS.name + ' znaków.';

    if (position.length > LIMITS.position) errors.position = 'Stanowisko może mieć najwyżej ' + LIMITS.position + ' znaków.';
    if (!Object.prototype.hasOwnProperty.call(ORG_ROLES, orgRole)) errors.orgRole = 'Wybierz rolę w organizacji.';
    if (!Object.prototype.hasOwnProperty.call(COOPERATION, cooperation)) errors.cooperation = 'Wybierz formę współpracy.';
    var costRaw = data.hourlyCost == null ? '' : String(data.hourlyCost).trim().replace(',', '.');
    var hourlyCost = 0;
    if (costRaw !== '') {
      hourlyCost = Number(costRaw);
      if (!Number.isFinite(hourlyCost) || hourlyCost < 0 || hourlyCost > 10000) errors.hourlyCost = 'Podaj koszt godziny od 0 do 10 000 zł.';
      else hourlyCost = Math.round(hourlyCost * 100) / 100;
    }

    if (!errors.firstName && !errors.lastName) {
      var candidate = (firstName + ' ' + lastName).toLocaleLowerCase('pl');
      var clash = list.some(function (person) {
        return person.id !== ignoreId && fullName(person).toLocaleLowerCase('pl') === candidate;
      });
      if (clash) errors.lastName = 'Taka osoba już jest w katalogu.';
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors: errors,
      value: {
        firstName: firstName,
        lastName: lastName,
        position: position,
        orgRole: orgRole,
        cooperation: cooperation,
        hourlyCost: hourlyCost
      }
    };
  }

  function createPerson(input, people) {
    var check = validatePerson(input, people);
    if (!check.valid) throw new Error('Dane osoby są niepoprawne.');
    return Object.assign({ id: nextPersonId(people), active: true }, check.value);
  }

  function normalizePerson(raw, taken) {
    if (!raw || typeof raw !== 'object') return null;
    var firstName = text(raw.firstName);
    var lastName = text(raw.lastName);
    if (!firstName && !lastName) return null;

    var id = text(raw.id);
    if (!id || taken[id]) return null;

    var orgRole = text(raw.orgRole);
    var cooperation = text(raw.cooperation);

    return {
      id: id,
      firstName: firstName,
      lastName: lastName,
      position: text(raw.position),
      orgRole: Object.prototype.hasOwnProperty.call(ORG_ROLES, orgRole) ? orgRole : 'member',
      cooperation: Object.prototype.hasOwnProperty.call(COOPERATION, cooperation) ? cooperation : 'internal',
      hourlyCost: Number.isFinite(Number(raw.hourlyCost)) && Number(raw.hourlyCost) > 0 && Number(raw.hourlyCost) <= 10000 ? Math.round(Number(raw.hourlyCost) * 100) / 100 : 0,
      leaveDays: Number.isFinite(Number(raw.leaveDays)) && Number(raw.leaveDays) > 0 && Number(raw.leaveDays) <= 60 ? Math.round(Number(raw.leaveDays)) : null,
      active: raw.active !== false
    };
  }

  /** Czyści katalog osób wczytany z dysku. Nigdy nie rzuca. */
  function normalizePeople(raw) {
    var list = Array.isArray(raw) ? raw : [];
    var taken = {};
    var people = [];
    list.forEach(function (item) {
      var person = normalizePerson(item, taken);
      if (!person) return;
      taken[person.id] = true;
      people.push(person);
    });
    return people;
  }

  /**
   * Czyści przypisania funkcji: zostają tylko osoby istniejące w katalogu,
   * bez powtórzeń w członkach i bez członka, który i tak pełni funkcję.
   */
  function normalizeTeam(raw, people) {
    var known = {};
    (people || []).forEach(function (person) { known[person.id] = true; });
    var source = (raw && typeof raw === 'object') ? raw : {};
    var team = emptyTeam();

    SINGLE_KEYS.forEach(function (key) {
      var id = text(source[key]);
      if (id && known[id]) team[key] = id;
    });

    var named = {};
    SINGLE_KEYS.forEach(function (key) { if (team[key]) named[team[key]] = true; });

    var members = Array.isArray(source.members) ? source.members : [];
    members.forEach(function (id) {
      var value = text(id);
      if (!value || !known[value] || named[value]) return;
      if (team.members.indexOf(value) >= 0) return;
      team.members.push(value);
    });

    return team;
  }

  /** Wszystkie osoby związane z projektem, bez powtórzeń, w stałej kolejności. */
  function projectPeople(team) {
    var source = team || emptyTeam();
    var result = [];
    SINGLE_KEYS.forEach(function (key) {
      if (source[key] && result.indexOf(source[key]) < 0) result.push(source[key]);
    });
    (source.members || []).forEach(function (id) {
      if (id && result.indexOf(id) < 0) result.push(id);
    });
    return result;
  }

  /** Funkcje pełnione przez osobę w danym projekcie. */
  function functionsOf(personId, team) {
    var source = team || emptyTeam();
    var result = [];
    FUNCTIONS.forEach(function (fn) {
      if (source[fn.key] === personId) result.push(fn);
    });
    if ((source.members || []).indexOf(personId) >= 0) {
      result.push({ key: 'member', label: 'Członek zespołu', short: 'Zespół', single: false });
    }
    return result;
  }

  function findPerson(people, id) {
    var list = Array.isArray(people) ? people : [];
    for (var i = 0; i < list.length; i += 1) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  /** Projekty, w których osoba cokolwiek pełni. */
  function projectsOfPerson(projects, personId) {
    return (projects || []).filter(function (project) {
      return projectPeople(project.team).indexOf(personId) >= 0;
    });
  }

  /**
   * Czy osobę można wyłączyć z obiegu. Blokada, dopóki pełni funkcję
   * w projekcie, który nie jest zakończony.
   * @returns {{allowed: boolean, reason: string, projects: Array}}
   */
  function canDeactivate(personId, projects) {
    var blocking = projectsOfPerson(projects, personId).filter(function (project) {
      return project.status !== 'done';
    });
    if (!blocking.length) return { allowed: true, reason: '', projects: [] };
    var codes = blocking.map(function (p) { return p.code; }).join(', ');
    return {
      allowed: false,
      reason: 'Osoba pełni funkcje w niezakończonych projektach: ' + codes + '. Zdejmij ją z nich przed wyłączeniem.',
      projects: blocking
    };
  }

  /** Zdejmuje osobę ze wszystkich funkcji w projekcie. */
  function releasePerson(team, personId) {
    var source = team || emptyTeam();
    var result = emptyTeam();
    SINGLE_KEYS.forEach(function (key) {
      var current = text(source[key]);
      result[key] = current === personId ? '' : current;
    });
    result.members = (source.members || []).filter(function (id) { return id !== personId; });
    return result;
  }

  var api = {
    ORG_ROLES: ORG_ROLES,
    COOPERATION: COOPERATION,
    FUNCTIONS: FUNCTIONS,
    SINGLE_KEYS: SINGLE_KEYS,
    emptyTeam: emptyTeam,
    fullName: fullName,
    nextPersonId: nextPersonId,
    validatePerson: validatePerson,
    createPerson: createPerson,
    normalizePeople: normalizePeople,
    normalizeTeam: normalizeTeam,
    projectPeople: projectPeople,
    functionsOf: functionsOf,
    findPerson: findPerson,
    projectsOfPerson: projectsOfPerson,
    canDeactivate: canDeactivate,
    releasePerson: releasePerson
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.ETROM = root.ETROM || {}; root.ETROM.Team = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
