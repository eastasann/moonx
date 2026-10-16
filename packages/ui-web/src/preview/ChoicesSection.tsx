import { sizes } from "@moonx/ui-tokens";
import { FileText, Upload } from "lucide-react";
import { useState } from "react";
import { ActionButton } from "../components/ActionButton";
import { Button } from "../components/Button";
import { Checkbox, CheckboxGroup } from "../components/Checkbox";
import { FileTrigger } from "../components/FileTrigger";
import { Radio, RadioGroup } from "../components/RadioGroup";
import { Switch } from "../components/Switch";
import { TagGroup, type TagItem } from "../components/TagGroup";
import { Text } from "../components/Text";
import { Flex, Stack } from "../layout/Flex";
import { Section, Specimen } from "./parts";

export function ChoiceSection() {
  const [scope, setScope] = useState(["answers"]);
  return (
    <Section title="RadioGroup, Checkbox and Switch">
      <Specimen name="RadioGroup vertical, errorMessage">
        <Flex gap="space-600" wrap alignItems="start">
          <RadioGroup label="Decision" defaultValue="hold">
            <Radio value="proceed">Proceed</Radio>
            <Radio value="hold">Hold</Radio>
            <Radio value="drop">Drop</Radio>
          </RadioGroup>
          <RadioGroup label="Go / No-Go" errorMessage="Choose one.">
            <Radio value="launch">Launch</Radio>
            <Radio value="delay">Delay</Radio>
            <Radio value="stop">Stop</Radio>
          </RadioGroup>
        </Flex>
      </Specimen>
      <Specimen name='RadioGroup orientation="horizontal", size S / M / L / XL, isDisabled'>
        <Stack gap="space-200">
          {sizes.map((size) => (
            <RadioGroup
              key={size}
              label={`OCEAN ${size}`}
              orientation="horizontal"
              size={size}
              defaultValue="o"
            >
              <Radio value="o">Openness</Radio>
              <Radio value="c">Conscientiousness</Radio>
              <Radio value="e" isDisabled>
                Extraversion
              </Radio>
            </RadioGroup>
          ))}
        </Stack>
      </Specimen>
      <Specimen name="Checkbox selected, indeterminate, disabled; size S / M / L / XL (invalid: through CheckboxGroup)">
        <Flex gap="space-300" wrap>
          <Checkbox defaultSelected>Apply</Checkbox>
          <Checkbox isIndeterminate>Some sections</Checkbox>
          <Checkbox isDisabled>Disabled</Checkbox>
          {sizes.map((size) => (
            <Checkbox key={size} size={size} defaultSelected>
              {size}
            </Checkbox>
          ))}
        </Flex>
      </Specimen>
      <Specimen name="CheckboxGroup">
        <CheckboxGroup
          label="Export scope"
          description="What the AI receives."
          value={scope}
          onChange={setScope}
        >
          <Checkbox value="answers">Answers</Checkbox>
          <Checkbox value="numbers">Numbers</Checkbox>
          <Checkbox value="evidence">Evidence</Checkbox>
        </CheckboxGroup>
      </Specimen>
      <Specimen name='CheckboxGroup orientation="horizontal", errorMessage, isDisabled'>
        <Stack gap="space-300">
          <CheckboxGroup
            label="Share with"
            orientation="horizontal"
            errorMessage="Choose at least one member."
          >
            <Checkbox value="ana">Ana</Checkbox>
            <Checkbox value="ben">Ben</Checkbox>
          </CheckboxGroup>
          <CheckboxGroup
            label="Locked scope"
            isDisabled
            defaultValue={["answers"]}
          >
            <Checkbox value="answers">Answers</Checkbox>
            <Checkbox value="numbers">Numbers</Checkbox>
          </CheckboxGroup>
        </Stack>
      </Specimen>
      <Specimen name="Switch size S / M / L / XL, isDisabled">
        <Flex gap="space-300" wrap>
          {sizes.map((size) => (
            <Switch key={size} size={size} defaultSelected={size !== "S"}>
              Focus {size}
            </Switch>
          ))}
          <Switch isDisabled>Overdue only</Switch>
        </Flex>
      </Specimen>
    </Section>
  );
}

const initialTags: TagItem[] = [
  { id: "local_price", label: "Local price" },
  { id: "permits", label: "Permits" },
  { id: "demand_signal", label: "Demand or problem signal" },
];

export function FileAndTagSection() {
  const [files, setFiles] = useState<string[]>([]);
  const [tags, setTags] = useState(initialTags);
  return (
    <Section title="FileTrigger and TagGroup">
      <Specimen name="FileTrigger around a Button / ActionButton">
        <Flex gap="space-300" wrap alignItems="center">
          <FileTrigger
            acceptedFileTypes={["image/jpeg", "image/png", "image/webp"]}
            onSelect={(list) =>
              setFiles([...(list ?? [])].map((file) => file.name))
            }
          >
            <Button variant="secondary">
              <Upload />
              Choose photo
            </Button>
          </FileTrigger>
          <FileTrigger acceptedFileTypes={[".md", ".json"]}>
            <ActionButton>
              <FileText />
              Choose file
            </ActionButton>
          </FileTrigger>
          <Text variant="caption" tone="secondary">
            {files.length === 0 ? "No file chosen" : files.join(", ")}
          </Text>
        </Flex>
      </Specimen>
      <Specimen name="TagGroup with onRemove (Delete key or the × button)">
        <TagGroup
          label="Supports"
          items={tags}
          onRemove={(ids) =>
            setTags((all) => all.filter((tag) => !ids.has(tag.id)))
          }
          renderEmptyState={() => "No checks"}
        />
      </Specimen>
      <Specimen name="TagGroup without onRemove">
        <TagGroup aria-label="Filters" items={initialTags} />
      </Specimen>
      <Specimen name="TagGroup size S / M / L / XL">
        <Stack gap="space-200">
          {sizes.map((size) => (
            <TagGroup
              key={size}
              size={size}
              aria-label={`Conditions ${size}`}
              items={initialTags.slice(0, 2)}
              onRemove={() => {}}
            />
          ))}
        </Stack>
      </Specimen>
    </Section>
  );
}
