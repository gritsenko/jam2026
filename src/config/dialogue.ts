import { tData } from '../core/i18n';
import type { Side } from './storyCharacters';

/**
 * Visual-novel dialogue scripts (the "what they say"). Rendered by
 * {@link import('../ui/DialogueOverlay').DialogueOverlay} on top of any scene
 * (the intro/finale cutscenes and the in-battle mission briefs). Characters are
 * referenced by id from config/storyCharacters.ts.
 *
 * A script is an ordered list of lines. Each line names the speaker and the side
 * its portrait stands on; the overlay slides the speaker in (lit) and dims the
 * others. A line may omit `side` to keep the speaker on its last-known side
 * (falling back to its character's `homeSide`).
 *
 * Localization (mirrors config/tutorial.ts): the `text` below is the RU source.
 * The overlay localizes each line via {@link lineText} →
 * `tData('dialogue.<scriptId>.l<i>', text)`, so a future English pass only adds
 * `dialogue.*` overrides to the i18n catalog — the source keeps working as-is.
 */

export interface DialogueLine {
  /** Speaker character id (config/storyCharacters.ts), or 'narrator'. */
  readonly speaker: string;
  /** Line text (RU source; localized at render time). */
  readonly text: string;
  /** Side the speaker stands on; defaults to its last side / home side. */
  readonly side?: Side;
  /**
   * Optional one-shot sound key played when THIS line shows (registered in
   * config/audioManifest.ts; file under assets/audio/**). Attaches a bark to the
   * phrase itself rather than the character, so successive lines can carry
   * different sounds. Overrides the speaker's default `voiceKey` for this line.
   */
  readonly sound?: string;
  /**
   * Hide the speaker's portrait for THIS line — render only the dialogue box
   * (name plate + text), and clear any portraits already on stage. Use when the
   * characters are already drawn into the scene's painting (e.g. the in-car
   * beats), so a stage portrait would double them up. Default false.
   */
  readonly hidePortrait?: boolean;
  /**
   * Floating emoji that drift up near the speaker's portrait while THIS line
   * shows — a celebratory flourish (e.g. hearts + party round the matriarch).
   * Rendered by {@link import('../ui/DialogueOverlay').DialogueOverlay} as a light
   * particle trickle anchored to the active speaker's slot; skipped on narrator /
   * `hidePortrait` lines (no portrait to anchor to).
   */
  readonly emote?: readonly string[];
  /**
   * Where the {@link emote} particles spawn, as a fraction of the full screen
   * (`x`/`y`, 0..1). Default: anchored to the speaker's portrait. Set this to pin
   * the flourish to a fixed screen spot instead (e.g. beside the matriarch's
   * torch rather than over her face); it then works even on narrator /
   * `hidePortrait` lines (no portrait needed).
   */
  readonly emoteAt?: { readonly x: number; readonly y: number };
}

export interface DialogueScript {
  readonly id: string;
  readonly lines: readonly DialogueLine[];
}

/** Helper: build a script and stamp the id once. */
function script(id: string, lines: readonly DialogueLine[]): DialogueScript {
  return { id, lines };
}

