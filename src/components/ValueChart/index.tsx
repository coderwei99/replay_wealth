import { Canvas, View, Text } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useId, useRef, useState } from "react";
import type { CurrencyCode, DailyValue } from "../../utils/types";
import { formatCurrency, formatPercent } from "../../utils/format";
import "./index.scss";

interface ValueChartProps {
  series: DailyValue[];
  /** 外部控制的整数进度（拖动滑块 / 跳转时同步） */
  index: number;
  playing?: boolean;
  speed?: number;
  invested?: number;
  height?: number;
  currency?: CurrencyCode;
  /** 进度变化（节流后的整数 index，供统计面板用） */
  onIndexChange?: (index: number) => void;
  /** 播放到结尾 */
  onFinished?: () => void;
}

interface ChartNode {
  width: number;
  height: number;
  getContext: (type: "2d") => CanvasRenderingContext2D;
  requestAnimationFrame?: (cb: (time: number) => void) => number;
  cancelAnimationFrame?: (id: number) => void;
}

interface Camera {
  i0: number;
  i1: number;
  yMin: number;
  yMax: number;
}

/** 可见时间窗（约 1 年交易日），对齐参考视频的推镜节奏 */
const WINDOW = 220;
/** 当前点在视口中的水平位置（0~1），右侧留白给未来 */
const CURSOR_RATIO = 0.62;
/** 镜头平滑跟随（越大越跟手，越小越丝滑） */
const CAMERA_FOLLOW = 0.14;
/** 每秒推进的点数（1x 速度）— 约 2 分钟播完 1000 个交易日 */
const BASE_PPS = 28;
/** 结束后缩放到全貌时长 */
const ZOOM_OUT_MS = 1100;
/** UI 状态刷新间隔 */
const UI_FPS_MS = 50;

