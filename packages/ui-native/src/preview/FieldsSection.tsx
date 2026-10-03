/** Gallery section: text, number, choice and date fields, with every size and state. */
import { parseDate } from "@internationalized/date";
import type { ComponentSize } from "@moonx/ui-tokens";
import { type ReactNode, useState } from "react";
import { Button } from "../components/Button";
import { Checkbox } from "../components/Checkbox";
import { CheckboxGroup } from "../components/CheckboxGroup";
import { ComboBox, ComboBoxItem } from "../components/ComboBox";
import { DatePicker } from "../components/DatePicker";
import { FileTrigger } from "../components/FileTrigger";
import { Form, KeyboardSafeArea, useFormSubmit } from "../components/Form";
import { MentionTextArea } from "../components/MentionTextArea";
import { NumberField } from "../components/NumberField";
import { Picker, PickerItem } from "../components/Picker";
import { Radio, RadioGroup } from "../components/RadioGroup";
import { SearchField } from "../components/SearchField";
import { Switch } from "../components/Switch";
import { Tag, TagGroup } from "../components/TagGroup";
import { Text } from "../components/Text";
import { TextArea } from "../components/TextArea";
import { TextField } from "../components/TextField";
import { bySize, Case, Cases, Component, Frame, GallerySection } from "./parts";

export const FIELDS_COVERAGE = [
  "TextField",
  "TextArea",
  "MentionTextArea",
  "NumberField",
  "SearchField",
  "Picker",
  "PickerItem",
  "ComboBox",
  "ComboBoxItem",
  "DatePicker",
  "RadioGroup",
  "Radio",
  "Checkbox",
  "CheckboxGroup",
  "Switch",
  "TagGroup",
  "Tag",
  "Form",
  "KeyboardSafeArea",
  "FileTrigger",
] as const;

const NO_FILE = "No file chosen";

function FilePicker() {
  const [name, setName] = useState(NO_FILE);
  return (
    <Case label="Image files only">
      <FileTrigger
        acceptedFileTypes={["image/png", "image/jpeg", "image/webp"]}
        onSelect={(files) => setName(files[0]?.name ?? NO_FILE)}
      >
        <Button variant="secondary">Choose photo</Button>
      </FileTrigger>
      <Text variant="caption">{name}</Text>
    </Case>
  );
}

interface FieldCase {
  label: string;
  description?: string;
  errorMessage?: string;
  isInvalid?: boolean;
  isRequired?: boolean;
  isDisabled?: boolean;
  isReadOnly?: boolean;
  size: ComponentSize;
}

interface RemovableTag {
  id: string;
  label: string;
  isDisabled?: boolean;
}

/** Owns the tag list so the remove buttons in the gallery take the tag out, as a screen's would. */
function RemovableTags({ size, initial }: { size?: ComponentSize; initial: RemovableTag[] }) {
  const [tags, setTags] = useState(initial);
  return (
    <TagGroup
      label="Supports"
      size={size}
      onRemove={(ids) => setTags((current) => current.filter((tag) => !ids.includes(tag.id)))}
      removeLabel="Remove"
    >
      {tags.map((tag) => (
        <Tag key={tag.id} id={tag.id} isDisabled={tag.isDisabled} textValue={tag.label}>
          {tag.label}
        </Tag>
      ))}
    </TagGroup>
  );
}

/** Sizes in the default state, then every state at size M. */
function FieldMatrix({
  name,
  note,
  includes,
  readOnly = true,
  render,
}: {
  name: string;
  note?: string;
  includes?: readonly string[];
  /** False for a field that has no read-only state. */
  readOnly?: boolean;
  render: (field: FieldCase) => ReactNode;
}) {
  const states: { title: string; props: Partial<FieldCase> }[] = [
    { title: "Default", props: {} },
    { title: "With description", props: { description: "Helper text under the field" } },
    { title: "Required", props: { isRequired: true } },
    {
      title: "Invalid",
      props: { isInvalid: true, errorMessage: "This value is not valid", isRequired: true },
    },
    { title: "Disabled", props: { isDisabled: true } },
    ...(readOnly ? [{ title: "Read only", props: { isReadOnly: true } }] : []),
  ];
  return (
    <Component name={name} note={note} includes={includes}>
      <Cases label="Sizes" layout="column">
        {bySize((size) => render({ label: `${name} ${size}`, size }))}
      </Cases>
      <Cases label="States" layout="column">
        {states.map((state) => (
          <Case key={state.title} label={state.title} fill>
            {render({ label: `${name} ${state.title}`, size: "M", ...state.props })}
          </Case>
        ))}
      </Cases>
    </Component>
  );
}

function MentionTextAreaDemo() {
  const [value, setValue] = useState("");
  const [mentioned, setMentioned] = useState("nobody");
  return (
    <>
      <MentionTextArea
        label="Comment"
        value={value}
        onChange={setValue}
        listLabel="Members"
        candidates={[
          { id: "ana", name: "Ana Reyes" },
          { id: "ben", name: "Ben Cruz" },
        ]}
        onMention={setMentioned}
      />
      <Text variant="caption">{`Last mention: ${mentioned}`}</Text>
    </>
  );
}

