import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import React, { useEffect, useRef } from 'react';
import { Modal, Platform, StyleSheet, UIManager, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { JsDatePickerWheels } from '@/components/js-date-picker-wheels';
import { ThemedText } from '@/components/themed-text';
import { getAppNumberLocale, getDatePickerFirstDayOfWeek } from '@/lib/app-number-locale';

function isNativeDateTimePickerAvailable(): boolean {
  if (Platform.OS !== 'ios') return true;
  return (
    typeof UIManager.hasViewManagerConfig === 'function' &&
    UIManager.hasViewManagerConfig('RNDateTimePicker')
  );
}

const PRIMARY = '#89acff';
/** iOS UIDatePicker spinner yüksekliği — belirtilmezse sheet içinde 0px kalıp görünmez. */
const IOS_SPINNER_HEIGHT = 216;

type Props = {
  visible: boolean;
  value: Date;
  maximumDate?: Date;
  /** Tam ekran Modal yerine üst ekran içinde overlay (iç içe Modal sorununu önler). */
  embedded?: boolean;
  onClose: () => void;
  onConfirm: (date: Date) => void;
  onChange: (date: Date) => void;
};

export function LocalizedDatePickerSheet({
  visible,
  value,
  maximumDate,
  embedded = false,
  onClose,
  onConfirm,
  onChange,
}: Props) {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
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

  if (!visible) {
    return null;
  }

  const sheetBottomPad = Math.max(insets.bottom, 12);
  const useNativePicker = isNativeDateTimePickerAvailable();

  const sheet = (
    <View style={[styles.sheet, { paddingBottom: sheetBottomPad }]}>
      <View style={styles.header}>
        <Pressable onPress={onClose} hitSlop={12}>
          <ThemedText style={styles.headerBtn}>{t('settings.cancel')}</ThemedText>
        </Pressable>
        <Pressable onPress={() => onConfirm(value)} hitSlop={12}>
          <ThemedText style={[styles.headerBtn, styles.headerBtnDone]}>
            {t('assetEntry.keyboardDone')}
          </ThemedText>
        </Pressable>
      </View>
      <ThemedText style={styles.preview}>{preview}</ThemedText>
      <View style={[styles.pickerWrap, !useNativePicker && styles.pickerWrapJs]}>
        {useNativePicker ? (
          <DateTimePicker
            key={numberLocale}
            value={value}
            mode="date"
            display="spinner"
            locale={numberLocale}
            maximumDate={maximumDate}
            themeVariant="dark"
            style={styles.picker}
            onChange={handleChange}
          />
        ) : (
          <JsDatePickerWheels
            value={value}
            maximumDate={maximumDate}
            locale={numberLocale}
            onChange={onChange}
          />
        )}
      </View>
    </View>
  );

  const overlay = (
    <View style={embedded ? styles.embeddedRoot : styles.modalRoot} pointerEvents="box-none">
      <Pressable style={styles.backdrop} onPress={onClose} />
      {sheet}
    </View>
  );

  if (embedded) {
    return overlay;
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      {overlay}
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  embeddedRoot: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 100,
    elevation: 100,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    backgroundColor: '#1c1c1e',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    zIndex: 2,
    elevation: 2,
    overflow: 'hidden',
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
    paddingTop: 12,
    paddingBottom: 4,
  },
  pickerWrap: {
    height: IOS_SPINNER_HEIGHT,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerWrapJs: {
    height: 200,
  },
  picker: {
    height: IOS_SPINNER_HEIGHT,
    width: '100%',
  },
});
