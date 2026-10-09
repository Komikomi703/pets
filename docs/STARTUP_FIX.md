# 位置取得と状態登録の調査（2026-10-07）

報告された `state not managed ... get_desktop_pos` は、Tauriがコマンド引数の型に一致する管理状態を取得できないときのエラー。

作業開始時点のソース・distには `get_desktop_pos` がなく、相当するコマンドは `src-tauri/src/lib.rs` の `get_desktop`、呼び出しは `src/platform/native.ts` の `desktop()` だった。WindowsではTemp配下の別コピーのexeが動作していた。従って、報告時の旧バイナリの型不一致まで再現・確定したとはしていない。

## 型と起動経路

- `main.rs → madoneko_lib::run() → Builder::setup` が実際の起動経路。
- `Shared = Arc<std::sync::Mutex<Runtime>>`。`State<'_, Shared>` と `app.manage::<Shared>(shared.clone())` はラッパー込みで同一型。`Runtime`、`Mutex<Runtime>`、`tokio::sync::Mutex` を別に登録する処理はない。
- `get_snapshot`、位置取得、設定更新、お世話、`sync_frame`、押下・解放、メニュー、表示・復帰は同じSharedを参照。トレイとワーカーもそのArcを共有する。
- `SettingsGate(Mutex<()>)` はBuilderで登録。`TrayControls` と `Worker` は既存の専用状態であり、位置・育成値の複製ではない。Sharedの登録はWindows条件分岐の外。
- Tauri 2.12.1はconfigの `create: true` のウィンドウをユーザーsetupより前に作る。非表示でもWebViewはIPCを実行するため、setupで登録する状態と競合し得る。[Tauriの状態管理](https://v2.tauri.app/develop/state-management/) とインストール済み `tauri/src/app.rs` の `setup` を確認。
- 作業開始時に既に両ウィンドウの `create: false` と登録後の明示生成が存在した。これを維持し、Sharedの型指定・二重登録時の起動失敗・configの回帰テストを追加した。

## 今回の変更

- 現在のAPI名を `get_desktop_pos` に統一。`get_desktop` は既存診断向けに同じ実装へ委譲する。状態を増やしていない。
- `runtime::desktop_position` がOSの `outer_position` / `inner_size` / `scale_factor` / 現在モニターを読み、実際の物理座標を返す。取得失敗はErr。未初期化座標や常時(0,0)で成功扱いしない。移動用の小数座標は既存Runtimeだけで保持する。
- 位置取得は初回1回、その後は既存desktopイベントの購読。フレーム通信は1件ずつ送り、失敗中は0.5→1→2→4→8秒で間隔を延ばす。エラーは連続障害につき1回表示し、成功後に解除。切り替え時に古い通信の完了を無視する。
- Windowsの旧プロセスをトレイ経由で保存終了し、Tauri CLIでWebフロントを同梱したexeを再ビルドして起動した。単なるWebViewリロードではない。

確認結果と実行ログは [VALIDATION.md](VALIDATION.md)。

## 再発の調査と起動先の修正（2026-10-08）

Windowsで実際に動作していたexeとタスクバーの `MadoNeko.lnk` は、ともに `Temp\MadoNeko-run-*\madoneko.exe` を指していた。旧exeは10月7日0:43作成、SHA-256は `04ce35081a582571c7446ad503aea3e1b8d8f9823437c8996cba63669994825f`。前回修正済みの配布用exeとも別物だった。調査時、自動起動登録はなく、ユーザー設定も自動起動オフだった。

旧exeを通常起動・`--autostart`付き起動で各1回実行し、両方で `state not managed for field state on command get_desktop` の表示と描画停止を再現した。同じプロセスで2秒後の `get_desktop` 呼び出しは成功し、旧版の起動直後のState登録競合と判断できる。`get_desktop_pos` は旧exeには存在しなかった。

現在のソースでは `State<'_, Shared>` と `manage::<Shared>` は同じ型で、初期値を作成・登録してから両WebViewを生成している。`get_snapshot`、`update_settings`、`pet_action`、`sync_frame`、`begin_press`、`end_press`、`open_pet_menu`、`set_visible`、`rescue` も同じSharedを使用する。フロントエンドの `NativePlatform.desktop()` は `get_desktop_pos` を引数なしで呼び、StateはTauriが注入する。ここには追加のState登録やinvoke修正は不要だった。

再発の原因は、従来の `restart-windows.ps1` が毎回別のTempフォルダーへexeをコピーし、タスクバーなどに残った旧版の起動先を更新しなかったこと。修正後は `%LOCALAPPDATA%\Programs\MadoNeko\madoneko.exe` を固定の配置先とし、コピーのハッシュを照合する。既存ショートカットと、存在する場合だけユーザーの自動起動コマンドを更新する。自動起動の有効・無効を変える処理は追加していない。変更前のexe・ショートカット・登録値は `rollback-*` に保存する。

`scripts/validate-startup.ps1` を追加し、検証専用保存領域で通常起動・自動起動引数付き起動を各3回確認する。各回でエラー表示、描画、`get_snapshot`、`get_desktop`、`get_desktop_pos`、有効な画面サイズを検証し、保存終了する。OSの再起動そのものは行わない。

参考：[Tauri 2のState管理と型の一致](https://v2.tauri.app/develop/state-management/)。ローカルのTauri 2.12.1 `src/app.rs` でも、`create: true` のWebView生成がユーザーsetupより先に実行されることを確認した。

### 修正後の結果

- `pnpm check`：型チェック、ESLint、単体51件、フロントエンドビルド成功。
- Tauri CLI + cargo-xwin：Windows release exeのビルド成功。MSVC CRTのデバッグ用PDB欠落によるLNK4099警告あり、リンクは成功。
- Windows上のRustテスト12件成功（WebViewのState登録順序の回帰テストを含む）。
- 通常起動3回・`--autostart`付き3回：エラー表示なし、描画・両位置取得API成功。ログは `artifacts/native/startup-fixed-current.json`。
- Windows操作テスト：猫39件、ググガガ43件すべて成功。ログは `artifacts/native/startup-fix-cat/` と `startup-fix-gugugaga/`。
- 修正したタスクバー用 `.lnk` からユーザーの通常データで実際に起動し、固定パスのプロセス、エラー表示なし、`get_desktop` / `get_desktop_pos` 成功を確認。ログは `artifacts/native/pinned-startup-fixed.json`。最後はデバッグポートを開かず、同じショートカットから起動した。
- 新exeのSHA-256：`b22301209e6c8096ec2d5dac64999e26c3db571c0e90ea4dfc5db87bc11f43a8`。PC自体の再起動は実施していない。
