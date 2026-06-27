/**
 * String catalogs for the localization layer (see core/i18n.ts).
 *
 * Two kinds of keys live here:
 *  - UI strings — present in BOTH `en` and `ru` (engine chrome, labels, banners).
 *  - Content overrides — present only in `ru` (card.* / level.* / reaction.* /
 *    element.* / fx.slot.* / tutorial.*). English is the source language and comes
 *    from the game-config JSON, so `tData` returns that JSON value for `en` and
 *    only needs Russian overrides here. Tutorial text is the exception: it carries
 *    both languages because its source authored in-repo (config/tutorial.ts) is RU.
 *
 * Keep keys flat and dotted. When adding UI text, add it to both `en` and `ru`.
 */

type Dict = Record<string, string>;

const en: Dict = {
  // --- common / buttons ---
  'common.play': 'START',
  'common.back': 'BACK',
  'common.close': 'CLOSE',
  'common.map': 'MAP',
  'common.worldMap': 'WORLD MAP',
  'common.retry': 'RETRY',
  'common.next': 'NEXT',
  'common.gotIt': 'GOT IT',

  // --- main menu ---
  'menu.subtitle': 'in search of the last senior',

  // --- world map ---
  'worldmap.title': 'CHOOSE YOUR STAND',
  'worldmap.region1': 'REGION I',
  'worldmap.region2': 'REGION II',

  // --- HUD ---
  'hud.wave': 'WAVE',
  'hud.core': 'CORE',
  'hud.overdrive': 'OVERDRIVE',
  'hud.overload': 'OVERLOAD',
  'hud.reactor': 'REACTOR',
  'hud.burn': 'BURN',
  'hud.reactorBurnEffect': '+2 ENERGY 15s',
  'hud.charging': 'CHARGING',
  'hud.synergySlots': 'SYNERGY SLOTS',
  'hud.dragHint': 'Drag a card onto a slot or the Reactor',

  // --- battle ---
  'battle.reroll': 'REROLL {cost}',
  'battle.waveToast': 'WAVE {n}  •  {secs}',
  'battle.resonance': 'RESONANCE',
  'battle.resonanceX': 'RESONANCE ×{count}',
  'battle.pickElement': 'PICK ELEMENT',
  'battle.focusChip': 'FOCUS {element}',
  'battle.focusLabel': 'FOCUS: {element}  +{pct}%',
  'battle.dmgPct': '+{pct}% DMG',
  'battle.mergeTo': 'MERGE → {grade}',
  'fx.stun': 'STUN!',
  'fx.jammed': 'JAMMED',

  // --- modernization cost chips ---
  'mod.isolation': 'ISOLATION',
  'mod.overdrive': 'OVERDRIVE',
  'mod.capBonus': '+{n} CAP',
  'mod.capBonusTimed': '+{n} CAP {sec}s',

  // --- tower info panel ---
  'info.platformUpgrade': 'PLATFORM UPGRADE',
  'info.supportPassive': 'SUPPORT • passive',
  'info.stats': 'DMG {dmg}  •  CD {cd}s  •  RNG {rng}  •  DPS {dps}',
  'info.locked': 'LOCKED',
  'info.receiving': '← Receiving:  {parts}',
  'info.receivingNone': '← Receiving: none',
  'info.broadcast': '→ {verb} {reach}:  {parts}',
  'info.broadcastBlurb': '→ {blurb}',
  'info.verbBuffs': 'Buffs',
  'info.verbDrains': 'Drains',
  'info.reachAll': 'all neighbors',
  'info.reachOrtho': 'orthogonal neighbors',
  'info.verbPowers': 'Powers',
  'info.verbShields': 'Shields',
  'info.coverage': '{verb} {n} adjacent {plural}',
  'info.coverageOne': 'tower',
  'info.coverageMany': 'towers',
  'info.holdToSell': 'HOLD TO SELL  +{gold}g',
  'info.spdPenalty': '-{pct}% SPD',

  // --- stat abbreviations (BuffStat) ---
  'stat.damage': 'DMG',
  'stat.range': 'RNG',
  'stat.tempo': 'SPD',
  'stat.defense': 'DEF',

  // --- card lock veils ---
  'card.needGold': 'NEED GOLD',
  'card.needGems': 'NEED GEMS',

  // --- settings ---
  'settings.title': 'SETTINGS',
  'settings.music': 'MUSIC',
  'settings.effects': 'EFFECTS',
  'settings.system': 'SYSTEM',
  'settings.muteAll': 'MUTE ALL',
  'settings.soundOff': 'SOUND: OFF — TAP TO UNMUTE',
  'settings.analyticsOn': 'ANALYTICS: ON — TAP TO OPT OUT',
  'settings.analyticsOff': 'ANALYTICS: OFF',
  'settings.language': 'LANGUAGE',
  'settings.gameSpeed': 'GAME SPEED',

  // --- end-of-battle banner ---
  'banner.victory': 'VICTORY',
  'banner.defeat': 'DEFEAT',
  'banner.coreSummary': 'Core {hp}/{max}',
  'banner.defeatSub': 'The core was overrun',
  'banner.techUnlocked': 'TECH UNLOCKED',
  'banner.waveRepelled': 'WAVE REPELLED',
  'banner.waveCleared': 'WAVE {n} CLEARED',
  'banner.perfectClear': 'PERFECT CLEAR',

  // --- grade tag ---
  'grade.lv': 'Lv{n}',

  // --- tower signature labels (game/BattleSim.signatureLabel) ---
  'sig.power': 'POWER {n}',
  'sig.slowWet': 'SLOW {n}% • WET {s}s',
  'sig.chain': 'CHAIN {n}',
  'sig.pierce': 'PIERCE {n}',
  'sig.barrier': 'BARRIER {n} • {s}s',
  'sig.energy': 'ENERGY +{n}',
  'sig.steamSplash': 'STEAM SPLASH • {base}',
  'sig.wetSuffix': '{base} • WET {s}s',
  'sig.shrapnelSuffix': '{base} • SHRAPNEL',
  'sig.slowWetBonus': '{base} • +{pct}% SLOW/WET',
  'sig.arcSuffix': '{base} • ARC {n}',

  // --- onboarding tutorial (source language is RU; English below) ---
  'tutorial.basics_place.title': 'Place Turrets',
  'tutorial.basics_place.body': 'Drag a card from your hand onto an empty slot of the 3×3 platform.',
  'tutorial.basics_synergy.title': 'Neighbors Empower',
  'tutorial.basics_synergy.body':
    'A tower buffs its orthogonal grid neighbors. Place them adjacent — not scattered.',
  'tutorial.basics_energy.title': 'Energy & Core',
  'tutorial.basics_energy.body':
    'Every tower loads the power grid (the gauge up top).\n\nAn enemy that breaks through hits Core Integrity — lose the core and you lose.',
  'tutorial.tower_storm_coil.title': 'Storm',
  'tutorial.tower_storm_coil.body':
    'Chain lightning — strikes a group of enemies, jumping between targets.',
  'tutorial.mech_merge.title': 'Merge',
  'tutorial.mech_merge.body':
    'Two identical cards fuse into a higher grade: I+I→II in hand, II+II→III on the field.',
  'tutorial.mech_crystals.title': 'Crystals',
  'tutorial.mech_crystals.body':
    'A perfect wave clear and elite enemies drop crystals — the premium currency.',
  'tutorial.mech_reroll.title': 'Reroll Hand',
  'tutorial.mech_reroll.body':
    "Don't like your draw? Reroll the hand for crystals. The price grows each wave.",
  'tutorial.mech_resonance.title': 'Resonance',
  'tutorial.mech_resonance.body':
    'Grade II+ neighbors of different elements trigger a reaction:\n\nSteam Burst (Fire+Water), Superconductivity (Water+Electricity), Shrapnel (Fire+Physical).',
  'tutorial.tower_railgun.title': 'Railgun',
  'tutorial.tower_railgun.body': 'A piercing beam — sews through the whole line of enemies.',
  'tutorial.tower_grid_stabilizer.title': 'Stabilizer',
  'tutorial.tower_grid_stabilizer.body': 'Support: speeds up the tempo of neighboring towers.',
  'tutorial.mech_overload.title': 'Overload & Reactor',
  'tutorial.mech_overload.body':
    'Too much load cuts the fire rate of all towers.\n\nBurn a card in the Reactor to raise capacity for a while (Overdrive). Burning costs gold.',
  'tutorial.tower_shield_generator.title': 'Shield Generator',
  'tutorial.tower_shield_generator.body':
    'Drops a barrier on the wave leader and protects neighboring towers from interruption.',
  'tutorial.mech_interrupt.title': 'Disruptor',
  'tutorial.mech_interrupt.body':
    'A jammer enemy stuns towers in its radius.\n\nA neighboring Shield softens the interrupt: one — halved, two or center — immune.',
  'tutorial.mech_mod_cards.title': 'Modernization',
  'tutorial.mech_mod_cards.body':
    'Rare cards apply to the whole platform, not a slot: drag onto the platform and release.',
  'tutorial.mech_fusion.title': 'Fusion',
  'tutorial.mech_fusion.body':
    'Combine two different hand cards by recipe — get a hybrid for gold and crystals.\n\nEach hybrid has its own combat kit: steam blast, chain with Wet, built-in shrapnel, bonus vs slow/wet, and so on.',
};

