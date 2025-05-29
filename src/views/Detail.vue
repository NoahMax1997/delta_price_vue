<template>
  <div class="detail">
    <!-- 页面头部 -->
    <el-card class="header-card" shadow="hover">
      <div class="detail-header">
        <el-button @click="goBack" type="primary" plain>
          <el-icon><ArrowLeft /></el-icon>
          返回主页面 (监听继续)
        </el-button>
        <h2>{{ decodedSymbol }} 价差详情</h2>
        <div class="header-info">
          <el-tag 
            :type="priceStore.isConnected ? 'success' : 'danger'"
            style="margin-right: 8px"
          >
            {{ priceStore.isConnected ? '实时连接' : '连接断开' }}
          </el-tag>
          <el-tag type="info">历史数据: {{ tickHistory.length }} 个tick</el-tag>
        </div>
      </div>
    </el-card>

    <!-- 实时数据卡片 -->
    <el-row :gutter="20" class="info-cards">
      <el-col :span="12">
        <el-card shadow="hover" class="info-card">
          <template #header>
            <div class="card-header">
              <el-icon><TrendCharts /></el-icon>
              <span>Binance买/OKX卖</span>
            </div>
          </template>
          <div class="spread-value">
            <span 
              class="value" 
              :class="getSpreadClass(currentSpread?.buyBinanceSellOkx)"
            >
              {{ currentSpread?.buyBinanceSellOkx?.toFixed(4) || '-' }}%
            </span>
            <div class="description">买入Binance，卖出OKX的价差率</div>
          </div>
        </el-card>
      </el-col>
      
      <el-col :span="12">
        <el-card shadow="hover" class="info-card">
          <template #header>
            <div class="card-header">
              <el-icon><TrendCharts /></el-icon>
              <span>Binance卖/OKX买</span>
            </div>
          </template>
          <div class="spread-value">
            <span 
              class="value" 
              :class="getSpreadClass(currentSpread?.sellBinanceBuyOkx)"
            >
              {{ currentSpread?.sellBinanceBuyOkx?.toFixed(4) || '-' }}%
            </span>
            <div class="description">卖出Binance，买入OKX的价差率</div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 图表区域 -->
    <el-card class="chart-card" shadow="hover">
      <template #header>
        <div class="card-header">
          <span>价差变化曲线</span>
          <div class="chart-controls">
            <el-radio-group v-model="timeRange" @change="updateChart">
              <el-radio-button label="all">全部</el-radio-button>
              <el-radio-button label="1000">最近1000</el-radio-button>
              <el-radio-button label="500">最近500</el-radio-button>
              <el-radio-button label="100">最近100</el-radio-button>
            </el-radio-group>
            <el-button @click="refreshChart" type="primary" size="small">
              <el-icon><Refresh /></el-icon>
              刷新
            </el-button>
          </div>
        </div>
      </template>
      
      <div class="chart-container">
        <v-chart 
          ref="chartRef"
          :option="chartOption" 
          :style="{ height: '500px', width: '100%' }"
          autoresize
        />
      </div>
    </el-card>

    <!-- 统计信息 -->
    <el-card class="stats-card" shadow="hover">
      <template #header>
        <div class="card-header">
          <el-icon><DataAnalysis /></el-icon>
          <span>统计信息</span>
        </div>
      </template>
      
      <el-row :gutter="20">
        <el-col :span="6">
          <div class="stat-item">
            <div class="stat-label">数据点数量</div>
            <div class="stat-value">{{ tickHistory.length }}</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="stat-item">
            <div class="stat-label">Binance买/OKX卖最大价差</div>
            <div class="stat-value positive">{{ maxBuyBinanceSellOkxSpread.toFixed(4) }}%</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="stat-item">
            <div class="stat-label">Binance卖/OKX买最大价差</div>
            <div class="stat-value positive">{{ maxSellBinanceBuyOkxSpread.toFixed(4) }}%</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="stat-item">
            <div class="stat-label">最大负价差</div>
            <div class="stat-value negative">{{ maxNegativeSpread.toFixed(4) }}%</div>
          </div>
        </el-col>
      </el-row>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { usePriceStore } from '../stores/priceStore'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart } from 'echarts/charts'
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  DataZoomComponent,
  ToolboxComponent
} from 'echarts/components'

// 注册ECharts组件
use([
  CanvasRenderer,
  LineChart,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  DataZoomComponent,
  ToolboxComponent
])

const props = defineProps({
  symbol: {
    type: String,
    required: true
  }
})

// 解码URL参数中的交易对符号
const decodedSymbol = computed(() => decodeURIComponent(props.symbol))

const router = useRouter()
const priceStore = usePriceStore()
const chartRef = ref(null)
const timeRange = ref('all')

// 获取历史数据 - 使用解码后的符号
const tickHistory = computed(() => priceStore.getTickHistory(decodedSymbol.value))

// 获取当前价差 - 从store的实时数据中获取
const currentSpread = computed(() => {
  const data = priceStore.getFormattedPriceData.find(item => item.symbol === decodedSymbol.value)
  return data?.spread
})

// 统计信息
const maxBuyBinanceSellOkxSpread = computed(() => {
  if (tickHistory.value.length === 0) return 0
  return Math.max(...tickHistory.value.map(item => item.buyBinanceSellOkx))
})

const maxSellBinanceBuyOkxSpread = computed(() => {
  if (tickHistory.value.length === 0) return 0
  return Math.max(...tickHistory.value.map(item => item.sellBinanceBuyOkx))
})

