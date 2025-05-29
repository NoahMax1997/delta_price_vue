<template>
  <el-card class="websocket-test" shadow="hover">
    <template #header>
      <div class="card-header">
        <span>WebSocket 诊断面板</span>
        <el-tag :type="isConnected ? 'success' : 'danger'">
          {{ isConnected ? '已连接' : '未连接' }}
        </el-tag>
      </div>
    </template>
    
    <div class="test-content">
      <el-row :gutter="20">
        <el-col :span="12">
          <h4>连接状态</h4>
          <p>选中交易对数量: {{ selectedSymbols.length }}</p>
          <p>WebSocket状态: {{ connectionStatus }}</p>
          <p>数据更新计数: {{ updateCount }}</p>
          <p>最后更新时间: {{ lastUpdateTime }}</p>
        </el-col>
        
        <el-col :span="12">
          <h4>价格数据</h4>
          <div v-for="symbol in selectedSymbols" :key="symbol" class="symbol-data">
            <strong>{{ symbol }}:</strong>
            <div class="exchange-data">
              <div>Binance: {{ getBinanceData(symbol) }}</div>
              <div>OKX: {{ getOKXData(symbol) }}</div>
            </div>
          </div>
        </el-col>
      </el-row>
      
      <el-divider />
      
      <el-row :gutter="20">
        <el-col :span="24">
          <h4>手动测试</h4>
          <el-button @click="testDataUpdate" type="primary">测试数据更新</el-button>
          <el-button @click="clearData" type="danger">清空数据</el-button>
        </el-col>
      </el-row>
      
      <el-divider />
      
      <el-row :gutter="20">
        <el-col :span="24">
          <h4>原始数据调试</h4>
          <el-scrollbar height="200px">
            <pre>{{ JSON.stringify(priceData, null, 2) }}</pre>
          </el-scrollbar>
        </el-col>
      </el-row>
    </div>
  </el-card>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { usePriceStore } from '../stores/priceStore'
import { storeToRefs } from 'pinia'

const priceStore = usePriceStore()
const { selectedSymbols, isConnected, priceData } = storeToRefs(priceStore)

const updateCount = ref(0)
const lastUpdateTime = ref('')

const connectionStatus = computed(() => {
  if (!isConnected.value) return '未连接'
  return `已连接 (${Object.keys(priceData).length} 个数据流)`
})

const getBinanceData = (symbol) => {
  const data = priceData[`binance_${symbol}`]
  if (!data) return '无数据'
  return `买: ${data.bidPrice}, 卖: ${data.askPrice}`
}

const getOKXData = (symbol) => {
  const data = priceData[`okx_${symbol}`]
  if (!data) return '无数据'
  return `买: ${data.bidPrice}, 卖: ${data.askPrice}`
}

// 监听价格数据变化
watch(priceData, () => {
  updateCount.value++
  lastUpdateTime.value = new Date().toLocaleTimeString()
}, { deep: true })

// 测试数据更新
const testDataUpdate = () => {
  console.log('手动测试数据更新')
  if (selectedSymbols.value.length > 0) {
    priceStore.addTestData(selectedSymbols.value[0])
  } else {
    priceStore.addTestData('BTC/USDT:USDT')
  }
}

// 清空数据
const clearData = () => {
  priceStore.priceData = {}
  console.log('数据已清空')
}

onMounted(() => {
  console.log('WebSocket测试组件已挂载')
})
</script>

<style scoped>
.websocket-test {
  margin-top: 20px;
  background: rgba(255, 255, 255, 0.95);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
}

.test-content h4 {
  margin: 0 0 10px 0;
  color: #333;
}

.symbol-data {
  margin-bottom: 10px;
  padding: 5px;
  background: #f5f5f5;
  border-radius: 4px;
}

.exchange-data {
  font-size: 12px;
  color: #666;
  margin-left: 10px;
}

.exchange-data div {
  margin: 2px 0;
}

pre {
  font-size: 11px;
  color: #666;
  background: #f8f9fa;
  padding: 10px;
  border-radius: 4px;
  margin: 0;
}
</style> 