import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable, FlatList } from 'react-native';
import { Button } from '../ui/Button';
import { Colors, Spacing, BorderRadius, Typography } from '../../design_tokens';
import type { Battle } from '../../types';

interface Props {
  visible: boolean;
  battle: Battle | null;
  onJoin: (categoryId: string) => void;
  onClose: () => void;
  loading: boolean;
}

/**
 * 参加する区分（陣営）を選ぶボトムシート。表示専用。
 * 選択状態のみコンポーネント内 UI ステート。参加処理は onJoin コールバックで親に委譲する。
 */
export function CategorySelectModal({ visible, battle, onJoin, onClose, loading }: Props) {
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (visible) setSelected(null);
  }, [visible]);

  if (!battle) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={modal.overlay} onPress={onClose}>
        <Pressable style={modal.sheet} onPress={() => {}}>
          <View style={modal.handle} />
          <Text style={modal.title}>{battle.title}</Text>
          <Text style={modal.subtitle}>参加する区分を選んでください</Text>

          <FlatList
            data={battle.categories}
            keyExtractor={(c) => c.id}
            renderItem={({ item }) => {
              const isSelected = selected === item.id;
              return (
                <TouchableOpacity
                  style={[modal.catBtn, isSelected && modal.catBtnSelected]}
                  onPress={() => setSelected(item.id)}
                  activeOpacity={0.7}
                >
                  <Text style={[modal.catLabel, isSelected && modal.catLabelSelected]}>
                    {item.label}
                  </Text>
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
  catLabel: { fontSize: Typography.fontSize.md, color: Colors.textPrimary, fontWeight: Typography.fontWeight.medium },
  catLabelSelected: { color: Colors.primary, fontWeight: Typography.fontWeight.bold },
  checkmark: { fontSize: Typography.fontSize.md, color: Colors.primary, fontWeight: Typography.fontWeight.bold },
});
