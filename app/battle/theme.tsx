import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { doc, updateDoc } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../stores/authStore';
import { isPro } from '../../lib/pro';
import type { BattleTheme } from '../../types';

const BR = {
  light:   '#F4F2EC',
  lightSurf2: '#EDEAE2',
  lightLine:  'rgba(10,14,26,0.08)',
  ink:     '#0A0E1A',
  ink2:    '#5A6477',
  ink3:    '#9AA4B5',
  primary: '#00D9A3',
  accent:  '#FF5C2B',
  gold:    '#FFC23C',
  paper:   '#FFFFFF',
  pro:     '#7C3AED',
};

function Tac({ children, color = BR.ink3, size = 9 }: {
  children: string; color?: string; size?: number;
}) {
  return (
    <Text style={{
      fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
      fontSize: size, fontWeight: '700',
      letterSpacing: size * 0.2, color, textTransform: 'uppercase',
    }}>{children}</Text>
  );
}

interface ThemeDef {
  id: BattleTheme;
  name: string;
  desc: string;
  emoji: string;
  colors: { primary: string; bg: string };
  proOnly: boolean;
}

const THEMES: ThemeDef[] = [
  {
    id: 'sports',
    name: 'スポーツ大会風',
    desc: '王道・競技感',
    emoji: '🏟️',
    colors: { primary: '#00D9A3', bg: '#F0FBF8' },
    proOnly: false,
  },
  {
    id: 'rpg',
    name: 'RPGギルド風',
    desc: 'ゲーム感・冒険感',
    emoji: '⚔️',
    colors: { primary: '#7C3AED', bg: '#F5F3FF' },
    proOnly: true,
  },
  {
    id: 'territory',
    name: '陣取り合戦風',
    desc: '陣営対抗感',
    emoji: '🏯',
    colors: { primary: '#EF4444', bg: '#FEF2F2' },
    proOnly: true,
  },
  {
    id: 'cyber',
    name: '近未来サイバー風',
    desc: 'スコアボード感',
    emoji: '🤖',
    colors: { primary: '#06B6D4', bg: '#ECFEFF' },
    proOnly: true,
  },
  {
    id: 'casual',
    name: 'ゆる散歩風',
    desc: '家族・友達向け',
    emoji: '🌸',
    colors: { primary: '#F59E0B', bg: '#FFFBEB' },
    proOnly: true,
  },
  {
    id: 'school',
    name: '学校/サークル風',
    desc: '学生向け',
    emoji: '🎓',
    colors: { primary: '#3B82F6', bg: '#EFF6FF' },
    proOnly: true,
  },
  {
    id: 'corporate',
    name: '企業イベント風',
    desc: '職場・部署向け',
    emoji: '🏢',
    colors: { primary: '#1E293B', bg: '#F8FAFC' },
    proOnly: true,
  },
];

export default function BattleThemeScreen() {
  const { id: battleId } = useLocalSearchParams<{ id?: string }>();
  const { user, proEntitlement } = useAuthStore();
  const [selected, setSelected] = useState<BattleTheme>('sports');
  const [saving, setSaving] = useState(false);

  const userIsPro = isPro(user?.plan, proEntitlement);

  async function handleSave() {
    if (!battleId) { router.back(); return; }
    if (!userIsPro && THEMES.find((t) => t.id === selected)?.proOnly) {
      Alert.alert('Proプランが必要です', 'このテーマはProプランで利用できます', [
        { text: 'キャンセル', style: 'cancel' },
        { text: 'Proを見る', onPress: () => router.push('/(tabs)/profile' as any) },
      ]);
      return;
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, 'battles', battleId), { theme: selected });
      router.back();
    } catch {
      Alert.alert('エラー', 'テーマの保存に失敗しました');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={20} color={BR.ink2} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Tac color={BR.ink3} size={9}>BATTLERUN / Pro機能</Tac>
          <Text style={s.headerTitle}>テーマを選ぶ</Text>
        </View>
        <TouchableOpacity
          style={[s.saveBtn, saving && { opacity: 0.5 }]}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={s.saveBtnText}>{saving ? '保存中...' : '保存'}</Text>
        </TouchableOpacity>
      </View>

      {!userIsPro && (
        <View style={s.proBanner}>
          <Ionicons name="sparkles" size={16} color={BR.pro} />
          <Text style={s.proBannerText}>Proプランで全テーマを選択できます</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/profile' as any)}>
            <Text style={s.proBannerLink}>詳細 →</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.subtitle}>テーマはバトル詳細・ランキング・結果画面・共有画像に反映されます。</Text>

        {THEMES.map((theme) => {
          const isSelected = selected === theme.id;
          const locked = theme.proOnly && !userIsPro;
          return (
            <TouchableOpacity
              key={theme.id}
              style={[
                s.themeCard,
                isSelected && { borderColor: theme.colors.primary, borderWidth: 2, backgroundColor: theme.colors.bg },
                locked && s.themeCardLocked,
              ]}
              onPress={() => {
                if (locked) {
                  Alert.alert('Pro限定テーマ', `「${theme.name}」はProプランで利用できます。`);
                  return;
                }
                setSelected(theme.id);
              }}
              activeOpacity={0.85}
            >
              <Text style={s.themeEmoji}>{theme.emoji}</Text>
              <View style={{ flex: 1 }}>
                <View style={s.themeNameRow}>
                  <Text style={[s.themeName, locked && { color: BR.ink3 }]}>{theme.name}</Text>
                  {theme.proOnly && (
                    <View style={s.proTag}>
                      <Text style={s.proTagText}>Pro</Text>
                    </View>
                  )}
                </View>
                <Text style={s.themeDesc}>{theme.desc}</Text>
                <View style={[s.themePreviewBar, { backgroundColor: theme.colors.primary }]} />
              </View>
              {isSelected && !locked && (
                <View style={[s.checkmark, { backgroundColor: theme.colors.primary }]}>
                  <Ionicons name="checkmark" size={14} color="#fff" />
                </View>
              )}
              {locked && (
                <Ionicons name="lock-closed-outline" size={18} color={BR.ink3} />
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: BR.light },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: BR.paper, borderBottomWidth: 1, borderBottomColor: BR.lightLine,
  },
  headerTitle: { fontSize: 18, fontWeight: '900', color: BR.ink, marginTop: 2 },
  saveBtn: {
    backgroundColor: BR.primary, borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  saveBtnText: { fontSize: 13, fontWeight: '800', color: BR.ink },

  proBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: `${BR.pro}12`,
    borderBottomWidth: 1, borderBottomColor: `${BR.pro}20`,
  },
  proBannerText: { flex: 1, fontSize: 12, color: BR.pro, fontWeight: '600' },
  proBannerLink: { fontSize: 12, color: BR.pro, fontWeight: '800' },

  scroll: { padding: 16, gap: 10 },
  subtitle: { fontSize: 12, color: BR.ink3, marginBottom: 4, lineHeight: 17 },

  themeCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: 14,
    backgroundColor: BR.paper,
    borderWidth: 1, borderColor: BR.lightLine,
  },
  themeCardLocked: { opacity: 0.6 },
  themeEmoji: { fontSize: 32, width: 44, textAlign: 'center' },
  themeNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  themeName: { fontSize: 15, fontWeight: '800', color: BR.ink },
  themeDesc: { fontSize: 12, color: BR.ink3, marginBottom: 6 },
  themePreviewBar: { height: 4, borderRadius: 2, width: 60 },
  proTag: {
    backgroundColor: `${BR.pro}20`, borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  proTagText: { fontSize: 10, fontWeight: '800', color: BR.pro },
  checkmark: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
});
