<template>
  <div class="system-config">
    <!-- 配置面板标题 -->
    <div class="config-header">
      <h3>系统配置管理</h3>
      <div class="config-actions">
        <button @click="resetToDefaults" class="btn-reset">重置默认</button>
        <button @click="toggleAdvanced" class="btn-toggle">
          {{ showAdvanced ? '简化模式' : '高级模式' }}
        </button>
      </div>
    </div>

    <!-- 配置表单 -->
    <form @submit.prevent="applyConfig" class="config-form">
      <!-- 匹配说明 -->
      <div class="config-info">
        <h4>📝 匹配过期时间配置说明</h4>
        <p>系统通过队列匹配两个交易所的数据来计算价差。匹配过期时间控制数据的有效期：</p>
        <ul>
          <li><strong>匹配最大时间差</strong>：两个交易所数据时间戳差异的最大允许值</li>
          <li><strong>数据匹配过期时间</strong>：队列中数据的生存时间，超时后自动清理</li>
          <li><strong>清理间隔</strong>：系统清理过期数据的频率</li>
        </ul>
      </div>

      <!-- 基础配置 -->
      <div class="config-section">
        <h4>🔄 数据匹配配置</h4>
        
        <div class="config-item">
          <label for="maxTimeDiff">匹配最大时间差 (ms)</label>
          <div class="input-group">
            <input 
              id="maxTimeDiff"
              v-model.number="formConfig.maxTimeDiff" 
              type="number" 
              min="500" 
              max="5000"
              :class="{ 'error': errors.maxTimeDiff }"
            />
            <span class="unit">ms</span>
          </div>
          <div class="description">
            两个交易所数据匹配时允许的最大时间差，影响价差计算精度，推荐范围: 500-5000ms
          </div>
          <div v-if="errors.maxTimeDiff" class="error-message">{{ errors.maxTimeDiff }}</div>
        </div>

        <div class="config-item">
          <label for="dataExpirationTime">数据匹配过期时间 (ms)</label>
          <div class="input-group">
            <input 
              id="dataExpirationTime"
              v-model.number="formConfig.dataExpirationTime" 
              type="number" 
              min="100" 
              max="5000"
              :class="{ 'error': errors.dataExpirationTime }"
            />
            <span class="unit">ms</span>
          </div>
          <div class="description">
            队列中数据的匹配过期时间，超过此时间的数据将被清理且不再参与匹配，推荐范围: 500-3000ms
          </div>
          <div v-if="errors.dataExpirationTime" class="error-message">{{ errors.dataExpirationTime }}</div>
        </div>

        <div class="config-item">
          <label for="timeMatchingMode">时间匹配模式</label>
          <div class="input-group">
            <select 
              id="timeMatchingMode"
              v-model="formConfig.timeMatchingMode"
              :class="{ 'error': errors.timeMatchingMode }"
            >
              <option value="receiveTime">本地接收时间</option>
              <option value="originalTimestamp">交易所原始时间戳</option>
            </select>
          </div>
          <div class="description">
            <strong>本地接收时间</strong>: 使用数据到达本地系统的时间进行匹配（推荐）<br>
            <strong>交易所原始时间戳</strong>: 使用交易所发送的原始时间戳进行匹配（可能更准确，但需要交易所支持）
          </div>
          <div v-if="errors.timeMatchingMode" class="error-message">{{ errors.timeMatchingMode }}</div>
        </div>

        <div class="config-item">
          <label for="maxLocalTimeDiff">最大本地时间差 (ms)</label>
          <div class="input-group">
            <input 
              id="maxLocalTimeDiff"
              v-model.number="formConfig.maxLocalTimeDiff" 
              type="number" 
              min="100" 
              max="2000"
              :class="{ 'error': errors.maxLocalTimeDiff }"
            />
            <span class="unit">ms</span>
          </div>
          <div class="description">
            原始时间戳与本地时间的最大允许差异。超过此时间的数据将被视为过旧而放弃匹配，推荐范围: 100-2000ms
          </div>
          <div v-if="errors.maxLocalTimeDiff" class="error-message">{{ errors.maxLocalTimeDiff }}</div>
        </div>
      </div>

      <!-- 高级配置 -->
      <div v-if="showAdvanced" class="config-section">
        <h4>⚙️ 高级系统配置</h4>
        
        <div class="config-item">
          <label for="cleanupInterval">清理间隔 (ms)</label>
          <div class="input-group">
            <input 
              id="cleanupInterval"
              v-model.number="formConfig.cleanupInterval" 
              type="number" 
              min="100" 
              max="10000"
              :class="{ 'error': errors.cleanupInterval }"
            />
            <span class="unit">ms</span>
          </div>
          <div class="description">
            多久执行一次过期数据清理，推荐范围: 1000-10000ms（默认5秒）
          </div>
          <div v-if="errors.cleanupInterval" class="error-message">{{ errors.cleanupInterval }}</div>
        </div>

        <div class="config-item">
          <label for="maxQueueSize">队列最大容量</label>
          <div class="input-group">
            <input 
              id="maxQueueSize"
              v-model.number="formConfig.maxQueueSize" 
              type="number" 
              min="10" 
              max="1000"
              :class="{ 'error': errors.maxQueueSize }"
            />
            <span class="unit">个</span>
          </div>
          <div class="description">
            每个队列最多保留的数据点数，推荐范围: 50-500个
          </div>
          <div v-if="errors.maxQueueSize" class="error-message">{{ errors.maxQueueSize }}</div>
        </div>

        <div class="config-item">
          <label for="historyRetentionCount">历史数据保留数量</label>
          <div class="input-group">
            <input 
              id="historyRetentionCount"
              v-model.number="formConfig.historyRetentionCount" 
              type="number" 
              min="100" 
              max="10000"
              :class="{ 'error': errors.historyRetentionCount }"
            />
            <span class="unit">个</span>
          </div>
          <div class="description">
            最多保留的历史tick数量，推荐范围: 1000-10000个
          </div>
          <div v-if="errors.historyRetentionCount" class="error-message">{{ errors.historyRetentionCount }}</div>
        </div>
      </div>

      <!-- 当前配置显示 -->
      <div class="current-config">
        <h4>当前配置</h4>
        <div class="config-display">
          <div class="config-row" v-for="(value, key) in currentConfig" :key="key">
            <span class="config-key">{{ getConfigName(key) }}:</span>
            <span class="config-value">{{ value }}{{ getConfigUnit(key) }}</span>
          </div>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="config-buttons">
        <button type="submit" class="btn-apply" :disabled="hasErrors">
          应用配置
        </button>
        <button type="button" @click="reloadConfig" class="btn-reload">
          重新加载
        </button>
      </div>
    </form>

    <!-- 状态消息 -->
    <div v-if="message" class="status-message" :class="messageType">
      {{ message }}
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, watch } from 'vue'
import { usePriceStore } from '@/stores/priceStore'

