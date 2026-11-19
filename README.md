# 4×4 词条法阵

在 4×4 棋盘摆放、升级并连锁触发符文。组合连锁、剧毒、点金或暴击流派，击破 20 波守门核心后可继续无尽模式。

## 在线试玩

[GitHub Pages 试玩](https://bartcurry.github.io/affix-grid-4x4/)（首次部署成功后可用）。仓库管理员须在 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。合并到 `main` 或从 `main` 手动运行 **Test and deploy to GitHub Pages**；部署后的真实网址在工作流 `deploy` 任务中显示。PR 只测试和构建，不发布。

## 本地运行

需要 Node.js 20.19+（20.x）或 22.12+ 的当前受支持偶数版本。

```sh
npm ci
npm run dev
npm test
npm run build
npm run preview
```

## 如何玩

- 点击符文查看词条和作用范围；拖动交换法阵、备战区位置，或拖到底部出售区。键盘可用方向键、回车和 `Delete` 操作棋盘。
- 购买后先放入四格备战区；同名同星的三个符文自动合成，优先保留法阵上的位置。每波开始自动刷新未锁商品，另有一次免费手动刷新。
- 法阵按从左到右、从上到下激活，连锁立即插入；布阵时把折射镜放在想触发的符文左边。只在首波，保留初始电火花和折射镜的位置会触发额外 42 伤害的教学共鸣；16 个符文的原始数值不变。
- 未击破 Boss 时可扣除 1 点护盾，或看模拟广告保留护盾重试。每次重试 Boss 恢复满血、剧毒清零，已经获得的金币保留。广告仅为 1 秒本地模拟，不发网络请求。
- 进度保存在浏览器本地；通关或战败可以导出战绩 PNG。

`src/core/` 是不依赖 DOM 的确定性战斗和经济逻辑；`src/sim/balance.test.ts` 覆盖连锁护栏、毒层、金币、升星等规则。Canvas 和 Web Audio 负责回放，不参与计算。
