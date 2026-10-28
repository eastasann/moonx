import { numberTextSchema, percentInputSchema } from "@moonx/schemas";
import { sizes } from "@moonx/ui-tokens";
import { useState } from "react";
import { ComboBox } from "../components/ComboBox";
import { DatePicker } from "../components/DatePicker";
import { NumberField } from "../components/NumberField";
import { Picker } from "../components/Picker";
import { SearchField } from "../components/SearchField";
import { TextArea, TextField } from "../components/TextField";
import type { ChoiceItem } from "../internal/ChoiceListBox";
import { Flex, Stack } from "../layout/Flex";
import { Section, Specimen } from "./parts";

const currencies: ChoiceItem[] = [
  { id: "PHP", label: "PHP — Philippine peso" },
  { id: "USD", label: "USD — US dollar" },
  { id: "JPY", label: "JPY — Japanese yen" },
  { id: "EUR", label: "EUR — Euro", isDisabled: true },
];

const roles: ChoiceItem[] = [
  {
    id: "owner",
    label: "Owner",
    description: "Manages members and the workspace",
  },
  { id: "member", label: "Member", description: "Edits ideas and plans" },
  { id: "viewer", label: "Viewer", description: "Reads only" },
];

const members: ChoiceItem[] = [
  { id: "u1", label: "Ana Reyes" },
  { id: "u2", label: "Ben Cruz" },
  { id: "u3", label: "Carla Santos" },
  { id: "u4", label: "Dong Villanueva" },
];

const percentText = numberTextSchema(percentInputSchema);

export function TextFieldSection() {
  return (
    <Section title="TextField and TextArea">
      <Specimen name="TextField size S / M / L / XL">
        <Flex gap="space-300" wrap alignItems="end">
          {sizes.map((size) => (
            <TextField key={size} size={size} label={`Idea name ${size}`} />
          ))}
        </Flex>
      </Specimen>
      <Specimen name="description, placeholder, isRequired">
        <TextField
          label="One-line concept"
          description="What it is, for whom, in one line."
          placeholder="A sari-sari store with…"
          isRequired
        />
      </Specimen>
      <Specimen name="errorMessage, isDisabled, isReadOnly">
        <Flex gap="space-300" wrap alignItems="start">
          <TextField
            label="Email"
            type="email"
            defaultValue="ana@"
            errorMessage="Enter an email address."
          />
          <TextField
            label="Workspace"
            defaultValue="Bacolod pilot"
            isDisabled
          />
          <TextField label="Template" defaultValue="BCDX v3" isReadOnly />
        </Flex>
      </Specimen>
      <Specimen name='descriptionTone="notice", a long errorMessage (the icon on the first line)'>
        <Flex gap="space-300" wrap alignItems="start">
          <TextField
            label="Currency"
            defaultValue="PHP"
            description="Changing the currency does not convert amounts you already entered, so check them after you change it."
            descriptionTone="notice"
          />
          <TextField
            label="Website"
            defaultValue="piaya"
            errorMessage="Enter a web address that starts with https://, such as https://example.com."
          />
        </Flex>
      </Specimen>
      <Specimen name='TextArea width="full" (grows with its text)'>
        <TextArea
          label="Who exactly is the customer?"
          width="full"
          defaultValue={
            "Office workers near Lacson St.\nThey buy coffee before 8 a.m. and again after lunch."
          }
        />
      </Specimen>
      <Specimen name="TextArea size S / M / L / XL">
        <Flex gap="space-300" wrap alignItems="end">
          {sizes.map((size) => (
            <TextArea key={size} size={size} label={`Notes ${size}`} />
          ))}
        </Flex>
      </Specimen>
      <Specimen name="TextArea errorMessage, isDisabled">
        <Flex gap="space-300" wrap alignItems="start">
          <TextArea label="Reason" errorMessage="Enter a reason." />
          <TextArea label="Notes" defaultValue="Locked" isDisabled />
        </Flex>
      </Specimen>
    </Section>
  );
}

