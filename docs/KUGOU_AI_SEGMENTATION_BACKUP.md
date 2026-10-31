# 酷狗“我喜欢”AI 分词备份

此目录记录 2026-10-31 对酷狗“我喜欢”中第 1–900 首唯一歌曲执行的分词任务，供设备恢复和后续增量处理。每 100 首分别保存，互不覆盖。

## 首批：第 1–100 首

- 目标：100 首
- 已完成并写回 Folia：99 首
- 无歌词终态：1 首（《LOVE SCENARIO (DJ版)》）
- 已处理歌词：5,358 行
- 分词片段：23,164 个
- 未完成、缺失、内容错配：0

## 文件位置

- `.codex-tasks/kugou-ai-segmentation/manifest.json`：固定歌曲清单和处理状态。
- `.codex-tasks/kugou-ai-segmentation/batches/`：20 个输入批次及 99 个逐曲分词输出。
- `.codex-tasks/kugou-ai-segmentation/lrc/`：由输入批次导出的 99 个标准 LRC 歌词文件，共 5,358 行，时间戳精确到毫秒。
- `scripts/codex-kugou-ai-segmentation.mjs`：获取、校验、写回和审计工具。
- `task_plan.md`、`findings.md`、`progress.md`：任务计划、技术发现和执行记录。

标准 LRC 只保存逐行歌词和时间轴，不定义 AI 分词字段；AI 分词边界仍以 `batches/*-output-part-*.json` 为准。需要重新生成 LRC 时执行：

```powershell
node scripts\codex-kugou-ai-segmentation.mjs export-lrc
```

## 续批：第 101–200 首

此批以首批第 100 首《我们的明天 (Live)》为锚点；重新读取收藏时总数仍为 915，锚点仍在第 100 位，前 100 首顺序未变。

- 目标：100 首；已写回 Folia 并读回验证：97 首。
- 无可用歌词：3 首（第 162 首《当你的天空突然下起了大雨 (Remix)》、第 163 首《循环重演》、第 186 首《炽热的爱意 (History)》）。
- 原始歌词与分词：各 5,450 行；分词片段：24,085 个。
- 标准 LRC：97 个，5,450 行，毫秒级时间戳。
- 设备审计：未完成、缺失、内容错配、无效输出及大小写别名问题均为 0。

续批文件在 `.codex-tasks/kugou-ai-segmentation/continuation-101-200/`：`manifest.json` 是固定清单，`batches/` 保存 20 个输入批次和 97 个逐曲分词输出，`lrc/` 保存对应歌词文件。LRC 导出时规范化了行尾空白；输入与分词 JSON 保留原文。恢复续批时在仓库根目录执行：

```powershell
node scripts\codex-kugou-ai-segmentation.mjs restore-all --root .codex-tasks\kugou-ai-segmentation\continuation-101-200
```

审计通过时应得到：`done=97`、`noLyrics=3`、`unfinished=0`、`missing=0`、`mismatched=0`、`invalidOutputs=0`、`missingAliases=0`、`mismatchedAliases=0`。

## 续批：第 201–300 首

此批以第 200 首《年少的你啊》为锚点；重新读取收藏时总数仍为 915，锚点仍在第 200 位，已保存的前 200 首顺序未变。

- 目标：100 首；已写回 Folia 并读回验证：99 首。
- 无可用歌词：1 首（第 297 首《星の消えた夜に_-rit._ver.-_-》）。
- 原始歌词与分词：各 5,853 行；分词片段：25,901 个。
- 标准 LRC：99 个，5,853 行，毫秒级时间戳并保留原文空白。
- 设备审计：未完成、缺失、内容错配、无效输出及大小写别名问题均为 0。
- 质量复核：跨歌曲相同文本的分词边界冲突为 0；中、英、日、韩、粤语样本均已复核。

文件位于 `.codex-tasks/kugou-ai-segmentation/continuation-201-300/`。恢复这一批时执行：

```powershell
node scripts\codex-kugou-ai-segmentation.mjs restore-all --root .codex-tasks\kugou-ai-segmentation\continuation-201-300
```

审计通过时应得到：`done=99`、`noLyrics=1`、`unfinished=0`、`missing=0`、`mismatched=0`、`invalidOutputs=0`、`missingAliases=0`、`mismatchedAliases=0`。

## 续批：第 501–600 首

此批以第 500 首《循迹》为锚点；重新读取收藏时总数仍为 915，锚点仍在第 500 位，已保存的前 500 首顺序未变。

