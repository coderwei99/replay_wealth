import { View, Text, Slider } from "@tarojs/components";
import { formatDateCN } from "../../utils/format";
import "./index.scss";

interface PlaybackControlsProps {
  playing: boolean;
  index: number;
  total: number;
  currentDate?: string;
  speed: number;
  onPlayPause: () => void;
  onReset: () => void;
  onSeek: (index: number) => void;
  onSpeedChange: (speed: number) => void;
  onSkipStart: () => void;
  onSkipEnd: () => void;
}

const SPEEDS = [0.5, 1, 2, 4];

export default function PlaybackControls({
  playing,
  index,
  total,
  currentDate,
  speed,
  onPlayPause,
  onReset,
  onSeek,
  onSpeedChange,
  onSkipStart,
  onSkipEnd,
}: PlaybackControlsProps) {
  return (
    <View className='playback'>
      <View className='playback__top'>
        <View>
          <Text className='playback__label'>动画回放</Text>
          <Text className='playback__date'>
            {currentDate ? formatDateCN(currentDate) : "—"}
            <Text className='playback__count'>
              {" "}
              {total ? `${Math.min(index + 1, total)} / ${total}` : "0 / 0"}
            </Text>
          </Text>
        </View>
        <View className='playback__speeds'>
          {SPEEDS.map((s) => (
            <View
              key={s}
              className={`playback__speed ${speed === s ? "active" : ""}`}
              onClick={() => onSpeedChange(s)}
            >
              <Text>{s}x</Text>
            </View>
          ))}
        </View>
      </View>

      <Slider
        className='playback__slider'
        min={0}
        max={Math.max(0, total - 1)}
        step={1}
        value={Math.min(index, Math.max(0, total - 1))}
        activeColor='#22d3ee'
        backgroundColor='rgba(255,255,255,0.12)'
        blockSize={16}
        blockColor='#67e8f9'
        onChanging={(e) => onSeek(Number(e.detail.value))}
        onChange={(e) => onSeek(Number(e.detail.value))}
      />

      <View className='playback__btns'>
        <View className='playback__btn' onClick={onSkipStart}>
          <Text>|◀</Text>
        </View>
        <View className='playback__btn' onClick={onReset}>
          <Text>↻</Text>
        </View>
        <View className='playback__play' onClick={onPlayPause}>
          <Text>{playing ? "❚❚" : "▶"}</Text>
        </View>
        <View className='playback__btn' onClick={onSkipEnd}>
          <Text>▶|</Text>
        </View>
      </View>
    </View>
  );
}
