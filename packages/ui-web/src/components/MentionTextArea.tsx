import { i18n } from "@moonx/i18n";
import type { Size } from "@moonx/ui-tokens";
import {
  type KeyboardEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  TextArea as AriaTextArea,
  TextField as AriaTextField,
  Autocomplete,
  Dialog,
  Input,
  Label,
  Modal,
  ModalOverlay,
  Popover,
  TextField,
  useFilter,
} from "react-aria-components";
import { ChoiceListBox } from "../internal/ChoiceListBox";
import {
  FieldHelp,
  type FieldTextProps,
  invalidOf,
} from "../internal/FieldHelp";
import { FixedLocale } from "../internal/FixedLocale";
import * as field from "../internal/field.css";
import * as overlay from "../internal/overlay.css";
import { useSize } from "../internal/size";
import { useAutoGrow } from "../internal/useAutoGrow";
import { useIsNarrow } from "../internal/useIsNarrow";
import { useKeepAboveKeyboard } from "../internal/useKeepAboveKeyboard";
import * as styles from "./MentionTextArea.css";

/** Someone who can be mentioned (W8): their id goes to `mentionUserIds`, their name in the text. */
export interface MentionCandidate {
  id: string;
  name: string;
}

export interface MentionTextAreaProps extends FieldTextProps {
  value: string;
  onChange: (value: string) => void;
  /** The people the text mentions (C1・C2 `mentionUserIds`): chosen ones whose `@name` is still there. */
  mentions: readonly MentionCandidate[];
  onMentionsChange: (mentions: MentionCandidate[]) => void;
  /** Who can be mentioned, from W8 (design-spec 6.0.4). */
  candidates: readonly MentionCandidate[];
  /** @default "M", or "L" inside a spacious `Form` */
  size?: Size;
  /** `full` fills the line; otherwise the size's default width. @default "full" */
  width?: "default" | "full";
  placeholder?: string;
  name?: string;
  isDisabled?: boolean;
  isReadOnly?: boolean;
  autoFocus?: boolean;
  id?: string;
  "aria-label"?: string;
}

/** An `@` being typed: where it is and what follows it up to the caret. */
interface Query {
  at: number;
  text: string;
}

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

/** Whether `text` still holds `@name` as a whole mention, not as the start of a longer word. */
const mentionsName = (text: string, name: string) =>
  new RegExp(`(^|\\s)@${escapeRegExp(name)}(?=$|[\\s.,!?;:)\\]])`, "u").test(
    text,
  );

/**
 * The `@` before the caret that starts a mention: at the start or after a space, on this
 * line, followed by a letter or nothing yet ("@ " is not a mention).
 */
function queryAt(text: string, caret: number): Query | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at === -1) return null;
  if (at > 0 && !/\s/u.test(before[at - 1] ?? "")) return null;
  const typed = before.slice(at + 1);
  if (typed.includes("\n") || /^\s/u.test(typed)) return null;
  return { at, text: typed };
}

/**
 * The comment box of PNL-1 (design-spec 4.5・6.0.4): a TextArea where `@` and a few letters
 * list the members; choosing one writes `@Name` and records the mention. On tablet and
 * wider the list opens under the field (↑ ↓ to move, Enter or Tab to choose, Escape to
 * close); on a phone a tray opens, its own input starting with the letters after `@`.
 */
