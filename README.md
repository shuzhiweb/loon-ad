# 哔哩哔哩 Loon 开屏与广告追踪过滤

本仓库也包含独立的 [X（推特）去广告插件及安装说明](docs/Twitter.md)，文件名为 `Twitter-AdBlock.plugin`。以下内容是 B 站插件说明。

根据用户提供的手机 B 站 HAR 编写的 Loon 插件：移除 B 站开屏接口响应中的广告字段，并屏蔽抓包中出现的两个 Tanx 广告追踪域名。

**这不是完整的 B 站去广告插件。** 本次 HAR 没有开屏、首页推荐、播放详情等 JSON 接口响应。开屏过滤根据开源项目记录的已知响应字段实现，并非在这份 HAR 上验证；首页推荐及视频内广告仍未处理。

## 安装

在 Loon 的「插件」中添加下面的 URL，下载并启用插件，然后使用分流模式：

```text
https://raw.githubusercontent.com/shuzhiweb/loon-ad-bilibili/main/Bilibili-AdBlock.plugin
```

[一键导入 Loon](https://www.nsloon.com/openloon/import?plugin=https%3A%2F%2Fraw.githubusercontent.com%2Fshuzhiweb%2Floon-ad-bilibili%2Fmain%2FBilibili-AdBlock.plugin)

这是插件地址，请添加到「插件」，不要当作节点订阅或完整配置导入。开屏过滤需要在 Loon 的 MITM 设置中**开启 HTTPS 解密、安装证书**，并在 iOS「设置 > 通用 > 关于本机 > 证书信任设置」中信任该证书。插件会为三个 App API 主机声明 MITM，不需要替换你的完整配置。完全退出并重新打开 B 站后，可在 Loon 请求日志中检查脚本是否执行。禁用或删除插件即可恢复。

已安装旧版时，在 Loon 中更新此插件并更新脚本资源；检查名称已变成「哔哩哔哩去广告（开屏与追踪）」，且包含「哔哩哔哩开屏去广告」脚本。客户端已缓存的开屏素材可能不会立即消失；请保持规则启用并重新启动 App 后再检查开屏接口是否命中。

Loon 的本地规则可能优先于插件规则；如果没有命中，请检查是否存在优先匹配的放行规则，以及是否处于分流模式。

## 拦截范围

| 精确域名 | 本次观察到的路径 | 返回类型 | 处理 |
| --- | --- | --- | --- |
| `df.tanx.com` | `/spf3` | `image/gif` | `REJECT` |
| `ef-dongfeng.tanx.com` | `/tanx` | `image/gif` | `REJECT` |

两个请求符合广告追踪像素的特征。插件对这两个主机的所有连接生效，包含 HTTP 和 HTTPS，并非只限制表格中的路径；其他 App 访问相同主机也会被拦截。阻断追踪请求不等于移除广告素材，也无法据此保证可见广告消失。

域名拦截规则不匹配 `*.bilivideo.com`、视频 CDN IP、`httpdns.bilivideo.com` 或 B 站业务 API 主机，以避免把直播播放列表和视频分片当成广告。开屏过滤另由下述响应脚本处理。

## 开屏处理

响应脚本只匹配三个 App API 主机的四个已知开屏路径：`/x/v2/splash/show`、`/x/v2/splash/list`、`/x/v2/splash/brand/list`、`/x/v2/splash/event/list2`。遇到成功的 JSON 响应时，只删除 `data.account`、`data.event_list`、`data.preload`、`data.show`，保留其余响应字段。错误状态、非 JSON、解析失败或未知数据结构均原样放行。

B 站可能随版本调整接口。开启 MITM 并确认脚本执行后若开屏广告仍出现，需要新的开屏接口与脱敏响应才能继续适配。

## 本地验证

需要 Python 3 和 Node.js，无第三方依赖：

```sh
python3 tools/validate.py
python3 tools/validate.py --har /path/to/capture.har
node tools/test-splash.js
```

验证器检查插件语法及精确域名匹配，并离线回放 HAR 请求 URL；它不会请求原网址，也不会打印查询参数、请求头、Cookie、响应体或用户标识。

用户提供的 74 条 HAR 记录中，追踪规则命中 2 条请求，其余 72 条（62 条媒体请求和 10 条 HTTPDNS 请求）均未被匹配。该结果只验证追踪域名规则；开屏响应脚本通过模拟响应测试，不是手机安装验收，不代表所有版本或网络环境均有效。

## 排查开屏仍出现与补全信息流过滤

需要另外采集真正的 App API 响应：

1. 在抓包工具里对相应 B 站 API 主机开启 HTTPS 解密，并在 iOS 安装、信任证书。仅开启 VPN 抓包不足以获得 HTTPS JSON。
2. 从完全关闭 App 的状态开始抓包，再依次启动 App、刷新首页、进入视频详情和直播间；记录看到广告的页面与时间。
3. 检查 HAR 内是否包含这些页面对应的 API 请求及可读 JSON 响应。注意 gRPC/Protobuf 接口不能按 JSON 直接修改。
4. 脱敏后提供文件继续分析。不要直接把 HAR、Cookie、访问令牌或个人数据提交到公开仓库。

后续响应脚本应按实际接口、版本和响应结构开发，并验证普通内容、登录和播放不受影响；不对未知结构泛删 `ad` 字段。

## 参考

- [Biliverse ADBlock 开屏接口与字段](https://github.com/BiliUniverse/ADBlock/blob/b0051916843f269d4b377aaf177f0d9e7b12e393/src/process/Response.mjs#L90)：用于确认接口与响应字段；此插件使用独立的最小脚本，不引入其代理转发服务。
- [Loon 插件格式与策略](https://github.com/Loon0x00/LoonManual/blob/master/docs/cn/plugin.md)
- [Loon 响应脚本](https://github.com/Loon0x00/LoonManual/blob/master/docs/cn/script.md)
- [Loon 规则与优先级](https://github.com/Loon0x00/LoonManual/blob/master/docs/cn/rule.md)
- [Loon 导入链接](https://github.com/Loon0x00/LoonManual/blob/master/docs/cn/scheme.md)
