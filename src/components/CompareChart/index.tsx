import { Canvas, View, Text } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useId, useRef, useState } from "react";
import type { CompareResultItem } from "../../utils/types";
import { formatCurrency, formatPercent } from "../../utils/format";
import "./index.scss";

interface CompareChartProps {
  items: CompareResultItem[];
  /** 外部控制的整数进度（拖动滑块 / 跳转时同步） */
  index: number;
  playing?: boolean;
  speed?: number;
  invested?: number;
  /**
   * 画布高度（rpx）。不传则由外层 flex 撑满剩余空间。
   */
  height?: number;
  onIndexChange?: (index: number) => void;
  onFinished?: () => void;
}

interface ChartNode {
  width: number;
  height: number;
  getContext: (type: "2d") => CanvasRenderingContext2D;
  requestAnimationFrame?: (cb: (time: number) => void) => number;
  cancelAnimationFrame?: (id: number) => void;
}

/** 每秒推进的点数（1x） */
const BASE_PPS = 28;
const UI_FPS_MS = 50;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function maxSeriesLen(items: CompareResultItem[]) {
  let n = 0;
  for (const item of items) n = Math.max(n, item.series.length);
  return n;
}

function sampleValue(
  series: CompareResultItem["series"],
  progress: number,
): number | null {
  if (!series.length) return null;
  const last = series.length - 1;
  const p = clamp(progress, 0, last);
  const i0 = Math.floor(p);
  const i1 = Math.min(last, i0 + 1);
  if (i0 === i1) return series[i0].value;
  const t = p - i0;
  return series[i0].value + (series[i1].value - series[i0].value) * t;
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  items: CompareResultItem[],
  progress: number,
  invested?: number,
) {
  ctx.clearRect(0, 0, width, height);
  if (!items.length) return;

  const padL = 48;
  const padR = 16;
  const padT = 14;
  const padB = 26;
  const w = Math.max(1, width - padL - padR);
  const h = Math.max(1, height - padT - padB);

  const maxLen = maxSeriesLen(items);
  const lastIdx = Math.max(0, maxLen - 1);
  const p = clamp(progress, 0, lastIdx);

  let minV = Infinity;
  let maxV = -Infinity;
  for (const item of items) {
    for (const pt of item.series) {
      if (pt.value < minV) minV = pt.value;
      if (pt.value > maxV) maxV = pt.value;
    }
  }
  if (invested != null && invested > 0) {
    minV = Math.min(minV, invested);
    maxV = Math.max(maxV, invested);
  }
  if (!Number.isFinite(minV)) {
    minV = 0;
    maxV = 1;
  }
  const span = maxV - minV || 1;
  minV -= span * 0.08;
  maxV += span * 0.08;
  const range = maxV - minV || 1;

  const xAt = (idx: number) =>
    padL + (lastIdx <= 0 ? w / 2 : (idx / lastIdx) * w);
  const yAt = (v: number) => padT + (1 - (v - minV) / range) * h;

  // 网格 + Y 轴
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.lineWidth = 1;
  ctx.font = "10px sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.32)";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let g = 0; g <= 4; g++) {
    const t = g / 4;
    const y = padT + t * h;
    const val = maxV - t * range;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + w, y);
    ctx.stroke();
    const abs = Math.abs(val);
    let label: string;
    if (abs >= 100_000_000) label = `${(val / 100_000_000).toFixed(1)}亿`;
    else if (abs >= 10_000)
      label = `${(val / 10_000).toFixed(abs >= 100_000 ? 0 : 1)}万`;
    else label = `${Math.round(val)}`;
    ctx.fillText(label, padL - 6, y);
  }

  // 投入线
  if (invested != null && invested > 0 && invested >= minV && invested <= maxV) {
    const y = yAt(invested);
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + w, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.textAlign = "left";
    ctx.font = "9px sans-serif";
    ctx.fillText("投入", padL + 4, y - 6);
    ctx.restore();
  }

  // 各资产曲线（画到 progress）
  for (const item of items) {
    const series = item.series;
    if (!series.length) continue;
    const endFloor = Math.min(Math.floor(p), series.length - 1);
    if (endFloor < 0) continue;

    ctx.beginPath();
    for (let i = 0; i <= endFloor; i++) {
      const x = xAt(i);
      const y = yAt(series[i].value);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    // 小数进度插值端点
    if (p > endFloor && endFloor < series.length - 1) {
      const v = sampleValue(series, p);
      if (v != null) ctx.lineTo(xAt(p), yAt(v));
    }
    ctx.strokeStyle = item.color;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();

    // 当前点
    const cur = sampleValue(series, Math.min(p, series.length - 1));
    if (cur != null) {
      const cx = xAt(Math.min(p, series.length - 1));
      const cy = yAt(cur);
      ctx.beginPath();
      ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = item.color;
      ctx.fill();
    }
  }

  // 进度竖线
  const cx = xAt(p);
  if (cx >= padL - 4 && cx <= padL + w + 4) {
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(cx, padT);
    ctx.lineTo(cx, padT + h);
    ctx.stroke();
    ctx.restore();
  }

  // X 轴日期（用最长序列）
  const longest =
    items.reduce(
      (a, b) => (a.series.length >= b.series.length ? a : b),
      items[0],
    )?.series ?? [];
  if (longest.length) {
    ctx.fillStyle = "rgba(255,255,255,0.34)";
    ctx.font = "10px sans-serif";
    ctx.textBaseline = "top";
    const leftI = 0;
    const rightI = Math.min(lastIdx, longest.length - 1);
    const midI = Math.round(rightI / 2);
    ctx.textAlign = "left";
    ctx.fillText(longest[leftI]?.date ?? "", padL, padT + h + 8);
    ctx.textAlign = "center";
    if (midI > leftI && midI < rightI) {
      ctx.fillText(longest[midI]?.date ?? "", padL + w / 2, padT + h + 8);
    }
    ctx.textAlign = "right";
    ctx.fillText(longest[rightI]?.date ?? "", padL + w, padT + h + 8);
  }
}

