# 検証記録（2026-10-07）

最新のキャラクター再調整後の検証・実機結果・更新exeハッシュは [CHARACTER_REDESIGN.md](CHARACTER_REDESIGN.md) を参照。以下は再調整前の記録。

WSL2でフロントエンド・Windows x64向けRustをビルドし、同じPCのWindows実機でWebView2・Win32の操作を検証した。Windows NT 10.0.26200、画面1920×1080、作業領域1920×1020、倍率125%。検証用の保存先は `app_data_dir()/validation` で、通常の名前・育成データとは分離した。

## ビルドと自動テスト

| 検査 | 結果 |
|---|---|
| TypeScript型検査 / ESLint | 成功 |
| Vitest | 43件成功（操作優先順位、プロフィール移行、画面端、音声初期値、通信障害のバックオフ等） |
| Playwright | 17シナリオ成功。初回16件成功後、ドラッグ解放直後の描画待ちを修正した1件と、まばたき調整後の描画検査を個別に再実行して成功 |
| Rust fmt / WindowsターゲットClippy | 成功 |
| Rustテスト | Windows上で12件成功。起動設定の回帰、旧猫データの移行、個別プロフィール、操作中断、保存・破損復旧など |
| Windows release exe | Tauri CLI + cargo-xwinで成功。Webフロントエンド同梱、インストーラー生成は今回対象外 |

コマンド:

```bash
pnpm check
PLAYWRIGHT_BROWSERS_PATH=.tools/playwright pnpm test:web
source scripts/env-wsl.sh
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --target x86_64-pc-windows-msvc --locked -- -D warnings
cargo xwin test --manifest-path src-tauri/Cargo.toml --target x86_64-pc-windows-msvc --no-run --locked
pnpm tauri build --runner cargo-xwin --target x86_64-pc-windows-msvc --no-bundle -- --locked
```

Rustテスト実行ログ: rust-tests-windows.txt（ローカル検証用・非同梱）。ビルドログ: windows-build-gugugaga.log（ローカル検証用・非同梱）。クロスリンク時に外部MSVCのPDB不足の警告が出たが、ビルドとWindows上のテストは成功。

更新exe: `src-tauri/target/x86_64-pc-windows-msvc/release/madoneko.exe`。
SHA-256: `0eba14b6509e2e04f241fed266d96e8760e55172082ab40e5a72d987bcc6f5e8`。

## Windows実機

| 項目 | 猫 | ググガガ |
|---|---|---|
| 起動直後のエラーなし / 描画 / IPC | 成功 | 成功 |
| get_desktop_pos とOSの実ウィンドウ座標の一致 | 成功 | 成功 |
| 自律歩行で実ウィンドウが移動 | 成功 | 成功 |
| 実マウスでドラッグ / ドラッグ後の実座標 | 成功 | 成功 |
| ドラッグは育成値を増やさない / フォーカスを奪わない | 成功 | 成功 |
| 画面端で全体が作業領域内へ収まる | 成功 | 成功 |
| 余白の入力透過 / 本体の入力復帰 / 集中モード | 成功 | 成功 |
| 切り替えを10回繰り返して名前と状態を維持 | 成功 | 成功 |
| 最前面オン・オフ / トレイ表示・お世話・集中・復帰・終了 | 成功 | 最終検査中 |
| 食事をクリックで中断 / 喜ぶ / 吹き出し / 連打で拗ねる | 対象外 | 成功 |
| 完全終了・起動3回と選択キャラ・名前の復元 | 最終検査中 | 最終検査中 |

実行手順: [native-smoke.ps1](../scripts/native-smoke.ps1)、validate-startup.ps1（ローカル検証用・非同梱）。結果: 猫（ローカル検証用・非同梱） / ググガガ（ローカル検証用・非同梱） / 再起動（ローカル検証用・非同梱）。最初の検証ではPowerShellのDPI仮想化と、トレイ補助ウィンドウを本体と誤認する問題を修正した。装飾の有無はスタイルのビットだけでなくクライアント領域と外枠の実寸を照合する。

## 見た目・動作・保存

- 猫10状態80姿勢とググガガ14状態168姿勢を描画。羽・頭・足の欠けなし、余白はクリック対象外、各状態でパーツが変化することを検査。
- ググガガ本体の高さは100%で約140論理px。ウィンドウの透明余白込みは224×196論理px。画面倍率と設定倍率を移動範囲・ドラッグ・マスクに反映する。
- 呼吸、まばたき、首傾げ、速度に応じた足運びと羽、喜ぶ小跳ね、ハート、拗ね顔、もぐもぐ、蝶追い、睡眠・目覚め、持ち上げ・着地・つまずきを実装。珍しいつまずきは開始から45秒以降・最低90秒の間隔。自然な発生頻度は状態機械のテストで検査し、実機で全動作の自然発生を待って観察したわけではない。
- キャラクターを16回切り替え、表示は1体、イベント登録数は増えず、名前と育成値が各自に戻ることをブラウザーでも検証。
- 吹き出しは1.5秒表示・9秒クールダウン。音声は初期オフ、音量0も保存復元。ググガガの音声ファイルは未同梱で、後から `VOICE_FILES.gugugaga` に追加できる。元のミーム音声は再生・確認していない。

画像・録画:

- 指定画像との比較（ローカル検証用・非同梱）
- 14状態の一覧（ローカル検証用・非同梱）
- キャラクター選択・設定（ローカル検証用・非同梱）
- 操作のWebプレビュー録画（ローカル検証用・非同梱）（Windows実機録画ではない）
- Windowsの猫（ローカル検証用・非同梱） / Windowsのググガガ（ローカル検証用・非同梱） / Windowsの拗ね顔（ローカル検証用・非同梱）

## 主な修正ファイル

- `src-tauri/src/lib.rs`, `runtime.rs`: 明示的なShared登録、OSの実座標取得、旧コマンドとの互換、直接操作の優先。
- `src/platform/native.ts`, `backoff.ts`, `src/main.ts`: コマンド呼び出し、通信障害の抑制と回復、切り替え時の破棄。
- `src/render/gugugaga.ts`, `public/characters/gugugaga/parts-v2.png`: 生成したパーツ、描画範囲、接地、待機中のまばたき。
- `src/core/behavior.ts`, `src/platform/preview.ts`, `src/ui/pet-menu.ts`: 押下中の自律停止、クリック反応と育成クールダウンの分離、キャラ別のメニュー。
- Rust・Vitest・Playwrightテスト、`scripts/native-smoke.ps1`, `scripts/close-windows.ps1`, `scripts/restart-windows.ps1`: 回帰検査、実機検査、安全な保存終了と更新版への再起動。
- `docs/gugugaga-reference.md`, `docs/ASSETS.md`, `docs/STARTUP_FIX.md`, `README.md`: 参考資料・素材条件・不具合調査・起動手順。

## 未確認・制約

異なるDPIを跨ぐ複数モニター、長時間連続稼働、実機のスリープ復帰、インストーラー再生成は今回未確認。動画ページを取得できず、元の歩き方や声を観察したとはしていない。動作は依頼に基づく本アプリの演出。素材の再配布許諾は [参照記録](gugugaga-reference.md) に区別して記載した。
