import { ChevronDown } from "lucide-react";
import { Children, isValidElement, type ReactNode, useId, useState } from "react";
import {
  Button as AriaButton,
  Autocomplete,
  Dialog,
  DialogTrigger,
  Input,
  ListBox,
  TextField,
  useFilter,
} from "react-aria-components";
import { ChoiceHelp, describedBy } from "../_internal/ChoiceHelp";
import { FieldLabel } from "../_internal/FieldParts";
import { box, fieldRoot, icon, listbox, valueText } from "../_internal/field.css";
import type { OptionItemProps } from "../_internal/OptionItem";
import { SizeContext } from "../_internal/SizeContext";
import { TrayChoiceContext } from "../_internal/TrayChoiceContext";
import { Button } from "../Button";
import { ResponsivePopover } from "../ResponsivePopover";
import { searchInputWrap, searchRow, trayDialog } from "./ComboBox.css";
import type { ComboBoxProps } from "./types";

/** `id` to text of the `ComboBoxItem` elements in `children`. */
function itemTexts(children: ReactNode): Map<string, string> {
  const texts = new Map<string, string>();
  Children.forEach(children, (child) => {
    if (!isValidElement<OptionItemProps>(child)) return;
    const { id, textValue, children: content } = child.props;
    texts.set(id, textValue ?? (typeof content === "string" ? content : ""));
  });
  return texts;
}

/** State that follows `controlled` when the screen passes it and is kept here otherwise. */
function useControllable<T>(controlled: T | undefined, initial: T) {
  const [own, setOwn] = useState(initial);
  return [controlled === undefined ? own : controlled, setOwn] as const;
}

/** The tray form: a field-looking button opens a tray with its own search field and list. */
export function NarrowComboBox({
  label,
  description,
  errorMessage,
  isInvalid,
  isRequired,
  isLabelHidden,
  isDisabled,
  isReadOnly,
  size = "M",
  placeholder,
  value,
  defaultValue,
  onChange,
  inputValue,
  defaultInputValue,
  onInputChange,
  allowsCustomValue,
  customValueLabel,
  emptyMessage,
  defaultFilter,
  onOpenChange,
  name,
  children,
}: ComboBoxProps) {
  const id = useId();
  const labelId = `${id}-label`;
  const valueId = `${id}-value`;
  const ids = { descriptionId: `${id}-description`, errorId: `${id}-error` };
  const texts = itemTexts(children);
  const { contains } = useFilter({ sensitivity: "base" });
  const [isOpen, setOpen] = useState(false);
  const [key, setKey] = useControllable<string | null>(value, defaultValue ?? null);
  const [customText, setCustomText] = useState(defaultInputValue ?? "");

  const shownText = inputValue ?? (key === null ? customText : (texts.get(key) ?? ""));

  const open = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };
  const choose = (next: string) => {
    const text = texts.get(next) ?? "";
    setKey(next);
    setCustomText("");
    onChange?.(next);
    onInputChange?.(text);
    open(false);
  };
  const useText = (text: string) => {
    setKey(null);
    setCustomText(text);
    onChange?.(null);
    onInputChange?.(text);
    open(false);
  };

  return (
    <SizeContext.Provider value={size}>
      <div
        className={fieldRoot({ size })}
        data-invalid={isInvalid || undefined}
        data-disabled={isDisabled || undefined}
      >
        <FieldLabel id={labelId} isRequired={isRequired} isLabelHidden={isLabelHidden} size={size}>
          {label}
        </FieldLabel>
        <DialogTrigger isOpen={isOpen} onOpenChange={open}>
          <AriaButton
            isDisabled={isDisabled || isReadOnly}
            aria-labelledby={`${labelId} ${valueId}`}
            aria-describedby={describedBy({ ...ids, description, errorMessage, isInvalid })}
            aria-haspopup="dialog"
            data-invalid={isInvalid || undefined}
            className={box({ size })}
          >
            <span
              id={valueId}
              className={valueText}
              data-placeholder={shownText === "" ? true : undefined}
            >
              {shownText === "" ? placeholder : shownText}
            </span>
            <ChevronDown aria-hidden="true" className={icon({ size })} />
          </AriaButton>
          <ResponsivePopover>
            <Dialog aria-labelledby={labelId} className={trayDialog}>
              <TrayBody
                labelId={labelId}
                size={size}
                initialQuery={allowsCustomValue ? shownText : ""}
                selectedKey={key}
                allowsCustomValue={Boolean(allowsCustomValue)}
                customValueLabel={customValueLabel}
                emptyMessage={emptyMessage}
                filter={defaultFilter ?? contains}
                onChoose={choose}
                onUseText={useText}
              >
                {children}
              </TrayBody>
            </Dialog>
          </ResponsivePopover>
        </DialogTrigger>
        <ChoiceHelp
          {...ids}
          description={description}
          errorMessage={errorMessage}
          isInvalid={isInvalid}
          indentClassName=""
        />
        {name ? <input type="hidden" name={name} value={key ?? shownText} /> : null}
      </div>
    </SizeContext.Provider>
  );
}

function TrayBody({
  labelId,
  size,
  initialQuery,
  selectedKey,
  allowsCustomValue,
  customValueLabel,
  emptyMessage,
  filter,
  onChoose,
  onUseText,
  children,
}: {
  labelId: string;
  size: NonNullable<ComboBoxProps["size"]>;
  initialQuery: string;
  selectedKey: string | null;
  allowsCustomValue: boolean;
  customValueLabel: string | undefined;
  emptyMessage: string | undefined;
  filter: (textValue: string, inputValue: string) => boolean;
  onChoose: (key: string) => void;
  onUseText: (text: string) => void;
  children: ReactNode;
}) {
  const [query, setQuery] = useState(initialQuery);
  const canUseText = allowsCustomValue && query.trim() !== "";
  return (
    <Autocomplete filter={filter} inputValue={query} onInputChange={setQuery}>
      <div className={searchRow}>
        <TextField aria-labelledby={labelId} className={searchInputWrap}>
          <SearchInput
            size={size}
            onEnterWithoutItem={canUseText ? () => onUseText(query.trim()) : undefined}
          />
        </TextField>
        {allowsCustomValue && customValueLabel ? (
          <Button
            variant="secondary"
            size={size}
            isDisabled={!canUseText}
            onPress={() => onUseText(query.trim())}
          >
            {customValueLabel}
          </Button>
        ) : null}
      </div>
      <ListBox
        className={listbox}
        selectionMode="single"
        disallowEmptySelection
        selectedKeys={selectedKey === null ? [] : [selectedKey]}
        renderEmptyState={emptyMessage ? () => emptyMessage : undefined}
      >
        <TrayChoiceContext.Provider value={onChoose}>{children}</TrayChoiceContext.Provider>
      </ListBox>
    </Autocomplete>
  );
}

function SearchInput({
  size,
  onEnterWithoutItem,
}: {
  size: NonNullable<ComboBoxProps["size"]>;
  onEnterWithoutItem: (() => void) | undefined;
}) {
  return (
    <Input
      autoFocus
      className={box({ size })}
      onKeyDown={(event) => {
        // With an item highlighted, Enter chooses that item; only a bare Enter confirms the text.
        // The input does not expose the highlighted item, so it is read from the list's focus mark.
        const highlighted = event.currentTarget
          .closest("[role='dialog']")
          ?.querySelector("[role='option'][data-focused]");
        if (event.key === "Enter" && onEnterWithoutItem && !highlighted) {
          event.preventDefault();
          onEnterWithoutItem();
        }
      }}
    />
  );
}
