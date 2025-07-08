# OKX & Binance 价差监控系统

一个基于Vue3的实时价差监控系统，用于监控OKX和Binance交易所之间的价格差异。

## 功能特性

- 🔄 **实时监控**: 通过WebSocket实时获取两个交易所的最佳买卖价
- 📊 **价差计算**: 自动计算Binance买/OKX卖和Binance卖/OKX买的价差率
- 📈 **图表展示**: 使用ECharts展示最近2000个tick的价差变化曲线
- 🎯 **多交易对**: 支持同时监控多个交易对
- 📱 **响应式设计**: 适配不同屏幕尺寸
- 🎨 **现代UI**: 使用Element Plus组件库，界面美观

## 技术栈

- **前端框架**: Vue 3 (Composition API)
- **状态管理**: Pinia
- **路由**: Vue Router 4
- **UI组件**: Element Plus
- **图表库**: ECharts + Vue-ECharts
- **构建工具**: Vite
- **WebSocket**: 原生WebSocket API

## 项目结构

```
src/
├── main.js              # 应用入口
├── App.vue              # 根组件
├── stores/
│   └── priceStore.js    # 价格数据状态管理
└── views/
    ├── Home.vue         # 主页面 - 交易对选择和实时价差
    └── Detail.vue       # 详情页面 - 价差变化曲线
```

## 安装和运行

1. 安装依赖：
```bash
npm install
```

2. 启动开发服务器：
```bash
npm run dev
```

3. 构建生产版本：
```bash
npm run build

4. 清除vue
pkill -f node
```

## 使用说明

### 主页面
1. 在下拉框中选择要监控的交易对（支持多选）
2. 点击"开始监控"按钮建立WebSocket连接
3. 实时查看价差数据表格，包括：
   - 两个交易所的买一价和卖一价
   - Binance买/OKX卖的价差率
   - Binance卖/OKX买的价差率
4. 点击"详情"按钮查看具体交易对的历史数据

### 详情页面
1. 查看当前实时价差数据
2. 观察价差变化曲线图
3. 查看统计信息（最大正价差、最大负价差、平均价差等）
4. 可以选择查看不同时间范围的数据（最近100/500/1000个tick或全部）

## WebSocket连接

### Binance WebSocket
- 端点: `wss://stream.binance.com:9443/ws/`
- 数据类型: bookTicker (最佳买卖价)
- 格式: `{symbol}@bookTicker`

### OKX WebSocket
- 端点: `wss://ws.okx.com:8443/ws/v5/public`
- 频道: `bbo-tbt` (最佳买卖价)
- 订阅格式: `{"op":"subscribe","args":[{"channel":"bbo-tbt","instId":"SYMBOL"}]}`

## 价差计算公式

- **Binance买/OKX卖价差率** = (Binance卖一价 - OKX买一价) / OKX买一价 × 100%
- **Binance卖/OKX买价差率** = (OKX卖一价 - Binance买一价) / Binance买一价 × 100%

## 支持的交易对

系统预设了20个常见的交易对，这些都是OKX和Binance共同支持的：

- BTCUSDT, ETHUSDT, BNBUSDT, ADAUSDT, XRPUSDT
- SOLUSDT, DOTUSDT, DOGEUSDT, AVAXUSDT, SHIBUSDT
- MATICUSDT, LTCUSDT, LINKUSDT, UNIUSDT, ATOMUSDT
- ETCUSDT, XLMUSDT, BCHUSDT, FILUSDT, TRXUSDT

## 注意事项

1. WebSocket连接需要稳定的网络环境
2. 系统会自动保存最近2000个tick的历史数据
3. 价差数据仅供参考，实际交易请考虑手续费、滑点等因素
4. 建议在生产环境中添加错误重连机制

## 开发计划

- [ ] 添加更多交易所支持
- [ ] 增加价差预警功能
- [ ] 添加数据导出功能
- [ ] 优化WebSocket重连机制
- [ ] 添加历史数据持久化存储 

## 打赏地址 哈哈和别人一样也写一个
- solana 4HLYN6b3fUAQwJnvz73DknV3MCBHkmomP1WK1TMcbPZC
- bsc 0x4443f4426bdfc6e919b5ad84ea2a49e06da52888