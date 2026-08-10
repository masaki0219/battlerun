import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable, FlatList } from 'react-native';
import { Button } from '../ui/Button';
import { Colors, Spacing, BorderRadius, Typography, teamColorMap } from '../../design_tokens';
import type { Battle, CategoryStats } from '../../types';

interface Props {
  visible: boolean;
  battle: Battle | null;
  /** 各チームの参加人数表示用（任意）。未指定なら人数行を出さない */
  stats?: CategoryStats[];
  onJoin: (categoryId: string) => void;
  onClose: () => void;
  loading: boolean;
}

/**
 * 参加するチームを選ぶボトムシート。表示専用。
 * 選択状態のみコンポーネント内 UI ステート。参加処理は onJoin コールバックで親に委譲する。
 * 平均kmは初心者を萎縮させうるため出さず、人数と「いま入ると貢献が大きい」の
 * ニュアンス表示だけを判断材料にする。
 */
export function CategorySelectModal({ visible, battle, stats, onJoin, onClose, loading }: Props) {
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (visible) setSelected(null);
  }, [visible]);

  if (!battle) return null;

  const countFor = (categoryId: string): number | null => {
    const stat = stats?.find((item) => item.categoryId === categoryId);
    return stat ? stat.participantCount : null;
  };
  // 全チームの人数が取れているときだけ「最少人数のチーム」を案内する（複数最少なら先頭のみ）
  const counts = battle.categories.map((cat) => countFor(cat.id));
  const allCountsKnown = counts.every((count): count is number => count != null);
  const shortageCategoryId = allCountsKnown && battle.categories.length >= 2
    ? battle.categories[counts.indexOf(Math.min(...(counts as number[])))].id
    : null;
  const colorsByCategory = teamColorMap(battle.categories);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={modal.overlay} onPress={onClose}>
        <Pressable style={modal.sheet} onPress={() => {}}>
          <View style={modal.handle} />
          <Text style={modal.title}>{battle.title}</Text>
          <Text style={modal.subtitle}>参加するチームを選んでください</Text>

          <FlatList
            data={battle.categories}
            keyExtractor={(c) => c.id}
            renderItem={({ item }) => {
              const isSelected = selected === item.id;
              const count = countFor(item.id);
              const isShortage = item.id === shortageCategoryId;
              return (
                <TouchableOpacity
                  style={[modal.catBtn, isSelected && modal.catBtnSelected]}
                  onPress={() => setSelected(item.id)}
                  activeOpacity={0.7}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={count != null ? `${item.label}、${count}人が参加中` : item.label}
                >
                  <View style={[modal.colorDot, { backgroundColor: colorsByCategory[item.id] }]} />
                  <View style={modal.catBody}>
                    <Text style={[modal.catLabel, isSelected && modal.catLabelSelected]}>
                      {item.label}
                    </Text>
                    {count != null && (
                      <Text style={modal.catSub}>
                        {count}人が参加中
                        {isShortage && <Text style={modal.catHint}>・いま入ると貢献が大きい</Text>}
                      </Text>
                    )}
                  </View>
                  {isSelected && <Text style={modal.checkmark}>✓</Text>}
                </TouchableOpacity>
              );
            }}
            contentContainerStyle={{ gap: Spacing.sm, paddingBottom: Spacing.lg }}
          />

          <Button
            label="参加する"
            onPress={() => { if (selected) onJoin(selected); }}
            loading={loading}
            disabled={!selected}
            style={{ opacity: selected ? 1 : 0.4 }}
          />
          <Button label="キャンセル" onPress={onClose} variant="ghost" style={{ marginTop: Spacing.sm }} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const modal = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg, paddingBottom: Spacing['4xl'],
    maxHeight: '80%',
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: Spacing.lg },
  title: { fontSize: Typography.fontSize.xl, fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary, marginBottom: Spacing.xs },
  subtitle: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.lg },
  catBtn: {
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md, borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.surfaceGray,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  catBtnSelected: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  catBody: { flex: 1, gap: 2 },
  colorDot: { width: 14, height: 14, borderRadius: BorderRadius.full, marginRight: Spacing.sm },
  catLabel: { fontSize: Typography.fontSize.md, color: Colors.textPrimary, fontWeight: Typography.fontWeight.medium },
  catLabelSelected: { color: Colors.primary, fontWeight: Typography.fontWeight.bold },
  catSub: { fontSize: Typography.fontSize.xs, color: Colors.textSecondary },
  catHint: { color: Colors.primaryDark, fontWeight: Typography.fontWeight.semibold },
  checkmark: { fontSize: Typography.fontSize.md, color: Colors.primary, fontWeight: Typography.fontWeight.bold },
});
