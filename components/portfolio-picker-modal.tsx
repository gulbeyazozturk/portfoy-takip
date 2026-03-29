import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { PortfolioRow } from '@/context/portfolio';

const SURFACE = '#111111';
const BORDER = 'rgba(255,255,255,0.05)';
const MUTED = '#a1a1aa';
const WHITE = '#FFFFFF';
const PRIMARY = '#00e677';

type Props = {
  visible: boolean;
  onClose: () => void;
  portfolios: PortfolioRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

export function PortfolioPickerModal({ visible, onClose, portfolios, selectedId, onSelect }: Props) {
  const { t } = useTranslation();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.modalTitle}>{t('portfolio.pickPortfolio')}</Text>
          {portfolios.map((p) => {
            const selected = p.id === selectedId;
            return (
              <Pressable
                key={p.id}
                style={[styles.modalRow, selected && styles.modalRowSelected]}
                onPress={() => {
                  onSelect(p.id);
                  onClose();
                }}>
                <Text style={[styles.modalRowText, selected && styles.modalRowTextSelected]} numberOfLines={1}>
                  {p.name}
                </Text>
                {selected ? <Ionicons name="checkmark-circle" size={22} color={PRIMARY} /> : null}
              </Pressable>
            );
          })}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  modalSheet: {
    backgroundColor: SURFACE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    paddingVertical: 12,
    maxHeight: '70%',
  },
  modalTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: MUTED,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  modalRowSelected: { backgroundColor: 'rgba(0,230,119,0.08)' },
  modalRowText: { flex: 1, fontSize: 16, color: WHITE, fontWeight: '600' },
  modalRowTextSelected: { color: PRIMARY },
});
