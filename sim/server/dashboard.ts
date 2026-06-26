// Self-contained live dashboard served at GET '/'. Fetches /aggregate?source=…
// and renders the four telemetry layers (§6): difficulty/win-rate, economy
// faucets/sinks, progression actions, pacing — plus content tables. No build
// step, no external deps; vanilla JS builds the DOM (no template-literal nesting).

export const DASHBOARD_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Synergy Grid TD — Telemetry</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; background: #0e1116; color: #d7dde6; font: 14px/1.45 system-ui, sans-serif; }
  header { padding: 16px 22px; border-bottom: 1px solid #232a34; display: flex; gap: 18px; align-items: center; flex-wrap: wrap; }
  h1 { font-size: 17px; margin: 0; color: #f0c674; letter-spacing: .04em; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .08em; color: #8aa0b8; margin: 26px 22px 8px; }
  .meta { color: #6b7889; font-size: 12px; }
  select, button { background: #1a212b; color: #d7dde6; border: 1px solid #2c3540; border-radius: 6px; padding: 6px 10px; font: inherit; }
  button { cursor: pointer; }
  table { width: calc(100% - 44px); margin: 0 22px; border-collapse: collapse; }
  th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid #1c2430; vertical-align: middle; }
  th { color: #7c8aa0; font-weight: 600; font-size: 12px; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .bar { position: relative; height: 14px; background: #1c2430; border-radius: 7px; overflow: hidden; min-width: 90px; }
  .bar > span { position: absolute; inset: 0 auto 0 0; border-radius: 7px; }
  .tag { font-size: 11px; padding: 1px 7px; border-radius: 9px; border: 1px solid #2c3540; color: #9fb0c4; }
  .tag.user { color: #8fd6a0; border-color: #2f5c3b; }
  .tag.bot { color: #8fb8f0; border-color: #2f4a6e; }
  .spark { display: inline-flex; gap: 2px; align-items: flex-end; height: 22px; }
  .spark i { width: 7px; background: #c0563f; border-radius: 1px; display: inline-block; }
  .empty { color: #6b7889; margin: 40px 22px; }
  code { color: #9fb0c4; }
</style>
</head>
<body>
<header>
  <h1>SYNERGY GRID TD · TELEMETRY</h1>
  <label>config
    <select id="config"><option value="all">all</option></select>
  </label>
  <label>compare
    <select id="configB"><option value="">—</option></select>
  </label>
  <label>source
    <select id="source">
      <option value="all">all</option>
      <option value="user">user</option>
      <option value="bot">bot</option>
    </select>
  </label>
  <button id="refresh">refresh</button>
  <span class="meta" id="meta"></span>
</header>
<main id="root"></main>
<script>
(function () {
  var root = document.getElementById('root');
  var meta = document.getElementById('meta');
  var sourceSel = document.getElementById('source');

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function pct(x) { return Math.round(x * 100); }
  function round(x, d) { var p = Math.pow(10, d || 0); return Math.round(x * p) / p; }
  function srcTag(s) { var t = el('span', 'tag ' + s, s); return t; }

  function bar(frac, color) {
    var b = el('div', 'bar');
    var s = el('span');
    s.style.width = Math.max(0, Math.min(100, pct(frac))) + '%';
    s.style.background = color || '#5a7fd0';
    b.appendChild(s);
    return b;
  }

  function sumVals(rec) { var t = 0; for (var k in rec) t += rec[k]; return t; }

  function mapTable(title, rec) {
    var keys = Object.keys(rec).sort(function (a, b) { return rec[b] - rec[a]; });
    var wrap = el('div');
    wrap.appendChild(el('h2', null, title));
    if (!keys.length) { wrap.appendChild(el('div', 'empty', 'no data')); return wrap; }
    var max = rec[keys[0]] || 1;
    var t = el('table');
    keys.forEach(function (k) {
      var tr = el('tr');
      tr.appendChild(el('td', null, k));
      var bcell = el('td'); bcell.appendChild(bar(rec[k] / max, '#c0843f')); tr.appendChild(bcell);
      tr.appendChild(el('td', 'num', String(round(rec[k], 1))));
      t.appendChild(tr);
    });
    wrap.appendChild(t);
    return wrap;
  }

  function deathSpark(deaths) {
    var waves = Object.keys(deaths).map(Number).sort(function (a, b) { return a - b; });
    var max = 1; waves.forEach(function (w) { if (deaths[w] > max) max = deaths[w]; });
    var s = el('span', 'spark');
    waves.forEach(function (w) {
      var i = el('i');
      i.style.height = Math.max(3, Math.round((deaths[w] / max) * 22)) + 'px';
      i.title = 'wave ' + w + ': ' + deaths[w];
      s.appendChild(i);
    });
    return s;
  }

  function difficultyTable(stages) {
    var wrap = el('div');
    wrap.appendChild(el('h2', null, 'Сложность · win-rate / где умирают / утечки'));
    var t = el('table');
    var head = el('tr');
    ['stage', 'src', 'attempts', 'win-rate', 'avg core', 'leak-rate', 'deaths by wave'].forEach(function (h) {
      head.appendChild(el('th', null, h));
    });
    t.appendChild(head);
    Object.keys(stages).sort().forEach(function (stage) {
      var bySrc = stages[stage];
      Object.keys(bySrc).sort().forEach(function (src) {
        var m = bySrc[src];
        var tr = el('tr');
        tr.appendChild(el('td', null, stage));
        var sc = el('td'); sc.appendChild(srcTag(src)); tr.appendChild(sc);
        tr.appendChild(el('td', 'num', String(m.attempts)));
        var wr = el('td');
        wr.appendChild(bar(m.winRate, m.winRate >= 0.55 && m.winRate <= 0.7 ? '#5fae6b' : '#c0563f'));
        wr.appendChild(el('span', null, ' ' + pct(m.winRate) + '%'));
        tr.appendChild(wr);
        tr.appendChild(el('td', 'num', round(m.avgCoreHpEnd, 1) + (m.coreMax ? '/' + m.coreMax : '')));
        tr.appendChild(el('td', 'num', pct(m.leakRate) + '%'));
        var dc = el('td'); dc.appendChild(deathSpark(m.deathsByWave)); tr.appendChild(dc);
        t.appendChild(tr);
      });
    });
    wrap.appendChild(t);
    return wrap;
  }

  function actionsTable(stages) {
    var wrap = el('div');
    wrap.appendChild(el('h2', null, 'Пейсинг и действия · сек / реролл / бёрн / фьюжн'));
    var t = el('table');
    var head = el('tr');
    ['stage', 'src', 'avg sec', 'rerolls', 'burns', 'fusions', 'perfect waves'].forEach(function (h) {
      head.appendChild(el('th', null, h));
    });
    t.appendChild(head);
    Object.keys(stages).sort().forEach(function (stage) {
      var bySrc = stages[stage];
      Object.keys(bySrc).sort().forEach(function (src) {
        var m = bySrc[src];
        var tr = el('tr');
        tr.appendChild(el('td', null, stage));
        var sc = el('td'); sc.appendChild(srcTag(src)); tr.appendChild(sc);
        tr.appendChild(el('td', 'num', String(round(m.avgDurationSec, 1))));
        tr.appendChild(el('td', 'num', String(round(m.avgRerolls, 2))));
        tr.appendChild(el('td', 'num', String(round(m.avgBurns, 2))));
        tr.appendChild(el('td', 'num', String(round(m.avgFusions, 2))));
        tr.appendChild(el('td', 'num', String(m.perfectWaves)));
        t.appendChild(tr);
      });
    });
    wrap.appendChild(t);
    return wrap;
  }

  function econTable(stages) {
    var wrap = el('div');
    wrap.appendChild(el('h2', null, 'Экономика · краны vs стоки (всего за выборку)'));
    var fg = {}, sg = {}, fc = {}, sc = {};
    function add(dst, src) { for (var k in src) dst[k] = (dst[k] || 0) + src[k]; }
    Object.keys(stages).forEach(function (stage) {
      var bySrc = stages[stage];
      Object.keys(bySrc).forEach(function (s) {
        var m = bySrc[s];
        add(fg, m.faucets.gold); add(sg, m.sinks.gold);
        add(fc, m.faucets.crystals); add(sc, m.sinks.crystals);
      });
    });
    var grid = el('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = '1fr 1fr';
    grid.appendChild(mapTable('gold — faucets (+' + round(sumVals(fg)) + ')', fg));
    grid.appendChild(mapTable('gold — sinks (-' + round(sumVals(sg)) + ')', sg));
    grid.appendChild(mapTable('crystals — faucets (+' + round(sumVals(fc)) + ')', fc));
    grid.appendChild(mapTable('crystals — sinks (-' + round(sumVals(sc)) + ')', sc));
    wrap.appendChild(grid);
    return wrap;
  }

  function contentSection(stages) {
    var kills = {}, leaks = {}, dmg = {}, shots = {};
    function add(dst, src) { for (var k in src) dst[k] = (dst[k] || 0) + src[k]; }
    Object.keys(stages).forEach(function (stage) {
      var bySrc = stages[stage];
      Object.keys(bySrc).forEach(function (s) {
        var m = bySrc[s];
        add(kills, m.kills); add(leaks, m.leaks); add(dmg, m.damageByElement); add(shots, m.shotsByCard);
      });
    });
    var wrap = el('div');
    wrap.appendChild(el('h2', null, 'Контент · эффективность сущностей'));
    var grid = el('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = '1fr 1fr';
    grid.appendChild(mapTable('kills by enemy', kills));
    grid.appendChild(mapTable('leaks by enemy', leaks));
    grid.appendChild(mapTable('damage by element', dmg));
    grid.appendChild(mapTable('shots by card', shots));
    wrap.appendChild(grid);
    return wrap;
  }

  function render(agg) {
    meta.textContent =
      agg.meta.totalAttempts + ' attempts · versions: ' +
      (agg.meta.balanceVersions.join(', ') || '—') + ' · ' +
      new Date(agg.meta.generatedAt).toLocaleTimeString();
    root.innerHTML = '';
    if (!agg.meta.totalAttempts) {
      var e = el('div', 'empty');
      e.appendChild(document.createTextNode('No telemetry yet. Play with '));
      e.appendChild(el('code', null, 'VITE_TELEMETRY_URL'));
      e.appendChild(document.createTextNode(' set, or import bot runs.'));
      root.appendChild(e);
      return;
    }
    root.appendChild(difficultyTable(agg.stages));
    root.appendChild(econTable(agg.stages));
    root.appendChild(actionsTable(agg.stages));
    root.appendChild(contentSection(agg.stages));
  }

  function load() {
    var src = sourceSel.value;
    fetch('/aggregate?source=' + encodeURIComponent(src))
      .then(function (r) { return r.json(); })
      .then(render)
      .catch(function (err) { root.innerHTML = ''; root.appendChild(el('div', 'empty', String(err))); });
  }

  document.getElementById('refresh').addEventListener('click', load);
  sourceSel.addEventListener('change', load);
  load();
})();
</script>
</body>
</html>`;
