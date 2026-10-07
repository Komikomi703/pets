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
