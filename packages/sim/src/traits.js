// Traits (docs/spec/traits.md 职业-1…职业-6): what a profession branch changes about its operators, as data — who it
// can target and in which order, how many, whether its attack heals, hits per attack, lasting modifiers, cost on a
// kill, the retreat refund — plus behaviours by branch for the rest, acting through a context (ADR 0055).
import { FPS, secondsToFrames } from '@aue/math';
import { KIND } from '@aue/schema';
import { statsOf } from './attrs.js';
import { makeBuff, addBuff, removeBuff } from './buffs.js';
import { inflict } from './status.js';
import { dealDamage, heal } from './damage.js';
import { dealEp } from './elements.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Unit} Unit @typedef {import('./types.js').Content} Content */
/** @typedef {import('./types.js').TraitDef} TraitDef @typedef {import('./types.js').OperatorDef} OperatorDef */

/**
 * What every trait leaves out, by position (职业-1): a melee operator can and prefers to attack the enemies it blocks
 * (even flying or out of range) and cannot select other flying ones; a ranged one can select flying enemies and does
 * not prefer the ones it blocks.
 * @param {string} position @returns {TraitDef}
 */
export const defaultTrait = (position) => ({
  antiAir: position !== 'MELEE', blockedFirst: position === 'MELEE', filter: 'HATRED_DES', secondary: '', targets: 1,
  heal: false, hits: 1, mods: {}, flags: {}, killCost: 0, refund: 0.5, hitStatus: null, splash: null, aftershock: 0, unblockedScale: 1, selfHeal: 0, selfHealMax: Infinity, selfHealOn: 'attack',
  rangedTiles: false, skillArts: false, immuneBlocking: [], hpDrain: 0, costDrain: null, zone: null, chain: null, healOnHit: 0,
  attackInSkill: false, idleMods: {}, idleFlags: {}, idleAirOnly: false, skillSplash: null, liftoffBlock: 0, fortress: 0, charge: null, skillHeal: 0, bullets: null, store: 0, epHeal: 0, funnel: null, boomerang: null, noAttack: false, free: false, regenAura: 0,
  summonBlocked: false, summonBlockedScale: 1, trapTiles: false, doll: null, rangeTiles: false, bb: {},
});

/**
 * Each record's last trait and what it was made from — its position, its trait object and that object's own fields in
 * order — given again while they are the same (the trait is asked for many times a frame). Not part of the state.
 * @type {WeakMap<OperatorDef, { trait: TraitDef, position: string, src: unknown, fields: unknown[] }>}
 */
const traitMemo = new WeakMap();

/** An object's own fields and values in order. @param {unknown} o @returns {unknown[]} */
function fieldsOf(o) {
  const out = [];
  if (o !== null && typeof o === 'object') for (const k in o) if (Object.hasOwn(o, k)) out.push(k, /** @type {Record<string, unknown>} */ (o)[k]);
  return out;
}

/** Whether an object's own fields and values are still those listed. @param {unknown} o @param {unknown[]} fields */
function sameFields(o, fields) {
  if (o === null || typeof o !== 'object') return fields.length === 0;
  let i = 0;
  for (const k in o) {
    if (!Object.hasOwn(o, k)) continue;
    if (i >= fields.length || fields[i] !== k || !Object.is(fields[i + 1], /** @type {Record<string, unknown>} */ (o)[k])) return false;
    i += 2;
  }
  return i === fields.length;
}

/**
 * An operator record's trait: its own fields over the defaults of its position (职业-1). The same object as the last
 * time while the record's position and trait fields are the same; never change it.
 * @param {OperatorDef} d @returns {TraitDef}
 */
export function traitOfDef(d) {
  const m = traitMemo.get(d);
  if (m !== undefined && m.position === d.position && m.src === d.trait && sameFields(d.trait, m.fields)) return m.trait;
  const trait = { ...defaultTrait(d.position), ...d.trait };
  traitMemo.set(d, { trait, position: d.position, src: d.trait, fields: fieldsOf(d.trait) });
  return trait;
}

/** A deployed operator's trait. @param {Content} c @param {Unit} op @returns {TraitDef} */
export const traitOf = (c, op) => traitOfDef(c.operators[op.key]);

/**
 * Whether an enemy is blocked by one of an operator's own summons (职业-14), as a test made for the units of now.
 * @param {World} w @param {Unit} op @returns {(e: Unit) => boolean}
 */