const ru: Dict = {
  // --- common / buttons ---
  'common.play': 'ИГРАТЬ',
  'common.back': 'НАЗАД',
  'common.close': 'ЗАКРЫТЬ',
  'common.map': 'КАРТА',
  'common.worldMap': 'КАРТА МИРА',
  'common.retry': 'ЗАНОВО',
  'common.next': 'ДАЛЕЕ',
  'common.gotIt': 'ПОНЯТНО',

  // --- main menu ---
  'menu.subtitle': 'в поисках последнего сеньора',

  // --- world map ---
  'worldmap.title': 'ВЫБЕРИ РУБЕЖ',
  'worldmap.region1': 'РЕГИОН I',
  'worldmap.region2': 'РЕГИОН II',

  // --- HUD ---
  'hud.wave': 'ВОЛНА',
  'hud.core': 'ЯДРО',
  'hud.overdrive': 'ОВЕРДРАЙВ',
  'hud.overload': 'ПЕРЕГРУЗ',
  'hud.reactor': 'РЕАКТОР',
  'hud.burn': 'СЖЕЧЬ',
  'hud.reactorBurnEffect': '+2 ЭНЕРГ. 15с',
  'hud.charging': 'ЗАРЯД',
  'hud.synergySlots': 'СЛОТЫ СИНЕРГИИ',
  'hud.dragHint': 'Перетащи карту в слот или в Реактор',

  // --- battle ---
  'battle.reroll': 'РЕРОЛЛ {cost}',
  'battle.waveToast': 'ВОЛНА {n}  •  {secs}',
  'battle.resonance': 'РЕЗОНАНС',
  'battle.resonanceX': 'РЕЗОНАНС ×{count}',
  'battle.pickElement': 'ВЫБЕРИ СТИХИЮ',
  'battle.focusChip': 'ФОКУС {element}',
  'battle.focusLabel': 'ФОКУС: {element}  +{pct}%',
  'battle.dmgPct': '+{pct}% УРОН',
  'battle.mergeTo': 'МЕРДЖ → {grade}',
  'fx.stun': 'СТАН!',
  'fx.jammed': 'СБОЙ',

  // --- modernization cost chips ---
  'mod.isolation': 'ИЗОЛЯЦИЯ',
  'mod.overdrive': 'ОВЕРДРАЙВ',
  'mod.capBonus': '+{n} ЁМК',
  'mod.capBonusTimed': '+{n} ЁМК {sec}с',

  // --- tower info panel ---
  'info.platformUpgrade': 'АПГРЕЙД ПЛАТФОРМЫ',
  'info.supportPassive': 'ПОДДЕРЖКА • пассив',
  'info.stats': 'УРОН {dmg}  •  КД {cd}с  •  РАД {rng}  •  DPS {dps}',
  'info.locked': 'ЗАКРЫТО',
  'info.receiving': '← Получает:  {parts}',
  'info.receivingNone': '← Получает: ничего',
  'info.broadcast': '→ {verb} {reach}:  {parts}',
  'info.broadcastBlurb': '→ {blurb}',
  'info.verbBuffs': 'Усиливает',
  'info.verbDrains': 'Ослабляет',
  'info.reachAll': 'всех соседей',
  'info.reachOrtho': 'соседей по сторонам',
  'info.verbPowers': 'Питает',
  'info.verbShields': 'Защищает',
  'info.coverage': '{verb} рядом: {n}',
  'info.coverageOne': '',
  'info.coverageMany': '',
  'info.holdToSell': 'УДЕРЖИВАЙ — ПРОДАТЬ  +{gold}',
  'info.spdPenalty': '-{pct}% СКОР',

  // --- stat abbreviations (BuffStat) ---
  'stat.damage': 'УРОН',
  'stat.range': 'РАД',
  'stat.tempo': 'СКОР',
  'stat.defense': 'ЗАЩ',

  // --- card lock veils ---
  'card.needGold': 'НЕТ ЗОЛОТА',
  'card.needGems': 'НЕТ КРИСТАЛЛОВ',

  // --- settings ---
  'settings.title': 'НАСТРОЙКИ',
  'settings.music': 'МУЗЫКА',
  'settings.effects': 'ЭФФЕКТЫ',
  'settings.system': 'СИСТЕМА',
  'settings.muteAll': 'ВЫКЛ. ЗВУК',
  'settings.soundOff': 'ЗВУК ВЫКЛ — ВКЛЮЧИТЬ',
  'settings.analyticsOn': 'АНАЛИТИКА ВКЛ — ОТКЛЮЧИТЬ',
  'settings.analyticsOff': 'АНАЛИТИКА ВЫКЛ',
  'settings.language': 'ЯЗЫК',
  'settings.gameSpeed': 'СКОРОСТЬ ИГРЫ',

  // --- end-of-battle banner ---
  'banner.victory': 'ПОБЕДА',
  'banner.defeat': 'ПОРАЖЕНИЕ',
  'banner.coreSummary': 'Ядро {hp}/{max}',
  'banner.defeatSub': 'Ядро прорвано',
  'banner.techUnlocked': 'НОВАЯ ТЕХНИКА',
  'banner.waveRepelled': 'ВОЛНА ОТБИТА',
  'banner.waveCleared': 'ВОЛНА {n} ПРОЙДЕНА',
  'banner.perfectClear': 'ИДЕАЛЬНАЯ ЗАЧИСТКА',

  // --- grade tag ---
  'grade.lv': 'Ур{n}',

  // --- tower signature labels (game/BattleSim.signatureLabel) ---
  'sig.power': 'МОЩЬ {n}',
  'sig.slowWet': 'ЗАМЕДЛ {n}% • МОКРО {s}с',
  'sig.chain': 'ЦЕПЬ {n}',
  'sig.pierce': 'ПРОБОЙ {n}',
  'sig.barrier': 'БАРЬЕР {n} • {s}с',
  'sig.energy': 'ЭНЕРГИЯ +{n}',
  'sig.steamSplash': 'ПАР • {base}',
  'sig.wetSuffix': '{base} • МОКРО {s}с',
  'sig.shrapnelSuffix': '{base} • ШРАПНЕЛЬ',
  'sig.slowWetBonus': '{base} • +{pct}% ПО ЗАМЕДЛ/МОКРЫМ',
  'sig.arcSuffix': '{base} • ДУГА {n}',

  // --- element brand labels (data override) ---
  'element.Fire': 'ОГОНЬ',
  'element.Water': 'ХОЛОД',
  'element.Electricity': 'ГРОЗА',
  'element.Physical': 'МЕТАЛЛ',
  'element.Energy': 'ЭНЕРГИЯ',

  // --- synergy-slot effect labels (data override; keyed by English label) ---
  'fx.slot.STEAM BURST': 'ПАР',
  'fx.slot.SHRAPNEL': 'ШРАПНЕЛЬ',
  'fx.slot.POWER': 'ЭНЕРГ.',
  'fx.slot.SUPERCONDUCT': 'СВЕРХПР.',
  'fx.slot.+DMG': '+УРОН',
  'fx.slot.CHILL': 'ХОЛОД',
  'fx.slot.+BUFF': '+БАФФ',

  // --- resonance reactions (data override) ---
  'reaction.steam.name': 'ПАРОВОЙ ВЫБРОС',
  'reaction.steam.blurb': 'Облако пара: враги −15% скорости + 12 урона/с',
  'reaction.superconductivity.name': 'СВЕРХПРОВОДИМОСТЬ',
  'reaction.superconductivity.blurb': 'Скорость атаки +50%; 20% шанс стана 0.5с',
  'reaction.shrapnel.name': 'ШРАПНЕЛЬ',
  'reaction.shrapnel.blurb': 'Радиус взрыва +40%; выстрелы бьют по площади',

  // --- card short names + blurbs (data override) ---
  'card.plasma_shutter.short': 'ОГНЕПУШКА',
  'card.plasma_shutter.blurb': '+УРОН соседям • Огонь',
  'card.frost_pulse.short': 'ЛЕДОПУШКА',
  'card.frost_pulse.blurb': 'Мокрит • замедляет • +РАД',
  'card.storm_coil.short': 'ТЕСЛА',
  'card.storm_coil.blurb': 'Цепная молния • ×2 по мокрым',
  'card.railgun.short': 'РЕЛЬСОТРОН',
  'card.railgun.blurb': 'Пробивает линию • глушит соседей',
  'card.shield_generator.short': 'КУПОЛ-ЩИТ',
  'card.shield_generator.blurb': '+ЗАЩ • барьер на дороге',
  'card.grid_stabilizer.short': 'СТАБИЛИЗАТОР',
  'card.grid_stabilizer.blurb': '+энергия • замедляет соседей',
  'card.isolation_circuit.short': 'ИЗОЛЯЦИЯ',
  'card.isolation_circuit.blurb': '+2 к ёмкости • весь бой',
  'card.elemental_focus.short': 'ФОКУС',
  'card.elemental_focus.blurb': '+25% урона одной стихии • эта волна',
  'card.emergency_overdrive.short': 'ОВЕРДРАЙВ',
  'card.emergency_overdrive.blurb': 'Овердрайв 10с • без сжигания карты',
  'card.steam_cannon.short': 'ПАРОПУШКА',
  'card.steam_cannon.blurb': 'Паровой удар • урон + замедление',
  'card.cryo_discharge.short': 'КРИОРАЗРЯД',
  'card.cryo_discharge.blurb': 'Цепная молния • ×2 по мокрым',
  'card.ion_volley.short': 'ИОННЫЙ ЗАЛП',
  'card.ion_volley.blurb': 'Скорострел • прыгает на 2-ю цель',
  'card.thermo_spear.short': 'ТЕРМОКОПЬЁ',
  'card.thermo_spear.blurb': 'Пробивает линию • поджигает огнём',
  'card.icebreaker.short': 'ЛЕДОБОЙ',
  'card.icebreaker.blurb': 'Пробивает линию • морозит цели',
  'card.gauss_coil.short': 'ГАУСС',
  'card.gauss_coil.blurb': 'Электропробой • ×2 по мокрым',

  // --- level names (data override) ---
  'level.lvl_1': 'Выжженный Овраг',
  'level.lvl_2': 'Ржавый Водосброс',
  'level.lvl_3': 'Статичное Плато',
  'level.lvl_4': 'Тлеющая Лощина',
  'level.lvl_5': 'Стеклянные Дюны',
  'level.lvl_6': 'Хладагентный Кряж',
  'level.lvl_7': 'Шпиль Перегрузки',
  'level.lvl_8': 'Треснувшая Катушка',
  'level.lvl_9': 'Нулевой Сектор',
  'level.lvl_10': 'Грозовые Тиски',
  'level.lvl_11': 'Ожоговый Шрам',
  'level.lvl_12': 'Врата Сингулярности',

  // --- onboarding tutorial (RU source; mirrors config/tutorial.ts) ---
  'tutorial.basics_place.title': 'Ставь турели',
  'tutorial.basics_place.body': 'Перетащи карту из руки на пустой слот платформы 3×3.',
  'tutorial.basics_synergy.title': 'Соседи усиливают',
  'tutorial.basics_synergy.body':
    'Башня баффает ортогональных соседей по сетке. Ставь рядом — не вразброс.',
  'tutorial.basics_energy.title': 'Энергия и ядро',
  'tutorial.basics_energy.body':
    'Каждая башня грузит энергосеть (шкала сверху).\n\nПрорвавшийся враг бьёт по целостности Ядра — потеряешь ядро, проиграешь.',
  'tutorial.tower_storm_coil.title': 'ТеслаПушка',
  'tutorial.tower_storm_coil.body':
    'Цепная молния — бьёт по группе врагов, перепрыгивая между целями.',
  'tutorial.mech_merge.title': 'Мердж',
  'tutorial.mech_merge.body':
    'Две одинаковые карты сливаются в грейд повыше: I+I→II в руке, II+II→III на поле.',
  'tutorial.mech_crystals.title': 'Кристаллы',
  'tutorial.mech_crystals.body':
    'Идеальная зачистка волны и элитные враги роняют кристаллы — премиум-валюта.',
  'tutorial.mech_reroll.title': 'Реролл руки',
  'tutorial.mech_reroll.body':
    'Не нравится добор? Перекрути руку за кристаллы. Цена растёт за волну.',
  'tutorial.mech_resonance.title': 'Резонанс',
  'tutorial.mech_resonance.body':
    'Соседи Grade II+ разных стихий запускают реакцию:\n\nПаровой Выброс (Огонь+Вода), Сверхпроводимость (Вода+Ток), Шрапнель (Огонь+Физика).',
  'tutorial.tower_railgun.title': 'Рельсотрон',
  'tutorial.tower_railgun.body': 'Пробивающий луч — шьёт всю линию врагов насквозь.',
  'tutorial.tower_grid_stabilizer.title': 'Стабилизатор',
  'tutorial.tower_grid_stabilizer.body': 'Поддержка: разгоняет темп соседних башен.',
  'tutorial.mech_overload.title': 'Перегрузка и Реактор',
  'tutorial.mech_overload.body':
    'Слишком большая нагрузка режет темп всех башен.\n\nСожги карту в Реакторе — временно поднимешь ёмкость (Overdrive). Сжигание стоит золота.',
  'tutorial.tower_shield_generator.title': 'Генератор Щита',
  'tutorial.tower_shield_generator.body':
    'Вешает барьер на лидера волны и защищает соседние башни от прерывания.',
  'tutorial.mech_interrupt.title': 'Диверсант',
  'tutorial.mech_interrupt.body':
    'Враг-глушитель станит башни в радиусе.\n\nСоседний Щит гасит прерывание: один — вдвое, два или центр — иммунитет.',
  'tutorial.mech_mod_cards.title': 'Модернизация',
  'tutorial.mech_mod_cards.body':
    'Редкие карты применяются ко всей платформе, а не в слот: тащи на платформу и отпускай.',
  'tutorial.mech_fusion.title': 'Фьюжн',
  'tutorial.mech_fusion.body':
    'Соедини две разные карты в руке по рецепту — получишь гибрид за золото и кристаллы.\n\nУ каждого гибрида свой боевой кит: паровой взрыв, цепь с Wet, встроенный шрапнель, бонус по slow/wet и т.д.',
};

export const STRINGS: Record<'ru' | 'en', Dict> = { en, ru };
