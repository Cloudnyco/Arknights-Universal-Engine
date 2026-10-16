// Branch traits of the official content (docs/spec/traits.md 职业-7): the covered branches are real ones
// (test/fixtures/branches.json, from character_table), operator records take their branch's damage type and trait, an
// uncovered branch takes the defaults; covered traits play out in the simulation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWorld, step, traits, attrs } from '@aue/sim';
import { tinyContent } from '@aue/testkit';
import { BRANCHES, coveredBranch, withTrait, withOwnTrait, OPERATOR_TRAITS, skeletonContent, loadTraining, operatorAt, matchContent } from '../src/index.js';

/** @type {Record<string, { name: string, profession: string, position: string[] }>} */
const ALL = JSON.parse(readFileSync(new URL('fixtures/branches.json', import.meta.url), 'utf8')).branches;

test('[职业-7] the branch table covers all 72 official branches', () => {
  assert.equal(Object.keys(ALL).length, 72);
  for (const b of Object.keys(BRANCHES)) assert.ok(Object.hasOwn(ALL, b), b);
  assert.equal(Object.keys(BRANCHES).length, 72);
  assert.ok(coveredBranch('fastshot') && coveredBranch('funnel') && coveredBranch('traper') && coveredBranch('tactician') && coveredBranch('dollkeeper') && !coveredBranch('toString'));
});

test('[职业-7] an operator record takes its branch\'s damage type and trait; the blackboard moves into the trait', () => {
  const base = { name: 'x', position: 'MELEE', cost: 9, blockCnt: 1, baseAttackTime: 1, maxHp: 1, atk: 1, def: 0, res: 0, range: [] };
  const charger = withTrait({ ...base, branch: 'charger', traitBb: { cost: 1 } });
  assert.deepEqual(charger.trait, { killCost: 1, refund: 1, bb: { cost: 1 } });
  assert.equal('traitBb' in charger, false);
  assert.deepEqual(withTrait({ ...base, position: 'RANGED', branch: 'corecaster' }).dmgType, 'arts');
  assert.deepEqual(withTrait({ ...base, position: 'RANGED', branch: 'slower', traitBb: { sluggish: 0.8 } }).trait?.hitStatus, { key: 'sluggish', seconds: 0.8 });
  assert.deepEqual(withTrait({ ...base, position: 'RANGED', branch: 'ringhealer' }).trait, { heal: true, targets: 3, bb: {} });
  const funnel = withTrait({ ...base, position: 'RANGED', branch: 'funnel', traitBb: { init_atk_scale: 0.35, delta_atk_scale: 0.15, max_atk_scale: 1.2 } });
  assert.deepEqual([funnel.dmgType, funnel.trait?.antiAir, funnel.trait?.funnel], ['arts', true, { init: 0.35, delta: 0.15, max: 1.2 }]);
  const loop = withTrait({ ...base, position: 'RANGED', branch: 'unknownbranch', traitBb: { max_stack_cnt: 6 } });
  assert.equal(loop.trait, undefined, 'not covered: the position\'s defaults');
  assert.deepEqual(traits.traitOfDef(loop).antiAir, true);
});

test('[职业-7] the skeleton\'s operators carry their branches: 铁卫, 尖兵, 速射手', () => {
  const ops = skeletonContent.operators;
  assert.deepEqual(['char_500_noirc', 'char_502_nblade', 'char_503_rang'].map((k) => [ops[k].branch, ops[k].respawnTime]), [['protector', 70], ['pioneer', 70], ['fastshot', 70]]);
  assert.equal(traits.traitOfDef(ops.char_503_rang).secondary, 'FLY_FIRST');
});

