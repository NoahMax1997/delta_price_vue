<template>
  <div class="home">
    <!-- 交易对选择区域 -->
    <el-card class="symbol-selector" shadow="hover">
      <template #header>
        <div class="card-header">
          <span>选择交易对</span>
          <el-tag v-if="selectedSymbols.length > 0" type="success">
            已选择 {{ selectedSymbols.length }} 个交易对
          </el-tag>
        </div>
      </template>
      
      <!-- 交易所组合选择器 -->
      <div class="exchange-selector-container" style="margin-bottom: 20px;">
        <div class="exchange-selector-label">
          <span style="font-weight: bold; color: #409EFF;">选择交易所组合:</span>
        </div>
        <el-select
          v-model="selectedExchangePair"
          placeholder="请选择要比较的交易所组合"
          style="width: 300px; margin-top: 10px;"
          @change="handleExchangePairChange"
        >
          <el-option
            label="Binance ↔ OKX"
            value="binance-okx"
          />
          <el-option
            label="Binance ↔ Bitget"
            value="binance-bitget"
          />
          <el-option
            label="OKX ↔ Bitget"
            value="okx-bitget"
          />
        </el-select>
        <el-tag 
          v-if="selectedExchangePair" 
          type="primary" 
          style="margin-left: 15px;"
        >
          当前组合: {{ getExchangePairLabel(selectedExchangePair) }}
        </el-tag>
      </div>
      
      <el-select
        v-model="selectedSymbols"
        multiple
        filterable
        placeholder="请选择要监控的交易对"
        style="width: 100%"
        @change="handleSymbolChange"
        :disabled="!selectedExchangePair"
      >
        <el-option
          v-for="symbol in availableSymbols"
          :key="symbol"
          :label="symbol"
          :value="symbol"
        />
      </el-select>
      
      <div class="action-buttons">
        <el-button 
          type="success" 
          @click="fetchActiveContracts"
          :loading="isFetchingContracts"
          style="margin-right: 10px;"
          :disabled="!selectedExchangePair"
        >
          <el-icon><Refresh /></el-icon>
          获取活跃合约
        </el-button>
        
        <el-button 
          type="primary" 
          @click="startMonitoring"
          :disabled="selectedSymbols.length === 0 || !selectedExchangePair"
          :loading="isConnecting"
        >
          <el-icon><Connection /></el-icon>
          开始监控
        </el-button>
        
        <el-button 
          type="danger" 
          @click="stopMonitoring"
          :disabled="!isConnected"
        >
          <el-icon><Close /></el-icon>
          停止监控
        </el-button>
        
        <el-button 
          type="success" 
          @click="testData"
        >
          测试数据
        </el-button>
        
        <el-button 
          type="warning" 
          @click="simulateRealTimeData"
        >
          模拟实时更新
        </el-button>
        
        <el-button 
          class="clear-notifications-btn"
          @click="clearArbitrageNotifications"
        >
          <el-icon><Delete /></el-icon>
          清空提示记录
        </el-button>
        
        <el-button 
          type="info" 
          @click="showSystemConfigModal"
        >
          <el-icon><Setting /></el-icon>
          系统配置
        </el-button>
        
      </div>
      
      <!-- 交易对统计信息 -->
      <div v-if="availableSymbols.length > 0" class="contract-stats">
        <el-tag type="info">
          可用交易对总数: {{ availableSymbols.length }} 个
        </el-tag>
        <el-tag type="success" style="margin-left: 10px;">
          {{ getExchangePairLabel(selectedExchangePair) }} 重合交易对
        </el-tag>
      </div>
    </el-card>

    <!-- 连接状态 -->
    <el-alert
      v-if="isConnected"
      title="WebSocket连接正常"
      type="success"
      :closable="false"
      show-icon
      class="status-alert"
    />

    <!-- 价差数据表格 -->
    <el-card v-if="selectedSymbols.length > 0 && selectedExchangePair" class="data-table" shadow="hover">
      <template #header>
        <div class="card-header">
          <span>实时价差监控 ({{ selectedSymbols.length }}个交易对)</span>
          <div>
            <el-tag type="info">更新频率: 实时</el-tag>
            <el-tag v-if="lastUpdateTime" type="success" style="margin-left: 8px">
              最后更新: {{ lastUpdateTime }}
            </el-tag>
            <el-tag v-if="formattedData.length > 0" type="primary" style="margin-left: 8px">
              活跃交易对: {{ formattedData.filter(item => item.spread).length }}
            </el-tag>
          </div>
        </div>
      </template>
      
      <el-table 
        :data="formattedData" 
        stripe 
        style="width: 100%"
        :default-sort="{ prop: 'symbol', order: 'ascending' }"
      >
        <el-table-column prop="symbol" label="交易对" min-width="160" fixed="left">
          <template #default="{ row }">
            <el-tag type="primary">{{ row.symbol }}</el-tag>
          </template>
        </el-table-column>
        
        <!-- 动态显示第一个交易所列 -->
        <el-table-column :label="getFirstExchangeLabel()" min-width="350">
          <el-table-column label="卖一价" min-width="110">
            <template #default="{ row }">
              <span class="price-text">{{ formatPrice(getFirstExchangeData(row)?.askPrice) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="买一价" min-width="110">
            <template #default="{ row }">
              <span class="price-text">{{ formatPrice(getFirstExchangeData(row)?.bidPrice) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="总价值" min-width="130">
            <template #default="{ row }">
              <div class="value-text">
                <div>卖: {{ formatValue(getFirstExchangeData(row)?.askPrice, getFirstExchangeData(row)?.askQty) }}</div>
                <div>买: {{ formatValue(getFirstExchangeData(row)?.bidPrice, getFirstExchangeData(row)?.bidQty) }}</div>
              </div>
            </template>
          </el-table-column>
        </el-table-column>
        
        <!-- 动态显示第二个交易所列 -->
        <el-table-column :label="getSecondExchangeLabel()" min-width="350">
          <el-table-column label="卖一价" min-width="110">
            <template #default="{ row }">
              <span class="price-text">{{ formatPrice(getSecondExchangeData(row)?.askPrice) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="买一价" min-width="110">
            <template #default="{ row }">
              <span class="price-text">{{ formatPrice(getSecondExchangeData(row)?.bidPrice) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="总价值" min-width="130">
            <template #default="{ row }">
              <div class="value-text">
                <div>卖: {{ formatValue(getSecondExchangeData(row)?.askPrice, getSecondExchangeData(row)?.askQty) }}</div>
                <div>买: {{ formatValue(getSecondExchangeData(row)?.bidPrice, getSecondExchangeData(row)?.bidQty) }}</div>
              </div>
            </template>
          </el-table-column>
        </el-table-column>
        
        <el-table-column label="价差率 (%)" min-width="320">
          <el-table-column :label="`${getFirstExchangeLabel()}买/${getSecondExchangeLabel()}卖`" min-width="160">
            <template #default="{ row }">
              <el-tag 
                :type="getSpreadType(row.spread?.buyFirstSellSecond)"
                v-if="row.spread"
              >
                {{ row.spread.buyFirstSellSecond.toFixed(4) }}%
              </el-tag>
              <span v-else>-</span>
            </template>
          </el-table-column>
          <el-table-column :label="`${getFirstExchangeLabel()}卖/${getSecondExchangeLabel()}买`" min-width="160">
            <template #default="{ row }">
              <el-tag 
                :type="getSpreadType(row.spread?.sellFirstBuySecond)"
                v-if="row.spread"
              >
                {{ row.spread.sellFirstBuySecond.toFixed(4) }}%
              </el-tag>
              <span v-else>-</span>
            </template>
          </el-table-column>
        </el-table-column>

        <el-table-column label="Funding Rate (%)" min-width="320">
          <el-table-column :label="getFirstExchangeLabel()" min-width="160">
            <template #default="{ row }">
              <div class="funding-rate-cell">
                <el-tag 
                  :type="getFundingRateType(getFirstExchangeFundingRate(row.symbol))"
                  v-if="getFirstExchangeFundingRate(row.symbol)"
                >
                  {{ formatFundingRate(getFirstExchangeFundingRate(row.symbol)) }}
                </el-tag>
                <span v-else class="loading-text">获取中...</span>
                <div class="funding-time" v-if="getFirstExchangeFundingTime(row.symbol)">
                  {{ formatNextFundingTime(getFirstExchangeFundingTime(row.symbol)) }}
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column :label="getSecondExchangeLabel()" min-width="160">
            <template #default="{ row }">
              <div class="funding-rate-cell">
                <el-tag 
                  :type="getFundingRateType(getSecondExchangeFundingRate(row.symbol))"
                  v-if="getSecondExchangeFundingRate(row.symbol)"
                >
                  {{ formatFundingRate(getSecondExchangeFundingRate(row.symbol)) }}
                </el-tag>
                <span v-else class="loading-text">获取中...</span>
                <div class="funding-time" v-if="getSecondExchangeFundingTime(row.symbol)">
                  {{ formatNextFundingTime(getSecondExchangeFundingTime(row.symbol)) }}
                </div>
              </div>
            </template>
          </el-table-column>
        </el-table-column>
        
        <el-table-column label="套利建议" min-width="250">
          <template #default="{ row }">
            <el-text 
              v-if="row.spread"
              :type="row.spread.buyFirstSellSecond > 0.15 || row.spread.sellFirstBuySecond > 0.15 ? 'success' : 'info'"
              size="small"
            >
              {{ getArbitrageAdvice(row.spread.buyFirstSellSecond, row.spread.sellFirstBuySecond) }}
            </el-text>
            <span v-else>-</span>
          </template>
        </el-table-column>
        
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-tooltip content="查看详情（不断开连接）" placement="top">
              <el-button 
                type="primary" 
                size="small"
                @click="viewDetail(row.symbol)"
                :disabled="!row.spread"
              >
                详情
              </el-button>
            </el-tooltip>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 空状态 -->
    <el-empty 
      v-if="selectedSymbols.length === 0 || !selectedExchangePair" 
      :description="!selectedExchangePair ? '请先选择交易所组合' : '请选择要监控的交易对'"
      class="empty-state"
    />

    <!-- 监控状态面板 -->
    <el-card v-if="selectedSymbols.length > 0" class="status-panel" shadow="hover">
      <template #header>
        <div class="card-header">
          <span>监控状态面板</span>
          <el-tag :type="isConnected ? 'success' : 'danger'">
            {{ isConnected ? '监控中' : '未连接' }}
          </el-tag>
        </div>
      </template>
      
      <el-row :gutter="20">
        <el-col :span="6">
          <div class="status-item">
            <h4>连接状态</h4>
            <p>选中交易对: {{ selectedSymbols.length }}个</p>
            <p>WebSocket状态: {{ isConnected ? '已连接' : '未连接' }}</p>
            <p>数据流: {{ Object.keys(priceData).length }}个</p>
            <p>最后更新: {{ lastUpdateTime || '未更新' }}</p>
            <p>套利机会: {{ getArbitrageOpportunities() }}个</p>
          </div>
        </el-col>
        
        <el-col :span="6">
          <div class="status-item">
            <h4>实时数据</h4>
            <div v-for="symbol in selectedSymbols" :key="symbol" class="symbol-status">
              <strong>{{ symbol }}:</strong>
              <div class="data-status" v-if="selectedExchangePair">
                <span :class="getFirstExchangeConnectionStatus(symbol) ? 'connected' : 'disconnected'">
                  {{ getFirstExchangeLabel() }}: {{ getFirstExchangeConnectionStatus(symbol) ? '✓' : '✗' }}
                </span>
                <span :class="getSecondExchangeConnectionStatus(symbol) ? 'connected' : 'disconnected'">
                  {{ getSecondExchangeLabel() }}: {{ getSecondExchangeConnectionStatus(symbol) ? '✓' : '✗' }}
                </span>
              </div>
            </div>
          </div>
        </el-col>

        <el-col :span="6">
          <div class="status-item">
            <h4>队列统计</h4>
            <p v-if="selectedExchangePair">{{ getFirstExchangeLabel() }}队列: <span class="stat-number">{{ getFirstExchangeQueueCount() }}</span> 个</p>
            <p v-if="selectedExchangePair">{{ getSecondExchangeLabel() }}队列: <span class="stat-number">{{ getSecondExchangeQueueCount() }}</span> 个</p>
            <p>成功匹配: <span class="stat-number success">{{ matchStats.successfulMatches }}</span> 次</p>
            <p>丢弃匹配: <span class="stat-number warning">{{ matchStats.discardedMatches }}</span> 次</p>
            <p>匹配成功率: <span class="stat-number">{{ getMatchSuccessRate() }}%</span></p>
            <el-button 
              type="info" 
              size="small" 
              @click="openQueueStatsModal"
              style="margin-top: 10px; width: 100%;"
            >
              查看详细统计
            </el-button>
          </div>
        </el-col>
        
        <el-col :span="6">
          <div class="status-item">
            <h4>快速操作</h4>
            <div class="quick-actions">
              <el-button 
                type="success" 
                size="small"
                @click="testData"
                style="margin-bottom: 8px; width: 100%;"
              >
                添加测试数据
              </el-button>
              <el-button 
                type="warning" 
                size="small"
                @click="refreshConnections"
                :loading="isConnecting"
                style="margin-bottom: 8px; width: 100%;"
              >
                重新连接
              </el-button>
              <el-button 
                type="danger" 
                size="small"
                @click="stopMonitoring"
                style="width: 100%;"
              >
                停止监控
              </el-button>
            </div>
          </div>
        </el-col>
      </el-row>
    </el-card>

    <!-- 详情模态框 -->
    <el-dialog
      v-model="showDetailModal"
      :title="`${selectedDetailSymbol} 详情`"
      width="80%"
      :before-close="closeDetailModal"
      destroy-on-close
    >
      <div class="detail-content" v-if="selectedDetailSymbol">
        <!-- 实时价差卡片 -->
        <el-row :gutter="20" style="margin-bottom: 20px;" v-if="selectedExchangePair">
          <el-col :span="12">
            <el-card shadow="hover">
              <template #header>
                <div class="card-header">
                  <span>{{ getFirstExchangeLabel() }}买/{{ getSecondExchangeLabel() }}卖</span>
                </div>
              </template>
              <div class="spread-display">
                <span 
                  class="spread-value" 
                  :class="getSpreadClass(getCurrentSpread(selectedDetailSymbol)?.buyFirstSellSecond || getCurrentSpread(selectedDetailSymbol)?.buyBinanceSellOkx)"
                >
                  {{ (getCurrentSpread(selectedDetailSymbol)?.buyFirstSellSecond || getCurrentSpread(selectedDetailSymbol)?.buyBinanceSellOkx)?.toFixed(4) || '-' }}%
                </span>
                <div class="spread-desc">买入{{ getFirstExchangeLabel() }}，卖出{{ getSecondExchangeLabel() }}</div>
              </div>
            </el-card>
          </el-col>
          
          <el-col :span="12">
            <el-card shadow="hover">
              <template #header>
                <div class="card-header">
                  <span>{{ getFirstExchangeLabel() }}卖/{{ getSecondExchangeLabel() }}买</span>
                </div>
              </template>
              <div class="spread-display">
                <span 
                  class="spread-value" 
                  :class="getSpreadClass(getCurrentSpread(selectedDetailSymbol)?.sellFirstBuySecond || getCurrentSpread(selectedDetailSymbol)?.sellBinanceBuyOkx)"
                >
                  {{ (getCurrentSpread(selectedDetailSymbol)?.sellFirstBuySecond || getCurrentSpread(selectedDetailSymbol)?.sellBinanceBuyOkx)?.toFixed(4) || '-' }}%
                </span>
                <div class="spread-desc">卖出{{ getFirstExchangeLabel() }}，买入{{ getSecondExchangeLabel() }}</div>
              </div>
            </el-card>
          </el-col>
        </el-row>

        <!-- 价格信息 -->
        <el-row :gutter="20" style="margin-bottom: 20px;" v-if="selectedExchangePair">
          <el-col :span="12">
            <el-card shadow="hover">
              <template #header>
                <div class="card-header">
                  <span>{{ getFirstExchangeLabel() }} 价格</span>
                </div>
              </template>
              <div class="price-info">
                <p>卖一价: {{ formatPrice(getFirstExchangeDetailData()?.askPrice) }}</p>
                <p>买一价: {{ formatPrice(getFirstExchangeDetailData()?.bidPrice) }}</p>
                <p>卖一量: {{ getFirstExchangeDetailData()?.askQty || '-' }}</p>
                <p>买一量: {{ getFirstExchangeDetailData()?.bidQty || '-' }}</p>
              </div>
            </el-card>
          </el-col>
          
          <el-col :span="12">
            <el-card shadow="hover">
              <template #header>
                <div class="card-header">
                  <span>{{ getSecondExchangeLabel() }} 价格</span>
                </div>
              </template>
              <div class="price-info">
                <p>卖一价: {{ formatPrice(getSecondExchangeDetailData()?.askPrice) }}</p>
                <p>买一价: {{ formatPrice(getSecondExchangeDetailData()?.bidPrice) }}</p>
                <p>卖一量: {{ getSecondExchangeDetailData()?.askQty || '-' }}</p>
                <p>买一量: {{ getSecondExchangeDetailData()?.bidQty || '-' }}</p>
              </div>
            </el-card>
          </el-col>
        </el-row>

        <!-- 历史数据统计 -->
        <el-card shadow="hover">
          <template #header>
            <div class="card-header">
              <span>历史数据统计</span>
            </div>
          </template>
          <el-row :gutter="20">
            <el-col :span="4">
              <div class="stat-item">
                <div class="stat-label">数据点数量</div>
                <div class="stat-value">{{ getTickHistory(selectedDetailSymbol).length }}</div>
              </div>
            </el-col>
            <el-col :span="4" v-if="selectedExchangePair">
              <div class="stat-item">
                <div class="stat-label">{{ getFirstExchangeLabel() }}买/{{ getSecondExchangeLabel() }}卖最大</div>
                <div class="stat-value positive">{{ formatSpreadValue(priceStore.getRealtimeMaxPositiveSpread(selectedDetailSymbol)) }}%</div>
              </div>
            </el-col>
            <el-col :span="4" v-if="selectedExchangePair">
              <div class="stat-item">
                <div class="stat-label">{{ getFirstExchangeLabel() }}卖/{{ getSecondExchangeLabel() }}买最大</div>
                <div class="stat-value positive">{{ formatSpreadValue(priceStore.getRealtimeMaxSellBinanceBuyOkx(selectedDetailSymbol)) }}%</div>
              </div>
            </el-col>            <el-col :span="4">
              <div class="stat-item">
                <div class="stat-label">实时最大负价差</div>
                <div class="stat-value negative">{{ formatSpreadValue(priceStore.getRealtimeMaxNegativeSpread(selectedDetailSymbol)) }}%</div>
              </div>
            </el-col>
            <el-col :span="8">
              <div class="stat-item">
                <div class="stat-label">平均价差</div>
                <div class="stat-value">{{ formatSpreadValue(getAverageSpread(selectedDetailSymbol)) }}%</div>
              </div>
            </el-col>
          </el-row>
        </el-card>

        <!-- 简单图表 -->
        <el-card shadow="hover" style="margin-top: 20px;" v-if="getTickHistory(selectedDetailSymbol).length > 0">
          <template #header>
            <div class="card-header">
              <span>价差变化趋势</span>
              <div>
                <el-tag type="info">全部 {{ getTickHistory(selectedDetailSymbol).length }} 个数据点</el-tag>
                <el-button 
                  type="primary" 
                  size="small" 
                  @click="refreshChart"
                  style="margin-left: 10px;"
                >
                  刷新图表
                </el-button>
                <el-button 
                  type="danger" 
                  size="small" 
                  @click="emergencyResetChart"
                  style="margin-left: 5px;"
                >
                  重置
                </el-button>
              </div>
            </div>
          </template>
          <div class="simple-chart">
            <v-chart 
              :key="`chart-${selectedDetailSymbol}-${chartKey}`"
              :option="chartOption" 
              :style="{ height: '300px', width: '100%' }"
              :autoresize="true"
              :loading="false"
              :manual-update="true"
            />
          </div>
        </el-card>
      </div>
      
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="closeDetailModal">关闭</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 队列统计模态框 -->
    <el-dialog
      v-model="showQueueStatsModal"
      title="交易对队列详细统计"
      width="90%"
      :before-close="closeQueueStatsModal"
      destroy-on-close
    >
      <div class="queue-stats-content">
        <el-table 
          :data="Object.keys(symbolQueues)" 
          stripe 
          style="width: 100%"
          empty-text="暂无数据"
        >
          <el-table-column prop="symbol" label="交易对" min-width="160" fixed="left">
            <template #default="{ row }">
              <el-tag type="primary">{{ row }}</el-tag>
            </template>
          </el-table-column>
          
          <el-table-column label="队列状态" min-width="180">
            <template #default="{ row }">
              <div class="queue-status" v-if="selectedExchangePair">
                <div>{{ getFirstExchangeLabel() }}: <span class="stat-number">{{ getSymbolQueueLength(row, 'first') }}</span></div>
                <div>{{ getSecondExchangeLabel() }}: <span class="stat-number">{{ getSymbolQueueLength(row, 'second') }}</span></div>
              </div>
            </template>
          </el-table-column>
          
          <el-table-column label="数据接收统计" min-width="200">
            <template #default="{ row }">
              <div class="receive-stats" v-if="selectedExchangePair">
                <div>{{ getFirstExchangeLabel() }}: <span class="stat-number">{{ getSymbolDataReceived(row, 'first') }}</span></div>
                <div>{{ getSecondExchangeLabel() }}: <span class="stat-number">{{ getSymbolDataReceived(row, 'second') }}</span></div>
              </div>
            </template>
          </el-table-column>
          
          <el-table-column label="匹配统计" min-width="180">
            <template #default="{ row }">
              <div class="match-stats">
                <div>成功: <span class="stat-number success">{{ symbolQueues[row]?.stats?.successfulMatches || 0 }}</span></div>
                <div>丢弃: <span class="stat-number warning">{{ symbolQueues[row]?.stats?.discardedMatches || 0 }}</span></div>
              </div>
            </template>
          </el-table-column>
          
          <el-table-column label="成功率" min-width="120">
            <template #default="{ row }">
              <el-tag :type="getSymbolMatchSuccessRate(row) > 80 ? 'success' : getSymbolMatchSuccessRate(row) > 60 ? 'warning' : 'danger'">
                {{ getSymbolMatchSuccessRate(row) }}%
              </el-tag>
            </template>
          </el-table-column>
          
          <el-table-column label="平均时间差" min-width="140">
            <template #default="{ row }">
              <span class="stat-number">{{ (symbolQueues[row]?.stats?.avgTimeDiff || 0).toFixed(2) }}ms</span>
            </template>
          </el-table-column>
          
          <el-table-column label="最后匹配时间" min-width="160">
            <template #default="{ row }">
              <span v-if="symbolQueues[row]?.stats?.lastMatchTime">
                {{ new Date(symbolQueues[row].stats.lastMatchTime).toLocaleTimeString() }}
              </span>
              <span v-else class="text-muted">未匹配</span>
            </template>
          </el-table-column>
          
          <el-table-column label="协程状态" min-width="120">
            <template #default="{ row }">
              <el-tag :type="symbolQueues[row]?.matcher ? 'success' : 'danger'">
                {{ symbolQueues[row]?.matcher ? '运行中' : '已停止' }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>
      </div>
      
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="closeQueueStatsModal">关闭</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 系统配置模态框 -->
    <el-dialog
      v-model="showSystemConfigModalState"
      title="系统配置"
      width="90%"
      :before-close="closeSystemConfigModal"
      destroy-on-close
    >
      <SystemConfig />
      
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="closeSystemConfigModal">关闭</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { usePriceStore } from '../stores/priceStore'
import { ElMessage } from 'element-plus'
import { storeToRefs } from 'pinia'
import { Connection, Close, Refresh, Delete, Setting } from '@element-plus/icons-vue'
import SystemConfig from "@/components/SystemConfig.vue"
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart } from 'echarts/charts'
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  DataZoomComponent
} from 'echarts/components'

// 注册ECharts组件
use([
  CanvasRenderer,
  LineChart,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  DataZoomComponent
])

const router = useRouter()
const priceStore = usePriceStore()

const isConnecting = ref(false)
const isFetchingContracts = ref(false)
const tableKey = ref(0)
const lastUpdateTime = ref('')
const showDetailModal = ref(false)
const selectedDetailSymbol = ref('')
const showQueueStatsModal = ref(false)
const showSystemConfigModalState = ref(false)
const chartOption = ref({})
const chartKey = ref(0)
let updateChartTimer = null

// 交易所组合选择
const selectedExchangePair = ref('binance-okx') // 默认选择binance-okx

// 套利机会提示防抖 - 记录每个交易对最后一次提示时间
const arbitrageNotificationTimes = ref({})
const ARBITRAGE_NOTIFICATION_INTERVAL = 10000 // 10秒间隔

// 从store获取响应式数据
const { 
  selectedSymbols, 
  availableSymbols, 
  isConnected,
  priceData,
  matchStats,
  symbolQueues,
  fundingRates
} = storeToRefs(priceStore)

// 获取store中的selectedExchangePair状态
const { selectedExchangePair: storeSelectedExchangePair } = storeToRefs(priceStore)

// 从store获取方法
const {
  setSelectedSymbols,
  connectWebSockets,
  disconnectWebSockets,
  addTestData
} = priceStore

// 同步本地状态与store状态
watch(selectedExchangePair, (newValue) => {
  storeSelectedExchangePair.value = newValue
}, { immediate: true })

watch(storeSelectedExchangePair, (newValue) => {
  selectedExchangePair.value = newValue
}, { immediate: true })

// 直接使用store的computed
const formattedData = computed(() => {
  const result = priceStore.getFormattedPriceData
  return result
})

// 监控数据变化
watch(priceData, (newData) => {
  lastUpdateTime.value = new Date().toLocaleTimeString()
}, { deep: true })

// 监控格式化数据变化
watch(formattedData, (newData) => {
  // 检查是否有大价差机会
  newData.forEach(item => {
    if (item.spread) {
      const { buyFirstSellSecond, sellFirstBuySecond } = item.spread
      if (buyFirstSellSecond > 0.15 || sellFirstBuySecond > 0.15) {
        const currentTime = Date.now()
        const lastNotificationTime = arbitrageNotificationTimes.value[item.symbol] || 0
        
        // 检查是否已经过了最小间隔时间
        if (currentTime - lastNotificationTime >= ARBITRAGE_NOTIFICATION_INTERVAL) {
          // 更新最后提示时间
          arbitrageNotificationTimes.value[item.symbol] = currentTime
          
          const firstLabel = getFirstExchangeLabel()
          const secondLabel = getSecondExchangeLabel()
          
          // 发现大于0.15%的套利机会
          ElMessage({
            message: `发现套利机会！${item.symbol} (${firstLabel}-${secondLabel}) 价差: ${Math.max(buyFirstSellSecond, sellFirstBuySecond).toFixed(4)}%`,
            type: 'success',
            duration: 5000
          })
          
          console.log(`套利机会提示: ${item.symbol}, 价差: ${Math.max(buyFirstSellSecond, sellFirstBuySecond).toFixed(4)}%, 时间: ${new Date().toLocaleTimeString()}`)
        } else {
          // 在防抖期间，只在控制台记录，不显示提示
          const remainingTime = Math.ceil((ARBITRAGE_NOTIFICATION_INTERVAL - (currentTime - lastNotificationTime)) / 1000)
          console.log(`套利机会检测到但被防抖: ${item.symbol}, 价差: ${Math.max(buyFirstSellSecond, sellFirstBuySecond).toFixed(4)}%, 还需等待: ${remainingTime}秒`)
        }
      }
    }
  })
}, { deep: true })

// 处理交易对选择变化
const handleSymbolChange = (symbols) => {
  selectedSymbols.value = symbols
}

// 处理交易所组合选择变化
const handleExchangePairChange = async (pairValue) => {
  // 使用priceStore的setSelectedExchangePair方法进行切换
  priceStore.setSelectedExchangePair(pairValue)
  ElMessage.info(`已切换到 ${getExchangePairLabel(pairValue)} 组合，正在自动获取合约...`)
  
  // 自动触发获取合约函数
  try {
    await fetchActiveContracts()
  } catch (error) {
    console.error('自动获取合约失败:', error)
    ElMessage.error('自动获取合约失败，请手动点击"获取活跃合约"按钮重试')
  }
}

// 获取交易所组合标签
const getExchangePairLabel = (pairValue) => {
  const labelMap = {
    'binance-okx': 'Binance ↔ OKX',
    'binance-bitget': 'Binance ↔ Bitget',
    'okx-bitget': 'OKX ↔ Bitget'
  }
  return labelMap[pairValue] || ''
}

// 获取第一个交易所标签
const getFirstExchangeLabel = () => {
  if (!selectedExchangePair.value) return ''
  const [first] = selectedExchangePair.value.split('-')
  return first.charAt(0).toUpperCase() + first.slice(1)
}

// 获取第二个交易所标签
const getSecondExchangeLabel = () => {
  if (!selectedExchangePair.value) return ''
  const [, second] = selectedExchangePair.value.split('-')
  return second.charAt(0).toUpperCase() + second.slice(1)
}

// 获取第一个交易所的数据
const getFirstExchangeData = (row) => {
  if (!selectedExchangePair.value) return null
  const [first] = selectedExchangePair.value.split('-')
  return row[first]
}

// 获取第二个交易所的数据
const getSecondExchangeData = (row) => {
  if (!selectedExchangePair.value) return null
  const [, second] = selectedExchangePair.value.split('-')
  return row[second]
}

// 获取第一个交易所的资金费率
const getFirstExchangeFundingRate = (symbol) => {
  if (!selectedExchangePair.value || !fundingRates.value[symbol]) return null
  const [first] = selectedExchangePair.value.split('-')
  return fundingRates.value[symbol][first]?.fundingRate
}

// 获取第二个交易所的资金费率
const getSecondExchangeFundingRate = (symbol) => {
  if (!selectedExchangePair.value || !fundingRates.value[symbol]) return null
  const [, second] = selectedExchangePair.value.split('-')
  return fundingRates.value[symbol][second]?.fundingRate
}

// 获取第一个交易所的下次资金费率时间
const getFirstExchangeFundingTime = (symbol) => {
  if (!selectedExchangePair.value || !fundingRates.value[symbol]) return null
  const [first] = selectedExchangePair.value.split('-')
  return fundingRates.value[symbol][first]?.nextFundingTime
}

// 获取第二个交易所的下次资金费率时间
const getSecondExchangeFundingTime = (symbol) => {
  if (!selectedExchangePair.value || !fundingRates.value[symbol]) return null
  const [, second] = selectedExchangePair.value.split('-')
  return fundingRates.value[symbol][second]?.nextFundingTime
}

// 获取第一个交易所的连接状态
const getFirstExchangeConnectionStatus = (symbol) => {
  if (!selectedExchangePair.value) return false
  const [first] = selectedExchangePair.value.split('-')
  return !!priceData.value[`${first}_${symbol}`]
}

// 获取第二个交易所的连接状态
const getSecondExchangeConnectionStatus = (symbol) => {
  if (!selectedExchangePair.value) return false
  const [, second] = selectedExchangePair.value.split('-')
  return !!priceData.value[`${second}_${symbol}`]
}

// 获取第一个交易所的队列统计
const getFirstExchangeQueueCount = () => {
  if (!selectedExchangePair.value) return 0
  const [first] = selectedExchangePair.value.split('-')
  if (first === 'binance') return matchStats.value.totalBinanceQueue || 0
  if (first === 'okx') return matchStats.value.totalOKXQueue || 0
  if (first === 'bitget') return matchStats.value.totalBitgetQueue || 0
  return 0
}

// 获取第二个交易所的队列统计
const getSecondExchangeQueueCount = () => {
  if (!selectedExchangePair.value) return 0
  const [, second] = selectedExchangePair.value.split('-')
  if (second === 'binance') return matchStats.value.totalBinanceQueue || 0
  if (second === 'okx') return matchStats.value.totalOKXQueue || 0
  if (second === 'bitget') return matchStats.value.totalBitgetQueue || 0
  return 0
}

// 获取第一个交易所的详情数据
const getFirstExchangeDetailData = () => {
  if (!selectedExchangePair.value || !selectedDetailSymbol.value) return null
  const [first] = selectedExchangePair.value.split('-')
  return priceData.value[`${first}_${selectedDetailSymbol.value}`]
}

// 获取第二个交易所的详情数据
const getSecondExchangeDetailData = () => {
  if (!selectedExchangePair.value || !selectedDetailSymbol.value) return null
  const [, second] = selectedExchangePair.value.split('-')
  return priceData.value[`${second}_${selectedDetailSymbol.value}`]
}

// 获取指定交易对的队列长度
const getSymbolQueueLength = (symbol, position) => {
  if (!selectedExchangePair.value || !symbolQueues.value[symbol]) return 0
  const [first, second] = selectedExchangePair.value.split('-')
  const exchange = position === 'first' ? first : second
  return symbolQueues.value[symbol][exchange]?.length || 0
}

// 获取指定交易对的数据接收统计
const getSymbolDataReceived = (symbol, position) => {
  if (!selectedExchangePair.value || !symbolQueues.value[symbol]?.stats) return 0
  const [first, second] = selectedExchangePair.value.split('-')
  const exchange = position === 'first' ? first : second
  
  const fieldMapping = {
    'binance': 'totalBinanceDataReceived',
    'okx': 'totalOKXDataReceived',
    'bitget': 'totalBitgetDataReceived'
  }
  
  const field = fieldMapping[exchange]
  return symbolQueues.value[symbol].stats[field] || 0
}

// 开始监控
const startMonitoring = async () => {
  if (selectedSymbols.value.length === 0) {
    ElMessage.warning('请先选择要监控的交易对')
    return
  }
  
  if (!selectedExchangePair.value) {
    ElMessage.warning('请先选择交易所组合')
    return
  }
  
  isConnecting.value = true
  try {
    await setSelectedSymbols(selectedSymbols.value)
    ElMessage.success('开始监控成功')
  } catch (error) {
    console.error('监控启动失败:', error)
    ElMessage.error(`监控启动失败: ${error.message}`)
  } finally {
    isConnecting.value = false
  }
}

// 停止监控
const stopMonitoring = () => {
  disconnectWebSockets()
  ElMessage.info('已停止监控')
}

// 刷新连接
const refreshConnections = async () => {
  if (selectedSymbols.value.length === 0) {
    ElMessage.warning('请先选择要监控的交易对')
    return
  }
  
  isConnecting.value = true
  try {
    await disconnectWebSockets()
    await connectWebSockets()
    ElMessage.success('连接刷新成功')
  } catch (error) {
    console.error('连接刷新失败:', error)
    ElMessage.error(`连接刷新失败: ${error.message}`)
  } finally {
    isConnecting.value = false
  }
}

// 获取活跃合约
const fetchActiveContracts = async () => {
  if (!selectedExchangePair.value) {
    ElMessage.warning('请先选择交易所组合')
    return
  }
  
  const [firstExchange, secondExchange] = selectedExchangePair.value.split('-')
  const firstLabel = getFirstExchangeLabel()
  const secondLabel = getSecondExchangeLabel()
  
  isFetchingContracts.value = true
  try {
    ElMessage.info(`正在获取${firstLabel}和${secondLabel}的活跃USDT本位合约...`)
    
    // 根据选择的交易所组合，并行获取对应的合约信息
    const contractFetchers = {
      'binance': fetchBinanceActiveContracts,
      'okx': fetchOKXActiveContracts,
      'bitget': fetchBitgetActiveContracts // 需要实现这个方法
    }
    
    const [firstContracts, secondContracts] = await Promise.all([
      contractFetchers[firstExchange](),
      contractFetchers[secondExchange]()
    ])
    
    console.log(`获取到${firstLabel}合约: ${firstContracts.length}个`)
    console.log(`获取到${secondLabel}合约: ${secondContracts.length}个`)
    
    // 找出重叠的交易对
    const overlappingSymbols = findOverlappingSymbols(firstContracts, secondContracts)
    
    console.log(`找到重叠交易对: ${overlappingSymbols.length}个`, overlappingSymbols)
    
    // 更新可用交易对列表
    priceStore.setAvailableSymbols(overlappingSymbols)
    
    ElMessage.success(`成功获取活跃合约！${firstLabel}: ${firstContracts.length}个，${secondLabel}: ${secondContracts.length}个，重合交易对: ${overlappingSymbols.length}个`)
    
  } catch (error) {
    console.error('获取活跃合约失败:', error)
    ElMessage.error(`获取活跃合约失败: ${error.message}`)
  } finally {
    isFetchingContracts.value = false
  }
}

// 获取Binance活跃USDT本位合约
const fetchBinanceActiveContracts = async () => {
  try {
    const response = await fetch('https://fapi.binance.com/fapi/v1/exchangeInfo')
    if (!response.ok) {
      throw new Error(`Binance API错误: ${response.status}`)
    }
    
    const data = await response.json()
    
    // 过滤USDT本位永续合约
    const usdtContracts = data.symbols.filter(symbol => 
      symbol.contractType === 'PERPETUAL' && 
      symbol.quoteAsset === 'USDT' &&
      symbol.status === 'TRADING'
    )
    
    console.log(`Binance USDT本位永续合约数量: ${usdtContracts.length}`)
    
    // 转换为统一格式 (base/quote:settle)
    return usdtContracts.map(symbol => `${symbol.baseAsset}/USDT:USDT`)
    
  } catch (error) {
    console.error('获取Binance合约失败:', error)
    throw error
  }
}

// 获取OKX活跃USDT本位合约
const fetchOKXActiveContracts = async () => {
  try {
    const response = await fetch('https://www.okx.com/api/v5/public/instruments?instType=SWAP')
    if (!response.ok) {
      throw new Error(`OKX API错误: ${response.status}`)
    }
    
    const data = await response.json()
    
    if (data.code !== '0') {
      throw new Error(`OKX API错误: ${data.msg}`)
    }
    
    // 过滤USDT本位永续合约
    const usdtContracts = data.data.filter(instrument => 
      instrument.ctType === 'linear' && 
      instrument.settleCcy === 'USDT' &&
      instrument.state === 'live'
    )
    
    console.log(`OKX USDT本位永续合约数量: ${usdtContracts.length}`)
    
    // 转换为统一格式 (base/quote:settle)
    return usdtContracts.map(instrument => {
      const [base, settle] = instrument.instId.split('-')
      return `${base}/USDT:USDT`
    })
    
  } catch (error) {
    console.error('获取OKX合约失败:', error)
    throw error
  }
}

// 获取Bitget活跃USDT本位合约
const fetchBitgetActiveContracts = async () => {
  try {
    // 注意：这是一个示例URL，实际的Bitget API端点可能不同
    // 您需要根据Bitget的实际API文档来调整这个URL
    const response = await fetch('https://api.bitget.com/api/mix/v1/market/contracts?productType=umcbl')
    if (!response.ok) {
      throw new Error(`Bitget API错误: ${response.status}`)
    }
    
    const data = await response.json()
    if (data.code !== '00000') {
      throw new Error(`Bitget API错误: ${data.msg}`)
    }
    // 过滤USDT本位永续合约
    const usdtContracts = data.data.filter(instrument => 
      instrument.quoteCoin === 'USDT' &&
      instrument.supportMarginCoins.includes('USDT') &&
      instrument.symbolStatus === 'normal'
    )
    
    console.log(`Bitget USDT本位永续合约数量: ${usdtContracts.length}`)
    // 转换为统一格式 (base/quote:settle)
    return usdtContracts.map(instrument => {
      const base = instrument.baseCoin
      return `${base}/USDT:USDT`
    })
    
  } catch (error) {
    console.error('获取Bitget合约失败:', error)
    // 如果Bitget API失败，返回一个默认的合约列表
    console.warn('Bitget API访问失败，使用默认合约列表')
    return [
      'BTC/USDT:USDT', 'ETH/USDT:USDT', 'BNB/USDT:USDT', 'ADA/USDT:USDT', 'XRP/USDT:USDT',
      'SOL/USDT:USDT', 'DOT/USDT:USDT', 'DOGE/USDT:USDT', 'AVAX/USDT:USDT', 'MATIC/USDT:USDT',
      'LTC/USDT:USDT', 'LINK/USDT:USDT', 'UNI/USDT:USDT', 'ATOM/USDT:USDT'
    ]
  }
}

// 找出重叠的交易对
const findOverlappingSymbols = (binanceSymbols, okxSymbols) => {
  const binanceSet = new Set(binanceSymbols)
  const overlapping = okxSymbols.filter(symbol => binanceSet.has(symbol))
  
  // 按字母顺序排序，把主流币种排在前面
  const mainCoins = ['BTC/USDT:USDT', 'ETH/USDT:USDT', 'BNB/USDT:USDT', 'SOL/USDT:USDT', 'XRP/USDT:USDT', 'ADA/USDT:USDT', 'DOGE/USDT:USDT']
  const main = overlapping.filter(symbol => mainCoins.includes(symbol))
  const others = overlapping.filter(symbol => !mainCoins.includes(symbol)).sort()
  
  return [...main, ...others]
}





// 测试数据
const testData = () => {
  if (selectedSymbols.value.length > 0) {
    addTestData(selectedSymbols.value[0])
    ElMessage.success('测试数据已添加')
  } else {
    addTestData('BTC/USDT:USDT')
    ElMessage.success('测试数据已添加 (BTC/USDT:USDT)')
  }
}

// 生成多个测试数据点
const generateMultipleTestData = async () => {
  if (selectedSymbols.value.length === 0) {
    ElMessage.warning('请先选择交易对')
    return
  }
  
  const symbol = selectedSymbols.value[0]
  ElMessage.info('正在生成20个测试数据点...')
  
  // 生成20个测试数据点，间隔200ms
  for (let i = 0; i < 20; i++) {
    addTestData(symbol)
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  
  ElMessage.success('已生成20个测试数据点')
}

// 模拟实时数据更新
const simulateRealTimeData = () => {
  if (selectedSymbols.value.length === 0) {
    ElMessage.warning('请先选择交易对')
    return
  }
  
  const symbol = selectedSymbols.value[0]
  
  // 每2秒添加一个新的数据点
  const interval = setInterval(() => {
    if (!selectedSymbols.value.includes(symbol)) {
      clearInterval(interval)
      return
    }
    
    // 模拟新的价格数据
    const basePrice = 50000
    const binanceBid = (basePrice + Math.random() * 100 - 50).toFixed(2)
    const binanceAsk = (parseFloat(binanceBid) + Math.random() * 10 + 1).toFixed(2)
    const okxBid = (basePrice + Math.random() * 100 - 50).toFixed(2)
    const okxAsk = (parseFloat(okxBid) + Math.random() * 10 + 1).toFixed(2)
    
    // 更新价格数据
    priceData.value[`binance_${symbol}`] = {
      exchange: 'binance',
      symbol: symbol,
      bidPrice: parseFloat(binanceBid),
      askPrice: parseFloat(binanceAsk),
      bidQty: 1.0,
      askQty: 1.0,
      timestamp: Date.now()
    }
    
    priceData.value[`okx_${symbol}`] = {
      exchange: 'okx',
      symbol: symbol,
      bidPrice: parseFloat(okxBid),
      askPrice: parseFloat(okxAsk),
      bidQty: 1.0,
      askQty: 1.0,
      timestamp: Date.now()
    }
    
    console.log(`模拟数据已更新: ${symbol}`, {
      binanceBid, binanceAsk, okxBid, okxAsk
    })
    
  }, 2000) // 每2秒更新一次
  
  ElMessage.success('开始模拟实时数据更新（每2秒一次）')
  
  // 10分钟后自动停止
  setTimeout(() => {
    clearInterval(interval)
    ElMessage.info('模拟数据更新已停止')
  }, 600000)
}

// 清空套利机会提示防抖记录
const clearArbitrageNotifications = () => {
  arbitrageNotificationTimes.value = {}
  ElMessage.success('已清空套利机会提示记录，可立即重新提示')
  console.log('套利机会提示防抖记录已清空')
}



// 格式化价格显示
const formatPrice = (price) => {
  if (!price) return '-'
  const num = parseFloat(price)
  if (num >= 1) {
    return num.toFixed(4)
  } else {
    return num.toFixed(8)
  }
}

// 格式化总价值显示
const formatValue = (price, quantity) => {
  if (!price || !quantity) return '-'
  const value = parseFloat(price) * parseFloat(quantity)
  if (value >= 1000000) {
    return (value / 1000000).toFixed(2) + 'M'
  } else if (value >= 1000) {
    return (value / 1000).toFixed(2) + 'K'
  } else {
    return value.toFixed(2)
  }
}

// 获取价差标签类型
const getSpreadType = (spread) => {
  if (!spread) return 'info'
  if (spread > 0.15) return 'success'  // 大于0.15%显示绿色
  if (spread > 0.01) return 'warning'  // 大于0.01%显示橙色
  if (spread < -0.01) return 'danger'  // 小于-0.01%显示红色
  return 'info'
}

// 获取套利建议
const getArbitrageAdvice = (buyFirstSellSecond, sellFirstBuySecond) => {
  const firstLabel = getFirstExchangeLabel()
  const secondLabel = getSecondExchangeLabel()
  
  if (buyFirstSellSecond > 0.15) {
    return `建议: ${firstLabel}买入 → ${secondLabel}卖出`
  }
  if (sellFirstBuySecond > 0.15) {
    return `建议: ${secondLabel}买入 → ${firstLabel}卖出`
  }
  return '价差较小，暂无套利机会'
}

// 计算套利机会数量
const getArbitrageOpportunities = () => {
  return formattedData.value.filter(item => {
    if (!item.spread) return false
    return item.spread.buyFirstSellSecond > 0.15 || item.spread.sellFirstBuySecond > 0.15
  }).length
}

// 计算匹配成功率
const getMatchSuccessRate = () => {
  const total = matchStats.value.successfulMatches + matchStats.value.discardedMatches
  if (total === 0) return '0.00'
  return ((matchStats.value.successfulMatches / total) * 100).toFixed(2)
}

// 打开队列统计模态框
const openQueueStatsModal = () => {
  showQueueStatsModal.value = true
}

// 关闭队列统计模态框
const closeQueueStatsModal = () => {
  showQueueStatsModal.value = false
}

// 计算单个交易对的匹配成功率
const getSymbolMatchSuccessRate = (symbol) => {
  const stats = symbolQueues.value[symbol]?.stats
  if (!stats) return '0.00'
  const total = stats.successfulMatches + stats.discardedMatches
  if (total === 0) return '0.00'
  return ((stats.successfulMatches / total) * 100).toFixed(2)
}

// 查看详情
const viewDetail = (symbol) => {
  // 使用模态框显示详情，不跳转页面
  showDetailModal.value = true
  selectedDetailSymbol.value = symbol
  // 增加chartKey确保图表正确初始化
  chartKey.value++
  // 更新图表配置
  updateChartOption(symbol)
  console.log(`打开详情页: ${symbol}, chartKey: ${chartKey.value}`)
}

// 关闭详情模态框
const closeDetailModal = () => {
  showDetailModal.value = false
  selectedDetailSymbol.value = ''
}

// 获取当前价差
const getCurrentSpread = (symbol) => {
  const data = formattedData.value.find(item => item.symbol === symbol)
  return data?.spread
}

// 获取历史数据
const getTickHistory = (symbol) => {
  return priceStore.getTickHistory(symbol)
}

// 获取平均价差
const getAverageSpread = (symbol) => {
  const history = getTickHistory(symbol)
  if (!history || history.length === 0) return 0
  
  try {
    const validSpreads = history.map(item => {
      if (!item) return null
      
      // 兼容新旧格式
      const buySpread = item.buyFirstSellSecond || item.buyBinanceSellOkx || 0
      const sellSpread = item.sellFirstBuySecond || item.sellBinanceBuyOkx || 0
      
      if (typeof buySpread !== 'number' || typeof sellSpread !== 'number') {
        return null
      }
      
      const avgSpread = (buySpread + sellSpread) / 2
      return isNaN(avgSpread) || !isFinite(avgSpread) ? null : avgSpread
    }).filter(spread => spread !== null)
    
    if (validSpreads.length === 0) return 0
    
    const sum = validSpreads.reduce((acc, spread) => acc + spread, 0)
    const average = sum / validSpreads.length
    return isNaN(average) || !isFinite(average) ? 0 : average
  } catch (error) {
    console.warn('计算平均价差时出错:', error)
    return 0
  }
}

// 安全格式化价差值
const formatSpreadValue = (value) => {
  if (value === null || value === undefined || isNaN(value) || !isFinite(value)) {
    return '0.0000'
  }
  return Number(value).toFixed(4)
}

// 获取价差样式类
const getSpreadClass = (spread) => {
  if (!spread) return ''
  if (spread > 0.1) return 'positive-high'
  if (spread > 0.05) return 'positive'
  if (spread < -0.05) return 'negative'
  return 'neutral'
}

// 获取简单图表配置
const updateChartOption = (symbol) => {
  console.log(`=== updateChartOption 开始: ${symbol} ===`)
  
  const history = getTickHistory(symbol)
  console.log(`从store获取历史数据: ${history.length} 个`)
  
  if (history.length === 0) {
    console.log('历史数据为空，清空图表配置')
    chartOption.value = {}
    return
  }
  
  // 显示全部数据，但如果数据点太多就进行采样
  let allData = history.filter(item => {
    if (!item || !item.timestamp) return false
    
    // 兼容新旧格式
    const buySpread = item.buyFirstSellSecond || item.buyBinanceSellOkx
    const sellSpread = item.sellFirstBuySecond || item.sellBinanceBuyOkx
    
    // 过滤掉无效数据
    const isValid = typeof buySpread === 'number' && 
           typeof sellSpread === 'number' &&
           !isNaN(buySpread) && 
           !isNaN(sellSpread) &&
           isFinite(buySpread) && 
           isFinite(sellSpread)
    
    if (!isValid && item) {
      console.log('发现无效数据项:', item)
    }
    
    return isValid
  })
  
  console.log(`过滤后的有效数据: ${allData.length} 个`)
  
  // 如果数据点超过500个，进行采样以提高性能
  if (allData.length > 500) {
    const step = Math.ceil(allData.length / 500)
    allData = allData.filter((_, index) => index % step === 0)
    console.log(`数据点过多(${history.length})，已采样至${allData.length}个点`)
  }
  
  if (allData.length === 0) {
    console.log('过滤后没有有效数据，清空图表配置')
    chartOption.value = {}
    return
  }
  
  const buyData = allData.map(item => {
    const buySpread = item.buyFirstSellSecond || item.buyBinanceSellOkx
    return [item.timestamp, buySpread]
  })
  const sellData = allData.map(item => {
    const sellSpread = item.sellFirstBuySecond || item.sellBinanceBuyOkx
    return [item.timestamp, sellSpread]
  })
  
  console.log('生成图表数据:')
  console.log('  buyData前3个:', buyData.slice(0, 3))
  console.log('  sellData前3个:', sellData.slice(0, 3))
  
  const newChartOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'line'
      },
      formatter: function (params) {
        if (!params || params.length === 0) return ''
        
        const time = new Date(params[0].axisValue).toLocaleTimeString()
        let html = `<div>${time}</div>`
        
        params.forEach(param => {
          const value = param.value[1]
          if (typeof value === 'number' && !isNaN(value)) {
            html += `<div style="color: ${param.color};">
              ${param.seriesName}: ${value.toFixed(4)}%
            </div>`
          }
        })
        return html
      },
      enterable: false,
      hideDelay: 100,
      showDelay: 200
    },
    animation: false,
    legend: {
      data: [`${getFirstExchangeLabel()}买/${getSecondExchangeLabel()}卖`, `${getFirstExchangeLabel()}卖/${getSecondExchangeLabel()}买`],
      top: 10
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '10%',
      top: '15%',
      containLabel: true
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
      }
    },
    dataZoom: [
      {
        type: 'inside',
        start: 0,
        end: 100,
        throttle: 100
      },
      {
        start: 0,
        end: 100,
        height: 30,
        throttle: 100
      }
    ],
    series: [
      {
        name: `${getFirstExchangeLabel()}买/${getSecondExchangeLabel()}卖`,
        type: 'line',
        smooth: false,
        symbol: 'none',
        sampling: 'lttb',
        lineStyle: {
          color: '#67C23A',
          width: 2
        },
        data: buyData
      },
      {
        name: `${getFirstExchangeLabel()}卖/${getSecondExchangeLabel()}买`,
        type: 'line',
        smooth: false,
        symbol: 'none',
        sampling: 'lttb',
        lineStyle: {
          color: '#E6A23C',
          width: 2
        },
        data: sellData
      }
    ]
  }
  
  chartOption.value = newChartOption
  console.log(`图表配置已更新完成: ${symbol}, 有效数据点: ${allData.length}`)
  console.log('=== updateChartOption 结束 ===')
}

// 带防抖的图表更新函数
const updateChartOptionDebounced = (symbol) => {
  // 清除之前的定时器
  if (updateChartTimer) {
    clearTimeout(updateChartTimer)
  }
  
  // 设置新的定时器，500ms后执行更新
  updateChartTimer = setTimeout(() => {
    nextTick(() => {
      updateChartOption(symbol)
    })
  }, 500)
}

// 刷新图表
const refreshChart = () => {
  const symbol = selectedDetailSymbol.value
  if (!symbol) {
    ElMessage.warning('请先选择交易对')
    return
  }
  
  console.log(`=== 开始刷新图表: ${symbol} ===`)
  
  // 获取历史数据
  const history = getTickHistory(symbol)
  console.log(`原始历史数据数量: ${history.length}`)
  
  if (history.length === 0) {
    console.warn('没有历史数据可以显示')
    ElMessage.warning('没有历史数据，请先生成一些测试数据')
    return
  }
  
  // 打印前3个和后3个数据样本
  console.log('前3个数据点:', history.slice(0, 3))
  console.log('后3个数据点:', history.slice(-3))
  
  // 强制清空图表配置
  chartOption.value = {}
  
  // 立即重新生成图表配置
  updateChartOption(symbol)
  
  // 强制增加chartKey触发组件重新渲染
  chartKey.value++
  
  console.log(`图表已强制刷新，新的chartKey: ${chartKey.value}`)
  ElMessage.success(`图表已刷新，数据点: ${history.length}`)
}

// 紧急重置图表（防卡死）
const emergencyResetChart = () => {
  console.log('执行紧急重置图表')
  
  const currentSymbol = selectedDetailSymbol.value
  if (!currentSymbol) {
    ElMessage.warning('请先选择交易对')
    return
  }
  
  // 完全清空图表配置
  chartOption.value = {}
  
  // 强制更新chartKey重新创建图表
  chartKey.value++
  
  // 重新生成图表配置
  setTimeout(() => {
    updateChartOption(currentSymbol)
    console.log(`紧急重置完成，新chartKey: ${chartKey.value}`)
  }, 100)
  
  ElMessage.warning('图表已紧急重置')
}

// 组件卸载时断开连接
onUnmounted(() => {
  disconnectWebSockets()
  // 清空套利机会提示防抖记录
  arbitrageNotificationTimes.value = {}
})

// 页面挂载时自动获取公共交易对
onMounted(() => {
  console.log('页面已加载，自动获取公共交易对...')
  fetchActiveContracts()
})

// 显示系统配置模态框
const showSystemConfigModal = () => {
  showSystemConfigModalState.value = true
}

// 关闭系统配置模态框
const closeSystemConfigModal = () => {
  showSystemConfigModalState.value = false
}

// 获取Funding Rate类型
const getFundingRateType = (fundingRate) => {
  if (!fundingRate) return 'info'
  if (fundingRate > 0) return 'success'
  if (fundingRate < 0) return 'danger'
  return 'info'
}

// 使用store中的formatting函数
const formatFundingRate = priceStore.formatFundingRate
const formatNextFundingTime = priceStore.formatNextFundingTime
</script>

<style scoped>
.home {
  max-width: 95%;
  margin: 0 auto;
  padding: 20px 15px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  min-height: 100vh;
}

.symbol-selector {
  margin-bottom: 25px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20px);
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  overflow: hidden;
  transition: all 0.3s ease;
}

.symbol-selector:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
  color: #2c3e50;
  font-size: 18px;
}

.action-buttons {
  margin-top: 20px;
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.action-buttons .el-button {
  border-radius: 12px;
  padding: 12px 20px;
  font-weight: 600;
  transition: all 0.3s ease;
  border: none;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
}

.action-buttons .el-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
}

.action-buttons .el-button--success {
  background: linear-gradient(135deg, #52c41a, #73d13d);
}

.action-buttons .el-button--primary {
  background: linear-gradient(135deg, #1890ff, #40a9ff);
}

.action-buttons .el-button--danger {
  background: linear-gradient(135deg, #ff4d4f, #ff7875);
}

.action-buttons .el-button--warning {
  background: linear-gradient(135deg, #faad14, #ffc53d);
}

.action-buttons .el-button--info {
  background: linear-gradient(135deg, #8c8c8c, #bfbfbf);
}

.contract-stats {
  margin-top: 20px;
  padding: 16px;
  background: linear-gradient(135deg, rgba(82, 196, 26, 0.1), rgba(115, 209, 61, 0.1));
  border-radius: 12px;
  border-left: 4px solid #52c41a;
  backdrop-filter: blur(10px);
}

.status-alert {
  margin-bottom: 25px;
  border-radius: 12px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
}

.data-table {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20px);
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  overflow: hidden;
  transition: all 0.3s ease;
}

.data-table:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
}

.price-text {
  font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
  font-weight: 600;
  color: #2c3e50;
  background: rgba(64, 169, 255, 0.1);
  padding: 4px 8px;
  border-radius: 6px;
  display: inline-block;
}

.value-text {
  font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
  font-size: 11px;
  line-height: 1.6;
}

.value-text div {
  margin: 2px 0;
  color: #666;
  background: rgba(0, 0, 0, 0.05);
  padding: 2px 6px;
  border-radius: 4px;
}

.empty-state {
  margin-top: 100px;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 16px;
  padding: 60px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(20px);
}

:deep(.el-table) {
  background: transparent;
  border-radius: 12px;
  overflow: hidden;
}

:deep(.el-table tr) {
  background: transparent;
}

:deep(.el-table--striped .el-table__body tr.el-table__row--striped td) {
  background: rgba(64, 169, 255, 0.05);
}

:deep(.el-table th.el-table__cell) {
  background: linear-gradient(135deg, rgba(64, 169, 255, 0.1), rgba(64, 169, 255, 0.05));
  color: #2c3e50;
  font-weight: 600;
  border: none;
}

:deep(.el-table td.el-table__cell) {
  border: none;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}

.status-panel {
  margin-top: 25px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20px);
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  overflow: hidden;
  transition: all 0.3s ease;
}

.status-panel:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
}

.status-item {
  padding: 20px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.8), rgba(255, 255, 255, 0.6));
  border-radius: 12px;
  margin: 10px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
  transition: all 0.3s ease;
}

.status-item:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.1);
}

