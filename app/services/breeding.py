"""蛋招式生蛋链计算：在「能学会该招式的物种」图上做多源 BFS，输出全部最短繁殖链。

规则（第六世代起机制）：
- 节点：当前游戏中能以任意方式（升级/招式学习器/教授/蛋招式）学会该招式的物种；
  其中升级/学习器/教授的物种视为「自学源」。
- 边：两物种可交配（蛋组相交；一方为百变怪蛋组亦可；「未发现」蛋组不可交配）。
- 链：源物种学会招式 → 逐环传递 → 最终一环与目标宝可梦同蛋组（可与目标交配）。
- 目标 = 最短；展示全部最短路径。
"""
from __future__ import annotations

GAME_LEARNSET_VG = {
    "sword-shield": 20,
    "brilliant-diamond-shining-pearl": 23,
    "legends-arceus": 24,
    "scarlet-violet": 25,
    "legends-za": 30,
}

METHOD_TEXT = {"level-up": "升级学会", "machine": "招式学习器", "tutor": "教授招式", "egg": "蛋招式"}
MAX_PATHS = 100


def _compatible(g1: set[str], g2: set[str]) -> bool:
    if not g1 or not g2 or "未发现" in g1 or "未发现" in g2:
        return False
    if "百变怪" in g1 or "百变怪" in g2:
        return True
    return bool(g1 & g2)


