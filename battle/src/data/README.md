# data（M1 数据访问层 + 管线产物）

- 代码：图鉴/招式/学习表/赛制查询 API（@pkmn/dex JSON 为底，formats.json 为赛制清单）。
- 产物：`battle/scripts/` 管线生成于本目录（**gitignore，不入库**），含 `data-version.json`
  （@pkmn/dex 版本 + showdown commit + 抓取日期，设置页可见）。
