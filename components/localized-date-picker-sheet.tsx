import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import React, { useEffect, useRef } from 'react';
import { Modal, Platform, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/themed-text';
import { getAppNumberLocale, getDatePickerFirstDayOfWeek } from '@/lib/app-number-locale';

const PRIMARY = '#89acff';

type Props = {
  visible: boolean;
  value: Date;
  maximumDate?: Date;
  onClose: () => void;
  onConfirm: (date: Date) => void;
  onChange: (date: Date) => void;
};

export function LocalizedDatePickerSheet({
  visible,
  value,
  maximumDate,
  onClose,
  onConfirm,
  onChange,
}: Props) {
  const { t, i18n } = useTranslation();
  const numberLocale = getAppNumberLocale(i18n.language);
  const androidOpenedRef = useRef(false);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    if (!visible) {
      androidOpenedRef.current = false;
      return;
    }
    if (androidOpenedRef.current) return;
    androidOpenedRef.current = true;

    DateTimePickerAndroid.open({
      value,
      mode: 'date',
      maximumDate,
      firstDayOfWeek: getDatePickerFirstDayOfWeek(i18n.language),
      positiveButton: { label: t('assetEntry.keyboardDone') },
      negativeButton: { label: t('settings.cancel') },
      onChange: (event, date) => {
        androidOpenedRef.current = false;
        if (event.type === 'set' && date) {
          onConfirm(date);
        } else {
          onClose();
        }
      },
    });

    return () => {
      DateTimePickerAndroid.dismiss('date');
      androidOpenedRef.current = false;
    };
  }, [visible, value, maximumDate, i18n.language, t, onClose, onConfirm]);

  if (Platform.OS === 'android') {
    return null;
  }

  const preview = value.toLocaleDateString(numberLocale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const handleChange = (_event: DateTimePickerEvent, date?: Date) => {
    if (date) onChange(date);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <ThemedText style={styles.headerBtn}>{t('settings.cancel')}</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onConfirm(value)} hitSlop={12}>
              <ThemedText style={[styles.headerBtn, styles.headerBtnDone]}>
                {t('assetEntry.keyboardDone')}
              </ThemedText>
            </TouchableOpacity>
          </View>
          <ThemedText style={styles.preview}>{preview}</ThemedText>
          <DateTimePicker
            key={numberLocale}
            value={value}
            mode="date"
            display="spinner"
            locale={numberLocale}
            maximumDate={maximumDate}
            onChange={handleChange}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    backgroundColor: '#1c1c1e',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.12)',
  },
  headerBtn: {
    fontSize: 17,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.72)',
  },
  headerBtnDone: {
    color: PRIMARY,
    fontWeight: '700',
  },
  preview: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 4,
  },
});