export default function CompareChart({
  items,
  index,
  playing = false,
  speed = 0.5,
  invested,
  height,
  onIndexChange,
  onFinished,
}: CompareChartProps) {
  const canvasId = useId().replace(/:/g, "");
  const fillMode = height == null;
  const readyRef = useRef(false);
  const sizeRef = useRef({ width: 0, height: 0 });
  const canvasRef = useRef<ChartNode | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  const progressRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const lastUiPushRef = useRef(0);
  const lastEmittedIndexRef = useRef(-1);

  const playingRef = useRef(playing);
  const speedRef = useRef(speed);
  const itemsRef = useRef(items);
  const investedRef = useRef(invested);
  const onIndexChangeRef = useRef(onIndexChange);
  const onFinishedRef = useRef(onFinished);

  const [uiDate, setUiDate] = useState(() => {
    const longest = items.reduce(
      (a, b) => (a.series.length >= b.series.length ? a : b),
      items[0],
    );
    return longest?.series[Math.min(index, Math.max(0, (longest?.series.length ?? 1) - 1))]?.date ?? "";
  });
  const [liveTips, setLiveTips] = useState(() =>
    items.map((item) => {
      const pt = item.series[Math.min(index, Math.max(0, item.series.length - 1))];
      return {
        symbol: item.symbol,
        color: item.color,
        value: pt?.value ?? 0,
        returnPct: pt?.returnPct ?? 0,
      };
    }),
  );

  playingRef.current = playing;
  speedRef.current = speed;
  itemsRef.current = items;
  investedRef.current = invested;
  onIndexChangeRef.current = onIndexChange;
  onFinishedRef.current = onFinished;

  const stopRaf = () => {
    const canvas = canvasRef.current;
    if (rafRef.current != null) {
      if (canvas?.cancelAnimationFrame) {
        canvas.cancelAnimationFrame(rafRef.current);
      } else if (typeof cancelAnimationFrame !== "undefined") {
        cancelAnimationFrame(rafRef.current);
      }
      rafRef.current = null;
    }
    lastTsRef.current = null;
  };

  const emitIndex = (progress: number, force = false) => {
    const last = Math.max(0, maxSeriesLen(itemsRef.current) - 1);
    const idx = clamp(Math.round(progress), 0, last);
    if (!force && idx === lastEmittedIndexRef.current) return;
    lastEmittedIndexRef.current = idx;
    onIndexChangeRef.current?.(idx);
  };

  const pushUi = (progress: number, force = false) => {
    const now = Date.now();
    if (!force && now - lastUiPushRef.current < UI_FPS_MS) return;
    lastUiPushRef.current = now;
    const list = itemsRef.current;
    const last = Math.max(0, maxSeriesLen(list) - 1);
    const idx = clamp(Math.round(progress), 0, last);
    const longest = list.reduce(
      (a, b) => (a.series.length >= b.series.length ? a : b),
      list[0],
    );
    setUiDate(
      longest?.series[Math.min(idx, Math.max(0, (longest?.series.length ?? 1) - 1))]
        ?.date ?? "",
    );
    setLiveTips(
      list.map((item) => {
        const i = Math.min(idx, Math.max(0, item.series.length - 1));
        const pt = item.series[i];
        return {
          symbol: item.symbol,
          color: item.color,
          value: pt?.value ?? 0,
          returnPct: pt?.returnPct ?? 0,
        };
      }),
    );
  };

  const renderOnce = () => {
    const ctx = ctxRef.current;
    const { width, height: h } = sizeRef.current;
    const list = itemsRef.current;
    if (!ctx || !width || !h || !list.length) return;
    drawFrame(ctx, width, h, list, progressRef.current, investedRef.current);
  };

  const tick = (ts: number) => {
    const canvas = canvasRef.current;
    const list = itemsRef.current;
    if (!list.length) return;

    const last = Math.max(0, maxSeriesLen(list) - 1);
    const prevTs = lastTsRef.current ?? ts;
    const dt = clamp((ts - prevTs) / 1000, 0, 0.064);
    lastTsRef.current = ts;

    if (playingRef.current) {
      const pps = BASE_PPS * Math.max(0.25, speedRef.current);
      let next = progressRef.current + dt * pps;
      if (next >= last) {
        next = last;
        progressRef.current = next;
        emitIndex(next, true);
        pushUi(next, true);
        renderOnce();
        onFinishedRef.current?.();
        rafRef.current = null;
        return;
      }
      progressRef.current = next;
      emitIndex(next);
      pushUi(next);
      renderOnce();
    } else {
      renderOnce();
      rafRef.current = null;
      return;
    }

    const schedule = canvas?.requestAnimationFrame ?? requestAnimationFrame;
    rafRef.current = schedule(tick);
  };

  const ensureLoop = () => {
    if (rafRef.current != null) return;
    if (!readyRef.current) return;
    lastTsRef.current = null;
    const canvas = canvasRef.current;
    const schedule = canvas?.requestAnimationFrame ?? requestAnimationFrame;
    rafRef.current = schedule(tick);
  };

  const bindCanvas = (retry = 0) => {
    const query = Taro.createSelectorQuery();
    query
      .select(`#cmp-${canvasId}`)
      .fields({ node: true, size: true })
      .exec((res) => {
        const info = res?.[0];
        if (!info?.node) {
          if (retry < 8) setTimeout(() => bindCanvas(retry + 1), 50);
          return;
        }
        const canvas = info.node as ChartNode;
        const width = info.width as number;
        const heightPx = info.height as number;
        if ((!width || !heightPx) && retry < 8) {
          setTimeout(() => bindCanvas(retry + 1), 50);
          return;
        }
        const dpr = Taro.getSystemInfoSync().pixelRatio || 2;
        canvas.width = Math.max(1, width) * dpr;
        canvas.height = Math.max(1, heightPx) * dpr;
        const ctx = canvas.getContext("2d");
        if (
          typeof (
            ctx as CanvasRenderingContext2D & { setTransform?: Function }
          ).setTransform === "function"
        ) {
          (
            ctx as CanvasRenderingContext2D & { setTransform: Function }
          ).setTransform(1, 0, 0, 1, 0, 0);
        }
        ctx.scale(dpr, dpr);
        canvasRef.current = canvas;
        ctxRef.current = ctx;
        sizeRef.current = {
          width: Math.max(1, width),
          height: Math.max(1, heightPx),
        };
        readyRef.current = true;

        const last = Math.max(0, maxSeriesLen(items) - 1);
        if (progressRef.current === 0 && index > 0) {
          progressRef.current = clamp(index, 0, last);
        }
        renderOnce();
        pushUi(progressRef.current, true);
        if (playingRef.current) ensureLoop();
      });
  };

  useEffect(() => {
    progressRef.current = clamp(
      index,
      0,
      Math.max(0, maxSeriesLen(items) - 1),
    );
    const timer = setTimeout(() => bindCanvas(0), fillMode ? 80 : 40);
    return () => {
      clearTimeout(timer);
      stopRaf();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasId, fillMode]);

  // 外部 index 同步（拖动 / 重置）— 播放中不抢控制权
  useEffect(() => {
    if (!readyRef.current || !items.length) return;
    if (playing) return;

    const last = Math.max(0, maxSeriesLen(items) - 1);
    const next = clamp(index, 0, last);
    progressRef.current = next;
    lastEmittedIndexRef.current = next;
    renderOnce();
    pushUi(next, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, items]);

  useEffect(() => {
    if (!readyRef.current) return;
    if (playing) {
      const last = Math.max(0, maxSeriesLen(itemsRef.current) - 1);
      if (progressRef.current >= last) {
        progressRef.current = 0;
        emitIndex(0, true);
      }
      ensureLoop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, speed]);

  useEffect(() => {
    if (!readyRef.current || !items.length) return;
    progressRef.current = clamp(
      progressRef.current,
      0,
      Math.max(0, maxSeriesLen(items) - 1),
    );
    renderOnce();
    pushUi(progressRef.current, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, invested]);

  return (
    <View
      className={`compare-chart${fillMode ? " compare-chart--fill" : ""}`}
    >
      <View className='compare-chart__header'>
        <View className='compare-chart__head-left'>
          <Text className='compare-chart__label'>资产价值对比</Text>
          <Text className='compare-chart__sub'>
            相同买入日期与投入金额
            {uiDate ? ` · ${uiDate}` : ""}
          </Text>
        </View>
      </View>
      <View
        className='compare-chart__canvas-wrap'
        style={fillMode ? undefined : { height: `${height ?? 420}rpx` }}
      >
        <Canvas
          type='2d'
          id={`cmp-${canvasId}`}
          canvasId={`cmp-${canvasId}`}
          className='compare-chart__canvas'
        />
      </View>
      <View className='compare-chart__legend'>
        {liveTips.map((tip) => {
          const positive = tip.returnPct >= 0;
          const item = items.find((i) => i.symbol === tip.symbol);
          const c = item?.currency ?? "CNY";
          return (
            <View key={tip.symbol} className='compare-chart__legend-item'>
              <View
                className='compare-chart__dot'
                style={{ backgroundColor: tip.color }}
              />
              <Text className='compare-chart__legend-name'>{tip.symbol}</Text>
              <Text
                className={`compare-chart__legend-pct ${positive ? "up" : "down"}`}
              >
                {formatPercent(tip.returnPct)}
              </Text>
              <Text className='compare-chart__legend-val'>
                {formatCurrency(tip.value, c, { compact: true })}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
