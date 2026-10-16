// Branch traits of the official content (docs/spec/traits.md 职业-7): each covered profession branch as the engine's
// trait data and damage type — data first; a branch that needs more than the data is not covered yet and takes the
// defaults of its position (M4).

import rangeTable from '../data/ranges.json' with { type: 'json' };

/** @typedef {import('@aue/sim').TraitDef} TraitDef @typedef {import('@aue/sim').OperatorDef} OperatorDef */

/**
 * A covered branch: its normal attack's damage type, and its trait as data, made from the trait's blackboard and its
 * module's hidden talents' (干员-7).
 * @typedef {{ dmgType?: 'phys' | 'arts', trait?: (bb: Readonly<Record<string, number>>, hidden?: Readonly<Record<string, number>>) => Partial<TraitDef> }} Branch
 */

const ARTS = /** @type {const} */ ('arts');
/** Normal attacks heal; at most n targets. @param {number} n @returns {Branch} */
const healer = (n) => ({ trait: () => ({ heal: true, targets: n }) });
/** A range of range_table by id (干员-8). @param {string} id @returns {{ row: number, col: number }[]} */
const cellsOf = (id) => /** @type {Record<string, { row: number, col: number }[]>} */ (rangeTable.ranges)[id];
/**
 * The seconds of a 傀儡师's switch between its own form and its 替身 (职业-15): every one of the switch clips of the 7
 * 傀儡师's battle skeletons (Start_B, Start_2, Doll_SwitchIn, Doll_SwitchOut, SwitchOut …) lasts 1 s.
 */
const DOLL_SWITCH = 1;
/** The normal attack's maximum targets is the 阻挡数. @type {Branch} */
const blockTargets = { trait: () => ({ targets: 'blockCnt' }) };

