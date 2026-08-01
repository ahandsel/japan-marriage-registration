# GitHub婚姻届

🌐 Languages:

**日本語** | [English](README.en.md)

![header](./public/hero-img-ja.png)

> 婚姻届も継続的インテグレーション・デリバリーしたい！幸せをYAMLで書きたい！ソフトウェアエンジニアと結婚したい！そんな悩みを解決します！


## 目次 <!-- omit in toc -->

* [概要](#概要)
* [初期セットアップ](#初期セットアップ)
* [設定](#設定)
  * [情報](#情報)
* [使い方 - ローカルで実行する](#使い方---ローカルで実行する)
* [使い方 - GitHub Actionsで実行する](#使い方---github-actionsで実行する)


## 概要

このプロジェクトは、1つのYAMLファイルから記入済みの婚姻届をPDFとして生成します。

夫・妻それぞれの情報（氏名・生年月日・住所・本籍・父母の氏名など）をYAMLファイルに記述すると、`src/main.js` がその内容を婚姻届のテンプレートに重ねて `result.pdf` を出力します。設定は2つのファイルに分かれています（詳しくは[設定](#設定)を参照）。ローカルでは自分の情報を書いた `config-private.yaml`（Git管理外）を使い、GitHub Actionsではサンプルの `config-public.yaml` を使います。

PDFの生成方法は2通りあります。

* **ローカルで生成**：ワンコマンドのスクリプト（`./run.sh`）を実行する
* **GitHub Actionsで生成**：pushのたびにCIでPDFをビルドし、リリースとして公開する


## 初期セットアップ

Node.js 20以上が必要です（24で動作確認済み）。パッケージマネージャーは[pnpm](https://pnpm.io/)を推奨します（npmでも動作します）。

```bash
git clone https://github.com/ahandsel/japan-marriage-registration.git
cd japan-marriage-registration
```

ローカル実行用スクリプト（`./run.sh`）が依存関係のインストールを自動で行うため、ローカルで動かすだけなら追加のセットアップは不要です。手動で環境を準備したい場合は以下のとおりです。

```bash
pnpm install # または: npm install
```

依存パッケージ（`package.json`）:

* `pdf-lib` - テンプレートPDFへのテキストのオーバーレイ描画と合成
* `@pdf-lib/fontkit` - 日本語フォント（IPAex明朝）の埋め込み
* `yaml` - 設定ファイル（`config-private.yaml` / `config-public.yaml`）の読み込み


## 設定

設定は2つのYAMLファイルに分かれています。どちらも同じ項目構成です。

| ファイル              | 役割                                                                                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `config-public.yaml`  | リポジトリにcommitされるサンプル。GitHub ActionsのCIで使われ、`config-private.yaml` を作るときのコピー元になります。**プレースホルダーのみを記載し、実際の個人情報は書かないでください。** |
| `config-private.yaml` | 自分の実際の情報を書くローカル用のファイル。`.gitignore` で除外されており、**ローカル実行時のデフォルト**です。                                                                            |

初回はサンプルをコピーして自分用のファイルを作成します。

```bash
cp config-public.yaml config-private.yaml
```

そのうえで `config-private.yaml` に自分の情報を記入します。`*_pos` の各項目は、テンプレート上にテキストを配置する `[x, y]` 座標（ポイント単位）です。文字の位置を微調整したいときはこの値を変更します。

> ⚠️ **プライバシーに関する注意**：`main` にpushすると、GitHub Actionsが生成したPDFを**公開**の[Release](https://github.com/ahandsel/japan-marriage-registration/releases)として公開します。実際の個人情報は `config-private.yaml` にのみ記入し、ローカルで（`./run.sh` で）PDFを生成してください。個人情報を含む設定をcommit・pushしないでください。

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

`wife` のセクションも同様に記入します（`*_pos` の座標は用紙の右側の列に合わせてずらしてあります）。


## 使い方 - ローカルで実行する

`config-private.yaml` に情報を記入し、以下を実行します（まだ作成していない場合は[設定](#設定)を参照してコピーを作成してください）。

```bash
./run.sh
```

これだけです。スクリプトが依存関係をインストールし、`result.pdf` を生成して開きます。引数なしで実行するとローカル用の `config-private.yaml` が使われます。`config-private.yaml` を変更したら、そのつど再実行してください。

生成ステップだけを手動で実行したい場合は、[初期セットアップ](#初期セットアップ)で依存関係をインストールしたうえで、以下を実行します。

```bash
node src/main.js                    # config-private.yaml を使って result.pdf を出力
node src/main.js config-public.yaml # 設定ファイルを明示的に指定することも可能
```


## 使い方 - GitHub Actionsで実行する

CIでPDFをビルドするワークフローが2つあります。

* **`.github/workflows/pr.yml`** - `main` へのプルリクエストのたびに実行され、PDFをビルドし、ワークフローのアーティファクトとしてアップロードします（実行結果のサマリーページからダウンロードできます）。
* **`.github/workflows/push.yml`** - `main` へのpushのたびに実行され、PDFをビルドし、新しい[Release](https://github.com/ahandsel/japan-marriage-registration/releases)（タイムスタンプのタグ付き）として `marriage_registration.pdf` を添付して公開します。

どちらのワークフローも `node src/main.js config-public.yaml` を実行し、commit済みの `config-public.yaml`（サンプル）を使ってPDFを生成します。つまり基本の流れは、`config-public.yaml` を編集してcommitし、`main` にpushするだけです。うまくいけば、生成されたPDFが[Release](https://github.com/ahandsel/japan-marriage-registration/releases)に出来上がります。シークレットや追加の設定は不要で、ワークフローは組み込みの `GITHUB_TOKEN` を使用します。

> ⚠️ **注意**：`push.yml` は生成したPDFを**公開**のReleaseとして公開します。ここで使われるのはcommit済みの `config-public.yaml` のみです。実際の個人情報を含む婚姻届が必要な場合は、`config-private.yaml` に記入してローカルで生成してください（CIには載せないでください）。
