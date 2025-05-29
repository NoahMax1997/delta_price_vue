import { defineStore } from 'pinia'
import { ref, computed, reactive, nextTick } from 'vue'

export const usePriceStore = defineStore('price', () => {
  // 状态
  const selectedSymbols = ref([])
  const priceData = ref({})
  const tickHistory = ref({})
  const wsConnections = ref({})
  const isConnected = ref(false)

  // 数据队列 - 每个交易对独立管理
  const symbolQueues = ref({}) // { symbol: { binance: [], okx: [], matcher: setInterval, stats: {} } }
  
  // 实时统计数据（从网站打开开始计算）
  const realtimeStats = ref({}) // { symbol: { maxBuyBinanceSellOkx: number, maxSellBinanceBuyOkx: number, maxNegativeSpread: number } }
  
  // 匹配统计数据
  const matchStats = ref({
    successfulMatches: 0,    // 成功匹配次数
    discardedMatches: 0,     // 丢弃匹配次数
    totalBinanceQueue: 0,    // Binance总队列长度
    totalOKXQueue: 0,        // OKX总队列长度
    queueDetails: {}         // 每个交易对的队列详情 { symbol: { binance: length, okx: length } }
  })
  
  // 合约大小映射 - 存储每个交易对的合约大小
  const contractSizes = ref({}) // { symbol: contractSize }
  
  // Funding Rate数据 - 存储每个交易对的资金费率信息
  const fundingRates = ref({}) // { symbol: { binance: {...}, okx: {...}, lastUpdate: timestamp } }
  
  // 系统配置参数 - 可动态调整
  const systemConfig = ref({
    maxTimeDiff: 1000,           // 最大时间差(ms) - 匹配时允许的最大时间差
    dataExpirationTime: 1000,   // 数据过期时间(ms) - 超过此时间的数据将被清理
    cleanupInterval: 5000,      // 清理间隔(ms) - 多久执行一次过期数据清理
    maxQueueSize: 100,          // 队列最大容量 - 每个队列最多保留的数据点数
    historyRetentionCount: 2000, // 历史数据保留数量 - 最多保留的历史tick数
    timeMatchingMode: 'receiveTime', // 时间匹配模式: 'originalTimestamp' | 'receiveTime'
    maxLocalTimeDiff: 500       // 最大本地时间差(ms) - 原始时间戳与本地时间的最大允许差异
  })
  
  // 协程控制参数（从systemConfig获取，保持向后兼容）
  const maxQueueSize = computed(() => systemConfig.value.maxQueueSize)
  const maxTimeDiff = computed(() => systemConfig.value.maxTimeDiff)

  // 常见的交易对列表（CCXT格式）
  const availableSymbols = ref([
    'BTC/USDT:USDT', 'ETH/USDT:USDT', 'BNB/USDT:USDT', 'ADA/USDT:USDT', 'XRP/USDT:USDT',
    'SOL/USDT:USDT', 'DOT/USDT:USDT', 'DOGE/USDT:USDT', 'AVAX/USDT:USDT', 'SHIB/USDT:USDT',
    'MATIC/USDT:USDT', 'LTC/USDT:USDT', 'LINK/USDT:USDT', 'UNI/USDT:USDT', 'ATOM/USDT:USDT',
    'ETC/USDT:USDT', 'XLM/USDT:USDT', 'BCH/USDT:USDT', 'FIL/USDT:USDT', 'TRX/USDT:USDT'
  ])

  // 初始化队列
  const initializeQueues = () => {
    selectedSymbols.value.forEach(symbol => {
      if (!symbolQueues.value[symbol]) {
        symbolQueues.value[symbol] = {
          binance: [],
          okx: [],
          matcher: null,
          stats: {
            successfulMatches: 0,
            discardedMatches: 0,
            totalBinanceDataReceived: 0,
            totalOKXDataReceived: 0,
            lastMatchTime: null,
            avgTimeDiff: 0,
            matchTimeDiffs: []
          }
        }
        // 为每个交易对启动独立的匹配协程
        startSymbolMatcher(symbol)
      }
    })
  }

  // 更新队列统计数据
  const updateQueueStats = () => {
    let totalBinance = 0
    let totalOKX = 0
    const queueDetails = {}
    
    Object.keys(symbolQueues.value).forEach(symbol => {
      const binanceLength = symbolQueues.value[symbol]?.binance?.length || 0
      const okxLength = symbolQueues.value[symbol]?.okx?.length || 0
      
      totalBinance += binanceLength
      totalOKX += okxLength
      
      queueDetails[symbol] = {
        binance: binanceLength,
        okx: okxLength
      }
    })
    
    matchStats.value.totalBinanceQueue = totalBinance
    matchStats.value.totalOKXQueue = totalOKX
    matchStats.value.queueDetails = queueDetails
  }

  // 添加数据到Binance队列
  const addToBinanceQueue = (symbol, data) => {
    if (!symbolQueues.value[symbol]) {
      symbolQueues.value[symbol] = {
        binance: [],
        okx: [],
        matcher: null,
        stats: {
          successfulMatches: 0,
          discardedMatches: 0,
          totalBinanceDataReceived: 0,
          totalOKXDataReceived: 0,
          lastMatchTime: null,
          avgTimeDiff: 0,
          matchTimeDiffs: []
        }
      }
      // 为新的交易对启动独立协程
      startSymbolMatcher(symbol)
    }
    
    const queueData = {
      symbol,
      exchange: 'binance',
      bidPrice: parseFloat(data.b),
      askPrice: parseFloat(data.a),
      bidQty: parseFloat(data.B),
      askQty: parseFloat(data.A),
      originalTimestamp: data.E || data.T || null, // 交易所原始时间戳 (Event time 或 Transaction time)
      receiveTime: Date.now(), // 本地接收时间
      timestamp: Date.now() // 保持向后兼容
    }
    
    symbolQueues.value[symbol].binance.push(queueData)
    
    // 更新统计数据
    symbolQueues.value[symbol].stats.totalBinanceDataReceived++
    
    // 保持队列大小
    if (symbolQueues.value[symbol].binance.length > maxQueueSize.value) {
      symbolQueues.value[symbol].binance.shift()
    }
    
    console.log(`[${symbol}] Binance数据入队: 队列长度 ${symbolQueues.value[symbol].binance.length}`)
    
    // 更新队列统计
    updateQueueStats()
    
    // 🔄 简化：每次新数据到达就立即尝试匹配
    tryMatchPair(symbol)
  }

  // 添加数据到OKX队列
  const addToOKXQueue = (symbol, data) => {
    console.log('=== addToOKXQueue 被调用 ===')
    console.log('symbol:', symbol)
    console.log('data:', data)
    console.log('当前contractSizes:', contractSizes.value)
    console.log('==============================')
    
    if (!symbolQueues.value[symbol]) {
      symbolQueues.value[symbol] = {
        binance: [],
        okx: [],
        matcher: null,
        stats: {
          successfulMatches: 0,
          discardedMatches: 0,
          totalBinanceDataReceived: 0,
          totalOKXDataReceived: 0,
          lastMatchTime: null,
          avgTimeDiff: 0,
          matchTimeDiffs: []
        }
      }
      // 为新的交易对启动独立协程
      startSymbolMatcher(symbol)
    }
    
    // 获取该交易对的合约大小，默认为1
    const contractSize = contractSizes.value[symbol] || 1
    
    // 获取原始数量数据
    const originalBidQty = parseFloat(data.bids[0][1])
    const originalAskQty = parseFloat(data.asks[0][1])
    
    // 计算应用合约大小后的数量
    const adjustedBidQty = originalBidQty * contractSize
    const adjustedAskQty = originalAskQty * contractSize
    
    const queueData = {
      symbol,
      exchange: 'okx',
      bidPrice: parseFloat(data.bids[0][0]),
      askPrice: parseFloat(data.asks[0][0]),
      bidQty: adjustedBidQty,
      askQty: adjustedAskQty,
      originalTimestamp: data.ts ? parseInt(data.ts) : null, // OKX原始时间戳
      receiveTime: Date.now(), // 本地接收时间
      timestamp: Date.now() // 保持向后兼容
    }
    
    symbolQueues.value[symbol].okx.push(queueData)
    
    // 更新统计数据
    symbolQueues.value[symbol].stats.totalOKXDataReceived++
    
    // 保持队列大小
    if (symbolQueues.value[symbol].okx.length > maxQueueSize.value) {
      symbolQueues.value[symbol].okx.shift()
    }
    
    console.log(`[${symbol}] OKX数据入队详情:`, {
      contractSize: contractSize,
      originalBidQty: originalBidQty,
      originalAskQty: originalAskQty,
      adjustedBidQty: adjustedBidQty,
      adjustedAskQty: adjustedAskQty,
      contractSizesAvailable: Object.keys(contractSizes.value).length,
      queueLength: symbolQueues.value[symbol].okx.length
    })
    
    // 更新队列统计
    updateQueueStats()
    
    // 🔄 简化：每次新数据到达就立即尝试匹配
    tryMatchPair(symbol)
  }

  // 匹配最佳数据对
  const matchBestPair = (symbol) => {
    const binanceData = symbolQueues.value[symbol].binance || []
    const okxData = symbolQueues.value[symbol].okx || []
    
    if (binanceData.length === 0 || okxData.length === 0) {
      return null
    }
    
    // 获取两个队列中最新的数据（队列末尾的数据）
    const latestBinance = binanceData[binanceData.length - 1]
    const latestOkx = okxData[okxData.length - 1]
    
    // 根据配置选择使用哪个时间进行匹配
    let binanceTime, okxTime
    
    if (systemConfig.value.timeMatchingMode === 'originalTimestamp') {
      // 使用交易所原始时间戳
      binanceTime = latestBinance.originalTimestamp
      okxTime = latestOkx.originalTimestamp
      
      // 如果原始时间戳不可用，回退到接收时间
      if (!binanceTime || !okxTime) {
        console.warn(`${symbol} 原始时间戳不可用，回退到接收时间匹配`)
        binanceTime = latestBinance.receiveTime
        okxTime = latestOkx.receiveTime
      }
    } else {
      // 使用本地接收时间（默认）
      binanceTime = latestBinance.receiveTime
      okxTime = latestOkx.receiveTime
    }
    
    // 新增：检查原始时间戳与当前本地时间的差异
    const currentLocalTime = Date.now()
    const maxLocalTimeDiff = systemConfig.value.maxLocalTimeDiff // 使用配置的阈值
    
    // 检查Binance原始时间戳延迟
    if (latestBinance.originalTimestamp) {
      const binanceDelay = Math.abs(currentLocalTime - latestBinance.originalTimestamp)
      if (binanceDelay > maxLocalTimeDiff) {
        console.log(`❌ Binance数据过旧: ${symbol}, 原始时间戳延迟: ${binanceDelay}ms (超过${maxLocalTimeDiff}ms阈值), 放弃匹配`)
        return null
      }
    }
    
    // 检查OKX原始时间戳延迟
    if (latestOkx.originalTimestamp) {
      const okxDelay = Math.abs(currentLocalTime - latestOkx.originalTimestamp)
      if (okxDelay > maxLocalTimeDiff) {
        console.log(`❌ OKX数据过旧: ${symbol}, 原始时间戳延迟: ${okxDelay}ms (超过${maxLocalTimeDiff}ms阈值), 放弃匹配`)
        return null
      }
    }
    
    // 检查时间差是否在允许范围内
    const timeDiff = Math.abs(binanceTime - okxTime)
    
    if (timeDiff <= maxTimeDiff.value) {
      // 时间差在允许范围内，进行匹配
      const bestMatch = {
        binance: latestBinance,
        okx: latestOkx,
        timeDiff
      }
      
      // 🔄 新策略：匹配成功后不删除数据，保留在队列中
      // symbolQueues.value[symbol].binance.pop()  // 不再删除
      // symbolQueues.value[symbol].okx.pop()      // 不再删除
      
      // 更新全局成功匹配统计
      matchStats.value.successfulMatches++
      
      // 更新该交易对的成功匹配统计
      symbolQueues.value[symbol].stats.successfulMatches++
      symbolQueues.value[symbol].stats.lastMatchTime = Date.now()
      
      // 记录时间差用于计算平均值
      symbolQueues.value[symbol].stats.matchTimeDiffs.push(timeDiff)
      if (symbolQueues.value[symbol].stats.matchTimeDiffs.length > 100) {
        symbolQueues.value[symbol].stats.matchTimeDiffs.shift() // 只保留最近100个时间差
      }
      
      // 计算平均时间差
      const timeDiffs = symbolQueues.value[symbol].stats.matchTimeDiffs
      symbolQueues.value[symbol].stats.avgTimeDiff = timeDiffs.reduce((sum, diff) => sum + diff, 0) / timeDiffs.length
      
      updateQueueStats()
      
      console.log(`✅ 匹配成功: ${symbol}, 时间差: ${timeDiff}ms (${systemConfig.value.timeMatchingMode}), 数据保留在队列中, Binance队列: ${symbolQueues.value[symbol].binance.length}, OKX队列: ${symbolQueues.value[symbol].okx.length}`)
      console.log(`   匹配时间详情: Binance(${systemConfig.value.timeMatchingMode}): ${new Date(binanceTime).toLocaleTimeString()}.${binanceTime % 1000}, OKX(${systemConfig.value.timeMatchingMode}): ${new Date(okxTime).toLocaleTimeString()}.${okxTime % 1000}`)
      return bestMatch
    } else {
      // 🔄 简化：时间差太大时也不删除数据，只记录统计
      // 更新全局丢弃匹配统计
      matchStats.value.discardedMatches++
      // 更新该交易对的丢弃匹配统计
      symbolQueues.value[symbol].stats.discardedMatches++
      updateQueueStats()
      
      if (binanceTime > okxTime) {
        console.log(`⏰ 时间差过大(${timeDiff}ms): ${symbol}, OKX数据较旧 (${systemConfig.value.timeMatchingMode}: ${new Date(okxTime).toLocaleTimeString()}), 等待更新数据`)
      } else {
        console.log(`⏰ 时间差过大(${timeDiff}ms): ${symbol}, Binance数据较旧 (${systemConfig.value.timeMatchingMode}: ${new Date(binanceTime).toLocaleTimeString()}), 等待更新数据`)
      }
    }
    
    // 清理过期数据（使用配置的过期时间）
    const now = Date.now()
    const originalBinanceLength = symbolQueues.value[symbol].binance.length
    const originalOkxLength = symbolQueues.value[symbol].okx.length
    
    symbolQueues.value[symbol].binance = binanceData.filter(item => now - item.timestamp < systemConfig.value.dataExpirationTime)
    symbolQueues.value[symbol].okx = okxData.filter(item => now - item.timestamp < systemConfig.value.dataExpirationTime)
    
    const cleanedBinance = originalBinanceLength - symbolQueues.value[symbol].binance.length
    const cleanedOkx = originalOkxLength - symbolQueues.value[symbol].okx.length
    
    if (cleanedBinance > 0 || cleanedOkx > 0) {
      console.log(`🧹 清理过期数据: ${symbol}, Binance清理${cleanedBinance}个, OKX清理${cleanedOkx}个`)
    }
    
    return null
  }

  // 尝试匹配数据对
  const tryMatchPair = (symbol) => {
    const match = matchBestPair(symbol)
    
    if (match) {
      // 更新实时价格数据
      priceData.value[`binance_${symbol}`] = match.binance
      priceData.value[`okx_${symbol}`] = match.okx
      
      // 计算价差
      const spread = calculateSpread(match.binance, match.okx)
      
      if (spread) {
        // 更新实时统计数据
        updateRealtimeStats(symbol, spread)
        
        // 保存匹配成功的完整数据作为历史记录
        const historyData = {
          timestamp: spread.timestamp,
          buyBinanceSellOkx: spread.buyBinanceSellOkx,
          sellBinanceBuyOkx: spread.sellBinanceBuyOkx,
          timeDiff: match.timeDiff,
          // 保存原始价格数据用于图表详细显示
          binanceData: {
            bidPrice: match.binance.bidPrice,
            askPrice: match.binance.askPrice,
            bidQty: match.binance.bidQty,
            askQty: match.binance.askQty,
            timestamp: match.binance.timestamp
          },
          okxData: {
            bidPrice: match.okx.bidPrice,
            askPrice: match.okx.askPrice,
            bidQty: match.okx.bidQty,
            askQty: match.okx.askQty,
            timestamp: match.okx.timestamp
          }
        }
        
        // 保存历史数据
        saveTickHistory(symbol, historyData)
        
        console.log(`价差计算完成: ${symbol}`, {
          buyBinanceSellOkx: spread.buyBinanceSellOkx,
          sellBinanceBuyOkx: spread.sellBinanceBuyOkx,
          timeDiff: match.timeDiff,
          binanceBid: match.binance.bidPrice,
          binanceAsk: match.binance.askPrice,
          okxBid: match.okx.bidPrice,
          okxAsk: match.okx.askPrice
        })
      }
    }
  }

  // 更新实时统计数据
  const updateRealtimeStats = (symbol, spread) => {
    if (!realtimeStats.value[symbol]) {
      realtimeStats.value[symbol] = {
        maxBuyBinanceSellOkx: -Infinity,  // Binance买/OKX卖的最大价差
        maxSellBinanceBuyOkx: -Infinity,  // Binance卖/OKX买的最大价差
        maxNegativeSpread: Infinity,
        startTime: Date.now()
      }
    }
    
    const stats = realtimeStats.value[symbol]
    
    // 分别更新两个方向的最大价差
    if (spread.buyBinanceSellOkx > stats.maxBuyBinanceSellOkx) {
      stats.maxBuyBinanceSellOkx = spread.buyBinanceSellOkx
      console.log(`${symbol} 新的Binance买/OKX卖最大价差: ${spread.buyBinanceSellOkx.toFixed(4)}%`)
    }
    
    if (spread.sellBinanceBuyOkx > stats.maxSellBinanceBuyOkx) {
      stats.maxSellBinanceBuyOkx = spread.sellBinanceBuyOkx
      console.log(`${symbol} 新的Binance卖/OKX买最大价差: ${spread.sellBinanceBuyOkx.toFixed(4)}%`)
    }
    
    // 更新最大负价差（保持原逻辑）
    const currentMinSpread = Math.min(spread.buyBinanceSellOkx, spread.sellBinanceBuyOkx)
    if (currentMinSpread < stats.maxNegativeSpread) {
      stats.maxNegativeSpread = currentMinSpread
      console.log(`${symbol} 新的最大负价差: ${currentMinSpread.toFixed(4)}%`)
    }
  }

  // 计算价差率
  const calculateSpread = (binanceData, okxData) => {
    if (!binanceData || !okxData) return null
    
    const binanceBid = binanceData.bidPrice
    const binanceAsk = binanceData.askPrice
    const okxBid = okxData.bidPrice
    const okxAsk = okxData.askPrice

    // Binance买OKX卖的价差率
    const buyBinanceSellOkx = ((binanceAsk - okxBid) / okxBid * 100)
    // Binance卖OKX买的价差率
    const sellBinanceBuyOkx = ((okxAsk - binanceBid) / binanceBid * 100)

    return {
      buyBinanceSellOkx: parseFloat(buyBinanceSellOkx.toFixed(6)),
      sellBinanceBuyOkx: parseFloat(sellBinanceBuyOkx.toFixed(6)),
      timestamp: Math.max(binanceData.timestamp, okxData.timestamp)
    }
  }

  // 为单个交易对启动匹配协程
  const startSymbolMatcher = (symbol) => {
    if (!symbolQueues.value[symbol]) {
      symbolQueues.value[symbol] = {
        binance: [],
        okx: [],
        matcher: null,
        stats: {}
      }
    }
    
    // 如果已经有协程在运行，先停止它
    if (symbolQueues.value[symbol].matcher) {
      clearInterval(symbolQueues.value[symbol].matcher)
    }
    
    // 🔄 协程只负责清理过期数据
    symbolQueues.value[symbol].matcher = setInterval(() => {
      const now = Date.now()
      
      // 清理过期数据（使用配置的过期时间）
      if (symbolQueues.value[symbol].binance) {
        const originalBinanceLength = symbolQueues.value[symbol].binance.length
        symbolQueues.value[symbol].binance = symbolQueues.value[symbol].binance.filter(item => now - item.timestamp < systemConfig.value.dataExpirationTime)
        const cleanedBinance = originalBinanceLength - symbolQueues.value[symbol].binance.length
        
        if (cleanedBinance > 0) {
          console.log(`[${symbol}] 定时清理过期Binance数据: ${cleanedBinance}个`)
        }
      }
      
      if (symbolQueues.value[symbol].okx) {
        const originalOkxLength = symbolQueues.value[symbol].okx.length
        symbolQueues.value[symbol].okx = symbolQueues.value[symbol].okx.filter(item => now - item.timestamp < systemConfig.value.dataExpirationTime)
        const cleanedOkx = originalOkxLength - symbolQueues.value[symbol].okx.length
        
        if (cleanedOkx > 0) {
          console.log(`[${symbol}] 定时清理过期OKX数据: ${cleanedOkx}个`)
        }
      }
      
      // 更新队列统计
      updateQueueStats()
      
    }, systemConfig.value.cleanupInterval) // 使用配置的清理间隔
    
    console.log(`[${symbol}] 清理协程已启动，匹配策略：任一队列更新即触发匹配，数据不删除`)
  }

  // 停止指定交易对的匹配协程并清理相关数据
  const stopSymbolMatcher = (symbol) => {
    if (symbolQueues.value[symbol]?.matcher) {
      clearInterval(symbolQueues.value[symbol].matcher)
      symbolQueues.value[symbol].matcher = null
      console.log(`[${symbol}] 独立匹配协程已停止`)
    }
  }

  // 完全清理指定交易对的所有数据（协程、队列、价格数据、历史数据、统计数据）
  const clearSymbolData = (symbol) => {
    // 停止协程
    stopSymbolMatcher(symbol)
    
    // 删除队列数据
    delete symbolQueues.value[symbol]
    
    // 清理价格数据
    delete priceData.value[`binance_${symbol}`]
    delete priceData.value[`okx_${symbol}`]
    
    // 清理历史数据
    delete tickHistory.value[symbol]
    
    // 清理实时统计数据
    delete realtimeStats.value[symbol]
    
    console.log(`[${symbol}] 交易对数据已完全清理：队列、协程、价格数据、历史数据、统计数据`)
  }

  // 启动所有交易对的匹配协程
  const startAllMatchers = () => {
    selectedSymbols.value.forEach(symbol => {
      startSymbolMatcher(symbol)
    })
    console.log('所有交易对的独立匹配协程已启动')
  }

  // 停止所有交易对的匹配协程
  const stopAllMatchers = () => {
    Object.keys(symbolQueues.value).forEach(symbol => {
      stopSymbolMatcher(symbol)
    })
    console.log('所有交易对的独立匹配协程已停止')
  }

  // 数据匹配协程（现在主要用于清理过期数据）
  const startMatcherCoroutine = () => {
    // 这个函数现在只是启动所有交易对的独立协程
    startAllMatchers()
  }

  // 停止匹配协程
  const stopMatcherCoroutine = () => {
    // 这个函数现在只是停止所有交易对的独立协程
    stopAllMatchers()
  }

  // 获取格式化的价格数据
  const getFormattedPriceData = computed(() => {
    const result = selectedSymbols.value.map(symbol => {
      const binanceKey = `binance_${symbol}`
      const okxKey = `okx_${symbol}`
      const binanceData = priceData.value[binanceKey]
      const okxData = priceData.value[okxKey]
      
      const spread = calculateSpread(binanceData, okxData)
      
      const rowData = {
        symbol,
        binance: binanceData,
        okx: okxData,
        spread,
        lastUpdate: Math.max(
          binanceData?.timestamp || 0,
          okxData?.timestamp || 0
        )
      }
      
      return rowData
    })
    
    return result
  })

  // 设置选中的交易对
  const setSelectedSymbols = async (symbols) => {
    // 先停止所有现有的协程
    stopAllMatchers()
    
    selectedSymbols.value = symbols
    
    // 重置实时统计数据
    realtimeStats.value = {}
    
    // 重置匹配统计数据
    matchStats.value = {
      successfulMatches: 0,
      discardedMatches: 0,
      totalBinanceQueue: 0,
      totalOKXQueue: 0,
      queueDetails: {}
    }
    
    // 清理不再使用的交易对的所有相关数据
    const symbolsSet = new Set(symbols)
    Object.keys(symbolQueues.value).forEach(symbol => {
      if (!symbolsSet.has(symbol)) {
        // 使用新的统一清理函数
        clearSymbolData(symbol)
      }
    })
    
    // 清理priceData中可能残留的数据（额外安全检查）
    Object.keys(priceData.value).forEach(key => {
      const symbol = key.replace(/^(binance_|okx_)/, '')
      if (!symbolsSet.has(symbol)) {
        delete priceData.value[key]
        console.log(`[${symbol}] 清理残留的价格数据: ${key}`)
      }
    })
    
    // 清理tickHistory中可能残留的数据
    Object.keys(tickHistory.value).forEach(symbol => {
      if (!symbolsSet.has(symbol)) {
        delete tickHistory.value[symbol]
        console.log(`[${symbol}] 清理残留的历史数据`)
      }
    })
    
    console.log(`队列清理完成，当前选中交易对: [${symbols.join(', ')}]`)
    console.log(`剩余队列数量: ${Object.keys(symbolQueues.value).length}`)
    console.log(`剩余价格数据: ${Object.keys(priceData.value).length}`)
    console.log(`剩余历史数据: ${Object.keys(tickHistory.value).length}`)
    
    // 初始化队列（只为新的交易对创建队列和启动协程）
    initializeQueues()
    
    // 异步连接WebSocket
    await connectWebSockets()
    
    // 获取所有交易对的Funding Rate
    if (symbols.length > 0) {
      setTimeout(() => {
        fetchAllFundingRates()
      }, 1000) // 延迟1秒获取，确保其他初始化完成
    }
  }

  // 连接WebSocket
  const connectWebSockets = async () => {
    // 断开现有连接
    disconnectWebSockets()
    
    if (selectedSymbols.value.length === 0) return

    console.log('开始连接WebSocket，交易对:', selectedSymbols.value)

    try {
      // 初始化队列（协程已在initializeQueues中启动）
      initializeQueues()
      
      // 并行连接Binance和OKX WebSocket
      await Promise.all([
        connectBinanceWS(),
        connectOKXWS()
      ])
      
      // 启动状态检查
      startStatusCheck()
      
      isConnected.value = true
      console.log('所有WebSocket连接完成，各交易对的独立协程已启动')
    } catch (error) {
      console.error('WebSocket连接失败:', error)
      isConnected.value = false
      throw error
    }
  }

  // 连接Binance WebSocket
  const connectBinanceWS = () => {
    return new Promise((resolve, reject) => {
      const promises = selectedSymbols.value.map(ccxtSymbol => {
        return new Promise((resolveSymbol, rejectSymbol) => {
          const binanceSymbol = convertToBinanceFormat(ccxtSymbol)
          if (!binanceSymbol) {
            rejectSymbol(new Error(`无法转换交易对格式: ${ccxtSymbol}`))
            return
          }
          
          const wsUrl = `wss://fstream.binance.com/ws/${binanceSymbol.toLowerCase()}@bookTicker`
          console.log(`连接Binance合约WebSocket: ${wsUrl}`)
          const ws = new WebSocket(wsUrl)
          
          let isResolved = false
          
          ws.onopen = () => {
            console.log(`Binance WebSocket连接成功: ${ccxtSymbol} (${binanceSymbol})`)
            if (!isResolved) {
              isResolved = true
              resolveSymbol(ws)
            }
          }
          
          ws.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data)
              const binanceSymbol = data.s
              const ccxtSymbol = convertFromBinanceFormat(binanceSymbol)
              
              console.log(`Binance数据接收: ${ccxtSymbol}, 买一: ${data.b}, 卖一: ${data.a}, 原始时间戳: ${data.E || data.T || 'N/A'}`)
              
              // 添加到Binance队列
              addToBinanceQueue(ccxtSymbol, data)
              
            } catch (error) {
              console.error('Binance数据解析错误:', error)
            }
          }
          
          ws.onerror = (error) => {
            console.error(`Binance WebSocket错误 ${ccxtSymbol}:`, error)
            if (!isResolved) {
              isResolved = true
              rejectSymbol(error)
            }
          }
          
          ws.onclose = (event) => {
            console.log(`Binance WebSocket断开: ${ccxtSymbol}, 代码: ${event.code}`)
            if (event.code !== 1000) {
              isConnected.value = false
            }
          }
          
          // 存储WebSocket连接
          if (!wsConnections.value.binance) {
            wsConnections.value.binance = {}
          }
          wsConnections.value.binance[ccxtSymbol] = ws
          
          // 设置超时
          setTimeout(() => {
            if (!isResolved) {
              isResolved = true
              rejectSymbol(new Error(`Binance WebSocket连接超时: ${ccxtSymbol}`))
            }
          }, 10000)
        })
      })
      
      Promise.all(promises)
        .then(() => resolve())
        .catch(reject)
    })
  }

  // 将CCXT格式转换为Binance格式
  const convertToBinanceFormat = (ccxtSymbol) => {
    // BTC/USDT:USDT -> BTCUSDT (合约格式)
    if (!ccxtSymbol || typeof ccxtSymbol !== 'string') {
      console.warn('Invalid CCXT symbol:', ccxtSymbol)
      return ''
    }
    // 对于合约交易对，格式是 BASE + QUOTE
    const parts = ccxtSymbol.split('/')
    if (parts.length !== 2) return ''
    
    const base = parts[0]
    const quote = parts[1].split(':')[0] // 移除 :USDT 部分
    return base + quote // 例如: BTCUSDT
  }

  // 将CCXT格式转换为OKX格式
  const convertToOKXFormat = (ccxtSymbol) => {
    // BTC/USDT:USDT -> BTC-USDT-SWAP
    if (!ccxtSymbol || typeof ccxtSymbol !== 'string') {
      console.warn('Invalid CCXT symbol:', ccxtSymbol)
      return ''
    }
    const parts = ccxtSymbol.split('/')
    if (parts.length !== 2) return ''
    
    const base = parts[0]
    const quote = parts[1].split(':')[0]
    return `${base}-${quote}-SWAP`
  }

  // 将OKX格式转换为CCXT格式
  const convertFromOKXFormat = (okxSymbol) => {
    // BTC-USDT-SWAP -> BTC/USDT:USDT
    if (!okxSymbol || typeof okxSymbol !== 'string') {
      console.warn('Invalid OKX symbol:', okxSymbol)
      return ''
    }
    const parts = okxSymbol.replace('-SWAP', '').split('-')
    if (parts.length !== 2) return ''
    
    return `${parts[0]}/${parts[1]}:${parts[1]}`
  }

  // 将Binance格式转换为CCXT格式
  const convertFromBinanceFormat = (binanceSymbol) => {
    // BTCUSDT -> BTC/USDT:USDT (合约格式)
    if (!binanceSymbol || typeof binanceSymbol !== 'string') {
      console.warn('Invalid Binance symbol:', binanceSymbol)
      return ''
    }
    
    // 对于USDT合约，假设都是以USDT结尾
    if (binanceSymbol.endsWith('USDT')) {
      const base = binanceSymbol.replace('USDT', '')
      return `${base}/USDT:USDT`
    }
    
    // 如果不是USDT结尾，尝试其他常见的quote货币
    const commonQuotes = ['BUSD', 'BTC', 'ETH', 'BNB']
    for (const quote of commonQuotes) {
      if (binanceSymbol.endsWith(quote)) {
        const base = binanceSymbol.replace(quote, '')
        return `${base}/${quote}:${quote}`
      }
    }
    
    return binanceSymbol
  }

  // 连接OKX WebSocket
  const connectOKXWS = () => {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket('wss://ws.okx.com:8443/ws/v5/public')
      
      let isResolved = false
      let isSubscribed = false
      
      ws.onopen = () => {
        console.log('OKX WebSocket连接成功')
        
        // 订阅ticker数据，转换交易对格式
        const subscribeMsg = {
          op: 'subscribe',
          args: selectedSymbols.value.map(ccxtSymbol => ({
            channel: 'bbo-tbt',
            instId: convertToOKXFormat(ccxtSymbol)
          }))
        }
        
        console.log('OKX订阅消息:', subscribeMsg)
        ws.send(JSON.stringify(subscribeMsg))
      }
      
      ws.onmessage = (event) => {
        try {
          const response = JSON.parse(event.data)
          // console.log('OKX WebSocket消息:', response)
          
          // 处理订阅确认消息
          if (response.event) {
            if (response.event === 'subscribe') {
              console.log('OKX订阅成功:', response)
              if (!isResolved) {
                isResolved = true
                isSubscribed = true
                resolve()
              }
            } else if (response.event === 'error') {
              console.error('OKX订阅错误:', response)
              if (!isResolved) {
                isResolved = true
                reject(new Error(`OKX订阅失败: ${response.msg}`))
              }
            }
            return
          }
          
          // 处理数据消息
          if (response.arg && response.data && Array.isArray(response.data)) {
            const instId = response.arg.instId
            
            response.data.forEach(item => {
              if (!item.bids || !item.asks || item.bids.length === 0 || item.asks.length === 0) {
                console.warn('OKX数据不完整:', item)
                return
              }
              
              const ccxtSymbol = convertFromOKXFormat(instId)
              
              if (!ccxtSymbol) {
                console.warn('无法转换OKX交易对格式:', instId)
                return
              }
              
              console.log(`OKX数据接收: ${ccxtSymbol}, 买一: ${item.bids[0][0]}, 卖一: ${item.asks[0][0]}, 原始时间戳: ${item.ts || 'N/A'}`)
              
              // 添加到OKX队列
              addToOKXQueue(ccxtSymbol, item)
            })
          }
        } catch (error) {
          console.error('OKX数据解析错误:', error)
        }
      }
      
      ws.onerror = (error) => {
        console.error('OKX WebSocket错误:', error)
        if (!isResolved) {
          isResolved = true
          reject(error)
        }
      }
      
      ws.onclose = (event) => {
        console.log(`OKX WebSocket断开, 代码: ${event.code}`)
        if (event.code !== 1000) {
          isConnected.value = false
        }
      }
      
      wsConnections.value.okx = ws
      
      // 设置连接超时
      setTimeout(() => {
        if (!isResolved) {
          isResolved = true
          reject(new Error('OKX WebSocket连接超时'))
        }
      }, 10000)
    })
  }

  // 保存tick历史数据
  const saveTickHistory = (symbol, historyData) => {
    if (!tickHistory.value[symbol]) {
      tickHistory.value[symbol] = []
    }
    
    if (historyData) {
      // 确保历史数据包含所有必要字段
      const tickData = {
        timestamp: historyData.timestamp,
        buyBinanceSellOkx: historyData.buyBinanceSellOkx,
        sellBinanceBuyOkx: historyData.sellBinanceBuyOkx,
        timeDiff: historyData.timeDiff || 0,
        // 保存完整的价格数据
        binanceData: historyData.binanceData || null,
        okxData: historyData.okxData || null
      }
      
      tickHistory.value[symbol].push(tickData)
      
      console.log(`历史数据已保存: ${symbol}, 当前历史数据数量: ${tickHistory.value[symbol].length}`)
      console.log('完整历史数据:', {
        timestamp: new Date(tickData.timestamp).toLocaleTimeString(),
        buyBinanceSellOkx: tickData.buyBinanceSellOkx,
        sellBinanceBuyOkx: tickData.sellBinanceBuyOkx,
        timeDiff: tickData.timeDiff,
        binanceBid: tickData.binanceData?.bidPrice,
        binanceAsk: tickData.binanceData?.askPrice,
        okxBid: tickData.okxData?.bidPrice,
        okxAsk: tickData.okxData?.askPrice
      })
      
      // 只保留配置的历史数据数量
      if (tickHistory.value[symbol].length > systemConfig.value.historyRetentionCount) {
        const removed = tickHistory.value[symbol].splice(0, tickHistory.value[symbol].length - systemConfig.value.historyRetentionCount)
        console.log(`历史数据超限，移除了 ${removed.length} 个旧数据点`)
      }
    }
  }

  // 断开WebSocket连接
  const disconnectWebSockets = () => {
    // 停止所有交易对的匹配协程
    stopAllMatchers()
    
    // 停止状态检查
    stopStatusCheck()
    
    // 清空所有队列和协程
    symbolQueues.value = {}
    
    // 重置实时统计数据
    realtimeStats.value = {}
    
    // 重置匹配统计数据
    matchStats.value = {
      successfulMatches: 0,
      discardedMatches: 0,
      totalBinanceQueue: 0,
      totalOKXQueue: 0,
      queueDetails: {}
    }
    
    // 断开Binance连接
    if (wsConnections.value.binance) {
      if (typeof wsConnections.value.binance === 'object') {
        // 多个连接的情况
        Object.values(wsConnections.value.binance).forEach(ws => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.close()
          }
        })
      } else {
        // 单个连接的情况
        if (wsConnections.value.binance.readyState === WebSocket.OPEN) {
          wsConnections.value.binance.close()
        }
      }
    }
    
    // 断开OKX连接
    if (wsConnections.value.okx && wsConnections.value.okx.readyState === WebSocket.OPEN) {
      wsConnections.value.okx.close()
    }
    
    wsConnections.value = {}
    isConnected.value = false
    console.log('所有WebSocket连接已断开，所有队列和协程已清空，实时统计数据已重置')
  }

  // 获取指定交易对的历史数据
  const getTickHistory = (symbol) => {
    return tickHistory.value[symbol] || []
  }

  // 检查WebSocket连接状态
  const checkConnectionStatus = () => {
    let binanceConnected = false
    let okxConnected = false
    
    // 检查Binance连接
    if (wsConnections.value.binance) {
      if (typeof wsConnections.value.binance === 'object') {
        binanceConnected = Object.values(wsConnections.value.binance).some(ws => 
          ws && ws.readyState === WebSocket.OPEN
        )
      } else {
        binanceConnected = wsConnections.value.binance.readyState === WebSocket.OPEN
      }
    }
    
    // 检查OKX连接
    if (wsConnections.value.okx) {
      okxConnected = wsConnections.value.okx.readyState === WebSocket.OPEN
    }
    
    const newStatus = binanceConnected && okxConnected
    if (isConnected.value !== newStatus) {
      isConnected.value = newStatus
      console.log('连接状态变化:', { binanceConnected, okxConnected, overall: newStatus })
    }
    
    return newStatus
  }

  // 定期检查连接状态
  let statusCheckInterval = null
  
  const startStatusCheck = () => {
    if (statusCheckInterval) {
      clearInterval(statusCheckInterval)
    }
    statusCheckInterval = setInterval(checkConnectionStatus, 5000) // 每5秒检查一次
  }
  
  const stopStatusCheck = () => {
    if (statusCheckInterval) {
      clearInterval(statusCheckInterval)
      statusCheckInterval = null
    }
  }

  // 强制刷新价格数据显示
  const forceUpdatePriceData = () => {
    // 强制触发响应式更新
    const temp = { ...priceData.value }
    priceData.value = temp
    console.log('强制刷新完成，当前价格数据:', Object.keys(priceData.value).length, '个数据流')
  }

  // 获取实时最大正价差（从网站打开开始计算）- Binance买/OKX卖
  const getRealtimeMaxPositiveSpread = (symbol) => {
    const stats = realtimeStats.value[symbol]
    if (!stats || stats.maxBuyBinanceSellOkx === -Infinity) {
      return 0
    }
    return stats.maxBuyBinanceSellOkx
  }

  // 获取实时最大价差（从网站打开开始计算）- Binance卖/OKX买
  const getRealtimeMaxSellBinanceBuyOkx = (symbol) => {
    const stats = realtimeStats.value[symbol]
    if (!stats || stats.maxSellBinanceBuyOkx === -Infinity) {
      return 0
    }
    return stats.maxSellBinanceBuyOkx
  }

  // 获取实时最大负价差（从网站打开开始计算）
  const getRealtimeMaxNegativeSpread = (symbol) => {
    const stats = realtimeStats.value[symbol]
    if (!stats || stats.maxNegativeSpread === Infinity) {
      return 0
    }
    return stats.maxNegativeSpread
  }

  // 重置实时统计数据
  const resetRealtimeStats = (symbol = null) => {
    if (symbol) {
      if (realtimeStats.value[symbol]) {
        realtimeStats.value[symbol] = {
          maxBuyBinanceSellOkx: -Infinity,  // Binance买/OKX卖的最大价差
          maxSellBinanceBuyOkx: -Infinity,  // Binance卖/OKX买的最大价差
          maxNegativeSpread: Infinity,
          startTime: Date.now()
        }
        console.log(`已重置 ${symbol} 的实时统计数据`)
      }
    } else {
      // 重置所有交易对的统计数据
      Object.keys(realtimeStats.value).forEach(sym => {
        realtimeStats.value[sym] = {
          maxBuyBinanceSellOkx: -Infinity,  // Binance买/OKX卖的最大价差
          maxSellBinanceBuyOkx: -Infinity,  // Binance卖/OKX买的最大价差
          maxNegativeSpread: Infinity,
          startTime: Date.now()
        }
      })
      console.log('已重置所有交易对的实时统计数据')
    }
  }

  // 手动添加测试数据
  const addTestData = (symbol = 'BTC/USDT:USDT') => {
    // 确保交易对被选中
    if (!selectedSymbols.value.includes(symbol)) {
      selectedSymbols.value.push(symbol)
      console.log(`已自动选中交易对: ${symbol}`)
    }
    
    // 如果没有合约大小数据，手动设置一些测试值
    if (Object.keys(contractSizes.value).length === 0) {
      const testContractSizes = {
        'BTC/USDT:USDT': 0.01,
        'ETH/USDT:USDT': 0.1,
        'BNB/USDT:USDT': 1,
        'SOL/USDT:USDT': 1,
        'XRP/USDT:USDT': 1,
        'ADA/USDT:USDT': 1,
        'DOGE/USDT:USDT': 1
      }
      contractSizes.value = testContractSizes
      console.log('已设置测试合约大小:', testContractSizes)
    }
    
    // 初始化队列
    initializeQueues()
    
    const basePrice = 50000
    const binanceBid = (basePrice + Math.random() * 100 - 50).toFixed(2)
    const binanceAsk = (parseFloat(binanceBid) + Math.random() * 10 + 1).toFixed(2)
    const okxBid = (basePrice + Math.random() * 100 - 50).toFixed(2)
    const okxAsk = (parseFloat(okxBid) + Math.random() * 10 + 1).toFixed(2)
    
    // 模拟Binance数据格式
    const binanceData = {
      s: convertToBinanceFormat(symbol),
      b: binanceBid,
      a: binanceAsk,
      B: '1.0',
      A: '1.0'
    }
    
    // 模拟OKX数据格式 - 使用较大的原始数量来测试合约大小效果
    const okxData = {
      bids: [[okxBid, '100.0']],  // 使用100张合约
      asks: [[okxAsk, '150.0']]   // 使用150张合约
    }
    
    console.log(`准备添加测试数据: ${symbol}`)
    console.log('Binance数据:', { bid: binanceBid, ask: binanceAsk, bidQty: '1.0', askQty: '1.0' })
    console.log('OKX数据:', { bid: okxBid, ask: okxAsk, bidQty: '100.0', askQty: '150.0' })
    console.log('合约大小:', contractSizes.value[symbol] || 1)
    
    // 先添加Binance数据
    addToBinanceQueue(symbol, binanceData)
    
    // 稍微延迟添加OKX数据，模拟真实的网络延迟
    setTimeout(() => {
      addToOKXQueue(symbol, okxData)
    }, Math.random() * 50) // 0-50ms随机延迟
  }

  // 设置可用交易对列表
  const setAvailableSymbols = (symbols) => {
    availableSymbols.value = symbols
    console.log(`已更新可用交易对列表: ${symbols.length} 个交易对`)
  }

  // 设置合约大小映射
  const setContractSizes = (sizes) => {
    contractSizes.value = sizes
    console.log(`已更新合约大小映射:`, sizes)
  }

  // 获取当前合约大小映射（调试用）
  const getContractSizes = () => {
    return contractSizes.value
  }

  // 检查合约大小映射状态
  const checkContractSizes = () => {
    console.log('=== 当前合约大小映射状态 ===')
    console.log('映射数量:', Object.keys(contractSizes.value).length)
    console.log('详细映射:', contractSizes.value)
    console.log('===============================')
    return contractSizes.value
  }

  // ============ 系统配置管理函数 ============
  
  // 获取当前系统配置
  const getSystemConfig = () => {
    return { ...systemConfig.value }
  }
  
  // 更新系统配置（部分更新）
  const updateSystemConfig = (newConfig) => {
    const oldConfig = { ...systemConfig.value }
    systemConfig.value = { ...systemConfig.value, ...newConfig }
    
    console.log('=== 系统配置已更新 ===')
    console.log('旧配置:', oldConfig)
    console.log('新配置:', systemConfig.value)
    console.log('更新项:', newConfig)
    console.log('=========================')
    
    // 如果清理间隔发生变化，需要重启所有匹配协程
    if (newConfig.cleanupInterval && newConfig.cleanupInterval !== oldConfig.cleanupInterval) {
      console.log('清理间隔发生变化，重启所有匹配协程...')
      restartAllMatchers()
    }
    
    return systemConfig.value
  }
  
  // 重置系统配置为默认值
  const resetSystemConfig = () => {
    const defaultConfig = {
      maxTimeDiff: 1000,           
      dataExpirationTime: 1000,   
      cleanupInterval: 5000,      
      maxQueueSize: 100,          
      historyRetentionCount: 2000, 
      timeMatchingMode: 'receiveTime',
      maxLocalTimeDiff: 500       // 最大本地时间差(ms) - 原始时间戳与本地时间的最大允许差异
    }
    
    systemConfig.value = defaultConfig
    console.log('系统配置已重置为默认值:', defaultConfig)
    
    // 重启所有匹配协程以应用新配置
    restartAllMatchers()
    
    return systemConfig.value
  }
  
  // 重启所有匹配协程（配置变更时使用）
  const restartAllMatchers = () => {
    console.log('重启所有匹配协程以应用新配置...')
    stopAllMatchers()
    // 稍微延迟后重新启动，确保旧协程完全停止
    setTimeout(() => {
      startAllMatchers()
      console.log('所有匹配协程已使用新配置重启')
    }, 100)
  }
  
  // 获取配置项说明
  const getConfigDescription = () => {
    return {
      maxTimeDiff: {
        name: '匹配最大时间差',
        description: '两个交易所数据匹配时允许的最大时间差（毫秒）',
        unit: 'ms',
        defaultValue: 1000,
        recommendedRange: '500-5000'
      },
      dataExpirationTime: {
        name: '数据匹配过期时间',
        description: '队列中数据的匹配过期时间，超过此时间的数据将被清理且不再参与匹配（毫秒）',
        unit: 'ms',
        defaultValue: 1000,
        recommendedRange: '500-3000'
      },
      cleanupInterval: {
        name: '清理间隔',
        description: '多久执行一次过期数据清理（毫秒）',
        unit: 'ms',
        defaultValue: 5000,
        recommendedRange: '100-10000'
      },
      maxQueueSize: {
        name: '队列最大容量',
        description: '每个队列最多保留的数据点数',
        unit: '个',
        defaultValue: 100,
        recommendedRange: '10-1000'
      },
      historyRetentionCount: {
        name: '历史数据保留数量',
        description: '最多保留的历史tick数量',
        unit: '个',
        defaultValue: 2000,
        recommendedRange: '1000-10000'
      },
      timeMatchingMode: {
        name: '时间匹配模式',
        description: '使用原始时间戳还是接收时间进行匹配',
        defaultValue: 'receiveTime',
        recommendedRange: 'originalTimestamp | receiveTime'
      },
      maxLocalTimeDiff: {
        name: '最大本地时间差',
        description: '原始时间戳与本地时间的最大允许差异（毫秒）',
        unit: 'ms',
        defaultValue: 500,
        recommendedRange: '100-2000'
      }
    }
  }
  
  // 验证配置值的合理性
  const validateConfig = (config) => {
    const errors = []
    
    if (config.maxTimeDiff && (config.maxTimeDiff < 500 || config.maxTimeDiff > 5000)) {
      errors.push('maxTimeDiff 应该在 500-5000ms 之间')
    }
    
    if (config.dataExpirationTime && (config.dataExpirationTime < 100 || config.dataExpirationTime > 5000)) {
      errors.push('dataExpirationTime 应该在 100-5000ms 之间')
    }
    
    if (config.cleanupInterval && (config.cleanupInterval < 100 || config.cleanupInterval > 10000)) {
      errors.push('cleanupInterval 应该在 100-10000ms 之间')
    }
    
    if (config.maxQueueSize && (config.maxQueueSize < 10 || config.maxQueueSize > 1000)) {
      errors.push('maxQueueSize 应该在 10-1000 之间')
    }
    
    if (config.historyRetentionCount && (config.historyRetentionCount < 100 || config.historyRetentionCount > 10000)) {
      errors.push('historyRetentionCount 应该在 100-10000 之间')
    }
    
    if (config.maxLocalTimeDiff && (config.maxLocalTimeDiff < 100 || config.maxLocalTimeDiff > 2000)) {
      errors.push('maxLocalTimeDiff 应该在 100-2000ms 之间')
    }
    
    return errors
  }
  
  // 安全更新系统配置（带验证）
  const safeUpdateSystemConfig = (newConfig) => {
    const errors = validateConfig(newConfig)
    
    if (errors.length > 0) {
      console.error('配置验证失败:', errors)
      throw new Error(`配置验证失败: ${errors.join(', ')}`)
    }
    
    return updateSystemConfig(newConfig)
  }

  // ============ Funding Rate 相关函数 ============
  
  // 获取Binance历史Funding Rate（用于计算周期）
  const fetchBinanceFundingRateHistory = async (symbol, limit = 5) => {
    try {
      const binanceSymbol = convertToBinanceFormat(symbol)
      if (!binanceSymbol) {
        throw new Error(`无法转换Binance交易对格式: ${symbol}`)
      }
      
      const response = await fetch(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${binanceSymbol}&limit=${limit}`)
      const data = await response.json()
      
      if (data.code) {
        throw new Error(`Binance历史Funding Rate API错误: ${data.msg}`)
      }
      
      return data
    } catch (error) {
      console.error(`获取Binance历史Funding Rate失败 ${symbol}:`, error)
      return []
    }
  }
  
  // 计算Funding Rate周期（小时）
  const calculateFundingRatePeriod = (historyData) => {
    if (!historyData || historyData.length < 2) {
      return 8 // 默认8小时周期
    }
    
    // 取最近两次funding rate的时间差
    const latest = historyData[0]
    const previous = historyData[1]
    
    const timeDiff = parseInt(latest.fundingTime) - parseInt(previous.fundingTime)
    const hours = Math.round(timeDiff / (1000 * 60 * 60))
    
    // 验证周期合理性（通常是8小时，但有些可能是1小时、4小时等）
    const validPeriods = [1, 4, 8, 12, 24]
    const closestPeriod = validPeriods.reduce((prev, curr) => 
      Math.abs(curr - hours) < Math.abs(prev - hours) ? curr : prev
    )
    
    return closestPeriod
  }
  
  // 获取Binance Funding Rate（增强版，包含周期计算）
  const fetchBinanceFundingRate = async (symbol) => {
    try {
      const binanceSymbol = convertToBinanceFormat(symbol)
      if (!binanceSymbol) {
        throw new Error(`无法转换Binance交易对格式: ${symbol}`)
      }
      
      // 并行获取当前数据和历史数据
      const [currentResponse, historyData] = await Promise.all([
        fetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${binanceSymbol}`),
        fetchBinanceFundingRateHistory(symbol, 5)
      ])
      
      const currentData = await currentResponse.json()
      
      if (currentData.code) {
        throw new Error(`Binance API错误: ${currentData.msg}`)
      }
      
      // 计算funding rate周期
      const period = calculateFundingRatePeriod(historyData)
      
      return {
        symbol: binanceSymbol,
        fundingRate: parseFloat(currentData.lastFundingRate),
        nextFundingTime: parseInt(currentData.nextFundingTime),
        fundingCountdown: parseInt(currentData.nextFundingTime) - Date.now(),
        indexPrice: parseFloat(currentData.indexPrice),
        markPrice: parseFloat(currentData.markPrice),
        period: period, // 周期（小时）
        historyData: historyData // 保存历史数据以备用
      }
    } catch (error) {
      console.error(`获取Binance Funding Rate失败 ${symbol}:`, error)
      return null
    }
  }
  
  // 获取OKX历史Funding Rate（用于计算周期）
  const fetchOKXFundingRateHistory = async (symbol, limit = 5) => {
    try {
      const okxSymbol = convertToOKXFormat(symbol)
      if (!okxSymbol) {
        throw new Error(`无法转换OKX交易对格式: ${symbol}`)
      }
      
      const response = await fetch(`https://www.okx.com/api/v5/public/funding-rate-history?instId=${okxSymbol}&limit=${limit}`)
      const data = await response.json()
      
      if (data.code !== '0') {
        throw new Error(`OKX历史Funding Rate API错误: ${data.msg}`)
      }
      
      return data.data || []
    } catch (error) {
      console.error(`获取OKX历史Funding Rate失败 ${symbol}:`, error)
      return []
    }
  }
  
  // 获取OKX Funding Rate（增强版，包含周期计算）
  const fetchOKXFundingRate = async (symbol) => {
    try {
      const okxSymbol = convertToOKXFormat(symbol)
      if (!okxSymbol) {
        throw new Error(`无法转换OKX交易对格式: ${symbol}`)
      }
      
      // 并行获取当前数据和历史数据
      const [currentResponse, historyData] = await Promise.all([
        fetch(`https://www.okx.com/api/v5/public/funding-rate?instId=${okxSymbol}`),
        fetchOKXFundingRateHistory(symbol, 5)
      ])
      
      const currentData = await currentResponse.json()
      
      if (currentData.code !== '0') {
        throw new Error(`OKX API错误: ${currentData.msg}`)
      }
      
      if (!currentData.data || currentData.data.length === 0) {
        throw new Error('OKX API返回空数据')
      }
      
      // 计算OKX的funding rate周期
      let period = 8 // 默认8小时
      if (historyData && historyData.length >= 2) {
        const latest = historyData[0]
        const previous = historyData[1]
        const timeDiff = parseInt(latest.fundingTime) - parseInt(previous.fundingTime)
        const hours = Math.round(timeDiff / (1000 * 60 * 60))
        
        const validPeriods = [1, 4, 8, 12, 24]
        period = validPeriods.reduce((prev, curr) => 
          Math.abs(curr - hours) < Math.abs(prev - hours) ? curr : prev
        )
      }
      
      const fundingData = currentData.data[0]
      return {
        symbol: okxSymbol,
        fundingRate: parseFloat(fundingData.fundingRate),
        nextFundingTime: parseInt(fundingData.fundingTime),
        fundingCountdown: parseInt(fundingData.fundingTime) - Date.now(),
        realizedRate: parseFloat(fundingData.realizedRate),
        period: period, // 周期（小时）
        historyData: historyData // 保存历史数据以备用
      }
    } catch (error) {
      console.error(`获取OKX Funding Rate失败 ${symbol}:`, error)
      return null
    }
  }
  
  // 获取单个交易对的Funding Rate
  const fetchFundingRateForSymbol = async (symbol) => {
    console.log(`开始获取 ${symbol} 的Funding Rate...`)
    
    const [binanceData, okxData] = await Promise.all([
      fetchBinanceFundingRate(symbol),
      fetchOKXFundingRate(symbol)
    ])
    
    if (binanceData || okxData) {
      fundingRates.value[symbol] = {
        binance: binanceData,
        okx: okxData,
        lastUpdate: Date.now()
      }
      
      console.log(`${symbol} Funding Rate获取完成:`, {
        binance: binanceData?.fundingRate,
        okx: okxData?.fundingRate,
        binanceNext: binanceData?.nextFundingTime ? new Date(binanceData.nextFundingTime).toLocaleString() : 'N/A',
        okxNext: okxData?.nextFundingTime ? new Date(okxData.nextFundingTime).toLocaleString() : 'N/A'
      })
    }
  }
  
  // 获取所有选中交易对的Funding Rate
  const fetchAllFundingRates = async () => {
    console.log('开始获取所有交易对的Funding Rate...')
    
    const promises = selectedSymbols.value.map(symbol => fetchFundingRateForSymbol(symbol))
    await Promise.allSettled(promises)
    
    console.log('所有Funding Rate获取完成')
  }
  
  // 格式化Funding Rate显示
  const formatFundingRate = (rate) => {
    if (rate === null || rate === undefined) return 'N/A'
    return `${(rate * 100).toFixed(4)}%`
  }
  
  // 格式化Funding Rate周期显示
  const formatFundingRatePeriod = (period) => {
    if (!period) return '8h' // 默认8小时
    return `${period}h`
  }
  
  // 格式化下次Funding时间（倒计时显示）
  const formatNextFundingTime = (timestamp) => {
    if (!timestamp) return 'N/A'
    
    const now = Date.now()
    const diff = timestamp - now
    
    if (diff <= 0) return '即将开始'
    
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    
    return `${hours}h ${minutes}m`
  }
  
  // 仅格式化倒计时（可选使用）
  const formatFundingCountdown = (timestamp) => {
    if (!timestamp) return 'N/A'
    
    const now = Date.now()
    const diff = timestamp - now
    
    if (diff <= 0) return '即将开始'
    
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    
    return `${hours}h ${minutes}m`
  }
  
  // 获取Funding Rate数据
  const getFundingRates = () => {
    return fundingRates.value
  }

  return {
    selectedSymbols,
    availableSymbols,
    priceData,
    isConnected,
    matchStats,
    symbolQueues,
    fundingRates,
    getFormattedPriceData,
    setSelectedSymbols,
    connectWebSockets,
    disconnectWebSockets,
    getTickHistory,
    startStatusCheck,
    stopStatusCheck,
    addTestData,
    saveTickHistory,
    tickHistory,
    startMatcherCoroutine,
    stopMatcherCoroutine,
    startSymbolMatcher,
    stopSymbolMatcher,
    startAllMatchers,
    stopAllMatchers,
    getRealtimeMaxPositiveSpread,
    getRealtimeMaxSellBinanceBuyOkx,
    getRealtimeMaxNegativeSpread,
    resetRealtimeStats,
    setAvailableSymbols,
    setContractSizes,
    getContractSizes,
    checkContractSizes,
    addToBinanceQueue,
    addToOKXQueue,
    convertToBinanceFormat,
    clearSymbolData,
    getSystemConfig,
    updateSystemConfig,
    resetSystemConfig,
    restartAllMatchers,
    getConfigDescription,
    validateConfig,
    safeUpdateSystemConfig,
    fetchFundingRateForSymbol,
    fetchAllFundingRates,
    formatFundingRate,
    formatFundingRatePeriod,
    formatNextFundingTime,
    formatFundingCountdown,
    getFundingRates
  }
}) 