# GitHub婚姻届

🌐 Languages:

**日本語** | [English][]

![header][]

> 婚姻届も継続的インテグレーション・デリバリーしたい！幸せをYAMLで書きたい！ソフトウェアエンジニアと結婚したい！そんな悩みを解決します！

[English]: README.en.md
[header]: ./public/hero-img-ja.png


## 目次 <!-- omit in toc -->

* [概要](#概要)
* [初期セットアップ](#初期セットアップ)
* [設定](#設定)
  * [情報](#情報)
  * [レイアウト](#レイアウト)
* [使い方 - ローカルで実行する](#使い方---ローカルで実行する)
* [使い方 - GitHub Actionsで実行する](#使い方---github-actionsで実行する)
* [.github ディレクトリの構成](#github-ディレクトリの構成)


## 概要

このプロジェクトは、1つのYAMLファイルから記入済みの婚姻届をPDFとして生成します。

夫・妻それぞれの情報（氏名・生年月日・住所・本籍・父母の氏名など）をYAMLファイルに記述すると、`src/main.js` がその内容を婚姻届のテンプレートに重ねて `result.pdf` を出力します。設定は2つのファイルに分かれています（詳しくは[設定](#設定)を参照）。ローカルでは自分の情報を書いた `config-private.yaml`（Git管理外）を使い、GitHub Actionsではサンプルの `config.yaml` を使います。

PDFの生成方法は2通りあります。

* **ローカルで生成**：ワンコマンドのスクリプト（`./start.sh`）を実行する
* **GitHub Actionsで生成**：pushのたびにCIでPDFをビルドし、リリースとして公開する


## 初期セットアップ

Node.js 24以上が必要です。パッケージマネージャーは[pnpm][] 10以上を推奨します（npmでも動作します）。`.npmrc` で `engine-strict=true` を設定しているため、これより古いNode.jsは実行時に拒否されます。

```bash
git clone https://github.com/ahandsel/japan-marriage-registration.git
cd japan-marriage-registration
```

ローカル実行用スクリプト（`./start.sh`）が依存関係のインストールを自動で行うため、ローカルで動かすだけなら追加のセットアップは不要です。手動で環境を準備したい場合は以下のとおりです。

```bash
pnpm install # または: npm install
```

依存パッケージ（`package.json`）:

* `pdf-lib` - テンプレートPDFへのテキストのオーバーレイ描画と合成
* `@pdf-lib/fontkit` - 日本語フォント（IPAex明朝）の埋め込み
* `yaml` - 設定ファイル（`config-private.yaml` / `config.yaml`）の読み込み

[pnpm]: https://pnpm.io/


## 設定

設定は2つのYAMLファイルに分かれています。どちらも同じ項目構成です。

| ファイル              | 役割                                                                                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `config.yaml`         | リポジトリにcommitされるサンプル。GitHub ActionsのCIで使われ、`config-private.yaml` を作るときのコピー元になります。**プレースホルダーのみを記載し、実際の個人情報は書かないでください。** |
| `config-private.yaml` | 自分の実際の情報を書くローカル用のファイル。`.gitignore` で除外されており、**ローカル実行時のデフォルト**です。                                                                            |

初回はサンプルをコピーして自分用のファイルを作成します。

```bash
cp config.yaml config-private.yaml
```

そのうえで `config-private.yaml` に自分の情報を記入します。文字の配置（座標・フォントサイズ・行間）はテンプレートごとのレイアウトファイル `src/layout/<テンプレート名>.yaml` が持つため、設定ファイルには基本的に自分の情報だけを書きます。位置を微調整したいときは、トップレベルの `layout:` ブロックを追加します（[レイアウト](#レイアウト)を参照）。従来の `*_pos` 項目（`[x, y]` のポイント座標）も上書きとして引き続き使えるため、既存の設定はそのまま動きます。

> ⚠️ **プライバシーに関する注意**：`main` にpushすると、GitHub Actionsが生成したPDFを**公開**の[Release][]として公開します。実際の個人情報は `config-private.yaml` にのみ記入し、ローカルで（`./start.sh` で）PDFを生成してください。個人情報を含む設定をcommit・pushしないでください。

各ファイルは以下のトップレベルのセクションで構成されています。

| セクション              | 内容                                          |
| ----------------------- | --------------------------------------------- |
| `notification`          | 届出日と提出先の市区町村（`to`）              |
| `husband`               | 夫になる人の情報                              |
| `wife`                  | 妻になる人の情報                              |
| `new_legally_domiciled` | 婚姻後の新しい本籍                            |
| `to_live_together`      | 同居を始めた（始める）時期                    |
| `national_census`       | 国勢調査に関する情報（該当期間のみ記載）      |
| `other`                 | 自由記入欄（旧字体⇔新字体の変更、同意欄など） |


### 情報

`husband` と `wife` のセクションは同じ項目を持ちます。例:

```yaml
husband:
  last_name: 山田
  last_name_pos: [220, 590]
  last_name_kana: やまだ
  last_name_kana_pos: [221, 623]
  first_name: 太郎
  first_name_pos: [300, 590]
  first_name_kana: たろう
  first_name_kana_pos: [305, 623]
  birth_year: 平成５
  birth_month: ５
  birth_day: ２１
  address_first: 東京都千代田区神田
  address_first_pos: [221, 545]
  address_second: ３丁目　４
  is_banchi_address: false
  address_go: １０
  address_apartment: | # 3行までであれば崩れず表現できます
    インチキタワー
    マンション
    ３６１０号室
  household_person: 山田　太郎
  legally_domiciled_first: 東京都千代田区飯田橋
  legally_domiciled_first_pos: [221, 480]
  legally_domiciled_second: ３丁目　４
  is_banchi_legally_domiciled: true
  head_of_person_of_legally_domiciled: 山田　太郎兵衛
  father_name: 山田　権左衛門
  father_name_pos: [221, 410]
  mother_name: 山田　としこ
  mother_name_pos: [221, 380]
  relationship: 長
  marital_history:
    marriage_cat: 2 # 0: 初婚 1:死別 2:離別
    year: 令和3
    month: 6
    day: 1
  job_type: 6
```

`wife` のセクションも同様に記入します（項目は同じで、用紙の右側の列の座標はレイアウトファイルが持っています）。

[Release]: https://github.com/ahandsel/japan-marriage-registration/releases


### レイアウト

すべての描画位置は、テンプレートごとのレイアウトファイル `src/layout/simple.yaml` と `src/layout/cinnamoroll.yaml` が持ちます。`-t/--template` フラグや `template:` キーと同じ名前で選択されます。
各項目は絶対座標です。`pos: [x, y]` は左下を原点とするテキストのベースライン位置（ポイント単位）、`size` はフォントサイズで、複数行の項目（`address_apartment` と `other.text`）には行間を表す `step` があります。円は `[x, y, r]`、楕円は対角の2つの角 `[x1, y1, x2, y2]` で表します。`job_type_checks` は `job_type` の値（1-6）ごとに✓マークの絶対位置を持ちます。

レイアウトファイルを編集せずに位置を調整したいときは、設定ファイルに `layout:` ブロックを追加します。テンプレートのレイアウトに深いマージ（deep merge）で重なるため、変更したいキーだけを書けば済みます。

```yaml
layout:
  husband:
    last_name: { pos: [225, 592] } # 1項目だけ調整し、他はそのまま
```

従来の `*_pos` キーも、解決済みレイアウトへの上書きとして引き続き有効です。`address_first_pos` や `legally_domiciled_first_pos` を動かすと、従来この項目からの相対位置で描画されていた項目（`address_second` や `household_person` など）も同じ量だけ移動するため、既存の設定は以前と同じ見た目のまま出力されます。


## 使い方 - ローカルで実行する

`config-private.yaml` に情報を記入し、以下を実行します（まだ作成していない場合は[設定](#設定)を参照してコピーを作成してください）。

```bash
./start.sh
```

これだけです。スクリプトが依存関係をインストールし、`result.pdf` を生成して開きます。引数なしで実行するとローカル用の `config-private.yaml` が使われます。`config-private.yaml` を変更したら、そのつど再実行してください。

生成ステップだけを手動で実行したい場合は、[初期セットアップ](#初期セットアップ)で依存関係をインストールしたうえで、以下を実行します。

```bash
node src/main.js             # config-private.yaml を使って result.pdf を出力
node src/main.js config.yaml # 設定ファイルを明示的に指定することも可能
```

同じ操作はpnpmスクリプトでも実行できます。

```bash
pnpm run init-config     # PDFを生成せずに、サンプルから config-private.yaml を作成する
pnpm run generate        # config-private.yaml から result.pdf を生成する
pnpm run generate-sample # サンプルの config.yaml から result.pdf を生成する（CIと同じ動作）
```

`pnpm run init-config` は既存の `config-private.yaml` を上書きしないため、何度実行しても安全です。非公開・ローカル専用であることを示す以下のヘッダーコメントが無い場合に、それだけを追加します。

```yaml
# ローカル実行時のみ使用される非公開の設定ファイルです。
# Private configuration file that is only used for local execution.
```


## 使い方 - GitHub Actionsで実行する

CIでPDFをビルドするワークフローが2つあります。

* **`.github/workflows/pr.yml`** - `main` へのプルリクエストのたびに実行され、PDFをビルドし、ワークフローのアーティファクトとしてアップロードします（実行結果のサマリーページからダウンロードできます）。
* **`.github/workflows/push.yml`** - `main` へのpushのたびに実行され、PDFをビルドし、新しい[Release][]（タイムスタンプのタグ付き）として `marriage_registration.pdf` を添付して公開します。

どちらのワークフローも `node src/main.js config.yaml` を実行し、commit済みの `config.yaml`（サンプル）を使ってPDFを生成します。つまり基本の流れは、`config.yaml` を編集してcommitし、`main` にpushするだけです。うまくいけば、生成されたPDFが[Release][]に出来上がります。シークレットや追加の設定は不要で、ワークフローは組み込みの `GITHUB_TOKEN` を使用します。

> ⚠️ **注意**：`push.yml` は生成したPDFを**公開**のReleaseとして公開します。ここで使われるのはcommit済みの `config.yaml` のみです。実際の個人情報を含む婚姻届が必要な場合は、`config-private.yaml` に記入してローカルで生成してください（CIには載せないでください）。


## .github ディレクトリの構成

`.github/` には、GitHubの自動化に関する設定ファイルがまとまっています。各ファイルの役割は以下のとおりです。

| ファイル                                | トリガー                           | 役割                                                                                                                                                                                                  |
| --------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.github/dependabot.yml`                | 毎日（スケジュール実行）           | [Dependabot][] の設定。`npm`（pnpmを含む）の依存パッケージを毎日チェックし、更新があればプルリクエストを自動で作成します。                                                                            |
| `.github/workflows/pr.yml`              | `main` へのプルリクエスト          | `node src/main.js config.yaml` でPDFをビルドし、ワークフローのアーティファクト（`marriage_registration`）としてアップロードします。実行結果のサマリーページから `result.pdf` をダウンロードできます。 |
| `.github/workflows/push.yml`            | `main` へのpush                    | PDFをビルドし、タイムスタンプをタグにした**公開**の[Release][]を作成して `marriage_registration.pdf` を添付します。                                                                                   |
| `.github/workflows/pr-lint-autofix.yml` | プルリクエスト（作成・更新・再開） | `pnpm lint`（Prettierとmarkdownlint）を実行し、自動修正した内容をPRブランチへcommit・pushして返します。同一リポジトリ内のPRでのみ動作します。                                                         |

いずれのワークフローもNode.js 24とpnpmで動作し、認証には組み込みの `GITHUB_TOKEN` を使用します。追加のシークレット設定は不要です。

[Dependabot]: https://docs.github.com/code-security/dependabot
