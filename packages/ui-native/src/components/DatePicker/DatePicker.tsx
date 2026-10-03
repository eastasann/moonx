import {
  type CalendarDate,
  DateFormatter,
  type DateValue,
  getLocalTimeZone,
  getWeeksInMonth,
  isSameDay,
  startOfMonth,
  startOfWeek,
  toCalendarDate,
  today,
} from "@internationalized/date";
import { formatDate, LOCALE } from "@moonx/i18n";
import type { ComponentSize } from "@moonx/ui-tokens";
import { CalendarDays, ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import {
  FieldHelp,
  FieldLabel,
  type FieldProps,
  FieldRoot,
  fieldAccessibility,
  textOf,
  useFieldIconProps,
} from "../../internal/FieldParts";
import { atLeastTarget, sizeVariants } from "../../internal/sizes";
import { fontStyle } from "../../internal/typography";
import { useControlledState } from "../../internal/useControlledState";
import { OptionTrigger } from "../Picker/OptionList";
import { Tray } from "../Tray";

export type { DateValue };

type FirstDayOfWeek = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

export interface DatePickerProps extends FieldProps {
  value?: DateValue | null;
  defaultValue?: DateValue | null;
  /** Called with the chosen day, in the same type as the current value (a `CalendarDate` when there is none). */
  onChange?: (value: DateValue | null) => void;
  /** Earliest and latest day that can be chosen. */
  minValue?: DateValue | null;
  maxValue?: DateValue | null;
  /** Days for which this returns true are shown struck through and cannot be chosen. */
  isDateUnavailable?: (date: DateValue) => boolean;
  /** Month shown when the calendar opens with no value; today when omitted. */
  placeholderValue?: DateValue | null;
  firstDayOfWeek?: FirstDayOfWeek;
  /**
   * Text of the field while there is no value. The Web part shows the date segments' own
   * placeholders; the phone has no segments, so the screen supplies the text.
   */
  placeholder?: string;
  isDisabled?: boolean;
  /** Read-only shows the value and does not open the calendar, so it looks and acts disabled, as on the Web. */
  isReadOnly?: boolean;
  isOpen?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  /** Read as the hint of the field, which opens the calendar when pressed. */
  openLabel: string;
  previousMonthLabel: string;
  nextMonthLabel: string;
  /** Accessible name when it must differ from `label`. */
  "aria-label"?: string;
  testID?: string;
}

function CalendarIcon() {
  const { size, color } = useFieldIconProps();
  return <CalendarDays aria-hidden size={size} color={color} />;
}

/**
 * Picks a calendar date; the value is an `@internationalized/date` `CalendarDate`, shown with
 * the en-PH format. It always opens a tray with a month grid on the phone (design-spec 4.5). The
 * Web part's typed segments, `granularity`, `name` and `autoFocus` have no phone equivalent.
 */
export function DatePicker({
  label,
  description,
  errorMessage,
  isInvalid,
  isRequired,
  isLabelHidden,
  size = "M",
  value,
  defaultValue = null,
  onChange,
  minValue,
  maxValue,
  isDateUnavailable,
  placeholderValue,
  firstDayOfWeek,
  placeholder,
  isDisabled = false,
  isReadOnly = false,
  isOpen,
  defaultOpen = false,
  onOpenChange,
  openLabel,
  previousMonthLabel,
  nextMonthLabel,
  "aria-label": ariaLabel,
  testID,
}: DatePickerProps) {
  const [date, setDate] = useControlledState<DateValue | null>(value, defaultValue, onChange);
  const [open, setOpen] = useControlledState(isOpen, defaultOpen, onOpenChange);
  const name = ariaLabel ?? textOf(label);
  const access = fieldAccessibility({ label, description, errorMessage, isInvalid, ariaLabel });
  const hint = [openLabel, access.accessibilityHint].filter(Boolean).join(". ");

  return (
    <FieldRoot size={size} isDisabled={isDisabled || isReadOnly} isInvalid={isInvalid}>
      <FieldLabel isRequired={isRequired} isLabelHidden={isLabelHidden}>
        {label}
      </FieldLabel>
      <Tray
        aria-label={name}
        isOpen={open}
        onOpenChange={setOpen}
        trigger={
          <OptionTrigger
            role="button"
            isOpen={open}
            text={date ? formatDate(toCalendarDate(date).toString()) : ""}
            placeholder={placeholder}
            trailing={<CalendarIcon />}
            testID={testID}
            accessibility={{ "aria-label": access["aria-label"], accessibilityHint: hint }}
          />
        }
      >
        {({ close }) => (
          <MonthGrid
            size={size}
            selected={date ? toCalendarDate(date) : null}
            initial={placeholderValue ? toCalendarDate(placeholderValue) : null}
            minValue={minValue ? toCalendarDate(minValue) : null}
            maxValue={maxValue ? toCalendarDate(maxValue) : null}
            isDateUnavailable={isDateUnavailable}
            firstDayOfWeek={firstDayOfWeek}
            previousMonthLabel={previousMonthLabel}
            nextMonthLabel={nextMonthLabel}
            onSelect={(day) => {
              setDate(date ? date.set({ year: day.year, month: day.month, day: day.day }) : day);
              close();
            }}
          />
        )}
      </Tray>
      <FieldHelp description={description} errorMessage={errorMessage} isInvalid={isInvalid} />
    </FieldRoot>
  );
}

function clamp(date: CalendarDate, min: CalendarDate | null, max: CalendarDate | null) {
  if (min && date.compare(min) < 0) return min;
  if (max && date.compare(max) > 0) return max;
  return date;
}

/** "Today" as the locale words it, so the day is named without a string of our own. */
function todayWord(): string {
  const word = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" }).format(0, "day");
  return word.charAt(0).toLocaleUpperCase(LOCALE) + word.slice(1);
}

/** The tray's content; it keeps the shown month itself and mounts each time the tray opens. */
function MonthGrid({
  size,
  selected,
  initial,
  minValue,
  maxValue,
  isDateUnavailable,
  firstDayOfWeek,
  previousMonthLabel,
  nextMonthLabel,
  onSelect,
}: {
  size: ComponentSize;
  selected: CalendarDate | null;
  initial: CalendarDate | null;
  minValue: CalendarDate | null;
  maxValue: CalendarDate | null;
  isDateUnavailable: ((date: DateValue) => boolean) | undefined;
  firstDayOfWeek: FirstDayOfWeek | undefined;
  previousMonthLabel: string;
  nextMonthLabel: string;
  onSelect: (day: CalendarDate) => void;
}) {
  styles.useVariants({ size });
  const zone = getLocalTimeZone();
  const now = today(zone);
  const [month, setMonth] = useState(() =>
    startOfMonth(clamp(selected ?? initial ?? now, minValue, maxValue)),
  );
  const first = startOfWeek(month, LOCALE, firstDayOfWeek);
  const rows = Array.from({ length: getWeeksInMonth(month, LOCALE, firstDayOfWeek) }, (_, week) =>
    Array.from({ length: 7 }, (_, day) => first.add({ days: week * 7 + day })),
  );
  const title = new DateFormatter(LOCALE, { month: "long", year: "numeric", timeZone: zone });
  const weekday = new DateFormatter(LOCALE, { weekday: "short", timeZone: zone });
  const full = new DateFormatter(LOCALE, { dateStyle: "full", timeZone: zone });
  const canGoBack = !minValue || month.subtract({ days: 1 }).compare(minValue) >= 0;
  const canGoForward = !maxValue || month.add({ months: 1 }).compare(maxValue) <= 0;
  const header = styles.header;
  const heading = styles.heading;
  const weekdayText = styles.weekday;
  const todayName = todayWord();

  return (
    <View style={styles.calendar}>
      <View style={header}>
        <NavButton
          icon={ChevronLeft}
          label={previousMonthLabel}
          isDisabled={!canGoBack}
          onPress={() => setMonth(month.subtract({ months: 1 }))}
        />
        <Text role="heading" accessibilityLiveRegion="polite" style={heading}>
          {title.format(month.toDate(zone))}
        </Text>
        <NavButton
          icon={ChevronRight}
          label={nextMonthLabel}
          isDisabled={!canGoForward}
          onPress={() => setMonth(month.add({ months: 1 }))}
        />
      </View>
      <View aria-hidden importantForAccessibility="no-hide-descendants" style={styles.week}>
        {rows[0]?.map((day) => (
          <View key={day.toString()} style={styles.weekdayCell}>
            <Text style={weekdayText}>{weekday.format(day.toDate(zone))}</Text>
          </View>
        ))}
      </View>
      {rows.map((row) => (
        <View key={row[0]?.toString()} style={styles.week}>
          {row.map((day) => {
            if (day.month !== month.month) {
              return <View key={day.toString()} style={styles.dayCell} />;
            }
            const isToday = isSameDay(day, now);
            const name = full.format(day.toDate(zone));
            const unavailable = isDateUnavailable?.(day) === true;
            const outOfRange =
              (minValue !== null && day.compare(minValue) < 0) ||
              (maxValue !== null && day.compare(maxValue) > 0);
            return (
              <DayCell
                key={day.toString()}
                label={isToday ? `${todayName}, ${name}` : name}
                isSelected={selected !== null && isSameDay(day, selected)}
                isToday={isToday}
                isUnavailable={unavailable}
                isBlocked={unavailable || outOfRange}
                onPress={() => onSelect(day)}
              >
                {day.day}
              </DayCell>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function NavButton({
  icon: Icon,
  label,
  isDisabled,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  isDisabled: boolean;
  onPress: () => void;
}) {
  styles.useVariants({ disabled: isDisabled });
  const base = styles.navButton;
  const pressed = styles.navButtonPressed;
  const icon = styles.navIcon;
  return (
    <Pressable
      role="button"
      aria-label={label}
      aria-disabled={isDisabled}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed: down }) => [base, down ? pressed : null]}
    >
      <Icon aria-hidden size={icon.width} color={icon.color} />
    </Pressable>
  );
}

function DayCell({
  label,
  isSelected,
  isToday,
  isUnavailable,
  isBlocked,
  onPress,
  children,
}: {
  label: string;
  isSelected: boolean;
  isToday: boolean;
  isUnavailable: boolean;
  isBlocked: boolean;
  onPress: () => void;
  children: number;
}) {
  styles.useVariants({
    selected: isSelected,
    today: isToday && !isSelected,
    unavailable: isUnavailable,
    disabled: isBlocked,
  });
  const cell = styles.dayCell;
  const pressed = styles.dayPressed;
  const text = styles.dayText;
  return (
    <Pressable
      role="button"
      aria-label={label}
      aria-selected={isSelected}
      aria-disabled={isBlocked}
      disabled={isBlocked}
      onPress={onPress}
      style={({ pressed: down }) => [cell, down && !isSelected ? pressed : null]}
    >
      <Text style={text}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => {
  const target = theme.scale.component["target-min"];
  const field = theme.scale.component.field;
  const color = theme.color;
  return {
    calendar: { gap: theme.space["100"] },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    heading: {
      ...fontStyle(theme, "label"),
      flex: 1,
      textAlign: "center",
      color: color.text.primary,
      variants: { size: sizeVariants((s) => ({ fontSize: field["font-size"][s] })) },
    },
    navButton: {
      alignItems: "center",
      justifyContent: "center",
      minWidth: target,
      minHeight: target,
      borderRadius: theme.radius.control,
    },
    navButtonPressed: { backgroundColor: color.control.secondary },
    navIcon: {
      width: theme.scale.component.icon.size.M,
      color: color.text.primary,
      variants: { disabled: { true: { color: color.text.disabled }, false: {} } },
    },
    week: { flexDirection: "row" },
    weekdayCell: { flex: 1, alignItems: "center", paddingBottom: theme.space["50"] },
    weekday: { ...fontStyle(theme, "caption"), color: color.text.secondary },
    dayCell: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      minHeight: atLeastTarget(field.height.M, target),
      borderRadius: theme.radius.control,
      borderWidth: theme["border-width"].strong,
      borderColor: "transparent",
      variants: {
        selected: { true: { backgroundColor: color.control.primary }, false: {} },
        today: { true: { borderColor: color.border.strong }, false: {} },
      },
    },
    dayPressed: { backgroundColor: color.control.secondary },
    dayText: {
      ...fontStyle(theme, "number"),
      color: color.text.primary,
      variants: {
        disabled: { true: { color: color.text.disabled }, false: {} },
        selected: { true: { color: color.control["on-primary"] }, false: {} },
        unavailable: { true: { textDecorationLine: "line-through" }, false: {} },
      },
    },
  };
});