export function MentionTextArea({
  label,
  description,
  errorMessage,
  isInvalid,
  value,
  onChange,
  mentions,
  onMentionsChange,
  candidates,
  size,
  width = "full",
  placeholder,
  ...props
}: MentionTextAreaProps) {
  const resolved = useSize(size);
  const isNarrow = useIsNarrow();
  const { contains, startsWith } = useFilter({ sensitivity: "base" });
  const canType = !props.isReadOnly && !props.isDisabled;
  const frameRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const listId = useId();
  const optionId = useId();
  useKeepAboveKeyboard(frameRef);
  useAutoGrow(areaRef, value);

  const [query, setQuery] = useState<Query | null>(null);
  // An `@` the user closed the list on (Escape, or the tray closed): it stays closed
  // until another `@` starts.
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const [active, setActive] = useState(0);
  const [trayText, setTrayText] = useState("");
  // Where the caret goes once a chosen name is in the text.
  const caretAfter = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (caretAfter.current === null) return;
    areaRef.current?.focus();
    areaRef.current?.setSelectionRange(caretAfter.current, caretAfter.current);
    caretAfter.current = null;
  });

  // The letters typed after `@` start the name or one of its words: once they no longer
  // do (a space after a whole name, a word that is no one's), the list closes.
  const matches =
    query === null
      ? []
      : candidates.filter(
          (candidate) =>
            startsWith(candidate.name, query.text) ||
            candidate.name
              .split(/\s+/u)
              .some((word) => startsWith(word, query.text)),
        );
  const isOpen = canType && query !== null && query.at !== dismissedAt;
  const isListOpen = !isNarrow && isOpen && matches.length > 0;
  const isTrayOpen =
    isNarrow && isOpen && (query?.text === "" || matches.length > 0);
  const activeIndex = Math.min(active, Math.max(matches.length - 1, 0));

  const change = (text: string) => {
    onChange(text);
    const kept = mentions.filter((mention) => mentionsName(text, mention.name));
    if (kept.length !== mentions.length) onMentionsChange(kept);
    if (!canType) return;
    // Typing is what opens the list: an `@` just typed, or letters after it.
    const next = queryAt(text, areaRef.current?.selectionStart ?? text.length);
    if (next?.at !== query?.at) {
      setActive(0);
      if (next !== null) setTrayText(next.text);
    }
    if (dismissedAt !== null && next?.at !== dismissedAt) setDismissedAt(null);
    setQuery(next);
  };

  // Moving the caret only closes the list, when it leaves the letters after the `@`; it
  // never opens one on a name already written.
  const select = (text: string, caret: number) => {
    if (query === null) return;
    const next = queryAt(text, caret);
    setQuery(next?.at === query.at ? next : null);
  };

  const choose = (candidate: MentionCandidate) => {
    if (query === null) return;
    const end = query.at + 1 + query.text.length;
    const inserted = `@${candidate.name} `;
    const text = value.slice(0, query.at) + inserted + value.slice(end);
    caretAfter.current = query.at + inserted.length;
    onChange(text);
    if (!mentions.some((mention) => mention.id === candidate.id)) {
      onMentionsChange([...mentions, candidate]);
    }
    setDismissedAt(query.at);
    setQuery(null);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    // Keys that finish an IME composition belong to it (Safari reports them as 229).
    if (
      !isListOpen ||
      event.nativeEvent.isComposing ||
      event.nativeEvent.keyCode === 229
    ) {
      return;
    }
    const count = matches.length;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((activeIndex + 1) % count);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((activeIndex - 1 + count) % count);
    } else if (event.key === "Enter" || event.key === "Tab") {
      const chosen = matches[activeIndex];
      if (chosen !== undefined) {
        event.preventDefault();
        choose(chosen);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setDismissedAt(query?.at ?? null);
    }
  };

  const activeId = isListOpen ? `${optionId}-${activeIndex}` : undefined;

  return (
    <FixedLocale>
      <AriaTextField
        {...props}
        value={value}
        onChange={change}
        isInvalid={invalidOf({ errorMessage, isInvalid })}
        validationBehavior="aria"
        className={field.fieldRoot({ size: resolved, width })}
      >
        {label != null && <Label className={field.label}>{label}</Label>}
        <div ref={frameRef} className={field.areaFrame({ size: resolved })}>
          <AriaTextArea
            ref={areaRef}
            rows={1}
            placeholder={placeholder}
            aria-autocomplete="list"
            aria-controls={isListOpen ? listId : undefined}
            aria-activedescendant={activeId}
            onKeyDown={onKeyDown}
            onSelect={(event) =>
              select(
                event.currentTarget.value,
                event.currentTarget.selectionStart,
              )
            }
            // Leaving the field closes the list; a phone's tray takes the focus on purpose.
            onBlur={() => {
              if (!isNarrow) setQuery(null);
            }}
            className={field.textArea}
          />
        </div>
        <FieldHelp description={description} errorMessage={errorMessage} />
      </AriaTextField>
      <Popover
        triggerRef={frameRef}
        isOpen={isListOpen}
        isNonModal
        placement="bottom start"
        className={overlay.popover}
      >
        <div
          id={listId}
          role="listbox"
          aria-label={i18n.t("components:mentionTextArea.members")}
          className={styles.list}
        >
          {matches.map((candidate, index) => (
            // biome-ignore lint/a11y/useKeyWithClickEvents: the keys stay in the text area, which moves through the options with aria-activedescendant.
            <div
              key={candidate.id}
              id={`${optionId}-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              tabIndex={-1}
              // Pressing an option keeps the focus in the text area.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(candidate)}
              className={styles.option}
            >
              {candidate.name}
            </div>
          ))}
        </div>
      </Popover>
      <ModalOverlay
        isOpen={isTrayOpen}
        onOpenChange={(isOpen) => {
          if (!isOpen) setDismissedAt(query?.at ?? null);
        }}
        isDismissable
        className={overlay.trayOverlay}
      >
        <Modal className={overlay.tray}>
          <Dialog
            aria-label={i18n.t("components:mentionTextArea.members")}
            className={`${overlay.trayDialog} ${field.trayBody}`}
          >
            <Autocomplete
              inputValue={trayText}
              onInputChange={setTrayText}
              filter={contains}
            >
              <TextField
                autoFocus
                aria-label={i18n.t("components:mentionTextArea.search")}
                className={field.trayField}
              >
                <div className={field.frame({ size: resolved })}>
                  <Input className={field.input} />
                </div>
              </TextField>
              <ChoiceListBox
                aria-label={i18n.t("components:mentionTextArea.members")}
                items={candidates.map((candidate) => ({
                  id: candidate.id,
                  label: candidate.name,
                }))}
                onAction={(key) => {
                  const chosen = candidates.find(
                    (candidate) => candidate.id === String(key),
                  );
                  if (chosen !== undefined) choose(chosen);
                }}
              />
            </Autocomplete>
          </Dialog>
        </Modal>
      </ModalOverlay>
    </FixedLocale>
  );
}
