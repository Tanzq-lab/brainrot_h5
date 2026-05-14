---
name: 233-leyuan-iaa-ad
description: 233乐园IAA广告SDK接入指南。提供激励视频广告的SDK引入、广告查询、播放、回调处理等完整流程。当用户提到233乐园广告、IAA广告、激励视频广告、MetaH5Ad、广告变现时使用此技能。
---

# 233乐园 IAA 广告 SDK 接入指南

## SDK 引入

在 HTML 文件中引入广告 SDK：

```html
<script src="https://cdn.233xyx.com/h5ad/metah5ad_v1.min.js"></script>
```

## 广告类型常量

```typescript
const AD_TYPE = {
  REWARD_VIDEO: 1, // 激励视频（目前仅支持此类型）
} as const;
```

## 广告状态常量

```typescript
const AD_STATUS = {
  FAILED: -1,      // 广告播放失败
  SUCCESS: 0,      // 广告播放成功
  CLOSED: 1,       // 广告关闭
  SKIPPED: 2,      // 广告跳过
  CLICKED: 3,      // 广告点击
  REWARDED: 4,     // 获得激励奖励（关键状态）
} as const;
```

## 核心 API

### 1. 查询广告支持

```typescript
window.MetaH5Ad.isAdSupport(adType, callback);

// 示例
const REWARD_VIDEO = 1;
window.MetaH5Ad.isAdSupport(REWARD_VIDEO, function(result) {
  // result 结构:
  // {
  //   adType: 1,
  //   code: 0,        // 0=成功, -1=错误
  //   message: "success",
  //   data: 1         // 1=支持, 0=不支持
  // }
});
```

### 2. 播放广告

```typescript
window.MetaH5Ad.showAd(adType, callback);

// 示例
window.MetaH5Ad.showAd(1, function(result) {
  // result 结构:
  // {
  //   adType: 1,
  //   code: 0,
  //   message: "success",
  //   data: {
  //     type: 1,
  //     status: number  // 见 AD_STATUS 常量
  //   }
  // }
});
```

## TypeScript 封装示例

```typescript
// AdService.ts
export class AdService {
  private static instance: AdService;

  static getInstance(): AdService {
    if (!AdService.instance) {
      AdService.instance = new AdService();
    }
    return AdService.instance;
  }

  /** 检查广告是否支持 */
  isAdSupported(adType: number = 1): Promise<boolean> {
    return new Promise((resolve) => {
      const win = window as unknown as { MetaH5Ad?: { isAdSupport: (type: number, cb: (r: {code: number, data: number}) => void) => void } };
      if (!win.MetaH5Ad) {
        resolve(false);
        return;
      }
      win.MetaH5Ad.isAdSupport(adType, (result) => {
        resolve(result.code === 0 && result.data === 1);
      });
    });
  }

  /** 播放激励视频 */
  showRewardVideoAd(callback: (success: boolean, status: number) => void): void {
    const win = window as unknown as { MetaH5Ad?: { showAd: (type: number, cb: (r: {code: number, data: {status: number}}) => void) => void } };
    if (!win.MetaH5Ad) {
      callback(false, -1);
      return;
    }

    win.MetaH5Ad.showAd(1, (result) => {
      if (result.code !== 0) {
        callback(false, -1);
        return;
      }
      // 只有 status=4 才算获得奖励
      callback(result.data.status === 4, result.data.status);
    });
  }
}

export const adService = AdService.getInstance();
```

## 使用流程

### 1. 播放单个广告

```typescript
adService.showRewardVideoAd((success, status) => {
  if (success) {
    // 发放奖励
    player.addGold(rewardAmount);
  } else if (status === 1 || status === 2) {
    // 用户关闭或跳过，不发放奖励
  } else {
    // 广告播放失败
  }
});
```

### 2. 播放多个广告（如购买道具需要看2次广告）

```typescript
function playMultipleAds(count: number, onComplete: (completed: number) => void) {
  let completed = 0;

  const playNext = () => {
    if (completed >= count) {
      onComplete(completed);
      return;
    }

    adService.showRewardVideoAd((success) => {
      if (success) {
        completed++;
        playNext();
      } else {
        // 用户取消，结束流程
        onComplete(completed);
      }
    });
  };

  playNext();
}
```

## 状态处理策略

| status | 含义 | 处理建议 |
|--------|------|----------|
| -1 | 播放失败 | 提示用户稍后重试 |
| 1 | 广告关闭 | 不发放奖励，无提示 |
| 2 | 广告跳过 | 不发放奖励，无提示 |
| 3 | 广告点击 | 可记录数据，继续等待 |
| 4 | 获得奖励 | **发放奖励** |

## 注意事项

1. **SDK 加载时机**：SDK 需要在 DOM 加载后才能使用，建议在 HTML `<head>` 中引入
2. **奖励发放时机**：仅当 `status === 4` 时发放奖励
3. **用户取消处理**：`status === 1` 或 `status === 2` 时用户主动取消，无需提示
4. **广告预加载**：SDK 会自动处理预加载，直接调用 `showAd` 即可
5. **每日限制**：业务层需自行实现每日观看次数限制

## 完整示例项目

参考本项目实现：
- SDK 服务封装：`src/services/AdService.ts`
- 商店广告按钮：`src/scenes/GameScene.ts` 中的 `createFreeGoldButton` 方法
- 道具广告购买：`src/scenes/GameScene.ts` 中的 `showBombPurchaseConfirmDialog` 方法