test('[职业-2] [职业-7] a 医师 from the table heals the wounded guard in the simulation', () => {
  const c = tinyContent();
  c.level.waves = [];
  c.operators.medic = withTrait({ ...c.operators.sniper, branch: 'physician', atk: 200, range: [{ row: 0, col: 0 }, { row: -1, col: 0 }] });
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c, [[0, { type: 'deploy', op: 'medic', row: 2, col: 2, dir: 0 }], [0, { type: 'deploy', op: 'guard', row: 1, col: 2, dir: 0 }]]);
  const guard = w.units[1];
  guard.hp = 500;
  const ev = step(w, c);
  assert.deepEqual(ev.filter((e) => e.type === 'heal').map((e) => [e.target, e.amount]), [[guard.id, 200]]);
  assert.equal(guard.hp, 700);
  assert.equal(attrs.statsOf(guard).maxHp, 1000);
});

/** A real operator of the branch at elite 0, level 1. @param {string} id */
const real = async (id) => operatorAt(await loadTraining(id), { elite: 0, level: 1, potential: 1, trust: 0, skill: 0, skillLevel: 1 });

test('[职业-7] 情报官 and 伏击客 from the real data: 可对空 / all enemies in range, no priority for the blocked, half dodged', async () => {
  const agent = traits.traitOfDef(await real('char_4017_puzzle'));
  assert.deepEqual([agent.antiAir, agent.blockedFirst, agent.targets], [true, false, 1]);
  const stalker = await real('char_215_mantic'), t = traits.traitOfDef(stalker);
  assert.deepEqual([t.filter, t.targets, t.blockedFirst, t.mods], ['ALL', 'all', false, { dodgePhys: 0.5, dodgeArts: 0.5 }]);
  assert.equal(stalker.tauntLevel, -1, '嘲讽等级 -1 is in the operator data, not added by the trait');
});

test('[职业-7] 本源术师 and 巫役 from the real data deal arts damage; the 本源 melee and 执旗手 take the defaults', async () => {
  for (const id of ['char_1040_blaze2', 'char_1042_phatm2']) assert.equal((await real(id)).dmgType, 'arts', id);
  for (const id of ['char_4187_graceb', 'char_2026_yu', 'char_151_myrtle']) {
    const op = await real(id);
    assert.equal(op.dmgType, undefined, id);
    assert.deepEqual(traits.traitOfDef(op), { ...traits.defaultTrait('MELEE'), bb: op.trait?.bb ?? {} }, id);
  }
});

test('[职业-7] [职业-8] 炮手, 扩散术师, 撼地者, 投掷手, 教官 and 领主 from the real data', async () => {
  const t = async (/** @type {string} */ id) => traits.traitOfDef(await real(id));
  assert.deepEqual((await t('char_113_cqbw')).splash, { radius: 1, scale: 1, ground: false });
  const f12 = await real('char_1011_lava2');
  assert.deepEqual([f12.dmgType, traits.traitOfDef(f12).splash], ['arts', { radius: 1.1, scale: 1, ground: false }]);
  assert.deepEqual((await t('char_1051_headb2')).splash, { radius: 1, scale: 0.5, ground: false });
  const greyy = await t('char_1027_greyy2');
  assert.deepEqual([greyy.antiAir, greyy.splash, greyy.aftershock], [false, { radius: 0.9, scale: 1, ground: true }, 0.5]);
  assert.equal((await t('char_130_doberm')).unblockedScale, 1.2);
  const lap = await t('char_140_whitew');
  assert.deepEqual([lap.antiAir, lap.blockedFirst, lap.unblockedScale], [true, true, 0.8]);
});

test('[职业-7] [职业-9] 武者, 收割者 and 不屈者 from the real data: no ally heals them; the first two heal themselves', async () => {
  const t = async (/** @type {string} */ id) => traits.traitOfDef(await real(id));
  const helage = await t('char_188_helage');
  assert.deepEqual([helage.flags, helage.selfHeal, helage.selfHealMax, helage.selfHealOn], [{ noAllyHeal: true }, 30, Infinity, 'damage'], '武者: for every hit');
  const excu2 = await t('char_1032_excu2');
  assert.deepEqual([excu2.flags, excu2.selfHeal, excu2.selfHealMax, excu2.targets, excu2.selfHealOn], [{ noAllyHeal: true }, 50, 'blockCnt', 'all', 'attack'], '收割者: for the enemies an attack reaches');
  assert.deepEqual((await t('char_163_hpsts')).flags, { noAllyHeal: true });
});

