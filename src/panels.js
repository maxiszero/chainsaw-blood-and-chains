const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const integer = value => Math.max(0, Math.floor(Number(value) || 0));
const rankNames = ['D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];

const heading = (kicker, title, intro = '') => `<div class="panel-kicker">${kicker}</div><h2 id="panel-title">${title}</h2>${intro ? `<p class="panel-intro">${intro}</p>` : ''}`;
const action = (name, title, detail = '↗', primary = false, disabled = false) => `<button type="button" class="panel-action${primary ? ' primary' : ''}" data-action="${name}"${disabled ? ' disabled' : ''}>${title}<span>${detail}</span></button>`;
const navigation = (kind, title, detail = '↗') => `<button type="button" class="panel-action" data-panel="${kind}">${title}<span>${detail}</span></button>`;

export class Panels {
  constructor(getSave, onAction) {
    this.getSave = getSave;
    this.onAction = onAction;
    this.dialog = document.getElementById('panel');
    this.content = document.getElementById('panel-content');
    this.kind = null;
    this.data = {};
    this.dialog.setAttribute('aria-labelledby', 'panel-title');
    document.getElementById('close-panel').addEventListener('click', () => this.dismiss());
    this.dialog.addEventListener('cancel', event => { event.preventDefault(); this.dismiss(); });
    this.dialog.addEventListener('keydown', event => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); this.dismiss(); }
    });
    this.dialog.addEventListener('click', event => {
      if (event.target !== this.dialog) return;
      const box = this.dialog.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) this.dismiss();
    });
    this.content.addEventListener('click', event => this.handleClick(event));
    this.content.addEventListener('input', event => {
      if (event.target.matches('input[type="range"][data-setting]')) this.changeSetting(event.target);
    });
    this.content.addEventListener('change', event => {
      if (event.target.matches('[data-setting]:not([type="range"])')) this.changeSetting(event.target);
    });
  }

  show(kind, data = {}) {
    const builders = {
      settings: () => this.settings(), controls: () => this.controls(), chapters: () => this.chapters(),
      credits: () => this.credits(), pause: () => this.pause(), death: () => this.death(),
      victory: () => this.victory(data), upgrades: () => this.upgrades(),
    };
    if (!builders[kind]) return;
    this.kind = kind;
    this.data = data;
    this.content.innerHTML = builders[kind]();
    if (data.back && builders[data.back]) this.content.insertAdjacentHTML('beforeend', navigation(data.back, '← BACK'));
    this.dialog.dataset.panel = kind;
    if (!this.dialog.open) this.dialog.showModal();
    this.dialog.scrollTop = 0;
    (this.content.querySelector('.primary:not(:disabled), input, select, button:not(:disabled)') || document.getElementById('close-panel')).focus({ preventScroll: true });
  }

  close() {
    if (this.dialog.open) this.dialog.close();
    this.kind = null;
    this.data = {};
  }

  dismiss() {
    if (this.data.back) {
      this.show(this.data.back, { ...this.data, back: undefined });
      return;
    }
    this.onAction(['death', 'victory'].includes(this.kind) ? 'menu' : 'close');
  }

  handleClick(event) {
    const button = event.target.closest('button');
    if (!button || !this.content.contains(button) || button.disabled) return;
    if (button.dataset.panel) {
      const next = button.dataset.panel;
      const back = ['pause', 'victory', 'death'].includes(this.kind) ? this.kind : this.data.back;
      this.show(next, { ...this.data, back: next === back ? undefined : back });
      return;
    }
    const name = button.dataset.action;
    if (!name) return;
    if (name === 'upgrade') {
      const result = this.onAction(name, { key: button.dataset.key });
      const refresh = () => { if (this.dialog.open && this.kind === 'upgrades') this.show('upgrades', this.data); };
      if (result && typeof result.then === 'function') result.then(refresh);
      else refresh();
    } else this.onAction(name);
  }

  changeSetting(input) {
    const key = input.dataset.setting;
    const value = input.type === 'checkbox' ? input.checked : input.type === 'range' ? Number(input.value) : input.value;
    if (input.type === 'range') {
      const output = this.content.querySelector(`output[for="${input.id}"]`);
      if (output) output.value = key === 'volume' ? `${Math.round(value * 100)}%` : `${value.toFixed(1)}×`;
    }
    this.onAction('setting', { key, value });
  }

  settings() {
    const settings = this.getSave().settings;
    const range = (key, title, min, max, step, display) => `<div class="setting"><label for="setting-${key}">${title}</label><div class="range-wrap"><input id="setting-${key}" type="range" min="${min}" max="${max}" step="${step}" value="${settings[key]}" data-setting="${key}"><output for="setting-${key}">${display}</output></div></div>`;
    const select = (key, title, values) => `<div class="setting"><label for="setting-${key}">${title}</label><select id="setting-${key}" data-setting="${key}">${values.map(([value, label]) => `<option value="${value}"${settings[key] === value ? ' selected' : ''}>${label}</option>`).join('')}</select></div>`;
    const check = (key, title) => `<div class="setting"><label for="setting-${key}">${title}</label><input id="setting-${key}" type="checkbox" data-setting="${key}"${settings[key] ? ' checked' : ''}></div>`;
    return heading('PREFERENCES / SAVED ON THIS DEVICE', 'MAKE IT YOURS', 'Changes apply as you adjust them. Lower graphics quality for smoother combat.')
      + range('volume', 'Master volume', 0, 1, 0.05, `${Math.round(settings.volume * 100)}%`)
      + range('sensitivity', 'Mouse sensitivity', 0.2, 3, 0.1, `${settings.sensitivity.toFixed(1)}×`)
      + select('quality', 'Graphics quality', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']])
      + select('difficulty', 'Combat difficulty', [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']])
      + check('shake', 'Camera shake') + check('flashes', 'Impact flashes')
      + action('fullscreen', 'TOGGLE FULLSCREEN', '⛶')
      + '<div class="hint-box">Reduce camera shake and impact flashes for gentler combat effects. Subtitles are always shown. All settings stay on this device.</div>';
  }

  controls() {
    const keys = [
      ['Move', 'W A S D'], ['Look', 'MOUSE DRAG'], ['Capture mouse', 'MMB'], ['Camera distance', 'WHEEL'], ['Sprint', 'SHIFT'], ['Light attack', 'J / LMB'],
      ['Heavy attack', 'K / RMB'], ['Dodge', 'SPACE'], ['Parry', 'Q'], ['Interact', 'E'],
      ['Transform', 'R'], ['Rip & Tear', 'F'], ['Lock target', 'C'], ['Field manual', 'TAB'],
      ['Pause', 'ESC'], ['Skip cinematic', 'ENTER'],
    ];
    return heading('FIELD MANUAL / KEYBOARD + MOUSE', 'PULL. CUT. SURVIVE.', 'Face a threat, read its windup, and commit. Good timing keeps you alive.')
      + `<div class="control-grid">${keys.map(([label, key]) => `<div class="control-row"><span>${label}</span><kbd>${key}</kbd></div>`).join('')}</div>`
      + '<h3>MAKE EVERY HIT COUNT</h3><p class="credit-line">Two light attacks followed by a heavy launch smaller enemies. Dodge through an incoming strike for a perfect dodge. Parry as the strike lands to expose an enemy.</p>'
      + '<div class="hint-box">Rip & Tear costs 35 blood and has a cooldown. Hits refill the engine; defeating enemies restores health. Attack inputs can be queued during a swing.</div>'
      + action('training', 'ENTER TRAINING', 'PRACTICE');
  }

  chapters() {
    const save = this.getSave();
    return heading('CHAPTER ONE / PLAYABLE VERTICAL SLICE', 'THE FIRST CONTRACT', 'The opening warehouse mission is playable from beginning to end, with its prologue, transformation, Zombie Devil battle, and closing scene.')
      + '<div class="chapter-item"><span class="chapter-number">01</span><div><strong>THE ZOMBIE DEVIL</strong><p>A boy, a devil dog, and a dream worth dying for.<br>Prologue → Warehouse → Zombie Devil</p><button type="button" data-action="start">PLAY FROM THE BEGINNING ↗</button></div></div>'
      + (save.checkpoint && save.checkpoint !== 'complete' ? action('continue', 'CONTINUE CHECKPOINT', escape(save.checkpoint.toUpperCase())) : '')
      + '<h3>BEYOND THE WAREHOUSE</h3><p class="panel-intro">The following story missions are a development roadmap. They are not included or playable in this version.</p>'
      + '<div class="roadmap" aria-label="Unimplemented mission roadmap">02 / PUBLIC SAFETY — NOT INCLUDED<br>03 / THE BAT DEVIL — NOT INCLUDED<br>04 / THE ENDLESS HOTEL — NOT INCLUDED<br>05 / KATANA MAN — NOT INCLUDED</div>'
      + '<div class="hint-box">This build ends after the warehouse. The planned chapter ends at Katana Man; no later story arc is included.</div>';
  }

  credits() {
    return heading('BLOOD & CHAINS / v0.1', 'BUILT FROM A DREAM', 'An unofficial fan project inspired by Chainsaw Man. This project is not affiliated with or endorsed by the rights holders.')
      + '<h3>ORIGINAL WORK</h3><p class="credit-line">Characters, rigged procedural animation, warehouse environment, materials, signs, effects, interface, and manga transitions were created for this game. Rain, engine sounds, combat effects, and the adaptive score are original procedural audio. No anime footage, manga scans, or soundtrack recordings are used.</p>'
      + '<h3>ENGINE</h3><p class="credit-line">Built with <a href="https://threejs.org/" target="_blank" rel="noopener noreferrer">Three.js</a>, released under the MIT license. Engine copyright and license are included with the local distribution.</p>'
      + '<h3>STORY & CHARACTERS</h3><p class="credit-line">Chainsaw Man was created by Tatsuki Fujimoto. The characters and original story belong to their respective rights holders.</p>'
      + '<div class="hint-box">Available content: one complete warehouse mission and combat training. The remaining Chapter One campaign has not been implemented.</div>';
  }

  pause() {
    return heading('TAKE A BREATH / GAME PAUSED', 'STILL DREAMING?')
      + action('resume', 'RESUME', 'ESC', true)
      + navigation('upgrades', 'HUNTER UPGRADES', 'TROPHIES')
      + action('retry', 'RESTART CHECKPOINT')
      + navigation('settings', 'SETTINGS') + navigation('controls', 'HOW TO PLAY')
      + action('menu', 'RETURN TO TITLE', 'CHECKPOINT SAVED');
  }

  death() {
    return heading('A DREAM IS HARD TO KILL', 'NOT LIKE THIS.', 'Watch the attack windup. Dodge or parry before it connects, then strike during the recovery.')
      + action('retry', 'TRY AGAIN', 'CHECKPOINT', true)
      + navigation('settings', 'ADJUST DIFFICULTY', 'SETTINGS')
      + action('menu', 'RETURN TO TITLE');
  }

  victory(data) {
    const seconds = integer(data.seconds);
    const duration = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    const rank = data.rank || { letter: 'D', name: 'DREAMER' };
    const best = rankNames[integer(data.bestRank ?? this.getSave().bestRank)] || 'D';
    return heading('MISSION COMPLETE / THE ZOMBIE DEVIL', 'A LIFE WORTH LIVING.')
      + `<div class="result-rank" aria-label="Combat rank ${escape(rank.letter)}">${escape(rank.letter)}</div><p class="panel-intro">${escape(rank.name)}<br>The warehouse is quiet. A new life is waiting.</p>`
      + `<div class="result-stats"><div><b>${integer(data.kills)}</b><span>DEFEATS</span></div><div><b>${duration}</b><span>MISSION TIME</span></div><div><b>${best}</b><span>BEST RANK</span></div></div>`
      + navigation('upgrades', 'HUNTER UPGRADES', 'SPEND TROPHIES')
      + action('start', 'REPLAY THE MISSION', '↗', true)
      + action('training', 'ENTER TRAINING') + action('menu', 'RETURN TO TITLE')
      + '<div class="hint-box">You have reached the end of this playable slice. Later Public Safety missions are not included in this version.</div>';
  }

  upgrades() {
    const save = this.getSave();
    const blood = Math.min(3, integer(save.upgrades.blood));
    const engine = Math.min(3, integer(save.upgrades.engine));
    const trophies = Math.max(0, integer(save.kills) - 4 * (blood + engine));
    const upgrade = (key, name, level, copy) => {
      const capped = level >= 3;
      const disabled = capped || trophies < 4;
      return `<div class="upgrade"><div><b>${name} / ${level} OF 3</b><p>${copy}</p></div><button type="button" data-action="upgrade" data-key="${key}"${disabled ? ' disabled' : ''} aria-label="${capped ? name + ' fully upgraded' : 'Upgrade ' + name + ' for four trophies'}">${capped ? 'MAXIMUM' : trophies < 4 ? 'NEED 4 TROPHIES' : 'UPGRADE / 4 TROPHIES'}</button></div>`;
    };
    return heading('HUNTER DEVELOPMENT / PERSISTENT UPGRADES', 'FEED THE ENGINE', 'Each defeat in a completed mission earns one trophy. Spend four trophies per upgrade level. Your core attacks, dodge, and parry are available from the start.')
      + `<div class="result-stats"><div><b>${trophies}</b><span>AVAILABLE TROPHIES</span></div><div><b>${integer(save.kills)}</b><span>LIFETIME DEFEATS</span></div></div>`
      + upgrade('blood', 'BLOOD RECOVERY', blood, `Restore more health with every defeat. Current recovery: ${5 + blood * 2} health.`)
      + upgrade('engine', 'ENGINE EFFICIENCY', engine, `Reduce the blood your engine consumes during combat. Current drain: ${(1.2 - engine * 0.2).toFixed(1)} per second.`)
      + '<div class="hint-box">Both upgrades have three levels. Purchased levels are saved locally and carry into later runs.</div>';
  }
}
