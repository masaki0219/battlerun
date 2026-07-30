import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Dimensions, StatusBar, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Colors, DarkColors, Typography, Spacing, BorderRadius, Shadow } from '../design_tokens';

export const ONBOARDING_KEY = '@battlerun_onboarding_seen';

const { width: W } = Dimensions.get('window');

const TEAM_BLUE   = Colors.teamPalette[0];
const TEAM_YELLOW = Colors.teamPalette[2];
const TEAM_RED    = Colors.teamPalette[1];
const TEAM_PURPLE = Colors.teamPalette[3];
const GOLD   = Colors.rank1;
const SILVER = Colors.rank2;
const BRONZE = Colors.rank3;
const INK_DARK = Colors.textPrimary;

const STEP_COLORS: Record<number, string> = {
  1: Colors.primary,
  2: Colors.primary,
  3: Colors.accent,
  4: Colors.primary,
};

const STEP_LABELS: Record<number, string> = {
  1: 'STEP 01 / ZELIO とは',
  2: 'STEP 02 / 記録のしかた',
  3: 'STEP 03 / チャレンジ参加',
  4: 'STEP 04 / さっそく始める',
};

const STEP_HEADINGS: Record<number, string> = {
  1: '歩くと、\nチームが強くなる。',
  2: '走るだけで、\nあとは自動。',
  3: 'あと少しで\n逆転できる。',
  4: 'ZELIOを\n始めよう。',
};

const STEP_BODIES: Record<number, string> = {
  1: 'あなたの走った距離が、そのままチームの得点になる。友達と競い合いながら、もっと走れる。',
  2: 'アプリを開いてボタンを押すだけ。GPSでルート記録か、歩数モードか選べる。',
  3: '順位はリアルタイムで動く。あなたの一走りが、チームの順位を変える。',
  4: 'アカウントを作成して、最初のランや仲間とのチャレンジを始めよう。',
};