test('[职业-7] [职业-10] the upkeep branches from the real data: 行商, 怪杰, 决战者, 推击手, 钩索师, 驭法铁卫', async () => {
  const [merchant, geek, duelist, pusher, hook, arts] = await Promise.all(['char_1033_swire2', 'char_1041_angel2', 'char_416_zumama', 'char_241_panda', 'char_173_slchan', 'char_1044_hsgma2']
    .map(async (id) => traits.traitOfDef(await real(id))));
  assert.deepEqual([merchant.refund, merchant.costDrain], [0, { every: 3, cost: 3 }]);
  assert.equal(geek.hpDrain, 0.01);
  assert.deepEqual([duelist.flags, duelist.immuneBlocking], [{ noSp: true }, ['noSp']]);
  assert.deepEqual([pusher.targets, pusher.rangedTiles, hook.antiAir, hook.rangedTiles, arts.skillArts], ['blockCnt', true, true, true, true]);
});

test('[职业-7] [职业-11] zones and chains from the real data: 散射手, 疗养师, 链术师 (elite 0 and 2), 链愈师, 咒愈师', async () => {
  const at = async (/** @type {string} */ id, elite = 0) => /** @type {any} */ (traits.traitOfDef(operatorAt(await loadTraining(id), { elite, level: 1, potential: 1, trust: 0, skill: -1, skillLevel: 1 })));
  const [reaper, healer, chain0, chain2, chainHeal, incant] = await Promise.all([at('char_1013_chen2'), at('char_348_ceylon'), at('char_306_leizi'), at('char_306_leizi', 2), at('char_4071_peper'), at('char_1020_reed2')]);
  /** A zone or chain with its cells counted. @param {any} z */
  const counted = (z) => ({ ...z, cells: z.cells && z.cells.length });
  assert.deepEqual([counted(reaper.zone), reaper.targets], [{ cells: 4, scale: 1.5, outside: false }, 'all']);
  assert.deepEqual([healer.heal, counted(healer.zone)], [true, { cells: 7, scale: 0.8, outside: true }]);
  assert.deepEqual([chain0.chain, chain2.chain.max, chain0.hitStatus], [{ max: 3, scale: 0.85, radius: 1.7, cells: null }, 4, { key: 'sluggish', seconds: 0.5 }]);
  assert.deepEqual([chainHeal.heal, counted(chainHeal.chain)], [true, { max: 3, scale: 0.75, radius: 0, cells: 9 }]);
  assert.equal(incant.healOnHit, 0.5);
});

test('[职业-7] [职业-12] attack modes from the real data: 解放者, 阵法术师, 护佑者, 猎手, 秘术师, 行医, 佣兵', async () => {
  const [lib, phalanx, bless, hunter, mystic, wander, merc] = await Promise.all(['char_1043_leizi2', 'char_4080_lin', 'char_1022_flwr2', 'char_4104_coldst', 'char_297_hamoni', 'char_1016_agoat2', 'char_1049_catap2']
    .map(async (id) => /** @type {any} */ (traits.traitOfDef(await real(id)))));
  assert.deepEqual([lib.attackInSkill, lib.idleMods, lib.charge], [true, { blockCntMul: 0 }, { atk: 2, steps: 40, init: 0 }]);
  const t = await loadTraining('char_1043_leizi2'), libX = /** @type {any} */ (traits.traitOfDef(operatorAt(t, { elite: 2, level: 60, potential: 1, trust: 0, skill: 0, skillLevel: 7, module: t.modules.length - 1, moduleLevel: 1 })));
  assert.equal(libX.charge.init, 1, 'LIB-X 部署后获得+100%加成: from its hidden talent (init_atk)');
  assert.deepEqual([phalanx.attackInSkill, phalanx.idleMods, phalanx.targets, phalanx.antiAir], [true, { defPct: 2, resFlat: 20 }, 'all', true], '林: every enemy in range, only in her skill');
  assert.deepEqual([bless.skillHeal, hunter.bullets, mystic.store, wander.heal, wander.epHeal], [0.75, { max: 4, scale: 1.2 }, 3, true, 0.5], '冰酿 at elite 0: 4 bullets');
  assert.deepEqual([merc.blockedFirst, merc.antiAir], [true, false], '佣兵: the melee defaults');
});

