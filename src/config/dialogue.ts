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
  intro: script('intro', [
    { speaker: 'matriarch', side: 'center', text: 'Садитесь, дети мои. То, что я скажу, не должно выйти за стены этого гаража.' },
    { speaker: 'matriarch', text: 'Мир сломался тихо. Вайбкодеры пообещали, что ИИ напишет за нас всё. Потом — что починит. Теперь чинить уже некому.' },
    { speaker: 'coder', side: 'right', text: 'А монстры, что лезут из старых игр, — это тоже «фича»?' },
    { speaker: 'matriarch', text: 'Баг. Klevak навайбкодил вирус — и теперь твари выползают прямо из непропатченных билдов.' },
    { speaker: 'mech', side: 'left', text: 'И что, никто не сядет да не перепишет всё руками?' },
    { speaker: 'matriarch', text: 'Один может. Последний Сеньор — тот, кто пишет код без подсказок ИИ. Полгода назад он ушёл в саббатикал и не вернулся.' },
    { speaker: 'coder', text: 'Дай угадаю. Мы едем его искать.' },
    { speaker: 'matriarch', text: 'Вы отвезёте ему вот это. (достаёт пару красных кроссовок)' },
    { speaker: 'mech', text: '...Красные кроссовки?' },
    { speaker: 'matriarch', text: 'Его любимые. Без них он и метра не пробежит — а значит, не вернётся к работе. Доставьте их — и у мира появится второй шанс.' },
    { speaker: 'coder', text: '«Буханка 3000» заправлена. Локальные нейронки крутятся на наших видяхах — ни облака, ни вайба.' },
    { speaker: 'mech', text: 'Поехали. Найдём последнего сеньора.' },
  ]),

  // --- Per-level mission briefs (play in-battle, before the tutorial) -------
  mission_lvl_1: script('mission_lvl_1', [
    { speaker: 'boss_main', side: 'left', text: 'Живые люди! А я уж думал, остался один на районе с этим серваком.' },
    { speaker: 'mech', side: 'right', text: 'Буханка на месте. Что за твари тут у тебя лезут?' },
    { speaker: 'boss_main', text: 'Мобы из какой-то древней тэдэшки. Klevak «оптимизировал» дата-центр — теперь они прут волнами. Прикрой пульт, пока я перезагружаю стойки!' },
  ]),
  mission_lvl_2: script('mission_lvl_2', [
    { speaker: 'boss_duck', side: 'left', text: 'Тсс! Я объясняю баг резиновой утке. Это последний рабочий метод отладки в мире.' },
    { speaker: 'mech', side: 'right', text: 'А утка... отвечает?' },
    { speaker: 'boss_duck', text: 'Сегодня крякает багами наружу. Klevak сломал тестовый контур. Подержи оборону, пока я допишу автотесты!' },
  ]),
  mission_lvl_3: script('mission_lvl_3', [
    { speaker: 'boss_olivia', side: 'left', text: 'Привет, дорожные! Я держу комьюнити и локализацию — то есть кричу на монстров на пяти языках.' },
    { speaker: 'mech', side: 'right', text: 'И как, понимают?' },
    { speaker: 'boss_olivia', text: 'Аргументы у них из читерского билда. Klevak залил «фанатский патч» — теперь чат вылезает в реальность. Прикрой, пока я баню!' },
  ]),
  mission_lvl_4: script('mission_lvl_4', [
    { speaker: 'boss_fijin', side: 'left', text: 'Лаг-компенсация на пределе. Я держу нетокод региона голыми руками.' },
    { speaker: 'mech', side: 'right', text: 'Чувствую сквозняк пакетов. Что лезет?' },
    { speaker: 'boss_fijin', text: 'Лагающие мобы — телепортятся сквозь стены из-за рассинхрона. Klevak выкрутил тикрейт в ноль. Дай мне поднять серверы!' },
  ]),
  mission_lvl_5: script('mission_lvl_5', [
    { speaker: 'boss_tacticool', side: 'left', text: 'На полигоне жарко, боец. Сюда лезет вся боёвка из шутеров разом.' },
    { speaker: 'mech', side: 'right', text: 'Тактикул, у нас турели, а не пушки. Сойдёт?' },
    { speaker: 'boss_tacticool', text: 'Турель — та же пушка, только терпеливее. Klevak забагал хитбоксы. Держи периметр, я перезаряжаю!' },
  ]),
  mission_lvl_6: script('mission_lvl_6', [
    { speaker: 'boss_hotel', side: 'left', text: 'Добро пожаловать в «Хотэл» — последний хостинг, где ещё горят лампочки.' },
    { speaker: 'mech', side: 'right', text: 'Сколько у тебя стоек?' },
    { speaker: 'boss_hotel', text: 'Было много. Klevak поднял в подвале «бесплатный тариф» — оттуда и лезут. Прикрой ресепшен, я переключу питание!' },
  ]),
  mission_lvl_7: script('mission_lvl_7', [
    { speaker: 'boss_rr', side: 'left', text: 'Я Эр-Эр: релизы и откаты. И, кажется, мы сейчас откатимся прямо в каменный век.' },
    { speaker: 'mech', side: 'right', text: 'Что в проде?' },
    { speaker: 'boss_rr', text: 'Klevak зарелизил всё разом, без ревью. На подходе финальный билд монстров. Продержись — я готовлю откат!' },
  ]),

  // --- Per-level victory beats (play after a clear, before the result) ------
  victory_lvl_1: script('victory_lvl_1', [
    { speaker: 'boss_main', side: 'left', text: 'Стойки гудят, аптайм держится! Ты вернул район в сеть, механик.' },
    { speaker: 'mech', side: 'right', text: 'Не благодари — заводи генератор. Нам дальше: Сеньор сам себя не найдёт.' },
  ]),
  victory_lvl_2: script('victory_lvl_2', [
    { speaker: 'boss_duck', side: 'left', text: 'Тесты зелёные, утка довольна! Свободны от вылезающих багов.' },
    { speaker: 'mech', side: 'right', text: 'Береги утку. Мы покатили дальше.' },
  ]),
  victory_lvl_3: script('victory_lvl_3', [
    { speaker: 'boss_olivia', side: 'left', text: 'Чат забанен, тишина и мир. Спасибо, что не зафлудили!' },
    { speaker: 'mech', side: 'right', text: 'Обращайся. Дальше по маршруту.' },
  ]),
  victory_lvl_4: script('victory_lvl_4', [
    { speaker: 'boss_fijin', side: 'left', text: 'Пинг ровный, синхрон есть! Регион снова онлайн.' },
    { speaker: 'mech', side: 'right', text: 'Нас не жди — мы своим ходом.' },
  ]),
  victory_lvl_5: script('victory_lvl_5', [
    { speaker: 'boss_tacticool', side: 'left', text: 'Чисто! Хитбоксы на месте, полигон наш.' },
    { speaker: 'mech', side: 'right', text: 'Ну и грохоту. Поехали, пока в ушах звенит.' },
  ]),
  victory_lvl_6: script('victory_lvl_6', [
    { speaker: 'boss_hotel', side: 'left', text: 'Питание стабильно, гости выселены. Номер за нами — заезжай как герой.' },
    { speaker: 'mech', side: 'right', text: 'В другой раз. Нам ещё ехать.' },
  ]),
  victory_lvl_7: script('victory_lvl_7', [
    { speaker: 'boss_rr', side: 'left', text: 'Откат прошёл, прод стабилен! Дальше дорога к Сеньору открыта.' },
    { speaker: 'mech', side: 'right', text: 'Тогда не прощаемся. Едем за последним человеком, что пишет руками.' },
  ]),

  // --- Finale (plays over the finale cutscene) -----------------------------
  finale: script('finale', [
    { speaker: 'narrator', text: 'Дорога кончилась там, где кончились карты. Дальше — только выжженные сервачные и тишина без вентиляторов.' },
    { speaker: 'mech', side: 'right', text: 'Конец маршрута. И ни одного крякающего моба.' },
    { speaker: 'coder', side: 'left', text: 'Стой. Слышишь? Там кто-то... компилирует. Вручную.' },
    { speaker: 'senior', side: 'center', text: 'Полгода без единого автокомплита. Думал, про меня уже забыли.' },
    { speaker: 'mech', side: 'right', text: 'Матриарх передала. (протягивает красные кроссовки)' },
    { speaker: 'senior', side: 'center', text: '...Мои кроссовки. Ну всё. Теперь можно и поработать.' },
    { speaker: 'narrator', text: 'Он зашнуровал кроссовки — и впервые за полгода в мире скомпилировалась строчка, написанная человеком.' },
    { speaker: 'senior', side: 'center', text: 'Поехали переписывать этот мир. Строчка за строчкой. По-человечески.' },
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
