import { View, Text } from "@tarojs/components";
import type { CompareResultItem, CurrencyCode } from "../../utils/types";
import { formatCurrency, formatPercent } from "../../utils/format";
import "./index.scss";

interface CompareRankingProps {
  items: CompareResultItem[];
  amount: number;
  currency?: CurrencyCode;
}

export default function CompareRanking({
  items,
  amount,
  currency = "CNY",
}: CompareRankingProps) {
  const ranked = [...items].sort(
    (a, b) => b.stats.returnPct - a.stats.returnPct,
  );
  const c = currency;

  return (
    <View className="compare-rank">
      <Text className="compare-rank__label">多资产对比</Text>
      <Text className="compare-rank__title">
        收益排名 · 各投 {formatCurrency(amount, c)}
      </Text>
      <View className="compare-rank__list">
        {ranked.map((item, i) => {
          const positive = item.stats.profit >= 0;
          const itemCurrency = item.currency || c;
          return (
            <View key={item.symbol} className="compare-rank__row">
              <View className={`compare-rank__pos pos-${Math.min(i, 3)}`}>
                <Text>{i + 1}</Text>
              </View>
              <View
                className="compare-rank__dot"
                style={{ backgroundColor: item.color }}
              />
              <View className="compare-rank__meta">
                <Text className="compare-rank__name">
                  {item.name} ({item.symbol})
                </Text>
                <Text className="compare-rank__sub">
                  当前 {formatCurrency(item.stats.currentValue, itemCurrency)} ·
                  回撤 {formatPercent(-item.stats.maxDrawdownPct)}
                </Text>
              </View>
              <View className="compare-rank__nums">
                <Text className={positive ? "up" : "down"}>
                  {formatPercent(item.stats.returnPct)}
                </Text>
                <Text className="compare-rank__profit">
                  {formatCurrency(item.stats.profit, itemCurrency)}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}
