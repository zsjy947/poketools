"""parsers/wikitext.py 单测：天气上标模板括注、折叠循环全量替换、既有清洗行为回归。"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from parsers import wikitext


class TestWeatherAnnotate:
    """U3：{{[sS]up/W|X}} 天气/星期上标 → 「（…、…）」括注。"""

    def test_single_weather(self):
        assert wikitext.clean_wt("[[拳关丘陵]]{{Sup/W|沙}}") == "拳关丘陵（沙暴）"

    def test_run_merges_with_dunhao(self):
        assert wikitext.clean_wt("[[巨人睡榻]]{{Sup/W|晴}}{{Sup/W|雨}}{{Sup/W|曝}}") == \
            "巨人睡榻（晴朗、雨天、烈日）"

    def test_more_than_four_templates_no_residue(self):
        # 原 bug：折叠循环只做 4 遍且每遍仅第一个 → 第 5 个起残渣留存
        s = wikitext.clean_wt("[[冰点雪原]]{{Sup/W|晴}}{{Sup/W|阴}}{{Sup/W|曝}}{{Sup/W|雪}}{{Sup/W|冰}}，[[巨人睡榻]]{{Sup/W|雨}}")
        assert "{{" not in s
        assert s == "冰点雪原（晴朗、阴天、烈日、下雪、暴风雪），巨人睡榻（雨天）"

    def test_lowercase_variant(self):
        assert wikitext.clean_wt("[[树荫丛林]]{{sup/W|雾}}") == "树荫丛林（大雾）"

    def test_mixed_case_in_one_run(self):
        assert wikitext.clean_wt("{{Sup/W|雨}}{{sup/W|雷}}") == "（雨天、雷雨）"

    def test_weekday_values(self):
        assert wikitext.clean_wt("[[自然公园]]{{sup/W|二}}{{sup/W|四}}{{sup/W|六}}") == \
            "自然公园（星期二、星期四、星期六）"
        assert wikitext.clean_wt("{{sup/W|一}}") == "（星期一）"

    def test_full_word_weather_passthrough(self):
        # 传说 阿尔宙斯全词天气直传
        assert wikitext.clean_wt("[[天冠山口]]{{Sup/W|暴风雪}}") == "天冠山口（暴风雪）"

    def test_unknown_value_kept_and_registered(self):
        wikitext.unknown_sup_weather.discard("未知天气X")
        out = wikitext.clean_wt("[[某地]]{{Sup/W|未知天气X}}")
        assert out == "某地（未知天气X）"
        assert "未知天气X" in wikitext.unknown_sup_weather
        wikitext.unknown_sup_weather.discard("未知天气X")

    def test_sup_w_not_stripped_by_generic_regex(self):
        # 剥模板正则放宽为 [sS]up/[a-zA-Z0-9]* 后仍不得吞掉 sup/W（天气先行转换）
        assert "{{" not in wikitext.clean_wt("[[逆鳞湖]]{{Sup/W|沙}}{{sup/8|SWSH}}")


class TestFoldLoop:
    """内层模板折叠循环改 re.sub 全量替换（原每遍仅折叠第一个模板）。"""

    def test_many_distinct_templates_all_folded(self):
        s = "{{a|1}}{{b|2}}{{c|3}}{{d|4}}{{e|5}}{{f|6}}"
        assert wikitext.clean_wt(s) == "123456"

    def test_nested_template_fully_folded(self):
        assert wikitext.clean_wt("{{外层|{{内层|甲}}|乙}}") == "乙"

    def test_empty_params_template_folds_empty(self):
        assert wikitext.clean_wt("前{{||}}后") == "前后"


class TestCleanRegression:
    """既有清洗行为回归（不因本次改动回退）。"""

    def test_link_with_pipe(self):
        assert wikitext.clean_wt("[[哈伊納沙漠|沙漠]]") == "沙漠"

    def test_rt_template(self):
        assert wikitext.clean_wt("{{rt|228|神奥}}") == "228号道路"

    def test_game_marker_sup_stripped(self):
        assert wikitext.clean_wt("进化<br>{{sup/8|BDSP}}") == "进化；"

    def test_ref_and_comment(self):
        assert wikitext.clean_wt("甲<!--注-->乙<ref>x</ref>") == "甲乙"

    def test_zh_converter(self):
        assert wikitext.clean_wt("-{zh-hans:晶灿钻石;zh-hant:晶燦鑽石;}-") == "晶灿钻石"
