/* ETROM — awatary osób. Barwa wynika z identyfikatora, więc ta sama
   osoba zawsze ma ten sam kolor, a sąsiednie osoby różne. */
(function (root) {
  'use strict';

  var D = root.ETROM.Dom;
  var Identity = root.ETROM.Identity;
  var Team = root.ETROM.Team;

  /**
   * @param {Object} person
   * @param {{size?: string, title?: string}} [options] size: 'sm' | 'md' | 'lg'
   */
  function avatar(person, options) {
    var settings = options || {};
    var name = Team.fullName(person);
    var inactive = person && person.active === false;

    return D.el('span', {
      class: 'avatar avatar--' + (settings.size || 'md') + (inactive ? ' avatar--off' : ''),
      style: { '--avatar-h': String(Identity.hue(person ? person.id : '')) },
      text: Identity.initials(name),
      attrs: {
        title: settings.title || (name + (inactive ? ' — wyłączona' : '')),
        'aria-hidden': settings.decorative === false ? null : 'true'
      }
    });
  }

  /**
   * Stos awatarów z licznikiem pozostałych osób.
   * @param {Array} people
   * @param {{max?: number, size?: string}} [options]
   */
  function avatarStack(people, options) {
    var settings = options || {};
    var max = settings.max || 4;
    var list = (people || []).filter(Boolean);
    var shown = list.slice(0, max);
    var rest = list.length - shown.length;

    var children = shown.map(function (person) {
      return avatar(person, { size: settings.size || 'sm' });
    });

    if (rest > 0) {
      children.push(D.el('span', {
        class: 'avatar avatar--' + (settings.size || 'sm') + ' avatar--rest',
        text: '+' + rest,
        attrs: {
          title: list.slice(max).map(function (p) { return Team.fullName(p); }).join(', ')
        }
      }));
    }

    return D.el('span', {
      class: 'avatars',
      attrs: { 'aria-label': list.length ? 'Zespół: ' + list.map(function (p) { return Team.fullName(p); }).join(', ') : 'Brak przypisanych osób' }
    }, children);
  }

  root.ETROM.Avatar = { avatar: avatar, avatarStack: avatarStack };
})(typeof globalThis !== 'undefined' ? globalThis : this);
