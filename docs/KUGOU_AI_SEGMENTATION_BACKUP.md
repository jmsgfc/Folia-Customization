# 酷狗“我喜欢”AI 分词备份

此目录记录 2026-10-31 对酷狗“我喜欢”中最新 100 首歌曲执行的 AI 分词任务，供个人设备恢复和后续增量处理。

## 处理结果

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