const maxNegativeSpread = computed(() => {
  if (tickHistory.value.length === 0) return 0
  return Math.min(...tickHistory.value.map(item => 
    Math.min(item.buyBinanceSellOkx, item.sellBinanceBuyOkx)
  ))
})

const averageSpread = computed(() => {
  if (tickHistory.value.length === 0) return 0
  const sum = tickHistory.value.reduce((acc, item) => 
    acc + (item.buyBinanceSellOkx + item.sellBinanceBuyOkx) / 2, 0
  )
  return sum / tickHistory.value.length
})

// 图表配置
const chartOption = ref({
  title: {
    text: `${decodedSymbol.value} 价差变化`,
    left: 'center',
    textStyle: {
      color: '#333',
      fontSize: 16
    }
  },
  tooltip: {
    trigger: 'axis',
    axisPointer: {
      type: 'cross'
    },
    formatter: function (params) {
      const time = new Date(params[0].axisValue).toLocaleTimeString()
      let html = `<div style="margin-bottom: 5px;">${time}</div>`
      params.forEach(param => {
        html += `<div style="color: ${param.color};">
          ${param.seriesName}: ${param.value.toFixed(4)}%
        </div>`
      })
      return html
    }
  },
  legend: {
    data: ['Binance买/OKX卖', 'Binance卖/OKX买'],
    top: 30
  },
  grid: {
    left: '3%',
    right: '4%',
    bottom: '15%',
    top: '15%',
    containLabel: true
  },
  toolbox: {
    feature: {
      saveAsImage: {
        title: '保存图片'
      },
      dataZoom: {
        title: {
          zoom: '区域缩放',
          back: '还原'
        }
      }
    }
  },
  xAxis: {
    type: 'time',
    boundaryGap: false,
    axisLabel: {
      formatter: function (value) {
        return new Date(value).toLocaleTimeString()
      }
    }
  },
  yAxis: {
    type: 'value',
    axisLabel: {
      formatter: '{value}%'
    },
    splitLine: {
      lineStyle: {
        color: '#f0f0f0'
      }
    }
  },
  dataZoom: [
    {
      type: 'inside',
      start: 0,
      end: 100
    },
    {
      start: 0,
      end: 100,
      height: 30
    }
  ],
  series: [
    {
      name: 'Binance买/OKX卖',
      type: 'line',
      smooth: true,
      symbol: 'none',
      lineStyle: {
        color: '#67C23A',
        width: 2
      },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(103, 194, 58, 0.3)' },
            { offset: 1, color: 'rgba(103, 194, 58, 0.1)' }
          ]
        }
      },
      data: []
    },
    {
      name: 'Binance卖/OKX买',
      type: 'line',
      smooth: true,
      symbol: 'none',
      lineStyle: {
        color: '#E6A23C',
        width: 2
      },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(230, 162, 60, 0.3)' },
            { offset: 1, color: 'rgba(230, 162, 60, 0.1)' }
          ]
        }
      },
      data: []
    }
  ]
})

// 更新图表数据
const updateChart = () => {
  let data = tickHistory.value
  
  if (timeRange.value !== 'all') {
    const count = parseInt(timeRange.value)
    data = data.slice(-count)
  }
  
  const buyData = data.map(item => [item.timestamp, item.buyBinanceSellOkx])
  const sellData = data.map(item => [item.timestamp, item.sellBinanceBuyOkx])
  
  chartOption.value.series[0].data = buyData
  chartOption.value.series[1].data = sellData
}

// 刷新图表
const refreshChart = () => {
  updateChart()
  nextTick(() => {
    if (chartRef.value) {
      chartRef.value.resize()
    }
  })
}

// 获取价差样式类
const getSpreadClass = (spread) => {
  if (!spread) return ''
  if (spread > 0.1) return 'positive-high'
  if (spread > 0.05) return 'positive'
  if (spread < -0.05) return 'negative'
  return 'neutral'
}

// 返回上一页
const goBack = () => {
  router.push('/')
}

// 监听实时数据变化，自动更新图表
watch([tickHistory, currentSpread], () => {
  nextTick(() => {
    updateChart()
  })
}, { deep: true })

// 组件挂载时初始化图表
onMounted(() => {
  updateChart()
})
</script>

<style scoped>
.detail {
  max-width: 1400px;
  margin: 0 auto;
}

.header-card {
  margin-bottom: 20px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
}

.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.detail-header h2 {
  margin: 0;
  color: #333;
  font-size: 24px;
}

.header-info {
  display: flex;
  align-items: center;
}

.info-cards {
  margin-bottom: 20px;
}

.info-card {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.spread-value {
  text-align: center;
  padding: 20px 0;
}

.value {
  font-size: 32px;
  font-weight: bold;
  display: block;
  margin-bottom: 8px;
}

.value.positive-high {
  color: #67C23A;
}

.value.positive {
  color: #E6A23C;
}

.value.negative {
  color: #F56C6C;
}

.value.neutral {
  color: #909399;
}

.description {
  color: #666;
  font-size: 14px;
}

.chart-card {
  margin-bottom: 20px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
}

.chart-controls {
  display: flex;
  align-items: center;
  gap: 10px;
}

.chart-container {
  padding: 10px 0;
}

.stats-card {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
}

.stat-item {
  text-align: center;
  padding: 20px 0;
}

.stat-label {
  color: #666;
  font-size: 14px;
  margin-bottom: 8px;
}

.stat-value {
  font-size: 24px;
  font-weight: bold;
  color: #333;
}

.stat-value.positive {
  color: #67C23A;
}

.stat-value.negative {
  color: #F56C6C;
}
</style> 