export function summonHeld(w, op) {
  const own = new Set(w.units.filter((u) => u.summoner === op.id).map((u) => u.id));
  return (e) => e.blockedBy >= 0 && own.has(e.blockedBy);
}

/**
 * A normal attack's maximum number of targets (职业-3): a number, the operator's 阻挡数 (at least 1), or every candidate.
 * @param {TraitDef} t @param {Unit} op
 */
export const traitTargets = (t, op) => (t.targets === 'all' ? Infinity : t.targets === 'blockCnt' ? Math.max(1, statsOf(op).blockCnt) : t.targets);

/**
 * The context a trait behaviour acts through (ADR 0055): the same functions as a skill's, with the trait's blackboard.
 * @typedef {object} TraitContext
 * @property {Readonly<Unit>} self
 * @property {Readonly<Record<string, number>>} bb
 * @property {number} frame
 * @property {(u: Unit) => import('./attrs.js').Stats} stats
 * @property {(target: Unit, init: import('./buffs.js').BuffInit) => void} addBuff
 * @property {(target: Unit, key: string) => void} removeBuff
 * @property {(target: Unit, key: import('./status.js').StatusKey, o?: import('./status.js').StatusOptions) => void} applyStatus
 * @property {(target: Unit, dmg: import('./damage.js').Damage) => number} dealDamage
 * @property {(target: Unit, element: import('./elements.js').Element, amount: number) => number} dealEp
 * @property {(target: Unit, amount: number) => number} heal
 * @property {(n: number) => void} gainCost
 */

/**
 * A trait's behaviour, by branch id (ADR 0055): at deployment, after each hit of its attacks, after a kill; whether its
 * operator may attack now (false: it may not); what an attack turn without a target does (true: it stored, its attack
 * interval starts again; false: nothing; undefined: the engine's own rule — 职业-6, 职业-12); which enemies it does not
 * select now (`skip`: true for one); whether it takes the place of the branch's own deployment effects for this operator
 * (true: no trait buff or upkeep from the engine).
 * @typedef {object} TraitBehavior
 * @property {(ctx: TraitContext) => void} [deploy]
 * @property {(ctx: TraitContext, target: Unit) => void} [hit]
 * @property {(ctx: TraitContext, target: Unit) => void} [kill]
 * @property {(ctx: TraitContext) => boolean | undefined} [canAttack]
 * @property {(ctx: TraitContext) => boolean | undefined} [store]
 * @property {(ctx: TraitContext) => boolean | undefined} [own]
 * @property {(ctx: TraitContext, target: Unit) => boolean | undefined} [skip]
 */

/** Gives the owner cost, up to the level's maximum (费用-1). @param {World} w @param {Content} c @param {number} seat @param {number} n */
export function gainCost(w, c, seat, n) {
  const p = w.players[seat];
  p.cost = Math.min(c.level.options.maxCost, p.cost + n);
}

/**
 * The context a behaviour of an operator acts through (技能-6, 职业-6; api.js CONTEXT_MEMBERS): its damage is the
 * operator's, and a kill by it is credited to the operator (职业-5).
 * @param {World} w @param {Content} c @param {Unit} op @param {Readonly<Record<string, number>>} bb @returns {TraitContext}
 */
export function actorContext(w, c, op, bb) {
  return {
    self: op, bb, frame: w.frame, stats: statsOf,
    addBuff: (t, init) => { addBuff(t, makeBuff({ src: op.id, ...init })); },
    removeBuff: (t, key) => { removeBuff(t, key); },
    applyStatus: (t, key, o) => { inflict(w, t, key, { ...o, src: op }); },
    dealDamage: (t, dmg) => creditedDamage(w, c, op, t, dmg),
    dealEp: (t, el, amount) => dealEp(w, t, el, amount, op),
    heal: (t, amount) => heal(w, op, t, amount),
    gainCost: (n) => { gainCost(w, c, op.owner, n); },
  };
}

/** @param {World} w @param {Content} c @param {Unit} op */
const contextOf = (w, c, op) => actorContext(w, c, op, traitOf(c, op).bb);

/** @param {Content} c @param {Unit} op @returns {TraitBehavior | null} */
function behaviorOf(c, op) {
  const branch = c.operators[op.key].branch ?? '', own = c.behaviors?.traits;
  return own && Object.hasOwn(own, branch) ? own[branch] : null;
}

/**
 * What an operator's trait behaviour answers (职业-6): its `canAttack`, `store` or `own`, undefined without one.
 * @param {World} w @param {Content} c @param {Unit} op @param {'canAttack' | 'store' | 'own'} name @returns {boolean | undefined}
 */
