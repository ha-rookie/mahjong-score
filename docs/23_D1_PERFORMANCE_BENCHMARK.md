# D1 Long-term Performance Benchmark

## Purpose

Issue #137のRC性能確認として、Production DBを水増しせずCloudflare Preview D1に専用fixtureを一時投入し、長期利用相当のDB性能Evidenceを取得する。

## Load model

- 5年相当: 260 Session / 3,120 Game / 9,360 GameResult
- 10年相当: 520 Session / 6,240 Game / 18,720 GameResult
- 1 Session = 12半荘
- 各Sessionは3人分のGameResult、chip、participant noteを保持
- 4人のGroup PlayerからSessionごとに3人をローテーションしてfixtureを生成する

## Benchmarks

各datasetについて3回ずつ計測する。

- monthly-history: 月別Session一覧 + participant note + chip
- performance-all: 通算成績
- performance-year: 年間成績
- performance-month: 月間成績
- session-games-12: 12半荘のGame / Result / Tag参照

## Measurement

`npm run db:performance:preview` を実行する。

記録する値:

- D1 `meta.duration` の平均/最大
- Wrangler CLI wall timeの平均/最大
- rows read
- fixture load wall time
- benchmark dataset件数

D1 server durationとCLI wall timeは分離する。CLI wall timeにはWrangler process startupとnetwork overheadが含まれるため、User-facing latencyの判定値には直接使用しない。

## Safety

- Preview D1のみを使用する
- Preview / Production D1 IDが一致した場合は実行拒否
- fixture IDは `perf5-` / `perf10-` prefixと専用Group IDを使用
- benchmark開始前に前回fixtureをcleanup
- benchmark成功/失敗にかかわらず`finally`でfixtureをcleanup
- Production DBにはfixtureを書き込まない

## Pass criteria

DB側一次判定:

- 各benchmark invocationのD1 server duration最大1,000ms以下
- timeout / SQL errorなし
- 5年/10年双方で全benchmark成功

User-facing目標:

- 通常1秒以内を目標
- 2秒を超える表示待ちが継続的に発生しない

User-facing目標はDB benchmark合格後、Productionの通常データを使ったスマホ実機Smokeで確認する。

## GitHub Actions evidence

`.github/workflows/d1-performance-benchmark.yml` を使用する。

- Pull Requestでbenchmark関連ファイル変更時に実行
- `workflow_dispatch`で再計測可能
- Markdown / JSON reportをActions artifactへ30日保存
- Markdown reportをGitHub Step Summaryへ出力

Issue #137に実測結果とWorkflow Runを記録する。