export const DIALOGUES: Record<string, DialogueScript> = {
  // --- Campaign intro (plays over the intro cutscene) ----------------------
  // Split across cutscene shots so each beat gets its own painting: the matriarch
  // briefs the heroes (over the My.Games office), then `intro_fueled` (the Buhanka
  // shown fueled) and `intro_go` (the heroes already aboard). See config/cutscenes.ts.
  intro: script('intro', [
    { speaker: 'matriarch', side: 'center', text: 'Садитесь, дети мои. То, что я скажу, не должно выйти за стены этого гаража.', emote: ['💖', '🎉', '💕', '🎊', '✨'], emoteAt: { x: 0.76, y: 0.58 } },
    { speaker: 'matriarch', text: 'Мир сломался тихо. Вайбкодеры пообещали, что ИИ напишет за нас всё. Потом — что починит. Теперь чинить уже некому.' },
    { speaker: 'coder', side: 'right', text: 'А монстры, что лезут из старых игр, — это тоже «фича»?' },
    { speaker: 'matriarch', text: 'Баг. Ваня Клевакичев навайбкодил вирус — и теперь твари выползают прямо из непропатченных билдов.' },
    { speaker: 'mech', side: 'left', text: 'И что, никто не сядет да не перепишет всё руками?' },
    { speaker: 'matriarch', text: 'Один может. Последний Сеньор — тот, кто пишет код без подсказок ИИ. Полгода назад он ушёл в саббатикал и не вернулся.' },
    { speaker: 'coder', text: 'Дай угадаю. Мы едем его искать.' },
    { speaker: 'matriarch', text: 'Вы отвезёте ему вот это. (достаёт пару красных кроссовок)' },
    { speaker: 'mech', text: '...Красные кроссовки?' },
    { speaker: 'matriarch', text: 'Его любимые. Без них он и метра не пробежит — а значит, не вернётся к работе. Доставьте их — и у мира появится второй шанс.' },
  ]),
  // Intro beat 2 — Anton, boss of the IT garage, shows the van is fueled
  // (over cutscene_intro2; the painting shows the van and his team).
  intro_fueled: script('intro_fueled', [
    { speaker: 'anton', side: 'center', text: 'Добрый день, коллеги! «Буханка 3000» заправлена. Команда AdsAdvisor установила Doom на ёлочку-освежитель. Иконки тоже установили. Поставили на нее токеносжигающий реактор из 20 3dfx voodo 2! Блютуз, фай-фай, инфраред. И локальный дипсик!' },
    { speaker: 'buhanka', side: 'left', text: 'Всем привет! Вы совершенно правы! Это классическая проблемма!' },
  ]),
  // Intro beat 3 — the heroes already aboard, rolling out (over cutscene_in_car).
  // The painting already shows the heroes in the van, so skip the stage portrait.
  intro_go: script('intro_go', [
    { speaker: 'mech', side: 'center', text: 'Поехали. Найдём последнего сеньора.', hidePortrait: true },
    { speaker: 'coder', side: 'center', text: 'И узнаем в чем как он сумел противостоять этой вайбкодерской заразе!.', hidePortrait: true },
  ]),

  // --- Intro skip Easter egg (the Lead-admin guilt-trips you on skip) -------
  intro_skip_confirm: script('intro_skip_confirm', [
    { speaker: 'support', side: 'center', text: 'Стоп. Ты точно хочешь отключиться от созвона? Интро ещё идёт, между прочим.' },
    { speaker: 'support', text: 'Просто предупреждаю: вся аналитика по игре улетает в AdsAdvisor — и твой «пропустить» уже там, с таймстампом.' },
    { speaker: 'support', text: 'Ладно, не держу. И кстати, удалите мессенджер Максим с рабочего ноутбука!' },
  ]),

  // --- Per-level mission briefs (play in-battle, before the tutorial) -------
  // The division HEAD briefs the heroes. The boss is the villain — silent here,
  // it taunts later when its finale wave spawns. (lvl_1 is special: the briefer
  // is Klevak, the vibecoder who caused the whole mess.)
  mission_lvl_1: script('mission_lvl_1', [
    { speaker: 'klevak', side: 'right', text: 'О, живые! Я Иван. Слушайте… я тут навайбкодил один скриптик, а оно… ну… всё немножко сломалось.' },
    { speaker: 'mech', side: 'left', text: '«Немножко»? Из по пути сюда мы видели толпы монстров из Zero City!' },
    { speaker: 'klevak', text: 'Да кто ж знал! Лимиты на клод кончились и я пытался все сделать с gemini... Сюда уже ломится босс из Раш ряля, задержите его, я навабйкодю заплатку! Лимиты сбросились!' },
  ]),
  mission_lvl_2: script('mission_lvl_2', [
    { speaker: 'finance', side: 'right', text: 'Ваша казна пустеет, Миллорд! Ой! Простите, обозналась! Кто вы? Что хотели?' },
    { speaker: 'mech', side: 'left', text: 'На Матриарх послала, за последним миллорд программистом, таска уже на аппруве. Не знаете где его искать?' },
    { speaker: 'finance', text: 'Дакки, боевая утка, клюёт мои гроссбухи и крякает баги прямо в отчёты! Иван дал ей доступ к казне. Прикрой кассу, я закрою квартал!' },
  ]),
  mission_lvl_3: script('mission_lvl_3', [
    { speaker: 'strateg', side: 'right', text: 'Я Стратег — держу комьюнити и локализацию на пяти языках. И на всех уже орут.' },
    { speaker: 'mech', side: 'left', text: 'И как, помогает?' },
    { speaker: 'strateg', text: 'Пока их королева, Оливия, не зальёт очередной «фанатский патч». Иван дал ей админку. Прикрой, я раздаю баны!' },
  ]),
  mission_lvl_4: script('mission_lvl_4', [
    { speaker: 'voevoda', side: 'right', text: 'Я Воевода. Держу фронт нетокода голыми руками — пакеты летят как картечь.' },
    { speaker: 'mech', side: 'left', text: 'Чувствую сквозняк лагов. Что прёт?' },
    { speaker: 'voevoda', text: 'Боевой шагоход Фиджин — телепортится сквозь стены из-за рассинхрона. Иван выкрутил тикрейт в ноль. Дай мне поднять синхрон!' },
  ]),
  mission_lvl_5: script('mission_lvl_5', [
    { speaker: 'khatenkov', side: 'right', text: 'Хатенков, командир полигона. Тут всегда жарко, но сегодня — особенно.' },
    { speaker: 'mech', side: 'left', text: 'У нас турели, а не пушки. Сойдёт?' },
    { speaker: 'khatenkov', text: 'Турель — та же пушка, только терпеливее. Из шутеров лезет вся боёвка, а главный — Тактикул, читер со стажем. Держи периметр!' },
  ]),
  mission_lvl_6: script('mission_lvl_6', [
    { speaker: 'vadim', side: 'right', text: 'Вадим, хостинг и дата-центр. Последние стойки в округе, где ещё горят лампочки.' },
    { speaker: 'mech', side: 'left', text: 'Сколько их у тебя?' },
    { speaker: 'vadim', text: 'Было много. В подвале завёлся Хотэл — поднял «бесплатный тариф», оттуда и лезут. Прикрой ресепшен, я переключу питание!' },
  ]),
  mission_lvl_7: script('mission_lvl_7', [
    { speaker: 'teodor', side: 'right', text: 'Дошли! Я Теодор. За той дверью — последний Сеньор, тот, кто кодит руками. Только он… вас не ждёт.' },
    { speaker: 'mech', side: 'left', text: 'В смысле «не ждёт»? Мир спасать надо.' },
    { speaker: 'teodor', text: 'А ему хоть трава не расти — кроме клубники. Сидит, настраивает гидропонику и слышать ничего не хочет о спасении. Пробейся к нему, я держу дверь!' },
  ]),

  // --- Per-level boss taunts (play when the boss finale wave spawns) ---------
  // The VILLAIN finally speaks: a couple of phrases traded with the heroes right
  // as it walks on. Triggered by BattleScene on the boss wave; the sim is held
  // until the player taps through.
  boss_taunt_lvl_1: script('boss_taunt_lvl_1', [
    { speaker: 'boss_rr', side: 'right', text: 'Я Эр-Эр. Релиз — откат, релиз — откат. А этот район я просто откачу. В ноль.' },
    { speaker: 'mech', side: 'left', text: 'Этот билд мы доведём до прода — без тебя.' },
    { speaker: 'boss_rr', text: 'Тогда деплой свою храбрость. Погнали!' },
  ]),
  boss_taunt_lvl_2: script('boss_taunt_lvl_2', [
    { speaker: 'boss_duck', side: 'right', text: 'КРЯ. Я Дакки, боевая утка отладки. Все ваши баги теперь мои.' },
    { speaker: 'coder', side: 'left', text: 'Это просто утка с ножом.' },
    { speaker: 'boss_duck', text: 'Утка. С. Ножом. И с молнией. КРЯ!' },
  ]),
  boss_taunt_lvl_3: script('boss_taunt_lvl_3', [
    { speaker: 'boss_olivia', side: 'right', text: 'Фу, моды. Я Оливия, королева чата. Тут мои правила и мои читы.' },
    { speaker: 'mech', side: 'left', text: 'Правила сервера сейчас поменяются.' },
    { speaker: 'boss_olivia', text: 'Только попробуй. Забанить ВАС будет особенно приятно!' },
  ]),
  boss_taunt_lvl_4: script('boss_taunt_lvl_4', [
    { speaker: 'boss_fijin', side: 'right', text: '[РАССИНХРОН] Цель… вижу… вижу везде. Я Фиджин. Лаг — моё оружие.' },
    { speaker: 'coder', side: 'left', text: 'Он мигает по всей карте.' },
    { speaker: 'boss_fijin', text: 'Пинг… четыреста… Огонь по всем направлениям!' },
  ]),
  boss_taunt_lvl_5: script('boss_taunt_lvl_5', [
    { speaker: 'boss_tacticool', side: 'right', text: 'Слышь, нуб. Я Тактикул. Вкатился к вам прямо из лобби — со всеми читами.' },
    { speaker: 'mech', side: 'left', text: 'Читы тут не грузятся. Только мы.' },
    { speaker: 'boss_tacticool', text: 'Сейчас захостю вам поражение. Поехали!' },
  ]),
  boss_taunt_lvl_6: script('boss_taunt_lvl_6', [
    { speaker: 'boss_hotel', side: 'right', text: 'Добро пожаловать в «Хотэл». Я управляющий. У вас бронь? Нет? Тогда выселяю.' },
    { speaker: 'coder', side: 'left', text: 'Мы не гости. Мы выезд.' },
    { speaker: 'boss_hotel', text: 'Тогда обслуживание по высшему разряду. На выход!' },
  ]),
  // lvl_7 villain = the Last Senior himself. The heroes break through to him; he
  // wants nothing but his strawberries — until he learns they're vibecoders.
  boss_taunt_lvl_7: script('boss_taunt_lvl_7', [
    { speaker: 'senior', side: 'right', text: 'Кроссовки, говоришь? Передай Матриарху — у меня клубника по графику. Никакого спасения мира.' },
    { speaker: 'mech', side: 'left', text: 'Без тебя мир не переписать. Мы сами немного вайбкодеры — но учимся.' },
    { speaker: 'senior', text: 'ВАЙБкодеры?! Так это ВЫ всё и сломали! С глаз долой — будете отлажены. Вручную!' },
  ]),

  // --- Per-level victory beats (play after a clear, before the result) ------
  // The villain admits defeat and flees back into its game, then the division
  // HEAD thanks the heroes and sends them onward.
  victory_lvl_1: script('victory_lvl_1', [
    { speaker: 'boss_rr', side: 'right', text: 'Откат не прошёл… сам откатываюсь. В свой билд, живо!' },
    { speaker: 'klevak', side: 'right', text: 'Район живой! Я… эм… почти не виноват, да? Главное — починили!' },
    { speaker: 'mech', side: 'left', text: 'Чини свой вайб, Иван. Нам дальше — Сеньор сам себя не найдёт.' },
    // The recurring backseat-passenger gag begins: just a creeping feeling.
    { speaker: 'coder', side: 'left', text: 'Слушай… не оборачивайся. Тебе не кажется, что за нами кто-то следит?' },
    { speaker: 'mech', side: 'left', text: 'Дорога сзади пустая. Это нервишки после босса. Газуй.' },
  ]),
  victory_lvl_2: script('victory_lvl_2', [
    { speaker: 'boss_duck', side: 'right', text: 'Кря… ладно. Сегодня баланс сошёлся. Уплываю обратно в свой билд!' },
    { speaker: 'finance', side: 'right', text: 'Гроссбухи целы, казна сходится до кредита! Спасибо, что не дали всё списать в утиль.' },
    { speaker: 'mech', side: 'left', text: 'Береги бюджет. Мы покатили дальше.' },
    // The gag escalates: now something is physically missing from the van.
    { speaker: 'coder', side: 'left', text: 'Стоп. А где печеньки? В бардачке лежала целая пачка!' },
    { speaker: 'mech', side: 'left', text: 'Я не трогал. Сами же не съелись… Ладно, потом разберёмся. Едем.' },
  ]),
  victory_lvl_3: script('victory_lvl_3', [
    { speaker: 'boss_olivia', side: 'right', text: 'Ладно-ладно… снимаю корону. Ухожу в свой тред. Пока!' },
    { speaker: 'strateg', side: 'right', text: 'Чат притих, локали на месте. Спасибо, что не зафлудили!' },
    { speaker: 'mech', side: 'left', text: 'Обращайся. Дальше по маршруту.' },
    // The reveal: the heroes turn around and there he is. He never speaks; from
    // now on he just silently watches at the end of every level (and the finale).
    { speaker: 'coder', side: 'left', text: 'Опять этот холодок по спине. Мех, тормозни — я обернусь.' },
    { speaker: 'mech', side: 'left', text: 'Да сзади никого нет, отвеч—…' },
    { speaker: 'coder', side: 'left', text: 'ОН. ВСЁ ЭТО ВРЕМЯ. С НАМИ. НА ЗАДНЕМ СИДЕНЬЕ.' },
    { speaker: 'spy', side: 'right', text: '[молчит и смотрит]' },
  ]),
  victory_lvl_4: script('victory_lvl_4', [
    { speaker: 'boss_fijin', side: 'right', text: '[КРИТ. ОШИБКА] Соединение… потеряно… Откат в свой билд…' },
    { speaker: 'voevoda', side: 'right', text: 'Пинг ровный, синхрон есть! Регион снова держит строй.' },
    { speaker: 'mech', side: 'left', text: 'Нас не жди — мы своим ходом.' },
    { speaker: 'spy', side: 'right', text: '[молчит и смотрит]' },
  ]),
  victory_lvl_5: script('victory_lvl_5', [
    { speaker: 'boss_tacticool', side: 'right', text: 'Лагает… читы отвалились… Всё, рейдж-квит! Ливаю в свой билд.' },
    { speaker: 'khatenkov', side: 'right', text: 'Чисто! Хитбоксы на месте, полигон наш.' },
    { speaker: 'mech', side: 'left', text: 'Ну и грохоту. Поехали, пока в ушах звенит.' },
    { speaker: 'spy', side: 'right', text: '[молчит и смотрит]' },
  ]),
  victory_lvl_6: script('victory_lvl_6', [
    { speaker: 'boss_hotel', side: 'right', text: 'Жалоба в книгу… съезжаю. Освобождаю номер — обратно в свой билд.' },
    { speaker: 'vadim', side: 'right', text: 'Питание стабильно, гости выселены. Номер за нами — заезжай как герой.' },
    { speaker: 'mech', side: 'left', text: 'В другой раз. Нам ещё ехать.' },
    { speaker: 'spy', side: 'right', text: '[молчит и смотрит]' },
  ]),
  // The Last Senior, beaten, gets his red sneakers back — and remembers who he is.
  victory_lvl_7: script('victory_lvl_7', [
    { speaker: 'senior', side: 'right', text: 'Всё, всё… сдаюсь. Давно так руки не разминал…' },
    { speaker: 'mech', side: 'left', text: 'Держи. Матриарх просила вернуть. (надевает на Сеньора красные кроссовки)' },
    { speaker: 'senior', side: 'right', text: '…Мои кроссовки. Чёрт. Пальцы сами просятся к клавиатуре. Ладно — поехали переписывать этот мир. По-человечески.' },
    { speaker: 'spy', side: 'center', text: '[молчит и смотрит]' },
  ]),

  // --- Finale (short epilogue over the world map) --------------------------
  // The sneaker reveal already happened in victory_lvl_7; this is just the send-off.
  finale: script('finale', [
    { speaker: 'narrator', text: 'Гидропоника осталась клубнике. В красных кроссовках Сеньор впервые за полгода скомпилировал строчку, написанную человеком — и весь мир чуть-чуть ожил.' },
    { speaker: 'senior', side: 'right', text: 'Строчка за строчкой. Без облака, без вайба. По-человечески.' },
    { speaker: 'coder', side: 'left', text: 'Слушай! А почему ты не стал вайбкодить-то?' },
    { speaker: 'senior', side: 'right', text: 'Да, когда всем нашим подписку на Колд Код выдали, мне Антон случайно таск на Gemini Api аппрувнул [Дикаприо Фейс]...' },
    { speaker: 'mech', side: 'left', text: 'Заводи Буханку. Работы — на целый мир.' },
    // The silent passenger gets the last word — by saying nothing, as always.
    { speaker: 'spy', side: 'center', text: '[молчит и смотрит]' },
  ]),

  // --- Post-credits sting (plays after the credits roll) -------------------
  // The silent backseat passenger was a corporate spy all along. He debriefs his
  // employer — the boss of rival studio Pixonic — in a shadowy office.
  finale_secret: script('finale_secret', [
    { speaker: 'secret_boss', side: 'right', text: 'Ну что, агент. Всё выяснил? Чертежи «Буханки 3000» у нас?' },
    { speaker: 'spy', side: 'center', text: '[молча кивает]' },
    { speaker: 'secret_boss', side: 'right', text: 'Прекрасно. У нас в Pixonic как раз сбросились лимиты. Навайбкодим из этого что-нибудь… масштабное.' },
  ]),
  // The robot reveal — over cutscene_final3 (the battle-truck built from the
  // stolen blueprints).
  finale_robot1: script('finale_robot1', [
    { speaker: 'narrator', text: 'По украденным чертежам в студии Pixonic за одну ночь навайбкодили боевую машину.' },
  ]),
  // …and over cutscene_final4 (it sprouts legs and walks). The spy gets the final
  // wordless beat, as always.
  finale_robot2: script('finale_robot2', [
    { speaker: 'narrator', text: '…а наутро она встала на ноги и пошла. Тестировать, разумеется, никто не стал.' },
    { speaker: 'secret_boss', side: 'right', text: 'Релиз в пятницу. Что может пойти не так?' },
    { speaker: 'spy', side: 'center', text: '[молчит и смотрит]' },
  ]),
};

/** Look up a dialogue script by id. */
export function getDialogue(id: string): DialogueScript | undefined {
  return DIALOGUES[id];
}

/** Localized text for the i-th line of a script (RU source as fallback). */
export function lineText(scriptId: string, index: number, source: string): string {
  return tData(`dialogue.${scriptId}.l${index}`, source);
}

/** Mission-brief script id for a level, if one exists. */
export function missionBriefId(levelId: string): string | undefined {
  const id = `mission_${levelId}`;
  return DIALOGUES[id] ? id : undefined;
}

/** Victory-dialogue script id for a level, if one exists. */
export function victoryDialogueId(levelId: string): string | undefined {
  const id = `victory_${levelId}`;
  return DIALOGUES[id] ? id : undefined;
}

/** Boss-taunt script id for a level (plays when the boss finale wave spawns). */
export function bossTauntId(levelId: string): string | undefined {
  const id = `boss_taunt_${levelId}`;
  return DIALOGUES[id] ? id : undefined;
}
