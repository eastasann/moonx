import { i18n } from "@moonx/i18n";
import { popoverMaxHeight, type Size } from "@moonx/ui-tokens";
import { ChevronDown, CircleAlert } from "lucide-react";
import {
  type KeyboardEvent,
  type ReactNode,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import {
  ComboBox as AriaComboBox,
  Autocomplete,
  Button,
  Dialog,
  FormValidationContext,
  Input,
  Label,
  Modal,
  ModalOverlay,
  Popover,
  TextField,
  useFilter,
} from "react-aria-components";
import { type ChoiceItem, ChoiceListBox } from "../internal/ChoiceListBox";
import {
  FieldHelp,
  type FieldTextProps,
  invalidOf,
} from "../internal/FieldHelp";
import { FixedLocale } from "../internal/FixedLocale";
import * as styles from "../internal/field.css";
import { IconSlot } from "../internal/IconSlot";
import * as overlay from "../internal/overlay.css";
import { useSize } from "../internal/size";
import { useControlledState } from "../internal/useControlledState";
import { useIsNarrow } from "../internal/useIsNarrow";
import { useKeepAboveKeyboard } from "../internal/useKeepAboveKeyboard";

interface ComboBoxBaseProps extends FieldTextProps {
  items: readonly ChoiceItem[];
  /** The chosen item's `id`; null when none is chosen or the text is free. */
  value?: string | null;
  defaultValue?: string | null;
  onChange?: (value: string | null) => void;
  /** The text in the field: the chosen item's label, or free text. */
  inputValue?: string;
  defaultInputValue?: string;
  onInputChange?: (text: string) => void;
  placeholder?: string;
  /** @default "M", or "L" inside a spacious `Form` */
  size?: Size;
  /** @default "default" */
  width?: "default" | "full";
  name?: string;
  isDisabled?: boolean;
  isRequired?: boolean;
  id?: string;
  "aria-label"?: string;
}

/** Free text is allowed (担当: a member or a name). */
interface CustomValueProps {
  allowsCustomValue: true;
  /**
   * The label of the button that keeps the typed text in the phone's tray, such as
   * `Use "Ana"` (design-spec 4.5). Enter does the same.
   */
  customValueLabel: (text: string) => string;
}

interface ListOnlyProps {
  allowsCustomValue?: false;
  customValueLabel?: never;
}

export type ComboBoxProps = ComboBoxBaseProps &
  (CustomValueProps | ListOnlyProps);

/**
 * A text input that suggests items from a list as you type (担当, 25 "Choose question",
 * the time zone). On a phone it looks like a field; pressing it opens a tray with its own
 * input to narrow the list (design-spec 4.5).
 */
export function ComboBox(props: ComboBoxProps) {
  const labelOf = (id: string | null | undefined) =>
    props.items.find((item) => item.id === id)?.label;
  const [value, setValue] = useControlledState<string | null>(
    props.value,
    props.defaultValue ?? null,
    props.onChange,
  );
  const [inputValue, setInputValue] = useControlledState(
    props.inputValue,
    props.defaultInputValue ??
      labelOf(props.value !== undefined ? props.value : props.defaultValue) ??
      "",
    props.onInputChange,
  );
  const isTextControlled = props.inputValue !== undefined;
  const isNarrow = useIsNarrow();

  // Choosing an item writes its label as the text; clearing the choice of a list-only
  // field empties it.
  const choose = (id: string | null) => {
    setValue(id);
    if (id !== null) setInputValue(labelOf(id) ?? "");
    else if (!props.allowsCustomValue) setInputValue("");
  };

  // The tray keeps the text in step with a value the screen sets, and with a label that
  // arrives after the value (items loaded later). On wider screens React Aria does this
  // itself. A screen that holds the text as well keeps it in step itself, as React Aria
  // expects.
  const label = value === null ? undefined : labelOf(value);
  const synced = useRef<string | null>(null);
  useEffect(() => {
    if (!isNarrow || isTextControlled) return;
    const key = JSON.stringify([value, label]);
    if (synced.current === key) return;
    synced.current = key;
    const text =
      value === null ? (props.allowsCustomValue ? inputValue : "") : label;
    if (text !== undefined && text !== inputValue) setInputValue(text);
  });

  const state = { value, setValue, choose, inputValue, setInputValue };
  return (
    <FixedLocale>
      {isNarrow ? (
        <TrayComboBox {...props} {...state} />
      ) : (
        <PopoverComboBox
          {...props}
          {...state}
          isTextControlled={isTextControlled}
        />
      )}
    </FixedLocale>
  );
}

interface SharedState {
  value: string | null;
  /** Sets the value alone, leaving the text to React Aria. */
  setValue: (value: string | null) => void;
  /** Chooses an item (its label becomes the text) or clears the choice. */
  choose: (value: string | null) => void;
  inputValue: string;
  setInputValue: (text: string) => void;
}

function PopoverComboBox({
  label,
  description,
  errorMessage,
  isInvalid,
  items,
  value,
  setValue,
  choose,
  inputValue,
  setInputValue,
  isTextControlled,
  placeholder,
  size,
  width = "default",
  allowsCustomValue,
  name,
  isDisabled,
  isRequired,
  id,
  "aria-label": ariaLabel,
}: ComboBoxProps & SharedState & { isTextControlled: boolean }) {
  const resolved = useSize(size);
  const frameRef = useRef<HTMLDivElement>(null);
  useKeepAboveKeyboard(frameRef);
  return (
    <AriaComboBox
      defaultItems={items}
      value={value}
      // With the text left to React Aria (the usual case), it keeps the text and the
      // value in step as a plain ComboBox does: clearing the text clears the value,
      // leaving the field restores the chosen label. A screen that holds the text gets
      // the chosen label through onInputChange.
      onChange={(key) => {
        const id = key === null ? null : String(key);
        if (isTextControlled) choose(id);
        else setValue(id);
      }}
      {...(isTextControlled
        ? {
            inputValue,
            // React Aria leaves this to a screen that holds both: emptying a list-only
            // field clears the choice, as it does when React Aria holds the text.
            onInputChange: (text: string) => {
              setInputValue(text);
              if (text === "" && !allowsCustomValue) setValue(null);
            },
          }
        : { defaultInputValue: inputValue, onInputChange: setInputValue })}
      allowsCustomValue={allowsCustomValue}
      name={name}
      isDisabled={isDisabled}
      isRequired={isRequired}
      id={id}
      aria-label={ariaLabel}
      isInvalid={invalidOf({ errorMessage, isInvalid })}
      validationBehavior="aria"
      className={styles.fieldRoot({ size: resolved, width })}
    >
      {label != null && <Label className={styles.label}>{label}</Label>}
      <div ref={frameRef} className={styles.frame({ size: resolved })}>
        <Input className={styles.input} placeholder={placeholder} />
        <Button
          aria-label={i18n.t("components:comboBox.showSuggestions")}
          className={styles.fieldButton({ size: resolved })}
        >
          <IconSlot size={resolved}>
            <ChevronDown />
          </IconSlot>
        </Button>
      </div>
      <FieldHelp description={description} errorMessage={errorMessage} />
      <Popover maxHeight={popoverMaxHeight} className={overlay.popover}>
        <ChoiceListBox aria-label={i18n.t("components:comboBox.suggestions")} />
      </Popover>
    </AriaComboBox>
  );
}

function TrayComboBox({
  label,
  description,
  errorMessage,
  isInvalid,
  items,
  value,
  choose,
  inputValue,
  setInputValue,
  placeholder,
  size,
  width = "default",
  allowsCustomValue,
  customValueLabel,
  name,
  isDisabled,
  isRequired,
  id,
  "aria-label": ariaLabel,
}: ComboBoxProps & SharedState) {
  const resolved = useSize(size);
  const { contains } = useFilter({ sensitivity: "base" });
  const [isOpen, setOpen] = useState(false);
  // The tray edits a draft; the field changes only when an item or the text is chosen.
  const [draft, setDraft] = useState(inputValue);
  const labelId = useId();
  const valueId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const formErrors = useContext(FormValidationContext);
  const formError = name ? formErrors?.[name] : undefined;
  const shownError =
    errorMessage ??
    (formError === undefined
      ? undefined
      : [formError].flat().join(" ") || undefined);
  const invalid = invalidOf({ errorMessage: shownError, isInvalid }) ?? false;

  const open = () => {
    setDraft(inputValue);
    setOpen(true);
  };
  const pick = (id: string) => {
    if (id !== value) choose(id);
    setOpen(false);
  };
  const keepText = () => {
    if (allowsCustomValue) {
      choose(null);
      setInputValue(draft);
      setOpen(false);
    } else if (draft.trim() === "") {
      // An emptied list-only field: the choice is cleared.
      choose(null);
      setOpen(false);
    }
  };
  const onKeyDown = (event: KeyboardEvent) => {
    // With an item highlighted, Enter picks it (the list handles that); otherwise it
    // keeps the typed text.
    if (
      event.key === "Enter" &&
      !(event.target as HTMLElement).getAttribute("aria-activedescendant")
    ) {
      keepText();
    }
  };

  const describedBy = [
    description != null ? descriptionId : null,
    invalid && shownError != null ? errorId : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={styles.fieldRoot({ size: resolved, width })}
      data-invalid={invalid || undefined}
      data-disabled={isDisabled || undefined}
      data-required={isRequired || undefined}
    >
      {/* Submits what the wide form submits: the item's id, or the text when free text
          is allowed. */}
      {name != null && (
        <input
          type="hidden"
          name={name}
          value={allowsCustomValue ? inputValue : (value ?? "")}
          disabled={isDisabled}
        />
      )}
      {label != null && (
        <span id={labelId} className={styles.label}>
          {label}
        </span>
      )}
      <Button
        id={id}
        onPress={open}
        isDisabled={isDisabled}
        aria-haspopup="dialog"
        aria-label={label == null ? ariaLabel : undefined}
        aria-labelledby={label != null ? `${labelId} ${valueId}` : undefined}
        aria-describedby={describedBy || undefined}
        className={`${styles.frame({ size: resolved })} ${styles.pickerButton}`}
      >
        <span
          id={valueId}
          className={styles.pickerValue}
          data-placeholder={inputValue === "" || undefined}
        >
          {inputValue === "" ? placeholder : inputValue}
        </span>
        <IconSlot size={resolved}>
          <ChevronDown />
        </IconSlot>
      </Button>
      {description != null && (
        <span id={descriptionId} className={styles.description}>
          {description}
        </span>
      )}
      {invalid && shownError != null && (
        <span id={errorId} className={styles.error}>
          <IconSlot size="XS">
            <CircleAlert />
          </IconSlot>
          <span>{shownError}</span>
        </span>
      )}
      <ModalOverlay
        isOpen={isOpen}
        onOpenChange={setOpen}
        isDismissable
        className={overlay.trayOverlay}
      >
        <Modal className={overlay.tray}>
          <Dialog
            aria-labelledby={label != null ? labelId : undefined}
            aria-label={label == null ? ariaLabel : undefined}
            className={`${overlay.trayDialog} ${styles.trayBody}`}
          >
            <Autocomplete
              inputValue={draft}
              onInputChange={setDraft}
              // Opened on the current text, the tray lists everything until the user types.
              filter={draft === inputValue ? undefined : contains}
              disableAutoFocusFirst={allowsCustomValue}
            >
              <TextField
                autoFocus
                aria-labelledby={label != null ? labelId : undefined}
                aria-label={label == null ? ariaLabel : undefined}
                onKeyDown={onKeyDown}
                className={styles.trayField}
              >
                <div className={styles.frame({ size: resolved })}>
                  <Input className={styles.input} placeholder={placeholder} />
                </div>
              </TextField>
              {allowsCustomValue && draft.trim() !== "" && (
                <CustomValueButton onPress={keepText}>
                  {customValueLabel(draft)}
                </CustomValueButton>
              )}
              <ChoiceListBox
                aria-label={i18n.t("components:comboBox.suggestions")}
                items={items}
                selectionMode="single"
                selectedKeys={value === null ? [] : [value]}
                onSelectionChange={(keys) => {
                  if (keys === "all") return;
                  const [key] = keys;
                  // An empty selection is the chosen item pressed again or Escape:
                  // either way the choice stays as it is.
                  if (key !== undefined) pick(String(key));
                  else setOpen(false);
                }}
              />
            </Autocomplete>
          </Dialog>
        </Modal>
      </ModalOverlay>
    </div>
  );
}

function CustomValueButton({
  onPress,
  children,
}: {
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Button onPress={onPress} className={styles.customValue}>
      {children}
    </Button>
  );
}
