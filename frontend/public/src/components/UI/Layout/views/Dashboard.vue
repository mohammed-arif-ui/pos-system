<!-- project/frontend/src/views/Dashboard.vue -->
<template>
  <div class="dashboard">
    <!-- Header -->
    <div class="dashboard-header">
      <h1>Dashboard</h1>
      <div class="header-actions">
        <el-button type="primary" @click="refreshData" :loading="loading">
          <el-icon><Refresh /></el-icon>
          Refresh
        </el-button>
        <el-button @click="exportReport">
          <el-icon><Document /></el-icon>
          Export Report
        </el-button>
      </div>
    </div>

    <!-- Date Range Filter -->
    <div class="filters-section">
      <el-card shadow="never" class="filter-card">
        <div class="filter-controls">
          <div class="date-range">
            <span class="filter-label">Date Range:</span>
            <el-date-picker
              v-model="dateRange"
              type="daterange"
              range-separator="To"
              start-placeholder="Start date"
              end-placeholder="End date"
              @change="handleDateChange"
              :disabled-date="disabledDate"
            />
          </div>
          <div class="warehouse-filter">
            <span class="filter-label">Warehouse:</span>
            <el-select v-model="selectedWarehouse" placeholder="All Warehouses" @change="handleWarehouseChange">
              <el-option label="All Warehouses" value="all" />
              <el-option
                v-for="warehouse in warehouses"
                :key="warehouse.id"
                :label="warehouse.name"
                :value="warehouse.id"
              />
            </el-select>
          </div>
        </div>
      </el-card>
    </div>

    <!-- Key Metrics KPI Cards -->
    <div class="kpi-section">
      <el-row :gutter="20">
        <el-col :xs="24" :sm="12" :md="6" :lg="6">
          <el-card shadow="hover" class="kpi-card revenue-card">
            <div class="kpi-content">
              <div class="kpi-icon">
                <el-icon><Money /></el-icon>
              </div>
              <div class="kpi-info">
                <div class="kpi-value">${{ formatNumber(dashboardData.total_revenue) }}</div>
                <div class="kpi-label">Total Revenue</div>
                <div class="kpi-trend" :class="getTrendClass(dashboardData.revenue_trend)">
                  <el-icon v-if="dashboardData.revenue_trend > 0"><Top /></el-icon>
                  <el-icon v-else-if="dashboardData.revenue_trend < 0"><Bottom /></el-icon>
                  <span v-else>-</span>
                  {{ Math.abs(dashboardData.revenue_trend) }}%
                </div>
              </div>
            </div>
          </el-card>
        </el-col>

        <el-col :xs="24" :sm="12" :md="6" :lg="6">
          <el-card shadow="hover" class="kpi-card sales-card">
            <div class="kpi-content">
              <div class="kpi-icon">
                <el-icon><ShoppingCart /></el-icon>
              </div>
              <div class="kpi-info">
                <div class="kpi-value">{{ formatNumber(dashboardData.total_sales) }}</div>
                <div class="kpi-label">Total Sales</div>
                <div class="kpi-trend" :class="getTrendClass(dashboardData.sales_trend)">
                  <el-icon v-if="dashboardData.sales_trend > 0"><Top /></el-icon>
                  <el-icon v-else-if="dashboardData.sales_trend < 0"><Bottom /></el-icon>
                  <span v-else>-</span>
                  {{ Math.abs(dashboardData.sales_trend) }}%
                </div>
              </div>
            </div>
          </el-card>
        </el-col>

        <el-col :xs="24" :sm="12" :md="6" :lg="6">
          <el-card shadow="hover" class="kpi-card customers-card">
            <div class="kpi-content">
              <div class="kpi-icon">
                <el-icon><User /></el-icon>
              </div>
              <div class="kpi-info">
                <div class="kpi-value">{{ formatNumber(dashboardData.total_customers) }}</div>
                <div class="kpi-label">Total Customers</div>
                <div class="kpi-trend" :class="getTrendClass(dashboardData.customers_trend)">
                  <el-icon v-if="dashboardData.customers_trend > 0"><Top /></el-icon>
                  <el-icon v-else-if="dashboardData.customers_trend < 0"><Bottom /></el-icon>
                  <span v-else>-</span>
                  {{ Math.abs(dashboardData.customers_trend) }}%
                </div>
              </div>
            </div>
          </el-card>
        </el-col>

        <el-col :xs="24" :sm="12" :md="6" :lg="6">
          <el-card shadow="hover" class="kpi-card inventory-card">
            <div class="kpi-content">
              <div class="kpi-icon">
                <el-icon><Box /></el-icon>
              </div>
              <div class="kpi-info">
                <div class="kpi-value">{{ formatNumber(dashboardData.low_stock_items) }}</div>
                <div class="kpi-label">Low Stock Items</div>
                <div class="kpi-trend warning" v-if="dashboardData.low_stock_items > 0">
                  <el-icon><Warning /></el-icon>
                  Needs Attention
                </div>
                <div class="kpi-trend positive" v-else>
                  <el-icon><SuccessFilled /></el-icon>
                  All Good
                </div>
              </div>
            </div>
          </el-card>
        </el-col>
      </el-row>
    </div>

    <!-- Charts Section -->
    <div class="charts-section">
      <el-row :gutter="20">
        <!-- Revenue Chart -->
        <el-col :xs="24" :lg="16">
          <el-card shadow="never" class="chart-card">
            <template #header>
              <div class="chart-header">
                <h3>Revenue Overview</h3>
                <el-select v-model="revenueChartType" size="small" @change="updateRevenueChart">
                  <el-option label="Daily" value="daily" />
                  <el-option label="Weekly" value="weekly" />
                  <el-option label="Monthly" value="monthly" />
                </el-select>
              </div>
            </template>
            <div v-loading="chartLoading" class="chart-container">
              <v-chart :option="revenueChartOption" :autoresize="true" style="height: 300px;" />
            </div>
          </el-card>
        </el-col>

        <!-- Sales by Category -->
        <el-col :xs="24" :lg="8">
          <el-card shadow="never" class="chart-card">
            <template #header>
              <h3>Sales by Category</h3>
            </template>
            <div v-loading="chartLoading" class="chart-container">
              <v-chart :option="categoryChartOption" :autoresize="true" style="height: 300px;" />
            </div>
          </el-card>
        </el-col>
      </el-row>
    </div>

    <!-- Additional Metrics and Tables -->
    <div class="tables-section">
      <el-row :gutter="20">
        <!-- Recent Sales -->
        <el-col :xs="24" :lg="12">
          <el-card shadow="never" class="table-card">
            <template #header>
              <div class="table-header">
                <h3>Recent Sales</h3>
                <el-button text @click="$router.push('/sales')">View All</el-button>
              </div>
            </template>
            <el-table
              :data="recentSales"
              v-loading="tableLoading"
              style="width: 100%"
              :show-header="false"
            >
              <el-table-column prop="sale_id" label="Sale ID">
                <template #default="{ row }">
                  <div class="sale-info">
                    <div class="sale-id">#{{ row.sale_id }}</div>
                    <div class="sale-time">{{ formatTime(row.created_at) }}</div>
                  </div>
                </template>
              </el-table-column>
              <el-table-column prop="customer_name" label="Customer">
                <template #default="{ row }">
                  <div class="customer-info">
                    {{ row.customer_name || 'Walk-in Customer' }}
                  </div>
                </template>
              </el-table-column>
              <el-table-column prop="total_amount" label="Amount" align="right">
                <template #default="{ row }">
                  <div class="sale-amount">
                    ${{ formatNumber(row.total_amount) }}
                  </div>
                </template>
              </el-table-column>
            </el-table>
          </el-card>
        </el-col>

        <!-- Top Selling Products -->
        <el-col :xs="24" :lg="12">
          <el-card shadow="never" class="table-card">
            <template #header>
              <div class="table-header">
                <h3>Top Selling Products</h3>
                <el-button text @click="$router.push('/inventory')">View All</el-button>
              </div>
            </template>
            <el-table
              :data="topProducts"
              v-loading="tableLoading"
              style="width: 100%"
              :show-header="false"
            >
              <el-table-column prop="item_name" label="Product">
                <template #default="{ row }">
                  <div class="product-info">
                    <div class="product-name">{{ row.item_name }}</div>
                    <div class="product-sku">SKU: {{ row.sku }}</div>
                  </div>
                </template>
              </el-table-column>
              <el-table-column prop="total_quantity" label="Sold" width="80" align="center">
                <template #default="{ row }">
                  <el-tag type="info">{{ row.total_quantity }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="total_revenue" label="Revenue" align="right">
                <template #default="{ row }">
                  <div class="revenue-amount">
                    ${{ formatNumber(row.total_revenue) }}
                  </div>
                </template>
              </el-table-column>
            </el-table>
          </el-card>
        </el-col>
      </el-row>
    </div>

    <!-- Low Stock Alert -->
    <div class="alert-section" v-if="lowStockItems.length > 0">
      <el-alert
        title="Low Stock Alert"
        type="warning"
        :description="`You have ${lowStockItems.length} items running low on stock`"
        show-icon
        :closable="false"
      />
      <el-table :data="lowStockItems" size="small" class="low-stock-table">
        <el-table-column prop="item_name" label="Item Name" />
        <el-table-column prop="sku" label="SKU" />
        <el-table-column prop="current_stock" label="Current Stock" align="center">
          <template #default="{ row }">
            <el-tag :type="row.current_stock <= 5 ? 'danger' : 'warning'">
              {{ row.current_stock }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="min_stock_level" label="Min Level" align="center" />
        <el-table-column label="Action" width="120">
          <template #default="{ row }">
            <el-button size="small" type="primary" @click="handleReorder(row)">
              Reorder
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart, PieChart, BarChart } from 'echarts/charts'
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent
} from 'echarts/components'
import VChart from 'vue-echarts'
import {
  Refresh,
  Document,
  Money,
  ShoppingCart,
  User,
  Box,
  Warning,
  SuccessFilled,
  Top,
  Bottom
} from '@element-plus/icons-vue'