def breed_chains(con, species_id: int, move_id: int, game: str) -> dict:
    vg = GAME_LEARNSET_VG[game]
    sp = con.execute(
        "SELECT id, name_zh, egg_groups, gender_rate FROM species WHERE id=?",
        (species_id,)).fetchone()
    if sp is None:
        return {"ok": False, "reason": "未找到目标宝可梦"}
    mv = con.execute("SELECT id, name_zh FROM moves WHERE id=?", (move_id,)).fetchone()
    if mv is None:
        return {"ok": False, "reason": "未找到招式"}
    target_groups = {g for g in (sp["egg_groups"] or "").split(",") if g}
    if not target_groups or target_groups == {"未发现"}:
        return {"ok": False, "reason": "该宝可梦属于「未发现」蛋组，无法通过生蛋遗传招式"}

    # 当前游戏能学该招式的物种及其方式
    learners: dict[int, dict] = {}
    q = con.execute(
        """SELECT s.id AS sid, s.name_zh, s.egg_groups, s.gender_rate,
                  l.method, l.level
           FROM learnsets l
           JOIN forms f ON f.id = l.form_id
           JOIN species s ON s.id = f.species_id
           WHERE l.move_id=? AND l.vg=?""", (move_id, vg))
    for r in q:
        sid = r["sid"]
        info = learners.setdefault(sid, {
            "species_id": sid, "name": r["name_zh"],
            "groups": {g for g in (r["egg_groups"] or "").split(",") if g},
            "gender_rate": r["gender_rate"],
            "direct": None,  # (text) 首个非蛋方式
            "egg": False,
        })
        if r["method"] == "egg":
            info["egg"] = True
        elif info["direct"] is None:
            if r["method"] == "level-up":
                info["direct"] = f"升级Lv.{r['level']}学会"
            else:
                info["direct"] = METHOD_TEXT.get(r["method"], r["method"])

    # 不能交配的物种（无性别且非百变怪）不能传递蛋招式
    def breedable(info: dict) -> bool:
        return bool(info["groups"]) and (
            "百变怪" in info["groups"] or info["gender_rate"] not in (-1,) and info["gender_rate"] is not None or "百变怪" in info["groups"])

    nodes = {sid: i for sid, i in learners.items() if sid != species_id and breedable(i)}
    sources = {sid: i for sid, i in nodes.items() if i["direct"]}
    if not sources:
        return {"ok": False, "reason": "当前游戏中没有可直接自学该招式的宝可梦，无法计算生蛋链"}

    # 目标节点：与目标宝可梦可交配的节点
    targets = {sid for sid, i in nodes.items() if _compatible(i["groups"], target_groups)}
    if not targets:
        return {"ok": False, "reason": "没有可交配的宝可梦能学会该招式"}

    # 邻接（按蛋组索引懒建边）
    group_index: dict[str, list[int]] = {}
    for sid, i in nodes.items():
        for g in i["groups"]:
            group_index.setdefault(g, []).append(sid)

    def neighbors(sid: int) -> list[int]:
        out = set()
        for g in nodes[sid]["groups"]:
            out.update(group_index.get(g, ()))
        if "百变怪" in nodes[sid]["groups"]:
            out.update(nodes.keys())
        for other, i in nodes.items():
            if "百变怪" in i["groups"]:
                out.add(other)
        out.discard(sid)
        return sorted(out)

    # 多源 BFS（源距离 0），记录全部最短前驱
    dist = {sid: 0 for sid in sources}
    parents: dict[int, list[int]] = {}
    frontier = list(sources)
    best = None
    while frontier:
        nxt = []
        for sid in frontier:
            if best is not None and dist[sid] >= best:
                continue
            for nb in neighbors(sid):
                if nb in dist and dist[nb] <= dist[sid] + 1:
                    if nb in dist and dist[nb] == dist[sid] + 1 and sid not in parents.get(nb, []):
                        parents.setdefault(nb, []).append(sid)
                    continue
                dist[nb] = dist[sid] + 1
                parents[nb] = [sid]
                if nb in targets:
                    best = dist[nb]
                nxt.append(nb)
        frontier = nxt

    achieved = [t for t in targets if t in dist]
    if not achieved:
        return {"ok": False, "reason": "能学会该招式的宝可梦与目标没有可交配的途径"}
    min_d = min(dist[t] for t in achieved)
    end_nodes = [t for t in achieved if dist[t] == min_d]

    # 回溯全部最短路径
    paths: list[list[int]] = []

    def backtrack(node: int, acc: list[int]) -> None:
        if len(paths) >= MAX_PATHS:
            return
        if dist[node] == 0:
            paths.append([node] + acc)
            return
        for p in parents.get(node, []):
            backtrack(p, [node] + acc)

    for t in end_nodes:
        backtrack(t, [])

    def node_payload(sid: int) -> dict:
        i = learners[sid]
        return {
            "species_id": sid, "name": i["name"],
            "groups": sorted(i["groups"]),
            "learn": i["direct"] or "蛋招式（需由上一环遗传）",
        }

    def shared(a: int, b: int) -> list[str]:
        ga, gb = learners[a]["groups"], learners[b]["groups"]
        if "百变怪" in ga or "百变怪" in gb:
            shared_g = sorted((ga & gb) or {"百变怪"})
        else:
            shared_g = sorted(ga & gb)
        return shared_g

    chains = []
    for p in paths:
        # 统一把「末环 → 目标」作为最后一步，保证 steps 覆盖全部繁殖步骤
        seq = p + [species_id]
        steps = []
        for a, b in zip(seq, seq[1:]):
            steps.append({
                "from": node_payload(a),
                "to": node_payload(b) if b != species_id else {
                    "species_id": species_id, "name": sp["name_zh"],
                    "groups": sorted(target_groups), "learn": "目标宝可梦",
                },
                "shared_groups": shared(a, b),
            })
        chains.append({"steps": steps, "length": len(p)})

    return {
        "ok": True,
        "move": {"id": mv["id"], "name": mv["name_zh"]},
        "target": {"species_id": species_id, "name": sp["name_zh"],
                   "groups": sorted(target_groups)},
        "min_length": min_d + 1,  # 繁殖次数 = 链上物种数
        "chain_count": len(chains),
        "truncated": len(chains) >= MAX_PATHS,
        "chains": chains,
        "note": "按第六世代起机制计算（双亲均可遗传蛋招式）；实际操作还需注意性别比与百变怪搭配。",
    }