test('[职业-7] [职业-13] 吟游者 from the real data: no attacks, outside the deploy limit, a regen aura of 10 % of its attack', async () => {
  const [sora, heidi] = await Promise.all(['char_101_sora', 'char_4045_heidi'].map(async (id) => /** @type {any} */ (traits.traitOfDef(await real(id)))));
  assert.deepEqual([sora.noAttack, sora.free, sora.regenAura, heidi.regenAura], [true, true, 0.1, 0.1]);
});

test('[职业-7] [职业-14] 塑灵术师, 陷阱师 and 战术家 from the real data; 策士, 工匠, 游击手 and 炼金师 take the defaults', async () => {
  const necras = await real('char_450_necras'), t = /** @type {any} */ (traits.traitOfDef(necras));
  assert.deepEqual([necras.dmgType, t.summonBlocked, t.summonBlockedScale, t.antiAir], ['arts', true, 1, true]);
  const n = await loadTraining('char_450_necras'), x = /** @type {any} */ (traits.traitOfDef(operatorAt(n, { elite: 2, level: 60, potential: 1, trust: 0, skill: 0, skillLevel: 7, module: 0, moduleLevel: 1 })));
  assert.equal(x.summonBlockedScale, 1.15, 'SOC-X 攻击力提升至115%');
  assert.equal(/** @type {any} */ (traits.traitOfDef(await real('char_451_robin'))).trapTiles, true);
  assert.equal(traits.traitOfDef(await real('char_452_bstalk')).summonBlockedScale, 1.5, '战术家 攻击力提升至150%');
  for (const id of ['char_4199_makiri', 'char_484_robrta', 'char_4234_pedro', 'char_4151_tinman']) {
    const op = await real(id);
    assert.deepEqual(traits.traitOfDef(op), { ...traits.defaultTrait(op.position), bb: {} }, id);
  }
});

test('[职业-7] [职业-15] 傀儡师 from the real data: a 20 s 替身, 1 s switches; PUM-Y raises its HP', async () => {
  assert.deepEqual(traits.traitOfDef(await real('char_369_bena')).doll, { duration: 20, switch: 1, atk: 0, maxHp: 0 });
  const t = await loadTraining('char_369_bena'), y = traits.traitOfDef(operatorAt(t, { elite: 2, level: 60, potential: 1, trust: 0, skill: 0, skillLevel: 7, module: 0, moduleLevel: 1 }));
  assert.deepEqual(y.doll, { duration: 20, switch: 1, atk: 0, maxHp: 0.2 });
});

test('[职业-7] [体积-5] 谬因 searches by tile: her own trait data over her 轰击术师 trait, in a match\'s records too; others keep theirs', async () => {
  assert.deepEqual(Object.keys(OPERATOR_TRAITS), ['char_4229_aphris']);
  const aphris = await real('char_4229_aphris'), t = traits.traitOfDef(withOwnTrait('char_4229_aphris', aphris));
  assert.deepEqual([t.rangeTiles, t.filter, t.targets, traits.traitOfDef(aphris).rangeTiles], [true, 'ALL', 'all', false]);
  const sniper = await real('char_1021_kroos2');
  assert.equal(withOwnTrait('char_1021_kroos2', sniper), sniper);
  const build = { elite: 2, level: 1, potential: 1, trust: 0, skill: 0, skillLevel: 1 };
  const ops = /** @type {Record<string, any>} */ ((await matchContent({ level: 'act1multi_01', difficulty: 'NORMAL', seed: 1,
    decks: [[{ id: 'char_4229_aphris', build }, { id: 'char_1021_kroos2', build }]] })).operators);
  assert.deepEqual([traits.traitOfDef(ops['char_4229_aphris#0']).rangeTiles, traits.traitOfDef(ops['char_1021_kroos2#0']).rangeTiles], [true, false]);
});
