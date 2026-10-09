/* ETROM — dane „z zewnątrz” na Pulpit: pogoda i stany wód.
   Na razie PRZYKŁADOWE (sample:true) i deterministyczne; struktura jest gotowa pod prawdziwe źródło
   (np. IMGW), które zwróci ten sam kształt z sample:false. Czyste funkcje, bez DOM. */
(function (root) {
  'use strict';

  var node = typeof module !== 'undefined' && module.exports;

  var DOW = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So'];
  var SKY = [
    { icon: 'sun', label: 'Słonecznie' }, { icon: 'cloud-sun', label: 'Częściowe zachmurzenie' },
    { icon: 'cloud', label: 'Pochmurno' }, { icon: 'rain', label: 'Przelotny deszcz' }
  ];

  function seedOf(text) { var h = 7; String(text).split('').forEach(function (c) { h = (h * 31 + c.charCodeAt(0)) % 9973; }); return h; }

  /** Pogoda dla miasta: teraz + 4 kolejne dni. */
  function weather(city, now) {
    var ref = now instanceof Date ? now : new Date();
    var name = city || 'Kraków';
    var seed = seedOf(name + ref.getFullYear() + '-' + ref.getMonth() + '-' + ref.getDate());
    var base = 8 + (ref.getMonth() >= 4 && ref.getMonth() <= 8 ? 10 : (ref.getMonth() === 9 || ref.getMonth() === 3 ? 3 : -6));
    var days = [];
    for (var i = 0; i < 5; i += 1) {
      var d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + i);
      var s = (seed + i * 37) % 97;
      var sky = SKY[s % SKY.length];
      days.push({ dow: DOW[d.getDay()], max: base + (s % 5), min: base - 4 - (s % 3), icon: sky.icon, label: sky.label });
    }
    return { sample: true, city: name, temp: days[0].max - 1, icon: days[0].icon, label: days[0].label, wind: 8 + (seed % 14), days: days.slice(1) };
  }

  var STATIONS = [
    { river: 'Wisła', station: 'Kraków-Bulwary', base: 170, warn: 300, alarm: 380 },
    { river: 'Raba', station: 'Stróża', base: 92, warn: 190, alarm: 240 },
    { river: 'Dunajec', station: 'Nowy Sącz', base: 120, warn: 230, alarm: 290 }
  ];

  function statusOf(level, st) { return level >= st.alarm ? 'alarm' : (level >= st.warn ? 'warn' : 'ok'); }

  /** Stany wód: 3 przykładowe stacje, 12 odczytów (co 2 h), status wg progów. */
  function waterLevels(now) {
    var ref = now instanceof Date ? now : new Date();
    return STATIONS.map(function (st, k) {
      var seed = seedOf(st.station + ref.getDate());
      var series = [];
      for (var i = 0; i < 12; i += 1) series.push(Math.round(st.base + ((seed + i * 13 * (k + 1)) % 17) - 8 + i * (k === 1 ? 1.5 : 0.4)));
      var level = series[series.length - 1];
      var diff = level - series[series.length - 4];
      return { sample: true, river: st.river, station: st.station, level: level, unit: 'cm', series: series, trend: diff > 3 ? 'up' : (diff < -3 ? 'down' : 'flat'), status: statusOf(level, st), warn: st.warn, alarm: st.alarm };
    });
  }

  var api = { weather: weather, waterLevels: waterLevels, statusOf: statusOf };
  if (node) module.exports = api;
  else { root.ETROM = root.ETROM || {}; root.ETROM.Ambient = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
