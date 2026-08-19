# 算账（suanzhang）· DeepSeek 花销一目了然

> 在 DeepSeek Harness（dsh）里装一个「算账」小助手：你的余额、今天花了多少、每一步模型调用花了多少钱——全部清清楚楚，不用再猜。

[English](./README.en.md)

---

## 为什么要装它？

用 DeepSeek 的时候，你是不是经常想知道：

- **我的余额还有多少？** —— 想查还得去网页翻，麻烦。
- **今天到底花了多少钱？** —— 用完没感觉，月底才心疼。
- **这一步操作花了我多少钱？** —— 表格里只有 token 数，换成人民币才直观。
- **钱都花在哪了？** —— 哪个模型最烧钱？哪个工具最费钱？

装上「算账」，这些答案**开机就在眼前**：

| 你关心的 | 算账给你 |
|---|---|
| 余额还剩多少 | 侧边栏常驻显示，刷新/自动更新 |
| 今天花了多少 | 同样在侧边栏，一眼看到 |
| 每一步花了多少人民币 | 「算账」页签按步骤列出费用 |
| 钱花在哪了 | 按模型、按工具、按天全部可视化 |
| 再聊下去要花多少 | 成本预测：平均每步 × 步数 |

## 长什么样？

简洁的交易终端风格（类似 Bloomberg 行情界面）：

- **侧边栏底部**：`当前余额：¥xx.xx，今天用了：¥xx.xx`，点一下直接跳进算账页。
- **算账页签**：顶部四格行情栏（余额 / 今天用了 / 累计 / 缓存节省）→ 下方一步步的费用明细表。
- **点击任意步骤行**：自动跳到「轨迹」页签并高亮那一步，想看细节不用翻。
- **官方价自动同步**：计价跟着 DeepSeek 官方页走，官方调价自动生效，不用手动改。

## 界面预览

| | |
|---|---|
| 侧边栏余额 & 今日消费 | 算账页签 · 行情栏 + 步骤费用表 |
| ![sidebar](docs/sidebar.png) | ![tab](docs/tab.png) |
| 分析区 · 按模型/按工具条形图 + 成本预测 | 跨会话 / 跨天汇总 |
| ![analysis](docs/analysis.png) | ![summary](docs/summary.png) |

## 装它要什么？

- 一台装了 DeepSeek Harness 的电脑（`dsh web` 能打开）。
- 一个你自己的 DeepSeek API Key（在 Harness 设置里配好）。
- 网络（查询余额和官方价需要联网）。

## 怎么安装？

### 方式一：GitHub 安装（推荐）

```bash
pnpm add https://github.com/CZ1900/suanzhang-dsh.git
```

然后编辑 Harness profile 下的 `cordis.patch.yml`，在顶部加上：

```yaml
- insert:
    - id: suanzhang
      name: suanzhang-dsh
```

重启 `dsh web`，刷新页面即可看到侧边栏余额和「算账」页签。

### 方式二：本地安装

把整个文件夹放到 Harness profile 的 `node_modules` 下：

```bash
# 在 DSH profile 目录（如 ~/.dsh/profiles/web）里执行：
cp -r /path/to/suanzhang-dsh node_modules/
```

然后同样在 `cordis.patch.yml` 里加上面的 insert 两行，重启即可。

## 隐私说明

| 动作 | 数据去哪 | 是否上传 |
|---|---|---|
| 查余额 | `GET https://api.deepseek.com/user/balance`（带你的 Key） | 只发给 DeepSeek 官方 |
| 抓官方价 | `https://api-docs.deepseek.com` 公开页面 | 无鉴权，只读 |
| 算费用/汇总 | 本地读取你的会话日志 | 不出本机 |
| 显示/排序/图表 | 浏览器本地计算 | 不出本机 |

## 常见问题

**问：插件运行本身费 token 吗？**
答：零。插件全程不调用任何模型，纯本地计算 + 两个免费 HTTP 请求。真正费 token 的是你在 dsh 里的对话，跟这个插件无关。

**问：价格会过期吗？**
答：不会。官方价自动同步，DeepSeek 调价后插件会自动跟着更新；万一抓取失败，会回退到内置价，不影响使用。

**问：支持哪些模型？**
答：DeepSeek V4-Flash / V4-Pro（含峰谷计价），以及 deepseek-chat / deepseek-reasoner。其他模型会显示「未计价」。

## 给开发者的快速指引

- 代码结构：`lib/index.js`（Host：余额/计价/汇总/今日 四个 RPC）、`lib/client.js`（浏览器端 UI）。
- 关键参数（硬编码在 `lib/index.js`）：API Key 引用默认 `DEEPSEEK_API_KEY`、baseURL 默认 `https://api.deepseek.com`、高峰时段 9:00–14:00、低余额阈值 ¥20。
- 想改轮询频率：`lib/client.js` 里 `60000`（毫秒）改大即可。

## License

MIT —— 随便用，随便改，注明出处即可。
