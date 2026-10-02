/* ETROM — paleta poleceń (Ctrl+K): skok do projektu albo uruchomienie działania. */
(function (root) {
  'use strict';

  var D = root.ETROM.Dom;
  var Icons = root.ETROM.Icons;
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
        placeholder: 'Szukaj projektu albo wpisz działanie',
        'aria-label': 'Szukaj projektu albo działania',
        autocomplete: 'off',
        spellcheck: 'false'
      }
    });

    var list = D.el('div', { class: 'palette__list', attrs: { role: 'listbox' } });
    var empty = D.el('p', { class: 'palette__empty', text: 'Nic nie pasuje do tego, co wpisałeś.' });

    var dialog = D.el('dialog', {
      class: 'palette',
      attrs: { 'aria-label': 'Paleta poleceń' }
    }, [
      D.el('div', { class: 'palette__card' }, [
        D.el('div', { class: 'palette__bar' }, [
          D.el('span', { class: 'palette__icon' }, [Icons.icon('search', 18)]),
          input,
          D.el('kbd', { class: 'kbd', text: 'Esc' })
        ]),
        list
      ])
    ]);

    function setActive(index) {
      active = Math.max(0, Math.min(entries.length - 1, index));
      var rows = list.querySelectorAll('.palette__row');
      for (var i = 0; i < rows.length; i += 1) {
        var on = i === active;
        rows[i].classList.toggle('palette__row--active', on);
        rows[i].setAttribute('aria-selected', String(on));
        if (on && rows[i].scrollIntoView) rows[i].scrollIntoView({ block: 'nearest' });
      }
    }

    function draw() {
      var groups = buildEntries(options, input.value);
      entries = [];
      var children = [];

      groups.forEach(function (group) {
        children.push(D.el('p', { class: 'palette__group', text: group.title }));
        group.entries.forEach(function (entry) {
          var index = entries.length;
          entries.push(entry);
          children.push(D.el('div', {
            class: 'palette__row',
            attrs: { role: 'option', 'aria-selected': 'false' },
            on: {
              mousemove: function () { setActive(index); },
              click: function () { run(index); }
            }
          }, [
            D.el('span', { class: 'palette__rowIcon' }, [Icons.icon(entry.icon, 16)]),
            D.el('span', { class: 'palette__rowBody' }, [
              D.el('span', { class: 'palette__rowLabel', text: entry.label }),
              entry.meta ? D.el('span', { class: 'palette__rowMeta', text: entry.meta }) : null
            ].filter(Boolean))
          ]));
        });
      });

      if (!children.length) children.push(empty);
      D.render(list, children);
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
