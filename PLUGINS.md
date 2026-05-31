# Youwee Plugins

<div align="center">

  [![English](https://img.shields.io/badge/lang-English-blue)](PLUGINS.md)
  [![Tiếng Việt](https://img.shields.io/badge/lang-Tiếng_Việt-red)](docs/PLUGINS.vi.md)
  [![简体中文](https://img.shields.io/badge/lang-简体中文-green)](docs/PLUGINS.zh-CN.md)

</div>

Youwee supports signed `.ywp` plugins for post-download workflows. Plugins can react to download events, ask for explicit permissions, expose typed configuration fields, and run custom actions such as notifications, uploads, or third-party integrations.

Plugins can also provide localized guides, typed configuration fields, requested permissions, and trigger-based workflow steps inside the app.

## Supported Plugins

| Plugin | What it does | Trigger | Permissions | Links |
| --- | --- | --- | --- | --- |
| **Notification Webhooks** | Sends download notifications to Telegram or Discord when a download completes or fails. | `download.completed`, `download.failed` | Network access | [Repository](https://github.com/vanloctech/youwee-plugin-notification-webhooks) · [Latest release](https://github.com/vanloctech/youwee-plugin-notification-webhooks/releases/latest) |
| **Google Drive Upload** | Uploads completed download files to a configured Google Drive folder. | `download.completed` | Network access, read access to the completed file from the trigger payload | [Repository](https://github.com/vanloctech/youwee-plugin-gg-drive-upload) · [Latest release](https://github.com/vanloctech/youwee-plugin-gg-drive-upload/releases/latest) |

## Install A Plugin

1. Open the plugin repository or its latest release page.
2. Download the signed `.ywp` package and its checksum if provided.
3. In Youwee, open **Settings** -> **Plugins**.
4. Import the `.ywp` package.
5. Review the requested permissions and configuration fields before enabling it in a workflow.

## Build Your Own

Developers can create a plugin workspace from Youwee, attach it for live debugging, then build and sign a final package with `youwee-sdk`.

- SDK guide: [sdk-js/README.md](sdk-js/README.md)
- SDK package: [youwee-sdk](https://www.npmjs.com/package/youwee-sdk)