export default function OnboardingScreen() {
  const [step, setStep] = useState(1);

  async function done(path: '/auth/login' | '/auth/signup') {
    await AsyncStorage.setItem(ONBOARDING_KEY, '1');
    router.replace(path);
  }

  function next() {
    if (step < 4) setStep(step + 1);
  }

  const labelColor = STEP_COLORS[step];

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" />

      {/* ── Top bar ─────────────────────────────────────── */}
      <View style={styles.topBar}>
        <View style={styles.dots}>
          {[1, 2, 3, 4].map((i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === step
                  ? [styles.dotActive, { backgroundColor: labelColor }]
                  : styles.dotInactive,
              ]}
            />
          ))}
        </View>
        {step < 4 && (
          <TouchableOpacity onPress={() => done('/auth/signup')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.skip}>スキップ</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Illustration ────────────────────────────────── */}
      <View style={styles.illustBox}>
        {step === 1 && <OB1 />}
        {step === 2 && <OB2 />}
        {step === 3 && <OB3 />}
        {step === 4 && <OB4 />}
      </View>

      {/* ── Text block ──────────────────────────────────── */}
      <View style={styles.textBlock}>
        <Text style={[styles.stepLabel, { color: labelColor }]}>{STEP_LABELS[step]}</Text>
        <Text style={styles.heading}>{STEP_HEADINGS[step]}</Text>
        <Text style={styles.body}>{STEP_BODIES[step]}</Text>
      </View>

      {/* ── CTA ─────────────────────────────────────────── */}
      <View style={styles.cta}>
        {step < 4 ? (
          <TouchableOpacity style={styles.btnNext} onPress={next} activeOpacity={0.85}>
            <Text style={styles.btnNextText}>次へ</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.finalCta}>
            <TouchableOpacity style={styles.btnPrimary} onPress={() => done('/auth/signup')} activeOpacity={0.85}>
              <Text style={styles.btnPrimaryText}>はじめる（新規登録）</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnOutline} onPress={() => done('/auth/login')} activeOpacity={0.85}>
              <Text style={styles.btnOutlineText}>アカウントをお持ちの方はログイン</Text>
            </TouchableOpacity>
            <Text style={styles.footnote}>登録後すぐにランを記録できます</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

// ═══════════════════════════════════════════════════════════════
// ILLUSTRATIONS
// ═══════════════════════════════════════════════════════════════

// ── Step 1: Scoreboard ─────────────────────────────────────────
function OB1() {
  return (
    <View style={ob1.card}>
      <View style={ob1.header}>
        <Text style={ob1.headerLabel}>SCOREBOARD</Text>
        <View style={ob1.live}>
          <View style={ob1.liveDot} />
          <Text style={ob1.liveText}>LIVE</Text>
        </View>
      </View>
      {[
        { r: 1, n: '朝ラン部',   km: '46.8', c: TEAM_BLUE },
        { r: 2, n: '駅前ラン会', km: '44.4', c: TEAM_YELLOW },
        { r: 3, n: '晴れ晴れ部', km: '42.6', c: TEAM_RED, us: true },
      ].map((t) => (
        <View key={t.r} style={ob1.row}>
          <Text style={[ob1.rank, { color: t.r === 1 ? GOLD : t.r === 2 ? SILVER : BRONZE }]}>
            {t.r}
          </Text>
          <View style={[ob1.stripe, { backgroundColor: t.c }]} />
          <Text style={[ob1.name, t.us && ob1.nameUs]} numberOfLines={1}>
            {t.n}
            {t.us && <Text style={[ob1.ours, { color: t.c }]}> OURS</Text>}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
            <Text style={ob1.km}>{t.km}</Text>
            <Text style={ob1.kmUnit}>KM</Text>
          </View>
        </View>
      ))}
      <View style={ob1.hint}>
        <Ionicons name="arrow-up" size={11} color={DarkColors.primary} />
        <Text style={ob1.hintText}> あと 1.8km で 2位逆転</Text>
      </View>
    </View>
  );
}

const ob1 = StyleSheet.create({
  card: {
    width: W * 0.76,
    backgroundColor: DarkColors.surfaceAlt,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: DarkColors.lineStrong,
    ...Shadow.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  headerLabel: {
    fontFamily: Typography.fontFamily.mono,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2.5,
    color: DarkColors.primary,
    textTransform: 'uppercase',
  },
  live: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  liveDot: { width: 5, height: 5, borderRadius: 99, backgroundColor: DarkColors.primary },
  liveText: {
    fontFamily: Typography.fontFamily.mono,
    fontSize: 8,
    color: DarkColors.textTertiary,
    letterSpacing: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: DarkColors.line,
    gap: 8,
  },
  rank: {
    width: 18,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  stripe: { width: 3, height: 14, borderRadius: 1.5 },
  name: { flex: 1, fontSize: 11.5, fontWeight: '600', color: DarkColors.textPrimary },
  nameUs: { fontWeight: '800' },
  ours: { fontSize: 8, letterSpacing: 1 },
  km: { fontSize: 16, fontWeight: '700', color: DarkColors.textPrimary, letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
  kmUnit: { fontSize: 9, color: DarkColors.textTertiary, marginLeft: 1 },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${DarkColors.primary}1c`,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginTop: 10,
  },
  hintText: { fontSize: 10, color: DarkColors.primary, fontWeight: '700' },
});

// ── Step 2: START button ───────────────────────────────────────
function OB2() {
  return (
    <View style={ob2.wrap}>
      <View style={ob2.startOuter}>
        <View style={ob2.startBtn}>
          <Text style={ob2.startText}>START</Text>
        </View>
      </View>
      <View style={ob2.toggle}>
        <View style={ob2.toggleActive}>
          <Ionicons name="navigate-outline" size={14} color={INK_DARK} />
          <Text style={ob2.toggleActiveText}>GPSモード</Text>
        </View>
        <View style={ob2.toggleInactive}>
          <Ionicons name="footsteps-outline" size={14} color={Colors.textTertiary} />
          <Text style={ob2.toggleInactiveText}>歩数</Text>
        </View>
      </View>
      <View style={ob2.contrib}>
        <Text style={ob2.contribKm}>3.2 KM</Text>
        <Ionicons name="chevron-forward" size={13} color={Colors.textTertiary} />
        <View style={ob2.badge}>
          <Text style={ob2.badgeText}>チームへ加算</Text>
        </View>
      </View>
    </View>
  );
}

const ob2 = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 16 },
  startOuter: {
    width: 156,
    height: 156,
    borderRadius: 99,
    borderWidth: 2,
    borderColor: `${Colors.accent}55`,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  startBtn: {
    width: 136,
    height: 136,
    borderRadius: 99,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.lg,
  },
  startText: {
    fontSize: 36,
    fontWeight: '800',
    color: Colors.textOnPrimary,
    letterSpacing: 2,
  },
  toggle: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceGray,
    borderRadius: 99,
    padding: 4,
    gap: 4,
  },
  toggleActive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.surface,
    borderRadius: 99,
    paddingHorizontal: 14,
    paddingVertical: 8,
    ...Shadow.sm,
  },
  toggleActiveText: { fontSize: 11, fontWeight: '800', color: INK_DARK },
  toggleInactive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  toggleInactiveText: { fontSize: 11, fontWeight: '700', color: Colors.textTertiary },
  contrib: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  contribKm: { fontSize: 22, fontWeight: '800', color: INK_DARK, letterSpacing: -0.5 },
  badge: {
    backgroundColor: `${Colors.primary}22`,
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: { fontSize: 11, fontWeight: '800', color: Colors.primaryDark },
});

// ── Step 3: Next Move card ─────────────────────────────────────
function OB3() {
  return (
    <View style={ob3.card}>
      <Text style={ob3.label}>NEXT MOVE</Text>
      <View style={ob3.numRow}>
        <Text style={ob3.pre}>あと</Text>
        <Text style={ob3.bigNum}>1.8</Text>
        <Text style={ob3.unit}>KM</Text>
      </View>
      <Text style={ob3.sub}>
        走れば <Text style={{ color: Colors.primary }}>2位</Text> に逆転
      </Text>
      <View style={ob3.livePill}>
        <View style={ob3.liveIndicator} />
        <Text style={ob3.liveText}>LIVE 順位が動く</Text>
      </View>
    </View>
  );
}

const ob3 = StyleSheet.create({
  card: {
    width: W * 0.76,
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 24,
    borderWidth: 1.5,
    borderColor: `${Colors.accent}44`,
    alignItems: 'center',
    ...Shadow.lg,
  },
  label: {
    fontFamily: Typography.fontFamily.mono,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2.5,
    color: Colors.accent,
    textTransform: 'uppercase',
  },
  numRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 14, gap: 4 },
  pre: { fontSize: 14, fontWeight: '700', color: Colors.textSecondary },
  bigNum: { fontSize: 80, fontWeight: '800', color: Colors.primary, letterSpacing: -2, lineHeight: 88 },
  unit: { fontSize: 24, fontWeight: '700', color: Colors.textSecondary, letterSpacing: 1 },
  sub: { fontSize: 14, fontWeight: '700', color: INK_DARK, marginTop: 8 },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    backgroundColor: `${Colors.accent}1c`,
    borderRadius: 99,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  liveIndicator: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.accent },
  liveText: { fontSize: 10, fontWeight: '800', color: Colors.accent, letterSpacing: 1 },
});

// ── Step 4: Battle search list ─────────────────────────────────
function OB4() {
  const battles = [
    { t: '5月ウォーキング杯', s: '4チーム / 残 1日 6時間', c: TEAM_RED },
    { t: '部活ラン 2026 春',  s: '3チーム / 残 5日',      c: TEAM_BLUE },
    { t: '家族チャレンジ',    s: '2チーム / 残 3日',      c: TEAM_YELLOW },
  ];
  return (
    <View style={ob4.card}>
      <View style={ob4.titleRow}>
        <Text style={ob4.title}>チャレンジを探す</Text>
        <View style={ob4.countBadge}>
          <Text style={ob4.countText}>3 件</Text>
        </View>
      </View>
      {battles.map((b, i) => (
        <View key={i} style={[ob4.row, i < battles.length - 1 && ob4.rowBorder]}>
          <View style={[ob4.icon, { backgroundColor: `${b.c}22` }]}>
            <Ionicons name="trophy-outline" size={16} color={b.c} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={ob4.name}>{b.t}</Text>
            <Text style={ob4.sub}>{b.s}</Text>
          </View>
          <Ionicons name="chevron-forward" size={14} color={Colors.textTertiary} />
        </View>
      ))}
    </View>
  );
}

const ob4 = StyleSheet.create({
  card: {
    width: W * 0.76,
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 16,
    ...Shadow.lg,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  title: { fontSize: 14, fontWeight: '900', color: INK_DARK },
  countBadge: {
    backgroundColor: `${Colors.primary}1c`,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  countText: { fontSize: 9, fontWeight: '800', color: Colors.primaryDark, letterSpacing: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: 12, fontWeight: '800', color: INK_DARK },
  sub: { fontSize: 10, color: Colors.textTertiary, marginTop: 2 },
});

// ═══════════════════════════════════════════════════════════════
// MAIN STYLES
// ═══════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { height: 6, borderRadius: 99 },
  dotActive: { width: 28 },
  dotInactive: { width: 6, backgroundColor: Colors.border },
  skip: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },

  // Illustration
  illustBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },

  // Text block
  textBlock: {
    paddingHorizontal: Spacing['2xl'],
    paddingBottom: Spacing.lg,
  },
  stepLabel: {
    fontFamily: Typography.fontFamily.mono,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  heading: {
    fontSize: 28,
    fontWeight: '900',
    color: INK_DARK,
    letterSpacing: 0.2,
    lineHeight: 34,
    marginBottom: 10,
  },
  body: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 20,
  },

  // CTA
  cta: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Platform.OS === 'ios' ? Spacing.lg : Spacing['2xl'],
  },
  btnNext: {
    backgroundColor: INK_DARK,
    borderRadius: BorderRadius.md,
    paddingVertical: 16,
    alignItems: 'center',
    ...Shadow.md,
  },
  btnNextText: {
    fontSize: 15,
    fontWeight: '900',
    color: Colors.textOnPrimary,
    letterSpacing: 0.5,
  },
  finalCta: { gap: 8 },
  btnPrimary: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: 16,
    alignItems: 'center',
    ...Shadow.md,
  },
  btnPrimaryText: {
    fontSize: 15,
    fontWeight: '900',
    color: Colors.textOnPrimary,
    letterSpacing: 0.5,
  },
  btnOutline: {
    borderRadius: BorderRadius.md,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: INK_DARK,
  },
  btnOutlineText: {
    fontSize: 14,
    fontWeight: '800',
    color: INK_DARK,
  },
  footnote: {
    textAlign: 'center',
    fontSize: 11,
    color: Colors.textTertiary,
    marginTop: 4,
  },
});
