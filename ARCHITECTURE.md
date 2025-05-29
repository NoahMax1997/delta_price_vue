# 价差监控系统架构说明

## 新的异步队列架构

### 概述
系统现在使用异步队列和数据匹配机制来确保价差计算的准确性和时效性。

### 核心组件

#### 1. 数据队列
- **Binance队列**: 存储来自Binance WebSocket的实时数据
- **OKX队列**: 存储来自OKX WebSocket的实时数据
- **队列大小限制**: 每个队列最多保留100个数据点
- **自动清理**: 超过1秒的过期数据会被自动清理

#### 2. 异步协程

##### Binance数据协程
- 连接到Binance合约WebSocket: `wss://fstream.binance.com/ws/{symbol}@bookTicker`
- 接收实时的bestbid和bestask数据
- 将数据添加到Binance队列

##### OKX数据协程  
- 连接到OKX WebSocket: `wss://ws.okx.com:8443/ws/v5/public`
- 订阅`bbo-tbt`频道获取实时数据
- 将数据添加到OKX队列

##### 数据匹配协程
- **事件驱动匹配**: 每当有新数据入队时立即尝试匹配
- 总是选择两个队列中最新的数据进行匹配
- 时间差超过100ms的数据对会被丢弃
- 匹配成功后计算价差并更新UI
- **备用清理**: 每1秒运行一次，清理过期数据和进行备用匹配检查

#### 3. 数据匹配算法

```javascript
// 获取两个队列中最新的数据
const latestBinance = binanceData[binanceData.length - 1]
const latestOkx = okxData[okxData.length - 1]

// 检查时间差
const timeDiff = Math.abs(latestBinance.timestamp - latestOkx.timestamp)

if (timeDiff <= maxTimeDiff) {
  // 匹配成功，移除已使用的数据
  binanceQueue.pop()
  okxQueue.pop()
  return { binance: latestBinance, okx: latestOkx, timeDiff }
} else {
  // 时间差太大，丢弃较旧的数据
  if (latestBinance.timestamp > latestOkx.timestamp) {
    okxQueue.pop() // 丢弃OKX旧数据
  } else {
    binanceQueue.pop() // 丢弃Binance旧数据
  }
}
```

#### 4. 价差计算
只有匹配成功的数据对才会用于价差计算：

- **Binance买/OKX卖**: `(Binance卖一价 - OKX买一价) / OKX买一价 × 100%`
- **Binance卖/OKX买**: `(OKX卖一价 - Binance买一价) / Binance买一价 × 100%`

### 优势

1. **事件驱动**: 有数据就立即匹配，响应更快
2. **最新数据优先**: 总是使用最新的数据进行匹配
3. **数据准确性**: 避免使用过期或不匹配的数据
4. **实时性**: 数据到达即匹配，无延迟
5. **容错性**: 自动清理过期数据，防止内存泄漏
6. **可扩展性**: 队列机制可以轻松扩展到更多交易所

### 配置参数

- `maxQueueSize`: 100 (每个队列最大数据点数)
- `maxTimeDiff`: 100ms (最大允许时间差)
- `cleanupInterval`: 1000ms (清理协程运行频率)
- `maxHistorySize`: 2000 (历史数据最大保留数量)

### 数据流程

```
Binance WebSocket → Binance队列 → 立即尝试匹配 ↘
                                                    → 价差计算 → UI更新 → 历史数据保存
OKX WebSocket → OKX队列 → 立即尝试匹配         ↗
```

### 匹配流程

1. **数据入队**: WebSocket接收到数据后立即加入对应队列
2. **立即匹配**: 数据入队后立即调用匹配函数
3. **最新数据**: 总是选择两个队列中最新的数据
4. **时间检查**: 检查两个数据的时间差是否在100ms内
5. **匹配成功**: 时间差合格则匹配成功，移除已使用数据
6. **匹配失败**: 时间差过大则丢弃较旧的数据
7. **价差计算**: 匹配成功的数据用于计算价差
8. **UI更新**: 实时更新界面显示

### 监控指标

- 队列长度监控
- 匹配成功率
- 平均时间差
- 数据丢弃率
- WebSocket连接状态

这种架构确保了价差数据的准确性和实时性，为套利交易提供了可靠的数据基础。

### 数据管理机制

#### 队列数据清理
- **匹配成功**: 匹配成功的数据从两个队列中移除，避免重复使用
- **时间差过大**: 丢弃较旧的数据，保持数据时效性
- **过期清理**: 自动清理超过1秒的过期数据
- **队列大小限制**: 每个队列最多保留100个数据点

#### 历史数据保存
匹配成功的数据会被保存为完整的历史记录，包含：

```javascript
{
  timestamp: 1748497345636,           // 匹配时间戳
  buyBinanceSellOkx: 0.023961,       // Binance买/OKX卖价差
  sellBinanceBuyOkx: 0.01482,        // Binance卖/OKX买价差
  timeDiff: 45,                      // 数据时间差(ms)
  binanceData: {                     // Binance原始数据
    bidPrice: 50001.23,
    askPrice: 50006.45,
    bidQty: 1.0,
    askQty: 1.0,
    timestamp: 1748497345591
  },
  okxData: {                         // OKX原始数据
    bidPrice: 50002.15,
    askPrice: 50007.32,
    bidQty: 1.0,
    askQty: 1.0,
    timestamp: 1748497345636
  }
}
```

#### 数据流转过程

1. **数据入队**: WebSocket数据进入对应队列
2. **立即匹配**: 尝试与另一个队列的最新数据匹配
3. **匹配检查**: 验证时间差是否在100ms内
4. **成功处理**: 
   - 从队列中移除匹配的数据
   - 计算价差
   - 保存完整历史记录
   - 更新UI显示
5. **失败处理**: 丢弃较旧的数据
6. **定期清理**: 清理过期和超量数据 