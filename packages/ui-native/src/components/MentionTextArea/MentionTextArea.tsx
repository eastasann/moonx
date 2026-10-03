import type { ComponentSize } from "@moonx/ui-tokens";
import { Search } from "lucide-react-native";
import { type ReactNode, useRef, useState } from "react";
import { type TextInput, View } from "react-native";
import {
  FieldFrame,
  FieldIcon,
  FieldInput,
  FieldLabel,
  FieldRoot,
  textOf,
} from "../../internal/FieldParts";
import { containsText, OptionItem, OptionList } from "../Picker/OptionList";
import { Tray } from "../Tray";

export interface MentionCandidate {
  id: string;
  name: string;
}

export interface MentionTextAreaProps {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  /** The people `@` can name. The screen decides who is allowed (roles, self analysis). */
  candidates: readonly MentionCandidate[];
  /** Called with the id of the person whose `@Name` was just inserted. */
  onMention: (id: string) => void;
  /** Accessible name of the candidate list. */
  listLabel: string;
  size?: ComponentSize;
  placeholder?: string;
}

const TRIGGER = /(^|\s)@([^\s@]*)$/;

/** The text typed after an `@` that ends at the caret, or null when the caret is not in one. */
export function findMentionQuery(text: string, caret: number): string | null {
  return TRIGGER.exec(text.slice(0, caret))?.[2] ?? null;
}

/** Replaces the `@query` before the caret with `@Name ` and returns the text and the new caret. */
export function applyMention(text: string, caret: number, name: string) {
  const before = text.slice(0, caret);
  const start = before.lastIndexOf("@");
  const inserted = `${before.slice(0, start)}@${name} `;
  return { text: `${inserted}${text.slice(caret)}`, caret: inserted.length };
}

/**
 * A multi-line field where typing `@` and some letters opens a tray of the candidates
 * (design-spec 4.5). The tray holds its own input, started with what was typed after the `@`,
 * and choosing a person inserts `@Name ` into the body and returns the caret to the text. The
 * Web part's inline listbox (arrow keys, Enter, Tab, Escape) exists only on tablet and wider
 * there; the phone has the tray form only. Dragging the tray down closes it and leaves the `@`
 * text as typed, until the next keystroke.
 */
export function MentionTextArea({
  label,
  value,
  onChange,
  candidates,
  onMention,
  listLabel,
  size = "M",
  placeholder,
}: MentionTextAreaProps) {
  const input = useRef<TextInput>(null);
  const [caret, setCaret] = useState(0);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [contentHeight, setContentHeight] = useState<number | undefined>(undefined);
  /** Caret to apply after a mention is inserted; React Native moves it only through `selection`. */
  const [forcedCaret, setForcedCaret] = useState<number | null>(null);

  const query = dismissed ? null : findMentionQuery(value, caret);
  const open =
    query !== null && candidates.some((candidate) => containsText(candidate.name, query));

  const choose = (candidate: MentionCandidate) => {
    const next = applyMention(value, caret, candidate.name);
    setForcedCaret(next.caret);
    setCaret(next.caret);
    onChange(next.text);
    onMention(candidate.id);
    input.current?.focus();
  };

  return (
    <FieldRoot size={size}>
      <FieldLabel>{label}</FieldLabel>
      <FieldFrame isFocused={focused} multiline>
        <FieldInput
          ref={input}
          aria-label={textOf(label)}
          multiline
          scrollEnabled={false}
          contentHeight={contentHeight}
          onContentSizeChange={(event) => setContentHeight(event.nativeEvent.contentSize.height)}
          value={value}
          placeholder={placeholder}
          selection={forcedCaret === null ? undefined : { start: forcedCaret, end: forcedCaret }}
          onChangeText={(next) => {
            setDismissed(false);
            // The selection event may arrive after the text event (iOS) or before it (Android);
            // assuming the edit happened at the caret keeps the two from disagreeing in between.
            setCaret(Math.max(0, caret + next.length - value.length));
            onChange(next);
          }}
          onSelectionChange={(event) => {
            setCaret(event.nativeEvent.selection.end);
            setForcedCaret(null);
          }}
          onFocusChange={setFocused}
        />
      </FieldFrame>
      <Tray
        aria-label={listLabel}
        isOpen={open}
        onOpenChange={(isOpen) => {
          if (!isOpen) setDismissed(true);
        }}
      >
        <CandidateTray
          initialQuery={query ?? ""}
          candidates={candidates}
          listLabel={listLabel}
          size={size}
          onChoose={choose}
        />
      </Tray>
    </FieldRoot>
  );
}

/** Mounted only while the tray is open, so its input starts from the text typed after the `@`. */
function CandidateTray({
  initialQuery,
  candidates,
  listLabel,
  size,
  onChoose,
}: {
  initialQuery: string;
  candidates: readonly MentionCandidate[];
  listLabel: string;
  size: ComponentSize;
  onChoose: (candidate: MentionCandidate) => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [focused, setFocused] = useState(false);
  const matches = candidates.filter((candidate) => containsText(candidate.name, query));
  return (
    <View>
      <FieldRoot size={size}>
        <FieldFrame isFocused={focused}>
          <FieldIcon icon={Search} />
          <FieldInput
            aria-label={listLabel}
            autoFocus
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onFocusChange={setFocused}
          />
        </FieldFrame>
      </FieldRoot>
      <OptionList
        aria-label={listLabel}
        size={size}
        selectedId={null}
        onChoose={(id) => {
          const chosen = candidates.find((candidate) => candidate.id === id);
          if (chosen) onChoose(chosen);
        }}
        options={matches.map((candidate) => (
          <OptionItem key={candidate.id} id={candidate.id} textValue={candidate.name}>
            {candidate.name}
          </OptionItem>
        ))}
      />
    </View>
  );
}
