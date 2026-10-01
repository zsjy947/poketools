/* 伤害计算引擎（本地实现）：app/services/damage.py 的逐行移植（路线 B / APK 基座）。
 *
 * 取整语义铁律（与 Python 版/calib 基准一致，勿改顺序）：
 * 能力值 floor → bpMods 4096 分数链 → Z/极巨以原始威力换算 → 基础伤害每步 floor →
 * 扩散/天气 pokeRound 作用基础伤害 → 会心 ×1.5 floor → 随机最先 floor →
 * STAB/finalMod 4096 分数链（rnd_half_down 半舍去）→ min 1。
 * 对拍门禁：tools/static-check/calib-js.mjs（tools/calib/smogon_baseline.json 51+41 基准）。
 */
(function (g) {
  "use strict";
  const PKT = (g.__PKT_LOCAL__ = g.__PKT_LOCAL__ || {});

  const TYPES = ["一般", "火", "水", "电", "草", "冰", "格斗", "毒", "地面", "飞行",
    "超能力", "虫", "岩石", "幽灵", "龙", "恶", "钢", "妖精"];

  const CHART = {};
  for (const t of TYPES) CHART[t] = {};
  function _set(atk, pairs) { Object.assign(CHART[atk], pairs); }

  _set("一般", { "岩石": 0.5, "钢": 0.5, "幽灵": 0 });
  _set("火", { "火": 0.5, "水": 0.5, "草": 2, "冰": 2, "虫": 2, "岩石": 0.5, "龙": 0.5, "钢": 2, "妖精": 0.5 });
  _set("水", { "火": 2, "水": 0.5, "草": 0.5, "地面": 2, "岩石": 2, "龙": 0.5 });
  _set("电", { "水": 2, "电": 0.5, "草": 0.5, "地面": 0, "飞行": 2, "龙": 0.5 });
  _set("草", { "火": 0.5, "水": 2, "草": 0.5, "毒": 0.5, "地面": 2, "飞行": 0.5, "虫": 0.5, "岩石": 2, "龙": 0.5, "钢": 0.5 });
  _set("冰", { "火": 0.5, "水": 0.5, "冰": 0.5, "地面": 2, "飞行": 2, "草": 2, "龙": 2, "钢": 0.5, "妖精": 0.5 });
  _set("格斗", { "一般": 2, "冰": 2, "毒": 0.5, "飞行": 0.5, "超能力": 0.5, "虫": 0.5, "岩石": 2, "幽灵": 0, "龙": 0.5, "恶": 2, "钢": 2, "妖精": 0.5 });
  _set("毒", { "草": 2, "毒": 0.5, "地面": 0.5, "岩石": 0.5, "幽灵": 0.5, "钢": 0, "妖精": 2 });
  _set("地面", { "火": 2, "电": 2, "草": 0.5, "毒": 2, "飞行": 0, "虫": 0.5, "岩石": 2, "钢": 2 });
  _set("飞行", { "电": 0.5, "草": 2, "格斗": 2, "虫": 2, "岩石": 0.5, "钢": 0.5 });
  _set("超能力", { "格斗": 2, "毒": 2, "超能力": 0.5, "幽灵": 0, "恶": 0, "钢": 0.5 });
  _set("虫", { "火": 0.5, "草": 2, "格斗": 0.5, "毒": 0.5, "飞行": 0.5, "超能力": 2, "幽灵": 0.5, "恶": 2, "钢": 0.5, "妖精": 0.5 });
  _set("岩石", { "火": 2, "冰": 2, "格斗": 0.5, "地面": 0.5, "飞行": 2, "虫": 2, "钢": 0.5 });
  _set("幽灵", { "一般": 0, "超能力": 2, "幽灵": 2, "恶": 0.5 });
  _set("龙", { "龙": 2, "钢": 0.5, "妖精": 0 });
  _set("恶", { "格斗": 0.5, "超能力": 2, "幽灵": 2, "恶": 0.5, "妖精": 0.5 });
  _set("钢", { "火": 0.5, "水": 0.5, "电": 0.5, "冰": 2, "岩石": 2, "钢": 0.5, "妖精": 2 });
  _set("妖精", { "火": 0.5, "格斗": 2, "毒": 0.5, "龙": 2, "恶": 2, "钢": 0.5 });

  const SPECIAL_MOVES = { "freeze-dry": { "水": 2 }, "flying-press": "__both__" };
  const DYNAMAX_SUPER = new Set(["巨兽斩击", "巨兽弹击", "极巨炮"]);
  const IMMUNE_ABILITIES = {
    "引火": ["火"], "避雷针": ["电"], "蓄电": ["电"], "马达驱动": ["电"],
    "储水": ["水"], "引水": ["水"], "干燥皮肤": ["水"], "食草": ["草"],
  };

  const Z_SPECIAL = {
    "weather-ball": 160, "hex": 160, "v-create": 220,
    "flying-press": 170, "thousand-arrows": 180, "core-enforcer": 140,
    "multi-attack": 185, "struggle": 1,
  };
  const MULTIHIT = {
    "comet-punch": [2, 5], "double-slap": [2, 5], "fury-attack": [2, 5],
    "fury-swipes": [2, 5], "pin-missile": [2, 5], "icicle-spear": [2, 5],
    "rock-blast": [2, 5], "tail-slap": [2, 5], "bullet-seed": [2, 5],
    "spike-cannon": [2, 5], "barrage": [2, 5], "water-shuriken": [2, 5],
    "arm-thrust": [2, 5],
    "double-kick": [2, 2], "bonemerang": [2, 2], "twin-beam": [2, 2],
    "dragon-darts": [2, 2], "double-iron-bash": [2, 2], "gear-grind": [2, 2],
    "double-hit": [2, 2], "dual-chop": [2, 2], "double-shock": [2, 2],
    "twin-wingbeat": [2, 2], "twineedle": [2, 2],
    "triple-dive": [1, 3], "surging-strikes": [3, 3],
    "triple-kick": [1, 3], "triple-axel": [3, 3], "bone-rush": [2, 5],
  };
  const MAX_SPECIAL = { "water-shuriken": 90, "triple-axel": 140, "weather-ball": 130 };

  function _multihitPower(base, ident, forMax) {
    const mh = MULTIHIT[ident];
    if (!mh) return base;
    const hi = mh[1];
    let n;
    if (hi === 5 || hi === 3) n = 3;
    else if (hi === 2) n = 2;
    else return base;
    if (!forMax && n === 2) return base;
    if (ident === "triple-axel" && forMax) return 120;
    if (ident === "water-shuriken" && forMax) return 40;
    return base * n;
  }

  function zPower(base, ident) {
    if (Z_SPECIAL[ident] !== undefined) return Z_SPECIAL[ident];
    base = _multihitPower(base, ident, false);
    if (base < 60) return 100;
    if (base < 70) return 120;
    if (base < 80) return 140;
    if (base < 90) return 160;
    if (base < 100) return 175;
    if (base < 110) return 180;
    if (base < 120) return 185;
    if (base < 130) return 190;
    if (base < 140) return 195;
    return 200;
  }

  function maxPower(base, moveType, ident) {
    if (MAX_SPECIAL[ident] !== undefined) return MAX_SPECIAL[ident];
    base = _multihitPower(base, ident, true);
    const fp = moveType === "格斗" || moveType === "毒";
    if (base <= 40) return fp ? 70 : 90;
    if (base < 55) return fp ? 75 : 100;
    if (base <= 60) return fp ? 80 : 110;
    if (base <= 70) return fp ? 85 : 120;
    if (base <= 100) return fp ? 90 : 130;
    if (base <= 140) return fp ? 95 : 140;
    return fp ? 100 : 150;
  }

  function rndHalfDown(x) {
    const f = Math.floor(x);
    return (x - f) > 0.5 ? f + 1 : f;
  }
  function pokeRoundRatio(num, den) {
    den = den === undefined ? 4096 : den;
    return Math.floor((num + den / 2) / den);
  }
  function chainMods(mods, lower, upper) {
    lower = lower === undefined ? 1 : lower;
    upper = upper === undefined ? 131072 : upper;
    let m = 4096;
    for (const mod of mods) {
      if (mod !== 4096) m = ((m * mod + 2048) >> 12);
    }
    return Math.max(Math.min(m, upper), lower);
  }

  function statHp(base, iv, ev, level) {
    if (base === 1) return 1;
    return Math.floor((2 * base + iv + Math.floor(ev / 4)) * level / 100) + level + 10;
  }
  function statOther(base, iv, ev, level, nature) {
    const v = Math.floor((2 * base + iv + Math.floor(ev / 4)) * level / 100) + 5;
    return Math.floor(v * (nature === undefined ? 1.0 : nature));
  }
  function stageMult(k) {
    return k >= 0 ? [2 + k, 2] : [2, 2 - k];
  }
  const NATURE_MULT = { up: 1.1, down: 0.9, neutral: 1.0 };
  const CHOICE = { "讲究头带": ["atk", 1.5], "讲究眼镜": ["spa", 1.5], "讲究围巾": ["spe", 1.5] };
  const EFFECTIVENESS_LABEL = { 0: "无效", 0.25: "效果极差", 0.5: "效果不好", 1: "效果正常",
    2: "效果绝佳", 4: "效果绝佳×2" };

  function effectiveness(moveType, defTypes, moveIdent, levitate, foresight, gravity) {
    if (SPECIAL_MOVES[moveIdent] === "__both__") {
      let eff = 1.0;
      for (const t of defTypes) {
        eff *= (CHART["格斗"][t] === undefined ? 1 : CHART["格斗"][t])
          * (CHART["飞行"][t] === undefined ? 1 : CHART["飞行"][t]);
      }
      return eff;
    }
    if (levitate && moveType === "地面") return 0.0;
    let eff = 1.0;
    const overrides = SPECIAL_MOVES[moveIdent];
    for (const t of defTypes) {
      if (foresight && (moveType === "一般" || moveType === "格斗") && t === "幽灵") continue;
      if (gravity && moveType === "地面" && t === "飞行") continue;
      if (overrides && overrides[t] !== undefined) eff *= overrides[t];
      else eff *= (CHART[moveType] && CHART[moveType][t] !== undefined ? CHART[moveType][t] : 1);
    }
    return eff;
  }

  function calcModernStats(form, level, nature, evs, ivs, choiceItem, dynamax) {
    nature = nature || null;
    const up = nature ? nature.up : undefined;
    const down = nature ? nature.down : undefined;
    function nm(k) {
      if (up === k && down !== k) return 1.1;
      if (down === k && up !== k) return 0.9;
      return 1.0;
    }
    function ig(o, k, dflt) { return (o && o[k] !== undefined) ? o[k] : dflt; }
    let hp = statHp(form.hp, ig(ivs, "hp", 31), ig(evs, "hp", 0), level);
    if (dynamax) hp *= 2;
    const out = { hp };
    for (const k of ["atk", "def", "spa", "spd", "spe"]) {
      let v = statOther(form[k], ig(ivs, k, 31), ig(evs, k, 0), level, nm(k));
      const ch = CHOICE[choiceItem || ""];
      if (ch && ch[0] === k) v = Math.floor(v * ch[1]);
      out[k] = v;
    }
    return out;
  }

  function _grounded(p, opt) {
    if (opt.gravity) return true;
    const types = (p.types || "").split(",").filter(Boolean);
    return !(types.includes("飞行") || p.ability === "漂浮" || p.item === "气球");
  }

  function _modifiedStat(stat, boost) {
    const [n, d] = stageMult(boost);
    return Math.floor(stat * n / d);
  }

  function calcDamageModern(a, d, move, opt) {
    const physical = move.damage_class === "physical";
    let power = (opt.move_power_override || move.power || 0);
    if (!power || move.damage_class === "status") return { error: "status_or_no_power" };

    const atkTypes = (a.types || "").split(",").filter(Boolean);
    const teraA = a.tera_type || "";
    const defTypes = (d.types || "").split(",").filter(Boolean);
    const teraD = d.tera_type || "";
    const aAbil = a.ability || "";
    const dAbil = d.ability || "";
    const aItem = opt.magic_room ? "" : (a.item || "");
    const dItem = opt.magic_room ? "" : (d.item || "");
    const doubles = (opt.mode || "singles") !== "singles";

    let moveType = move.type_zh;
    const moveIdent = move.identifier || "";
    const stellarMove = moveIdent === "tera-starstorm" && Boolean(teraA);

    // Z / 极巨换算（原始威力为输入）
    const zEx = opt.z_exclusive || {};
    if (zEx && Object.keys(zEx).length) {
      power = zEx.power || power;
      moveType = move.type_zh;
    } else if (opt.z_move) {
      power = zPower(move.power || power, moveIdent);
    } else if (opt.max_move) {
      const gmax = opt.gmax_move;
      power = (gmax && gmax.power) ? gmax.power
        : maxPower(move.power || power, move.type_zh, moveIdent);
    }
    if (moveIdent === "pursuit" && opt.is_switching_out
      && !(opt.z_move || (zEx && Object.keys(zEx).length) || opt.max_move)) {
      power = power * 2;
    }

    // 威力阶段修正（bpMods 4096 分数链）
    const bpMods = [];
    if (opt.helping_hand) bpMods.push(6144);
    const atkGrounded = _grounded(a, opt);
    if (atkGrounded) {
      const terrain = opt.terrain || "";
      if ((terrain === "electric" && moveType === "电")
        || (terrain === "psychic" && moveType === "超能力")
        || (terrain === "grassy" && moveType === "草")) bpMods.push(5325);
    }
    if (_grounded(d, opt)) {
      const terrain = opt.terrain || "";
      if ((terrain === "misty" && moveType === "龙")
        || (terrain === "grassy" && (moveIdent === "earthquake" || moveIdent === "bulldoze"))) {
        bpMods.push(2048);
      }
    }
    const auras = opt.auras || {};
    const auraActive = ((auras.fairy && moveType === "妖精")
      || (auras.dark && moveType === "恶")
      || (aAbil === "妖精气场" && moveType === "妖精")
      || (dAbil === "妖精气场" && moveType === "妖精")
      || (aAbil === "暗黑气场" && moveType === "恶")
      || (dAbil === "暗黑气场" && moveType === "恶"));
    if (auraActive) {
      bpMods.push((auras.break || aAbil === "气场破坏" || dAbil === "气场破坏") ? 3072 : 5448);
    }
    if (opt.battery && !physical) bpMods.push(5325);
    if (opt.power_spot) bpMods.push(5325);
    power = Math.floor(power * chainMods(bpMods) / 4096);
    if (power <= 0) return { error: "status_or_no_power" };

    // 属性相性（防守方太晶后属性替换；星晶保持原属性）
    const effTypes = (teraD === "" || teraD === "星晶") ? defTypes : [teraD];
    let eff = effectiveness(moveType, effTypes, moveIdent,
      dAbil === "漂浮" && !opt.gravity, Boolean(opt.foresight), Boolean(opt.gravity));
    if (stellarMove) eff = teraD ? 2.0 : 1.0;
    if (eff === 0) {
      return { min: 0, max: 0, effectiveness: 0, label: EFFECTIVENESS_LABEL[0],
        hp: d.stats.hp, pct_min: 0, pct_max: 0, ohko: false,
        rolls: [0], ko: koSummary([0], d.stats.hp, opt) };
    }

    // 攻防能力值
    let weather = opt.weather || "";
    if (weather === "harsh_sun") weather = "sun";
    else if (weather === "harsh_rain") weather = "rain";
    const atkSt = Object.assign({}, a.stats);
    const defSt = Object.assign({}, d.stats);
    if (opt.wonder_room) {
      [atkSt.def, atkSt.spd] = [atkSt.spd, atkSt.def];
      [defSt.def, defSt.spd] = [defSt.spd, defSt.def];
    }
    const crit = Boolean(opt.crit);
    const [atkKey, defKey] = physical ? ["atk", "def"] : ["spa", "spd"];
    const boostA = ((a.boosts || {})[atkKey]) || 0;
    const boostD = ((d.boosts || {})[defKey]) || 0;
    let atkV = (crit && boostA < 0) ? atkSt[atkKey] : _modifiedStat(atkSt[atkKey], boostA);
    let defV = (crit && boostD > 0) ? defSt[defKey] : _modifiedStat(defSt[defKey], boostD);

    const atMods = [];
    if (aAbil === "毅力" && (opt.burn || opt.status)) atkV = rndHalfDown(atkV * 1.5);
    const ruin = opt.ruin || {};
    if (ruin.tablets || aAbil === "灾祸之简") atMods.push(3072);
    if ((ruin.vessel || aAbil === "灾祸之鼎") && !physical) atMods.push(3072);
    if ((opt.flower_gift || aAbil === "花之礼") && weather === "sun" && physical) atMods.push(6144);
    if (opt.steely_spirit && moveType === "钢") atMods.push(6144);
    atkV = Math.max(1, pokeRoundRatio(atkV * chainMods(atMods)));

    const dfMods = [];
    if (weather === "snow" && defTypes.includes("冰") && physical) defV = rndHalfDown(defV * 1.5);
    if (weather === "sand" && defTypes.includes("岩石") && !physical) defV = rndHalfDown(defV * 1.5);
    if ((ruin.sword || aAbil === "灾祸之剑") && physical) dfMods.push(3072);
    if ((ruin.beads || aAbil === "灾祸之玉") && !physical) dfMods.push(3072);
    if ((opt.flower_gift_d || dAbil === "花之礼") && weather === "sun" && !physical) dfMods.push(6144);
    if ((dItem === "突击背心" && !physical) || (dItem === "进化奇石" && d.can_evolve)) dfMods.push(6144);
    defV = Math.max(1, pokeRoundRatio(defV * chainMods(dfMods)));

    // 基础伤害
    let base = Math.floor(Math.floor(Math.floor(
      Math.floor(2 * a.level / 5 + 2) * power) * atkV / defV) / 50 + 2);
    if (doubles && move.is_spread) base = rndHalfDown(base * 3072 / 4096);
    if ((weather === "sun" && moveType === "火") || (weather === "rain" && moveType === "水")) {
      base = rndHalfDown(base * 6144 / 4096);
    } else if ((weather === "sun" && moveType === "水") || (weather === "rain" && moveType === "火")) {
      base = rndHalfDown(base * 2048 / 4096);
    }
    if (crit) base = Math.floor(base * 1.5);

    // STAB
    let stabMod = 4096;
    if (atkTypes.includes(moveType)) stabMod += 2048;
    if (teraA && teraA === moveType && teraA !== "星晶") stabMod += 2048;
    const hasType = ((teraA && teraA !== "星晶" && teraA === moveType)
      || atkTypes.includes(moveType));
    if (aAbil === "适应力" && hasType) {
      stabMod += (teraA && atkTypes.includes(teraA)) ? 1024 : 2048;
    }
    if (teraA === "星晶") {
      if (atkTypes.includes(moveType)) stabMod += 2048;
      else stabMod = 4915;
    }
    const applyBurn = opt.burn && physical && aAbil !== "毅力" && move.name_zh !== "装模作样";

    // finalMod 4096 链
    const mods = [];
    const screen = opt.screen || "";
    const screenOn = screen === (physical ? "reflect" : "light_screen") || screen === "aurora";
    if (screenOn && !crit) mods.push(doubles ? 2732 : 2048);
    if (aAbil === "超感知" && eff > 1) mods.push(5120);
    else if (aAbil === "狙击手" && crit) mods.push(6144);
    else if (aAbil === "有色眼镜" && eff < 1) mods.push(8192);
    if (d.is_dynamax && DYNAMAX_SUPER.has(move.name_zh)) mods.push(8192);
    // 满血判定：键缺失 = 默认满血；显式 null/False = 已被削血（镜像 Python opt.get(key, True)）
    const dfhFull = opt.defender_full_hp === undefined ? true : Boolean(opt.defender_full_hp);
    if ((dAbil === "多重鳞片" || dAbil === "影甲") && dfhFull) mods.push(2048);
    if (dAbil === "冰鳞粉" && !physical) mods.push(2048);
    if ((dAbil === "滤芯" || dAbil === "Prism装甲") && eff > 1) mods.push(3072);
    if (opt.friend_guard) mods.push(3072);
    if (aItem === "达人带" && eff > 1 && !(opt.z_move || (zEx && Object.keys(zEx).length))) mods.push(4915);
    else if (aItem === "生命宝珠") mods.push(5324);
    const finalMod = chainMods(mods);

    const rolls = [];
    for (let i = 0; i < 16; i++) {
      let dmg = Math.floor(base * (85 + i) / 100);
      if (stabMod !== 4096) dmg = dmg * stabMod / 4096;
      dmg = Math.floor(rndHalfDown(dmg) * eff);
      if (applyBurn) dmg = Math.floor(dmg / 2);
      rolls.push(Math.max(1, rndHalfDown(dmg * finalMod / 4096)));
    }

    const hp = defSt.hp;
    const pct = [Math.floor(Math.min(...rolls) * 1000 / hp) / 10,
      Math.floor(Math.max(...rolls) * 1000 / hp) / 10];
    const result = {
      base: base, rolls: rolls, min: Math.min(...rolls), max: Math.max(...rolls),
      effectiveness: eff, label: EFFECTIVENESS_LABEL[eff] !== undefined
        ? EFFECTIVENESS_LABEL[eff] : ("×" + eff),
      hp: hp, pct_min: pct[0], pct_max: pct[1],
      ohko: Math.min(...rolls) >= hp,
      ko: koSummary(rolls, hp, opt),
    };
    if (zEx.name) result.z_move_name = zEx.name;
    return result;
  }

  function hazardDamage(defTypes, hp, hazards, grounded) {
    let total = 0;
    if (hazards.rocks) {
      let mult = 1.0;
      for (const t of defTypes) {
        mult *= (CHART["岩石"][t] === undefined ? 1 : CHART["岩石"][t]);
      }
      total += Math.floor(hp * 0.125 * mult);
    }
    const spikes = hazards.spikes || 0;
    if (spikes && grounded) {
      const frac = { 1: 1 / 8, 2: 1 / 6, 3: 1 / 4 }[Math.min(3, spikes)];
      total += Math.floor(hp * frac);
    }
    if (hazards.salt_cure) {
      const frac = (defTypes.some((t) => t === "水" || t === "钢")) ? 1 / 4 : 1 / 8;
      total += Math.floor(hp * frac);
    }
    if (hazards.leech_seed) total += Math.floor(hp / 8);
    return Math.min(hp > 1 ? hp - 1 : 0, total);
  }

  function koSummary(rolls, hp, opt) {
    const sash = opt.defender_sash;
    let dist = new Map([[0, 1.0]]);
    const probs = {};
    for (let n = 1; n <= 4; n++) {
      const nxt = new Map();
      for (const [s, p] of dist) {
        for (const r of rolls) {
          nxt.set(s + r, (nxt.get(s + r) || 0) + p / 16);
        }
      }
      dist = nxt;
      let acc = 0;
      for (const [s, p] of dist) if (s >= hp) acc += p;
      probs[String(n)] = Math.round(acc * 100 * 100) / 100;
    }
    if (sash) {
      probs["1"] = 0.0;
      for (let n = 2; n <= 4; n++) {
        probs[String(n)] = rolls.some((r) => r > 0) ? 100.0 : probs[String(n)];
      }
    }
    let guaranteed = null;
    for (const n of [1, 2, 3, 4]) {
      if (probs[String(n)] >= 100.0) { guaranteed = n; break; }
    }
    if (guaranteed === null && probs["4"] > 0) guaranteed = -1;
    return { guaranteed_turns: guaranteed, probs: probs };
  }

  function calcDamage(a, d, move, opt) {
    const dAbil = d.ability || "";
    const mt = move.type_zh || "";
    const immune = IMMUNE_ABILITIES[dAbil] || [];
    if (immune.includes(mt)) {
      const eff0 = { min: 0, max: 0, effectiveness: 0, label: EFFECTIVENESS_LABEL[0],
        hp: d.stats.hp, pct_min: 0, pct_max: 0, ohko: false,
        rolls: [0], ko: koSummary([0], d.stats.hp, opt) };
      eff0.immune_by = dAbil;
      return eff0;
    }
    return calcDamageModern(a, d, move, opt);
  }

  PKT.damage = {
    TYPES, CHART, calcDamage, calcDamageModern, calcModernStats, hazardDamage,
    koSummary, zPower, maxPower, rndHalfDown, pokeRoundRatio, chainMods,
    effectiveness, statHp, statOther, stageMult, NATURE_MULT, CHOICE,
  };
})(typeof window !== "undefined" ? window : globalThis);
