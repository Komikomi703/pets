# ググガガの参照記録

確認日: 2026-10-07。検索語: `Gugugaga Penguin` / `Gugu Gaga Penguin` / `咕咕嘎嘎企鹅` / `Endmin Penguin` / `Penguinistrator` / `ググガガ`。

## 実際に確認した資料

- [指定のHitPaw画像](https://images.hitpaw.com/topics/ai-video-enhancer-tips/arknights-endfield-penguin-gugu-gaga-meme.jpg): ダウンロードし、画像閲覧で中央のキャラクターを確認。**採用デザインの基準はこの1点**。参照用コピーは `artifacts/reference/gugugaga-reference.jpg`。アプリには同梱しない。
- [HitPawの解説](https://www.hitpaw.com/meme-tips/gugu-gaga-meme.html): Endfieldのファンによるペンギン風キャラクターと幼児語風の音声を組み合わせたミームと説明。
- [Know Your Meme](https://knowyourmeme.com/memes/gugu-gaga-penguin): Endministrator由来のファン制作、別名、Bilibiliへの由来を説明。ただし投稿・調査中の二次資料で、最初の作者・発生日・音声の出所を本作では確定情報として扱わない。公式キャラクターデザインとは主張しない。
- [Endfield Talos Wiki](https://endfield.wiki.gg/wiki/Endministrator/Trivia) / [日本語の解説](https://jp.cyberlink.com/blog/photo-effects/5535/gugugaga-penguin-meme): `Endmin Penguin`・`Penguinistrator`・`ググガガ` の検索でも関連を確認。女性版管理人との関連は複数の二次資料で説明されているが、原作者の一次投稿・公式の許諾は未確認。
- [Bilibiliの動画候補](https://www.bilibili.com/video/BV1vrXGBtEst/) / [YouTubeの動画候補](https://www.youtube.com/watch?v=4OnBRsxBCU4): 検索では動画情報が見つかったが、ページ取得がエラーとなり再生・音声視聴はできなかった。**歩行や発声を実際に観察したとはしていない**。

## 採用した特徴（指定画像で目視）

| 部位 | 採用内容 |
|---|---|
| フードと顔 | 黒〜チャコールの丸いフード。上部に白縁のペンギンの目。大きい黄色の三角形のくちばしは**額・前髪の上**。その下の開口部に少女の顔があり、顔自身の口とは別物。 |
| 髪と目 | 黒い短いボブとそろった前髪。見る側の左に青灰色の交差した髪留め。青い大きな目、濃い上まぶた、小さい口、薄い頬の赤み。 |
| 体型と配色 | 大きめの頭と短い卵形の胴体。黒い着ぐるみ、白い楕円のお腹、首元の銀色クリップ。 |
| 羽と足 | 小さい黒い丸先の羽。黄色い短い水かき足、丸い3つの指先。 |
| 表情 | 基本は少しぼんやりした顔。画像の喜び顔を手掛かりに、アプリでは目を細めた笑顔などを独自に追加。 |

歩き方・拗ね方・着地・珍しいつまずき等はユーザー指定に基づく本アプリの演出。発声について資料は赤ちゃん言葉の反復と説明するが、音色・声質・元音源は未確認。異なる派生画像の設定は混ぜていない。

## 素材・利用条件

- 作業開始時に `public/characters/gugugaga/parts.png` と生成プロンプトが存在した。指定画像と目視照合した後、built-in imagegen で修正版 `public/characters/gugugaga/parts-v2.png` を生成し、前回はこの素材を使用した。現在は再調整した `parts-v3.png` を使用する（[今回の比較と記録](CHARACTER_REDESIGN.md)）。元ファイルは比較用に保存。頭（人の目と口は描かない）、胴体、左右の羽、左右の足を分離し、人の目・口・頬と各演出はCanvasで描画・アニメーションする。
- 生成プロンプト全文: [gugugaga-image-prompt.txt](gugugaga-image-prompt.txt)。画像ビューアでは暗く見えた背景もアルファ0の領域であり、画像のRGBAデータとブラウザーの実描画で透過を確認した。胴体の切り出し範囲を調整し、隣のパーツの断片が入る問題を修正。Webの参照画像・動画・音声はアプリへ転載していない。
- 参照画像とミーム音声の再配布許諾は確認できていない。生成した二次創作画像にも元作品のキャラクターに関する権利があり得るため、素材を一律に独自MIT素材・公式許諾済みとは表記しない。コードと既存猫のMITとは区別する。
- 再配布条件を確認した音源がないので、ググガガの音声ファイルは同梱しない。吹き出しで完成させ、`src/ui/sound.ts` の `VOICE_FILES.gugugaga` に許諾済み音源を指定できる構成。猫の既存電子音をググガガの元音声に流用しない。
