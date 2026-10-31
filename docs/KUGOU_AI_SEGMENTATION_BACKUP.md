# 酷狗“我喜欢”AI 分词备份

此目录记录 2026-10-31 对酷狗“我喜欢”中第 1–300 首歌曲执行的分词任务，供设备恢复和后续增量处理。每 100 首分别保存，互不覆盖。

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

## 恢复到 Android 设备

1. 连接已安装 Folia 的 Android 设备，并让 Folia 保持在前台。
2. 将 WebView DevTools 转发到本机 `9222` 端口。
3. 在仓库根目录执行完整恢复：

   ```powershell
   node scripts\codex-kugou-ai-segmentation.mjs restore-all
   ```

   该命令会恢复 99 首分词、补写酷狗 Hash 大小写兼容记录，并自动执行最终审计。

审计通过时应得到：`done=99`、`noLyrics=1`、`unfinished=0`、`missing=0`、`mismatched=0`、`invalidOutputs=0`。

> 注意：此备份包含完整歌词文本，仓库为公开仓库时任何人均可读取。
