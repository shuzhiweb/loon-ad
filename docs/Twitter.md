# X（推特）Loon 去广告插件

与仓库里的 B 站插件独立安装，可以同时使用。

## 安装

在 Loon「插件」中添加并启用：

```text
https://raw.githubusercontent.com/shuzhiweb/loon-ad/main/Twitter-AdBlock.plugin
```

[一键导入 Loon](https://www.nsloon.com/openloon/import?plugin=https%3A%2F%2Fraw.githubusercontent.com%2Fshuzhiweb%2Floon-ad%2Fmain%2FTwitter-AdBlock.plugin)

开启 Loon 的 MITM / HTTPS 解密，安装证书，并在 iOS「设置 > 通用 > 关于本机 > 证书信任设置」中信任。插件声明解密的主机是 `ads-api.twitter.com`、`api.twitter.com`、`api.x.com`、`twitter.com`、`x.com`。插件下载脚本后，完全退出 X 再重新打开，刷新信息流；不要把插件地址添加到节点订阅。

## 处理范围

- 精确拦截 `ads-api.twitter.com/12/measurement/dcm_local_id`，在本机返回 `{}`；这是广告测量接口，本身不会移除可见推广卡片。
- 响应脚本处理 `HomeTimeline`、`HomeLatestTimeline`、`TweetDetail`、`SearchTimeline`、`UserTweets`、`UserTweetsAndReplies`、`UserMedia`、`ListLatestTweetsTimeline` 八种 GraphQL 操作。适配原生 `/graphql/查询ID/操作名` 与网页 `/i/api/graphql/查询ID/操作名` URL，查询 ID 不写死。
- 只进入已知信息流容器，以条目自身的 `promotedMetadata` / `promoted_metadata` 对象或 `promoted-tweet-`、`promoted-user-`、`promoted-trend-` 标识判断推广。混合模块只移除推广子项；普通推文、引用、游标、终止指令与其他字段保留。
- 不读取/保存登录信息，不改写请求，不转发响应给第三方，不屏蔽 `video.twimg.com`、`abs.twimg.com`，不把所有 `amplify_video` 资源当广告。账号设置、登录、Grok 购买和认证接口不在匹配范围内。
- 非成功状态、非 JSON、GraphQL 错误、未知响应结构和解析失败原样放行；没有实际移除时保留原始响应字节。

## 抓包证据与限制

用户提供的 HAR 共 306 条记录：207 条视频主机请求、78 条静态资源请求、2 条广告测量请求及 19 条其他请求。两条广告测量请求命中精确规则，其他 304 条均不匹配本插件。

**这份 HAR 没有任何匹配上述八种操作的信息流响应，也没有可验证的推广条目样本。** `/i/api/1.1/flow/timeline.json` 虽然带有 timeline 字样，记录的响应体为空，不能据此判断为首页信息流；现有账号设置、网页初始化和 Grok JSON 也不包含信息流推广条目。

信息流过滤参考公开项目记录的 URT 信息流结构，使用自编脚本并通过模拟响应测试，尚未在这部手机的推广响应上验证。不能承诺安装后清除所有广告；未知 GraphQL 操作、不同版本的数据结构、未被 Loon 解密的连接及视频内插广告不在已验证范围。

## 本地验证

需要 Node.js，无第三方依赖：

```sh
node --test tools/test-twitter.js
node tools/validate-twitter.js --har /path/to/private.har
```

验证器执行插件实际引用的响应脚本，并用 HAR URL 匹配插件规则。仅输出聚合计数，不请求抓包 URL、不打印参数、请求头、响应体或用户标识。模拟测试验证普通内容与分页保留、推广子项过滤、未知结构放行等行为。

## 手机上仍有广告时

1. 确认插件和脚本已下载、插件已启用、MITM 已开启且证书已信任。
2. 从完全退出 X 的状态开始抓包，打开首页并刷新到出现广告，记录页面和广告出现时间。
3. 在 Loon 日志中确认 `/graphql/` 或 `/i/api/graphql/` 的实际操作名和响应是否被解密；若没捕获到可读响应，需要先解决采集问题。
4. 提供包含推广条目与正常条目的脱敏 JSON / HAR 来适配。不要把原始 HAR、Cookie 或认证令牌放进公开仓库。

## 结构参考

- [Very Good AdBlock 的信息流过滤设计](https://github.com/chrisbbreuer/very-good-adblock/blob/main/docs/architecture/cosmetic-filtering.md)：明确推广字段、模块子项与普通内容保护。
- [Fck X 作者源码](https://github.com/zam157/tamper/tree/master/scripts/fck-x)：首页及详情页 URT 容器和推广字段。
- [Loon 响应脚本文档](https://github.com/Loon0x00/LoonManual/blob/master/docs/cn/script.md)
- [Loon 复写文档](https://github.com/Loon0x00/LoonManual/blob/master/docs/cn/rewrite.md)
