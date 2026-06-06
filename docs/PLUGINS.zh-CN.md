# Youwee 插件

<div align="center">

  [![English](https://img.shields.io/badge/lang-English-blue)](../PLUGINS.md)
  [![Tiếng Việt](https://img.shields.io/badge/lang-Tiếng_Việt-red)](PLUGINS.vi.md)
  [![简体中文](https://img.shields.io/badge/lang-简体中文-green)](PLUGINS.zh-CN.md)

</div>

Youwee 支持已签名的 `.ywp` 插件，用于下载后的工作流。插件可以响应下载事件、请求明确权限、提供强类型配置字段，并执行通知、上传或第三方集成等自定义动作。

插件也可以在应用内提供多语言说明、强类型配置字段、可审批权限，以及基于触发器的工作流步骤。

## 支持的插件

| 插件 | 功能 | 触发器 | 权限 | 链接 |
| --- | --- | --- | --- | --- |
| **Notification Webhooks** | 当下载完成或失败时，将下载通知发送到 Telegram 或 Discord。 | `download.completed`, `download.failed` | 网络访问 | [仓库](https://github.com/vanloctech/youwee-plugin-notification-webhooks) · [最新版本](https://github.com/vanloctech/youwee-plugin-notification-webhooks/releases/latest) |
| **Google Drive Upload** | 将已完成的下载文件上传到配置好的 Google Drive 文件夹。 | `download.completed` | 网络访问，读取触发器 payload 中的已下载文件 | [仓库](https://github.com/vanloctech/youwee-plugin-gg-drive-upload) · [最新版本](https://github.com/vanloctech/youwee-plugin-gg-drive-upload/releases/latest) |

## 安装插件

1. 打开插件仓库或最新版本页面。
2. 下载已签名的 `.ywp` 包，以及可用的 checksum。
3. 在 Youwee 中打开 **Settings** -> **Plugins**。
4. 导入 `.ywp` 包。
5. 在工作流中启用前，检查请求的权限和配置字段。

## 构建自己的插件

开发者可以从 Youwee 创建插件 workspace，附加到应用进行实时调试，然后使用 `youwee-sdk` 构建并签名最终包。

- SDK 文档：[sdk-js/README.md](../sdk-js/README.md)
- SDK 包：[youwee-sdk](https://www.npmjs.com/package/youwee-sdk)
