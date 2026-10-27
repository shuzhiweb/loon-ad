# X（推特）Loon 插件

本仓库提供两个独立用途的插件。根据新 HAR 的结果，默认插件已改成免解密的追踪拦截；实验性信息流脚本单独保留。两者不要同时启用。

## 原生 App：免解密广告追踪拦截

```text
https://raw.githubusercontent.com/shuzhiweb/loon-ad/main/Twitter-AdBlock.plugin
```

[导入免解密插件](https://www.nsloon.com/openloon/import?plugin=https%3A%2F%2Fraw.githubusercontent.com%2Fshuzhiweb%2Floon-ad%2Fmain%2FTwitter-AdBlock.plugin)

此插件只有一条 `DOMAIN,ads-api.twitter.com,REJECT` 域名规则，不包含 MITM、复写或脚本，使用分流模式即可。旧 HAR 在该主机观察到两条 `/12/measurement/dcm_local_id` 广告测量请求。为了在不解密 HTTPS 的情况下拦截，规则匹配整个精确主机，而非只匹配这个 URL 路径；该主机的其他 API 同样会被拦截。

**它只拦广告测量，不会删除首页推广卡片，也不等于视频去广告。** 新 HAR 没有出现这个主机，因此新日志上命中数为零。

已安装旧版本时，请在 Loon 更新 `Twitter-AdBlock.plugin`，确认名称为「X（推特）广告追踪拦截（免解密）」，且内容中没有 `[MITM]` 或 `[Script]`。如曾手动把 `api.twitter.com`、`api.x.com`、`twitter.com`、`x.com` 添加到全局 MITM 主机列表，更新插件不会自动移除这些手工项，请检查是否仍对 X App 进行解密。不必为这个插件关闭 B 站等其他插件正常需要的 MITM。

## 可解密连接：实验性信息流过滤

```text
https://raw.githubusercontent.com/shuzhiweb/loon-ad/main/Twitter-Web-AdBlock.plugin
```

[导入实验性插件](https://www.nsloon.com/openloon/import?plugin=https%3A%2F%2Fraw.githubusercontent.com%2Fshuzhiweb%2Floon-ad%2Fmain%2FTwitter-Web-AdBlock.plugin)

此插件保留此前的 GraphQL 响应过滤逻辑，必须开启 Loon 的 MITM / HTTPS 解密并安装、信任证书。用于可解密的连接；原生 App 的支持未验证。若对某个主机开启解密后 App 连接失败，不要继续对该连接强制解密。浏览器网页和原生客户端可能使用不同数据结构。

脚本匹配 `HomeTimeline`、`HomeLatestTimeline`、`TweetDetail`、`SearchTimeline`、`UserTweets`、`UserTweetsAndReplies`、`UserMedia`、`ListLatestTweetsTimeline` 八种操作。URL 兼容 `/graphql/查询ID/操作名` 与 `/i/api/graphql/查询ID/操作名`，查询 ID 不写死。

只检查已知信息流容器中的条目自身推广标记：`promotedMetadata` / `promoted_metadata` 对象，或 `promoted-tweet-`、`promoted-user-`、`promoted-trend-` 标识。混合模块只移除推广子项，保留普通内容、引用、游标与终止指令。错误状态、非 JSON、GraphQL 错误、未知结构和解析失败原样放行，没有移除时保留原始响应字节。

该插件的 URL 复写会精确拦截旧 HAR 中的广告测量路径。关闭 MITM 后，HTTPS 路径复写和响应脚本无法依此工作；这也是默认插件改用域名规则的原因。

## 两次抓包的分析结果

| 抓包 | 内容 | 默认域名规则命中 | 实验性信息流匹配 |
| --- | --- | --- | --- |
| 旧 HAR，306 条 | 207 条视频、78 条静态资源、2 条广告测量及 19 条其他请求 | 2 条 | 0 条 |
| 新 HAR，137 条 | 全部来自 `video.twimg.com`；49 条 HLS 播放列表、87 条 MP4/分片成功响应、1 条无成功响应记录 | 0 条 | 0 条 |

新 HAR 的 137 条请求均为 HTTPS URL，136 条带响应内容；这说明导出的文件记录了这些媒体资源，不能单靠这个现象推断所有 App API 已可解密，更不能据此确认是否使用证书固定。新 HAR 没有首页、详情或搜索 API 的可读信息流响应。

新 HAR 的媒体路径中，119 条属于 `amplify_video`，18 条属于 `ext_tw_video`。HLS 播放列表没有发现 `EXT-X-DATERANGE`、`EXT-X-CUE-OUT`、`EXT-X-CUE-IN`、SCTE35 等明确插播标记。未发现标记并不能证明不存在广告，但无法据此安全删除某些片段。

**`amplify_video` 路径和 `video.twimg.com` 主机不能作为广告判据。** 屏蔽它们会影响普通视频。插件不拦这些资源，也不上传原始 HAR、账号信息、URL 查询参数或响应内容。

## 手动打开广告详情是否有帮助

有帮助，但前提是能记录可读的详情或信息流响应。详情中还可能没有首页推广标记，因此仅凭一条详情返回无法保证推断首页的过滤结构。

建议同一次记录按以下顺序操作：刷新首页、打开带“广告/推广”标识的帖子详情、返回，再打开普通帖子详情。记下操作时间和广告帖链接，供本地分析关联。若日志仍然只有媒体文件，只能尝试定位单次素材，无法泛化成推广条目过滤。

## 本地验证

需要 Node.js，无第三方依赖：

```sh
node --test tools/test-twitter.js
node tools/validate-twitter.js --har /path/to/private.har
```

验证器分别检查免解密插件与实验版配置，并用 HAR URL 离线匹配规则，执行实际响应脚本。仅输出聚合计数，不请求抓包 URL，不输出参数、Cookie、响应体或用户标识。模拟测试不等于手机安装验收。

## 结构与格式参考

- [Very Good AdBlock 的信息流过滤设计](https://github.com/chrisbbreuer/very-good-adblock/blob/main/docs/architecture/cosmetic-filtering.md)
- [Fck X 作者源码](https://github.com/zam157/tamper/tree/master/scripts/fck-x)
- [Loon 域名规则](https://github.com/Loon0x00/LoonManual/blob/master/docs/cn/domain_rule.md)
- [Loon 响应脚本](https://github.com/Loon0x00/LoonManual/blob/master/docs/cn/script.md)
- [Loon 复写与 HTTPS 解密前提](https://github.com/Loon0x00/LoonManual/blob/master/docs/cn/rewrite.md)