/** The covered branches, by subProfessionId (职业-7). A branch not here uses its position's defaults. */
export const BRANCHES = Object.freeze(/** @type {Record<string, Branch>} */ ({
  // 先锋
  pioneer: {},
  agent: { trait: () => ({ antiAir: true, blockedFirst: false }) },
  bearer: {},
  charger: { trait: (bb) => ({ killCost: bb.cost ?? 1, refund: 1 }) },
  // its 战术点 is a summon (召唤-11); × atk_scale against the enemies its own summons block (职业-14)
  tactician: { trait: (bb) => ({ summonBlockedScale: bb.atk_scale ?? 1.5 }) },
  // the support of the operators in the deck is its skills' and talents' (职业-7)
  counsellor: {},
  // 近卫
  fearless: {},
  fighter: {},
  artsfghter: { dmgType: ARTS },
  sword: { trait: () => ({ hits: 2 }) },
  // the attack's 倍率 against an enemy it does not block (职业-8)
  instructor: { trait: (bb) => ({ unblockedScale: bb.atk_scale ?? 1.2 }) },
  lord: { trait: (bb) => ({ antiAir: true, unblockedScale: bb.atk_scale ?? 0.8 }) },
  // the other enemies around the target take the share of the hit (职业-8)
  hammer: { trait: (bb) => ({ splash: { radius: bb['attack@ability_range_radius'] ?? 1, scale: bb['attack@atk_scale_2'] ?? 0.5, ground: false } }) },
  centurion: blockTargets,
  // no ally heals them; they heal themselves for the enemies their attacks reach (职业-9)
  musha: { trait: (bb) => ({ flags: { noAllyHeal: true }, selfHeal: bb.value ?? 0, selfHealOn: 'damage' }) },
  reaper: { trait: (bb) => ({ flags: { noAllyHeal: true }, filter: 'ALL', targets: 'all', selfHeal: bb.value ?? 0, selfHealMax: 'blockCnt' }) },
  crusher: blockTargets,
  primguard: {},
  // the 应变 that spends cost is its skills' (职业-7)
  mercenary: {},
  // attacks only while its skill runs; 阻挡数 × 0 while it does not, and an attack bonus building up to atk over max_stack_cnt s (职业-12)
  librator: { trait: (bb, hidden) => ({ attackInSkill: true, idleMods: { blockCntMul: 0 }, charge: { atk: bb.atk ?? 2, steps: bb.max_stack_cnt ?? 40, init: hidden?.init_atk ?? 0 } }) },
  // 重装
  protector: {},
  guardian: {},
  primprotector: {},
  shotprotector: { trait: () => ({ antiAir: true }) },
  unyield: { trait: () => ({ flags: { noAllyHeal: true } }) },
  // 阻回 always, but not while it blocks (职业-10)
  duelist: { trait: () => ({ flags: { noSp: true }, immuneBlocking: ['noSp'] }) },
  artsprotector: { trait: () => ({ skillArts: true }) },
  // 狙击
  fastshot: { trait: () => ({ secondary: 'FLY_FIRST' }) },
  closerange: {},
  longrange: { trait: () => ({ filter: 'DEF_ASC' }) },
  siegesniper: { trait: () => ({ filter: 'MASS_DES' }) },
  aoesniper: { trait: () => ({ splash: { radius: 1, scale: 1, ground: false } }) },
  bombarder: { trait: (bb) => ({ antiAir: false, splash: { radius: 0.9, scale: 1, ground: true }, aftershock: bb['attack@append_atk_scale'] ?? 0.5 }) },
  // melee on what it blocks or what stands on its tile, ranged with a 1.0 splash on the others in its range (职业-12)
  fortress: { trait: () => ({ fortress: 1 }) },
  // air too; blocks 2 flying enemies once it took off (职业-12)
  skywalker: { trait: () => ({ antiAir: true, liftoffBlock: 2 }) },
  // air too, the blocked first; up in the air (起飞) while its skill does not run, attacking only flying enemies and those it
  // blocks; its skill's attacks splash 1.1 (职业-12)
  skybreaker: { trait: () => ({ antiAir: true, blockedFirst: true, idleFlags: { liftoff: true }, idleAirOnly: true, skillSplash: { radius: 1.1, scale: 1, ground: false } }) },
  // its attacks throw boomerangs, out at 15 and back at 3.75 tiles a second; it attacks again once it caught them all (职业-12)
  loopshooter: { trait: () => ({ boomerang: { out: 15, back: 3.75 } }) },
  // value bullets at atk_scale, reloaded one at a time (职业-12)
  hunter: { trait: (bb) => ({ bullets: { max: bb.value ?? 8, scale: bb.atk_scale ?? 1.2 } }) },
  // every enemy in range; 倍率 × atk_scale for those in its own and the three tiles before it (range 1-3, 职业-11)
  reaperrange: { trait: (bb) => ({ filter: 'ALL', targets: 'all', zone: { cells: cellsOf('1-3'), scale: bb.atk_scale ?? 1.5, outside: false } }) },
  // 术师
  corecaster: { dmgType: ARTS },
  blastcaster: { dmgType: ARTS, trait: () => ({ filter: 'ALL', targets: 'all' }) },
  // attacks only while its skill runs, every enemy in range, air ones too; DEF × (1 + def) and RES + magic_resistance while it does not (职业-12)
  phalanx: { dmgType: ARTS, trait: (bb) => ({ antiAir: true, filter: 'ALL', targets: 'all', attackInSkill: true, idleMods: { defPct: bb.def ?? 2, resFlat: bb.magic_resistance ?? 20 } }) },
  splashcaster: { dmgType: ARTS, trait: () => ({ splash: { radius: 1.1, scale: 1, ground: false } }) },
  // arts; also the enemies its own summons block, × atk_scale against them (its module's; 职业-14)
  soulcaster: { dmgType: ARTS, trait: (bb) => ({ summonBlocked: true, summonBlockedScale: bb.atk_scale ?? 1 }) },
  primcaster: { dmgType: ARTS },
  // arts, air too; init_atk_scale on a new target, delta_atk_scale more for each attack on the same, at most max_atk_scale (职业-12)
  funnel: { dmgType: ARTS, trait: (bb) => ({ antiAir: true, funnel: { init: bb.init_atk_scale ?? 0.2, delta: bb.delta_atk_scale ?? 0.15, max: bb.max_atk_scale ?? 1.1 } }) },
  // stores up to times attacks of energy when it has no target, and sends them with its next attack (职业-12)
  mystic: { dmgType: ARTS, trait: (bb) => ({ store: bb.times ?? 3 }) },
  // jumps among max_target enemies within 1.7 tiles, 85 % of the hit before; each hit 停顿 (职业-11)
  chain: { dmgType: ARTS, trait: (bb) => ({
    chain: { max: bb['attack@max_target'] ?? bb['attack@chain.max_target'] ?? 3, scale: 0.85, radius: 1.7, cells: null },
    hitStatus: { key: 'sluggish', seconds: bb['attack@sluggish'] ?? 0.5 },
  }) },
  // 医疗
  physician: healer(1),
  ringhealer: healer(3),
  watchman: healer(1),
  // heal_scale for a target outside range 2-3 (职业-11)
  healer: { trait: (bb) => ({ heal: true, targets: 1, zone: { cells: cellsOf('2-3'), scale: bb.heal_scale ?? 0.8, outside: true } }) },
  // jumps among max_target operators in the 3 × 3 around each, 75 % of the heal before (职业-11)
  chainhealer: { trait: (bb) => ({ heal: true, targets: 1, chain: { max: bb['attack@chain.max_target'] ?? 3, scale: bb['attack@chain.atk_scale'] ?? 0.75, radius: 0, cells: cellsOf('x-4') } }) },
  // its heals also restore element values by ep_heal_ratio of them (职业-12)
  wandermedic: { trait: (bb) => ({ heal: true, targets: 1, epHeal: bb.ep_heal_ratio ?? 0.5 }) },
  // arts; its damage heals the most wounded operator in range by scale of it (职业-11)
  incantationmedic: { dmgType: ARTS, trait: (bb) => ({ healOnHit: bb.scale ?? 0.5 }) },
  // 辅助
  slower: { dmgType: ARTS, trait: (bb) => ({ hitStatus: { key: 'sluggish', seconds: bb.sluggish ?? 0.8 } }) },
  // no attacks, outside the deploy limit; the operators in its range regenerate a share of its attack a second (职业-13)
  bard: { trait: (bb) => ({ noAttack: true, free: true, regenAura: bb['attack@atk_to_hp_recovery_ratio'] ?? bb.atk_to_hp_recovery_ratio ?? 0.1 }) },
  // arts; while its skill runs, its attacks heal at heal_scale (职业-12)
  blessing: { dmgType: ARTS, trait: (bb) => ({ skillHeal: bb.heal_scale ?? 0.75 }) },
  summoner: { dmgType: ARTS },
  underminer: { dmgType: ARTS },
  ritualist: { dmgType: ARTS },
  // its support devices are summons (召唤-4); 触发型效果 are its skills' (职业-7)
  craftsman: {},
  supportiveranger: {},
  // 特种
  executor: {},
  // its 炼金单元 are its skills' (职业-7)
  alchemist: {},
  // at 0 HP in its own form, a switch to its 替身 for duration seconds, attack and HP + atk, max_hp; switches take 1 s (职业-15)
  dollkeeper: { trait: (bb) => ({ doll: { duration: bb.duration ?? 20, switch: DOLL_SWITCH, atk: bb.atk ?? 0, maxHp: bb.max_hp ?? 0 } }) },
  // its summons (traps) not on a tile a ground enemy stands on (职业-14)
  traper: { trait: () => ({ trapTiles: true }) },
  // every enemy in range; half of the physical and arts hits dodged (blackboard prob)
  stalker: { trait: (bb) => ({ filter: 'ALL', targets: 'all', blockedFirst: false, mods: { dodgePhys: bb.prob ?? 0.5, dodgeArts: bb.prob ?? 0.5 } }) },
  // melee, but may stand on ranged tiles too (职业-10)
  pusher: { trait: () => ({ targets: 'blockCnt', rangedTiles: true }) },
  hookmaster: { trait: () => ({ antiAir: true, rangedTiles: true }) },
  // no refund; the blackboard's cost (negative) every interval seconds on the field, or it retreats (职业-10)
  merchant: { trait: (bb) => ({ refund: 0, costDrain: { every: bb.interval ?? 3, cost: -(bb.cost ?? -3) } }) },
  geek: { trait: (bb) => ({ hpDrain: bb.hp_ratio ?? 0.01 }) },
}));

