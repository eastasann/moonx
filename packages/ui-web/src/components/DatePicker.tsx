import {
  type CalendarDate,
  parseDate,
  startOfWeek,
  today,
} from "@internationalized/date";
import {
  formatCalendarMonth,
  formatDayOfMonth,
  formatWeekdayInitial,
} from "@moonx/i18n";
import type { Size } from "@moonx/ui-tokens";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useContext, useRef } from "react";
import {
  DatePicker as AriaDatePicker,
  type DatePickerProps as AriaDatePickerProps,
  Button,
  Calendar,
  CalendarCell,
  CalendarGrid,
  CalendarGridBody,
  CalendarHeaderCell,
  CalendarStateContext,
  DateInput,
  DateSegment,
  Dialog,
  Group,
  Heading,
  useLocale,
} from "react-aria-components";
import { useTranslation } from "react-i18next";
import {
  FieldHelp,
  FieldLabel,
  type FieldTextProps,
  invalidOf,
} from "../internal/FieldHelp";
import { FixedLocale } from "../internal/FixedLocale";
import * as styles from "../internal/field.css";
import { IconSlot } from "../internal/IconSlot";
import { ResponsivePopover } from "../internal/ResponsivePopover";
import { useFieldWidth, useSize } from "../internal/size";
import { useKeepAboveKeyboard } from "../internal/useKeepAboveKeyboard";
import * as calendar from "./DatePicker.css";

export interface DatePickerProps
  extends FieldTextProps,
    Pick<
      AriaDatePickerProps<CalendarDate>,
      | "name"
      | "isDisabled"
      | "isReadOnly"
      | "isRequired"
      | "autoFocus"
      | "isOpen"
      | "defaultOpen"
      | "onOpenChange"
      | "id"
      | "aria-label"
      | "aria-labelledby"
    > {
  /** The date as `YYYY-MM-DD`, or null for none (the API's `DateOnly`). */
  value?: string | null;
  defaultValue?: string | null;
  /** Called with the date once all of it is entered, or null when it is cleared. */
  onChange?: (value: string | null) => void;
  /** @default "M"; "L" in a spacious pattern, dialog or `Form` (06 semantic.density) */
  size?: Size;
  /** @default "default" */
  width?: "default" | "full";
}

// The API's dates are always `YYYY-MM-DD` (DateOnly); parseDate throws on anything else,
// which is a bug of the caller to see, not a value to hide.
const toDate = (value: string | null | undefined) =>
  value == null ? value : parseDate(value);

// A day-granularity field has only these editable segments; the separators between them
// come from the en-PH date format, not the catalog.
const placeholderKeys = {
  month: "components:dateField.placeholder.month",
  day: "components:dateField.placeholder.day",
  year: "components:dateField.placeholder.year",
} as const;

// The calendar's visible text comes from the shared formatters (SDD 9章「書式」), not
// from React Aria's own formatting; only its read-outs stay React Aria's (SDD 9章「React
// Aria の文言」).

function CalendarMonth() {
  const state = useContext(CalendarStateContext);
  return (
    <Heading className={calendar.heading}>
      {state && formatCalendarMonth(state.visibleRange.start.toString())}
    </Heading>
  );
}

// In place of React Aria's CalendarGridHeader, which formats the weekdays itself. The
// week starts where React Aria starts the rows (startOfWeek in its locale), and the row
// stays hidden from screen readers as React Aria's is: each day cell reads its weekday.
function WeekdayHeader() {
  const state = useContext(CalendarStateContext);
  const { locale } = useLocale();
  if (state === null) return null;
  const first = startOfWeek(today(state.timeZone), locale);
  return (
    <thead aria-hidden="true">
      <tr>
        {Array.from({ length: 7 }, (_, index) => {
          const day = first.add({ days: index }).toString();
          return (
            <CalendarHeaderCell key={day} className={calendar.weekday}>
              {formatWeekdayInitial(day)}
            </CalendarHeaderCell>
          );
        })}
      </tr>
    </thead>
  );
}

/**
 * A date typed in en-PH order or picked from a calendar: a popover on tablet and wider,
 * a tray on a phone (deadlines, research log dates; design-spec 4.5).
 */
export function DatePicker({
  label,
  description,
  descriptionTone,
  errorMessage,
  isInvalid,
  value,
  defaultValue,
  onChange,
  size,
  width: givenWidth,
  ...props
}: DatePickerProps) {
  const { t } = useTranslation(["components"]);
  const resolved = useSize(size);
  const width = useFieldWidth(givenWidth);
  const frameRef = useRef<HTMLDivElement>(null);
  useKeepAboveKeyboard(frameRef);
  return (
    <FixedLocale>
      <AriaDatePicker<CalendarDate>
        {...props}
        value={toDate(value)}
        defaultValue={toDate(defaultValue)}
        onChange={(date) => onChange?.(date === null ? null : date.toString())}
        granularity="day"
        isInvalid={invalidOf({ errorMessage, isInvalid })}
        validationBehavior="aria"
        className={styles.fieldRoot({
          size: resolved,
          width: width === "full" ? "full" : "content",
        })}
      >
        {label != null && (
          <FieldLabel label={label} isRequired={props.isRequired} />
        )}
        <Group ref={frameRef} className={styles.frame({ size: resolved })}>
          <DateInput className={calendar.dateInput}>
            {(segment) => (
              <DateSegment segment={segment} className={calendar.segment}>
                {({ type, text, isPlaceholder }) =>
                  isPlaceholder && type in placeholderKeys
                    ? t(placeholderKeys[type as keyof typeof placeholderKeys])
                    : text
                }
              </DateSegment>
            )}
          </DateInput>
          <Button
            aria-label={t("components:datePicker.calendar")}
            className={styles.fieldButton({ size: resolved })}
          >
            <IconSlot size={resolved}>
              <CalendarDays />
            </IconSlot>
          </Button>
        </Group>
        <FieldHelp
          description={description}
          descriptionTone={descriptionTone}
          errorMessage={errorMessage}
        />
        <ResponsivePopover>
          <Dialog className={calendar.dialog}>
            <Calendar className={calendar.calendar}>
              <header className={calendar.header}>
                <Button
                  slot="previous"
                  aria-label={t("components:calendar.previous")}
                  className={calendar.navButton}
                >
                  <IconSlot size="M">
                    <ChevronLeft />
                  </IconSlot>
                </Button>
                <CalendarMonth />
                <Button
                  slot="next"
                  aria-label={t("components:calendar.next")}
                  className={calendar.navButton}
                >
                  <IconSlot size="M">
                    <ChevronRight />
                  </IconSlot>
                </Button>
              </header>
              <CalendarGrid className={calendar.grid}>
                <WeekdayHeader />
                <CalendarGridBody>
                  {(date) => (
                    <CalendarCell date={date} className={calendar.cell}>
                      {formatDayOfMonth(date.toString())}
                    </CalendarCell>
                  )}
                </CalendarGridBody>
              </CalendarGrid>
            </Calendar>
          </Dialog>
        </ResponsivePopover>
      </AriaDatePicker>
    </FixedLocale>
  );
}
