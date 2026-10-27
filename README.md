# 哔哩哔哩 Loon 广告追踪拦截

根据用户提供的手机 B 站 HAR 编写的 Loon 插件，当前版本仅屏蔽抓包中出现的两个 Tanx 广告追踪域名。

**这不是完整的 B 站去广告插件。** 本次抓包没有开屏、首页推荐、播放详情等 JSON 接口响应，无法据此编写或验证这些页面的广告过滤。

## 安装

在 Loon 的「插件」中添加下面的 URL，下载并启用插件，然后使用分流模式：

```text
https://raw.githubusercontent.com/shuzhiweb/loon-ad-bilibili/main/Bilibili-AdBlock.plugin
```

[一键导入 Loon](https://www.nsloon.com/openloon/import?plugin=https%3A%2F%2Fraw.githubusercontent.com%2Fshuzhiweb%2Floon-ad-bilibili%2Fmain%2FBilibili-AdBlock.plugin)

这是插件地址，请添加到「插件」，不要当作节点订阅或完整配置导入。插件不需要 HTTPS 解密、证书或脚本。启用后退出并重新打开 B 站，可在 Loon 请求日志中查看规则命中情况。禁用或删除插件即可恢复。

Loon 的本地规则可能优先于插件规则；如果没有命中，请检查是否存在优先匹配的放行规则，以及是否处于分流模式。

## 拦截范围

| 精确域名 | 本次观察到的路径 | 返回类型 | 处理 |
| --- | --- | --- | --- |
| `df.tanx.com` | `/spf3` | `image/gif` | `REJECT` |
| `ef-dongfeng.tanx.com` | `/tanx` | `image/gif` | `REJECT` |

两个请求符合广告追踪像素的特征。插件对这两个主机的所有连接生效，包含 HTTP 和 HTTPS，并非只限制表格中的路径；其他 App 访问相同主机也会被拦截。阻断追踪请求不等于移除广告素材，也无法据此保证可见广告消失。

插件不匹配 `*.bilivideo.com`、视频 CDN IP、`httpdns.bilivideo.com` 或 B 站业务接口，以避免把直播播放列表和视频分片当成广告。

## 本地验证

需要 Python 3，无第三方依赖：

```sh
python3 tools/validate.py
python3 tools/validate.py --har /path/to/capture.har
```

验证器检查插件语法及精确域名匹配，并离线回放 HAR 请求 URL；它不会请求原网址，也不会打印查询参数、请求头、Cookie、响应体或用户标识。

初始版本在用户提供的 74 条 HAR 记录上匹配 2 条追踪请求，剩余 72 条（62 条视频/直播媒体请求及 10 条 HTTPDNS 请求）均未被插件匹配。此结果是离线规则验证，不是手机安装验收，不代表所有场景或版本均有效。

## 后续补全开屏和信息流过滤

需要另外采集真正的 App API 响应：

1. 在抓包工具里对相应 B 站 API 主机开启 HTTPS 解密，并在 iOS 安装、信任证书。仅开启 VPN 抓包不足以获得 HTTPS JSON。
2. 从完全关闭 App 的状态开始抓包，再依次启动 App、刷新首页、进入视频详情和直播间；记录看到广告的页面与时间。
3. 检查 HAR 内是否包含这些页面对应的 API 请求及可读 JSON 响应。注意 gRPC/Protobuf 接口不能按 JSON 直接修改。
4. 脱敏后提供文件继续分析。不要直接把 HAR、Cookie、访问令牌或个人数据提交到公开仓库。

后续响应脚本应按实际接口、版本和响应结构开发，并验证普通内容、登录和播放不受影响；不对未知结构泛删 `ad` 字段。

## 参考

- [Loon 插件格式与策略](https://github.com/Loon0x00/LoonManual/blob/master/docs/cn/plugin.md)
- [Loon 规则与优先级](https://github.com/Loon0x00/LoonManual/blob/master/docs/cn/rule.md)
- [Loon 导入链接](https://github.com/Loon0x00/LoonManual/blob/master/docs/cn/scheme.md)
