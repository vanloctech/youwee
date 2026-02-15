# Youwee 浏览器扩展（Chromium + Firefox）

使用扩展可将当前页面一键发送到 Youwee，并可选择媒体类型、清晰度和队列行为。

- [English](browser-extension.md)
- [Tiếng Việt](browser-extension.vi.md)

## 核心能力

- **支持站点悬浮按钮**（YouTube、TikTok、Facebook、Instagram、X/Twitter、Vimeo、Twitch、Bilibili、Dailymotion、SoundCloud）
- **任意 HTTP/HTTPS 标签页都可用弹窗发送**
- **媒体类型切换**：`Video` / `Audio`
- **清晰度选择**：
  - 视频：`Best`、`8K`、`4K`、`2K`、`1080p`、`720p`、`480p`、`360p`
  - 音频：`Auto`、`128 kbps`
- **同一入口两种动作**：
  - `Download now`
  - `Add to queue`
- **悬浮按钮控制**：
  - 可折叠为小标签
  - 可完全关闭
  - 可在扩展弹窗中重新开启
- **应用内智能路由**：
  - YouTube 链接 -> `YouTube` 页面
  - 其他链接 -> `Universal` 页面
- **YouTube 链接规范化**：当存在 `v` 参数时自动移除 `list`/`index`，避免误加入整个播放列表
- **队列去重**：链接已存在时聚焦旧条目，不重复新增

## 工作流程

1. 扩展构建 deep link：
   - `youwee://download?v=1&url=...&target=...&action=...&media=...&quality=...&source=...`
2. 浏览器首次会提示是否打开 Youwee。
3. Youwee 接收请求后：
   - 将链接加入队列
   - 仅在空闲时执行 `Download now` 自动开始
   - 忙碌或 `Add to queue` 时仅入队不抢占

## 悬浮按钮支持站点

- `youtube.com`, `youtu.be`, `music.youtube.com`
- `tiktok.com`
- `instagram.com`
- `facebook.com`, `fb.watch`
- `x.com`, `twitter.com`
- `vimeo.com`
- `twitch.tv`, `clips.twitch.tv`
- `bilibili.com`, `b23.tv`
- `dailymotion.com`, `dai.ly`
- `soundcloud.com`

弹窗发送可用于所有有效 HTTP/HTTPS 页面。

## 用户下载包

| 浏览器 | 下载 |
|--------|------|
| **Chromium**（Chrome/Edge/Brave/Opera/Vivaldi/Arc/Coc Coc） | [下载 .zip](https://github.com/vanloctech/youwee/releases/latest/download/Youwee-Extension-Chromium.zip) |
| **Firefox** | [下载 .xpi](https://github.com/vanloctech/youwee/releases/latest/download/Youwee-Extension-Firefox-signed.xpi) |

## 安装说明

### Chromium（Chrome/Edge/Brave/Opera/Vivaldi/Arc/Coc Coc）

1. 解压 `Youwee-Extension-Chromium.zip`。
2. 打开 `chrome://extensions`（或浏览器扩展管理页）。
3. 开启 `Developer mode`。
4. 点击 `Load unpacked`。
5. 选择解压后的文件夹。

### Firefox

1. 下载 `Youwee-Extension-Firefox-signed.xpi`。
2. 将 `.xpi` 拖放到 Firefox（或直接打开该文件）。
3. 确认安装。

## 前置条件

- 需先安装 Youwee 桌面应用。
- 至少启动一次 Youwee，以注册 `youwee://` 协议处理器。

## 故障排查

- **“scheme does not have a registered handler”**
  - 先打开一次 Youwee，再重试扩展。
- **浏览器弹窗很快关闭 / 应用未打开**
  - 检查 Youwee 是否已正确安装并注册协议。
  - 在扩展弹窗中再次点击发送。
- **看不到悬浮按钮**
  - 确认当前站点在支持列表中。
  - 在扩展弹窗中重新开启 `Floating button`。
- **仍无法发送**
  - 用弹窗复制 URL，手动粘贴到 Youwee 以定位问题。

## 开发打包

在仓库根目录执行：

```bash
bun run ext:build
bun run ext:package
```

输出：

- 构建目录：
  - `extensions/youwee-webext/dist/chromium`
  - `extensions/youwee-webext/dist/firefox`
- 打包文件：
  - `extensions/youwee-webext/dist/packages/Youwee-Extension-Chromium.zip`
  - `extensions/youwee-webext/dist/packages/Youwee-Extension-Firefox-unsigned.zip`

已签名 Firefox `.xpi` 由 CI 发布流程生成。