/** Whether a branch's trait is covered (职业-7). @param {string} branch */
export const coveredBranch = (branch) => Object.hasOwn(BRANCHES, branch);

/**
 * An operator record with its branch's trait (职业-7): the damage type and the trait data from the branch table and the
 * trait's blackboard (`traitBb`) and its module's hidden talents' (`hiddenBb`, 干员-7); an uncovered branch adds nothing.
 * @param {OperatorDef & { traitBb?: Record<string, number>, hiddenBb?: Record<string, number> }} op @returns {OperatorDef}
 */
export function withTrait(op) {
  const { traitBb = {}, hiddenBb = {}, ...rest } = op;
  const b = op.branch && coveredBranch(op.branch) ? BRANCHES[op.branch] : null;
  if (!b) return rest;
  return { ...rest, ...(b.dmgType ? { dmgType: b.dmgType } : {}), trait: { ...b.trait?.(traitBb, hiddenBb), bb: { ...traitBb } } };
}

/**
 * Trait data of single operators beyond their branch's, by character id (职业-7). 谬因: her search and attack judge an
 * enemy by the tile of its position, not by its collider (体积-5; PRTS 谬因 oldid=435070, 链路协议 备注
 * "谬因的索敌与攻击始终采用格子判定而非碰撞判定").
 * @type {Readonly<Record<string, Readonly<Partial<TraitDef>>>>}
 */
export const OPERATOR_TRAITS = Object.freeze({ char_4229_aphris: Object.freeze({ rangeTiles: true }) });

/**
 * An operator record with its own trait data (OPERATOR_TRAITS) over its branch's; another operator's as it is.
 * @param {string} id the character id @param {OperatorDef} op @returns {OperatorDef}
 */
export const withOwnTrait = (id, op) => (Object.hasOwn(OPERATOR_TRAITS, id) ? { ...op, trait: { ...op.trait, ...OPERATOR_TRAITS[id] } } : op);
