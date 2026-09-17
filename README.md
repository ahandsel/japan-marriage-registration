# GitHub婚姻届

🌐 Languages:

**日本語** | [English][]

![header][]

> 婚姻届も継続的インテグレーション・デリバリーしたい！幸せをYAMLで書きたい！ソフトウェアエンジニアと結婚したい！そんな悩みを解決します！

[English]: README.en.md
[header]: ./public/hero-img-ja.png


## 目次 <!-- omit in toc -->

* [概要](#概要)
* [クイックスタート](#クイックスタート)
* [初期セットアップ](#初期セットアップ)
  * [動作要件](#動作要件)
  * [手順](#手順)
  * [依存パッケージ](#依存パッケージ)
* [コマンドリファレンス](#コマンドリファレンス)
* [設定](#設定)
  * [情報](#情報)
  * [テンプレート](#テンプレート)
  * [レイアウト](#レイアウト)
* [使い方 - ローカルで実行する](#使い方---ローカルで実行する)
* [使い方 - GitHub Actionsで実行する](#使い方---github-actionsで実行する)
* [.github ディレクトリの構成](#github-ディレクトリの構成)


## 概要

このプロジェクトは、1つのYAMLファイルから記入済みの婚姻届をPDFとして生成します。

夫・妻それぞれの情報（氏名・生年月日・住所・本籍・父母の氏名など）をYAMLファイルに記述すると、`src/main.js` がその内容を婚姻届のテンプレートに重ねて、時刻付きの `result-<template>-<HH-MM-SS>.pdf` を出力します（ファイル名は `-o` で変更できます）。
設定は2つのファイルに分かれています（詳しくは[設定](#設定)を参照）。

* ローカルでは、自分の情報を書いた `config-private.yaml`（Git管理外）を使います。
* GitHub Actionsでは、サンプルの `config.yaml` を使います。

PDFの生成方法は2通りあります。

* **ローカルで生成**：ワンコマンドのpnpmスクリプト（`pnpm start`）を実行する
* **GitHub Actionsで生成**：pushのたびにCIでPDFをビルドし、リリースとして公開する


## クイックスタート

[Node.js][] 24以上がインストールされていれば（[動作要件](#動作要件)を参照）、以下だけで始められます。

```bash
git clone https://github.com/ahandsel/japan-marriage-registration.git
cd japan-marriage-registration
pnpm start
```

`pnpm start` は依存関係をインストールし、初回実行時にサンプルから `config-private.yaml` を作成し、`result-red-<HH-MM-SS>.pdf` を生成して開きます。
最初のPDFにはサンプルのプレースホルダーが入っているため、次の2つの手順で自分のものにします。

1. `config-private.yaml` に自分の情報を記入します（項目は[情報](#情報)を参照）。
2. もう一度 `pnpm start` を実行します。
   何度でも実行できます。
   実行のたびに時刻付きの新しいPDFができるため、以前の出力が上書きされることはありません。

セットアップ後の操作はすべてpnpmスクリプトで、ほとんどの用途は次の2つで足ります。

```bash
pnpm run generate --help    # 使えるオプションの一覧を表示して終了する
pnpm start --template black # 別の様式で生成する: red（既定）、black、cinnamoroll
```

pnpmはスクリプト名の後ろの引数をそのまま生成プログラムに渡すため、どのオプションもどのスクリプトでも使えます。
オプションの一覧は[コマンドリファレンス](#コマンドリファレンス)を、様式の一覧は[テンプレート](#テンプレート)を参照してください。

> ⚠️ **プライバシー**：実際の個人情報は `config-private.yaml`（Git管理外）にのみ記入し、PDFはローカルで生成してください。
> commit済みの `config.yaml` はCIでビルドされ、**公開**のReleaseとして公開されます。


## 初期セットアップ


### 動作要件

| 要件        | バージョン | 補足                                                                                                                                                          |
| ----------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Node.js][] | 24以上     | `.npmrc` で `engine-strict=true` を設定しているため、これより古いバージョンは後で失敗する代わりに実行時に拒否されます。                                       |
| [pnpm][]    | 10以上     | 推奨のパッケージマネージャーです。`package.json` の `packageManager` で正確なバージョンを固定しているため、[Corepack][] から導入できます。npmでも動作します。 |

そのほかのツールは不要です。
日本語フォントと様式のテンプレートは `src/` に同梱されており、ビルドステップもありません。

macOSでは[Homebrew][]で両方をインストールできます。

```bash
brew install node pnpm
```

`brew install node` は最新のNode.jsをインストールし、これで要件を満たします。
Node.js 24系にとどめたい場合は `brew install node@24` を実行し、最後にHomebrewが表示する `PATH` の指示に従ってください。

その他のプラットフォームは [Node.js][] と [pnpm][] のダウンロードページを参照してください。
Node.jsがすでにある場合は、Homebrewの代わりにCorepackでpnpmを導入することもできます。

```bash
corepack enable pnpm
```

両方のツールが `PATH` にあり、十分に新しいことを確認します。

```bash
node --version # v24.0.0 以上
pnpm --version # 10.0.0 以上
```


### 手順

1. リポジトリをcloneします。

   ```bash
   git clone https://github.com/ahandsel/japan-marriage-registration.git
   cd japan-marriage-registration
   ```

2. 非公開の設定ファイルを作成します。

   ```bash
   pnpm run init-config
   ```

   この手順は省略できます。
   `config-private.yaml` が無ければ、初回実行時にサンプルの `config.yaml` から自動で作成され、編集を促すメッセージが表示されます。
   どちらの場合も、サンプルのプレースホルダーが入った同じファイルができます。

   `cp` ではなく `pnpm run init-config` を使ってください。
   非公開・ローカル専用であることを示す2行のヘッダーコメントを付けてくれるうえ、既存の設定を上書きしません。

   `config-private.yaml` は `.gitignore` に登録されており、実際の個人情報を書いてよい唯一のファイルです。
   設定が2つに分かれている理由は[設定](#設定)を参照してください。

3. 最初のPDFを生成します。

   ```bash
   pnpm start
   ```

   `pnpm start` は `start.sh` を実行し、あとの処理を引き受けます。
   依存関係をインストールし（`PATH` にあればpnpm、次にCorepack、最後にnpm）、`config-private.yaml` を読んで `result-<template>-<HH-MM-SS>.pdf` を生成し、開きます。
   この時点のPDFにはまだサンプルのプレースホルダーが表示されています。

4. `config-private.yaml` に自分の情報を記入し、もう一度 `pnpm start` を実行します。
   項目は[設定](#設定)を参照してください。

`pnpm start` に任せず自分で環境を準備したい場合は以下のとおりです。

```bash
corepack enable # 任意: 固定されたバージョンのpnpmを導入する
pnpm install    # 依存関係を一度インストールする
pnpm run generate
```

> [!NOTE]
> `pnpm-workspace.yaml` は `minimumReleaseAge` を3日に設定しているため、公開されたばかりの依存パッケージのバージョンをpnpmは無視します。
> サプライチェーンリスクを減らすための想定どおりの動作で、ロックファイルが古いわけではありません。


### 依存パッケージ

実行時の依存パッケージ（`package.json`）:

* `pdf-lib` - テンプレートPDFへのテキストのオーバーレイ描画と合成
* `@pdf-lib/fontkit` - 日本語フォント（IPAex明朝）の埋め込み
* `yaml` - 設定ファイル（`config-private.yaml` / `config.yaml`）の読み込み

開発時の依存パッケージはフォーマッター（`prettier` と `markdownlint-cli2` とそのプラグイン）だけです。
commitする前に `pnpm lint` を実行して自動修正を適用してください。
`pnpm test` はNode.js標準のテストランナーでテストスイートを実行するため、追加のパッケージは不要です。
`poppler-utils`（macOSでは `brew install poppler`）をインストールすると、生成したPDFを `pdftotext` で読み戻して文字の位置を確認するテストも実行されます。
無い場合、その確認はスキップされます。
テストは各項目がレイアウトファイルの指定位置に描かれたことを確認するもので、レイアウトが印刷様式と合っているかは確認できません。
座標の変更はこれまでどおりPDFを再生成して目視で確認してください。

[Corepack]: https://nodejs.org/api/corepack.html
[Homebrew]: https://brew.sh/
[Node.js]: https://nodejs.org/
[pnpm]: https://pnpm.io/


## コマンドリファレンス

[初期セットアップ](#初期セットアップ)のあとは、すべての操作がpnpmスクリプトです。

| スクリプト                 | 内容                                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `pnpm start`               | ふだん使うコマンド。依存関係をインストールし、PDFを生成して開きます。`start.sh` を実行します。                      |
| `pnpm run generate`        | `config-private.yaml` からPDFを生成します。依存関係のインストールとPDFを開く操作は行いません。                      |
| `pnpm run generate-sample` | commit済みのサンプル `config.yaml` からPDFを生成します。                                                            |
| `pnpm run init-config`     | `config-private.yaml` が無ければ作成し、既にある場合は不足しているセクションを追加して、PDFを生成せずに終了します。 |
| `pnpm run <様式>:pdf`      | 特定の様式で生成します。様式ごとのスクリプトは[テンプレート](#テンプレート)を参照してください。                     |
| `pnpm run index`           | `package.json` のすべてのpnpmスクリプトを、実行するコマンドとあわせて一覧表示します。                               |
| `pnpm run clean`           | リポジトリ内の一時ファイルを一覧表示し、確認のうえ削除します。                                                      |
| `pnpm lint`                | Prettierとmarkdownlintの自動修正を適用します。commitする前に実行してください。                                      |
| `pnpm test`                | テストスイートを実行します。文字位置の確認には `pdftotext`（poppler）が必要で、無い場合はスキップされます。         |

どのスクリプトも `pnpm run` を `pnpm` に短縮できます（例: `pnpm start`、`pnpm generate`）。

pnpmはスクリプト名の後ろに入力した内容をそのまま生成プログラムに渡すため、以下のオプションは `pnpm start`、`pnpm run generate`、様式ごとのスクリプトのいずれでも使えます。
生成プログラム自体にもヘルプがあり、`-h` または `--help` で使い方を表示して終了します。
`pnpm start --help` は `start.sh` 自身の短いヘルプを表示するため、生成プログラムのオプションは `pnpm run generate` で確認してください。

```bash
pnpm run generate --help
```

| オプション                | 内容                                                                                                                                                                             |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `-h`, `--help`            | すべてのオプションを含む使い方を表示して終了します。                                                                                                                             |
| `-t`, `--template <名前>` | 別の様式で生成します: `red`（既定）、`black`、`cinnamoroll`、テンプレートのファイル名、または任意のPDFへのパス。[テンプレート](#テンプレート)を参照してください。                |
| `-o`, `--output <パス>`   | PDFの出力先。既定はカレントディレクトリの `result-<template>-<HH-MM-SS>.pdf` です。                                                                                              |
| `--list-templates`        | 同梱テンプレートとそのファイルパスを表示して終了します。                                                                                                                         |
| `--init-config`           | 非公開の設定ファイルが無ければ作成し、既にある場合は不足しているセクションを追加して、PDFを生成せずに終了します。`-t` を付けると対象は `config-private-<様式>.yaml` になります。 |
| `--init-layout`           | `src/layout/<様式>.yaml` が無ければ既定のグリッドから作成して終了します。すでにある場合は上書きせず、検証だけを行います。                                                        |
| `[config]`                | 位置引数: 読み込むYAML設定ファイル。既定は `config-private-<様式>.yaml`（存在する場合）、無ければ `config-private.yaml` です。                                                   |

```bash
pnpm run generate --list-templates           # 同梱されている様式を確認する
pnpm run generate -t black                   # ローカルの情報で黒刷り様式を生成する
pnpm run generate -t black config-black.yaml # ...またはその様式のサンプル設定で生成する
pnpm run generate -o /tmp/draft.pdf          # レイアウト調整中など、別の場所に出力する
pnpm run index                               # package.json のすべてのpnpmスクリプトを一覧表示する
```

pnpmスクリプトは薄いラッパーなので、`./start.sh` や `node src/main.js` を直接実行することもできます。
pnpmの代わりにnpmを使う場合は、オプションの前に `--` を付けてください（例: `npm run generate -- -t black`）。


## 設定

設定は2つのYAMLファイルに分かれています。
どちらも同じ項目構成です。

| ファイル              | 役割                                                                                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `config.yaml`         | リポジトリにcommitされるサンプル。GitHub ActionsのCIで使われ、`config-private.yaml` を作るときのコピー元になります。**プレースホルダーのみを記載し、実際の個人情報は書かないでください。** |
| `config-private.yaml` | 自分の実際の情報を書くローカル用のファイル。`.gitignore` で除外されており、**ローカル実行時のデフォルト**です。                                                                            |

初回の実行時にサンプルから自動で作成されるため、手作業の準備は不要です。
先に自分で作成しておきたい場合は以下を実行します。

```bash
pnpm run init-config
```

`pnpm run init-config` は既存のファイルを上書きせず、非公開・ローカル専用であることを示すヘッダーコメントも付けてくれるため、`cp` よりこちらを使ってください。

そのうえで `config-private.yaml` に自分の情報を記入します。
文字の配置（座標・フォントサイズ・行間）はテンプレートごとのレイアウトファイル `src/layout/<テンプレート名>.yaml` が持つため、設定ファイルには基本的に自分の情報だけを書きます。
位置を微調整したいときは、トップレベルの `layout:` ブロックを追加します（[レイアウト](#レイアウト)を参照）。
従来の `*_pos` 項目（`[x, y]` のポイント座標）も上書きとして引き続き使えるため、既存の設定はそのまま動きます。
ただし `*_pos` の値は `red` 用の座標なので、`red` レイアウトの使用時にのみ適用され、他の様式では警告を表示したうえで無視されます。

> ⚠️ **プライバシーに関する注意**：`main` にpushすると、GitHub Actionsが生成したPDFを**公開**の[Release][]として公開します。
> 実際の個人情報は `config-private.yaml` にのみ記入し、ローカルで（`pnpm start` で）PDFを生成してください。
> 個人情報を含む設定をcommit・pushしないでください。

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
| `witness1`              | 証人欄の左の列（省略すると手書き用に空欄）    |
| `witness2`              | 証人欄の右の列（省略すると手書き用に空欄）    |

どのセクションも省略できます。
セクションごと削除すると、その欄は手書き用に空欄のまま出力され、生成時にその旨の案内が表示されます。
セクションがあるのにその中の項目が無い場合はエラーになるため、特定の欄だけ空欄にしたいときは値を `''` にしてください。


### 情報

`husband` と `wife` のセクションは同じ項目を持ちます。
例:

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
  job_type: 6 # 1-6 でその番号にチェック。0 または '' で空欄
```

`wife` のセクションも同様に記入します（項目は同じで、用紙の右側の列の座標はレイアウトファイルが持っています）。

`is_banchi_address` と `is_banchi_legally_domiciled` には `true`（番地を楕円で囲む）、`false`（番を丸で囲む）、`null` のいずれかを指定します。
`null` にすると印を付けません（外国籍の方の本籍や、番地・番の印字が無い欄に使います）。
それ以外の値（引用符付きの `'false'` やキーの欠落など）はエラーになり、印が黙って抜け落ちることはありません。

`witness1` と `witness2` は証人欄の左右の列で、同じ項目を持ちます。
セクションごと削除（またはコメントアウト）すると、その列は手書き用に空欄のままになります。

```yaml
witness1:
  # 署名は必ず証人本人の自署が必要です。通常は '' のままにして、印刷後に署名してもらってください。
  name: ''
  birth_year: 昭和６０
  birth_month: １
  birth_day: ２３
  address_first: 東京都新宿区西新宿
  address_second: ２丁目　８
  is_banchi_address: false
  address_go: １
  # 外国籍の証人は国籍のみを記入し、is_banchi_legally_domiciled を null にします
  legally_domiciled_first: 東京都新宿区西新宿
  legally_domiciled_second: ２丁目　８
  is_banchi_legally_domiciled: true
```

[Release]: https://github.com/ahandsel/japan-marriage-registration/releases


### テンプレート

`src/template/` に3種類の様式が同梱されています。
既定は `red` です。

| テンプレート  | ファイル                                   | 内容                                                                                             |
| ------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `red`         | `jp-marriage-registration-red.pdf`         | 赤刷りの標準様式。既定で、全項目を調整済みです。                                                 |
| `black`       | `jp-marriage-registration-black.pdf`       | 黒刷りの様式。罫線が細かく、元号のチェックボックスや養父母の行があります。全項目を調整済みです。 |
| `cinnamoroll` | `jp-marriage-registration-cinnamoroll.pdf` | 品川区のシナモロール様式。全項目を調整済みです。                                                 |

様式の切り替え方法は3つあり、次の順で優先されます。

1. **`-t/--template` フラグ** - 最も手軽で、様式ごとの設定ファイルを探すのはこの方法だけです。

   ```bash
   pnpm start --template black        # 黒刷り様式で生成して開く
   pnpm run generate -t cinnamoroll   # 同上（インストールとPDFを開く操作は無し）
   pnpm run generate --list-templates # 同梱されている様式を確認する
   ```

2. **設定ファイルのトップレベルの `template:` キー** - いつも同じ様式を使う場合に指定します。

   ```yaml
   template: black
   ```

3. **既定値の `red`** - どちらも指定しない場合に使われます。

任意のPDFへのパスも指定できますが（`-t ~/Downloads/my-form.pdf`）、独自のPDFは `red` のレイアウトにフォールバックするため、位置の調整は自分で行うことになります（[レイアウト](#レイアウト)を参照）。

様式ごとにpnpmスクリプトが用意されています。
ふだん使うのは1列目の `<様式>:pdf` です。

| 様式          | PDFを生成                  | 専用の設定ファイルを作成      | レイアウトファイルを作成・検証 |
| ------------- | -------------------------- | ----------------------------- | ------------------------------ |
| `red`         | `pnpm run red:pdf`         | `pnpm run red:config`         | `pnpm run red:layout`          |
| `black`       | `pnpm run black:pdf`       | `pnpm run black:config`       | `pnpm run black:layout`        |
| `cinnamoroll` | `pnpm run cinnamoroll:pdf` | `pnpm run cinnamoroll:config` | `pnpm run cinnamoroll:layout`  |

* **`<様式>:pdf`** - その様式で時刻付きの `result-<様式>-<HH-MM-SS>.pdf` を生成します。
  実行するたびに新しいファイルができるため、以前の出力が上書きされることはありません。
  設定ファイルは `config-private-<様式>.yaml` があればそれを使い、無ければ共通の `config-private.yaml` を使います。
* **`<様式>:config`** - その様式専用の `config-private-<様式>.yaml` を作成します。
  すでにある場合は入力済みの内容をそのまま残し、不足しているもの（非公開ファイルのヘッダーコメントと、サンプルの `config.yaml` にあって手元のファイルに無いセクション）だけを追加します。
  様式ごとに別の内容を書きたいときだけ使ってください。
  1つの `config-private.yaml` を使い回す場合は不要です。
* **`<様式>:layout`** - `src/layout/<様式>.yaml` が無ければ作成します。
  同梱の3種類はすべて調整済みのファイルがあるため、実行しても上書きされず、内容の検証だけを行います。

> ⚠️ `<様式>:config` は `config-private.yaml`（無い場合はサンプルの `config.yaml`）をコピーして作られます。
> その際に `template:` キーを書き換え、従来の `*_pos` 項目（`red` 用の座標）は自動で取り除くため、配置はその様式のレイアウトファイルに任されます。

`config.yaml` の `*_pos` 項目は `red` 用の座標です。
`red` 以外の様式では生成プログラムがこれらを警告付きで無視するため配置は崩れませんが、`black` と `cinnamoroll` には様式ごとのサンプル設定（`config-black.yaml` と `config-cinnamoroll.yaml`）が用意されており、`template:` キーで様式を指定し、配置はレイアウトファイルに任せています。

シナモロール様式は宛先が「品川区長殿」と印刷済みで、住所欄に世帯主の氏名の行がありません。
この様式では `notification.to` と `household_person` を空文字 `''` のままにしてください。
また、夫・妻の住所欄と本籍欄には丁目の数字のすぐ後ろに「丁目」が印字済みなので、`address_second` と `legally_domiciled_second` には丁目を書かず、印字の位置に全角スペースを2つ入れてください（「３丁目　４」ではなく「３　　４」）。
そうしないと値の「丁目」が印字の上に重なります。
証人欄は印字の「丁目」の上の行に書くため、証人の値は他の様式と同じ「２丁目　８」の形のままで構いません。

黒刷り様式には対応する設定項目がない印字欄（□昭和□平成の元号チェック、□同右・□同左、養父・養母の行、□未同居・未挙式、届出人署名、事件簿番号の欄）があり、これらは手書き用に空欄のまま出力されます。
証人の住所欄には番地・番・号の印字がないため、証人の `is_banchi_address` は `null` にして、番地と号は `address_second` にまとめてください。


### レイアウト

すべての描画位置は、テンプレートごとのレイアウトファイル `src/layout/red.yaml`、`src/layout/black.yaml`、`src/layout/cinnamoroll.yaml` が持ちます。
`-t/--template` フラグや `template:` キーと同じ名前で選択されます。
各項目は絶対座標です。
`pos: [x, y]` は左下を原点とするテキストのベースライン位置（ポイント単位）、`size` はフォントサイズで、複数行の項目（`address_apartment` と `other.text`）には行間を表す `step` があります。
円は `[x, y, r]`、楕円は対角の2つの角 `[x1, y1, x2, y2]` で表します。
`job_type_checks` は `job_type` の値（1-6）ごとに✓マークの絶対位置を持ちます。

レイアウトファイルを編集せずに位置を調整したいときは、設定ファイルに `layout:` ブロックを追加します。
テンプレートのレイアウトに深いマージ（deep merge）で重なるため、変更したいキーだけを書けば済みます。

```yaml
layout:
  husband:
    last_name: { pos: [225, 592] } # 1項目だけ調整し、他はそのまま
```

従来の `*_pos` キーも、`red` レイアウトの使用時に限り、解決済みレイアウトへの上書きとして引き続き有効です。
`address_first_pos` や `legally_domiciled_first_pos` を動かすと、従来この項目からの相対位置で描画されていた項目（`address_second` や `household_person` など）も同じ量だけ移動するため、既存の設定は以前と同じ見た目のまま出力されます。
`red` 以外の様式では、`*_pos` キーは警告を表示したうえで無視されます。
同じ項目に `layout:` の指定と `*_pos` キーの両方がある場合は `layout:` の指定が優先され、無視した `*_pos` キーの名前を ⚠️ で表示します。
`config.yaml`（つまりそこからコピーした `config-private.yaml`）には氏名・住所・本籍・父母の `*_pos` キーが入っているため、この規則が無いと `layout:` での微調整が何も起こさずに終わってしまいます。
警告を消すには該当の `*_pos` キーを削除してください。


## 使い方 - ローカルで実行する

> [!TIP]
> 個人で使うときは `config-private.yaml` に記入し、ローカルで生成してください。

`config-private.yaml` に情報を記入し、以下を実行します（まだ作成していない場合は、初回実行時にサンプルから自動で作成されます）。

```bash
pnpm start
```

これだけです。
`pnpm start` が `start.sh` を実行し、依存関係をインストールして `result-<template>-<HH-MM-SS>.pdf` を生成し、開きます（時刻付きの名前なので、以前の出力は上書きされません）。
引数なしで実行するとローカル用の `config-private.yaml` が使われます。
`config-private.yaml` を変更したら、そのつど再実行してください。

pnpmはスクリプト名の後ろに書いた引数をそのまま `main.js` に渡すため、[コマンドリファレンス](#コマンドリファレンス)のオプションがここでも使えます。
例外は `--help` で、これは `start.sh` が自身の短いヘルプで応答するため、生成プログラムのオプションは `pnpm run generate --help` で確認してください。

```bash
pnpm start -t cinnamoroll    # 別の様式で生成する
pnpm start -o /tmp/draft.pdf # 出力先を変更する
pnpm start config.yaml       # 設定ファイルを明示的に指定する
```

生成ステップだけを実行したい場合は、[初期セットアップ](#初期セットアップ)で依存関係をインストールしたうえで、以下のスクリプトを使います。
どれも依存関係のインストールとPDFを開く操作は行いません。

```bash
pnpm run init-config     # PDFを生成せずに、サンプルから config-private.yaml を作成する
pnpm run generate        # config-private.yaml から時刻付きのPDFを生成する
pnpm run generate-sample # サンプルの config.yaml から時刻付きのPDFを生成する
pnpm run index           # 様式ごとのものも含め、すべてのpnpmスクリプトを一覧表示する
pnpm run clean           # 一時ファイル（temp*、import.csv、import.md、.DS_Store、.pnpm-store）を確認のうえ削除する
```

pnpmスクリプトは薄いラッパーなので、`./start.sh` や `node src/main.js` を直接実行することもできます。

`pnpm run init-config` は既存の `config-private.yaml` を上書きしないため、何度実行しても安全です。
既存のファイルには不足しているものだけを追加し、すでに入力済みの内容はそのまま残します。

1つめは、非公開・ローカル専用であることを示す以下のヘッダーコメントです（無い場合のみ追加します）。

```yaml
# ローカル実行時のみ使用される非公開の設定ファイルです。
# Private configuration file that is only used for local execution.
```

2つめは、サンプルの `config.yaml` にあって手元のファイルに無いセクションです。
`config-private.yaml` がサンプルからコピーされるのは初回実行の1度だけなので、あるセクションが追加される前に作られたファイルには、そのセクションが後から増えることはありません。
証人欄（`witness1` と `witness2`）がその代表例です。
不足しているセクションは、サンプルの仮の値とコメントを付けたままファイルの末尾に追加されるので、その後にご自身の情報へ書き換えてください。

通常の `pnpm start` の実行がファイルを書き換えることはありません。
セクションが無い場合に以下のような案内を表示するだけです。
セクションを削除することは、その欄を手書き用に空欄のままにする方法でもあるためです。

```text
ℹ️  This config has no witness1, witness2 sections. Those parts of the form stay blank.
   If that is not deliberate, run `pnpm run init-config` to append them from the sample.
```

案内に表示される対処法は、使用中の設定ファイルに合わせて変わります。
共通の `config-private.yaml` なら `pnpm run init-config`、様式専用の `config-private-<様式>.yaml` なら `pnpm run init-config -t <様式>`、パスで指定した設定ファイルなら `config.yaml` から手作業でコピーするよう案内します。


## 使い方 - GitHub Actionsで実行する

CIでPDFをビルドするワークフローが2つあります。

* **`.github/workflows/pr.yml`** - `main` へのプルリクエストのたびに実行され、popplerをインストールして `pnpm test` を実行したあと、PDFをビルドし、ワークフローのアーティファクトとしてアップロードします（実行結果のサマリーページからダウンロードできます）。
* **`.github/workflows/push.yml`** - `main` へのpushのたびに実行され、PDFをビルドし、新しい[Release][]（タイムスタンプのタグ付き）として `marriage_registration.pdf` を添付して公開します。

どちらのワークフローも `node src/main.js config.yaml -o result.pdf` を実行し、commit済みの `config.yaml`（サンプル）を使って固定のファイル名でPDFを生成します（ローカル実行では時刻付きの名前になります）。
つまり基本の流れは、`config.yaml` を編集してcommitし、`main` にpushするだけです。
うまくいけば、生成されたPDFが[Release][]に出来上がります。
シークレットや追加の設定は不要で、ワークフローは組み込みの `GITHUB_TOKEN` を使用します。

> ⚠️ **注意**：`push.yml` は生成したPDFを**公開**のReleaseとして公開します。
> ここで使われるのはcommit済みの `config.yaml` のみです。
> 実際の個人情報を含む婚姻届が必要な場合は、`config-private.yaml` に記入してローカルで生成してください（CIには載せないでください）。


## .github ディレクトリの構成

`.github/` には、GitHubの自動化に関する設定ファイルがまとまっています。
各ファイルの役割は以下のとおりです。

| ファイル                                 | トリガー                                         | 役割                                                                                                                                                                                                                                                |
| ---------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.github/dependabot.yml`                 | 毎週（スケジュール実行）                         | [Dependabot][] の設定。`npm`（pnpmを含む）の依存パッケージと、`github-actions`（ワークフローで固定しているアクションのSHA）を毎週チェックし、更新があればプルリクエストを自動で作成します。                                                         |
| `.github/workflows/pr.yml`               | `main` へのプルリクエスト                        | popplerをインストールして `pnpm test` を実行し、`node src/main.js config.yaml -o result.pdf` でPDFをビルドして、ワークフローのアーティファクト（`marriage_registration`）としてアップロードします。サマリーページから `result.pdf` を取得できます。 |
| `.github/workflows/push.yml`             | `main` へのpush                                  | `node src/main.js config.yaml -o result.pdf` でPDFをビルドし、タイムスタンプをタグにした**公開**の[Release][]を作成して `marriage_registration.pdf` を添付します。                                                                                  |
| `.github/workflows/pr-lint-autofix.yml`  | `main` へのプルリクエスト（作成・更新・再開）    | `pnpm lint`（Prettierとmarkdownlint）を実行し、自動修正した内容をPRブランチへcommit・pushして返します。同一リポジトリ内のPRでのみ動作します。                                                                                                       |
| `.github/PULL_REQUEST_TEMPLATE.md`       | プルリクエストの作成                             | プルリクエスト本文のテンプレート。変更内容、理由、確認方法、リポジトリのルールのチェックリストを記入します。                                                                                                                                        |
| `.github/copilot-instructions.md`        | Copilotのコードレビューと編集                    | `AGENTS.md` を読まないGitHub Copilotのために、`AGENTS.md` のルールを言い直したものです。                                                                                                                                                            |
| `.github/instructions/*.instructions.md` | 変更ファイルが `applyTo` に一致したときのCopilot | 設定ファイル、レイアウトファイル、補助スクリプト、ワークフローに対するCopilot向けのパス限定ルールです。                                                                                                                                             |

いずれのワークフローもNode.js 24とpnpmで動作し、認証には組み込みの `GITHUB_TOKEN` を使用します。
追加のシークレット設定は不要です。

[Dependabot]: https://docs.github.com/code-security/dependabot