export default {
  name: 'SystemConfig',
  setup() {
    const priceStore = usePriceStore()
    
    // 响应式数据
    const showAdvanced = ref(false)
    const formConfig = ref({})
    const currentConfig = ref({})
    const errors = ref({})
    const message = ref('')
    const messageType = ref('success')
    
    // 配置描述映射
    const configDescriptions = ref({})
    
    // 计算属性
    const hasErrors = computed(() => {
      return Object.keys(errors.value).length > 0
    })
    
    // 获取配置项显示名称
    const getConfigName = (key) => {
      return configDescriptions.value[key]?.name || key
    }
    
    // 获取配置项单位
    const getConfigUnit = (key) => {
      return configDescriptions.value[key]?.unit || ''
    }
    
    // 验证配置
    const validateForm = () => {
      const validationErrors = priceStore.validateConfig(formConfig.value)
      errors.value = {}
      
      validationErrors.forEach(error => {
        const key = error.split(' ')[0]
        errors.value[key] = error
      })
    }
    
    // 加载当前配置
    const loadConfig = () => {
      currentConfig.value = priceStore.getSystemConfig()
      formConfig.value = { ...currentConfig.value }
      configDescriptions.value = priceStore.getConfigDescription()
    }
    
    // 重新加载配置
    const reloadConfig = () => {
      loadConfig()
      errors.value = {}
      showMessage('配置已重新加载', 'info')
    }
    
    // 应用配置
    const applyConfig = async () => {
      try {
        validateForm()
        
        if (hasErrors.value) {
          showMessage('请修正配置错误后再试', 'error')
          return
        }
        
        await priceStore.safeUpdateSystemConfig(formConfig.value)
        currentConfig.value = priceStore.getSystemConfig()
        showMessage('配置已成功应用', 'success')
      } catch (error) {
        showMessage(`配置应用失败: ${error.message}`, 'error')
      }
    }
    
    // 重置为默认值
    const resetToDefaults = async () => {
      try {
        await priceStore.resetSystemConfig()
        loadConfig()
        showMessage('配置已重置为默认值', 'success')
      } catch (error) {
        showMessage(`重置失败: ${error.message}`, 'error')
      }
    }
    
    // 切换高级模式
    const toggleAdvanced = () => {
      showAdvanced.value = !showAdvanced.value
    }
    
    // 显示消息
    const showMessage = (msg, type = 'success') => {
      message.value = msg
      messageType.value = type
      setTimeout(() => {
        message.value = ''
      }, 3000)
    }
    
    // 监听表单变化进行实时验证
    watch(formConfig, () => {
      validateForm()
    }, { deep: true })
    
    // 组件挂载时加载配置
    onMounted(() => {
      loadConfig()
    })
    
    return {
      showAdvanced,
      formConfig,
      currentConfig,
      errors,
      message,
      messageType,
      hasErrors,
      getConfigName,
      getConfigUnit,
      loadConfig,
      reloadConfig,
      applyConfig,
      resetToDefaults,
      toggleAdvanced
    }
  }
}
</script>

<style scoped>
.system-config {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(102, 126, 234, 0.37);
  backdrop-filter: blur(4px);
  border: 1px solid rgba(255, 255, 255, 0.18);
}