function SubmitButton() {
  const submit = useFormSubmit();
  return <Button onPress={submit}>Save</Button>;
}

function FormDemo() {
  const [submits, setSubmits] = useState(0);
  return (
    <Form aria-label="Profile" onSubmit={() => setSubmits((count) => count + 1)}>
      <TextField label="Display name" isRequired />
      <TextField label="Email" isInvalid errorMessage="Enter a valid email address" />
      <SubmitButton />
      <Text variant="caption">{`Submitted ${submits} times`}</Text>
    </Form>
  );
}

const CURRENCIES = ["PHP", "USD", "JPY"];

export function FieldsSection() {
  return (
    <GallerySection id="fields" title="Fields">
      <FieldMatrix
        name="TextField"
        render={(field) => <TextField {...field} placeholder="Placeholder" defaultValue="" />}
      />
      <FieldMatrix
        name="TextArea"
        note="Grows with its content."
        render={(field) => (
          <TextArea
            {...field}
            placeholder="Placeholder"
            defaultValue={"A longer answer\nthat runs over\nthree lines"}
          />
        )}
      />
      <Component name="MentionTextArea" note="Type @ and letters; the matches open in a tray.">
        <Cases layout="column">
          <Case label="Comment with members" fill>
            <MentionTextAreaDemo />
          </Case>
        </Cases>
      </Component>
      <FieldMatrix
        name="NumberField"
        note="Formats follow en-PH."
        render={(field) => (
          <NumberField
            {...field}
            defaultValue={1250000}
            formatOptions={{ style: "currency", currency: "PHP" }}
          />
        )}
      />
      <Component name="NumberField formats">
        <Cases layout="column">
          <Case label="Percent" fill>
            <NumberField
              label="Margin"
              defaultValue={0.35}
              formatOptions={{ style: "percent" }}
              minValue={0}
              maxValue={1}
              step={0.01}
            />
          </Case>
          <Case label="Plain number" fill>
            <NumberField label="Units sold" defaultValue={1200} />
          </Case>
          <Case label="Empty with placeholder" fill>
            <NumberField label="Days" placeholder="0" />
          </Case>
        </Cases>
      </Component>
      <FieldMatrix
        name="SearchField"
        readOnly={false}
        render={(field) => {
          const { isReadOnly: _ignored, ...rest } = field;
          return <SearchField {...rest} clearLabel="Clear search" defaultValue="Query" />;
        }}
      />
      <FieldMatrix
        name="Picker"
        note="Opens its options in a tray."
        includes={["PickerItem"]}
        readOnly={false}
        render={(field) => {
          const { isReadOnly: _ignored, ...rest } = field;
          return (
            <Picker {...rest} placeholder="Choose one" defaultValue="USD">
              {CURRENCIES.map((id) => (
                <PickerItem key={id} id={id}>
                  {id}
                </PickerItem>
              ))}
              <PickerItem id="EUR" isDisabled>
                EUR (disabled)
              </PickerItem>
            </Picker>
          );
        }}
      />
      <Component name="Picker without a value">
        <Cases layout="column">
          <Case label="Placeholder shown" fill>
            <Picker label="Currency" placeholder="Choose one">
              {CURRENCIES.map((id) => (
                <PickerItem key={id} id={id}>
                  {id}
                </PickerItem>
              ))}
            </Picker>
          </Case>
        </Cases>
      </Component>
      <FieldMatrix
        name="ComboBox"
        includes={["ComboBoxItem"]}
        render={(field) => (
          <ComboBox
            {...field}
            placeholder="Type to filter"
            openLabel="Show options"
            emptyMessage="No match"
            defaultValue="maria"
          >
            <ComboBoxItem id="maria">Maria Santos</ComboBoxItem>
            <ComboBoxItem id="juan">Juan Dela Cruz</ComboBoxItem>
            <ComboBoxItem id="ana" isDisabled>
              Ana Reyes (disabled)
            </ComboBoxItem>
          </ComboBox>
        )}
      />
      <FieldMatrix
        name="DatePicker"
        note="The calendar opens in a tray and follows en-PH."
        render={(field) => (
          <DatePicker
            {...field}
            openLabel="Open calendar"
            previousMonthLabel="Previous month"
            nextMonthLabel="Next month"
            defaultValue={parseDate("2026-10-02")}
          />
        )}
      />
      <FieldMatrix
        name="RadioGroup"
        includes={["Radio"]}
        readOnly={false}
        render={(field) => {
          const { isReadOnly: _ignored, ...rest } = field;
          return (
            <RadioGroup {...rest} defaultValue="hold">
              <Radio value="proceed">Proceed</Radio>
              <Radio value="hold">Hold</Radio>
              <Radio value="drop" isDisabled>
                Drop (disabled)
              </Radio>
            </RadioGroup>
          );
        }}
      />
      <Component name="RadioGroup horizontal">
        <Cases layout="column">
          <Case label="Horizontal" fill>
            <RadioGroup label="Go / No-Go" orientation="horizontal" defaultValue="go">
              <Radio value="go">Go</Radio>
              <Radio value="nogo">No-Go</Radio>
            </RadioGroup>
          </Case>
        </Cases>
      </Component>
      <Component name="Checkbox">
        <Cases label="Sizes" layout="column">
          {bySize((size) => (
            <Checkbox size={size} defaultSelected>
              Include in plan
            </Checkbox>
          ))}
        </Cases>
        <Cases label="States" layout="column">
          <Case label="Unchecked">
            <Checkbox>Include in plan</Checkbox>
          </Case>
          <Case label="Checked">
            <Checkbox defaultSelected>Include in plan</Checkbox>
          </Case>
          <Case label="Indeterminate">
            <Checkbox isIndeterminate>Select all</Checkbox>
          </Case>
          <Case label="With description">
            <Checkbox description="Applies the answer to the plan">Apply</Checkbox>
          </Case>
          <Case label="Required">
            <Checkbox isRequired>Accept terms</Checkbox>
          </Case>
          <Case label="Invalid">
            <Checkbox isInvalid errorMessage="Choose at least this one">
              Accept terms
            </Checkbox>
          </Case>
          <Case label="Disabled">
            <Checkbox isDisabled>Include in plan</Checkbox>
          </Case>
          <Case label="Disabled and checked">
            <Checkbox isDisabled defaultSelected>
              Include in plan
            </Checkbox>
          </Case>
        </Cases>
      </Component>
      <FieldMatrix
        name="CheckboxGroup"
        readOnly={false}
        render={(field) => {
          const { isReadOnly: _ignored, ...rest } = field;
          return (
            <CheckboxGroup {...rest} defaultValue={["a"]}>
              <Checkbox value="a">Basic info</Checkbox>
              <Checkbox value="b">Costs</Checkbox>
              <Checkbox value="c" isDisabled>
                Scenarios (disabled)
              </Checkbox>
            </CheckboxGroup>
          );
        }}
      />
      <Component name="Switch" note="Applies at once, so it has no required or invalid state.">
        <Cases label="Sizes" layout="column">
          {bySize((size) => (
            <Switch size={size} defaultSelected>
              Focus
            </Switch>
          ))}
        </Cases>
        <Cases label="States" layout="column">
          <Case label="Off">
            <Switch>Focus</Switch>
          </Case>
          <Case label="On">
            <Switch defaultSelected>Focus</Switch>
          </Case>
          <Case label="With description">
            <Switch description="Opens every question">Show all</Switch>
          </Case>
          <Case label="Disabled">
            <Switch isDisabled>Focus</Switch>
          </Case>
          <Case label="Disabled and on">
            <Switch isDisabled defaultSelected>
              Focus
            </Switch>
          </Case>
        </Cases>
      </Component>
      <Component name="TagGroup" includes={["Tag"]}>
        <Cases label="Sizes, removable" layout="column">
          {bySize((size) => (
            <RemovableTags
              size={size}
              initial={[
                { id: "a", label: "Market size" },
                { id: "b", label: "Pricing" },
              ]}
            />
          ))}
        </Cases>
        <Cases label="States" layout="column">
          <Case label="Not removable">
            <TagGroup label="Filters">
              <Tag id="a" textValue="Active">
                Active
              </Tag>
              <Tag id="b" textValue="Archived">
                Archived
              </Tag>
            </TagGroup>
          </Case>
          <Case label="With description">
            <TagGroup label="Supports" description="Checks the log backs up">
              <Tag id="a" textValue="Pricing">
                Pricing
              </Tag>
            </TagGroup>
          </Case>
          <Case label="Invalid">
            <TagGroup label="Supports" isInvalid errorMessage="Pick at least one">
              <Tag id="a" textValue="Pricing">
                Pricing
              </Tag>
            </TagGroup>
          </Case>
          <Case label="One tag disabled">
            <RemovableTags
              initial={[
                { id: "a", label: "Pricing" },
                { id: "b", label: "Archived", isDisabled: true },
              ]}
            />
          </Case>
          <Case label="aria-label instead of a visible label">
            <TagGroup aria-label="Conditions">
              <Tag id="a" textValue="Owner">
                Owner
              </Tag>
            </TagGroup>
          </Case>
        </Cases>
      </Component>

      <Component
        name="Form"
        note="Stacks fields and a submit button. It does no validation; each field shows the message it is given."
      >
        <Cases layout="column">
          <Case label="Fields and a submit button" fill>
            <FormDemo />
          </Case>
        </Cases>
      </Component>

      <Component
        name="KeyboardSafeArea"
        note="Wraps a screen so the focused field and the pinned footer stay above the keyboard."
      >
        <Cases layout="column">
          <Case label="Fields with a footer" fill>
            <Frame>
              <KeyboardSafeArea footer={<Button variant="accent">Next</Button>}>
                <TextField label="Business name" />
                <TextField label="Town" />
              </KeyboardSafeArea>
            </Frame>
          </Case>
        </Cases>
      </Component>

      <Component name="FileTrigger" note="Opens the system file picker from the button it wraps.">
        <Cases layout="column">
          <FilePicker />
        </Cases>
      </Component>
    </GallerySection>
  );
}