// Register ECharts components
use([
  CanvasRenderer,
  LineChart,
  PieChart,
  BarChart,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent
])

export default {
  name: 'Dashboard',
  components: {
    VChart,
    Refresh,
    Document,
    Money,
    ShoppingCart,
    User,
    Box,
    Warning,
    SuccessFilled,
    Top,
    Bottom
  },
  setup() {
    const router = useRouter()
    const loading = ref(false)
    const chartLoading = ref(false)
    const tableLoading = ref(false)

    // Data refs
    const dashboardData = ref({
      total_revenue: 0,
      total_sales: 0,
      total_customers: 0,
      low_stock_items: 0,
      revenue_trend: 0,
      sales_trend: 0,
      customers_trend: 0
    })

    const recentSales = ref([])
    const topProducts = ref([])
    const lowStockItems = ref([])
    const warehouses = ref([])

    // Filter refs
    const dateRange = ref([new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), new Date()])
    const selectedWarehouse = ref('all')
    const revenueChartType = ref('daily')

    // Chart options
    const revenueChartOption = ref({})
    const categoryChartOption = ref({})

    // Methods
    const fetchDashboardData = async () => {
      loading.value = true
      chartLoading.value = true
      tableLoading.value = true

      try {
        const [startDate, endDate] = dateRange.value
        const params = {
          start_date: startDate.toISOString().split('T')[0],
          end_date: endDate.toISOString().split('T')[0],
          warehouse_id: selectedWarehouse.value === 'all' ? null : selectedWarehouse.value
        }

        // Fetch all data in parallel
        const [
          summaryRes,
          salesRes,
          productsRes,
          stockRes,
          warehousesRes,
          revenueChartRes,
          categoryChartRes
        ] = await Promise.all([
          dashboardApi.getSummary(params),
          dashboardApi.getRecentSales(params),
          dashboardApi.getTopProducts(params),
          dashboardApi.getLowStock(params),
          dashboardApi.getWarehouses(),
          dashboardApi.getRevenueChart({ ...params, type: revenueChartType.value }),
          dashboardApi.getCategoryChart(params)
        ])

        // Update data
        dashboardData.value = summaryRes.data
        recentSales.value = salesRes.data
        topProducts.value = productsRes.data
        lowStockItems.value = stockRes.data
        warehouses.value = warehousesRes.data

        // Update charts
        revenueChartOption.value = getRevenueChartOption(revenueChartRes.data)
        categoryChartOption.value = getCategoryChartOption(categoryChartRes.data)

      } catch (error) {
        console.error('Error fetching dashboard data:', error)
        ElMessage.error('Failed to load dashboard data')
      } finally {
        loading.value = false
        chartLoading.value = false
        tableLoading.value = false
      }
    }

    const getRevenueChartOption = (data) => {
      return {
        tooltip: {
          trigger: 'axis',
          formatter: '{b}<br/>${c}'
        },
        xAxis: {
          type: 'category',
          data: data.labels
        },
        yAxis: {
          type: 'value',
          axisLabel: {
            formatter: '${value}'
          }
        },
        series: [
          {
            name: 'Revenue',
            type: 'line',
            data: data.values,
            smooth: true,
            itemStyle: {
              color: '#409EFF'
            },
            areaStyle: {
              color: {
                type: 'linear',
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [{
                  offset: 0, color: 'rgba(64, 158, 255, 0.3)'
                }, {
                  offset: 1, color: 'rgba(64, 158, 255, 0.1)'
                }]
              }
            }
          }
        ],
        grid: {
          left: '3%',
          right: '4%',
          bottom: '3%',
          containLabel: true
        }
      }
    }

    const getCategoryChartOption = (data) => {
      return {
        tooltip: {
          trigger: 'item',
          formatter: '{a} <br/>{b}: {c} ({d}%)'
        },
        legend: {
          orient: 'vertical',
          right: 10,
          top: 'center',
          formatter: (name) => {
            const item = data.find(d => d.name === name)
            return item ? `${name}: $${item.value}` : name
          }
        },
        series: [
          {
            name: 'Sales by Category',
            type: 'pie',
            radius: ['40%', '70%'],
            avoidLabelOverlap: false,
            itemStyle: {
              borderRadius: 10,
              borderColor: '#fff',
              borderWidth: 2
            },
            label: {
              show: false,
              position: 'center'
            },
            emphasis: {
              label: {
                show: true,
                fontSize: '18',
                fontWeight: 'bold'
              }
            },
            labelLine: {
              show: false
            },
            data: data
          }
        ]
      }
    }

    const formatNumber = (num) => {
      return new Intl.NumberFormat('en-US').format(num)
    }

    const formatTime = (timestamp) => {
      return new Date(timestamp).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
      })
    }

    const getTrendClass = (trend) => {
      if (trend > 0) return 'positive'
      if (trend < 0) return 'negative'
      return 'neutral'
    }

    const disabledDate = (time) => {
      return time.getTime() > Date.now()
    }

    const handleDateChange = () => {
      fetchDashboardData()
    }

    const handleWarehouseChange = () => {
      fetchDashboardData()
    }

    const updateRevenueChart = () => {
      fetchDashboardData()
    }

    const refreshData = () => {
      fetchDashboardData()
      ElMessage.success('Dashboard data refreshed')
    }

    const exportReport = async () => {
      try {
        const [startDate, endDate] = dateRange.value
        await dashboardApi.exportReport({
          start_date: startDate.toISOString().split('T')[0],
          end_date: endDate.toISOString().split('T')[0],
          warehouse_id: selectedWarehouse.value === 'all' ? null : selectedWarehouse.value
        })
        ElMessage.success('Report exported successfully')
      } catch (error) {
        ElMessage.error('Failed to export report')
      }
    }

    const handleReorder = (item) => {
      router.push(`/purchasing/new?item_id=${item.id}`)
    }

    // Mock API service (replace with actual API calls)
    const dashboardApi = {
      getSummary: (params) => Promise.resolve({ data: {
        total_revenue: 15420.75,
        total_sales: 342,
        total_customers: 287,
        low_stock_items: 12,
        revenue_trend: 15.5,
        sales_trend: 8.2,
        customers_trend: 12.1
      }}),
      getRecentSales: (params) => Promise.resolve({ data: [] }),
      getTopProducts: (params) => Promise.resolve({ data: [] }),
      getLowStock: (params) => Promise.resolve({ data: [] }),
      getWarehouses: () => Promise.resolve({ data: [] }),
      getRevenueChart: (params) => Promise.resolve({ data: { labels: [], values: [] } }),
      getCategoryChart: (params) => Promise.resolve({ data: [] }),
      exportReport: (params) => Promise.resolve()
    }

    onMounted(() => {
      fetchDashboardData()
    })

    return {
      loading,
      chartLoading,
      tableLoading,
      dashboardData,
      recentSales,
      topProducts,
      lowStockItems,
      warehouses,
      dateRange,
      selectedWarehouse,
      revenueChartType,
      revenueChartOption,
      categoryChartOption,
      formatNumber,
      formatTime,
      getTrendClass,
      disabledDate,
      handleDateChange,
      handleWarehouseChange,
      updateRevenueChart,
      refreshData,
      exportReport,
      handleReorder
    }
  }
}
</script>