- 目标：100 首；已写回 Folia 并读回验证：99 首。
- 无可用歌词：1 首（第 583 首《求佛 (cover: 电音任瑶)》）。
- 原始歌词与分词：各 4,694 行；分词片段：21,959 个。
- 标准 LRC：99 个、4,694 行，毫秒级时间戳并保留原文空白。
- 设备审计：未完成、缺失、内容错配、无效输出及大小写别名问题均为 0。
- 质量复核：跨歌曲相同文本的分词边界冲突为 0；中文、日语、韩语与英文样本均经独立复核并通过最终回归。

文件位于 `.codex-tasks/kugou-ai-segmentation/continuation-501-600/`。恢复这一批时执行：

```powershell
node scripts\codex-kugou-ai-segmentation.mjs restore-all --root .codex-tasks\kugou-ai-segmentation\continuation-501-600
```

审计通过时应得到：`done=99`、`noLyrics=1`、`unfinished=0`、`missing=0`、`mismatched=0`、`invalidOutputs=0`、`missingAliases=0`、`mismatchedAliases=0`。

## 续批：第 601–700 首

此批以第 600 首《Ferrari》为锚点；重新读取收藏时总数仍为 915，锚点仍在第 600 位，已保存的前 600 首顺序未变。

- 目标：100 首；已写回 Folia 并读回验证：98 首。
- 无可用歌词：2 首（第 613 首《起风了 (口琴)》、第 658 首《你不是真正的快乐 (升调版伴奏)》）。
- 原始歌词与分词：各 4,581 行；分词片段：21,182 个。
- 标准 LRC：98 个、4,581 行，毫秒级时间戳并保留原文空白；最长文件名 99 个字符。
- 设备审计：未完成、缺失、内容错配、无效输出及大小写别名问题均为 0。
- 质量复核：2,586 种不同歌词文本的分词边界一致；中文固定词及专名、英文省略形式、日语活用和韩语样本均经独立逐行复核，最终结果为 PASS。

文件位于 `.codex-tasks/kugou-ai-segmentation/continuation-601-700/`。恢复这一批时执行：

```powershell
node scripts\codex-kugou-ai-segmentation.mjs restore-all --root .codex-tasks\kugou-ai-segmentation\continuation-601-700
```

审计通过时应得到：`done=98`、`noLyrics=2`、`unfinished=0`、`missing=0`、`mismatched=0`、`invalidOutputs=0`、`missingAliases=0`、`mismatchedAliases=0`。

## 续批：第 701–800 首

此批以第 700 首《葬花》为锚点；重新读取收藏时总数仍为 915，锚点仍在第 700 位，已保存的前 700 首顺序未变。

- 目标：100 首；全部写回 Folia 并读回验证，无歌词终态为 0。
- 原始歌词与分词：各 4,804 行；分词片段：21,466 个。
- 标准 LRC：100 个、4,804 行，毫秒级时间戳并保留原文空白；最长文件名 100 个字符。
- 设备审计：未完成、缺失、内容错配、无效输出及大小写别名问题均为 0。
- 质量复核：2,854 种不同歌词文本的分词边界一致；中文、粤语、英文、日语与梵语音译样本均经独立逐行复核，最终结果为 PASS。

文件位于 `.codex-tasks/kugou-ai-segmentation/continuation-701-800/`。恢复这一批时执行：

```powershell
node scripts\codex-kugou-ai-segmentation.mjs restore-all --root .codex-tasks\kugou-ai-segmentation\continuation-701-800
```

审计通过时应得到：`done=100`、`noLyrics=0`、`unfinished=0`、`missing=0`、`mismatched=0`、`invalidOutputs=0`、`missingAliases=0`、`mismatchedAliases=0`。

## 续批：第 801–900 首

此批以第 800 首《起风了 (旧版)》为锚点。实时收藏有 915 条记录、914 首唯一歌曲；《花好月圆夜》在原始第 795 和 854 位重复，任务按 song ID 稳定去重并保留较新的第 795 位。去重后前 800 首顺序未变。

- 目标：100 首；已写回 Folia 并读回验证：99 首。
- 无可用歌词：1 首（第 858 首《王者战歌》）。
- 原始歌词与分词：各 4,157 行；分词片段：19,382 个。
- 标准 LRC：99 个、4,157 行，毫秒级时间戳并保留原文空白；最长文件名 90 个字符。
- 设备审计：未完成、缺失、内容错配、无效输出及大小写别名问题均为 0。
- 质量复核：2,406 种不同歌词文本的分词边界一致；中文、古文、粤语、英文、日语和韩语样本均经独立逐行复核，最终结果为 PASS。

文件位于 `.codex-tasks/kugou-ai-segmentation/continuation-801-900/`。恢复这一批时执行：

```powershell
node scripts\codex-kugou-ai-segmentation.mjs restore-all --root .codex-tasks\kugou-ai-segmentation\continuation-801-900
```

