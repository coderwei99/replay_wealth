import { View, Text } from "@tarojs/components";
import type { CurrencyCode, InvestmentStats } from "../../utils/types";
import {
  formatCurrency,
  formatDateCN,
  formatNumber,
  formatPercent,
} from "../../utils/format";
import "./index.scss";

interface StatsPanelProps {
  stats: InvestmentStats;
  symbol: string;
  name: string;
  currency?: CurrencyCode;
}

function Card({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "up" | "down" | "accent";
}) {
  return (
    <View className={`stat-card tone-${tone}`}>
      <Text className='stat-card__label'>{label}</Text>
      <Text className='stat-card__value'>{value}</Text>
      {sub ? <Text className='stat-card__sub'>{sub}</Text> : null}
    </View>
  );
}

export default function StatsPanel({
  stats,
  symbol,
  name,
  currency = "CNY",
}: StatsPanelProps) {
  const positive = stats.profit >= 0;
  const c = currency;

  return (
    <View className='stats-panel'>
      <View className='stats-panel__top'>
        <View className='stats-panel__meta'>
          <Text className='stats-panel__label'>收益统计</Text>
          <Text className='stats-panel__title'>
            {name} ({symbol})
          </Text>
          {/* 日期与持有天数分行，固定高度，避免回放时换行导致整页抖动 */}
          <Text className='stats-panel__range'>
            {formatDateCN(stats.buyDate)}
            <Text className='stats-panel__range-sep'> → </Text>
            {formatDateCN(stats.endDate)}
          </Text>
        </View>
        <Text className='stats-panel__hold'>持有 {stats.daysHeld} 天</Text>

        <View className={`stats-panel__badge ${positive ? "up" : "down"}`}>
          <Text className='stats-panel__badge-text'>
            {formatPercent(stats.returnPct)}
          </Text>
        </View>
      </View>

      <View className='stats-panel__grid'>
        <Card label='投入金额' value={formatCurrency(stats.invested, c)} />
        <Card
          label='当前价值'
          value={formatCurrency(stats.currentValue, c)}
          tone='accent'
        />
        <Card
          label='累计收益'
          value={formatCurrency(stats.profit, c)}
          sub={formatPercent(stats.returnPct)}
          tone={positive ? "up" : "down"}
        />
        <Card
          label='收益率'
          value={formatPercent(stats.returnPct)}
          tone={positive ? "up" : "down"}
        />
        <Card
          label='最大回撤'
          value={formatPercent(-stats.maxDrawdownPct)}
          sub={`回撤 ${formatCurrency(stats.maxDrawdown, c)}`}
          tone='down'
        />
        <Card
          label='年化收益'
          value={
            stats.annualizedReturn == null
              ? "—"
              : formatPercent(stats.annualizedReturn)
          }
          sub={`买入价 ${formatCurrency(stats.buyPrice, c)} · 份额 ${formatNumber(stats.shares, 4)}`}
          tone={
            stats.annualizedReturn == null
              ? "neutral"
              : stats.annualizedReturn >= 0
                ? "up"
                : "down"
          }
        />
      </View>
    </View>
  );
}