export function traitAsk(w, c, op, name) {
  const fn = behaviorOf(c, op)?.[name];
  return typeof fn === 'function' ? fn(contextOf(w, c, op)) : undefined;
}

/**
 * The enemies an operator's trait behaviour says it does not select now (职业-6: `skip`), as a test; null without one.
 * @param {World} w @param {Content} c @param {Unit} op @returns {((target: Unit) => boolean) | null}
 */
export function traitSkip(w, c, op) {
  const fn = behaviorOf(c, op)?.skip;
  if (typeof fn !== 'function') return null;
  const ctx = contextOf(w, c, op);
  return (t) => fn(ctx, t) === true;
}

/**
 * A newly deployed operator's trait (职业-4, 职业-10): its lasting modifiers and flags as a buff, its upkeep —
 * the HP drain each second, the cost it consumes — as buffs without an end — unless its behaviour owns them (职业-6),
 * then its behaviour's deploy.
 * @param {World} w @param {Content} c @param {Unit} op
 */
export function traitDeploy(w, c, op) {
  const t = traitOf(c, op);
  if (traitAsk(w, c, op, 'own') !== true) {
    if (Object.keys(t.mods).length > 0 || Object.keys(t.flags).length > 0) addBuff(op, makeBuff({ key: 'trait', src: op.id, mods: t.mods, flags: t.flags }));
    if (t.hpDrain > 0) addBuff(op, makeBuff({ key: 'drain', src: op.id, every: FPS, fixed: true, value: t.hpDrain }));
    if (t.costDrain) addBuff(op, makeBuff({ key: 'upkeep', src: op.id, every: secondsToFrames(t.costDrain.every), fixed: true, value: t.costDrain.cost }));
  }
  behaviorOf(c, op)?.deploy?.(contextOf(w, c, op));
}

/**
 * After each hit of an operator's attack (职业-4): the trait's status on the target, then its behaviour.
 * @param {World} w @param {Content} c @param {Unit} op @param {Unit} target
 */
export function traitHit(w, c, op, target) {
  const t = traitOf(c, op);
  if (t.hitStatus && target.hp > 0) inflict(w, target, t.hitStatus.key, { seconds: t.hitStatus.seconds, src: op });
  behaviorOf(c, op)?.hit?.(contextOf(w, c, op), target);
}

/**
 * An operator's attack or skill killed an enemy (职业-5): the trait's cost, then its behaviour.
 * @param {World} w @param {Content} c @param {Unit} op @param {Unit} target
 */
export function traitKill(w, c, op, target) {
  if (op.kind !== KIND.OPERATOR || target.kind !== KIND.ENEMY) return;
  const t = traitOf(c, op);
  if (t.killCost > 0) gainCost(w, c, op.owner, t.killCost);
  behaviorOf(c, op)?.kill?.(contextOf(w, c, op), target);
}

/**
 * Deals damage as an operator's attack or skill and credits a kill to it (职业-5): the target had HP before and has
 * none after. Returns the HP taken.
 * @param {World} w @param {Content} c @param {Unit} op @param {Unit} target @param {import('./damage.js').Damage} dmg
 */
export function creditedDamage(w, c, op, target, dmg) {
  const alive = target.hp > 0, taken = dealDamage(w, op, target, dmg, c);
  traitDealt(w, c, op, target, { dmg, taken });
  if (alive && target.hp <= 0) traitKill(w, c, op, target);
  return taken;
}

/**
 * An operator's heal for a hit it dealt (职业-9): a trait that heals itself for every hit (`selfHealOn` 'damage', 武者)
 * restores its `selfHeal` once for each hit of its that took HP from an enemy — any hit with it as the source, an
 * attack's or not; 生命流失 and a sourceless hit (伤害-7) aside.
 * @param {World} w @param {Content} c @param {Unit} op @param {Unit} target @param {{ dmg: import('./damage.js').Damage, taken: number }} hit the hit and the HP it took
 */
export function traitDealt(w, c, op, target, hit) {
  if (!(hit.taken > 0) || hit.dmg.hpLoss || hit.dmg.sourceless || target.kind !== KIND.ENEMY || op.hp <= 0) return;
  const t = traitOf(c, op);
  if (t.selfHealOn === 'damage' && t.selfHeal > 0) w.events.push({ type: 'heal', id: op.id, target: op.id, amount: heal(w, op, op, t.selfHeal, { trait: true }) });
}