const COLOR_UP = "#F43F5E"; // 盈利红（A 股习惯）
const COLOR_DOWN = "#10B981"; // 亏损绿

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3;
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return `rgba(244,63,94,${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function formatAxisValue(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 100_000_000) return `${(v / 100_000_000).toFixed(1)}亿`;
  if (abs >= 10_000) return `${(v / 10_000).toFixed(abs >= 100_000 ? 0 : 1)}万`;
  return `${Math.round(v)}`;
}

function formatDotValue(v: number, currency: CurrencyCode): string {
  return formatCurrency(v, currency, { compact: true });
}

/** 聚焦推镜镜头：当前点固定在视口约 62% 处，右侧是未来空白 */
function targetFocusCamera(
  series: DailyValue[],
  progress: number,
  invested?: number,
): Camera {
  const last = Math.max(0, series.length - 1);
  const p = clamp(progress, 0, last);

  const i0 = p - WINDOW * CURSOR_RATIO;
  const i1 = i0 + WINDOW;

  // 纵轴：只看已走过路径中、落在视口内的点
  const drawEnd = Math.min(last, Math.ceil(p));
  const visStart = Math.max(0, Math.floor(Math.max(0, i0)));
  const visEnd = drawEnd;

  let yMin = Infinity;
  let yMax = -Infinity;
  const from = Math.max(0, visStart);
  const to = Math.max(from, visEnd);
  for (let i = from; i <= to; i++) {
    const v = series[i].value;
    if (v < yMin) yMin = v;
    if (v > yMax) yMax = v;
  }
  if (!Number.isFinite(yMin)) {
    yMin = series[0]?.value ?? 0;
    yMax = yMin;
  }

  const cur = sampleValue(series, p);
  // 保证当前金额始终在舒适视区
  const span = Math.max(yMax - yMin, Math.abs(cur) * 0.04, Math.abs(invested ?? cur) * 0.04, 1);
  yMin = Math.min(yMin, cur - span * 0.35);
  yMax = Math.max(yMax, cur + span * 0.45);

  if (invested != null && invested > 0) {
    // 投入线在附近时纳入
    if (invested > yMin - span * 0.8 && invested < yMax + span * 0.8) {
      yMin = Math.min(yMin, invested);
      yMax = Math.max(yMax, invested);
    }
  }

  const pad = Math.max((yMax - yMin) * 0.12, 1);
  return { i0, i1, yMin: yMin - pad, yMax: yMax + pad };
}

function targetOverviewCamera(
  series: DailyValue[],
  invested?: number,
): Camera {
  if (!series.length) return { i0: 0, i1: 1, yMin: 0, yMax: 1 };
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const p of series) {
    if (p.value < yMin) yMin = p.value;
    if (p.value > yMax) yMax = p.value;
  }
  if (invested != null && invested > 0) {
    yMin = Math.min(yMin, invested);
    yMax = Math.max(yMax, invested);
  }
  const pad = Math.max((yMax - yMin) * 0.1, 1);
  return {
    i0: 0,
    i1: Math.max(1, series.length - 1),
    yMin: yMin - pad,
    yMax: yMax + pad,
  };
}

function sampleValue(series: DailyValue[], progress: number): number {
  if (!series.length) return 0;
  const last = series.length - 1;
  const p = clamp(progress, 0, last);
  const i0 = Math.floor(p);
  const i1 = Math.min(last, i0 + 1);
  if (i0 === i1) return series[i0].value;
  return lerp(series[i0].value, series[i1].value, p - i0);
}

function samplePoint(series: DailyValue[], progress: number): DailyValue {
  const last = Math.max(0, series.length - 1);
  const i = clamp(Math.round(progress), 0, last);
  return series[i];
}

function mixCamera(a: Camera, b: Camera, t: number): Camera {
  return {
    i0: lerp(a.i0, b.i0, t),
    i1: lerp(a.i1, b.i1, t),
    yMin: lerp(a.yMin, b.yMin, t),
    yMax: lerp(a.yMax, b.yMax, t),
  };
}

function followCamera(current: Camera, target: Camera, k: number): Camera {
  return {
    i0: lerp(current.i0, target.i0, k),
    i1: lerp(current.i1, target.i1, k),
    yMin: lerp(current.yMin, target.yMin, k),
    yMax: lerp(current.yMax, target.yMax, k),
  };
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  series: DailyValue[],
  progress: number,
  camera: Camera,
  invested: number | undefined,
  currency: CurrencyCode,
  phase: "play" | "zoom" | "overview",
) {
  ctx.clearRect(0, 0, width, height);
  if (!series.length) return;

  const padL = 48;
  const padR = 16;
  const padT = 14;
  const padB = 26;
  const w = Math.max(1, width - padL - padR);
  const h = Math.max(1, height - padT - padB);

  const i0 = camera.i0;
  const i1 = Math.max(camera.i1, i0 + 1e-3);
  const yMin = camera.yMin;
  const yMax = camera.yMax;
  const yRange = yMax - yMin || 1;

  const xAt = (idx: number) => padL + ((idx - i0) / (i1 - i0)) * w;
  const yAt = (v: number) => padT + (1 - (v - yMin) / yRange) * h;

  const lastIdx = series.length - 1;
  const p = clamp(progress, 0, lastIdx);
  const curVal = sampleValue(series, p);
  const curPoint = samplePoint(series, p);
  const positive = curVal >= (invested ?? curVal);
  const color = positive ? COLOR_UP : COLOR_DOWN;

  // 网格 + Y 轴刻度
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.lineWidth = 1;
  ctx.font = "10px sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.32)";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let g = 0; g <= 4; g++) {
    const t = g / 4;
    const y = padT + t * h;
    const val = yMax - t * yRange;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + w, y);
    ctx.stroke();
    ctx.fillText(formatAxisValue(val), padL - 6, y);
  }

  // 投入线
  if (invested != null && invested > 0 && invested >= yMin && invested <= yMax) {
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

  // 路径点（到 progress，最后一段插值）
  const endFloor = Math.floor(p);
  const pts: Array<{ x: number; y: number }> = [];
  const drawFrom = Math.max(0, Math.floor(i0) - 1);
  const drawTo = Math.min(endFloor, lastIdx);

  for (let i = drawFrom; i <= drawTo; i++) {
    if (i < 0) continue;
    pts.push({ x: xAt(i), y: yAt(series[i].value) });
  }
  // 小数进度：补一个插值端点
  if (p > endFloor && endFloor < lastIdx) {
    pts.push({ x: xAt(p), y: yAt(curVal) });
  } else if (pts.length === 0 && series[0]) {
    pts.push({ x: xAt(0), y: yAt(series[0].value) });
  }

  if (pts.length >= 1) {
    // 面积
    const grad = ctx.createLinearGradient(0, padT, 0, padT + h);
    grad.addColorStop(0, hexToRgba(color, 0.32));
    grad.addColorStop(1, hexToRgba(color, 0.02));

    ctx.beginPath();
    pts.forEach((pt, idx) => {
      if (idx === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    const lastPt = pts[pts.length - 1];
    const firstPt = pts[0];
    ctx.lineTo(lastPt.x, padT + h);
    ctx.lineTo(firstPt.x, padT + h);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // 折线
    ctx.beginPath();
    pts.forEach((pt, idx) => {
      if (idx === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();
  }

  // 当前点
  const cx = xAt(p);
  const cy = yAt(curVal);

  if (cx >= padL - 8 && cx <= padL + w + 8) {
    // 竖线
    if (phase !== "overview") {
      ctx.save();
      ctx.strokeStyle = hexToRgba(color, 0.25);
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(cx, padT);
      ctx.lineTo(cx, padT + h);
      ctx.stroke();
      ctx.restore();
    }

    // 光晕
    ctx.beginPath();
    ctx.arc(cx, cy, 11, 0, Math.PI * 2);
    ctx.fillStyle = hexToRgba(color, 0.2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, 7.5, 0, Math.PI * 2);
    ctx.strokeStyle = hexToRgba(color, 0.55);
    ctx.lineWidth = 2;
    ctx.stroke();

    // 金额标签（贴在点旁，参考视频核心）
    const label = formatDotValue(curVal, currency);
    ctx.font = "bold 12px sans-serif";
    const tw = ctx.measureText(label).width;
    let lx = cx + 14;
    let ly = cy - 8;
    if (lx + tw > width - 8) lx = cx - tw - 14;
    if (ly < padT + 12) ly = cy + 18;

    ctx.fillStyle = color;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(label, lx, ly);
  }

  // X 轴日期
  ctx.fillStyle = "rgba(255,255,255,0.34)";
  ctx.font = "10px sans-serif";
  ctx.textBaseline = "top";
  const leftI = clamp(Math.round(Math.max(0, i0)), 0, lastIdx);
  const rightI = clamp(Math.round(Math.min(lastIdx, i1)), 0, lastIdx);
  const midI = clamp(Math.round((leftI + rightI) / 2), 0, lastIdx);
  ctx.textAlign = "left";
  ctx.fillText(series[leftI]?.date ?? "", padL, padT + h + 8);
  ctx.textAlign = "center";
  if (midI !== leftI && midI !== rightI) {
    ctx.fillText(series[midI]?.date ?? "", padL + w / 2, padT + h + 8);
  }
  ctx.textAlign = "right";
  ctx.fillText(series[rightI]?.date ?? "", padL + w, padT + h + 8);

  return { color, curPoint, curVal, positive };
}

export default function ValueChart({
  series,
  index,
  playing = false,
  speed = 1,
  invested,
  height = 420,
  currency = "CNY",
  onIndexChange,
  onFinished,
}: ValueChartProps) {
  const canvasId = useId().replace(/:/g, "");
  const readyRef = useRef(false);
  const sizeRef = useRef({ width: 0, height: 0 });
  const canvasRef = useRef<ChartNode | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  // 动画内部状态（不走 React，保证流畅）
  const progressRef = useRef(0);
  const cameraRef = useRef<Camera | null>(null);
  const phaseRef = useRef<"play" | "zoom" | "overview">("play");
  const zoomStartRef = useRef(0);
  const zoomFromRef = useRef<Camera | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const lastUiPushRef = useRef(0);
  const lastEmittedIndexRef = useRef(-1);
  const finishedEmittedRef = useRef(false);
  const playingRef = useRef(playing);
  const speedRef = useRef(speed);
  const seriesRef = useRef(series);
  const investedRef = useRef(invested);
  const currencyRef = useRef(currency);
  const onIndexChangeRef = useRef(onIndexChange);
  const onFinishedRef = useRef(onFinished);

  const [ui, setUi] = useState(() => {
    const p = series[Math.min(index, Math.max(0, series.length - 1))];
    return {
      value: p?.value ?? 0,
      profit: p?.profit ?? 0,
      returnPct: p?.returnPct ?? 0,
      date: p?.date ?? "",
      phase: "play" as "play" | "zoom" | "overview",
      positive: (p?.profit ?? 0) >= 0,
    };
  });

  playingRef.current = playing;
  speedRef.current = speed;
  seriesRef.current = series;
  investedRef.current = invested;
  currencyRef.current = currency;
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
    const idx = clamp(Math.round(progress), 0, Math.max(0, seriesRef.current.length - 1));
    if (!force && idx === lastEmittedIndexRef.current) return;
    lastEmittedIndexRef.current = idx;
    onIndexChangeRef.current?.(idx);
  };

  const pushUi = (progress: number, phase: "play" | "zoom" | "overview", force = false) => {
    const now = Date.now();
    if (!force && now - lastUiPushRef.current < UI_FPS_MS) return;
    lastUiPushRef.current = now;
    const pt = samplePoint(seriesRef.current, progress);
    const inv = investedRef.current;
    const positive = pt.value >= (inv ?? pt.value);
    setUi({
      value: pt.value,
      profit: pt.profit,
      returnPct: pt.returnPct,
      date: pt.date,
      phase,
      positive,
    });
  };

  const renderOnce = () => {
    const ctx = ctxRef.current;
    const { width, height: h } = sizeRef.current;
    const s = seriesRef.current;
    if (!ctx || !width || !h || !s.length) return;

    const progress = progressRef.current;
    let camera = cameraRef.current;
    if (!camera) {
      camera = targetFocusCamera(s, progress, investedRef.current);
      cameraRef.current = camera;
    }

    drawFrame(
      ctx,
      width,
      h,
      s,
      progress,
      camera,
      investedRef.current,
      currencyRef.current,
      phaseRef.current,
    );
  };

  const tick = (ts: number) => {
    const canvas = canvasRef.current;
    const s = seriesRef.current;
    if (!s.length) return;

    const last = s.length - 1;
    const prevTs = lastTsRef.current ?? ts;
    const dt = clamp((ts - prevTs) / 1000, 0, 0.064); // 防切后台大跳
    lastTsRef.current = ts;

    if (phaseRef.current === "zoom") {
      const t = clamp((Date.now() - zoomStartRef.current) / ZOOM_OUT_MS, 0, 1);
      const eased = easeOutCubic(t);
      const from = zoomFromRef.current ?? targetFocusCamera(s, last, investedRef.current);
      const to = targetOverviewCamera(s, investedRef.current);
      cameraRef.current = mixCamera(from, to, eased);
      progressRef.current = last;
      renderOnce();
      pushUi(last, t < 1 ? "zoom" : "overview");

      if (t >= 1) {
        phaseRef.current = "overview";
        cameraRef.current = to;
        pushUi(last, "overview", true);
        // 全貌态仍可低频率保持（不需要持续 rAF）
        rafRef.current = null;
        return;
      }
    } else if (phaseRef.current === "play" && playingRef.current) {
      const pps = BASE_PPS * Math.max(0.25, speedRef.current);
      let next = progressRef.current + dt * pps;
      if (next >= last) {
        next = last;
        progressRef.current = next;
        // 进入缩放
        phaseRef.current = "zoom";
        zoomStartRef.current = Date.now();
        zoomFromRef.current =
          cameraRef.current ?? targetFocusCamera(s, next, investedRef.current);
        finishedEmittedRef.current = true;
        emitIndex(next, true);
        pushUi(next, "zoom", true);
        onFinishedRef.current?.();
      } else {
        progressRef.current = next;
        const target = targetFocusCamera(s, next, investedRef.current);
        cameraRef.current = cameraRef.current
          ? followCamera(cameraRef.current, target, CAMERA_FOLLOW)
          : target;
        emitIndex(next);
        pushUi(next, "play");
      }
      renderOnce();
    } else if (phaseRef.current === "play") {
      // 暂停：镜头靠拢目标后停止 rAF，避免空转
      const target = targetFocusCamera(s, progressRef.current, investedRef.current);
      const prev = cameraRef.current;
      cameraRef.current = prev ? followCamera(prev, target, 0.28) : target;
      renderOnce();

      if (prev) {
        const settled =
          Math.abs(cameraRef.current.i0 - target.i0) < 0.05 &&
          Math.abs(cameraRef.current.yMin - target.yMin) < 1 &&
          Math.abs(cameraRef.current.yMax - target.yMax) < 1;
        if (settled) {
          rafRef.current = null;
          return;
        }
      }
    } else {
      // overview 静态
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

  // 初始化 canvas
  useEffect(() => {
    const timer = setTimeout(() => {
      const query = Taro.createSelectorQuery();
      query
        .select(`#chart-${canvasId}`)
        .fields({ node: true, size: true })
        .exec((res) => {
          const info = res?.[0];
          if (!info?.node) return;
          const canvas = info.node as ChartNode;
          const width = info.width as number;
          const heightPx = info.height as number;
          const dpr = Taro.getSystemInfoSync().pixelRatio || 2;
          canvas.width = width * dpr;
          canvas.height = heightPx * dpr;
          const ctx = canvas.getContext("2d");
          ctx.scale(dpr, dpr);
          canvasRef.current = canvas;
          ctxRef.current = ctx;
          sizeRef.current = { width, height: heightPx };
          readyRef.current = true;

          progressRef.current = clamp(
            index,
            0,
            Math.max(0, series.length - 1),
          );
          phaseRef.current = "play";
          cameraRef.current = targetFocusCamera(
            series,
            progressRef.current,
            invested,
          );
          renderOnce();
          pushUi(progressRef.current, "play", true);
          if (playing) ensureLoop();
        });
    }, 40);
    return () => {
      clearTimeout(timer);
      stopRaf();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasId]);

  // 外部 index 同步（拖动 / 重置 / 跳转）— 播放中不抢控制权
  useEffect(() => {
    if (!readyRef.current || !series.length) return;
    if (playing) return;

    const last = series.length - 1;
    const next = clamp(index, 0, last);
    progressRef.current = next;
    finishedEmittedRef.current = next >= last;
    lastEmittedIndexRef.current = next;

    if (next >= last && series.length > 1) {
      // 跳到终点：直接全貌
      phaseRef.current = "overview";
      cameraRef.current = targetOverviewCamera(series, invested);
      renderOnce();
      pushUi(next, "overview", true);
      stopRaf();
    } else {
      phaseRef.current = "play";
      cameraRef.current = targetFocusCamera(series, next, invested);
      renderOnce();
      pushUi(next, "play", true);
      // 短时 rAF 做一次镜头 settling
      ensureLoop();
      setTimeout(() => {
        if (!playingRef.current && phaseRef.current === "play") {
          // 再画一帧后可停
          if (!playingRef.current) stopRaf();
        }
      }, 200);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, series]);

  // 播放开关 / 速度
  useEffect(() => {
    if (!readyRef.current) return;
    if (playing) {
      // 从终点重播时由父级把 index 置 0；此处若已在终点则重置
      const last = Math.max(0, seriesRef.current.length - 1);
      if (progressRef.current >= last) {
        progressRef.current = 0;
        phaseRef.current = "play";
        finishedEmittedRef.current = false;
        cameraRef.current = targetFocusCamera(
          seriesRef.current,
          0,
          investedRef.current,
        );
        emitIndex(0, true);
      } else if (phaseRef.current === "overview" || phaseRef.current === "zoom") {
        phaseRef.current = "play";
        finishedEmittedRef.current = false;
      }
      ensureLoop();
    }
    // 暂停时保留当前帧，循环会自然降频退出 play 分支
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, speed]);

  // series / invested 变化时重绑镜头
  useEffect(() => {
    if (!readyRef.current || !series.length) return;
    progressRef.current = clamp(progressRef.current, 0, series.length - 1);
    if (phaseRef.current === "overview") {
      cameraRef.current = targetOverviewCamera(series, invested);
    } else {
      cameraRef.current = targetFocusCamera(
        series,
        progressRef.current,
        invested,
      );
    }
    renderOnce();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, invested, currency]);

  const phaseLabel =
    ui.phase === "zoom"
      ? "缩放至全貌…"
      : ui.phase === "overview"
        ? "全区间收益曲线"
        : "持仓价值回放中";

  return (
    <View
      className={`value-chart ${
        ui.phase === "overview" ? "is-overview" : "is-focus"
      }`}
    >
      <View className="value-chart__header">
        <View className="value-chart__head-left">
          <Text className="value-chart__label">投资价值曲线</Text>
          <Text className="value-chart__sub">
            {phaseLabel}
            {ui.date ? ` · ${ui.date}` : ""}
          </Text>
        </View>
        <View className="value-chart__right">
          <Text
            className={`value-chart__pct ${ui.positive ? "up" : "down"}`}
          >
            {formatPercent(ui.returnPct)}
          </Text>
          <Text className={`value-chart__pnl ${ui.positive ? "up" : "down"}`}>
            {formatCurrency(ui.profit, currency)}
          </Text>
          <Text className="value-chart__value">
            {formatCurrency(ui.value, currency)}
          </Text>
        </View>
      </View>
      <Canvas
        type="2d"
        id={`chart-${canvasId}`}
        canvasId={`chart-${canvasId}`}
        className="value-chart__canvas"
        style={{ width: "100%", height: `${height}rpx` }}
      />
    </View>
  );
}