<style scoped>
.dashboard {
  padding: 20px;
  background-color: #f5f7fa;
  min-height: calc(100vh - 60px);
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.dashboard-header h1 {
  margin: 0;
  color: #303133;
  font-weight: 600;
}

.header-actions {
  display: flex;
  gap: 10px;
}

.filters-section {
  margin-bottom: 20px;
}

.filter-card {
  border: 1px solid #e4e7ed;
}

.filter-controls {
  display: flex;
  gap: 20px;
  align-items: center;
  flex-wrap: wrap;
}

.filter-label {
  font-weight: 500;
  margin-right: 8px;
  color: #606266;
}

.kpi-section {
  margin-bottom: 20px;
}

.kpi-card {
  border-radius: 8px;
  border: none;
  transition: all 0.3s ease;
}

.kpi-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1) !important;
}

.kpi-content {
  display: flex;
  align-items: center;
  padding: 10px 0;
}

.kpi-icon {
  width: 60px;
  height: 60px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 15px;
  font-size: 24px;
}

.revenue-card .kpi-icon {
  background: #ecf5ff;
  color: #409eff;
}

.sales-card .kpi-icon {
  background: #f0f9eb;
  color: #67c23a;
}

.customers-card .kpi-icon {
  background: #fdf6ec;
  color: #e6a23c;
}

