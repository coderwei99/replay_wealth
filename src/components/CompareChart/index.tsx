import { Canvas, View, Text } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useId, useRef } from "react";
import type { CompareResultItem } from "../../utils/types";
import "./index.scss";

interface CompareChartProps {
  items: CompareResultItem[];
  height?: number;
}

function draw(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  items: CompareResultItem[],
) {
  ctx.clearRect(0, 0, width, height);
  if (!items.length) return;

  const padL = 12;
  const padR = 12;
  const padT = 16;
  const padB = 20;
  const w = width - padL - padR;
  const h = height - padT - padB;

  let minV = Infinity;
  let maxV = -Infinity;
  let maxLen = 0;
  for (const item of items) {
    maxLen = Math.max(maxLen, item.series.length);
    for (const p of item.series) {
      minV = Math.min(minV, p.value);
      maxV = Math.max(maxV, p.value);
    }
  }
  if (!Number.isFinite(minV) || maxLen < 1) return;

  const span = maxV - minV || 1;
  minV -= span * 0.08;
  maxV += span * 0.08;
  const range = maxV - minV || 1;

  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  for (let g = 0; g <= 4; g++) {
    const y = padT + (g / 4) * h;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + w, y);
    ctx.stroke();
  }

  for (const item of items) {
    if (item.series.length < 1) continue;
    ctx.beginPath();
    item.series.forEach((p, i) => {
      const x =
        padL +
        (item.series.length === 1
          ? w / 2
          : (i / (item.series.length - 1)) * w);
      const y = padT + (1 - (p.value - minV) / range) * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = item.color;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

export default function CompareChart({
  items,
  height = 420,
}: CompareChartProps) {
  const canvasId = useId().replace(/:/g, "");
  const readyRef = useRef(false);
  const sizeRef = useRef({ width: 0, height: 0 });
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  const paint = () => {
    const ctx = ctxRef.current;
    const { width, height: h } = sizeRef.current;
    if (!ctx || !width || !h) return;
    draw(ctx, width, h, items);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      Taro.createSelectorQuery()
        .select(`#cmp-${canvasId}`)
        .fields({ node: true, size: true })
        .exec((res) => {
          const info = res?.[0];
          if (!info?.node) return;
          const canvas = info.node;
          const width = info.width as number;
          const heightPx = info.height as number;
          const dpr = Taro.getSystemInfoSync().pixelRatio || 2;
          canvas.width = width * dpr;
          canvas.height = heightPx * dpr;
          const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
          ctx.scale(dpr, dpr);
          ctxRef.current = ctx;
          sizeRef.current = { width, height: heightPx };
          readyRef.current = true;
          paint();
        });
    }, 50);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasId]);

  useEffect(() => {
    if (!readyRef.current) return;
    paint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  return (
    <View className='compare-chart'>
      <View className='compare-chart__header'>
        <Text className='compare-chart__label'>资产价值对比</Text>
        <Text className='compare-chart__sub'>
          相同买入日期与投入金额下的价值曲线
        </Text>
      </View>
      <Canvas
        type='2d'
        id={`cmp-${canvasId}`}
        canvasId={`cmp-${canvasId}`}
        className='compare-chart__canvas'
        style={{ width: "100%", height: `${height}rpx` }}
      />
      <View className='compare-chart__legend'>
        {items.map((item) => (
          <View key={item.symbol} className='compare-chart__legend-item'>
            <View
              className='compare-chart__dot'
              style={{ backgroundColor: item.color }}
            />
            <Text>{item.symbol}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
