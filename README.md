# Folia Customization

面向 Android 平板优化的 Folia 定制版：支持酷狗等在线曲库、双语动态歌词、高刷新率歌词动画与实时帧率显示。

> [!IMPORTANT]
> 本项目是 Folia 的非官方 Android 定制分支，与 Folia 上游作者及各音乐平台无隶属关系。
>
> - Android 移植基础：[whycfawa/folia-android](https://github.com/whycfawa/folia-android)
> - 原始项目：[chthollyphile/folia-major](https://github.com/chthollyphile/folia-major)
> - 许可证：[AGPL-3.0](LICENSE)
> - 在线音乐、歌词、封面等内容的版权归对应权利人所有，请通过正规渠道使用音乐服务。

![Folia 播放界面](./img/visualizer.png)

## 功能

| 功能 | 说明 |
| --- | --- |
| Android 原生容器 | 基于 Capacitor 封装为 APK，内置 Cookie、网络请求、后台播放和媒体控制桥接 |
| 在线音乐 | 接入网易云、QQ 音乐、酷狗音乐等来源，支持登录、曲库、歌单、歌词与播放 |
| 双语动态歌词 | 原句作为主歌词，翻译作为次级歌词；经典动画中两行都可跟随时间进度变化 |
| 歌词分词 | 支持默认分词、手动修正与 AI 分词记录，为逐词动画提供更自然的语义边界 |
| 绘光性能优化 | 针对 Android WebView 调整渲染分辨率、场景预热与后台构建节奏，减少换句卡顿 |
| 高刷新率 | Android 平板首次运行默认 120 FPS，设置中可选择 30 / 60 / 90 / 120 FPS 或不限制 |
| 实时帧率 | 播放页右上角显示实时 FPS，便于观察动画表现和设备负载 |
| 开发者悬浮层 | 在开发者设置中直接打开调试悬浮层，查看播放、歌词、日志、内存与渲染状态 |
| 本地音乐 | 支持 Android MediaStore、系统文件选择器、本地歌词与封面匹配 |
| 后台播放 | 前台服务、通知栏和锁屏 MediaSession 控制，离开播放页后仍可继续播放 |

## 技术栈

- 前端：React 19、TypeScript、Vite、Tailwind CSS
- 动画：Framer Motion、PixiJS、Three.js
- Android：Capacitor 8、Java、AndroidX、MediaSession
- 数据：Dexie / IndexedDB、浏览器本地存储
- 测试：Vitest、Playwright
- 构建：Node.js 24、JDK 21、Gradle、Android SDK 36

## 关键实现

### 双语歌词

双语是一种歌词内容模式，而不是单纯的视觉样式。启用后：

1. 原文保留在主歌词轨道，并继续使用逐词时间轴动画。
2. 翻译显示在原文下方，字体、透明度和字号独立处理。
3. 如果翻译带有可用的词级时间信息，翻译也会跟随播放进度动态变化。
4. 没有翻译的歌曲自动回退为单语显示，不制造空白行。

### 高刷与绘光优化

Android 平板的目标帧预算按 120 Hz（约 8.3 ms/帧）设计。绘光模式会限制过高的 WebGL 渲染分辨率，并将场景预建、旧场景释放和片尾卡构建分散到不同帧，降低主线程和 GPU 同帧尖峰。

实时 FPS 只在播放页显示，用滑动时间窗口计算，避免统计本身明显影响渲染性能。

### Android 桥

```text
React / Vite
  → Capacitor Android WebView
  → FoliaNativeBridge
  → FoliaNative Capacitor 插件
  → Android CookieManager / OkHttp / MediaStore / MediaSession
```

更完整的移植说明见 [Android 移植说明](docs/project/android-port.md)。

## 环境要求

| 项目 | 版本 |
| --- | --- |
| Node.js | 24 或更高 |
| JDK | 21 |
| Android SDK | 36 |
| Android 系统 | Android 7.0 或更高（minSdk 24） |

## 构建

安装依赖并执行类型检查：

```powershell
npm ci
npm run typecheck
```

生成 Android 调试 APK：

```powershell
$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-21.0.12.101-hotspot'
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
npm run build:android:debug
```

输出文件：

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

安装到已开启 USB 调试的设备：

```powershell
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

## 使用

1. 安装 APK，打开 Folia。
2. 在设置中登录所需音乐平台。
3. 进入播放页选择歌词动画和背景模式。
4. 双语歌词可在歌词内容模式中启用；原句显示在上，翻译显示在下。
5. 帧率可在可视化设置中选择；实时 FPS 会显示在播放页右上角。
6. 调试悬浮层入口位于“设置 → 开发者设置”。

## 项目结构

```text
android/                         Capacitor Android 工程与原生插件
docs/project/                    项目说明、贡献指南与第三方声明
src/components/visualizer/      歌词动画与背景渲染
src/nativeBridge/               音乐平台和 Android 兼容桥
src/services/                   播放、缓存、歌词与平台服务
src/utils/lyrics/               歌词解析、分词和时间轴工具
test/                            单元、组件和端到端测试
```

## 致谢

- [chthollyphile/folia-major](https://github.com/chthollyphile/folia-major)：Folia 原始项目
- [whycfawa/folia-android](https://github.com/whycfawa/folia-android)：Android 移植基础
- [yearzen1/bilibili-pure-apk](https://github.com/yearzen1/bilibili-pure-apk)：本 README 的信息组织风格参考

项目文档统一收录在 [docs/project](docs/project/README.md)，第三方组件与许可证见其中的[第三方声明](docs/project/third-party-notices.md)。

## 许可证

本项目遵循 [GNU Affero General Public License v3.0](LICENSE)。分发修改版本或通过网络向用户提供服务时，请遵守 AGPL-3.0 的源码公开义务。
