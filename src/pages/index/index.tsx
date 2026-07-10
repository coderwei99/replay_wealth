import { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  Input,
  Picker,
  ScrollView,
} from "@tarojs/components";
import Taro from "@tarojs/taro";
import {
  CATEGORY_LABELS,
  COMPARE_DEFAULT_SYMBOLS,
  getAssetMeta,
  getEnabledPresets,
} from "../../utils/assets";
import { computeReplay, statsAtIndex } from "../../utils/calc";
import { todayISO, yearsAgoISO } from "../../utils/format";
import { fetchHistory } from "../../utils/market";
import type {
  AssetCategory,
  AssetPreset,
  CompareResultItem,
  InvestmentStats,
  ReplayResult,
  ViewMode,
} from "../../utils/types";
import ValueChart from "../../components/ValueChart";
import StatsPanel from "../../components/StatsPanel";
import PlaybackControls from "../../components/PlaybackControls";
import CompareRanking from "../../components/CompareRanking";
import CompareChart from "../../components/CompareChart";
import "./index.scss";

export default function IndexPage() {
  const presets = useMemo(() => getEnabledPresets(), []);
  const [mode, setMode] = useState<"single" | "compare">("single");
  const [symbol, setSymbol] = useState(presets[0]?.symbol ?? "600519");
  const [customSymbol, setCustomSymbol] = useState("");
  const [buyDate, setBuyDate] = useState(yearsAgoISO(3));
  const [endDate, setEndDate] = useState(todayISO());
  const [amount, setAmount] = useState("100000");
  const [compareSymbols, setCompareSymbols] = useState<string[]>(
    COMPARE_DEFAULT_SYMBOLS,
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("idle");
  const [replay, setReplay] = useState<ReplayResult | null>(null);
  const [compareItems, setCompareItems] = useState<CompareResultItem[]>([]);
  const [invested, setInvested] = useState(100000);

  const [playing, setPlaying] = useState(false);
  const [playIndex, setPlayIndex] = useState(0);
  const [speed, setSpeed] = useState(0.5);

  const categories = useMemo(() => {
    const map = new Map<AssetCategory, AssetPreset[]>();
    for (const a of presets) {
      const list = map.get(a.category) ?? [];
      list.push(a);
      map.set(a.category, list);
    }
    return Array.from(map.entries());
  }, [presets]);

  const seriesLength = replay?.series.length ?? 0;

  const compareSeriesLength = useMemo(() => {
    let max = 0;
    for (const item of compareItems) {
      max = Math.max(max, item.series.length);
    }
    return max;
  }, [compareItems]);

  const compareCurrentDate = useMemo(() => {
    if (!compareItems.length) return undefined;
    const longest = compareItems.reduce((a, b) =>
      a.series.length >= b.series.length ? a : b,
    );
    const i = Math.min(
      playIndex,
      Math.max(0, longest.series.length - 1),
    );
    return longest.series[i]?.date;
  }, [compareItems, playIndex]);

  const liveStats: InvestmentStats | null = useMemo(() => {
    if (!replay) return null;
    return (
      statsAtIndex(
        replay.series,
        replay.stats.invested,
        replay.stats.buyPrice,
        replay.stats.shares,
        playIndex,
      ) ?? replay.stats
    );
  }, [replay, playIndex]);

  /** 多资产：排名随回放进度刷新 */
  const liveCompareItems = useMemo(() => {
    if (!compareItems.length) return [];
    return compareItems.map((item) => {
      const stats =
        statsAtIndex(
          item.series,
          invested,
          item.stats.buyPrice,
          item.stats.shares,
          playIndex,
        ) ?? item.stats;
      return { ...item, stats };
    });
  }, [compareItems, invested, playIndex]);

  const stopPlayback = useCallback(() => {
    setPlaying(false);
  }, []);

  const handleChartIndex = useCallback((i: number) => {
    setPlayIndex(i);
  }, []);

  const handleChartFinished = useCallback(() => {
    setPlaying(false);
  }, []);

  const toggleCompare = (sym: string) => {
    setCompareSymbols((prev) =>
      prev.includes(sym) ? prev.filter((s) => s !== sym) : [...prev, sym],
    );
  };

  const showingResult =
    (viewMode === "single" && !!replay) ||
    (viewMode === "compare" && compareItems.length > 0);

  const handleBackToForm = useCallback(() => {
    stopPlayback();
    setViewMode("idle");
    setReplay(null);
    setCompareItems([]);
    setPlayIndex(0);
    setError(null);
  }, [stopPlayback]);

  const handleSubmit = async () => {
    setError(null);
    const amountNum = Number(amount);
    const finalSymbol =
      symbol === "__custom__" ? customSymbol.trim() : symbol;

    if (mode === "single" && !finalSymbol) {
      setError("请选择或输入 A 股代码");
      return;
    }
    if (mode === "compare" && compareSymbols.length < 2) {
      setError("对比模式请至少选择 2 个资产");
      return;
    }
    if (!buyDate || !endDate) {
      setError("请填写买入日期和截止日期");
      return;
    }
    if (buyDate > endDate) {
      setError("买入日期不能晚于截止日期");
      return;
    }
    if (!amountNum || amountNum <= 0) {
      setError("投入金额必须大于 0");
      return;
    }

    setLoading(true);
    stopPlayback();
    setInvested(amountNum);

    try {
      if (mode === "compare") {
        const results: CompareResultItem[] = [];
        for (const sym of compareSymbols) {
          const history = await fetchHistory(sym, buyDate, endDate, {
            market: "CN",
          });
          const meta = getAssetMeta(sym, "CN");
          const result = computeReplay(
            history.prices,
            amountNum,
            buyDate,
            endDate,
            history.symbol,
            history.name || meta.name,
            history.market,
            history.currency,
          );
          if (!result) {
            throw new Error(
              `${sym} 在所选日期区间内没有可用价格数据，请调整买入日期`,
            );
          }
          results.push({
            symbol: result.symbol,
            name: result.name,
            market: result.market,
            currency: result.currency,
            stats: result.stats,
            series: result.series,
            color: meta.color,
          });
        }
        setCompareItems(results);
        setReplay(null);
        setPlayIndex(0);
        setViewMode("compare");
        setTimeout(() => setPlaying(true), 300);
      } else {
        const history = await fetchHistory(finalSymbol, buyDate, endDate, {
          market: "CN",
        });
        const meta = getAssetMeta(finalSymbol, "CN");
        const result = computeReplay(
          history.prices,
          amountNum,
          buyDate,
          endDate,
          history.symbol,
          history.name || meta.name,
          history.market,
          history.currency,
        );
        if (!result) {
          throw new Error(
            "所选日期区间内没有可用价格数据，请调整买入日期或代码",
          );
        }
        setReplay(result);
        setCompareItems([]);
        setPlayIndex(0);
        setViewMode("single");
        setTimeout(() => setPlaying(true), 300);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "请求失败";
      setError(msg);
      setViewMode("idle");
      setReplay(null);
      setCompareItems([]);
      Taro.showToast({ title: "加载失败", icon: "none" });
    } finally {
      setLoading(false);
    }
  };

  // 结果态：隐藏选择区，仅渲染结果，避免整页滚动
  if (showingResult) {
    return (
      <View className='page page--result'>
        <View className='page__inner page__inner--result'>
          <View className='result-bar'>
            <View className='result-bar__left' onClick={handleBackToForm}>
              <Text className='result-bar__back'>← 返回修改</Text>
            </View>
            <Text className='result-bar__title'>
              {viewMode === "compare" ? "多资产对比" : "收益回放"}
            </Text>
            <View className='result-bar__right' />
          </View>

          {viewMode === "single" && replay && liveStats && (
            <View className='result result--fill'>
              <StatsPanel
                stats={liveStats}
                symbol={replay.symbol}
                name={replay.name}
                currency={replay.currency}
              />
              <ValueChart
                series={replay.series}
                index={playIndex}
                playing={playing}
                speed={speed}
                invested={invested}
                currency={replay.currency}
                onIndexChange={handleChartIndex}
                onFinished={handleChartFinished}
              />
              <PlaybackControls
                playing={playing}
                index={playIndex}
                total={seriesLength}
                currentDate={replay.series[playIndex]?.date}
                speed={speed}
                onPlayPause={() => {
                  if (playing) stopPlayback();
                  else {
                    if (playIndex >= seriesLength - 1) setPlayIndex(0);
                    setPlaying(true);
                  }
                }}
                onReset={() => {
                  stopPlayback();
                  setPlayIndex(0);
                }}
                onSeek={(i) => {
                  stopPlayback();
                  setPlayIndex(i);
                }}
                onSpeedChange={setSpeed}
                onSkipStart={() => {
                  stopPlayback();
                  setPlayIndex(0);
                }}
                onSkipEnd={() => {
                  stopPlayback();
                  setPlayIndex(Math.max(0, seriesLength - 1));
                }}
              />
            </View>
          )}

          {viewMode === "compare" && compareItems.length > 0 && (
            <View className='result result--fill result--compare'>
              <CompareRanking
                items={liveCompareItems}
                amount={invested}
                currency='CNY'
              />
              <CompareChart
                items={compareItems}
                index={playIndex}
                playing={playing}
                speed={speed}
                invested={invested}
                onIndexChange={handleChartIndex}
                onFinished={handleChartFinished}
              />
              <PlaybackControls
                playing={playing}
                index={playIndex}
                total={compareSeriesLength}
                currentDate={compareCurrentDate}
                speed={speed}
                onPlayPause={() => {
                  if (playing) stopPlayback();
                  else {
                    if (playIndex >= compareSeriesLength - 1) setPlayIndex(0);
                    setPlaying(true);
                  }
                }}
                onReset={() => {
                  stopPlayback();
                  setPlayIndex(0);
                }}
                onSeek={(i) => {
                  stopPlayback();
                  setPlayIndex(i);
                }}
                onSpeedChange={setSpeed}
                onSkipStart={() => {
                  stopPlayback();
                  setPlayIndex(0);
                }}
                onSkipEnd={() => {
                  stopPlayback();
                  setPlayIndex(Math.max(0, compareSeriesLength - 1));
                }}
              />
            </View>
          )}
        </View>
      </View>
    );
  }

  return (
    <ScrollView scrollY className='page' enhanced showScrollbar={false}>
      <View className='page__inner'>
        {/* <View className='hero'>
          <Text className='hero__badge'>如果当时买入了……</Text>
          <Text className='hero__title'>Replay Wealth</Text>
          <Text className='hero__desc'>
            A 股投资收益回放 · 可视化一笔持仓的故事
          </Text>
        </View> */}

        {!loading && (
          <View className='empty card hero'>
            <Text className='empty__title'>把一笔 A 股投资，做成可回放的故事</Text>
            <Text className='empty__desc'>
              选择股票或 ETF、买入日期和金额，用真实日线还原收益曲线，支持动画回放、最大回撤与年化收益，以及多标的同场对比。
            </Text>
            <View className='empty__list'>
              <Text>01 收益曲线：持仓价值随时间变化</Text>
              <Text>02 收益统计：收益 / 回撤 / 年化</Text>
              <Text>03 动画回放：曲线与数字同步推进</Text>
              <Text>04 多资产对比：同场排名（均为 A 股）</Text>
            </View>
          </View>
        )}

        <View className='card form'>
          <View className='form__head'>
            <View>
              <Text className='form__title'>投资回放参数</Text>
              <Text className='form__sub'>选择 A 股 / ETF、日期与金额</Text>
            </View>
            <View className='form__tabs'>
              <View
                className={`form__tab ${mode === "single" ? "active" : ""}`}
                onClick={() => setMode("single")}
              >
                <Text>单资产</Text>
              </View>
              <View
                className={`form__tab ${mode === "compare" ? "active" : ""}`}
                onClick={() => setMode("compare")}
              >
                <Text>多资产对比</Text>
              </View>
            </View>
          </View>

          {mode === "single" ? (
            <View className='form__section'>
              <Text className='form__label'>投资标的（A股）</Text>
              {categories.map(([cat, assets]) => (
                <View key={cat} className='form__cat'>
                  <Text className='form__cat-label'>
                    {CATEGORY_LABELS[cat] ?? cat}
                  </Text>
                  <View className='form__chips'>
                    {assets.map((a) => (
                      <View
                        key={a.symbol}
                        className={`chip ${symbol === a.symbol ? "active" : ""}`}
                        onClick={() => setSymbol(a.symbol)}
                      >
                        <Text>
                          {a.name}
                          <Text className='chip__code'> {a.symbol}</Text>
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              ))}
              <View className='form__chips'>
                <View
                  className={`chip ${symbol === "__custom__" ? "active" : ""}`}
                  onClick={() => setSymbol("__custom__")}
                >
                  <Text>自定义代码</Text>
                </View>
              </View>
              {symbol === "__custom__" && (
                <Input
                  className='form__input'
                  value={customSymbol}
                  placeholder='6 位代码，如 600519 / 000001 / 300750'
                  placeholderClass='form__placeholder'
                  onInput={(e) => setCustomSymbol(e.detail.value)}
                />
              )}
            </View>
          ) : (
            <View className='form__section'>
              <Text className='form__label'>选择对比资产</Text>
              <View className='form__chips'>
                {presets.map((a) => (
                  <View
                    key={a.symbol}
                    className={`chip ${compareSymbols.includes(a.symbol) ? "active" : ""}`}
                    onClick={() => toggleCompare(a.symbol)}
                  >
                    <Text>
                      {a.name}
                      <Text className='chip__code'> {a.symbol}</Text>
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          <View className='form__row'>
            <View className='form__field'>
              <Text className='form__label'>买入日期</Text>
              <Picker
                mode='date'
                value={buyDate}
                end={endDate}
                onChange={(e) => setBuyDate(e.detail.value)}
              >
                <View className='form__picker'>{buyDate}</View>
              </Picker>
            </View>
            <View className='form__field'>
              <Text className='form__label'>截止日期</Text>
              <Picker
                mode='date'
                value={endDate}
                start={buyDate}
                end={todayISO()}
                onChange={(e) => setEndDate(e.detail.value)}
              >
                <View className='form__picker'>{endDate}</View>
              </Picker>
            </View>
          </View>

          <View className='form__section'>
            <Text className='form__label'>投入金额 (CNY)</Text>
            <Input
              className='form__input'
              type='digit'
              value={amount}
              onInput={(e) => setAmount(e.detail.value)}
            />
            <View className='form__chips'>
              {[10000, 50000, 100000, 500000].map((v) => (
                <View
                  key={v}
                  className={`chip ${amount === String(v) ? "active-green" : ""}`}
                  onClick={() => setAmount(String(v))}
                >
                  <Text>¥{v.toLocaleString()}</Text>
                </View>
              ))}
            </View>
          </View>

          {error && (
            <View className='form__error'>
              <Text>{error}</Text>
            </View>
          )}

          <View
            className={`form__submit ${loading ? "disabled" : ""}`}
            onClick={() => {
              if (!loading) handleSubmit();
            }}
          >
            <Text>{loading ? "正在加载历史数据…" : "开始收益回放"}</Text>
          </View>
        </View>

        {loading && (
          <View className='loading-box'>
            <Text>正在拉取 A 股历史价格并计算收益…</Text>
          </View>
        )}

        <View className='footer'>
          <Text>v1 仅支持 A 股 · 数据来源腾讯 / 东财 · 仅供研究娱乐</Text>
          <Text>架构已预留美股 / 加密货币扩展 · 不构成投资建议</Text>
        </View>
      </View>
    </ScrollView>
  );
}
