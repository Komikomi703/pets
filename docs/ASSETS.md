# 素材とライセンス

| 素材 | 出典 | ライセンス |
|---|---|---|
| ミルククリーム色とキャラメル色の子猫・全アニメーション | このプロジェクト専用に作成した `src/render/cat.ts` のCanvasパーツ | リポジトリのMIT |
| アプリアイコン・トレイアイコン | 独自 `public/icon.svg` を Tauri CLI 2.12.1 の icon コマンドで変換 | リポジトリのMIT |
| UIの小さな線画アイコン | `src/ui/settings.ts` 内の独自SVG | リポジトリのMIT |
| 猫の反応音 | `src/ui/sound.ts` でWeb Audio合成、初期値オフ | リポジトリのMIT |
| ググガガ | 指定画像を参照した生成パーツ `public/characters/gugugaga/parts-v3.png` とCanvasによる表情・動作 | 二次創作。元作品に関する権利・再配布条件は未確認。MITの独自猫素材とは区別 |
| フォント | OSにある Yu Gothic UI / Meiryo / system-ui を参照。フォントファイルは同梱しない | 各OSのライセンス |

猫・アイコンは独自素材です。ググガガは参考画像の特徴を採用したファンデザインで、生成したパーツを使います。参照画像は `artifacts/reference/` の調査資料であり、アプリへ同梱しません。参照URL・利用条件・未確認事項は [gugugaga-reference.md](gugugaga-reference.md)、現在の生成プロンプトは [gugugaga-v3-prompt.txt](gugugaga-v3-prompt.txt)（旧版は [gugugaga-image-prompt.txt](gugugaga-image-prompt.txt)） に記録しています。Webで見つけた画像・動画・音声を再配布可能とは判断していません。ググガガの声は未同梱で、吹き出しで応答します。

猫は丸いほっぺ、小さな耳、短い手足、光の入った瞳を持つデザインです。喜ぶと目が弓形になり、眠ると目を閉じます。15種類の状態すべてに共通のパーツを使い、クリック判定も描画したシルエットから生成します。

ソースコードは `LICENSE` のMITライセンスです。使用ライブラリはTauri/各プラグイン、Serde、Vite、TypeScript等。それぞれのライセンスを維持します。`pnpm-lock.yaml` と `src-tauri/Cargo.lock` が実際の依存バージョンを固定します。

## API確認に使った一次資料

- [Tauri 2 Window設定](https://v2.tauri.app/reference/config/#windowconfig)
- [Tauri 2 Rust Window API](https://docs.rs/tauri/2.12.1/tauri/window/struct.Window.html)
- [Monitorとwork_area](https://docs.rs/tauri/2.12.1/tauri/window/struct.Monitor.html)
- [システムトレイ](https://v2.tauri.app/learn/system-tray/)
- [Single Instanceプラグイン](https://v2.tauri.app/plugin/single-instance/)
- [Autostartプラグイン](https://v2.tauri.app/plugin/autostart/)
- [Windowsインストーラー](https://v2.tauri.app/distribute/windows-installer/)

Tauri 1の`appWindow`/`allowlist`は使用していません。採用版のRustソースとTypeScript型定義でもAPIを照合しています。

最新の比率・曲線・接地の再調整は [CHARACTER_REDESIGN.md](CHARACTER_REDESIGN.md)、新しい素材の生成指示は [gugugaga-v3-prompt.txt](gugugaga-v3-prompt.txt) に記録。旧atlasは比較用に保持しています。

## v1.2.0の追加素材

`public/characters/gugugaga/heads-v4.png` は内蔵 `image_gen` で既存の `parts-v3.png` を参照して生成した、正面・左右斜めの頭部です。透過PNGをそのまま保持し、表情・揺れはCanvasで描画します。二次創作素材として、上記ググガガと同じ権利上の扱いです。生成指示は [gugugaga-v4-prompt.txt](gugugaga-v4-prompt.txt)、描画と検証は [QUALITY_UPDATE.md](QUALITY_UPDATE.md) を参照。