.config-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
}

.config-header h3 {
  color: white;
  margin: 0;
  font-size: 1.5rem;
  font-weight: 600;
}

.config-actions {
  display: flex;
  gap: 10px;
}

.btn-reset,
.btn-toggle {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.3s ease;
}

.btn-reset {
  background: rgba(255, 107, 107, 0.8);
  color: white;
}

.btn-reset:hover {
  background: rgba(255, 107, 107, 1);
  transform: translateY(-2px);
}

.btn-toggle {
  background: rgba(255, 255, 255, 0.2);
  color: white;
}

.btn-toggle:hover {
  background: rgba(255, 255, 255, 0.3);
  transform: translateY(-2px);
}

.config-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.config-info {
  background: rgba(24, 144, 255, 0.1);
  padding: 20px;
  border-radius: 8px;
  border-left: 4px solid rgba(24, 144, 255, 0.5);
  backdrop-filter: blur(10px);
}

.config-info h4 {
  color: white;
  margin: 0 0 15px 0;
  font-size: 1.1rem;
  font-weight: 600;
}

.config-info p {
  color: rgba(255, 255, 255, 0.9);
  margin: 0 0 10px 0;
  line-height: 1.5;
}

.config-info ul {
  color: rgba(255, 255, 255, 0.8);
  margin: 0;
  padding-left: 20px;
}

.config-info li {
  margin: 8px 0;
  line-height: 1.4;
}

.config-info strong {
  color: white;
  font-weight: 600;
}

.config-section {
  background: rgba(255, 255, 255, 0.1);
  padding: 20px;
  border-radius: 8px;
  backdrop-filter: blur(10px);
}

.config-section h4 {
  color: white;
  margin: 0 0 15px 0;
  font-size: 1.2rem;
  font-weight: 600;
}

.config-item {
  margin-bottom: 20px;
}

.config-item label {
  display: block;
  color: white;
  font-weight: 500;
  margin-bottom: 8px;
}

.input-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.input-group input {
  flex: 1;
  padding: 10px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.1);
  color: white;
  font-size: 14px;
  transition: all 0.3s ease;
}

.input-group input:focus {
  outline: none;
  border-color: rgba(255, 255, 255, 0.6);
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.2);
}

.input-group input.error {
  border-color: #ff6b6b;
}

.input-group .unit {
  color: rgba(255, 255, 255, 0.8);
  font-size: 14px;
  min-width: 30px;
}

.description {
  color: rgba(255, 255, 255, 0.7);
  font-size: 12px;
  margin-top: 4px;
  line-height: 1.4;
}

.error-message {
  color: #ff6b6b;
  font-size: 12px;
  margin-top: 4px;
}

.current-config {
  background: rgba(255, 255, 255, 0.05);
  padding: 15px;
  border-radius: 6px;
  border-left: 4px solid rgba(255, 255, 255, 0.3);
}

.current-config h4 {
  color: white;
  margin: 0 0 10px 0;
  font-size: 1rem;
}

.config-display {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 8px;
}

.config-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
}

.config-key {
  color: rgba(255, 255, 255, 0.8);
  font-size: 14px;
}

.config-value {
  color: white;
  font-weight: 500;
  font-size: 14px;
}

.config-buttons {
  display: flex;
  gap: 10px;
  justify-content: center;
  margin-top: 20px;
}

.btn-apply,
.btn-reload {
  padding: 12px 24px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  transition: all 0.3s ease;
}

.btn-apply {
  background: linear-gradient(45deg, #4CAF50, #45a049);
  color: white;
}

.btn-apply:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(76, 175, 80, 0.4);
}

.btn-apply:disabled {
  background: rgba(255, 255, 255, 0.2);
  cursor: not-allowed;
}

.btn-reload {
  background: rgba(255, 255, 255, 0.2);
  color: white;
}

.btn-reload:hover {
  background: rgba(255, 255, 255, 0.3);
  transform: translateY(-2px);
}

.status-message {
  margin-top: 15px;
  padding: 10px;
  border-radius: 6px;
  text-align: center;
  font-weight: 500;
}

.status-message.success {
  background: rgba(76, 175, 80, 0.2);
  color: #4CAF50;
  border: 1px solid rgba(76, 175, 80, 0.3);
}

.status-message.error {
  background: rgba(255, 107, 107, 0.2);
  color: #ff6b6b;
  border: 1px solid rgba(255, 107, 107, 0.3);
}

.status-message.info {
  background: rgba(33, 150, 243, 0.2);
  color: #2196F3;
  border: 1px solid rgba(33, 150, 243, 0.3);
}

/* 响应式设计 */
@media (max-width: 768px) {
  .system-config {
    margin: 10px;
    padding: 15px;
  }
  
  .config-header {
    flex-direction: column;
    gap: 10px;
    align-items: stretch;
  }
  
  .config-actions {
    justify-content: center;
  }
  
  .config-display {
    grid-template-columns: 1fr;
  }
  
  .config-buttons {
    flex-direction: column;
  }
}
</style> 