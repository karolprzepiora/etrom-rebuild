/* ETROM — paleta poleceń (Ctrl+K): skok do projektu albo uruchomienie działania. */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;
  var Icons = E.Icons;
  var Search = root.ETROM.Search;
  var Progress = root.ETROM.Progress;
  var Team = root.ETROM.Team;

  var MAX_PROJECTS = 6;
  var MAX_COMMANDS = 8;
  var openDialog = null;

  function projectEntry(project, onProject) {
    var stats = Progress.projectProgress(project);
    return {
      icon: 'folder',
      leading: E.Sig ? E.Sig.datum(E.Insight.health(project).level, { label: false }) : null,
      label: project.name,
      meta: project.code + ' · ' + (project.client || 'bez zamawiającego') + ' · ' + stats.percent + '%',
      run: function () { onProject(project); }
    };
  }


  function buildEntries(options, query) {
    var projects = Search.rank(
      options.projects || [],
      query,
      function (p) { return [p.code, p.name, p.client]; },
      MAX_PROJECTS
    ).map(function (project) { return projectEntry(project, options.onProject); });

    var commands = Search.rank(
      options.commands || [],
      query,
      function (c) { return [c.label, c.keywords || '']; },
      MAX_COMMANDS
    ).map(function (command) {
      return { icon: command.icon || 'chevron', label: command.label, meta: command.meta || '', run: command.run };
    });

    var persons = options.onPerson
      ? Search.rank(
          options.people || [], query,
          function (person) { return [Team.fullName(person), person.position]; },
          5
        ).map(function (person) {
          return {
            icon: 'people',
            label: Team.fullName(person),
            meta: [person.position, Team.ORG_ROLES[person.orgRole]].filter(Boolean).join(' · '),
            run: function () { options.onPerson(person); }
          };
        })
      : [];

    var groups = [];
    if (projects.length) groups.push({ title: 'Projekty', entries: projects });
    if (persons.length) groups.push({ title: 'Osoby', entries: persons });
    if (commands.length) groups.push({ title: 'Działania', entries: commands });
    return groups;
  }

  /**
   * @param {{projects: Array, commands: Array, onProject: Function}} options
   */
  function open(options) {
    if (openDialog) return;

    var entries = [];
    var active = 0;

    var input = D.el('input', {
      class: 'palette__input',
      attrs: {
        type: 'text',
        placeholder: 'Szukaj projektu, osoby albo działania…',
        'aria-label': 'Szukaj projektu, osoby albo działania',
        role: 'combobox',
        'aria-expanded': 'true',
        'aria-controls': 'palette-list',
        'aria-autocomplete': 'list',
        autocomplete: 'off',
        spellcheck: 'false'
      }
    });

    var list = D.el('div', { class: 'palette__list', attrs: { role: 'listbox', id: 'palette-list', 'aria-label': 'Wyniki' } });
    var empty = D.el('p', { class: 'palette__empty', text: 'Brak wyników. Spróbuj kodu projektu, nazwiska albo słowa „motyw”.' });

    function hint(keys, text) {
      return D.el('span', null, keys.map(function (k) { return D.el('kbd', { class: 'kbd', text: k }); }).concat([D.el('span', { text: text })]));
    }

    var dialog = D.el('dialog', {
      class: 'palette',
      attrs: { 'aria-label': 'Szukaj i działaj' }
    }, [
      D.el('div', { class: 'palette__card' }, [
        D.el('div', { class: 'palette__bar' }, [Icons.icon('search', 18), input, D.el('kbd', { class: 'kbd', text: 'Esc' })]),
        list,
        D.el('div', { class: 'palette__foot', attrs: { 'aria-hidden': 'true' } }, [
          hint(['↑', '↓'], 'wybór'),
          hint(['Enter'], 'otwórz'),
          hint(['Esc'], 'zamknij')
        ])
      ])
    ]);

    // Jedno podświetlenie przesuwa się między wynikami zamiast migać na każdym z osobna.
    var highlight = D.el('div', { class: 'palette__highlight', attrs: { 'aria-hidden': 'true' } });

    function moveHighlight(row) {
      if (!row) { highlight.style.opacity = '0'; return; }
      highlight.style.opacity = '1';
      highlight.style.transform = 'translateY(' + row.offsetTop + 'px)';
      highlight.style.height = row.offsetHeight + 'px';
    }

    function setActive(index) {
      active = Math.max(0, Math.min(entries.length - 1, index));
      var rows = list.querySelectorAll('.palette__row');
      moveHighlight(rows[active]);
      for (var i = 0; i < rows.length; i += 1) {
        var on = i === active;
        rows[i].classList.toggle('palette__row--active', on);
        rows[i].setAttribute('aria-selected', String(on));
        if (on) {
          input.setAttribute('aria-activedescendant', rows[i].id);
          if (rows[i].scrollIntoView) rows[i].scrollIntoView({ block: 'nearest' });
        }
      }
    }

    function draw() {
      var groups = buildEntries(options, input.value);
      entries = [];
      var children = [];

      groups.forEach(function (group) {
        children.push(D.el('p', { class: 'palette__group', text: group.title, attrs: { role: 'presentation' } }));
        group.entries.forEach(function (entry) {
          var index = entries.length;
          entries.push(entry);
          children.push(D.el('div', {
            class: 'palette__row',
            attrs: { role: 'option', 'aria-selected': 'false', id: 'palette-opt-' + index },
            on: {
              mousemove: function () { setActive(index); },
              click: function () { run(index); }
            }
          }, [
            entry.leading || Icons.icon(entry.icon, 16),
            D.el('span', { class: 'palette__rowBody' }, [
              D.el('span', { class: 'palette__rowLabel', text: entry.label }),
              entry.meta ? D.el('span', { class: 'palette__rowMeta', text: entry.meta }) : null
            ].filter(Boolean)),
            D.el('span', { class: 'palette__rowEnter' }, [Icons.icon('enter', 14)])
          ]));
        });
      });

      if (!children.length) children.push(empty);
      D.render(list, [highlight].concat(children));
      setActive(0);
    }

    function run(index) {
      var entry = entries[index];
      if (!entry) return;
      dialog.close('run');
      entry.run();
    }

    input.addEventListener('input', draw);

    dialog.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActive(active + 1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActive(active - 1);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        run(active);
      }
    });

    dialog.addEventListener('click', function (event) {
      if (event.target === dialog) dialog.close('cancel');
    });

    dialog.addEventListener('close', function () {
      dialog.remove();
      openDialog = null;
      document.body.style.overflow = '';
    });

    openDialog = dialog;
    document.body.appendChild(dialog);
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    draw();
    input.focus();
  }

  function isOpen() {
    return !!openDialog;
  }

  root.ETROM.Palette = { open: open, isOpen: isOpen };
})(typeof globalThis !== 'undefined' ? globalThis : this);
