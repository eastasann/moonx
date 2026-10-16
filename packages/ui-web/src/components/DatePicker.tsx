import { type CalendarDate, parseDate } from "@internationalized/date";
import type { Size } from "@moonx/ui-tokens";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useRef } from "react";
import {
  DatePicker as AriaDatePicker,
  type DatePickerProps as AriaDatePickerProps,
  Button,
  Calendar,
  CalendarCell,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHeader,
  CalendarHeaderCell,
  DateInput,
  DateSegment,
  Dialog,
  Group,
  Heading,
  Label,
} from "react-aria-components";
import {
  FieldHelp,
  type FieldTextProps,
  invalidOf,
} from "../internal/FieldHelp";
import { FixedLocale } from "../internal/FixedLocale";
import * as styles from "../internal/field.css";
import { IconSlot } from "../internal/IconSlot";
import { ResponsivePopover } from "../internal/ResponsivePopover";
import { useSize } from "../internal/size";
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
  /** @default "M", or "L" inside a spacious `Form` */
  size?: Size;
  /** @default "default" */
  width?: "default" | "full";
}

// The API's dates are always `YYYY-MM-DD` (DateOnly); parseDate throws on anything else,
// which is a bug of the caller to see, not a value to hide.
const toDate = (value: string | null | undefined) =>
  value == null ? value : parseDate(value);

/**
 * A date typed in en-PH order or picked from a calendar: a popover on tablet and wider,
 * a tray on a phone (deadlines, research log dates; design-spec 4.5).
 */
export function DatePicker({
  label,
  description,
  errorMessage,
  isInvalid,
  value,
  defaultValue,
  onChange,
  size,
  width = "default",
  ...props
}: DatePickerProps) {
  const resolved = useSize(size);
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
        {label != null && <Label className={styles.label}>{label}</Label>}
        <Group ref={frameRef} className={styles.frame({ size: resolved })}>
          <DateInput className={calendar.dateInput}>
            {(segment) => (
              <DateSegment segment={segment} className={calendar.segment} />
            )}
          </DateInput>
          <Button className={styles.fieldButton({ size: resolved })}>
            <IconSlot size={resolved}>
              <CalendarDays />
            </IconSlot>
          </Button>
        </Group>
        <FieldHelp description={description} errorMessage={errorMessage} />
        <ResponsivePopover>
          <Dialog className={calendar.dialog}>
            <Calendar className={calendar.calendar}>
              <header className={calendar.header}>
                <Button slot="previous" className={calendar.navButton}>
                  <IconSlot size="M">
                    <ChevronLeft />
                  </IconSlot>
                </Button>
                <Heading className={calendar.heading} />
                <Button slot="next" className={calendar.navButton}>
                  <IconSlot size="M">
                    <ChevronRight />
                  </IconSlot>
                </Button>
              </header>
              <CalendarGrid className={calendar.grid}>
                <CalendarGridHeader>
                  {(day) => (
                    <CalendarHeaderCell className={calendar.weekday}>
                      {day}
                    </CalendarHeaderCell>
                  )}
                </CalendarGridHeader>
                <CalendarGridBody>
                  {(date) => (
                    <CalendarCell date={date} className={calendar.cell} />
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
