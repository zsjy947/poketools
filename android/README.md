# poketools 安卓端（APK 壳）

零 Gradle 的 WebView 壳工程，构建流水线由共享工具链
`<工作区>/archived/android-pack`（apx）提供：`aapt2 → javac → d8 → 合 dex →
zipalign → apksigner`。

## 构建

```bash
python android/build_apk.py --selfcheck      # 工具链自检（首次先做）
python android/build_apk.py --init-keystore  # 首次：生成发布签名密钥（口令文件永不入库）
python android/build_apk.py                  # 构建（自动跑资产钩子：pnpm build → www/）
# 产物：android/output/poketools_v{version}.apk（apksigner verify 收尾）
```

## 结构

- `pack.toml`：apx 配置。版本单一来源 = `web/package.json`（经
  `scripts/appversion.py`）；`version_marker` 守卫资产与代码版本同源；
  图标从 `web/src-tauri/icon-source-1024.png` 生成五档 mipmap。
- `prepare_assets.py`：资产钩子。`pnpm build` → 拷贝 `web/dist` 到
  `app/src/main/assets/www/`，**排除** `sprites/{ani,ani-back,ani-shiny}`
  （对战动画 GIF ~445MB 不进包；battle/sprites.ts 候选链自动回退
  `sprites/dex` 静态像）；写 `meta.js` 版本标记。
- `app/src/main/java/com/poketools/app/MainActivity.java`：全屏 WebView，
  虚拟 https 域 `appassets.poketools` 经 `shouldInterceptRequest` 从
  `assets/www/` 服务（fetch / localStorage / ES module 全兼容，不用 file://）；
  竖屏锁定；返回键 = 前端弹层 → hash 历史 → 退出。
- Manifest 零权限（运行时完全离线）。

## 与桌面端的关系

同一份前端产物（`web/dist`）：桌面 = Tauri 2 custom-protocol 壳；安卓 =
本 WebView 壳。领域逻辑唯一实现仍在 `web/src/data`（TS），无分支构建。

## 已知取舍

- 对战动画精灵（445MB）不进 APK：舞台自动回退 dex 静态像（桌面不受影响）。
- APK 体积门禁沿用旧线的 ≤120MB 精神，但现静态数据（data 分片 61MB +
  官方绘图 80MB + 道具/机制图 38MB）显著富于旧线，实测体积见构建输出；
  如需压缩优先裁 `assets/`（道具图全集）而非 `pkt/`（图鉴绘图）。