.status-item h4 {
  color: #2c3e50;
  margin-bottom: 15px;
  font-size: 16px;
  font-weight: 600;
  padding-bottom: 8px;
  border-bottom: 2px solid #e8f4fd;
}

.symbol-status {
  margin-bottom: 12px;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.7);
  border-radius: 8px;
  border-left: 3px solid #1890ff;
}

.data-status {
  margin-top: 6px;
  display: flex;
  gap: 10px;
}

.connected {
  color: #52c41a;
  font-weight: 600;
  padding: 2px 6px;
  background: rgba(82, 196, 26, 0.1);
  border-radius: 4px;
}

.disconnected {
  color: #ff4d4f;
  font-weight: 600;
  padding: 2px 6px;
  background: rgba(255, 77, 79, 0.1);
  border-radius: 4px;
}

.quick-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.quick-actions .el-button {
  border-radius: 8px;
  font-weight: 600;
  transition: all 0.3s ease;
}

.quick-actions .el-button:hover {
  transform: translateY(-1px);
}

.stat-number {
  font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
  font-weight: 700;
  font-size: 18px;
  background: linear-gradient(135deg, #1890ff, #40a9ff);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.stat-number.success {
  background: linear-gradient(135deg, #52c41a, #73d13d);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.stat-number.warning {
  background: linear-gradient(135deg, #faad14, #ffc53d);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.detail-content {
  background: linear-gradient(135deg, #f6f9fc, #ffffff);
  border-radius: 16px;
  padding: 20px;
}

.spread-display {
  text-align: center;
  padding: 30px;
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.7));
}

.spread-value {
  font-size: 36px;
  font-weight: 800;
  font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.spread-value.positive-high {
  background: linear-gradient(135deg, #52c41a, #73d13d);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.spread-value.positive {
  background: linear-gradient(135deg, #1890ff, #40a9ff);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.spread-value.negative {
  background: linear-gradient(135deg, #ff4d4f, #ff7875);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.spread-value.neutral {
  background: linear-gradient(135deg, #8c8c8c, #bfbfbf);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.spread-desc {
  margin-top: 12px;
  color: #666;
  font-size: 16px;
  font-weight: 500;
}

.price-info {
  padding: 20px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.7));
  border-radius: 12px;
}

.price-info p {
  margin: 10px 0;
  font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
  font-weight: 600;
  color: #2c3e50;
  padding: 8px 12px;
  background: rgba(64, 169, 255, 0.1);
  border-radius: 6px;
  border-left: 3px solid #1890ff;
}

.stat-item {
  text-align: center;
  padding: 25px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.7));
  border-radius: 12px;
  transition: all 0.3s ease;
}

.stat-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.1);
}

.stat-label {
  font-size: 14px;
  color: #666;
  margin-bottom: 10px;
  font-weight: 500;
}

.stat-value {
  font-size: 28px;
  font-weight: 800;
  font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
}

.stat-value.positive {
  background: linear-gradient(135deg, #52c41a, #73d13d);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.stat-value.negative {
  background: linear-gradient(135deg, #ff4d4f, #ff7875);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.queue-stats-content {
  background: linear-gradient(135deg, #f6f9fc, #ffffff);
  border-radius: 16px;
  padding: 20px;
}

.queue-status, .receive-stats, .match-stats {
  font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
  font-size: 12px;
  line-height: 1.6;
}

.queue-status div, .receive-stats div, .match-stats div {
  margin: 3px 0;
  padding: 4px 8px;
  background: rgba(64, 169, 255, 0.1);
  border-radius: 4px;
  border-left: 2px solid #1890ff;
}

.text-muted {
  color: #bfbfbf;
  font-style: italic;
}

/* 添加渐变动画 */
@keyframes gradient {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

.home {
  background: linear-gradient(-45deg, #667eea, #764ba2, #667eea, #f093fb);
  background-size: 400% 400%;
  animation: gradient 15s ease infinite;
}

/* 添加闪烁效果给重要数据 */
.connected {
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% { opacity: 1; }
  50% { opacity: 0.7; }
  100% { opacity: 1; }
}

/* 标签美化 */
:deep(.el-tag) {
  border-radius: 8px;
  font-weight: 600;
  padding: 4px 12px;
  border: none;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

:deep(.el-tag--primary) {
  background: linear-gradient(135deg, #1890ff, #40a9ff);
  color: white;
}

:deep(.el-tag--success) {
  background: linear-gradient(135deg, #52c41a, #73d13d);
  color: white;
}

:deep(.el-tag--warning) {
  background: linear-gradient(135deg, #faad14, #ffc53d);
  color: white;
}

:deep(.el-tag--danger) {
  background: linear-gradient(135deg, #ff4d4f, #ff7875);
  color: white;
}

:deep(.el-tag--info) {
  background: linear-gradient(135deg, #8c8c8c, #bfbfbf);
  color: white;
}

/* 模态框美化 */
:deep(.el-dialog) {
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(20px);
}

:deep(.el-dialog__header) {
  background: linear-gradient(135deg, #1890ff, #40a9ff);
  color: white;
  border-radius: 16px 16px 0 0;
  padding: 20px 24px;
}

:deep(.el-dialog__title) {
  color: white;
  font-weight: 600;
  font-size: 18px;
}

:deep(.el-dialog__body) {
  padding: 24px;
  background: linear-gradient(135deg, #f6f9fc, #ffffff);
}

/* 选择框美化 */
:deep(.el-select) {
  border-radius: 12px;
}

:deep(.el-input__wrapper) {
  border-radius: 12px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
  border: 1px solid rgba(24, 144, 255, 0.2);
  transition: all 0.3s ease;
}

:deep(.el-input__wrapper:hover) {
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
  border-color: #1890ff;
}

:deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 8px 25px rgba(24, 144, 255, 0.3);
  border-color: #1890ff;
}

/* 清空提示记录按钮特殊样式 */
.clear-notifications-btn {
  background: linear-gradient(135deg, #ff6b6b, #ee5a52) !important;
  color: white !important;
  border: none !important;
  border-radius: 12px !important;
  padding: 10px 16px !important;
  font-weight: 600 !important;
  font-size: 13px !important;
  transition: all 0.3s ease !important;
  box-shadow: 0 4px 15px rgba(255, 107, 107, 0.3) !important;
  position: relative !important;
  overflow: hidden !important;
}

.clear-notifications-btn:hover {
  background: linear-gradient(135deg, #ff5252, #f44336) !important;
  transform: translateY(-2px) !important;
  box-shadow: 0 6px 20px rgba(255, 107, 107, 0.4) !important;
}

.clear-notifications-btn:active {
  transform: translateY(0) !important;
  box-shadow: 0 2px 10px rgba(255, 107, 107, 0.3) !important;
}

.clear-notifications-btn::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
  transition: left 0.5s ease;
}

.clear-notifications-btn:hover::before {
  left: 100%;
}

.clear-notifications-btn .el-icon {
  margin-right: 6px !important;
  animation: shake 2s infinite !important;
}

@keyframes shake {
  0%, 50%, 100% { transform: rotate(0deg); }
  25% { transform: rotate(-5deg); }
  75% { transform: rotate(5deg); }
}

/* 响应式设计 */
@media (max-width: 768px) {
  .home {
    max-width: 100%;
    padding: 15px 10px;
  }
  
  .action-buttons {
    flex-wrap: wrap;
    gap: 8px;
  }
  
  .action-buttons .el-button {
    flex: 1;
    min-width: 120px;
  }
}

@media (min-width: 769px) and (max-width: 1200px) {
  .home {
    max-width: 98%;
    padding: 20px 15px;
  }
}

@media (min-width: 1201px) and (max-width: 1600px) {
  .home {
    max-width: 95%;
    padding: 25px 20px;
  }
}

@media (min-width: 1601px) {
  .home {
    max-width: 92%;
    padding: 30px 25px;
  }
}

.funding-rate-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.loading-text {
  color: #bfbfbf;
  font-style: italic;
  font-size: 12px;
}

.funding-time {
  font-size: 11px;
  color: #666;
  background: #f5f5f5;
  padding: 2px 6px;
  border-radius: 4px;
  white-space: nowrap;
}
</style> 