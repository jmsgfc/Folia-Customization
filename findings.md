# AI 分词任务发现

- 2026-10-31：设备已连接，Folia WebView 可通过本地 CDP 读取。
- 酷狗“我喜欢”当前共 915 首。
- 原生桥返回的列表在 provider 中会整体 `reverse()` 后作为客户端顺序；任务清单必须复用该方向。
- 设备现有缓存：53 首歌词，0 首持久化 AI 分词。
- 分词存储键：`lyricSeg_${songKey}`，表：`KineticPlayerDB.api_cache`。
- 记录格式：`{version:1,songKey,updatedAt,source:'ai',lines}`；行键为 `startMs|fullText`。
- 当前模型分词硬约束：每行分段拼接后必须与原文逐字符一致。
- 最新 100 首第 1 首为《空城 (R&B氛围版)》，第 100 首为《我们的明天 (Live)》；方向与 provider 的客户端逆序逻辑一致。
- 第 1 批 5 首共 303 行，按歌曲逐首处理更适合上下文和校验。
- Android WebView 退到后台时会暂停 IndexedDB 事务；写回前需让 Folia 保持前台，账本必须以读回成功为准。
- 酷狗同一 hash 在不同播放入口可能出现大小写差异；已为 99 首完成歌曲写入大小写别名，确保收藏、搜索和历史恢复入口都可命中。