export function NumberFieldSection() {
  const [margin, setMargin] = useState("1,5");
  const parsed = percentText.safeParse(margin);
  return (
    <Section title="NumberField">
      <Specimen name='currency="PHP", size S / M / L / XL'>
        <Flex gap="space-300" wrap alignItems="end">
          {sizes.map((size) => (
            <NumberField
              key={size}
              size={size}
              label={`Price ${size}`}
              currency="PHP"
              defaultValue="1,500.50"
            />
          ))}
        </Flex>
      </Specimen>
      <Specimen name="isPercent with the form's check ('1,5' is refused, not read as 15)">
        <NumberField
          label="Target margin"
          isPercent
          value={margin}
          onChange={setMargin}
          errorMessage={parsed.success ? undefined : "Enter a number."}
        />
      </Specimen>
      <Specimen name="isInteger, isDisabled, currency USD / JPY">
        <Flex gap="space-300" wrap alignItems="start">
          <NumberField label="Operating days" isInteger defaultValue="26" />
          <NumberField label="Locked" defaultValue="12" isDisabled />
          <NumberField label="Price (USD)" currency="USD" defaultValue="9.99" />
          <NumberField label="Price (JPY)" currency="JPY" defaultValue="1200" />
        </Flex>
      </Specimen>
    </Section>
  );
}

export function SearchAndPickSection() {
  const [currency, setCurrency] = useState<string | null>("PHP");
  return (
    <Section title="SearchField, Picker and ComboBox">
      <Specimen name="SearchField size S / M / L / XL">
        <Flex gap="space-300" wrap alignItems="end">
          <SearchField aria-label="Search ideas" placeholder="Search" />
          {sizes.map((size) => (
            <SearchField
              key={size}
              size={size}
              label={`Search research log ${size}`}
              defaultValue="price"
            />
          ))}
        </Flex>
      </Specimen>
      <Specimen name="SearchField errorMessage, isDisabled">
        <Flex gap="space-300" wrap alignItems="start">
          <SearchField label="Search members" errorMessage="Search failed." />
          <SearchField label="Search templates" isDisabled />
        </Flex>
      </Specimen>
      <Specimen name="Picker (popover on tablet and wider, tray on a phone)">
        <Flex gap="space-300" wrap alignItems="start">
          <Picker
            label="Currency"
            items={currencies}
            value={currency}
            onChange={setCurrency}
          />
          <Picker label="Role" items={roles} placeholder="Choose a role" />
          <Picker
            label="Source type"
            items={currencies}
            errorMessage="Choose a source type."
          />
          <Picker
            label="Locked"
            items={roles}
            defaultValue="viewer"
            isDisabled
          />
        </Flex>
      </Specimen>
      <Specimen name="Picker size S / L / XL">
        <Flex gap="space-300" wrap alignItems="end">
          {(["S", "L", "XL"] as const).map((size) => (
            <Picker
              key={size}
              size={size}
              label={`Role ${size}`}
              items={roles}
              defaultValue="member"
            />
          ))}
        </Flex>
      </Specimen>
      <Specimen name="ComboBox (a field that opens a tray on a phone)">
        <Flex gap="space-300" wrap alignItems="start">
          <ComboBox
            label="Assignee"
            items={members}
            defaultValue="u2"
            description="Only Owners and Members of this workspace can be assigned."
            descriptionTone="notice"
          />
          <ComboBox
            label="Assignee or name"
            items={members}
            allowsCustomValue
            customValueLabel={(text) => `Use "${text}"`}
            placeholder="Member or name"
          />
          <ComboBox
            label="Time zone"
            items={members}
            errorMessage="Choose a time zone."
          />
          <ComboBox label="Locked assignee" items={members} isDisabled />
        </Flex>
      </Specimen>
      <Specimen name="ComboBox size S / L / XL">
        <Flex gap="space-300" wrap alignItems="end">
          {(["S", "L", "XL"] as const).map((size) => (
            <ComboBox
              key={size}
              size={size}
              label={`Assignee ${size}`}
              items={members}
              defaultValue="u1"
            />
          ))}
        </Flex>
      </Specimen>
      <Stack gap="space-100">
        <Specimen name="DatePicker (en-PH order; tray on a phone)">
          <Flex gap="space-300" wrap alignItems="start">
            <DatePicker label="Deadline" defaultValue="2026-10-16" />
            <DatePicker label="Target date" />
            <DatePicker
              label="Date"
              defaultValue="2026-09-30"
              errorMessage="Enter a date."
            />
            <DatePicker label="Locked" defaultValue="2026-01-05" isDisabled />
          </Flex>
        </Specimen>
        <Specimen name="DatePicker size S / L / XL">
          <Flex gap="space-300" wrap alignItems="end">
            {(["S", "L", "XL"] as const).map((size) => (
              <DatePicker
                key={size}
                size={size}
                label={`Launch date ${size}`}
                defaultValue="2026-12-01"
              />
            ))}
          </Flex>
        </Specimen>
      </Stack>
    </Section>
  );
}