审计通过时应得到：`done=99`、`noLyrics=1`、`unfinished=0`、`missing=0`、`mismatched=0`、`invalidOutputs=0`、`missingAliases=0`、`mismatchedAliases=0`。

## 续批：第 301–400 首

此批以第 300 首《戒不掉+春娇与志明 (DJ版)》为锚点；重新读取收藏时总数仍为 915，锚点仍在第 300 位，已保存的前 300 首顺序未变。

- 目标：100 首；全部写回 Folia 并读回验证，无歌词终态为 0。
- 原始歌词与分词：各 5,056 行；分词片段：23,794 个。
- 标准 LRC：100 个、5,056 行，毫秒级时间戳并保留原文空白。
- 第 365 首《他不懂 (Live)》的上游制作信息有一处 73 毫秒倒序；输入与分词 JSON 保留原始行序，LRC 导出时按时间戳稳定排序。
- 设备审计：未完成、缺失、内容错配、无效输出及大小写别名问题均为 0。
- 质量复核：跨歌曲相同文本的分词边界冲突为 0；独立审查发现的问题均已修复并通过最终回归。

文件位于 `.codex-tasks/kugou-ai-segmentation/continuation-301-400/`。恢复这一批时执行：

```powershell
node scripts\codex-kugou-ai-segmentation.mjs restore-all --root .codex-tasks\kugou-ai-segmentation\continuation-301-400
```

审计通过时应得到：`done=100`、`noLyrics=0`、`unfinished=0`、`missing=0`、`mismatched=0`、`invalidOutputs=0`、`missingAliases=0`、`mismatchedAliases=0`。

## 续批：第 401–500 首

此批以第 400 首《浪漫血液》为锚点；重新读取收藏时总数仍为 915，锚点仍在第 400 位，已保存的前 400 首顺序未变。

- 目标：100 首；已写回 Folia 并读回验证：99 首。
- 无可用歌词：1 首（第 425 首《Luffys Fierce Attack! - Drums Of Liberation Version》）。
- 原始歌词与分词：各 4,476 行；分词片段：21,174 个。
- 标准 LRC：99 个、4,476 行，毫秒级时间戳并保留原文空白。
- 设备审计：未完成、缺失、内容错配、无效输出及大小写别名问题均为 0。
- 质量复核：跨歌曲相同文本的分词边界冲突为 0；中文、粤语、日语、韩语与英文样本均经独立复核并通过最终回归。

文件位于 `.codex-tasks/kugou-ai-segmentation/continuation-401-500/`。恢复这一批时执行：

```powershell
node scripts\codex-kugou-ai-segmentation.mjs restore-all --root .codex-tasks\kugou-ai-segmentation\continuation-401-500
```

审计通过时应得到：`done=99`、`noLyrics=1`、`unfinished=0`、`missing=0`、`mismatched=0`、`invalidOutputs=0`、`missingAliases=0`、`mismatchedAliases=0`。

## 恢复到 Android 设备

1. 连接已安装 Folia 的 Android 设备，并让 Folia 保持在前台。
2. 将 WebView DevTools 转发到本机 `9222` 端口。
3. 在仓库根目录按批次执行恢复：

   ```powershell
   node scripts\codex-kugou-ai-segmentation.mjs restore-all
   node scripts\codex-kugou-ai-segmentation.mjs restore-all --root .codex-tasks\kugou-ai-segmentation\continuation-101-200
   node scripts\codex-kugou-ai-segmentation.mjs restore-all --root .codex-tasks\kugou-ai-segmentation\continuation-201-300
   node scripts\codex-kugou-ai-segmentation.mjs restore-all --root .codex-tasks\kugou-ai-segmentation\continuation-301-400
   node scripts\codex-kugou-ai-segmentation.mjs restore-all --root .codex-tasks\kugou-ai-segmentation\continuation-401-500
   node scripts\codex-kugou-ai-segmentation.mjs restore-all --root .codex-tasks\kugou-ai-segmentation\continuation-501-600
   node scripts\codex-kugou-ai-segmentation.mjs restore-all --root .codex-tasks\kugou-ai-segmentation\continuation-601-700
   node scripts\codex-kugou-ai-segmentation.mjs restore-all --root .codex-tasks\kugou-ai-segmentation\continuation-701-800
   node scripts\codex-kugou-ai-segmentation.mjs restore-all --root .codex-tasks\kugou-ai-segmentation\continuation-801-900
   ```

   每条命令都会恢复对应批次、补写酷狗 Hash 大小写兼容记录，并自动执行最终审计。

九批共覆盖前 900 首唯一歌曲：890 首已写入分词，10 首为无歌词终态。

> 注意：此备份包含完整歌词文本，仓库为公开仓库时任何人均可读取。
