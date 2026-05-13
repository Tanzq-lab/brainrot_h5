# 脑腐传送带 H5 MVP

这是一个 H5 横屏 2D 脑腐传送带经营原型项目。

## 运行方式

直接打开 `index.html` 即可运行。

建议用本地服务器运行，避免部分浏览器对本地文件的限制：

```bash
cd brainrot_h5-main
python -m http.server 5173
```

然后访问：

```text
http://127.0.0.1:5173/
```

## 已实现功能

- 横屏 Canvas 2D 主场景
- 左侧家 / 中间收集区 / 右侧传送带布局
- 玩家虚拟摇杆移动
- 桌面 WASD / 方向键移动
- 家里 10 个格子，上 5 个、下 5 个
- 右侧传送带连续平滑滚动
- 一次可见 5 个传送带位置
- 12 个脑腐角色内容配置
- 小香蕉初始白送
- 破香蕉开始进入传送带购买循环
- 点击传送带脑腐购买
- 金币不足提示
- 格子已满提示
- 购买成功后立刻扣钱、预占格子
- 购买动画：传送带 → 中间收集区 → 家里格子
- 允许购买动画期间连续购买
- 被买走的传送带位置变空位，空位滚出后再补新脑腐
- 脑腐进入格子后自动产钱
- 玩家靠近格子自动领取金币
- 点击家里已有脑腐弹出删除确认
- 删除脑腐不返还成本
- 删除后金币保留在格子上
- 旧金币和新脑腐金币合并显示、一次领取
- 本地存档
- 不做离线收益

## 当前角色配置

核心配置位于：

```text
src/config.js
```

| 顺位 | 角色名 | 稀有度 | 收益 | 价格 | 回本时间 | 设计定位 | 图片 |
| --- | --- | --- | ---: | ---: | ---: | --- | --- |
| 1 | 小香蕉 | 普通 | $1/s | $0 | 0 秒 | 初始白送 | assets/images/brainrots/little_banana.png |
| 2 | 破香蕉 | 普通 | $2/s | $25 | 12.5 秒 | 新手第一次购买 | assets/images/brainrots/broken_banana.png |
| 3 | 樱桃小三 | 普通 | $5/s | $180 | 36 秒 | 快速爽点 | assets/images/brainrots/cherry_mistress.png |
| 4 | 焦哥 | 普通 | $9/s | $500 | 56 秒 | 前期稳定过渡 | assets/images/brainrots/jiao_bro.png |
| 5 | 小柠檬 | 普通 | $15/s | $1,200 | 80 秒 | 普通阶段目标 | assets/images/brainrots/little_lemon.png |
| 6 | 小猕猴桃 | 稀有 | $28/s | $2,800 | 100 秒 | 第一个稀有 | assets/images/brainrots/little_kiwi.png |
| 7 | 菠萝保安 | 稀有 | $45/s | $5,500 | 122 秒 | 中期主力 | assets/images/brainrots/pineapple_guard.png |
| 8 | 草莓闺蜜 | 稀有 | $72/s | $9,000 | 125 秒 | 稀有阶段核心 | assets/images/brainrots/strawberry_bff.png |
| 9 | 猕猴桃医生 | 稀有 | $110/s | $15,000 | 136 秒 | 中后期加速 | assets/images/brainrots/kiwi_doctor.png |
| 10 | 葡萄小三 | 史诗 | $180/s | $30,000 | 167 秒 | 第一个大目标 | assets/images/brainrots/grape_mistress.png |
| 11 | 榴莲小姐 | 史诗 | $310/s | $60,000 | 194 秒 | 后期稳定追求 | assets/images/brainrots/durian_lady.png |
| 12 | 香蕉女王 | 传说 | $560/s | $125,000 | 223 秒 | 当前版本终局目标 | assets/images/brainrots/banana_queen.png |

## 调试操作

- `Shift + R`：重置本地存档
- `` ` ``：显示 / 隐藏调试面板

## 第一版明确不做

- 多人
- 偷取
- 防守
- 锁门
- 武器
- 重生
- 随机刷新概率
- 离线收益
- 图鉴
- 排行榜
- 广告 / 付费
