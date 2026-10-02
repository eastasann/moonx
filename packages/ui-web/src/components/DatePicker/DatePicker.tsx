import { LOCALE } from "@moonx/i18n";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
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
  type DateValue,
  Dialog,
  Group,
  Heading,
  I18nProvider,
} from "react-aria-components";
import { FieldHelp, FieldLabel, type FieldProps } from "../_internal/FieldParts";
import { box, fieldRoot, icon, inlineButton } from "../_internal/field.css";
import { ResponsivePopover } from "../ResponsivePopover";
import {
  calendar,
  cell,
  dialog,
  grid,
  header,
  headerCell,
  heading,
  navButton,
  segment,
  segments,
} from "./DatePicker.css";

export type { DateValue };

export interface DatePickerProps
  extends FieldProps,
    Omit<
      AriaDatePickerProps<DateValue>,
      | "className"
      | "style"
      | "children"
      | "validationBehavior"
      | "validate"
      | "granularity"
      | "shouldForceLeadingZeros"
      | keyof FieldProps
    > {
  /** Accessible name of the button that opens the calendar. */
  openLabel: string;
  previousMonthLabel: string;
  nextMonthLabel: string;
}

/**
 * Picks a calendar date; the value is an `@internationalized/date` `CalendarDate`. Segments and the
 * calendar follow en-PH. Opens as a popover on tablet and wider, and as a tray on a phone.
 */
export function DatePicker({
  label,
  description,
  errorMessage,
  isRequired,
  size = "M",
  openLabel,
  previousMonthLabel,
  nextMonthLabel,
  ...props
}: DatePickerProps) {
  return (
    <I18nProvider locale={LOCALE}>
      <AriaDatePicker
        {...props}
        isRequired={isRequired}
        granularity="day"
        validationBehavior="aria"
        className={fieldRoot({ size })}
      >
        {({ isInvalid, isDisabled }) => (
          <>
            <FieldLabel isRequired={isRequired} size={size}>
              {label}
            </FieldLabel>
            <Group
              isInvalid={isInvalid}
              isDisabled={isDisabled}
              className={box({ size, numeric: true })}
            >
              <DateInput className={segments}>
                {(date) => <DateSegment segment={date} className={segment} />}
              </DateInput>
              <Button aria-label={openLabel} className={inlineButton}>
                <CalendarDays aria-hidden="true" className={icon({ size })} />
              </Button>
            </Group>
            <FieldHelp description={description} errorMessage={errorMessage} />
            <ResponsivePopover placement="bottom start">
              <Dialog className={dialog}>
                <Calendar className={calendar}>
                  <header className={header}>
                    <Button slot="previous" aria-label={previousMonthLabel} className={navButton}>
                      <ChevronLeft aria-hidden="true" className={icon({ size })} />
                    </Button>
                    <Heading className={heading} />
                    <Button slot="next" aria-label={nextMonthLabel} className={navButton}>
                      <ChevronRight aria-hidden="true" className={icon({ size })} />
                    </Button>
                  </header>
                  <CalendarGrid className={grid}>
                    <CalendarGridHeader>
                      {(day) => (
                        <CalendarHeaderCell className={headerCell}>{day}</CalendarHeaderCell>
                      )}
                    </CalendarGridHeader>
                    <CalendarGridBody>
                      {(date) => <CalendarCell date={date} className={cell} />}
                    </CalendarGridBody>
                  </CalendarGrid>
                </Calendar>
              </Dialog>
            </ResponsivePopover>
          </>
        )}
      </AriaDatePicker>
    </I18nProvider>
  );
}
