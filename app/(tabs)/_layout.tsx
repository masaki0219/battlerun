import React, { useEffect } from 'react';
import { Alert, AppState, View, Text, TouchableOpacity, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useAuthStore } from '../../stores/authStore';
import {
  flushPendingActivities,
  hydrateRecordingSession,
  subscribePendingActivityDiscards,
  useRecordStore,
} from '../../stores/recordStore';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useLocation } from '../../hooks/useLocation';
import '../../lib/locationTask';
import { useStepCounter } from '../../hooks/useStepCounter';
import { useRunPresence } from '../../hooks/useRunPresence';
import { useBattleStore } from '../../stores/battleStore';
import { Colors, Shadow } from '../../design_tokens';

const KEEP_AWAKE_TAG = 'zelio-recording';

const PRIMARY = Colors.primary;
const ACCENT  = Colors.accent;
const INK3    = Colors.textTertiary;
const LINE    = Colors.border;

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const TAB_ITEMS: {
  name: string;
  label: string;
  icon: IconName;
  iconFocused?: IconName;
  primary?: boolean;
}[] = [
  { name: 'battle',  label: 'チャレンジ',   icon: 'trophy-outline',    iconFocused: 'trophy' },
  { name: 'record',  label: 'ラン',         icon: 'walk-outline',      primary: true },
  { name: 'stats',   label: '記録',         icon: 'bar-chart-outline', iconFocused: 'bar-chart' },
  { name: 'profile', label: 'プロフィール', icon: 'person-outline',    iconFocused: 'person' },
];

function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  // 文字を大きくしている端末ではラベルがタブ幅を超えて折り返し、バーからはみ出す。
  // iOS の標準タブバーと同じくアイコンだけの表示へ切り替える
  // （accessibilityLabel は残すので VoiceOver では従来どおり読み上げられる）。
  const { fontScale } = useWindowDimensions();
  const hideLabels = fontScale >= 1.3;

  return (
    <View style={[tb.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {state.routes.map((route, index) => {
        const item = TAB_ITEMS.find((t) => t.name === route.name);
        if (!item) return null;
        const focused = state.index === index;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        if (item.primary) {
          return (
            <View key={route.key} style={tb.centerWrap}>
              <TouchableOpacity
                style={[tb.centerBtn, !focused && tb.centerBtnInactive]}
                onPress={onPress}
                activeOpacity={0.8}
                accessibilityRole="tab"
                accessibilityLabel={item.label}
                accessibilityState={{ selected: focused }}
              >
                <Ionicons name="walk" size={24} color={focused ? Colors.textOnAccent : Colors.textSecondary} />
              </TouchableOpacity>
              {!hideLabels && (
                <Text
                  numberOfLines={1}
                  maxFontSizeMultiplier={1.3}
                  style={[tb.label, { color: focused ? Colors.accentDark : INK3, fontWeight: focused ? '700' : '500' }]}
                >
                  {item.label}
                </Text>
              )}
            </View>
          );
        }

        const color = focused ? PRIMARY : INK3;
        const iconName = focused ? (item.iconFocused ?? item.icon) : item.icon;

        return (
          <TouchableOpacity
            key={route.key}
            style={tb.tab}
            onPress={onPress}
            activeOpacity={0.7}
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: focused }}
          >
            <Ionicons name={iconName} size={22} color={color} />
            {!hideLabels && (
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={1.3}
                style={[tb.label, { color, fontWeight: focused ? '700' : '500' }]}
              >
                {item.label}
              </Text>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const tb = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: LINE,
    paddingTop: 10,
    alignItems: 'flex-start',
    justifyContent: 'space-around',
    ...Platform.select({
      ios: {
        shadowColor: Shadow.md.shadowColor,
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.05,
        shadowRadius: 14,
      },
      android: { elevation: 8 },
    }),
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  label: {
    fontSize: 10,
    letterSpacing: 0.4,
  },
  centerWrap: {
    flex: 1,
    alignItems: 'center',
    marginTop: -26,
    gap: 4,
  },
  // 浮いた主 CTA。背景色のリングでタブバーから切り抜かれたように見せる
  centerBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: ACCENT,
    borderWidth: 4,
    borderColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: Colors.accentDark,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.32,
        shadowRadius: 14,
      },
      android: { elevation: 10 },
    }),
  },
  centerBtnInactive: {
    backgroundColor: Colors.surfaceAlt,
    borderColor: Colors.background,
    shadowOpacity: 0.08,
  },
});

export default function TabLayout() {
  const { user, isLoading } = useAuthStore();
  const isRecording = useRecordStore((s) => s.isRecording);
  const isPaused = useRecordStore((s) => s.isPaused);
  const pauseKind = useRecordStore((s) => s.pauseKind);
  const measurementType = useRecordStore((s) => s.measurementType);
  const startedAt = useRecordStore((s) => s.startedAt);
  const publicBattles = useBattleStore((s) => s.publicBattles);
  const privateBattles = useBattleStore((s) => s.privateBattles);
  const myMemberships = useBattleStore((s) => s.myMemberships);
  const currentTime = Date.now();
  const membershipIds = new Set(myMemberships.map((membership) => membership.battleId));
  const primaryActiveBattleId = [...publicBattles, ...privateBattles].find((battle) => (
    membershipIds.has(battle.id)
    && battle.status === 'active'
    && new Date(battle.startAt).getTime() <= currentTime
    && currentTime <= new Date(battle.endAt).getTime()
  ))?.id;

  useRunPresence({
    battleId: primaryActiveBattleId,
    userId: user?.id,
    startedAt,
    isRecording,
    visible: user?.runningPresenceVisible === true,
  });

  useEffect(() => subscribePendingActivityDiscards((count) => {
    Alert.alert(
      '未送信の記録を確認しました',
      `サーバーの検証条件を満たさなかった記録${count}件を、再送対象から削除しました。`,
    );
  }), []);

  useEffect(() => {
    void hydrateRecordingSession();
    if (!user) return;

    const flush = () => {
      void flushPendingActivities().catch((error) => {
        console.warn('[TabLayout] pending activity flush failed:', error);
      });
    };
    flush();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') flush();
    });
    // 接続状態ライブラリに依存せず、アプリを開いたままの電波復帰も短時間で拾う。
    const retryTimer = setInterval(() => {
      if (AppState.currentState === 'active') flush();
    }, 30_000);
    return () => {
      clearInterval(retryTimer);
      subscription.remove();
    };
  }, [user?.id]);

  // 記録中は自動ロックを抑止する。
  // ※ これはバックグラウンド計測の代わりではない。「常に許可」があれば画面が消えても
  //    startLocationUpdatesAsync が継続する。ここで守るのは「使用中のみ許可」等で
  //    フォアグラウンド監視にフォールバックしている場合に、自動ロックで計測が途切れることだけ。
  useEffect(() => {
    if (!isRecording) return;
    void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    return () => { void deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {}); };
  }, [isRecording]);

  // 手動停止中だけ追跡を止める。自動停止中は再開速度を検知するためGPS更新を継続する。
  useLocation({ enabled: isRecording && (!isPaused || pauseKind === 'auto') });
  useStepCounter({ enabled: isRecording && !isPaused && measurementType === 'steps' });

  if (isLoading || !user) {
    return <View style={{ flex: 1, backgroundColor: Colors.background }} />;
  }

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => isRecording ? null : <CustomTabBar {...props} />}
    >
      <Tabs.Screen name="battle" />
      <Tabs.Screen name="record" />
      <Tabs.Screen name="stats" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