.inventory-card .kpi-icon {
  background: #fef0f0;
  color: #f56c6c;
}

.kpi-info {
  flex: 1;
}

.kpi-value {
  font-size: 24px;
  font-weight: 700;
  color: #303133;
  margin-bottom: 4px;
}

.kpi-label {
  font-size: 14px;
  color: #909399;
  margin-bottom: 6px;
}

.kpi-trend {
  font-size: 12px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 4px;
}

.kpi-trend.positive {
  color: #67c23a;
}

.kpi-trend.negative {
  color: #f56c6c;
}

.kpi-trend.neutral {
  color: #909399;
}

.kpi-trend.warning {
  color: #e6a23c;
}

.charts-section {
  margin-bottom: 20px;
}

.chart-card {
  border: 1px solid #e4e7ed;
  border-radius: 8px;
}

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.chart-container {
  position: relative;
}

.tables-section {
  margin-bottom: 20px;
}

.table-card {
  border: 1px solid #e4e7ed;
  border-radius: 8px;
}

.table-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.sale-info, .customer-info, .product-info {
  line-height: 1.4;
}

.sale-id {
  font-weight: 500;
  color: #303133;
}

.sale-time, .product-sku {
  font-size: 12px;
  color: #909399;
}

.sale-amount, .revenue-amount {
  font-weight: 600;
  color: #67c23a;
}

.alert-section {
  margin-bottom: 20px;
}

.low-stock-table {
  margin-top: 10px;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
}

/* Responsive design */
@media (max-width: 768px) {
  .dashboard {
    padding: 10px;
  }
  
  .dashboard-header {
    flex-direction: column;
    gap: 10px;
    align-items: flex-start;
  }
  
  .filter-controls {
    flex-direction: column;
    align-items: flex-start;
  }
  
  .kpi-content {
    padding: 15px 0;
  }
}
</style>
